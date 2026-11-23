/**
 * Request-scoped tenant context.
 *
 * The value stored here is applied to every PostgreSQL query as a
 * transaction-local `app.current_tenant_id` setting so that RLS policies
 * evaluate on the same connection and in the same transaction as the query.
 * An empty string means system / super-admin context (sees all rows).
 */

const { AsyncLocalStorage } = require("async_hooks");

const tenantStorage = new AsyncLocalStorage();
const SYSTEM_TENANT_ID = "";

function getTenantId() {
  const store = tenantStorage.getStore();
  if (!store || store.tenantId === undefined || store.tenantId === null) {
    return SYSTEM_TENANT_ID;
  }
  return String(store.tenantId);
}

function runWithTenant(tenantId, fn) {
  return tenantStorage.run(
    { tenantId: tenantId === undefined || tenantId === null ? SYSTEM_TENANT_ID : String(tenantId) },
    fn,
  );
}

function withSystemTenant(fn) {
  return runWithTenant(SYSTEM_TENANT_ID, fn);
}

function isSystemTenant() {
  return getTenantId() === SYSTEM_TENANT_ID;
}

module.exports = {
  getTenantId,
  runWithTenant,
  withSystemTenant,
  isSystemTenant,
  SYSTEM_TENANT_ID,
};
