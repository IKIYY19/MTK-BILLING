const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const routerConnectionManager = require("./routerConnectionManager");
const { encrypt, decrypt } = require("../utils/encryption");
const logger = require("../utils/logger");

const TOKEN_BYTES = 32;
const MAX_ORIGINAL_URL_LENGTH = 2048;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

/**
 * RouterOS does not always substitute $(link-login-only) into the hotspot HTML.
 * Fall back to the router's own hotspot address and build the login URL here.
 */
async function resolveHotspotGateway(routerId) {
  const manager = require("./routerConnectionManager");
  const servers = await manager.print(
    routerId,
    "/ip/hotspot",
    "name,interface,profile,disabled,invalid,ip-of-dns-name",
  );
  const server =
    servers.find((entry) => entry.disabled === "false" && entry.invalid === "false") ||
    servers.find((entry) => entry.invalid === "false");
  let gateway = server ? parsePrivateIpv4(server["ip-of-dns-name"]) : null;

  if (server && server.profile) {
    const profiles = await manager.print(routerId, "/ip/hotspot/profile", "name,hotspot-address");
    const profile = profiles.find((entry) => entry.name === server.profile);
    if (profile) {
      gateway = parsePrivateIpv4(profile["hotspot-address"]) || gateway;
    }
  }
  if (!gateway) {
    const profiles = await manager.print(routerId, "/ip/hotspot/profile", "name,hotspot-address");
    const usable = profiles.find(
      (entry) => parsePrivateIpv4(entry["hotspot-address"]) &&
        String(entry["hotspot-address"]) !== "0.0.0.0",
    );
    gateway = usable ? parsePrivateIpv4(usable["hotspot-address"]) : null;
  }
  if (!gateway) {
    throw Object.assign(
      new Error("The hotspot gateway could not be determined from the router."),
      { statusCode: 400 },
    );
  }
  return { gateway, loginUrl: `http://${gateway}/login` };
}

