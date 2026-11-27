const express = require("express");
const { paymentLimiter } = require("../middleware/rateLimiter");
const captiveHotspot = require("../services/captiveHotspot");
const routerConnectionManager = require("../services/routerConnectionManager");
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

function normalizeClientIp(value) {
  let ip = String(value || "").split(",")[0].trim();
  if (ip.startsWith("::ffff:")) {ip = ip.slice(7);}
  return ip.startsWith("$(") ? "" : ip;
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
    const clientIp =
      normalizeClientIp(req.query.ip) ||
      normalizeClientIp(req.headers["x-forwarded-for"]) ||
      normalizeClientIp(req.ip);
    let macAddress = captiveHotspot.normalizeMac(req.query.mac);
    if (!macAddress && clientIp) {
      // Some RouterOS versions leave $(mac) empty in the hotspot HTML. Resolve
      // the client from its live hotspot host entry using the $(ip) value.
      try {
        const hosts = await routerConnectionManager.print(
          routerId,
          "/ip/hotspot/host",
          ".id,mac-address,address",
        );
        const host = hosts.find((entry) => String(entry.address) === clientIp);
        if (host) {
          macAddress = captiveHotspot.normalizeMac(host["mac-address"] || host.mac);
        }
        if (!macAddress) {
          // Hotspot host entries expire quickly; DHCP leases are longer lived.
          const leases = await routerConnectionManager.print(
            routerId,
            "/ip/dhcp-server/lease",
            ".id,address,mac-address,status",
          );
          const lease = leases.find((entry) => String(entry.address) === clientIp);
          if (lease) {
            macAddress = captiveHotspot.normalizeMac(lease["mac-address"] || lease.mac);
          }
        }
      } catch (lookupError) {
        // Fall through to the normal validation error below.
      }
    }
    if (!macAddress) {
      return res.status(400).json({ error: "The router did not provide a valid client MAC address." });
    }
    const [{ router: routerRecord, plans }, activeSession, paymentsEnabled] = await Promise.all([
      captiveHotspot.listPlans(routerId, req.tenantId || null),
      captiveHotspot.findActiveSession(routerId, macAddress),
      paymentsRouter.isMpesaConfigured(),
    ]);
    res.set("Cache-Control", "no-store");
    return res.json({
      router: { name: routerRecord.name },
      mac: macAddress,
      paymentsEnabled,
      plans: plans.map((plan) => ({
        ...plan,
        price: Number(plan.price),
        quota_gb: plan.quota_gb === null ? null : Number(plan.quota_gb),
        validity_days: Number(plan.validity_days),
        validity_hours: Number(plan.validity_hours || 0),
        validity_minutes: Number(plan.validity_minutes || 0),
        validity_label: require("../services/validity").label(plan),
      })),
      activeSession: activeSession
        ? await captiveHotspot.publicSession(activeSession)
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
    let gatewayIp = req.body.gateway_ip;
    let linkLoginOnly = req.body.link_login_only;
    if (!gatewayIp || !linkLoginOnly) {
      try {
        const resolved = await captiveHotspot.resolveHotspotGateway(routerId);
        gatewayIp = gatewayIp || resolved.gateway;
        linkLoginOnly = linkLoginOnly || resolved.loginUrl;
      } catch (resolveError) {
        // Fall through to validation below for a clear client error.
      }
    }
    const { gateway, loginUrl } = captiveHotspot.validateRedirect(
      gatewayIp,
      linkLoginOnly,
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
      `SELECT id, tenant_id, name, price, validity_days, validity_hours, validity_minutes
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
    if (session.status === "authorized" && session.mac_address) {
      response.online = await captiveHotspot.isMacOnline(
        session.router_id,
        session.mac_address,
      );
    }
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

router.post("/redeem-code", async (req, res) => {
  try {
    const routerId = requireRouterId(req.body.router_id);
    const macAddress = captiveHotspot.normalizeMac(req.body.mac);
    if (!macAddress) {
      return res.status(400).json({ error: "The client MAC address is invalid." });
    }
    const session = await captiveHotspot.redeemMpesaCode({
      routerId,
      macAddress,
      code: req.body.code,
      phone: req.body.phone || "",
    });
    res.set("Cache-Control", "no-store");
    return res.json(await captiveHotspot.publicSession(session));
  } catch (error) {
    return publicError(res, error);
  }
});

router.post("/redeem-voucher", async (req, res) => {
  try {
    const routerId = requireRouterId(req.body.router_id);
    const macAddress = captiveHotspot.normalizeMac(req.body.mac);
    if (!macAddress) {
      return res.status(400).json({ error: "The client MAC address is invalid." });
    }
    const clientIp =
      normalizeClientIp(req.body.ip) ||
      normalizeClientIp(req.headers["x-forwarded-for"]) ||
      normalizeClientIp(req.ip);
    const session = await captiveHotspot.redeemVoucherCode({
      routerId,
      macAddress,
      code: req.body.code,
      clientIp,
      gatewayIp: req.body.gateway_ip,
      linkLoginOnly: req.body.link_login_only,
      originalUrl: req.body.original_url || "",
    });
    res.set("Cache-Control", "no-store");
    return res.json(await captiveHotspot.publicSession(session));
  } catch (error) {
    return publicError(res, error);
  }
});

// GET /api/captive-hotspot/analytics - Hotspot analytics summary
router.get("/analytics", async (req, res) => {
  try {
    const db = global.db;
    const tenantId = req.tenantId || null;
    const tenantFilter = tenantId ? "AND tenant_id = $1" : "";
    const params = tenantId ? [tenantId] : [];

    const [totalSessions, revenueResult, planPopularity, dailyRevenue, activeNow] =
      await Promise.all([
        db.query(
          `SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE status = 'authorized')::int AS authorized,
                  COUNT(*) FILTER (WHERE status = 'expired')::int AS expired,
                  COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended,
                  COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
           FROM captive_hotspot_sessions WHERE 1=1 ${tenantFilter}`,
          params,
        ),
        db.query(
          `SELECT COALESCE(SUM(amount), 0)::numeric AS total_revenue,
                  COUNT(*)::int AS paid_count
           FROM captive_hotspot_sessions
           WHERE status IN ('authorized', 'expired', 'suspended') ${tenantFilter}`,
          params,
        ),
        db.query(
          `SELECT p.name AS plan_name, COUNT(*)::int AS count,
                  COALESCE(SUM(s.amount), 0)::numeric AS revenue
           FROM captive_hotspot_sessions s
           JOIN service_plans p ON p.id = s.plan_id
           WHERE s.status IN ('authorized', 'expired', 'suspended') ${tenantFilter.replace("tenant_id", "s.tenant_id")}
           GROUP BY p.name ORDER BY count DESC LIMIT 10`,
          params,
        ),
        db.query(
          `SELECT DATE(paid_at) AS day, COUNT(*)::int AS sessions,
                  COALESCE(SUM(amount), 0)::numeric AS revenue
           FROM captive_hotspot_sessions
           WHERE paid_at >= CURRENT_DATE - INTERVAL '30 days' ${tenantFilter}
           GROUP BY DATE(paid_at) ORDER BY day ASC`,
          params,
        ),
        db.query(
          `SELECT COUNT(*)::int AS active_now
           FROM captive_hotspot_sessions
           WHERE status = 'authorized' AND expires_at > CURRENT_TIMESTAMP ${tenantFilter}`,
          params,
        ),
      ]);

    res.set("Cache-Control", "no-store");
    return res.json({
      overview: {
        totalSessions: totalSessions.rows[0]?.total || 0,
        authorized: totalSessions.rows[0]?.authorized || 0,
        expired: totalSessions.rows[0]?.expired || 0,
        suspended: totalSessions.rows[0]?.suspended || 0,
        pending: totalSessions.rows[0]?.pending || 0,
        activeNow: activeNow.rows[0]?.active_now || 0,
      },
      revenue: {
        totalRevenue: Number(revenueResult.rows[0]?.total_revenue || 0),
        paidCount: revenueResult.rows[0]?.paid_count || 0,
      },
      planPopularity: planPopularity.rows.map((r) => ({
        planName: r.plan_name,
        count: r.count,
        revenue: Number(r.revenue),
      })),
      dailyRevenue: dailyRevenue.rows.map((r) => ({
        day: r.day,
        sessions: r.sessions,
        revenue: Number(r.revenue),
      })),
    });
  } catch (error) {
    return publicError(res, error);
  }
});

module.exports = router;
