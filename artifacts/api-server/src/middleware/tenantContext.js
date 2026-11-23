/**
 * Tenant Context Middleware
 *
 * Resolves the tenant from the verified JWT (authoritative for authenticated
 * requests). For public requests a tenant resolved from a registered custom
 * domain is used; otherwise the request runs as system context so existing
 * public flows keep working.
 *
 * The resolved value is stored in AsyncLocalStorage and applied to every SQL
 * query by db/index.js, so it is always set on the connection and transaction
 * that actually executes the query.
 */

const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("./auth");
const { runWithTenant, SYSTEM_TENANT_ID } = require("../db/tenantScope");

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

function resolveTenant(req) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const decoded = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
      // A super-admin has no tenant and is allowed to see every tenant.
      if (decoded.role === "admin" && !decoded.tenant_id) {
        return SYSTEM_TENANT_ID;
      }
      return decoded.tenant_id || DEFAULT_TENANT_ID;
    } catch {
      // Let authenticate() produce the auth error; do not trust the token.
      return SYSTEM_TENANT_ID;
    }
  }

  // Unauthenticated request: only a registered custom domain may scope it.
  return req.tenantId || SYSTEM_TENANT_ID;
}

function tenantContext(req, res, next) {
  const tenantId = resolveTenant(req);
  req.tenantId = tenantId === SYSTEM_TENANT_ID ? null : tenantId;
  req.isSuperAdmin = tenantId === SYSTEM_TENANT_ID;
  return runWithTenant(tenantId, next);
}

/**
 * Returns a SQL WHERE clause fragment and params for tenant filtering.
 */
function tenantFilter(req, tableAlias = "", startParamIdx = 1) {
  if (!req.tenantId || req.isSuperAdmin) {
    return { clause: "", params: [], nextIdx: startParamIdx };
  }
  const col = tableAlias ? `${tableAlias}.tenant_id` : "tenant_id";
  return {
    clause: `AND ${col} = $${startParamIdx}`,
    params: [req.tenantId],
    nextIdx: startParamIdx + 1,
  };
}

function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin" || req.user.tenant_id) {
    return res.status(403).json({ error: "Super admin access required" });
  }
  next();
}

function requireTenant(req, res, next) {
  if (!req.tenantId) {
    return res.status(400).json({
      error: "Tenant context required. Super admins must set X-Tenant-ID header.",
    });
  }
  next();
}

module.exports = {
  tenantContext,
  tenantFilter,
  requireSuperAdmin,
  requireTenant,
  DEFAULT_TENANT_ID,
};
