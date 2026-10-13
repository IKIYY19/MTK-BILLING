const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");

const pgDb = global.dbAvailable ? require("../db") : null;
const billingData = !global.dbAvailable ? require("../services/billingData") : null;

// Normalize query results — PG returns { rows }, billingStore returns arrays directly
async function query(text, params) {
  if (pgDb) {
    const result = await pgDb.query(text, params);
    return result.rows;
  }
  // Fallback: simple in-memory matching for the queries we use
  return [];
}

async function findPendingInvoiceByAmount(amount) {
  if (pgDb) {
    const result = await pgDb.query(
      `SELECT i.*, c.name as customer_name, c.phone,
              COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0) as paid_amount
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       WHERE i.status = 'pending'
       AND i.total - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0) = $1
       ORDER BY i.due_date ASC LIMIT 1`,
      [amount],
    );
    return result.rows[0] || null;
  }

  // In-memory fallback
  if (!billingData) {return null;}
  const invoices = await billingData.listInvoices();
  const customers = await billingData.listCustomers();
  const payments = await billingData.listPayments();

  // Find pending invoice where remaining = amount
  const match = invoices.find((inv) => {
    if (inv.status !== "pending") {return false;}
    const paidSum = payments
      .filter((p) => p.invoice_id === inv.id)
      .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const remaining = parseFloat(inv.total || 0) - paidSum;
    return Math.abs(remaining - amount) < 0.01;
  });

  if (match) {
    const customer = customers.find((c) => c.id === match.customer_id) || {};
    const paidSum = payments
      .filter((p) => p.invoice_id === match.id)
      .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    return {
      ...match,
      customer_name: customer.name || "",
      phone: customer.phone || "",
      paid_amount: paidSum.toString(),
    };
  }
  return null;
}

async function insertPayment(payment) {
  if (pgDb) {
    const id = uuidv4();
    await pgDb.query(
      `INSERT INTO payments (id, invoice_id, customer_id, amount, method, reference, receipt_number, notes, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [id, payment.invoice_id, payment.customer_id, payment.amount, payment.method, payment.reference, payment.receipt_number, payment.notes],
    );
    return id;
  }
  const result = await billingData.createPayment(payment);
  return result?.id || payment.id;
}

async function updateInvoiceStatus(invoiceId, status) {
  if (pgDb) {
    await pgDb.query(
      `UPDATE invoices SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, invoiceId],
    );
  } else if (billingData) {
    await billingData.updateInvoice(invoiceId, { status });
  }
}

// POST /api/mpesa/reconcile — Parse M-Pesa statement and match to invoices
router.post("/reconcile", async (req, res) => {
  try {
    const { transactions } = req.body; // Array of {phone, amount, reference, date, name}

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ error: "No transactions provided" });
    }

    const results = { matched: [], unmatched: [], total_amount: 0 };

    for (const txn of transactions) {
      const amount = parseFloat(txn.amount);
      if (!amount || amount <= 0) {continue;}
      results.total_amount += amount;

      // Try match by exact remaining amount on pending invoices
      const invoice = await findPendingInvoiceByAmount(amount);

      if (invoice) {
        // Compute new paid amount
        const currentPaid = parseFloat(invoice.paid_amount || 0);
        const newPaid = currentPaid + amount;
        const invoiceTotal = parseFloat(invoice.total);
        const newStatus = newPaid >= invoiceTotal ? "paid" : "partial";

        // Record payment
        await insertPayment({
          invoice_id: invoice.id,
          customer_id: invoice.customer_id,
          amount: amount,
          method: "mpesa",
          reference: txn.reference || "",
          receipt_number: txn.reference || "",
          notes: txn.name
            ? `M-Pesa from ${txn.name}`
            : "M-Pesa auto-reconciled",
        });

        // Update invoice status
        await updateInvoiceStatus(invoice.id, newStatus);

        results.matched.push({
          ...txn,
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          customer_name: invoice.customer_name,
        });
      } else {
        results.unmatched.push(txn);
      }
    }

    res.json(results);
  } catch (e) {
    console.error("M-Pesa reconcile error:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/mpesa/unmatched — Get unmatched transactions
router.get("/unmatched", async (req, res) => {
  // Return list of recently reconciled but unmatched transactions for manual review
  res.json([]);
});

// GET /api/mpesa/recent — Get recent M-Pesa reconciled payments
router.get("/recent", async (req, res) => {
  try {
    if (pgDb) {
      const result = await pgDb.query(
        `SELECT p.*, c.name as customer_name, i.invoice_number
         FROM payments p
         JOIN customers c ON c.id = p.customer_id
         JOIN invoices i ON i.id = p.invoice_id
         WHERE p.method = 'mpesa'
         ORDER BY p.received_at DESC
         LIMIT 50`,
      );
      return res.json(result.rows);
    }
    if (billingData) {
      const allPayments = await billingData.listPayments();
      const payments = allPayments
        .filter((p) => p.method === "mpesa")
        .slice(-50)
        .reverse();
      return res.json(payments);
    }
    res.json([]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
