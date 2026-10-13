/**
 * Tenant Context Middleware
 * Resolves tenant from JWT user and auto-filters DB queries.
 *
 * Usage:
 *   app.use(tenantContext);
 *
 * After this middleware runs:
 *   req.tenantId  - the current tenant UUID (null for super admins)
 *   req.isSuperAdmin - true if user has no tenant (sees all data)
 *
 * Super admins can override with X-Tenant-ID header.
 * Custom domains are resolved upstream by domainResolver middleware.
 */

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Sets the PostgreSQL session variable used by RLS policies.
 * Must be called within a transaction or at query time.
 * Pass tenantId=null or '' for super-admin (sees all rows).
 *
 * @param {object} db  - pg Pool or Client
 * @param {string|null} tenantId
 */
async function setTenantSession(db, tenantId) {
  try {
    await db.query(
      "SELECT set_config('app.current_tenant_id', $1, true)",
      [tenantId || ""]
    );
  } catch {
    // Non-fatal — RLS still works via app-layer filtering
  }
}

function tenantContext(req, res, next) {
  // Tenant already resolved (e.g. by domainResolver)
  // Still need to set the RLS session variable
  if (req.tenantId !== undefined) {
    if (global.dbAvailable && global.db) {
      setTenantSession(global.db, req.tenantId).catch(() => {});
    }
    return next();
  }

  const user = req.user;

  // No user = public route
  if (!user) {
    req.tenantId     = null;
    req.isSuperAdmin = false;
    return next();
  }

  // Super admin: no tenant_id = sees everything
  if (user.role === "admin" && !user.tenant_id) {
    const overrideHeader = req.headers["x-tenant-id"];
    if (overrideHeader && overrideHeader !== "all") {
      req.tenantId     = overrideHeader;
      req.isSuperAdmin = true;
    } else {
      req.tenantId     = null;   // '' in RLS = see all
      req.isSuperAdmin = true;
    }
  } else {
    // Regular user: scoped to their tenant
    req.tenantId     = user.tenant_id || DEFAULT_TENANT_ID;
    req.isSuperAdmin = false;
  }

  // Set RLS session variable so PostgreSQL policies take effect
  if (global.dbAvailable && global.db) {
    setTenantSession(global.db, req.tenantId).catch(() => {});
  }

  next();
}

/**
 * Returns SQL WHERE clause fragment and params for tenant filtering.
 * Use in route handlers that build dynamic queries.
 *
 * @param {object} req - Express request
 * @param {string} tableAlias - e.g. "c" for customers
 * @param {number} startParamIdx - starting $N index
 * @returns {{ clause: string, params: array, nextIdx: number }}
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

/**
 * Middleware that restricts to super admin only.
 */
function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin" || req.user.tenant_id) {
    return res.status(403).json({ error: "Super admin access required" });
  }
  next();
}

/**
 * Middleware that requires a tenant context (blocks super admins viewing "all").
 */
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
  setTenantSession,
  DEFAULT_TENANT_ID,
};
