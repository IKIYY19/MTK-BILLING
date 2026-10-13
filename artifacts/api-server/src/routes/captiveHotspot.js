const express = require("express");
const { paymentLimiter } = require("../middleware/rateLimiter");
const captiveHotspot = require("../services/captiveHotspot");
const paymentsRouter = require("./payments");

const router = express.Router();
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.use(paymentLimiter);

function requireRouterId(value) {
  const routerId = String(value || "").trim();
  if (!UUID_PATTERN.test(routerId)) {
    throw Object.assign(new Error("The hotspot router identifier is missing or invalid."), {
      statusCode: 400,
    });
  }
  return routerId;
}

function publicError(res, error) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  if (error.message?.includes("require the PostgreSQL database")) {
    return res.status(503).json({
      error: "Paid hotspot access is unavailable until the database is ready.",
    });
  }
  console.error("Captive hotspot request failed:", error);
  return res.status(500).json({ error: "The hotspot request could not be completed." });
}

async function checkProviderStatus(session) {
  if (!session.checkout_request_id || !(await captiveHotspot.noteStatusCheck(session.id))) {
    return session;
  }
  const configured = await paymentsRouter.isMpesaConfigured();
  if (!configured) {
    return session;
  }
  const mpesa = await paymentsRouter.getMpesaService();
  const verification = await mpesa.checkStkStatus(session.checkout_request_id);
  return (
    (await captiveHotspot.handleProviderVerification(
      session.checkout_request_id,
      verification,
    )) || session
  );
}

router.get("/plans", async (req, res) => {
  try {
    const routerId = requireRouterId(req.query.router_id);
    const macAddress = captiveHotspot.normalizeMac(req.query.mac);
    if (!macAddress) {
      return res.status(400).json({ error: "The router did not provide a valid client MAC address." });
    }
    const { router: routerRecord, plans } = await captiveHotspot.listPlans(
      routerId,
      req.tenantId || null,
    );
    const activeSession = await captiveHotspot.findActiveSession(routerId, macAddress);
    res.set("Cache-Control", "no-store");
    return res.json({
      router: { name: routerRecord.name },
      plans: plans.map((plan) => ({
        ...plan,
        price: Number(plan.price),
        quota_gb: plan.quota_gb === null ? null : Number(plan.quota_gb),
        validity_days: Number(plan.validity_days),
      })),
      activeSession: activeSession
        ? { expiresAt: activeSession.expires_at }
        : null,
    });
  } catch (error) {
    return publicError(res, error);
  }
});

