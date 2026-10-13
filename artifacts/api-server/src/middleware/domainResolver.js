/**
 * Domain Resolver Middleware
 *
 * Resolves a tenant from the HTTP Host header BEFORE authentication runs.
 * This enables custom domains like billing.my-isp.co.ke to work without
 * any changes to the frontend — the server identifies the tenant from the
 * hostname and sets req.tenantId automatically.
 *
 * Flow:
 *   1. Strip port + www. from Host header → bare domain
 *   2. Skip if it matches APP_DOMAIN (the main app URL)
 *   3. Cache lookup: return cached tenant if fresh (5-min TTL)
 *   4. DB lookup: SELECT id, slug FROM tenants WHERE domain = $1
 *   5. Set req.tenantId + req.tenantSlug if found
 *   6. Continue — auth middleware runs next and may refine further
 *
 * Cache: simple in-process Map (no Redis needed). Max 500 entries,
 * LRU eviction, 5-minute TTL per entry.
 */

const logger = require("../utils/logger");

const CACHE_TTL_MS  = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX     = 500;

// Simple LRU: Map preserves insertion order; delete+re-insert = move to end
const domainCache = new Map();

function cacheGet(domain) {
  const entry = domainCache.get(domain);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    domainCache.delete(domain);
    return null;
  }
  // Move to end (LRU refresh)
  domainCache.delete(domain);
  domainCache.set(domain, entry);
  return entry;
}

function cacheSet(domain, value) {
  if (domainCache.size >= CACHE_MAX) {
    // Evict the oldest entry (first key in insertion order)
    const oldestKey = domainCache.keys().next().value;
    domainCache.delete(oldestKey);
  }
  domainCache.set(domain, { ...value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Call this to invalidate a domain when tenant settings change */
function invalidateDomainCache(domain) {
  if (domain) domainCache.delete(domain);
}

/** Normalise a host header → bare domain (no port, no www.) */
function parseDomain(host) {
  if (!host) return null;
  // Strip port
  const withoutPort = host.split(":")[0].trim().toLowerCase();
  // Strip leading www.
  return withoutPort.replace(/^www\./, "");
}

/** Main middleware */
async function domainResolver(req, res, next) {
  try {
    const rawHost = req.headers.host || req.hostname || "";
    const domain  = parseDomain(rawHost);

    if (!domain) return next();

    // Skip the main app domain — let normal JWT auth handle it
    const appDomain = parseDomain(
      process.env.APP_DOMAIN ||
      process.env.COOLIFY_FQDN ||
      (process.env.APP_URL ? new URL(process.env.APP_URL).hostname : "") ||
      ""
    );
    if (appDomain && domain === appDomain) return next();

    // Skip localhost + common dev hosts
    if (
      domain === "localhost" ||
      domain.endsWith(".localhost") ||
      domain === "127.0.0.1" ||
      domain === "0.0.0.0"
    ) return next();

    // Cache hit
    const cached = cacheGet(domain);
    if (cached) {
      if (cached.tenantId) {
        req.tenantId   = cached.tenantId;
        req.tenantSlug = cached.slug;
        res.setHeader("X-Tenant-Slug", cached.slug || "");
      }
      return next();
    }

    // DB lookup (only if DB is ready)
    if (!global.dbAvailable || !global.db) {
      cacheSet(domain, { tenantId: null, slug: null });
      return next();
    }

    const result = await global.db.query(
      `SELECT id, slug FROM tenants
       WHERE LOWER(domain) = LOWER($1) AND is_active = true
       LIMIT 1`,
      [domain]
    );

    if (result.rows.length > 0) {
      const { id, slug } = result.rows[0];
      cacheSet(domain, { tenantId: id, slug });
      req.tenantId   = id;
      req.tenantSlug = slug;
      res.setHeader("X-Tenant-Slug", slug || "");
      logger.debug("Domain resolved to tenant", { domain, tenantId: id, slug });
    } else {
      // Cache negative result to avoid repeated DB hits for unknown domains
      cacheSet(domain, { tenantId: null, slug: null });
    }
  } catch (err) {
    // Non-fatal — continue without domain-based tenant
    logger.warn("Domain resolver error", { error: err.message });
  }
  next();
}

module.exports = { domainResolver, invalidateDomainCache };
