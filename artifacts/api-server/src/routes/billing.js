const express = require("express");
const router = express.Router();
const { audit } = require("../utils/audit");
router.use(audit.billingRequestMiddleware);

// Multi-tenant: auto-inject tenant_id on all write operations
router.use((req, res, next) => {
  if (req.tenantId && !req.isSuperAdmin) {
    if (
      (req.method === "POST" || req.method === "PUT") &&
      req.body &&
      typeof req.body === "object" &&
      !req.body.tenant_id
    ) {
      req.body.tenant_id = req.tenantId;
    }
    if (req.method === "GET" && !req.query.tenant_id) {
      req.query.tenant_id = req.tenantId;
    }
  }
  next();
});

const billing = require("../services/billingData");
const PPPoEProvisioner = require("../utils/pppoeProvisioner");
const notificationService = require("../services/notificationService");
const db = global.dbAvailable ? global.db : require("../db/memory");
const MpesaService = require("../services/mpesa");
const alertSystem = require("../services/alertSystem");
const mikrotikProvisioning = require("../services/mikrotikProvisioning");
const radiusSync = require("../services/radiusSync");
const slack = require("../services/slackNotifier");

function getPortalBaseUrl(req) {
  const configuredUrl = process.env.PUBLIC_APP_URL || process.env.APP_URL;
  if (configuredUrl) return configuredUrl.replace(/\/+$/, "");
  if (process.env.NODE_ENV !== "production") {
    return `${req.protocol}://${req.hostname}:5173`;
  }
  return `${req.protocol}://${req.get("host")}`;
}

async function getExpandedSubscription(subscriptionId) {
  const sub = await billing.getSubscriptionById(subscriptionId);
  if (!sub) {return null;}

  const customer =
    sub.customer || (await billing.getCustomerById(sub.customer_id));
  const plan = sub.plan || (await billing.getPlanById(sub.plan_id));
  return { ...sub, customer, plan };
}

async function persistSyncState(subscriptionId, syncResult) {
  if (!subscriptionId || !syncResult) {return null;}

  const payload = {
    last_synced_at: new Date().toISOString(),
    last_sync_status:
      syncResult.status || (syncResult.success ? "synced" : "failed"),
    last_sync_error: syncResult.success
      ? null
      : syncResult.error || syncResult.message || "Unknown sync error",
  };

  await billing.updateSubscription(subscriptionId, payload);
  return billing.getSubscriptionById(subscriptionId);
}

async function persistRadiusSyncState(subscriptionId, radiusResult) {
  if (!subscriptionId || !radiusResult) {return null;}

  const payload = {
    last_radius_sync_status:
      radiusResult.status || (radiusResult.success ? "synced" : "failed"),
    last_radius_sync_error: radiusResult.success
      ? null
      : radiusResult.error || "Unknown RADIUS error",
  };

  await billing.updateSubscription(subscriptionId, payload);
  return billing.getSubscriptionById(subscriptionId);
}

function buildProvisionScriptFallback(action, subscription) {
  if (!subscription?.pppoe_username) {
    return null;
  }

  return PPPoEProvisioner.generateProvisioningScript(action, subscription);
}

async function syncSubscription(action, subscription) {
  if (!subscription?.pppoe_username) {
    return {
      syncResult: { success: false, status: "skipped", error: "PPPoE username is missing" },
      radiusResult: null,
      provisionScript: null,
    };
  }

  const fallbackScript = buildProvisionScriptFallback(
    action === "delete"
      ? "remove"
      : action === "suspend"
        ? "suspend"
        : subscription.status === "active"
          ? "activate"
          : "suspend",
    subscription,
  );

  let syncResult = null;
  let radiusResult = null;

  const radiusEnabled = await radiusSync.isRadiusEnabled();
  if (radiusEnabled) {
    try {
      if (action === "delete") {
        radiusResult = await radiusSync.deleteRadiusUser(subscription);
      } else {
        radiusResult = await radiusSync.reconcileRadiusUser(subscription);
      }
    } catch (radiusError) {
      radiusResult = { success: false, status: "failed", error: radiusError.message };
    }
  }

  if (subscription.mikrotik_connection_id && subscription.auto_provision !== false) {
    try {
      if (action === "delete") {
        syncResult = await mikrotikProvisioning.deleteSubscriptionSecret(subscription);
      } else if (action === "suspend") {
        syncResult = await mikrotikProvisioning.suspendSubscriptionSecret(subscription);
      } else {
        syncResult = await mikrotikProvisioning.reconcileSubscription(subscription);
      }
    } catch (error) {
      syncResult = { success: false, status: "failed", error: error.message };
    }
  } else if (!subscription.mikrotik_connection_id) {
    syncResult = { success: false, status: "skipped", error: "No MikroTik connection linked to this subscription" };
  } else {
    syncResult = { success: false, status: "skipped", error: "Auto provisioning is disabled" };
  }

  const combinedSuccess = syncResult?.success || radiusResult?.success;
  const combinedStatus = combinedSuccess ? "synced"
    : (syncResult?.status === "failed" || radiusResult?.status === "failed") ? "failed"
    : "skipped";
  const combinedError = [syncResult?.error, radiusResult?.error].filter(Boolean).join(" | ") || null;

  await persistSyncState(subscription.id, {
    success: combinedSuccess,
    status: combinedStatus,
    error: combinedError,
  });

  if (radiusResult) {
    await persistRadiusSyncState(subscription.id, radiusResult);
  }

  return {
    syncResult,
    radiusResult,
    provisionScript: combinedSuccess ? null : fallbackScript,
  };
}

function normalizeDisabledFlag(value) {
  return value === true || value === "true" || value === "yes";
}

function buildSubscriptionDrift(subscription, secret) {
  const issues = [];
  const expectedRateLimit = mikrotikProvisioning.buildRateLimit(
    subscription.plan,
  );
  const expectedProfile = subscription.pppoe_profile || "";
  const expectedDisabled = subscription.status !== "active";

  if (!secret) {
    issues.push({
      code: "missing_on_router",
      message:
        "Subscription exists in billing but PPPoE secret is missing on MikroTik",
    });
  } else {
    const actualProfile = secret.profile || "";
    const actualDisabled = normalizeDisabledFlag(secret.disabled);
    const actualRateLimit = secret["rate-limit"] || secret.rate_limit || "";

    if (
      (expectedProfile || actualProfile) &&
      expectedProfile !== actualProfile
    ) {
      issues.push({
        code: "profile_mismatch",
        message: `Router profile is "${actualProfile || "default"}" but billing expects "${expectedProfile || "default"}"`,
      });
    }

    if (
      (expectedRateLimit || actualRateLimit) &&
      expectedRateLimit !== actualRateLimit
    ) {
      issues.push({
        code: "rate_limit_mismatch",
        message: `Router rate limit is "${actualRateLimit || "unset"}" but billing expects "${expectedRateLimit || "unset"}"`,
      });
    }

    if (expectedDisabled !== actualDisabled) {
      issues.push({
        code: "status_mismatch",
        message: actualDisabled
          ? "Router secret is disabled while billing says the subscription is active"
          : "Router secret is enabled while billing says the subscription should be suspended",
      });
    }
  }

  if (!subscription.mikrotik_connection_id) {
    issues.push({
      code: "missing_connection_link",
      message: "Subscription has no linked MikroTik connection",
    });
  }

  return issues;
}

