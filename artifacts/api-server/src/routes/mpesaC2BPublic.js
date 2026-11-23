/**
 * M-Pesa Daraja C2B public webhook endpoints.
 * These MUST be mounted WITHOUT the authenticate middleware — Safaricom
 * sends no auth headers when calling Validation / Confirmation URLs.
 */

const express = require('express');
const crypto = require('crypto');
const billing = require('../services/billingData');
const notificationService = require('../services/notificationService');
const alertSystem = require('../services/alertSystem');
const autoProvision = require('../services/autoProvision');

const router = express.Router();

// Safaricom sends no auth headers, so the callback URL must carry a shared
// secret (e.g. https://host/api/payments/mpesa/c2b/confirm?key=<secret>).
function isAuthorized(req) {
  const expected = process.env.MPESA_C2B_SECRET;
  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[C2B] MPESA_C2B_SECRET is not configured; callbacks rejected');
      return false;
    }
    return true;
  }
  const provided = req.query.key || req.headers['x-mpesa-secret'] || '';
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireSecret(req, res, next) {
  if (!isAuthorized(req)) {
    return res.status(403).json({ ResultCode: 1, ResultDesc: 'Unauthorized' });
  }
  next();
}

router.use(requireSecret);

// ── 1. Validation URL ────────────────────────────────────────────────────────
// Safaricom calls this before processing payment. Must respond within 8 s.
// Return ResultCode 0 = accept, 1 = reject.
router.post('/validate', (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

// ── 2. Confirmation URL ──────────────────────────────────────────────────────
// Safaricom calls when payment is finalised. Respond immediately, then process.
router.post('/confirm', async (req, res) => {
  // Always ack immediately — Safaricom has a strict timeout
  res.json({ ResultCode: 0, ResultDesc: 'Success' });

  try {
    const {
      TransID,
      TransAmount,
      MSISDN,
      BillRefNumber,
      FirstName,
      MiddleName,
      LastName,
    } = req.body;

    if (!TransID || !TransAmount) return;

    const amount   = Number(TransAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      console.warn(`[C2B] Rejected invalid amount ${TransAmount} for ${TransID}`);
      return;
    }
    const phone    = (MSISDN || '').replace(/\D/g, '');
    const ref      = (BillRefNumber || '').trim();
    const senderName = [FirstName, MiddleName, LastName].filter(Boolean).join(' ');

    // Idempotency — skip if this M-Pesa receipt was already recorded
    if (global.db) {
      const dup = await global.db.query(
        'SELECT id FROM payments WHERE reference = $1 LIMIT 1',
        [TransID]
      );
      if (dup.rows.length > 0) return;
    }

    // Match to a customer: invoice number first, then phone
    let invoice  = null;
    let customer = null;

    if (ref && global.db) {
      const inv = await global.db.query(
        `SELECT i.*, c.id AS cid, c.name AS cname, c.phone AS cphone
         FROM invoices i JOIN customers c ON c.id = i.customer_id
         WHERE i.invoice_number = $1 LIMIT 1`,
        [ref]
      );
      if (inv.rows.length > 0) {
        const row = inv.rows[0];
        invoice  = row;
        customer = { id: row.cid, name: row.cname, phone: row.cphone || phone };
      }
    }

    if (!customer && phone && global.db) {
      const intl   = phone.startsWith('254') ? phone : '254' + (phone.startsWith('0') ? phone.slice(1) : phone);
      const local  = '0' + intl.slice(3);
      const cust   = await global.db.query(
        'SELECT * FROM customers WHERE phone IN ($1,$2,$3) LIMIT 1',
        [phone, intl, local]
      );
      if (cust.rows.length > 0) {
        customer = cust.rows[0];
        const inv = await global.db.query(
          `SELECT * FROM invoices WHERE customer_id = $1 AND status IN ('pending','partial')
           ORDER BY due_date ASC LIMIT 1`,
          [customer.id]
        );
        invoice = inv.rows[0] || null;
      }
    }

    if (!customer) {
      console.warn(`[C2B] Unmatched payment ${TransID} KES ${amount} from ${phone} ref="${ref}" sender="${senderName}"`);
      return;
    }

    const payment = await billing.createPayment({
      invoice_id:     invoice?.id || null,
      customer_id:    customer.id,
      amount,
      method:         'mpesa_paybill',
      reference:      TransID,
      receipt_number: TransID,
      notes: `M-Pesa C2B${senderName ? ' - ' + senderName : ''}${phone ? ' (' + phone + ')' : ''}`,
    });

    // Fire-and-forget side-effects
    notificationService.triggerSMS('payment_received', { customer, invoice, payment })
      .catch(e => console.error('[C2B] SMS error:', e.message));

    autoProvision.autoProvisionOnPayment(payment)
      .catch(e => console.error('[C2B] Auto-provision error:', e.message));

    alertSystem.sendPaymentReceived(customer.id, amount, invoice?.invoice_number || ref, TransID)
      .catch(e => console.error('[C2B] Alert error:', e.message));

    console.log(`[C2B] ✓ KES ${amount} from ${customer.name} (${phone}) receipt ${TransID}`);
  } catch (e) {
    console.error('[C2B] Confirm processing error:', e.message);
  }
});

module.exports = router;
