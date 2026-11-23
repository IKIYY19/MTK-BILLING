/**
 * Rate Limiting Configuration
 * All limiters are tenant-aware: key by tenant_id (authenticated) or IP (public).
 * This prevents one ISP from saturating limits and affecting others.
 */

const rateLimit = require("express-rate-limit");
const jwt       = require("jsonwebtoken");
const logger    = require("../utils/logger");
const { JWT_SECRET } = require("./auth");

// ─── Key generators ───────────────────────────────────────────────────────────

/**
 * Authenticated routes: key by the verified token subject so users behind the
 * same office NAT do not share one bucket. Falls back to tenant/IP for public
 * requests. apiLimiter runs before authenticate(), hence the token lookup here.
 */
function tenantKey(req) {
  const header = req.headers?.authorization;
  if (header && header.startsWith("Bearer ")) {
    try {
      const decoded = jwt.verify(header.split(" ")[1], JWT_SECRET);
      return `${decoded.tenant_id || "default"}:${decoded.id || decoded.email || "user"}`;
    } catch {
      // Public/invalid token — fall through to IP-based bucket.
    }
  }
  return req.user?.tenant_id || req.tenantId || req.ip;
}

/** Auth routes: combine tenant + IP to block both credential-stuffing and ISP abuse */
function tenantIpKey(req) {
  const tenant = req.user?.tenant_id || req.tenantId || "public";
  return `${tenant}:${req.ip}`;
}

// ─── Shared handler factory ───────────────────────────────────────────────────

function makeHandler(label) {
  return (req, res) => {
    logger.warn(`Rate limit exceeded: ${label}`, {
      ip:       req.ip,
      tenantId: req.user?.tenant_id || req.tenantId,
      url:      req.originalUrl,
      method:   req.method,
    });
    res.status(429).json({
      error: "Too many requests. Please try again later.",
      retryAfter: res.getHeader("RateLimit-Reset"),
    });
  };
}

// ─── Tenant-aware general API limiter ────────────────────────────────────────
// 10000 req / 15 min per authenticated user; dashboards poll several endpoints
// every few seconds, so the old 2000/user bucket was too easy to exhaust.
const apiLimiter = rateLimit({
  windowMs:       15 * 60 * 1000,
  max:            10000,
  keyGenerator:   tenantKey,
  standardHeaders: true,
  legacyHeaders:  false,
  handler:        makeHandler("api"),
});

// ─── Tenant-aware auth limiter ────────────────────────────────────────────────
// 30 login attempts / 15 min per tenant+IP combo
const authLimiter = rateLimit({
  windowMs:       15 * 60 * 1000,
  max:            30,
  keyGenerator:   tenantIpKey,
  standardHeaders: true,
  legacyHeaders:  false,
  handler:        makeHandler("auth"),
});

// ─── Password reset (strict) ──────────────────────────────────────────────────
const passwordResetLimiter = rateLimit({
  windowMs:       60 * 60 * 1000,
  max:            5,
  keyGenerator:   tenantIpKey,
  standardHeaders: true,
  legacyHeaders:  false,
  handler:        makeHandler("password-reset"),
});

// ─── Payment endpoints ────────────────────────────────────────────────────────
// 100 req / 15 min per tenant
const paymentLimiter = rateLimit({
  windowMs:       15 * 60 * 1000,
  max:            100,
  keyGenerator:   tenantKey,
  standardHeaders: true,
  legacyHeaders:  false,
  handler:        makeHandler("payment"),
});

// ─── SMS / WhatsApp / Email ───────────────────────────────────────────────────
// 50 req / 15 min per tenant (prevents accidental mass-SMS billing)
const messagingLimiter = rateLimit({
  windowMs:       15 * 60 * 1000,
  max:            50,
  keyGenerator:   tenantKey,
  standardHeaders: true,
  legacyHeaders:  false,
  handler:        makeHandler("messaging"),
});

// ─── MikroTik API / provisioning ─────────────────────────────────────────────
// Routers poll frequently — higher limit, keyed by IP (routers don't have JWT)
const mikrotikLimiter = rateLimit({
  windowMs:       15 * 60 * 1000,
  max:            500,
  keyGenerator:   (req) => req.ip,
  standardHeaders: true,
  legacyHeaders:  false,
  handler:        makeHandler("mikrotik"),
});

module.exports = {
  apiLimiter,
  authLimiter,
  passwordResetLimiter,
  paymentLimiter,
  messagingLimiter,
  mikrotikLimiter,
};
