const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const routerConnectionManager = require("./routerConnectionManager");
const { encrypt, decrypt } = require("../utils/encryption");
const logger = require("../utils/logger");

const TOKEN_BYTES = 32;
const MAX_ORIGINAL_URL_LENGTH = 2048;

function database() {
  if (!global.dbAvailable || !global.db) {
    throw new Error("Captive hotspot payments require the PostgreSQL database.");
  }
  return global.db;
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizeMac(value) {
  const mac = String(value || "").trim().replace(/-/g, ":").toUpperCase();
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac) ? mac : null;
}

function parsePrivateIpv4(value) {
  const ip = String(value || "").trim();
  const parts = ip.split(".");
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)
  ) {
    return null;
  }
  const [first, second] = parts.map(Number);
  if (
    first === 10 ||
    first === 192 && second === 168 ||
    first === 172 && second >= 16 && second <= 31
  ) {
    return parts.map(Number).join(".");
  }
  return null;
}

function validateRedirect(gatewayIp, linkLoginOnly) {
  const gateway = parsePrivateIpv4(gatewayIp);
  if (!gateway) {
    throw Object.assign(new Error("A private IPv4 hotspot gateway address is required."), {
      statusCode: 400,
    });
  }
  let loginUrl;
  try {
    loginUrl = new URL(String(linkLoginOnly || ""));
  } catch {
    throw Object.assign(new Error("The router login URL is invalid. Re-open the Wi-Fi sign-in page."), {
      statusCode: 400,
    });
  }
  if (
    loginUrl.protocol !== "http:" ||
    loginUrl.hostname !== gateway ||
    loginUrl.port && loginUrl.port !== "80" ||
    loginUrl.pathname !== "/login" ||
    loginUrl.username ||
    loginUrl.password
  ) {
    throw Object.assign(new Error("The router login URL does not match the captured gateway."), {
      statusCode: 400,
    });
  }
  return { gateway, loginUrl: loginUrl.toString() };
}

function safeOriginalUrl(value) {
  const original = String(value || "").trim();
  if (original.length > MAX_ORIGINAL_URL_LENGTH) {
    throw Object.assign(new Error("The original URL is too long."), { statusCode: 400 });
  }
  if (!original) {
    return "";
  }
  let parsed;
  try {
    parsed = new URL(original);
  } catch {
    throw Object.assign(new Error("The original destination URL is invalid."), { statusCode: 400 });
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw Object.assign(new Error("The original destination must be an HTTP or HTTPS URL."), {
      statusCode: 400,
    });
  }
  return original;
}

function money(value) {
  const result = Number(value);
  return Number.isFinite(result) ? Math.round(result * 100) : NaN;
}

