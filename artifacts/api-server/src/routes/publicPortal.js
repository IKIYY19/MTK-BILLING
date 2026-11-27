const express = require("express");
const { getDb } = require("../db");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";



// GET /api/public/hotspot-plans - Preview plans without a router session
router.get("/hotspot-plans", async (req, res) => {
  try {
    const db = getDb();
    let routerId = String(req.query.router_id || "");
    let routerName = "";
    let tenantId = DEFAULT_TENANT_ID;
    if (routerId) {
      const found = await db.query("SELECT id, name, tenant_id FROM mikrotik_connections WHERE id = $1", [routerId]);
      if (found.rows.length === 0) {return res.status(404).json({ error: "Router not found" });}
      routerName = found.rows[0].name;
      tenantId = found.rows[0].tenant_id || DEFAULT_TENANT_ID;
    } else {
      const found = await db.query("SELECT id, name, tenant_id FROM mikrotik_connections ORDER BY name LIMIT 1");
      if (found.rows.length === 0) {return res.json({ router: { name: "" }, plans: [] });}
      routerId = found.rows[0].id;
      routerName = found.rows[0].name;
      tenantId = found.rows[0].tenant_id || DEFAULT_TENANT_ID;
    }
    const result = await db.query(
      `SELECT id, name, speed_up, speed_down, price, quota_gb,
              validity_days, validity_hours, validity_minutes
       FROM service_plans
       WHERE tenant_id = $1 AND is_active = true AND plan_type = 'hotspot'
         AND price > 0 AND price = TRUNC(price)
       ORDER BY price ASC, name ASC`,
      [tenantId],
    );
    res.json({
      router: { name: routerName },
      plans: result.rows.map((plan) => ({
        ...plan,
        price: Number(plan.price),
        quota_gb: plan.quota_gb === null ? null : Number(plan.quota_gb),
        validity_days: Number(plan.validity_days),
        validity_hours: Number(plan.validity_hours || 0),
        validity_minutes: Number(plan.validity_minutes || 0),
        validity_label: require("../services/validity").label(plan),
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/public/policy - Non-sensitive policy values for customer portals
router.get("/policy", async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  try {
    const db = getDb();
    const result = await db.query(
      "SELECT key, value FROM settings WHERE key = ANY($1)",
      [["fup_warning_threshold", "fup_critical_threshold", "pppoe_trial_days", "expiry_reminder_hours", "portal_font", "portal_theme", "portal_terms_enabled", "portal_terms_text"]],
    );
    const values = Object.fromEntries(result.rows.map((row) => [row.key, row.value]));
    res.json({
      fup_warning_threshold: Number(values.fup_warning_threshold) || 80,
      fup_critical_threshold: Number(values.fup_critical_threshold) || 95,
      pppoe_trial_days: Number(values.pppoe_trial_days) || 0,
      expiry_reminder_hours: values.expiry_reminder_hours || "72,24,4",
      portal_font: values.portal_font || "Inter",
      portal_theme: values.portal_theme || "aurora",
      portal_terms_enabled: String(values.portal_terms_enabled) === "true",
      portal_terms_text: values.portal_terms_text || "",
    });
  } catch (e) {
    res.json({
      fup_warning_threshold: 80,
      fup_critical_threshold: 95,
      pppoe_trial_days: 0,
      expiry_reminder_hours: "72,24,4",
      portal_font: "Inter",
      portal_theme: "aurora",
      portal_terms_enabled: false,
      portal_terms_text: "",
    });
  }
});

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
        duration_days: p.validity_days ?? p.duration_days ?? 30,
        validity_hours: p.validity_hours || 0,
        validity_minutes: p.validity_minutes || 0,
        validity_label: require("../services/validity").label(p),
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
    const plan = await billing.getPlanById(plan_id);
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

    if (!global.dbAvailable) {
      const store = getDb()._getStore ? getDb()._getStore() : {};
      if (store.customers) {
        const c = store.customers.find((c) => c.id === customer.id);
        if (c) {c.portal_pin_hash = pinHash;}
      }
    } else {
      try {
        await getDb().query(
          `UPDATE customers SET portal_pin_hash = $1 WHERE id = $2`,
          [pinHash, customer.id],
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

// POST /api/public/confirm-payment - Activate only after a verified provider payment exists.
// The M-Pesa callback (server-to-server) creates the payments row with the
// provider transaction ID as its reference. A client-supplied code alone can
// never mark an invoice paid.
router.post("/confirm-payment", async (req, res) => {
  try {
    const { invoice_id, mpesa_code } = req.body;
    if (!invoice_id || !mpesa_code) {
      return res.status(400).json({
        error: "Invoice ID and M-Pesa confirmation code are required",
      });
    }

    const code = String(mpesa_code).trim().toUpperCase();
    if (!/^[A-Z0-9]{6,40}$/.test(code)) {
      return res.status(400).json({ error: "Invalid M-Pesa confirmation code" });
    }

    if (!global.dbAvailable) {
      return res.status(503).json({
        error: "Payment confirmation requires persistent storage",
      });
    }

    const billing = require("../services/billingData");
    const invoice = await billing.getInvoiceById(invoice_id);
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const payment = await global.db.query(
      `SELECT id, amount FROM payments
       WHERE invoice_id = $1 AND UPPER(TRIM(reference)) = $2 AND amount > 0
       LIMIT 1`,
      [invoice_id, code],
    );
    if (!payment.rows.length) {
      return res.status(402).json({
        error: "No verified payment found for that code. Payment will activate service automatically once confirmed.",
      });
    }

    if (invoice.status !== "paid") {
      await billing.updateInvoice(invoice_id, { status: "paid" });
    }

    const sub = invoice.subscription_id
      ? await billing.getSubscriptionById(invoice.subscription_id)
      : null;
    if (sub && sub.status !== "active") {
      await billing.updateSubscription(sub.id, {
        status: "active",
        activated_at: new Date().toISOString(),
      });
    }

    const customer = sub
      ? await billing.getCustomerById(sub.customer_id)
      : null;
    const plan = sub && sub.plan_id
      ? await billing.getPlanById(sub.plan_id)
      : null;

    // Never invent credentials. Only return the real PPPoE credentials that
    // were provisioned on the subscription (and therefore in RADIUS).
    const credentials = sub?.pppoe_username && sub?.pppoe_password
      ? {
          username: sub.pppoe_username,
          password: sub.pppoe_password,
          plan_name: plan?.name || "",
          speed: plan?.speed || "",
        }
      : null;

    res.json({
      success: true,
      message: credentials
        ? "Payment confirmed. Your service is now active!"
        : "Payment confirmed. Your account is active; your service credentials will be provided by the operator.",
      credentials,
      customer: customer ? { id: customer.id, name: customer.name } : null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