router.post("/sessions", async (req, res) => {
  try {
    const routerId = requireRouterId(req.body.router_id);
    const macAddress = captiveHotspot.normalizeMac(req.body.mac);
    if (!macAddress) {
      return res.status(400).json({ error: "The router did not provide a valid client MAC address." });
    }
    const clientIp = String(req.body.ip || "").trim();
    if (clientIp && clientIp.length > 45) {
      return res.status(400).json({ error: "The client IP address is invalid." });
    }
    const { gateway, loginUrl } = captiveHotspot.validateRedirect(
      req.body.gateway_ip,
      req.body.link_login_only,
    );
    const originalUrl = captiveHotspot.safeOriginalUrl(req.body.original_url);
    const submittedPhone = String(req.body.phone || "").replace(/\D/g, "");
    const phone = submittedPhone.startsWith("0")
      ? `254${submittedPhone.slice(1)}`
      : submittedPhone;
    if (!/^254[17]\d{8}$/.test(phone)) {
      return res.status(400).json({ error: "Enter a valid M-Pesa phone number." });
    }
    const routerRecord = await captiveHotspot.getRouter(
      routerId,
      req.tenantId || null,
    );
    if (!routerRecord || !routerRecord.tenant_id) {
      return res.status(404).json({ error: "This hotspot router is not available." });
    }
    if (await captiveHotspot.findActiveSession(routerId, macAddress)) {
      return res.status(409).json({ error: "This device already has an active paid package on this Wi-Fi network." });
    }
    if (await captiveHotspot.findOpenSession(routerId, macAddress)) {
      return res.status(409).json({
        error: "A recent payment session already exists for this device. Check its status before starting another payment.",
      });
    }
    if (!UUID_PATTERN.test(String(req.body.plan_id || ""))) {
      return res.status(400).json({ error: "Choose a valid hotspot package." });
    }
    const planResult = await global.db.query(
      `SELECT id, tenant_id, name, price, validity_days
       FROM service_plans
       WHERE id = $1 AND tenant_id = $2 AND is_active = true
         AND plan_type = 'hotspot' AND price > 0 AND price = TRUNC(price)`,
      [req.body.plan_id, routerRecord.tenant_id],
    );
    const plan = planResult.rows[0];
    if (!plan || Number(plan.price) <= 0) {
      return res.status(404).json({ error: "That hotspot package is no longer available." });
    }
    if (!(await paymentsRouter.isMpesaConfigured())) {
      return res.status(503).json({
        error: "M-Pesa payments are not configured. Ask the network operator to complete the M-Pesa integration setup.",
      });
    }

    const session = await captiveHotspot.createPendingSession({
      router: routerRecord,
      plan,
      macAddress,
      clientIp,
      gateway,
      originalUrl,
      loginUrl,
      phone,
    });

    try {
      const mpesa = await paymentsRouter.getMpesaService();
      const result = await mpesa.stkPush(
        phone,
        Number(plan.price),
        `HS-${session.id.slice(0, 10)}`,
        `Hotspot ${plan.name}`,
      );
      if (!result.success || !result.checkoutRequestId) {
        await captiveHotspot.markInitiationFailed(
          session.id,
          result.message || result.error || "M-Pesa did not accept the payment prompt.",
        );
        return res.status(502).json({
          error: result.message || result.error || "M-Pesa could not start the payment prompt.",
        });
      }
      await captiveHotspot.attachCheckout(
        session.id,
        result.checkoutRequestId,
        result,
      );
      res.set("Cache-Control", "no-store");
      return res.status(201).json({
        sessionToken: session.token,
        checkoutRequestId: result.checkoutRequestId,
        status: "pending",
        message: "Approve the payment request on your phone.",
      });
    } catch (error) {
      await captiveHotspot.markInitiationFailed(session.id, error.message);
      throw error;
    }
  } catch (error) {
    return publicError(res, error);
  }
});

router.get("/sessions/:token", async (req, res) => {
  try {
    const routerId = requireRouterId(req.query.router_id);
    const macAddress = captiveHotspot.normalizeMac(req.query.mac);
    if (!macAddress) {
      return res.status(400).json({ error: "The client MAC address is invalid." });
    }
    let session = await captiveHotspot.findByToken(req.params.token, {
      routerId,
      macAddress,
      tenantId: req.tenantId || null,
    });
    if (!session) {
      return res.status(404).json({ error: "The payment session was not found." });
    }
    if (session.status === "pending") {
      session = await checkProviderStatus(session);
    }
    const response = await captiveHotspot.publicSession(session);
    res.set("Cache-Control", "no-store");
    return res.json(response);
  } catch (error) {
    return publicError(res, error);
  }
});

router.post("/sessions/:token/retry", async (req, res) => {
  try {
    const routerId = requireRouterId(req.body.router_id);
    const macAddress = captiveHotspot.normalizeMac(req.body.mac);
    if (!macAddress) {
      return res.status(400).json({ error: "The client MAC address is invalid." });
    }
    const session = await captiveHotspot.findByToken(req.params.token, {
      routerId,
      macAddress,
      tenantId: req.tenantId || null,
    });
    if (!session) {
      return res.status(404).json({ error: "The payment session was not found." });
    }
    const updated = await captiveHotspot.authorizePaidSession(session);
    res.set("Cache-Control", "no-store");
    return res.json(await captiveHotspot.publicSession(updated));
  } catch (error) {
    return publicError(res, error);
  }
});

module.exports = router;