async function listPlans(routerId, tenantId) {
  const router = await getRouter(routerId, tenantId);
  if (!router || !router.tenant_id) {
    throw Object.assign(new Error("This hotspot router is not configured for a tenant."), {
      statusCode: 404,
    });
  }
  const result = await database().query(
    `SELECT id, name, description, speed_up, speed_down, price, quota_gb,
            validity_days, validity_hours, validity_minutes
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
    `SELECT *
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
            p.validity_days, p.validity_hours, p.validity_minutes, p.quota_gb
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
      `SELECT speed_up, speed_down, burst_limit, burst_threshold, burst_time,
              hotspot_profile, validity_days, validity_hours, validity_minutes,
              quota_gb, tenant_id
       FROM service_plans WHERE id = $1 AND plan_type = 'hotspot' AND is_active = true`,
      [working.plan_id],
    );
    const plan = planResult.rows[0];
    if (!plan || plan.tenant_id !== working.tenant_id) {
      throw new Error("The paid hotspot package is no longer available.");
    }
    const validity = require("./validity");
    const minutes = validity.totalMinutes(plan);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 365 * 1440) {
      throw new Error("The selected hotspot package has an invalid validity period.");
    }
    const validityUptime = validity.toUptime(plan);
    const routerManager = require("./routerConnectionManager");
    await ensureUnauthenticatedJump(working.router_id);
    await ensureExpiredClientRules(working.router_id);
    await unblockHotspotClient(working);
    const comment = `paid-hotspot:${working.id}`;
    const existingUsers = await routerManager.print(
      working.router_id,
      "/ip/hotspot/user",
      ".id,name,comment",
    );
    const userExists = existingUsers.some((user) => user.comment === comment);
    if (!userExists) {
      const rateLimit = require("./rateLimit").buildHotspotRateLimit(plan);
      if (!rateLimit) {
        throw new Error("The selected hotspot package has no speed limit configured.");
      }
      const profileName = await require("./hotspotProvisioning").ensureRateLimitProfile(
        working.router_id,
        rateLimit,
        plan.hotspot_profile || "default",
      );
      const params = {
        name: username,
        password,
        "mac-address": working.mac_address,
        "limit-uptime": validityUptime,
        profile: profileName,
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
    const expiry = new Date(Date.now() + minutes * 60 * 1000);
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
    // Send SMS notification (non-blocking)
    try {
      const notificationService = require("./notificationService");
      const planResult2 = await database().query(
        `SELECT name, price FROM service_plans WHERE id = $1`,
        [working.plan_id],
      );
      const planName = planResult2.rows[0]?.name || "Hotspot";
      const phone = working.phone || "";
      if (phone) {
        notificationService
          .triggerSMS("hotspot_payment_received", {
            customer: { phone },
            planName,
            expiresAt: expiry.toISOString(),
            username,
          })
          .catch(() => {});
      }
    } catch (smsErr) {
      // Non-fatal
    }
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

/**
 * DB status is the payment/authorization state. Live presence comes from the
 * router's /ip/hotspot/active table for the matching MAC or generated user.
 */
async function enrichSessionsWithRouterState(sessions) {
  if (!sessions.length) {return sessions;}
  const manager = require("./routerConnectionManager");
  const byRouter = new Map();
  for (const session of sessions) {
    if (!byRouter.has(session.router_id)) {byRouter.set(session.router_id, []);}
    byRouter.get(session.router_id).push(session);
  }
  for (const [routerId, group] of byRouter.entries()) {
    let active = [];
    try {
      active = await manager.print(
        routerId,
        "/ip/hotspot/active",
        ".id,user,address,mac-address,uptime,bytes-in,bytes-out",
      );
    } catch (error) {
      logger.debug("Hotspot active lookup failed", { routerId, error: error.message });
    }
    for (const session of group) {
      session.validity_label = require("./validity").label(session);
      const mac = String(session.mac_address || "").toLowerCase();
      const match = active.find((entry) => {
        const entryMac = String(entry["mac-address"] || "").toLowerCase();
        return (mac && entryMac === mac) ||
          (session.hotspot_username && entry.user === session.hotspot_username);
      });
      session.online = Boolean(match);
      session.active_uptime = match?.uptime || null;
      session.active_address = match?.address || null;
      session.bytes_in = match?.["bytes-in"] || null;
      session.bytes_out = match?.["bytes-out"] || null;
      session.code_type = session.code_source === "voucher" ? "Voucher" : "M-Pesa";
    }
  }
  return sessions;
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
    `SELECT s.id, s.status, s.mac_address, s.client_ip, s.phone,
            RIGHT(s.phone, 4) AS phone_last4,
            s.amount, s.mpesa_receipt, s.provider_response->>'source' AS code_source,
            s.checkout_request_id, s.error_code, s.error_message,
            s.created_at, s.paid_at, s.authorized_at, s.expires_at, s.last_checked_at,
            s.suspended_at, s.suspend_reason, s.renewal_count,
            s.hotspot_username, s.router_id,
            p.name AS plan_name, p.speed_up, p.speed_down, p.validity_days,
            p.validity_hours, p.validity_minutes,
            r.name AS router_name
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
       COUNT(*) FILTER (WHERE status = 'suspended')::integer AS suspended_count,
       COUNT(*) FILTER (WHERE status = 'authorized' AND expires_at > CURRENT_TIMESTAMP
         AND expires_at <= CURRENT_TIMESTAMP + INTERVAL '1 hour')::integer AS expiring_soon_count,
       COALESCE(SUM(amount) FILTER (WHERE paid_at IS NOT NULL), 0)::numeric AS paid_total
     FROM captive_hotspot_sessions
     WHERE tenant_id = $1`,
    [tenantId],
  );
  const sessions = await enrichSessionsWithRouterState(rowsResult.rows);
  const stats = statsResult.rows[0] || {
    total_sessions: 0,
    pending_count: 0,
    active_count: 0,
    attention_count: 0,
    suspended_count: 0,
    expiring_soon_count: 0,
    paid_total: 0,
  };
  try {
    const liveRows = await database().query(
      `SELECT id, router_id, mac_address, hotspot_username
       FROM captive_hotspot_sessions
       WHERE tenant_id = $1 AND status = 'authorized' AND expires_at > CURRENT_TIMESTAMP
       LIMIT 500`,
      [tenantId],
    );
    const live = await enrichSessionsWithRouterState(liveRows.rows);
    stats.online_count = live.filter((entry) => entry.online).length;
  } catch (error) {
    stats.online_count = 0;
  }
  return {
    sessions,
    total: Number(countResult.rows[0]?.total || 0),
    stats,
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

async function removeRouterHotspotUser(session) {
  const routerManager = require("./routerConnectionManager");
  const comment = `paid-hotspot:${session.id}`;
  const users = await routerManager.print(
    session.router_id,
    "/ip/hotspot/user",
    ".id,name,comment",
  );
  const user = users.find(
    (entry) => entry.comment === comment ||
      (session.hotspot_username && entry.name === session.hotspot_username),
  );
  if (user) {
    await routerManager.executeCommand(session.router_id, "/ip/hotspot/user/remove", {
      numbers: user[".id"] || user.id,
    });
    return user.name;
  }
  return null;
}

async function kickHotspotClient(session) {
  const routerManager = require("./routerConnectionManager");
  const active = await routerManager
    .print(session.router_id, "/ip/hotspot/active", ".id,user,address,mac-address")
    .catch(() => []);
  const match = active.find((entry) => {
    const mac = String(entry["mac-address"] || "").toLowerCase();
    return (session.hotspot_username && entry.user === session.hotspot_username) ||
      (session.client_ip && entry.address === session.client_ip) ||
      (session.mac_address && mac === session.mac_address.toLowerCase());
  });
  if (match) {
    await routerManager
      .executeCommand(session.router_id, "/ip/hotspot/active/remove", {
        numbers: match[".id"] || match.id,
      })
      .catch(() => {});
    return true;
  }
  return false;
}

/**
 * Established connections are accepted by the router's generic firewall rules
 * before the hotspot jump. Dropping the hotspot user alone therefore does not
 * stop traffic that was already flowing when the voucher expired.
 */
async function clearClientConnections(session) {
  if (!session.client_ip && !session.mac_address) {return 0;}
  const manager = require("./routerConnectionManager");
  const connections = await manager
    .print(session.router_id, "/ip/firewall/connection")
    .catch(() => []);
  const ids = connections
    .filter((entry) => {
      const addresses = [
        entry["src-address"],
        entry["dst-address"],
        entry["reply-src-address"],
        entry["reply-dst-address"],
      ].filter(Boolean);
      return addresses.includes(session.client_ip);
    })
    .map((entry) => entry[".id"] || entry.id)
    .filter(Boolean);
  let removed = 0;
  // Connection IDs are short-lived; remove them one by one so an entry that
  // expires between print and remove does not abort the whole cleanup.
  for (const id of ids) {
    try {
      await manager.executeCommand(session.router_id, "/ip/firewall/connection/remove", {
        numbers: id,
      });
      removed++;
    } catch {
      // The connection already closed; nothing left to clear.
    }
  }
  return removed;
}

async function removeHotspotHost(session) {
  const manager = require("./routerConnectionManager");
  const hosts = await manager
    .print(session.router_id, "/ip/hotspot/host", ".id,mac-address,address")
    .catch(() => []);
  const mac = normalizeMac(session.mac_address);
  const matches = hosts.filter((host) => {
    const hostMac = normalizeMac(host["mac-address"] || host.mac);
    return (mac && hostMac === mac) ||
      (session.client_ip && host.address === session.client_ip);
  });
  let removed = 0;
  for (const host of matches) {
    try {
      await manager.executeCommand(session.router_id, "/ip/hotspot/host/remove", {
        numbers: host[".id"] || host.id,
      });
      removed++;
    } catch {
      // The host entry may already have timed out; nothing left to clear.
    }
  }
  return removed;
}

const EXPIRED_HOTSPOT_LIST = "billing-expired-hotspot";
const PORTAL_HOST_LIST = "billing-portal-hosts";
const IS_IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

async function removeAddressListEntries(routerId, list, predicate) {
  const manager = require("./routerConnectionManager");
  const entries = await manager
    .print(routerId, "/ip/firewall/address-list", ".id,address,list,comment")
    .catch(() => []);
  let removed = 0;
  for (const entry of entries) {
    if (entry.list !== list || !predicate(entry)) {continue;}
    try {
      await manager.executeCommand(routerId, "/ip/firewall/address-list/remove", {
        numbers: entry[".id"] || entry.id,
      });
      removed++;
    } catch {
      // Already removed by another process.
    }
  }
  return removed;
}

async function blockExpiredClient(session) {
  if (!session.client_ip || !IS_IPV4.test(session.client_ip)) {return false;}
  const manager = require("./routerConnectionManager");
  await removeAddressListEntries(
    session.router_id,
    EXPIRED_HOTSPOT_LIST,
    (entry) => entry.address === session.client_ip ||
      entry.comment === `expired-hotspot:${session.id}`,
  );
  await manager.executeCommand(session.router_id, "/ip/firewall/address-list/add", {
    address: session.client_ip,
    list: EXPIRED_HOTSPOT_LIST,
    comment: `expired-hotspot:${session.id}`,
    timeout: "1d",
  });
  return true;
}

async function unblockHotspotClient(session) {
  if (!session.client_ip && !session.mac_address) {return 0;}
  return removeAddressListEntries(
    session.router_id,
    EXPIRED_HOTSPOT_LIST,
    (entry) => entry.comment === `expired-hotspot:${session.id}` ||
      (session.client_ip && entry.address === session.client_ip),
  );
}

async function forceClientOffline(session) {
  const steps = [
    ["Router user removal", () => removeRouterHotspotUser(session)],
    ["Client disconnect", () => kickHotspotClient(session)],
    ["Expired client block", () => blockExpiredClient(session)],
    ["Connection cleanup", () => clearClientConnections(session)],
    ["Hotspot host cleanup", () => removeHotspotHost(session)],
  ];
  const errors = [];
  for (const [label, action] of steps) {
    try { await action(); }
    catch (error) { errors.push(`${label}: ${error.message}`); }
  }
  if (errors.length) {
    throw new Error(errors.join("; ").slice(0, 500));
  }
}

const UNAUTH_JUMP_COMMENTS = [
  { comment: "billing-hotspot-unauth-first", matcher: "from-client,!auth", target: "hs-unauth" },
  { comment: "billing-hotspot-unauth-to-first", matcher: "to-client,!auth", target: "hs-unauth-to" },
];

async function ensureUnauthenticatedJump(routerId) {
  const manager = require("./routerConnectionManager");
  const rules = await manager
    .print(routerId, "/ip/firewall/filter", ".id,chain,action,jump-target,hotspot,comment")
    .catch(() => []);
  // RouterOS creates its own hs-unauth jumps, but they sit below the generic
  // established-connection accept. Without these early rules, reply traffic
  // to an expired client is still accepted from the connection tracker.
  let added = 0;
  for (const ruleSpec of UNAUTH_JUMP_COMMENTS) {
    if (rules.some((rule) => rule.comment === ruleSpec.comment)) {continue;}
    await manager.executeCommand(routerId, "/ip/firewall/filter/add", {
      chain: "forward",
      action: "jump",
      "jump-target": ruleSpec.target,
      hotspot: ruleSpec.matcher,
      "place-before": rules[0]?.[".id"] || rules[0]?.id || "0",
      comment: ruleSpec.comment,
    });
    added++;
  }
  return added;
}

/**
 * Legacy RouterOS configurations often allow Google/Cloudflare hosts through
 * /ip/hotspot/walled-garden/ip. That creates dynamic hs-unauth return rules,
 * so apps keep working after a voucher expires even though the hotspot user is
 * gone. The billing portal is provisioned in /ip/hotspot/walled-garden, so
 * hostname-based IP garden rules are never needed here.
 */
async function sanitizeHotspotWalledGarden(routerId) {
  const manager = require("./routerConnectionManager");
  const rows = await manager
    .print(routerId, "/ip/hotspot/walled-garden/ip", ".id,dst-host,action,comment")
    .catch(() => []);
  const targets = rows.filter((row) => {
    const action = String(row.action || "accept").toLowerCase();
    return row["dst-host"] && (action === "accept" || action === "allow");
  });
  let removed = 0;
  for (const row of targets) {
    try {
      await manager.executeCommand(routerId, "/ip/hotspot/walled-garden/ip/remove", {
        numbers: row[".id"] || row.id,
      });
      removed++;
    } catch {
      // The rule may have been removed outside the API; ignore it.
    }
  }
  if (removed) {
    await manager.executeCommand(routerId, "/ip/dns/cache/flush", {}).catch(() => {});
  }
  return removed;
}

const EXPIRED_RULE_SPECS = [
  {
    comment: "billing-expired-portal-out",
    params: { chain: "forward", action: "accept", "dst-address-list": PORTAL_HOST_LIST },
  },
  {
    comment: "billing-expired-portal-in",
    params: { chain: "forward", action: "accept", "src-address-list": PORTAL_HOST_LIST },
  },
  {
    comment: "billing-expired-block-out",
    params: { chain: "forward", action: "reject", "src-address-list": EXPIRED_HOTSPOT_LIST },
  },
  {
    comment: "billing-expired-block-in",
    params: { chain: "forward", action: "reject", "dst-address-list": EXPIRED_HOTSPOT_LIST },
  },
];

async function resolvePortalAddresses(routerId) {
  const manager = require("./routerConnectionManager");
  const addresses = new Set();
  const rules = await manager
    .print(routerId, "/ip/firewall/filter", ".id,chain,action,src-address,dst-address,comment")
    .catch(() => []);
  for (const rule of rules) {
    if (!/billing server|portal/i.test(String(rule.comment || ""))) {continue;}
    for (const address of [rule["dst-address"], rule["src-address"]]) {
      if (IS_IPV4.test(String(address || ""))) {addresses.add(address);}
    }
  }
  const garden = await manager
    .print(routerId, "/ip/hotspot/walled-garden", "dst-host,comment")
    .catch(() => []);
  for (const row of garden) {
    if (!/portal|billing/i.test(String(row.comment || ""))) {continue;}
    if (IS_IPV4.test(String(row["dst-host"] || ""))) {addresses.add(row["dst-host"]);}
  }
  for (const key of ["VITE_PUBLIC_APP_URL", "VITE_API_URL", "APP_URL"]) {
    try {
      const url = new URL(process.env[key] || "");
      if (IS_IPV4.test(url.hostname)) {addresses.add(url.hostname);}
    } catch {
      // Unset or invalid URL; the router rules above are enough.
    }
  }
  if (!addresses.size) {addresses.add("192.168.100.8");}
  return [...addresses];
}

async function ensureExpiredClientRules(routerId) {
  const manager = require("./routerConnectionManager");
  const addresses = await resolvePortalAddresses(routerId);
  await removeAddressListEntries(
    routerId,
    PORTAL_HOST_LIST,
    (entry) => String(entry.comment || "").startsWith("billing-portal-host"),
  );
  for (const address of addresses) {
    await manager.executeCommand(routerId, "/ip/firewall/address-list/add", {
      address,
      list: PORTAL_HOST_LIST,
      comment: `billing-portal-host:${address}`,
    }).catch(() => {});
  }

  const ownedComments = new Set(EXPIRED_RULE_SPECS.map((spec) => spec.comment));
  const expected = EXPIRED_RULE_SPECS.map((spec) => spec.comment);
  let rules = await manager
    .print(routerId, "/ip/firewall/filter", ".id,chain,action,comment")
    .catch(() => []);
  const current = rules.filter((rule) => ownedComments.has(rule.comment)).map((rule) => rule.comment);
  const ordered = current.length === expected.length &&
    expected.every((comment, index) => current[index] === comment);
  if (ordered) {return false;}

  for (const rule of rules) {
    if (!ownedComments.has(rule.comment)) {continue;}
    await manager.executeCommand(routerId, "/ip/firewall/filter/remove", {
      numbers: rule[".id"] || rule.id,
    }).catch(() => {});
  }
  rules = await manager
    .print(routerId, "/ip/firewall/filter", ".id,chain,action,comment")
    .catch(() => []);
  const anchor = rules[0]?.[".id"] || rules[0]?.id;
  // Each new rule goes immediately before the same anchor, so adding in this
  // order leaves portal allows ahead of the expired-client blocks.
  for (const spec of EXPIRED_RULE_SPECS) {
    const params = { ...spec.params };
    if (anchor) {params["place-before"] = anchor;}
    await manager.executeCommand(routerId, "/ip/firewall/filter/add", {
      ...params,
      comment: spec.comment,
    });
  }
  return true;
}

async function ensureHotspotEnforcement() {
  const rows = await database().query(
    "SELECT id FROM mikrotik_connections WHERE is_online = true",
  ).catch(() => ({ rows: [] }));
  for (const row of rows.rows) {
    try { await ensureUnauthenticatedJump(row.id); }
    catch (error) {
      logger.warn("Could not install hotspot unauthenticated firewall jump", {
        routerId: row.id,
        error: error.message,
      });
    }
    try { await ensureExpiredClientRules(row.id); }
    catch (error) {
      logger.warn("Could not install expired hotspot firewall rules", {
        routerId: row.id,
        error: error.message,
      });
    }
    try { await sanitizeHotspotWalledGarden(row.id); }
    catch (error) {
      logger.warn("Could not clean hotspot walled garden", {
        routerId: row.id,
        error: error.message,
      });
    }
  }
}

async function suspendHotspotSession(sessionId, tenantId, reason = "") {
  const session = await findSessionForAdminRetry(sessionId, tenantId);
  if (!session) {
    throw Object.assign(new Error("The hotspot session was not found."), { statusCode: 404 });
  }
  if (!["authorized", "provisioning", "payment_confirmed", "authorization_failed"].includes(session.status)) {
    throw Object.assign(
      new Error("Only active or provisioned sessions can be suspended."),
      { statusCode: 409 },
    );
  }
  const errors = await forceClientOffline(session).then(() => []).catch((error) => [error.message]);

  const result = await database().query(
    `UPDATE captive_hotspot_sessions
     SET status = 'suspended', suspended_at = CURRENT_TIMESTAMP,
         suspend_reason = $3,
         error_code = NULL, error_message = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [sessionId, tenantId, String(reason || "").trim().slice(0, 200) || null],
  );
  await recordEvent(session.tenant_id, sessionId, "admin.suspended", {
    routerId: session.router_id,
    mac: session.mac_address,
    reason: String(reason || "").trim().slice(0, 200),
    errors,
  });
  return result.rows[0];
}

async function renewHotspotSession(sessionId, tenantId) {
  const session = await findSessionForAdminRetry(sessionId, tenantId);
  if (!session) {
    throw Object.assign(new Error("The hotspot session was not found."), { statusCode: 404 });
  }
  if (!["authorized", "suspended", "expired", "expiration_cleanup_failed"].includes(session.status)) {
    throw Object.assign(
      new Error("Only authorized, suspended or expired sessions can be renewed."),
      { statusCode: 409 },
    );
  }
  const planResult = await database().query(
    `SELECT * FROM service_plans
     WHERE id = $1 AND tenant_id = $2 AND plan_type = 'hotspot' AND is_active = true`,
    [session.plan_id, tenantId],
  );
  const plan = planResult.rows[0];
  if (!plan) {
    throw Object.assign(new Error("The package for this session is no longer available."), { statusCode: 404 });
  }
  const validity = require("./validity");
  const minutes = validity.totalMinutes(plan);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 365 * 1440) {
    throw Object.assign(new Error("The package has an invalid validity period."), { statusCode: 400 });
  }
  const validityUptime = validity.toUptime(plan);

  const username = session.hotspot_username || `wifi_${session.id.replace(/-/g, "").slice(0, 16)}`;
  const password = session.hotspot_password_encrypted
    ? decrypt(session.hotspot_password_encrypted)
    : crypto.randomBytes(18).toString("base64url");
  const encryptedPassword = encrypt(password);

  const routerManager = require("./routerConnectionManager");
  await ensureUnauthenticatedJump(session.router_id);
  await ensureExpiredClientRules(session.router_id);
  await unblockHotspotClient(session);
  await removeRouterHotspotUser(session);
  const rateLimit = require("./rateLimit").buildHotspotRateLimit(plan);
  if (!rateLimit) {
    throw Object.assign(new Error("The package has no speed limit configured."), { statusCode: 400 });
  }
  const profileName = await require("./hotspotProvisioning").ensureRateLimitProfile(
    session.router_id,
    rateLimit,
    plan.hotspot_profile || "default",
  );
  const params = {
    name: username,
    password,
    "mac-address": session.mac_address,
    "limit-uptime": validityUptime,
    profile: profileName,
    comment: `paid-hotspot:${session.id}`,
  };
  if (Number(plan.quota_gb) > 0) {
    params["limit-bytes-total"] = Math.floor(Number(plan.quota_gb) * 1024 ** 3);
  }
  await routerManager.executeCommand(session.router_id, "/ip/hotspot/user/add", params);
  // Drop any stale active session so the client re-authenticates with the
  // renewed user and picks up the new validity/speed immediately.
  await kickHotspotClient(session);

  const expiry = new Date(Date.now() + minutes * 60 * 1000);
  const result = await database().query(
    `UPDATE captive_hotspot_sessions
     SET status = 'authorized', suspended_at = NULL, suspend_reason = NULL, expires_at = $3,
         authorized_at = COALESCE(authorized_at, CURRENT_TIMESTAMP),
         renewal_count = COALESCE(renewal_count, 0) + 1,
         hotspot_username = $4, hotspot_password_encrypted = $5,
         error_code = NULL, error_message = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [sessionId, tenantId, expiry.toISOString(), username, encryptedPassword],
  );
  await recordEvent(tenantId, sessionId, "admin.renewed", {
    expiresAt: expiry.toISOString(),
    validityMinutes: minutes,
    uptime: validityUptime,
    username,
  });
  return result.rows[0];
}

async function deleteHotspotSession(sessionId, tenantId) {
  const session = await findSessionForAdminRetry(sessionId, tenantId);
  if (!session) {
    throw Object.assign(new Error("The hotspot session was not found."), { statusCode: 404 });
  }
  const errors = await forceClientOffline(session).then(() => []).catch((error) => [error.message]);
  await database().query(
    "DELETE FROM captive_hotspot_events WHERE session_id = $1 AND tenant_id = $2",
    [sessionId, tenantId],
  );
  await database().query(
    "DELETE FROM captive_hotspot_sessions WHERE id = $1 AND tenant_id = $2",
    [sessionId, tenantId],
  );
  return { success: true, errors };
}

async function bulkSessionAction(ids, tenantId, action, reason = "") {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw Object.assign(new Error("Select at least one session."), { statusCode: 400 });
  }
  const unique = [...new Set(ids.filter((id) => UUID_PATTERN.test(String(id))))].slice(0, 100);
  if (unique.length === 0) {
    throw Object.assign(new Error("No valid sessions were selected."), { statusCode: 400 });
  }
  const results = [];
  for (const id of unique) {
    try {
      let result;
      if (action === "suspend") {result = await suspendHotspotSession(id, tenantId, reason);}
      else if (action === "renew") {result = await renewHotspotSession(id, tenantId);}
      else if (action === "delete") {result = await deleteHotspotSession(id, tenantId);}
      else {
        throw Object.assign(new Error("Unknown bulk action."), { statusCode: 400 });
      }
      results.push({ id, success: true, status: result.status || "deleted" });
    } catch (error) {
      results.push({ id, success: false, error: error.message });
    }
  }
  return {
    total: results.length,
    succeeded: results.filter((entry) => entry.success).length,
    failed: results.filter((entry) => !entry.success).length,
    results,
  };
}

/**
 * Re-apply a saved hotspot plan's speed/quota to every currently authorized
 * hotspot user on that plan, and kick their live session so the new rate takes
 * effect immediately. Called when a plan is edited from the admin UI.
 */
async function isMacOnline(routerId, macAddress) {
  const manager = require("./routerConnectionManager");
  const active = await manager
    .print(routerId, "/ip/hotspot/active", ".id,user,address,mac-address")
    .catch(() => []);
  const mac = String(macAddress || "").toLowerCase();
  return active.some(
    (entry) => String(entry["mac-address"] || "").toLowerCase() === mac,
  );
}

async function syncActiveSessionsToPlan(planId) {
  const result = { total: 0, synced: 0, failed: 0, kicked: 0, errors: [] };
  const db = database();
  const planResult = await db.query(
    `SELECT * FROM service_plans
     WHERE id = $1 AND plan_type = 'hotspot' AND is_active = true`,
    [planId],
  );
  const plan = planResult.rows[0];
  if (!plan) {return result;}

  const sessions = await db.query(
    `SELECT * FROM captive_hotspot_sessions
     WHERE plan_id = $1 AND status = 'authorized' AND expires_at > CURRENT_TIMESTAMP`,
    [planId],
  );
  result.total = sessions.rows.length;
  if (!result.total) {return result;}

  const rateLimit = require("./rateLimit").buildHotspotRateLimit(plan);
  if (!rateLimit) {
    result.failed = result.total;
    result.errors.push("The plan has no valid speed limit.");
    return result;
  }

  const manager = require("./routerConnectionManager");
  for (const session of sessions.rows) {
    try {
      const profileName = await require("./hotspotProvisioning").ensureRateLimitProfile(
        session.router_id,
        rateLimit,
        plan.hotspot_profile || "default",
      );
      const users = await manager.print(session.router_id, "/ip/hotspot/user", ".id,name,comment");
      const user = users.find((entry) => entry.comment === `paid-hotspot:${session.id}`);
      if (!user) {
        result.failed += 1;
        result.errors.push({ mac: session.mac_address, error: "Router hotspot user not found" });
        continue;
      }
      const params = { numbers: user[".id"] || user.id, profile: profileName };
      if (Number(plan.quota_gb) > 0) {
        params["limit-bytes-total"] = String(Math.floor(Number(plan.quota_gb) * 1024 ** 3));
      }
      await manager.executeCommand(session.router_id, "/ip/hotspot/user/set", params);

      const kicked = await kickHotspotClient(session);
      if (kicked) {result.kicked += 1;}
      result.synced += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({ mac: session.mac_address, error: error.message });
    }
  }
  return result;
}

async function findExpiringSessions(tenantId, withinMinutes = 60) {
  const result = await database().query(
    `SELECT s.id, s.mac_address, s.phone, s.amount, s.expires_at,
            p.name AS plan_name, r.name AS router_name
     FROM captive_hotspot_sessions s
     JOIN service_plans p ON p.id = s.plan_id AND p.tenant_id = s.tenant_id
     JOIN mikrotik_connections r ON r.id = s.router_id AND r.tenant_id = s.tenant_id
     WHERE s.tenant_id = $1 AND s.status = 'authorized'
       AND s.expires_at > CURRENT_TIMESTAMP
       AND s.expires_at <= CURRENT_TIMESTAMP + ($2::integer * INTERVAL '1 minute')
       AND NOT EXISTS (
         SELECT 1 FROM captive_hotspot_events e
         WHERE e.session_id = s.id AND e.event_type = 'expiry.warning'
       )
     ORDER BY s.expires_at ASC`,
    [tenantId, Math.min(Math.max(Number(withinMinutes) || 60, 1), 1440)],
  );
  return result.rows;
}

async function listEvents(tenantId, limit = 100, sessionId = null) {
  const result = await database().query(
    `SELECT session_id, event_type, details, created_at
     FROM captive_hotspot_events
     WHERE tenant_id = $1 AND ($2::uuid IS NULL OR session_id = $2)
     ORDER BY created_at DESC
     LIMIT $3`,
    [tenantId, sessionId, Math.min(Math.max(Number(limit) || 100, 1), 500)],
  );
  return result.rows;
}

/**
 * Redeem an M-Pesa confirmation code (receipt) that the client received by SMS.
 * The Daraja callback normally confirms payments automatically; this path lets a
 * customer finish manually when the callback or auto-detection did not complete.
 */
async function redeemMpesaCode({ routerId, macAddress, code, phone = "" }) {
  const receipt = String(code || "").replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z0-9]{6,30}$/.test(receipt)) {
    throw Object.assign(new Error("Enter a valid M-Pesa confirmation code."), {
      statusCode: 400,
    });
  }

  // A client-supplied code is only a claim. It is accepted only when it matches
  // a receipt that this server already recorded for this exact device/router.
  // The optional phone number is an additional check, never an alternative path.
  const params = [routerId, macAddress, receipt];
  let phoneClause = "";
  const normalizedPhone = String(phone || "").replace(/\D/g, "");
  if (normalizedPhone.length >= 9) {
    params.push(`%${normalizedPhone.slice(-9)}`);
    phoneClause = ` AND (phone LIKE $${params.length} OR phone IS NULL)`;
  }

  const result = await database().query(
    `SELECT * FROM captive_hotspot_sessions
     WHERE router_id = $1 AND mac_address = $2
       AND upper(replace(coalesce(mpesa_receipt, ''), ' ', '')) = $3
       AND status IN ('pending', 'initiating', 'payment_confirmed', 'authorization_failed')
       ${phoneClause}
     ORDER BY created_at DESC LIMIT 1`,
    params,
  );
  const session = result.rows[0];
  if (!session) {
    throw Object.assign(
      new Error("That code was not found for this device. Check the code and try again."),
      { statusCode: 404 },
    );
  }

  if (["pending", "initiating"].includes(session.status)) {
    const confirmed = await database().query(
      `UPDATE captive_hotspot_sessions
       SET status = 'payment_confirmed', paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
           error_code = NULL, error_message = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status IN ('pending', 'initiating') RETURNING *`,
      [session.id],
    );
    if (confirmed.rows[0]) {
      await recordEvent(confirmed.rows[0].tenant_id, confirmed.rows[0].id, "payment.confirmed", {
        amount: Number(confirmed.rows[0].amount),
        receipt,
        source: "client_code",
      });
    }
  }

  return authorizePaidSession(
    await findByCheckoutRequestId(session.checkout_request_id) || session,
  );
}

