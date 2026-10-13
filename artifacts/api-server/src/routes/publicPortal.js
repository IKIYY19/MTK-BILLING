const express = require("express");
const { getDb } = require("../db");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";



// GET /api/public/tenant-branding - Public tenant branding for login page
router.get("/tenant-branding", async (req, res) => {
  try {
    const db = getDb();
    let tenant = null;

    // 1. Try by slug query param
    if (req.query.slug) {
      const result = await db.query(
        "SELECT * FROM tenants WHERE slug = $1 AND is_active = true",
        [req.query.slug],
      );
      tenant = result.rows[0];
    }

    // 2. Try by domain (from host header)
    if (!tenant && req.headers.host) {
      const hostname = req.headers.host.split(":")[0];
      const result = await db.query(
        "SELECT * FROM tenants WHERE domain = $1 AND is_active = true",
        [hostname],
      );
      tenant = result.rows[0];
    }

    // 3. Fall back to default tenant
    if (!tenant) {
      const result = await db.query(
        "SELECT * FROM tenants WHERE id = $1 AND is_active = true",
        [DEFAULT_TENANT_ID],
      );
      tenant = result.rows[0];
    }

    // 4. Hardcoded fallback
    if (!tenant) {
      return res.json({
        company_name: "MikroTik Billing",
        logo_url: null,
        primary_color: "#3b82f6",
        secondary_color: "#1e293b",
        accent_color: "#f59e0b",
        is_default: true,
      });
    }

    res.json({
      id: tenant.id,
      slug: tenant.slug,
      company_name: tenant.company_name || tenant.name,
      logo_url: tenant.logo_url || null,
      primary_color: tenant.primary_color || "#3b82f6",
      secondary_color: tenant.secondary_color || "#1e293b",
      accent_color: tenant.accent_color || "#f59e0b",
      is_default: tenant.id === DEFAULT_TENANT_ID,
    });
  } catch (e) {
    res.json({
      company_name: "MikroTik Billing",
      logo_url: null,
      primary_color: "#3b82f6",
      secondary_color: "#1e293b",
      accent_color: "#f59e0b",
      is_default: true,
    });
  }
});

// GET /api/public/plans - List active plans for self-registration
router.get("/plans", async (req, res) => {
  try {
    const billing = require("../services/billingData");
    const allPlans = await billing.listPlans();
    const plans = allPlans
      .filter((p) => p.status !== "archived")
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        speed: p.speed,
        data_cap: p.data_cap,
        duration_days: p.duration_days || 30,
        connection_type: p.connection_type || "pppoe",
      }));
    res.json(plans);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/public/register - Register new customer
router.post("/register", async (req, res) => {
  try {
    const { name, phone, email, pin, plan_id } = req.body;
    if (!name || !phone || !pin || !plan_id) {
      return res
        .status(400)
        .json({ error: "Name, phone, PIN, and plan are required" });
    }
    if (!/^\d{4,8}$/.test(String(pin))) {
      return res.status(400).json({ error: "PIN must be 4-8 digits" });
    }

    const billing = require("../services/billingData");
    const plan = billing.getPlanById(plan_id);
    if (!plan) {return res.status(404).json({ error: "Plan not found" });}

    const bcrypt = require("bcryptjs");
    const pinHash = await bcrypt.hash(pin, 10);

    const customer = await billing.createCustomer({
      name,
      phone,
      email: email || "",
      address: "",
      status: "active",
      created_at: new Date().toISOString(),
    });

    const sub = await billing.createSubscription({
      customer_id: customer.id,
      plan_id: plan.id,
      status: "pending",
      start_date: new Date().toISOString(),
      auto_renew: true,
    });

    const planPrice = Number(plan.price) || 0;
    const planTax = Math.round(planPrice * 0.16 * 100) / 100;

    const invoice = await billing.createInvoice({
      customer_id: customer.id,
      subscription_id: sub.id,
      amount: planPrice,
      tax: planTax,
      total: planPrice + planTax,
      status: "unpaid",
      due_date: new Date(Date.now() + 7 * 86400000).toISOString(),
      description: `${plan.name} - ${plan.description || "Internet Service"}`,
      created_at: new Date().toISOString(),
    });

    const bcrypt2 = require("bcryptjs");
    const pinHashStored = await bcrypt2.hash(pin, 10);
    if (!global.dbAvailable) {
      const store = getDb()._getStore ? getDb()._getStore() : {};
      if (store.customers) {
        const c = store.customers.find((c) => c.id === customer.id);
        if (c) {c.portal_pin_hash = pinHashStored;}
      }
    } else {
      try {
        await getDb().query(
          `UPDATE customers SET portal_pin_hash = $1 WHERE id = $2`,
          [pinHashStored, customer.id],
        );
      } catch (dbErr) {
        // portal_pin_hash column might not exist yet
      }
    }

    res.status(201).json({
      success: true,
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
      subscription: { id: sub.id, plan_id: plan.id, status: sub.status },
      invoice: {
        id: invoice.id,
        amount: invoice.amount,
        status: invoice.status,
      },
      plan: { name: plan.name, price: plan.price },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/public/confirm-payment - Confirm payment and activate
router.post("/confirm-payment", async (req, res) => {
  try {
    const { invoice_id, mpesa_code } = req.body;
    if (!invoice_id)
      {return res.status(400).json({ error: "Invoice ID required" });}

    const billing = require("../services/billingData");

    const invoice = await billing.updateInvoice(invoice_id, {
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_method: mpesa_code ? "mpesa" : "cash",
      payment_reference: mpesa_code || "self-service",
    });

    if (!invoice) {return res.status(404).json({ error: "Invoice not found" });}

    const sub = invoice.subscription_id
      ? await billing.getSubscriptionById(invoice.subscription_id)
      : null;
    if (sub) {
      await billing.updateSubscription(sub.id, {
        status: "active",
        activated_at: new Date().toISOString(),
      });
    }

    const customer = sub
      ? await billing.getCustomerById(sub.customer_id)
      : null;
    const plan = sub ? await billing.getPlanById(sub.plan_id) : null;

    const pppoeUsername = customer ? `isp-${customer.phone}` : null;
    const pppoePassword = require('crypto').randomBytes(6).toString('hex'); // cryptographically secure

    res.json({
      success: true,
      message: "Payment confirmed. Your service is now active!",
      credentials: {
        username: pppoeUsername,
        password: pppoePassword,
        plan_name: plan?.name || "",
        speed: plan?.speed || "",
      },
      customer: customer ? { id: customer.id, name: customer.name } : null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