// ═══════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════
router.get("/dashboard", async (req, res) => {
  try {
    const stats = await billing.getDashboardStats();
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════
router.get("/customers", async (req, res) => {
  try {
    res.json(await billing.listCustomers());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/customers/:id", async (req, res) => {
  try {
    const customer = await billing.getCustomerDetail(req.params.id);
    if (!customer) {return res.status(404).json({ error: "Customer not found" });}
    res.json(customer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/customers", async (req, res) => {
  try {
    const customer = await billing.createCustomer(req.body);

    // Auto-create subscription if plan_id provided
    let subscription = null;
    if (req.body.plan_id) {
      try {
        subscription = await billing.createSubscription({
          customer_id: customer.id,
          plan_id: req.body.plan_id,
          status: "active",
          start_date: new Date().toISOString(),
          billing_cycle: "monthly",
        });

        // Sync to MikroTik if connection selected
        if (req.body.mikrotik_connection_id) {
          try {
            const expandedSub = await getExpandedSubscription(subscription.id);
            await syncSubscription("reconcile", expandedSub);
          } catch (syncErr) {
            console.error(
              "Failed to sync subscription to MikroTik:",
              syncErr.message,
            );
          }
        }
      } catch (subErr) {
        console.error("Failed to create subscription:", subErr.message);
      }
    }

    // Auto-generate portal credentials (4-digit PIN)
    const db = global.dbAvailable ? global.db : require("../db/memory");
    const bcrypt = require("bcryptjs");
    const crypto = require("crypto");
    const defaultPin = String(Math.floor(1000 + Math.random() * 9000)); // 4-digit PIN
    const pinHash = await bcrypt.hash(defaultPin, 10);
    const portalUsername = customer.phone || `cust-${customer.id.slice(0, 8)}`;

    if (global.dbAvailable) {
      await db
        .query(
          `UPDATE customers SET portal_username = $1, portal_pin_hash = $2 WHERE id = $3`,
          [portalUsername, pinHash, customer.id],
        )
        .catch((e) => console.error('billing.js async op failed:', e?.message || e));
    } else {
      const store = require("../db/billingStore").store;
      const createdCustomer = store.customers.find((c) => c.id === customer.id);
      if (!createdCustomer) {
        throw new Error("Customer not found in billing store");
      }
      createdCustomer.portal_username = portalUsername;
      createdCustomer.portal_pin_hash = pinHash;
    }

    const portalUrl = `${getPortalBaseUrl(req)}/portal/login?phone=${encodeURIComponent(customer.phone || "")}`;

    // Slack notification
    const planName = subscription?.plan_name || req.body.plan_id || null;
    slack
      .customerCreated(customer.name, planName, customer.phone)
      .catch((e) => console.error('billing.js async op failed:', e?.message || e));

    res.status(201).json({
      ...customer,
      subscription: subscription || null,
      portal_url: portalUrl,
      portal_username: portalUsername,
      portal_password: defaultPin,
      message: `Customer created. Portal PIN: ${defaultPin}. Share the portal URL with the customer.`,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/customers/:id", async (req, res) => {
  try {
    const customer = await billing.updateCustomer(req.params.id, req.body);
    if (!customer) {return res.status(404).json({ error: "Customer not found" });}

    if (req.body.plan_id) {
      try {
        console.log(
          "[CUSTOMER UPDATE] plan_id:",
          req.body.plan_id,
          "customer_id:",
          req.params.id,
        );
        const existingSub = (await global.dbAvailable)
          ? (
              await (global.db || require("../db/memory")).query(
                "SELECT * FROM subscriptions WHERE customer_id = $1 AND status = 'active' LIMIT 1",
                [req.params.id],
              )
            ).rows[0] || null
          : (await billing.listSubscriptions()).find(
              (s) => s.customer_id === req.params.id && s.status === "active",
            ) || null;
        if (existingSub) {
          await billing.updateSubscription(existingSub.id, {
            plan_id: req.body.plan_id,
          });
        } else {
          await billing.createSubscription({
            customer_id: req.params.id,
            plan_id: req.body.plan_id,
            status: "active",
            start_date: new Date().toISOString(),
            billing_cycle: "monthly",
          });
        }
      } catch (subErr) {
        console.error("Failed to update subscription:", subErr.message);
      }
    }
    res.json(customer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/customers/:id", async (req, res) => {
  try {
    const customer = await billing.deleteCustomer(req.params.id);
    if (!customer) {return res.status(404).json({ error: "Customer not found" });}
    res.json({ message: "Customer deleted" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Generate/regenerate portal URL for customer
router.post("/customers/:id/portal-url", async (req, res) => {
  try {
    const { v4: uuidv4 } = require("uuid");
    const bcrypt = require("bcryptjs");
    const crypto = require("crypto");

    const newToken = uuidv4();
    const tokenExpires = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Generate random 8-character password
    const newPassword = crypto.randomBytes(4).toString("hex");
    const passwordHash = await bcrypt.hash(newPassword, 10);

    let customer;
    if (global.dbAvailable && global.db) {
      const result = await global.db.query(
        `UPDATE customers
         SET portal_token = $1, portal_token_expires = $2, portal_password_hash = $3, updated_at = NOW()
         WHERE id = $4
         RETURNING id, name, email, phone, portal_username, portal_token, portal_token_expires`,
        [newToken, tokenExpires, passwordHash, req.params.id],
      );
      customer = result.rows[0];
    } else {
      const existingCustomer = await billing.getCustomerById(req.params.id);
      if (existingCustomer) {
        await billing.updateCustomer(req.params.id, {
          portal_token: newToken,
          portal_token_expires: tokenExpires,
          portal_password_hash: passwordHash,
        });
        customer = await billing.getCustomerById(req.params.id);
      }
    }
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const portalUrl = `${getPortalBaseUrl(req)}/portal/token/${customer.portal_token}`;

    res.json({
      portal_url: portalUrl,
      portal_token: customer.portal_token,
      portal_token_expires: customer.portal_token_expires,
      portal_username:
        customer.portal_username || customer.email || customer.phone,
      password: newPassword,
    });
  } catch (e) {
    console.error("Generate portal URL error:", e);
    res.status(500).json({ error: e.message });
  }
});

// Get customer portal info
router.get("/customers/:id/portal-info", async (req, res) => {
  try {
    const customer = global.dbAvailable && global.db
      ? (await global.db.query(
          `SELECT id, name, email, phone, portal_username, portal_token, portal_token_expires
           FROM customers WHERE id = $1`,
          [req.params.id],
        )).rows[0]
      : await billing.getCustomerById(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const portalUrl = customer.portal_token
      ? `${getPortalBaseUrl(req)}/portal/token/${customer.portal_token}`
      : null;

    res.json({
      portal_url: portalUrl,
      portal_token: customer.portal_token,
      portal_token_expires: customer.portal_token_expires,
      portal_username:
        customer.portal_username || customer.email || customer.phone,
    });
  } catch (e) {
    console.error("Get portal info error:", e);
    res.status(500).json({ error: e.message });
  }
});

// Reset portal PIN to a new 4-digit number (for phone+PIN login)
router.post("/customers/:id/reset-pin", async (req, res) => {
  try {
    const bcrypt = require("bcryptjs");

    // Generate random 4-digit PIN
    const newPin = String(Math.floor(1000 + Math.random() * 9000));
    const pinHash = await bcrypt.hash(newPin, 10);

    if (global.dbAvailable && global.db) {
      const result = await global.db.query(
        `UPDATE customers SET portal_pin_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, phone`,
        [pinHash, req.params.id],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Customer not found" });
      }
    } else {
      const customer = await billing.getCustomerById(req.params.id);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      await billing.updateCustomer(req.params.id, { portal_pin_hash: pinHash });
    }

    res.json({
      success: true,
      pin: newPin,
      message: `New portal PIN: ${newPin}. Customer can log in with their phone number and this PIN.`,
    });
  } catch (e) {
    console.error("Reset PIN error:", e);
    res.status(500).json({ error: e.message });
  }
});

// Generate new password for customer
router.post("/customers/:id/reset-password", async (req, res) => {
  try {
    const bcrypt = require("bcryptjs");
    const crypto = require("crypto");

    // Generate random 8-character password
    const newPassword = crypto.randomBytes(4).toString("hex");
    const passwordHash = await bcrypt.hash(newPassword, 10);

    let customer;
    if (global.dbAvailable && global.db) {
      const result = await global.db.query(
        `UPDATE customers
         SET portal_password_hash = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, name, email, phone, portal_username`,
        [passwordHash, req.params.id],
      );
      customer = result.rows[0];
    } else {
      customer = await billing.getCustomerById(req.params.id);
      if (customer) {
        await billing.updateCustomer(req.params.id, {
          portal_password_hash: passwordHash,
        });
      }
    }
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json({
      success: true,
      password: newPassword,
      portal_username:
        customer.portal_username || customer.email || customer.phone,
    });
  } catch (e) {
    console.error("Reset password error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// PAYMENT PROMPTS (M-Pesa STK Push)
// ═══════════════════════════════════════

// Send payment prompt to customer
router.post("/customers/:id/payment-prompt", async (req, res) => {
  try {
    const { amount, invoice_id } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    const customer = await billing.getCustomerDetail(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    if (!customer.phone) {
      return res
        .status(400)
        .json({ error: "Customer phone number is required" });
    }

    // Initialize M-Pesa service
    const mpesa = new MpesaService();
    const accountReference = invoice_id
      ? `INV-${invoice_id}`
      : `PAY-${customer.id}`;
    const description = invoice_id
      ? `Payment for invoice ${invoice_id}`
      : `Payment from ${customer.name}`;

    const mpesaResult = await mpesa.stkPush(
      customer.phone,
      amount,
      accountReference,
      description,
    );

    if (!mpesaResult.success) {
      return res
        .status(400)
        .json({ error: mpesaResult.message || "Failed to send M-Pesa prompt" });
    }

    // Store pending payment
    const pendingId = `pay-${Date.now()}`;
    if (global.dbAvailable) {
      await db.query(
        `INSERT INTO payments (id, customer_id, invoice_id, phone, amount, method, status, reference, received_at)
         VALUES ($1, $2, $3, $4, $5, 'mpesa', 'pending', $6, NOW())`,
        [
          pendingId,
          customer.id,
          invoice_id || null,
          customer.phone,
          parseFloat(amount),
          mpesaResult.checkoutRequestId,
        ],
      );
    }

    res.json({
      success: true,
      checkoutRequestId: mpesaResult.checkoutRequestId,
      pending_id: pendingId,
      message: "Payment prompt sent successfully",
    });
  } catch (e) {
    console.error("Send payment prompt error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// SERVICE PLANS
// ═══════════════════════════════════════
router.get("/plans", async (req, res) => {
  try {
    res.json(await billing.listPlans());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/plans", async (req, res) => {
  try {
    const plan = await billing.createPlan({
      ...req.body,
      tenant_id: req.tenantId || req.body.tenant_id || null,
    });
    res.status(201).json(plan);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/plans/:id", async (req, res) => {
  try {
    const plan = await billing.updatePlan(req.params.id, req.body);
    if (!plan) {return res.status(404).json({ error: "Plan not found" });}
    res.json(plan);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/plans/:id", async (req, res) => {
  try {
    const plan = await billing.deletePlan(req.params.id);
    if (!plan) {return res.status(404).json({ error: "Plan not found" });}
    res.json({ message: "Plan deleted" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// SUBSCRIPTIONS
// ═══════════════════════════════════════
router.get("/subscriptions", async (req, res) => {
  try {
    res.json(await billing.listSubscriptions());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/subscriptions", async (req, res) => {
  try {
    const sub = await billing.createSubscription(req.body);

    // Auto-generate first invoice
    const plan = sub.plan || (await billing.getPlanById(sub.plan_id));
    if (plan) {
      await billing.createInvoice({
        customer_id: sub.customer_id,
        subscription_id: sub.id,
        amount: plan.price,
        tax: plan.price * 0.16,
        notes: `First invoice for ${plan.name}`,
      });
    }

    const expandedSub = await getExpandedSubscription(sub.id);
    const { syncResult, radiusResult, provisionScript } = await syncSubscription(
      "reconcile",
      { ...expandedSub, plan },
    );

    res.status(201).json({
      ...expandedSub,
      provision_script: provisionScript,
      mikrotik_sync: syncResult,
      radius_sync: radiusResult,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/subscriptions/:id", async (req, res) => {
  try {
    const sub = await billing.updateSubscription(req.params.id, req.body);
    if (!sub) {return res.status(404).json({ error: "Subscription not found" });}
    const expandedSub = await getExpandedSubscription(sub.id);
    const shouldSync =
      req.body.auto_provision !== false &&
      (req.body.pppoe_username || expandedSub.pppoe_username);
    const { syncResult, radiusResult, provisionScript } = shouldSync
      ? await syncSubscription("reconcile", expandedSub)
      : { syncResult: null, radiusResult: null, provisionScript: null };
    res.json({
      ...expandedSub,
      provision_script: provisionScript,
      mikrotik_sync: syncResult,
      radius_sync: radiusResult,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/subscriptions/:id/toggle", async (req, res) => {
  try {
    const sub = await billing.toggleSubscriptionStatus(req.params.id);
    if (!sub) {return res.status(404).json({ error: "Subscription not found" });}

    const expandedSub = await getExpandedSubscription(sub.id);
    const action = expandedSub.status === "active" ? "reconcile" : "suspend";
    const { syncResult, radiusResult, provisionScript } = await syncSubscription(
      action,
      expandedSub,
    );

    // Send SMS notification
    if (expandedSub.customer?.phone) {
      notificationService.triggerSMS(
        sub.status === "active" ? "service_restored" : "service_suspended",
        {
          customer: expandedSub.customer,
          sub: expandedSub,
          plan: expandedSub.plan,
          invoice: null,
          payment: null,
        },
      ).catch((e) => console.error("SMS error:", e.message));
    }

    // Send Telegram alert for suspension
    if (sub.status !== "active" && expandedSub.plan?.name) {
      alertSystem
        .sendServiceSuspension(expandedSub.customer.id, expandedSub.plan.name)
        .catch((e) => console.error("Telegram alert error:", e.message));
    }

    res.json({
      ...expandedSub,
      provision_script: provisionScript,
      mikrotik_sync: syncResult,
      radius_sync: radiusResult,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/subscriptions/:id/sync", async (req, res) => {
  try {
    const sub = await getExpandedSubscription(req.params.id);
    if (!sub) {return res.status(404).json({ error: "Subscription not found" });}

    const { syncResult, radiusResult, provisionScript } = await syncSubscription(
      "reconcile",
      sub,
    );
    const refreshed = await getExpandedSubscription(req.params.id);
    res.json({
      ...refreshed,
      provision_script: provisionScript,
      mikrotik_sync: syncResult,
      radius_sync: radiusResult,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/reconcile", async (req, res) => {
  try {
    const { connection_id = "" } = req.query;
    const subscriptions = await billing.listSubscriptions();
    const mikrotikConnections = connection_id
      ? [await mikrotikProvisioning.getConnectionById(connection_id)].filter(
          Boolean,
        )
      : (
          await db.query(
            "SELECT id, name, ip_address, is_online, last_seen FROM mikrotik_connections ORDER BY name ASC",
          )
        ).rows;

    const subscriptionsInScope = subscriptions.filter((subscription) => {
      if (!connection_id) {return true;}
      return subscription.mikrotik_connection_id === connection_id;
    });

    const secretsByConnection = new Map();
    const connectionErrors = [];

    for (const connection of mikrotikConnections) {
      try {
        const secrets = await mikrotikProvisioning.print(
          connection.id,
          "/ppp/secret",
          ".id,name,profile,comment,disabled,rate-limit",
        );
        secretsByConnection.set(connection.id, secrets);
      } catch (error) {
        connectionErrors.push({
          connection_id: connection.id,
          connection_name: connection.name,
          error: error.message,
        });
        secretsByConnection.set(connection.id, []);
      }
    }

    const subscriptionItems = subscriptionsInScope.map((subscription) => {
      const secrets = subscription.mikrotik_connection_id
        ? secretsByConnection.get(subscription.mikrotik_connection_id) || []
        : [];
      const secret = subscription.pppoe_username
        ? secrets.find((item) => item.name === subscription.pppoe_username)
        : null;
      const issues = buildSubscriptionDrift(subscription, secret);

      return {
        type: "subscription",
        id: subscription.id,
        subscription_id: subscription.id,
        connection_id: subscription.mikrotik_connection_id || null,
        connection_name: subscription.router?.name || "Unlinked",
        customer_name: subscription.customer?.name || "Unknown",
        plan_name: subscription.plan?.name || "Unknown plan",
        pppoe_username: subscription.pppoe_username || "",
        billing_status: subscription.status,
        router_secret_status: secret
          ? normalizeDisabledFlag(secret.disabled)
            ? "disabled"
            : "active"
          : "missing",
        sync_status: issues.length === 0 ? "healthy" : "drift",
        issues,
        secret,
        subscription,
      };
    });

    const billingKeys = new Set(
      subscriptionsInScope
        .filter((item) => item.mikrotik_connection_id && item.pppoe_username)
        .map((item) => `${item.mikrotik_connection_id}:${item.pppoe_username}`),
    );

    const orphanSecrets = [];
    for (const connection of mikrotikConnections) {
      const secrets = secretsByConnection.get(connection.id) || [];
      for (const secret of secrets) {
        const key = `${connection.id}:${secret.name}`;
        if (!billingKeys.has(key)) {
          orphanSecrets.push({
            type: "orphan_secret",
            connection_id: connection.id,
            connection_name: connection.name,
            pppoe_username: secret.name,
            router_secret_status: normalizeDisabledFlag(secret.disabled)
              ? "disabled"
              : "active",
            sync_status: "untracked",
            issues: [
              {
                code: "missing_in_billing",
                message:
                  "PPPoE secret exists on MikroTik but has no linked billing subscription",
              },
            ],
            secret,
          });
        }
      }
    }

    const summary = {
      total_subscriptions: subscriptionItems.length,
      healthy_subscriptions: subscriptionItems.filter(
        (item) => item.sync_status === "healthy",
      ).length,
      drifted_subscriptions: subscriptionItems.filter(
        (item) => item.sync_status === "drift",
      ).length,
      orphan_secrets: orphanSecrets.length,
      connection_errors: connectionErrors.length,
    };

    res.json({
      summary,
      connection_errors: connectionErrors,
      subscriptions: subscriptionItems,
      orphan_secrets: orphanSecrets,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/reconcile/subscriptions/:id/apply", async (req, res) => {
  try {
    const sub = await getExpandedSubscription(req.params.id);
    if (!sub) {return res.status(404).json({ error: "Subscription not found" });}

    const { syncResult, radiusResult, provisionScript } = await syncSubscription(
      "reconcile",
      sub,
    );
    const refreshed = await getExpandedSubscription(req.params.id);
    res.json({
      subscription: refreshed,
      mikrotik_sync: syncResult,
      radius_sync: radiusResult,
      provision_script: provisionScript,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/reconcile/orphan-secret/import", async (req, res) => {
  try {
    const {
      connection_id,
      pppoe_username,
      plan_id,
      customer_id = "",
      customer_name = "",
      customer_email = "",
      customer_phone = "",
      billing_cycle = "monthly",
    } = req.body;

    if (!connection_id || !pppoe_username || !plan_id) {
      return res.status(400).json({
        error: "connection_id, pppoe_username, and plan_id are required",
      });
    }

    const connection =
      await mikrotikProvisioning.getConnectionById(connection_id);
    if (!connection) {
      return res.status(404).json({ error: "MikroTik connection not found" });
    }

    const secret = await mikrotikProvisioning.findSecret(
      connection_id,
      pppoe_username,
    );
    if (!secret) {
      return res
        .status(404)
        .json({ error: "PPPoE secret not found on MikroTik" });
    }

    const existingSubscriptions = await billing.listSubscriptions();
    const alreadyLinked = existingSubscriptions.find(
      (item) =>
        item.mikrotik_connection_id === connection_id &&
        item.pppoe_username === pppoe_username,
    );
    if (alreadyLinked) {
      return res.status(409).json({
        error: "This PPPoE secret is already linked to a billing subscription",
      });
    }

    let customer;
    if (customer_id) {
      customer = await billing.getCustomerById(customer_id);
      if (!customer) {
        return res
          .status(404)
          .json({ error: "Selected customer was not found" });
      }
    } else {
      const name = customer_name.trim() || pppoe_username;
      customer = await billing.createCustomer({
        name,
        email: customer_email || null,
        phone: customer_phone || null,
        status: "active",
        notes: `Imported from MikroTik connection ${connection.name}`,
      });
    }

    const status = normalizeDisabledFlag(secret.disabled)
      ? "suspended"
      : "active";
    const subscription = await billing.createSubscription({
      customer_id: customer.id,
      plan_id,
      mikrotik_connection_id: connection_id,
      router_id: null,
      pppoe_username,
      pppoe_password: "",
      pppoe_profile: secret.profile || "",
      billing_cycle,
      status,
      auto_provision: true,
    });

    const expanded = await getExpandedSubscription(subscription.id);
    const syncResult = {
      success: true,
      status: "imported",
      message:
        "Orphan PPPoE secret imported into billing and linked to MikroTik",
    };
    await persistSyncState(subscription.id, syncResult);
    const refreshed = await getExpandedSubscription(subscription.id);

    res.status(201).json({
      customer,
      subscription: refreshed || expanded,
      mikrotik_sync: syncResult,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/subscriptions/:id", async (req, res) => {
  try {
    const existing = await getExpandedSubscription(req.params.id);
    let syncResult = null;
    let radiusResult = null;
    let provisionScript = null;
    if (existing) {
      const syncOutcome = await syncSubscription("delete", existing);
      syncResult = syncOutcome.syncResult;
      radiusResult = syncOutcome.radiusResult;
      provisionScript = syncOutcome.provisionScript;
    }
    const deleted = await billing.deleteSubscription(req.params.id);
    if (!deleted)
      {return res.status(404).json({ error: "Subscription not found" });}
    res.json({
      success: true,
      mikrotik_sync: syncResult,
      radius_sync: radiusResult,
      provision_script: provisionScript,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// INVOICES
// ═══════════════════════════════════════
router.get("/invoices", async (req, res) => {
  try {
    const invoices = await billing.listInvoices();
    res.json(
      invoices.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/invoices", async (req, res) => {
  try {
    const invoice = await billing.createInvoice(req.body);

    // Send SMS notification
    const customer =
      invoice.customer || (await billing.getCustomerById(invoice.customer_id));
    if (customer?.phone) {
      notificationService.triggerSMS("invoice_due_soon", { customer, invoice }).catch((e) =>
        console.error("SMS error:", e.message),
      );
    }

    // Send Telegram alert
    if (invoice.invoice_number) {
      alertSystem
        .sendNewInvoice(
          invoice.customer_id,
          invoice.invoice_number,
          invoice.total,
          invoice.due_date,
        )
        .catch((e) => console.error("Telegram alert error:", e.message));
    }

    res.status(201).json(invoice);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Credit Notes
router.get("/credit-notes", async (req, res) => {
  try {
    if (!global.db) {
      return res.json([]);
    }
    const result = await global.db.query(
      `SELECT cn.*, c.name as customer_name, i.invoice_number
       FROM credit_notes cn
       LEFT JOIN customers c ON c.id = cn.customer_id
       LEFT JOIN invoices i ON i.id = cn.invoice_id
       ORDER BY cn.created_at DESC`,
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/credit-notes", async (req, res) => {
  try {
    const { customer_id, invoice_id, amount, reason } = req.body || {};

    if (!customer_id || !amount) {
      return res
        .status(400)
        .json({ error: "customer_id and amount are required" });
    }

    if (!global.db) {
      return res.status(500).json({ error: "Database not available" });
    }

    // Generate credit note number
    const now = new Date();
    const prefix = `CN-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const countResult = await global.db.query(
      `SELECT COUNT(*) FROM credit_notes WHERE credit_note_number LIKE $1`,
      [`${prefix}%`],
    );
    const count = parseInt(countResult.rows[0].count) + 1;
    const creditNoteNumber = `${prefix}-${String(count).padStart(4, "0")}`;

    const result = await global.db.query(
      `INSERT INTO credit_notes (id, credit_note_number, customer_id, invoice_id, amount, reason, status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [
        creditNoteNumber,
        customer_id,
        invoice_id || null,
        parseFloat(amount),
        reason || "",
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error("Credit note error:", e);
    res.status(500).json({ error: e.message });
  }
});

router.put("/credit-notes/:id", async (req, res) => {
  try {
    const { status } = req.body || {};
    const creditNoteId = req.params.id;

    if (!status) {
      return res.status(400).json({ error: "status is required" });
    }

    if (!global.db) {
      return res.status(500).json({ error: "Database not available" });
    }

    const result = await global.db.query(
      `UPDATE credit_notes SET status = $1 WHERE id = $2 RETURNING *`,
      [status, creditNoteId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Credit note not found" });
    }

    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/credit-notes/:id/apply", async (req, res) => {
  try {
    if (!global.db) {
      return res.status(500).json({ error: "Database not available" });
    }
    const creditNoteId = req.params.id;
    const cnResult = await global.db.query("SELECT * FROM credit_notes WHERE id = $1", [creditNoteId]);
    if (cnResult.rows.length === 0) {
      return res.status(404).json({ error: "Credit note not found" });
    }
    const cn = cnResult.rows[0];
    if (cn.status !== "approved") {
      return res.status(400).json({ error: "Credit note must be approved before applying" });
    }

    if (cn.invoice_id) {
      const invoiceResult = await global.db.query("SELECT * FROM invoices WHERE id = $1", [cn.invoice_id]);
      if (invoiceResult.rows.length > 0) {
        const inv = invoiceResult.rows[0];
        const newPaid = parseFloat(inv.paid_amount || 0) + parseFloat(cn.amount);
        const newStatus = newPaid >= parseFloat(inv.total) ? "paid" : "partial";
        await global.db.query(
          "UPDATE invoices SET paid_amount = $1, status = $2 WHERE id = $3",
          [newPaid, newStatus, cn.invoice_id],
        );
      }
    }

    const result = await global.db.query(
      "UPDATE credit_notes SET status = 'applied' WHERE id = $1 RETURNING *",
      [creditNoteId],
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/invoices/:id", async (req, res) => {
  try {
    const invoice = await billing.updateInvoice(req.params.id, req.body);
    if (!invoice) {return res.status(404).json({ error: "Invoice not found" });}
    res.json(invoice);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/invoices/generate-monthly", async (req, res) => {
  try {
    const created = await billing.generateMonthlyInvoices();
    res.json({
      message: `Generated ${created.length} invoices`,
      invoices: created,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// PAYMENTS
// ═══════════════════════════════════════
router.get("/payments", async (req, res) => {
  try {
    const payments = await billing.listPayments();
    res.json(
      payments.sort(
        (a, b) => new Date(b.received_at) - new Date(a.received_at),
      ),
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/payments", async (req, res) => {
  try {
    const payment = await billing.createPayment(req.body);

    // Send SMS confirmation
    const customer =
      payment.customer || (await billing.getCustomerById(payment.customer_id));
    const invoice =
      payment.invoice || (await billing.getInvoiceById(payment.invoice_id));
    if (customer?.phone) {
      notificationService.triggerSMS("payment_received", { customer, invoice, payment }).catch(
        (e) => console.error("SMS error:", e.message),
      );
    }

    // Trigger webhooks
    const { triggerWebhook } = require("./webhooks");
    triggerWebhook("payment.received", {
      customer_id: payment.customer_id,
      amount: payment.amount,
      invoice_id: payment.invoice_id,
    }).catch((e) => console.error('billing.js async op failed:', e?.message || e));

    // Slack notification
    const customerName = customer?.name || "Unknown";
    const invoiceNumber =
      invoice?.invoice_number || payment.invoice_id || "N/A";
    slack
      .paymentReceived(customerName, payment.amount, invoiceNumber)
      .catch((e) => console.error('billing.js async op failed:', e?.message || e));

    res.status(201).json(payment);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// REAL-TIME ONLINE STATUS
// ═══════════════════════════════════════
router.get("/customers/online-status", async (req, res) => {
  try {
    const { connection_id } = req.query;
    if (!connection_id)
      {return res.json({ online: {}, pppoe: [], hotspot: [], total: 0 });}

    // Get MikroTik connection
    const db = global.db || require("../db/memory");

    const connResult = await db.query(
      "SELECT * FROM mikrotik_connections WHERE id = $1",
      [connection_id],
    );
    if (connResult.rows.length === 0)
      return res.json({ online: {}, pppoe: [], hotspot: [], total: 0 });

    const device = connResult.rows[0];

    // Fetch active PPPoE and Hotspot sessions via the shared connection manager
    const routerConnectionManager = require("../services/routerConnectionManager");
    const pppoeActive = await routerConnectionManager.print(device, "/ppp/active");
    const hotspotActive = await routerConnectionManager.print(device, "/ip/hotspot/active");

    // Build online map: customer_id → session info
    const onlineMap = {};
    const pppoeOnline = [];
    const hotspotOnline = [];

    // Match PPPoE sessions to billing customers
    const allCustomers = await billing.listCustomers();
    const allSubscriptions = await billing.listSubscriptions();

    for (const session of Array.isArray(pppoeActive) ? pppoeActive : []) {
      const username = session.name || session.user;
      if (!username) {continue;}

      // Find subscription with this PPPoE username
      const sub = allSubscriptions.find((s) => s.pppoe_username === username);
      if (sub) {
        onlineMap[sub.customer_id] = {
          type: "pppoe",
          username,
          address: session.address,
          uptime: session.uptime,
          encoding: session.encoding,
          connected_at: new Date().toISOString(),
        };
        pppoeOnline.push({
          customer_id: sub.customer_id,
          customer_name:
            allCustomers.find((c) => c.id === sub.customer_id)?.name ||
            "Unknown",
          username,
          address: session.address,
          uptime: session.uptime,
          encoding: session.encoding,
        });
      }
    }

    // Match Hotspot sessions to billing customers
    for (const session of Array.isArray(hotspotActive) ? hotspotActive : []) {
      const username = session.user;
      if (!username) {continue;}

      // Try to find customer by hotspot username match in subscriptions or custom field
      const sub = allSubscriptions.find((s) => s.hotspot_username === username);
      if (sub) {
        const customerId = sub.customer_id;
        if (!onlineMap[customerId]) {
          // Don't override PPPoE if already online
          onlineMap[customerId] = {
            type: "hotspot",
            username,
            address: session.address,
            uptime: session.uptime,
            mac: session["mac-address"],
            bytes_in: session["bytes-in"],
            bytes_out: session["bytes-out"],
            connected_at: new Date().toISOString(),
          };
          hotspotOnline.push({
            customer_id: customerId,
            customer_name:
              allCustomers.find((c) => c.id === customerId)?.name || "Unknown",
            username,
            address: session.address,
            uptime: session.uptime,
            mac: session["mac-address"],
            bytes_in: session["bytes-in"],
            bytes_out: session["bytes-out"],
          });
        }
      }
    }

    res.json({
      online: onlineMap,
      pppoe: pppoeOnline,
      hotspot: hotspotOnline,
      total: pppoeOnline.length + hotspotOnline.length,
    });
  } catch (e) {
    console.error("Online status error:", e);
    res.json({
      online: {},
      pppoe: [],
      hotspot: [],
      total: 0,
      error: e.message,
    });
  }
});

// ═══════════════════════════════════════
// USAGE
// ═══════════════════════════════════════
router.get("/usage/:customerId", async (req, res) => {
  try {
    const records = await billing.listUsageRecords({
      customerId: req.params.customerId,
      limit: 100,
    });
    res.json(records);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/usage/record", async (req, res) => {
  try {
    const record = await billing.recordUsage(req.body);
    res.status(201).json(record);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get aggregated usage history for bandwidth graphs
router.get("/usage/history", async (req, res) => {
  try {
    const {
      time_range = "1h",
      customer_id = "",
      connection_id = "",
    } = req.query;

    // Determine time window and grouping
    const now = new Date();
    let startTime, groupBy;
    switch (time_range) {
      case "6h":
        startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        groupBy = "5m";
        break;
      case "24h":
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        groupBy = "15m";
        break;
      case "7d":
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        groupBy = "1h";
        break;
      default: // 1h
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        groupBy = "1m";
    }

    // Get all usage records within the time window
    const records = await billing.listUsageRecords({
      customerId: customer_id || undefined,
      startTime,
      endTime: now,
      limit: 5000,
    });

    // If connection_id specified, get PPPoE sessions from MikroTik for real-time data
    let pppoeSessions = [];
    const pppoeBandwidth = { total_in: 0, total_out: 0 };

    if (connection_id) {
      try {
        const db = global.db || require("../db/memory");

        const connResult = await db.query(
          "SELECT * FROM mikrotik_connections WHERE id = $1",
          [connection_id],
        );
        if (connResult.rows.length > 0) {
          const device = connResult.rows[0];
          const routerConnectionManager = require("../services/routerConnectionManager");
          pppoeSessions = await routerConnectionManager.print(device, "/ppp/active");

          // Calculate total bandwidth from PPPoE sessions
          for (const session of Array.isArray(pppoeSessions)
            ? pppoeSessions
            : []) {
            const bytesIn = parseBytes(session["bytes-in"] || session.bytes_in);
            const bytesOut = parseBytes(
              session["bytes-out"] || session.bytes_out,
            );
            pppoeBandwidth.total_in += bytesIn;
            pppoeBandwidth.total_out += bytesOut;
          }
        }
      } catch (e) {
        console.warn("[Billing] Failed to get PPPoE data:", e.message);
      }
    }

    // Aggregate records by time bucket
    const aggregated = aggregateByTimeRange(records, startTime, now, groupBy);

    // If no historical data, use current PPPoE session data to populate latest point
    if (aggregated.length === 0 && pppoeSessions.length > 0) {
      aggregated.push({
        time: now.toISOString(),
        download: pppoeBandwidth.total_out,
        upload: pppoeBandwidth.total_in,
        total: pppoeBandwidth.total_in + pppoeBandwidth.total_out,
        sessions: pppoeSessions.length,
      });
    }

    res.json({
      data: aggregated,
      time_range: time_range,
      group_by: groupBy,
      total_sessions: pppoeSessions.length,
      total_bandwidth_in: pppoeBandwidth.total_in,
      total_bandwidth_out: pppoeBandwidth.total_out,
    });
  } catch (e) {
    console.error("[Billing] Usage history error:", e);
    res.status(500).json({ error: e.message, data: [] });
  }
});

// Helper: parse MikroTik bytes string to integer
function parseBytes(bytesStr) {
  if (!bytesStr) {return 0;}
  const str = String(bytesStr);
  if (/^\d+$/.test(str)) {return parseInt(str);}
  const match = str.match(/^([\d.]+)\s*([KMGTP]i?B)?$/i);
  if (!match) {return 0;}
  const value = parseFloat(match[1]);
  const unit = (match[2] || "").toLowerCase().replace("ib", "");
  const multipliers = {
    "": 1,
    k: 1024,
    m: 1048576,
    g: 1073741824,
    t: 1099511627776,
    p: 1125899906842624,
  };
  return Math.round(value * (multipliers[unit] || 1));
}

// Helper: aggregate usage records into time buckets
function aggregateByTimeRange(records, startTime, endTime, groupBy) {
  const buckets = [];
  let current = new Date(startTime);

  // Determine bucket size in milliseconds
  let bucketSize;
  switch (groupBy) {
    case "1m":
      bucketSize = 60 * 1000;
      break;
    case "5m":
      bucketSize = 5 * 60 * 1000;
      break;
    case "15m":
      bucketSize = 15 * 60 * 1000;
      break;
    case "1h":
      bucketSize = 60 * 60 * 1000;
      break;
    default:
      bucketSize = 60 * 1000;
  }

  while (current < endTime) {
    const bucketEnd = new Date(current.getTime() + bucketSize);
    const bucketRecords = records.filter((r) => {
      const t = new Date(r.recorded_at);
      return t >= current && t < bucketEnd;
    });

    const download = bucketRecords.reduce(
      (sum, r) => sum + (parseInt(r.bytes_out) || 0),
      0,
    );
    const upload = bucketRecords.reduce(
      (sum, r) => sum + (parseInt(r.bytes_in) || 0),
      0,
    );
    const uniqueSessions = new Set(
      bucketRecords.map((r) => r.session_id).filter(Boolean),
    ).size;

    buckets.push({
      time: current.toISOString(),
      download,
      upload,
      total: download + upload,
      sessions: Math.max(uniqueSessions, bucketRecords.length),
    });

    current = bucketEnd;
  }

  return buckets;
}

// ═══════════════════════════════════════
// REVIEWS (Admin)
// ═══════════════════════════════════════

// Get all reviews (admin only)
router.get("/reviews", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT r.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
       FROM reviews r
       LEFT JOIN customers c ON c.id = r.customer_id
       ORDER BY r.created_at DESC`,
    );
    res.json(result.rows);
  } catch (e) {
    console.error("Get all reviews error:", e);
    res.status(500).json({ error: e.message });
  }
});

// Get staff points leaderboard
router.get("/staff-points", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.name, u.email, u.role, COALESCE(SUM(sp.points), 0) as total_points
       FROM users u
       LEFT JOIN staff_points sp ON sp.user_id = u.id
       WHERE u.role IN ('customer_care', 'sales_team', 'admin', 'technician')
       GROUP BY u.id, u.name, u.email, u.role
       ORDER BY total_points DESC`,
    );
    res.json(result.rows);
  } catch (e) {
    console.error("Get staff points error:", e);
    res.status(500).json({ error: e.message });
  }
});

// Get staff point history
router.get("/staff-points/:userId", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT sp.*, r.rating, r.service_quality, c.name as customer_name
       FROM staff_points sp
       LEFT JOIN reviews r ON r.id = sp.review_id
       LEFT JOIN customers c ON c.id = r.customer_id
       WHERE sp.user_id = $1
       ORDER BY sp.created_at DESC`,
      [req.params.userId],
    );
    res.json(result.rows);
  } catch (e) {
    console.error("Get staff point history error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ─── CUSTOMER MERGE ───
router.post("/customers/merge", async (req, res) => {
  try {
    const { source_id, target_id } = req.body;
    if (!source_id || !target_id)
      {return res
        .status(400)
        .json({ error: "source_id and target_id required" });}
    if (source_id === target_id)
      {return res
        .status(400)
        .json({ error: "Cannot merge a customer into itself" });}

    const currentDb = global.dbAvailable ? global.db : require("../db/memory");

    // Verify both customers exist
    const source = await currentDb.query(
      "SELECT * FROM customers WHERE id = $1",
      [source_id],
    );
    const target = await currentDb.query(
      "SELECT * FROM customers WHERE id = $1",
      [target_id],
    );
    if (source.rows.length === 0)
      {return res.status(404).json({ error: "Source customer not found" });}
    if (target.rows.length === 0)
      {return res.status(404).json({ error: "Target customer not found" });}

    const results = {
      invoices: 0,
      payments: 0,
      subscriptions: 0,
      tickets: 0,
      wallet: 0,
    };

    if (global.dbAvailable) {
      // ─── PostgreSQL mode ───
      const invRes = await currentDb.query(
        "UPDATE invoices SET customer_id = $1 WHERE customer_id = $2",
        [target_id, source_id],
      );
      results.invoices = invRes.rowCount || 0;

      const payRes = await currentDb.query(
        "UPDATE payments SET customer_id = $1 WHERE customer_id = $2",
        [target_id, source_id],
      );
      results.payments = payRes.rowCount || 0;

      const subRes = await currentDb.query(
        "UPDATE subscriptions SET customer_id = $1 WHERE customer_id = $2",
        [target_id, source_id],
      );
      results.subscriptions = subRes.rowCount || 0;

      const tickRes = await currentDb.query(
        "UPDATE tickets SET customer_id = $1 WHERE customer_id = $2",
        [target_id, source_id],
      );
      results.tickets = tickRes.rowCount || 0;

      // Merge wallet balance
      const sourceWallet = await currentDb.query(
        "SELECT * FROM wallets WHERE customer_id = $1",
        [source_id],
      );
      const targetWallet = await currentDb.query(
        "SELECT * FROM wallets WHERE customer_id = $1",
        [target_id],
      );
      if (sourceWallet.rows.length > 0) {
        const srcBal = parseFloat(sourceWallet.rows[0].balance) || 0;
        if (targetWallet.rows.length > 0) {
          const newBal =
            (parseFloat(targetWallet.rows[0].balance) || 0) + srcBal;
          await currentDb.query(
            "UPDATE wallets SET balance = $1 WHERE customer_id = $2",
            [newBal, target_id],
          );
          await currentDb.query(
            "UPDATE wallet_transactions SET wallet_id = $1 WHERE wallet_id = $2",
            [targetWallet.rows[0].id, sourceWallet.rows[0].id],
          );
          await currentDb.query("DELETE FROM wallets WHERE customer_id = $1", [
            source_id,
          ]);
        } else {
          await currentDb.query(
            "UPDATE wallets SET customer_id = $1 WHERE customer_id = $2",
            [target_id, source_id],
          );
        }
        results.wallet = srcBal;
      }

      // Deactivate source customer
      await currentDb.query(
        "UPDATE customers SET status = 'merged', notes = CONCAT(COALESCE(notes,''), ' | Merged into ', $1, ' on ', NOW()::text) WHERE id = $2",
        [target_id, source_id],
      );
    } else {
      // ─── In-memory mode ───
      const billingStore = require("../db/billingStore");
      billingStore.store.invoices.forEach((i) => {
        if (i.customer_id === source_id) {
          i.customer_id = target_id;
          results.invoices++;
        }
      });
      billingStore.store.payments.forEach((p) => {
        if (p.customer_id === source_id) {
          p.customer_id = target_id;
          results.payments++;
        }
      });
      billingStore.store.subscriptions.forEach((s) => {
        if (s.customer_id === source_id) {
          s.customer_id = target_id;
          results.subscriptions++;
        }
      });
      billingStore.store.tickets.forEach((t) => {
        if (t.customer_id === source_id) {
          t.customer_id = target_id;
          results.tickets++;
        }
      });

      // Merge wallet in memory
      const walletModule = require("../db/walletStore");
      const walletStoreRef = walletModule.walletStore;
      const srcWallet = walletStoreRef.wallets.find(
        (w) => w.customer_id === source_id,
      );
      const tgtWallet = walletStoreRef.wallets.find(
        (w) => w.customer_id === target_id,
      );
      if (srcWallet) {
        const srcBal = parseFloat(srcWallet.balance) || 0;
        if (tgtWallet) {
          tgtWallet.balance = (parseFloat(tgtWallet.balance) || 0) + srcBal;
          tgtWallet.updated_at = new Date().toISOString();
          // Move transactions
          walletStoreRef.transactions.forEach((t) => {
            if (t.customer_id === source_id) {
              t.customer_id = target_id;
              t.wallet_id = tgtWallet.id;
            }
          });
          // Remove source wallet
          const srcIdx = walletStoreRef.wallets.indexOf(srcWallet);
          if (srcIdx !== -1) {walletStoreRef.wallets.splice(srcIdx, 1);}
        } else {
          srcWallet.customer_id = target_id;
          srcWallet.updated_at = new Date().toISOString();
          walletStoreRef.transactions.forEach((t) => {
            if (t.customer_id === source_id) {
              t.customer_id = target_id;
            }
          });
        }
        results.wallet = srcBal;
      }

      const src = billingStore.store.customers.find((c) => c.id === source_id);
      if (src) {
        src.status = "merged";
        src.notes =
          (src.notes || "") +
          ` | Merged into ${target_id} on ${new Date().toISOString()}`;
      }
    }

    // Log audit
    if (global.dbAvailable) {
      await currentDb.query(
        "INSERT INTO billing_audit_logs (id, user_id, action, entity_type, entity_id, old_values, new_values, created_at) VALUES ($1, $2, 'merge', 'customer', $3, $4, $5, NOW())",
        [
          require("uuid").v4(),
          req.user?.id || null,
          target_id,
          JSON.stringify({
            source: source.rows[0].name,
            target: target.rows[0].name,
          }),
          JSON.stringify(results),
        ],
      );
    }

    res.json({
      success: true,
      source_name: source.rows[0].name,
      target_name: target.rows[0].name,
      ...results,
    });
  } catch (e) {
    console.error("Customer merge error:", e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