/**
 * Redeem a code-only voucher. The code is claimed atomically for this device,
 * then the same authorization path as a paid package provisions the RouterOS
 * hotspot user with the voucher plan's speed and validity.
 */
async function redeemVoucherCode({
  routerId,
  macAddress,
  code,
  clientIp = "",
  gatewayIp,
  linkLoginOnly,
  originalUrl = "",
}) {
  const normalized = String(code || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!/^[A-Z0-9-]{4,64}$/.test(normalized)) {
    throw Object.assign(new Error("Enter a valid voucher code."), {
      statusCode: 400,
    });
  }

  const db = database();
  const found = await db.query(
    `SELECT * FROM hotspot_vouchers
     WHERE upper(replace(coalesce(code, ''), ' ', '')) = $1
       AND coalesce(status, 'unused') = 'unused'
       AND (connection_id = $2 OR connection_id IS NULL)
     ORDER BY created_at DESC LIMIT 1`,
    [normalized, routerId],
  );
  const voucher = found.rows[0];
  if (!voucher) {
    throw Object.assign(
      new Error("That voucher code is invalid, already used, or not for this network."),
      { statusCode: 404 },
    );
  }
  if (!voucher.plan_id) {
    throw Object.assign(new Error("This voucher is not linked to a package."), {
      statusCode: 400,
    });
  }

  const planResult = await db.query(
    `SELECT s.* FROM service_plans s
     JOIN mikrotik_connections c ON c.id = $2
     WHERE s.id = $1 AND s.plan_type = 'hotspot' AND s.is_active = true
       AND s.tenant_id = c.tenant_id`,
    [voucher.plan_id, routerId],
  );
  const plan = planResult.rows[0];
  if (!plan) {
    throw Object.assign(new Error("The package for this voucher is no longer available."), {
      statusCode: 404,
    });
  }

  // Always use the router's own hotspot address and login URL. The captive
  // browser often supplies $(link-login-only) with a different hostname
  // (e.g. hot.spot) or port, which must not be trusted for the auto-connect
  // form action.
  const resolved = await resolveHotspotGateway(routerId);
  const gateway = parsePrivateIpv4(gatewayIp) || resolved.gateway;
  const loginUrl = resolved.loginUrl;
  const original = safeOriginalUrl(originalUrl);

  const claimed = await db.query(
    `UPDATE hotspot_vouchers
     SET status = 'redeemed', redeemed_at = CURRENT_TIMESTAMP, redeemed_mac = $1
     WHERE id = $2 AND coalesce(status, 'unused') = 'unused' RETURNING *`,
    [macAddress, voucher.id],
  );
  if (!claimed.rows[0]) {
    throw Object.assign(new Error("That voucher code was just used. Try another code."), {
      statusCode: 409,
    });
  }

  // Auto-renew: if this device already has a paid session that was suspended
  // or has expired, extending it avoids duplicate users on the router.
  const existing = await db.query(
    `SELECT * FROM captive_hotspot_sessions
     WHERE router_id = $1 AND mac_address = $2 AND tenant_id = $3
       AND status IN ('authorized', 'suspended', 'expired', 'expiration_cleanup_failed')
     ORDER BY created_at DESC LIMIT 1`,
    [routerId, macAddress, plan.tenant_id],
  );
  if (existing.rows[0]) {
    const renewed = await renewHotspotSession(existing.rows[0].id, plan.tenant_id);
    await recordEvent(plan.tenant_id, renewed.id, "payment.renewed_via_voucher", {
      receipt: voucher.code,
      voucherId: voucher.id,
    });
    return renewed;
  }

  const session = await createPendingSession({
    router: { id: routerId, tenant_id: plan.tenant_id },
    plan,
    macAddress,
    clientIp,
    gateway,
    originalUrl: original,
    loginUrl,
    phone: "voucher",
  });
  await db.query(
    `UPDATE captive_hotspot_sessions
     SET status = 'payment_confirmed', mpesa_receipt = $1, paid_at = CURRENT_TIMESTAMP,
         provider_response = $2::jsonb, error_code = NULL, error_message = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [
      voucher.code,
      JSON.stringify({ source: "voucher", voucherId: voucher.id }),
      session.id,
    ],
  );
  await recordEvent(plan.tenant_id, session.id, "payment.confirmed", {
    amount: Number(plan.price || 0),
    receipt: voucher.code,
    source: "voucher",
  });

  const current = await findByToken(session.token, { routerId, macAddress });
  return authorizePaidSession(current);
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
       WHERE status IN ('expiration_cleanup_failed', 'expiration_pending')
         AND updated_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes'
       RETURNING *
     )
     SELECT * FROM expired
     UNION ALL
     SELECT * FROM retrying`,
  );
  for (const session of result.rows) {
    try {
      await forceClientOffline(session);
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
      // Send SMS notification (non-blocking)
      try {
        const notificationService = require("./notificationService");
        const phone = session.phone || "";
        if (phone && phone !== "voucher" && /^254/.test(phone)) {
          notificationService
            .triggerSMS("hotspot_access_expired", {
              customer: { phone },
              planName: session.plan_name || "Hotspot",
            })
            .catch(() => {});
        }
      } catch (smsErr) {
        // Non-fatal
      }
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

async function reconcileStaleExpirations() {
  // A crash between marking a session expiration_pending and removing the
  // RouterOS user would otherwise strand it forever. Make those rows eligible
  // for the existing cleanup retry path on startup.
  await database().query(
    `UPDATE captive_hotspot_sessions
     SET status = 'expiration_cleanup_failed',
         updated_at = CURRENT_TIMESTAMP - INTERVAL '6 minutes'
     WHERE status = 'expiration_pending'`,
  );
}

function startExpiryWorker() {
  ensureHotspotEnforcement().catch((error) => {
    logger.error("Hotspot firewall enforcement setup failed", {
      error: error.message,
    });
  });
  reconcileStaleExpirations().catch((error) => {
    logger.error("Captive hotspot expiry reconciliation failed", {
      error: error.message,
    });
  });
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
  resolveHotspotGateway,
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
  redeemMpesaCode,
  redeemVoucherCode,
  publicSession,
  listSessions,
  findSessionForAdminRetry,
  suspendHotspotSession,
  renewHotspotSession,
  deleteHotspotSession,
  bulkSessionAction,
  syncActiveSessionsToPlan,
  isMacOnline,
  findExpiringSessions,
  listEvents,
  expireHotspotSessions,
  startExpiryWorker,
  clearClientConnections,
  removeHotspotHost,
  blockExpiredClient,
  unblockHotspotClient,
  forceClientOffline,
  ensureUnauthenticatedJump,
  ensureExpiredClientRules,
  resolvePortalAddresses,
  sanitizeHotspotWalledGarden,
  ensureHotspotEnforcement,
  money,
};