async function recordEvent(tenantId, sessionId, eventType, details = {}) {
  await database().query(
    `INSERT INTO captive_hotspot_events (tenant_id, session_id, event_type, details)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [tenantId, sessionId, eventType, JSON.stringify(details)],
  );
}

async function getRouter(routerId, tenantId) {
  const result = await database().query(
    `SELECT id, tenant_id, name, ip_address, use_tunnel, wireguard_tunnel_ip
     FROM mikrotik_connections WHERE id = $1`,
    [routerId],
  );
  const router = result.rows[0];
  if (!router || (tenantId && router.tenant_id !== tenantId)) {
    return null;
  }
  return router;
}

async function listPlans(routerId, tenantId) {
  const router = await getRouter(routerId, tenantId);
  if (!router || !router.tenant_id) {
    throw Object.assign(new Error("This hotspot router is not configured for a tenant."), {
      statusCode: 404,
    });
  }
  const result = await database().query(
    `SELECT id, name, description, speed_up, speed_down, price, quota_gb, validity_days
     FROM service_plans
     WHERE tenant_id = $1 AND is_active = true AND plan_type = 'hotspot'
       AND price > 0 AND price = TRUNC(price)
     ORDER BY price ASC, name ASC`,
    [router.tenant_id],
  );
  return { router, plans: result.rows };
}

async function findActiveSession(routerId, macAddress) {
  const result = await database().query(
    `SELECT id, status, expires_at, plan_id
     FROM captive_hotspot_sessions
     WHERE router_id = $1 AND mac_address = $2 AND status = 'authorized'
       AND expires_at > CURRENT_TIMESTAMP
     ORDER BY expires_at DESC
     LIMIT 1`,
    [routerId, macAddress],
  );
  return result.rows[0] || null;
}

async function findOpenSession(routerId, macAddress) {
  const result = await database().query(
    `SELECT id, status
     FROM captive_hotspot_sessions
     WHERE router_id = $1 AND mac_address = $2
       AND status IN ('initiating', 'pending', 'payment_confirmed', 'provisioning', 'authorization_failed')
       AND created_at > CURRENT_TIMESTAMP - INTERVAL '15 minutes'
     ORDER BY created_at DESC LIMIT 1`,
    [routerId, macAddress],
  );
  return result.rows[0] || null;
}

async function createPendingSession({
  router,
  plan,
  macAddress,
  clientIp,
  gateway,
  originalUrl,
  loginUrl,
  phone,
}) {
  const id = uuidv4();
  const token = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  const result = await database().query(
    `INSERT INTO captive_hotspot_sessions (
       id, tenant_id, router_id, plan_id, session_token_hash, mac_address,
       client_ip, gateway_ip, original_url, link_login_only, phone, amount, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'initiating')
     RETURNING id, amount, status`,
    [
      id,
      router.tenant_id,
      router.id,
      plan.id,
      tokenHash(token),
      macAddress,
      clientIp || null,
      gateway,
      originalUrl,
      loginUrl,
      phone,
      plan.price,
    ],
  );
  await recordEvent(router.tenant_id, id, "session.created", {
    routerId: router.id,
    planId: plan.id,
    macAddress,
  });
  return { ...result.rows[0], token };
}

async function attachCheckout(id, checkoutRequestId, providerResponse) {
  const result = await database().query(
    `UPDATE captive_hotspot_sessions
     SET checkout_request_id = $2, provider_response = $3::jsonb,
         status = 'pending', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'initiating'
     RETURNING id, status`,
    [id, checkoutRequestId, JSON.stringify(providerResponse || {})],
  );
  if (!result.rows[0]) {
    throw new Error("The payment session could not be linked to the M-Pesa request.");
  }
  const session = await findByCheckoutRequestId(checkoutRequestId);
  await recordEvent(session.tenant_id, session.id, "payment.requested", {
    checkoutRequestId,
  });
}

async function markInitiationFailed(id, message) {
  const result = await database().query(
    `UPDATE captive_hotspot_sessions
     SET status = 'failed', error_code = 'stk_push_failed', error_message = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'initiating'`,
    [id, String(message || "M-Pesa could not start the payment prompt.").slice(0, 500)],
  );
  if (result.rowCount) {
    const session = await database().query(
      "SELECT tenant_id FROM captive_hotspot_sessions WHERE id = $1",
      [id],
    );
    if (session.rows[0]) {
      await recordEvent(session.rows[0].tenant_id, id, "payment.push_failed", {
        error: String(message || "").slice(0, 300),
      });
    }
  }
}

async function findByCheckoutRequestId(checkoutRequestId) {
  const result = await database().query(
    "SELECT * FROM captive_hotspot_sessions WHERE checkout_request_id = $1 LIMIT 1",
    [checkoutRequestId],
  );
  return result.rows[0] || null;
}

async function findByToken(token, { routerId, macAddress, tenantId } = {}) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(String(token || ""))) {
    return null;
  }
  const result = await database().query(
    `SELECT s.*, p.name AS plan_name, p.speed_up, p.speed_down,
            p.validity_days, p.quota_gb
     FROM captive_hotspot_sessions s
     JOIN service_plans p ON p.id = s.plan_id
     WHERE s.session_token_hash = $1 LIMIT 1`,
    [tokenHash(token)],
  );
  const session = result.rows[0] || null;
  if (
    session &&
    (session.router_id !== routerId ||
      session.mac_address !== macAddress ||
      tenantId && session.tenant_id !== tenantId)
  ) {
    return null;
  }
  return session;
}

async function noteStatusCheck(id) {
  const result = await database().query(
    `UPDATE captive_hotspot_sessions
     SET last_checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND (
       last_checked_at IS NULL OR last_checked_at < CURRENT_TIMESTAMP - INTERVAL '12 seconds'
     )
     RETURNING id`,
    [id],
  );
  return result.rows.length > 0;
}

async function recordProviderFailure(checkoutRequestId, code, message, providerResponse) {
  const result = await database().query(
    `UPDATE captive_hotspot_sessions
     SET status = 'failed', error_code = $2, error_message = $3,
         provider_response = $4::jsonb, updated_at = CURRENT_TIMESTAMP
     WHERE checkout_request_id = $1 AND status IN ('pending', 'initiating')
     RETURNING id, tenant_id`,
    [
      checkoutRequestId,
      String(code || "payment_failed").slice(0, 80),
      String(message || "The payment was not completed.").slice(0, 500),
      JSON.stringify(providerResponse || {}),
    ],
  );
  if (result.rows[0]) {
    await recordEvent(result.rows[0].tenant_id, result.rows[0].id, "payment.failed", {
      code,
      message: String(message || "").slice(0, 300),
    });
  }
}

async function markPaymentConfirmed(checkoutRequestId, verification) {
  const current = await findByCheckoutRequestId(checkoutRequestId);
  if (!current) {
    return null;
  }
  if (money(verification.amount) !== money(current.amount)) {
    const result = await database().query(
      `UPDATE captive_hotspot_sessions
       SET status = 'payment_review', error_code = 'amount_mismatch',
           error_message = 'The provider-confirmed amount does not match the selected package.',
           provider_response = $2::jsonb, updated_at = CURRENT_TIMESTAMP
       WHERE checkout_request_id = $1 AND status IN ('pending', 'initiating')
       RETURNING id, tenant_id`,
      [checkoutRequestId, JSON.stringify(verification)],
    );
    if (result.rows[0]) {
      await recordEvent(result.rows[0].tenant_id, result.rows[0].id, "payment.review_required", {
        expectedAmount: Number(current.amount),
        receivedAmount: Number(verification.amount),
      });
    }
    return null;
  }
  if (!verification.mpesaReceipt) {
    return null;
  }
  const result = await database().query(
    `UPDATE captive_hotspot_sessions
     SET status = 'payment_confirmed', mpesa_receipt = $2, paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
         provider_response = $3::jsonb, error_code = NULL, error_message = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE checkout_request_id = $1 AND status IN ('pending', 'initiating')
     RETURNING *`,
    [checkoutRequestId, verification.mpesaReceipt, JSON.stringify(verification)],
  );
  if (result.rows[0]) {
    await recordEvent(result.rows[0].tenant_id, result.rows[0].id, "payment.confirmed", {
      amount: Number(result.rows[0].amount),
      receipt: verification.mpesaReceipt,
    });
  }
  return result.rows[0] || findByCheckoutRequestId(checkoutRequestId);
}

async function handleProviderVerification(checkoutRequestId, verification) {
  const current = await findByCheckoutRequestId(checkoutRequestId);
  if (!current) {
    return null;
  }
  if (
    verification.resultCode !== undefined &&
    String(verification.resultCode) !== "0"
  ) {
    await recordProviderFailure(
      checkoutRequestId,
      `mpesa_${verification.resultCode}`,
      verification.description,
      verification,
    );
    return findByCheckoutRequestId(checkoutRequestId);
  }
  if (
    verification.success &&
    verification.mpesaReceipt &&
    money(verification.amount) === money(current.amount)
  ) {
    const paid = await markPaymentConfirmed(checkoutRequestId, verification);
    return authorizePaidSession(paid);
  }
  return current;
}

function formatRate(value) {
  const rate = String(value || "").trim();
  if (!/^\d+(?:\.\d+)?[KMG]$/i.test(rate)) {
    throw new Error("The selected hotspot plan has an invalid speed limit.");
  }
  return rate;
}

async function authorizePaidSession(session) {
  if (!session || !["payment_confirmed", "authorization_failed"].includes(session.status)) {
    return session;
  }
  const username = session.hotspot_username || `wifi_${session.id.replace(/-/g, "").slice(0, 16)}`;
  const password = session.hotspot_password_encrypted
    ? decrypt(session.hotspot_password_encrypted)
    : crypto.randomBytes(18).toString("base64url");
  if (!password) {
    throw new Error("Could not recover the encrypted hotspot credentials.");
  }
  const encryptedPassword = session.hotspot_password_encrypted || encrypt(password);
  const lock = await database().query(
    `UPDATE captive_hotspot_sessions
     SET status = 'provisioning', hotspot_username = $2, hotspot_password_encrypted = $3,
         error_code = NULL, error_message = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status IN ('payment_confirmed', 'authorization_failed')
     RETURNING *`,
    [session.id, username, encryptedPassword],
  );
  const working = lock.rows[0];
  if (!working) {
    return findByCheckoutRequestId(session.checkout_request_id);
  }

  try {
    await recordEvent(working.tenant_id, working.id, "router.authorization_started", {
      routerId: working.router_id,
    });
    const planResult = await database().query(
      `SELECT speed_up, speed_down, validity_days, quota_gb, tenant_id
       FROM service_plans WHERE id = $1 AND plan_type = 'hotspot' AND is_active = true`,
      [working.plan_id],
    );
    const plan = planResult.rows[0];
    if (!plan || plan.tenant_id !== working.tenant_id) {
      throw new Error("The paid hotspot package is no longer available.");
    }
    const days = Number(plan.validity_days);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw new Error("The selected hotspot package has an invalid validity period.");
    }
    const routerManager = require("./routerConnectionManager");
    const comment = `paid-hotspot:${working.id}`;
    const existingUsers = await routerManager.print(
      working.router_id,
      "/ip/hotspot/user",
      ".id,name,comment",
    );
    const userExists = existingUsers.some((user) => user.comment === comment);
    if (!userExists) {
      const params = {
        name: username,
        password,
        "mac-address": working.mac_address,
        "limit-uptime": `${days}d`,
        "rate-limit": `${formatRate(plan.speed_up)}/${formatRate(plan.speed_down)}`,
        comment,
      };
      if (Number(plan.quota_gb) > 0) {
        params["limit-bytes-total"] = Math.floor(Number(plan.quota_gb) * 1024 ** 3);
      }
      await routerManager.executeCommand(
        working.router_id,
        "/ip/hotspot/user/add",
        params,
      );
    }
    const expiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const result = await database().query(
      `UPDATE captive_hotspot_sessions
       SET status = 'authorized', expires_at = $2, authorized_at = COALESCE(authorized_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [working.id, expiry.toISOString()],
    );
    await recordEvent(working.tenant_id, working.id, "router.authorized", {
      expiresAt: expiry.toISOString(),
      username,
    });
    return result.rows[0];
  } catch (error) {
    logger.error("Paid hotspot router authorization failed", {
      sessionId: working.id,
      routerId: working.router_id,
      error: error.message,
    });
    await database().query(
      `UPDATE captive_hotspot_sessions
       SET status = 'authorization_failed', error_code = 'router_connection_failed',
           error_message = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        working.id,
        "Payment is confirmed, but the router could not be reached. Retry authorization when it is online.",
      ],
    );
    await recordEvent(working.tenant_id, working.id, "router.authorization_failed", {
      message: error.message.slice(0, 300),
    });
    return findByCheckoutRequestId(working.checkout_request_id);
  }
}

async function listSessions({ tenantId, status = "all", search = "", limit = 25, offset = 0 }) {
  const params = [tenantId];
  const conditions = ["s.tenant_id = $1"];
  if (status !== "all") {
    params.push(status);
    conditions.push(`s.status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    const searchParam = `$${params.length}`;
    conditions.push(`(
      s.mac_address ILIKE ${searchParam}
      OR COALESCE(s.client_ip, '') ILIKE ${searchParam}
      OR COALESCE(s.phone, '') ILIKE ${searchParam}
      OR COALESCE(s.mpesa_receipt, '') ILIKE ${searchParam}
      OR p.name ILIKE ${searchParam}
      OR r.name ILIKE ${searchParam}
    )`);
  }

  const where = conditions.join(" AND ");
  const countResult = await database().query(
    `SELECT COUNT(*)::integer AS total
     FROM captive_hotspot_sessions s
    JOIN service_plans p ON p.id = s.plan_id AND p.tenant_id = s.tenant_id
    JOIN mikrotik_connections r ON r.id = s.router_id AND r.tenant_id = s.tenant_id
     WHERE ${where}`,
    params,
  );
  const pageParams = [
    ...params,
    Math.min(Math.max(Number(limit) || 25, 1), 100),
    Math.min(Math.max(Number(offset) || 0, 0), 1000000),
  ];
  const rowsResult = await database().query(
    `SELECT s.id, s.status, s.mac_address, s.client_ip, RIGHT(s.phone, 4) AS phone_last4,
            s.amount, s.mpesa_receipt, s.error_code, s.error_message,
            s.created_at, s.paid_at, s.authorized_at, s.expires_at,
            p.name AS plan_name, r.name AS router_name
     FROM captive_hotspot_sessions s
     JOIN service_plans p ON p.id = s.plan_id AND p.tenant_id = s.tenant_id
     JOIN mikrotik_connections r ON r.id = s.router_id AND r.tenant_id = s.tenant_id
     WHERE ${where}
     ORDER BY s.created_at DESC
     LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
    pageParams,
  );
  const statsResult = await database().query(
    `SELECT
       COUNT(*)::integer AS total_sessions,
       COUNT(*) FILTER (WHERE status IN ('initiating', 'pending'))::integer AS pending_count,
       COUNT(*) FILTER (WHERE status = 'authorized' AND expires_at > CURRENT_TIMESTAMP)::integer AS active_count,
       COUNT(*) FILTER (WHERE status IN ('authorization_failed', 'expiration_cleanup_failed', 'payment_review'))::integer AS attention_count,
       COALESCE(SUM(amount) FILTER (WHERE paid_at IS NOT NULL), 0)::numeric AS paid_total
     FROM captive_hotspot_sessions
     WHERE tenant_id = $1`,
    [tenantId],
  );
  return {
    sessions: rowsResult.rows,
    total: Number(countResult.rows[0]?.total || 0),
    stats: statsResult.rows[0] || {
      total_sessions: 0,
      pending_count: 0,
      active_count: 0,
      attention_count: 0,
      paid_total: 0,
    },
  };
}

async function findSessionForAdminRetry(sessionId, tenantId) {
  const result = await database().query(
    `SELECT *
     FROM captive_hotspot_sessions
     WHERE id = $1 AND tenant_id = $2
     LIMIT 1`,
    [sessionId, tenantId],
  );
  return result.rows[0] || null;
}

async function listEvents(tenantId, limit = 100, sessionId = null) {
  const result = await database().query(
    `SELECT event_type, details, created_at
     FROM captive_hotspot_events
     WHERE tenant_id = $1 AND ($2::uuid IS NULL OR session_id = $2)
     ORDER BY created_at DESC
     LIMIT $3`,
    [tenantId, sessionId, Math.min(Math.max(Number(limit) || 100, 1), 500)],
  );
  return result.rows;
}

async function publicSession(session) {
  if (!session) {
    return null;
  }
  const result = {
    status: session.status,
    error: session.error_message || null,
    amount: Number(session.amount),
    planName: session.plan_name,
  };
  if (session.status === "authorized" && session.expires_at > new Date()) {
    result.expiresAt = session.expires_at;
    result.username = session.hotspot_username;
    result.password = decrypt(session.hotspot_password_encrypted);
    result.gatewayIp = session.gateway_ip;
    result.linkLoginOnly = session.link_login_only;
    result.originalUrl = session.original_url;
  }
  return result;
}

async function expireHotspotSessions() {
  const result = await database().query(
    `WITH expired AS (
       UPDATE captive_hotspot_sessions
       SET status = 'expiration_pending', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'authorized' AND expires_at <= CURRENT_TIMESTAMP
       RETURNING *
     ), retrying AS (
       UPDATE captive_hotspot_sessions
       SET status = 'expiration_pending', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'expiration_cleanup_failed'
         AND updated_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes'
       RETURNING *
     )
     SELECT * FROM expired
     UNION ALL
     SELECT * FROM retrying`,
  );
  const routerManager = require("./routerConnectionManager");
  for (const session of result.rows) {
    try {
      const users = await routerManager.print(
        session.router_id,
        "/ip/hotspot/user",
        ".id,name,comment",
      );
      const routerUser = users.find(
        (user) => user.comment === `paid-hotspot:${session.id}`,
      );
      if (routerUser) {
        await routerManager.executeCommand(
          session.router_id,
          "/ip/hotspot/user/remove",
          { numbers: routerUser[".id"] || routerUser.id },
        );
      }
      await database().query(
        `UPDATE captive_hotspot_sessions
         SET status = 'expired', hotspot_password_encrypted = NULL,
             error_code = NULL, error_message = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [session.id],
      );
      await recordEvent(session.tenant_id, session.id, "router.access_expired", {
        routerId: session.router_id,
      });
    } catch (error) {
      logger.error("Expired hotspot access could not be removed from router", {
        sessionId: session.id,
        routerId: session.router_id,
        error: error.message,
      });
      await database().query(
        `UPDATE captive_hotspot_sessions
         SET status = 'expiration_cleanup_failed', error_code = 'router_cleanup_failed',
             error_message = 'The router could not be reached to remove expired access.',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [session.id],
      );
      await recordEvent(
        session.tenant_id,
        session.id,
        "router.expiration_cleanup_failed",
        { message: error.message.slice(0, 300) },
      );
    }
  }
}

function startExpiryWorker() {
  const timer = setInterval(() => {
    expireHotspotSessions().catch((error) => {
      logger.error("Captive hotspot expiry worker failed", {
        error: error.message,
      });
    });
  }, 30000);
  timer.unref();
  return timer;
}

module.exports = {
  normalizeMac,
  parsePrivateIpv4,
  validateRedirect,
  safeOriginalUrl,
  getRouter,
  listPlans,
  findActiveSession,
  findOpenSession,
  createPendingSession,
  attachCheckout,
  markInitiationFailed,
  findByCheckoutRequestId,
  findByToken,
  noteStatusCheck,
  recordProviderFailure,
  markPaymentConfirmed,
  handleProviderVerification,
  authorizePaidSession,
  publicSession,
  listSessions,
  findSessionForAdminRetry,
  listEvents,
  expireHotspotSessions,
  startExpiryWorker,
  money,
};
