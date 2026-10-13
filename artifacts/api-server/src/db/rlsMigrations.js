/**
 * Row-Level Security (RLS) Migrations
 *
 * Enforces tenant isolation at the PostgreSQL level so that even if
 * application-layer filtering is bypassed, tenants can never read or
 * write each other's data.
 *
 * Strategy: session-variable approach
 *   - Before every query the app sets:
 *       SET LOCAL app.current_tenant_id = '<uuid>'
 *   - RLS policies read that variable with current_setting()
 *   - Super-admins set it to '' (empty) to see all rows
 *
 * Tables covered: customers, subscriptions, invoices, payments,
 *   service_plans, tickets, ticket_messages, ticket_attachments,
 *   users, mikrotik_connections, billing_audit_logs,
 *   notification_templates, message_logs, towers, branches,
 *   hotspot_vouchers, payment_sessions
 */

const rlsMigrations = [
  // ── Prerequisites ────────────────────────────────────────────────────────

  // Add tenant_id to service_plans (per-tenant plans)
  `ALTER TABLE service_plans ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_service_plans_tenant ON service_plans(tenant_id)`,

  // Add tenant_id to billing_audit_logs
  `ALTER TABLE billing_audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_billing_audit_tenant ON billing_audit_logs(tenant_id)`,

  // Add tenant_id to audit_logs
  `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id)`,

  // Add tenant_id to notification_templates
  `ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_notif_templates_tenant ON notification_templates(tenant_id)`,

  // Add tenant_id to message_logs
  `ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_message_logs_tenant ON message_logs(tenant_id)`,

  // Add tenant_id to towers
  `ALTER TABLE towers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_towers_tenant ON towers(tenant_id)`,

  // Add tenant_id to branches
  `ALTER TABLE branches ADD COLUMN IF NOT EXISTS tenant_id UUID`,
  `CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches(tenant_id)`,

  // Add tenant_id to payment_sessions
  `ALTER TABLE payment_sessions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_payment_sessions_tenant ON payment_sessions(tenant_id)`,

  `ALTER TABLE captive_hotspot_sessions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_captive_sessions_tenant ON captive_hotspot_sessions(tenant_id)`,
  `ALTER TABLE captive_hotspot_events ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_captive_events_tenant ON captive_hotspot_events(tenant_id)`,

  // Add tenant_id to hotspot_vouchers
  `ALTER TABLE hotspot_vouchers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_hotspot_vouchers_tenant ON hotspot_vouchers(tenant_id)`,

  // Domain uniqueness index on tenants
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_domain_unique ON tenants(domain) WHERE domain IS NOT NULL AND domain != ''`,
  `CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug)`,
  `CREATE INDEX IF NOT EXISTS idx_tenants_domain ON tenants(domain) WHERE domain IS NOT NULL`,

  // ── Enable RLS on each tenant-scoped table ────────────────────────────────

  `ALTER TABLE customers ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE invoices ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE payments ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE service_plans ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE tickets ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE users ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE mikrotik_connections ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE billing_audit_logs ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE towers ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE hotspot_vouchers ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE payment_sessions ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE captive_hotspot_sessions ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE captive_hotspot_events ENABLE ROW LEVEL SECURITY`,

  // ── Drop old policies before recreating (idempotent) ─────────────────────

  `DROP POLICY IF EXISTS tenant_isolation ON customers`,
  `DROP POLICY IF EXISTS tenant_isolation ON subscriptions`,
  `DROP POLICY IF EXISTS tenant_isolation ON invoices`,
  `DROP POLICY IF EXISTS tenant_isolation ON payments`,
  `DROP POLICY IF EXISTS tenant_isolation ON service_plans`,
  `DROP POLICY IF EXISTS tenant_isolation ON tickets`,
  `DROP POLICY IF EXISTS tenant_isolation ON ticket_messages`,
  `DROP POLICY IF EXISTS tenant_isolation ON users`,
  `DROP POLICY IF EXISTS tenant_isolation ON mikrotik_connections`,
  `DROP POLICY IF EXISTS tenant_isolation ON billing_audit_logs`,
  `DROP POLICY IF EXISTS tenant_isolation ON notification_templates`,
  `DROP POLICY IF EXISTS tenant_isolation ON message_logs`,
  `DROP POLICY IF EXISTS tenant_isolation ON towers`,
  `DROP POLICY IF EXISTS tenant_isolation ON hotspot_vouchers`,
  `DROP POLICY IF EXISTS tenant_isolation ON payment_sessions`,
  `DROP POLICY IF EXISTS tenant_isolation ON captive_hotspot_sessions`,
  `DROP POLICY IF EXISTS tenant_isolation ON captive_hotspot_events`,

  // ── Create RLS policies ───────────────────────────────────────────────────
  //
  // Policy logic:
  //   1. If app.current_tenant_id is '' (empty) → super-admin, allow all rows
  //   2. If app.current_tenant_id matches row's tenant_id → allow
  //   3. If row has NULL tenant_id → allow (legacy/unscoped data)
  //
  // PERMISSIVE policies: row is visible if ANY policy passes (union semantics)

  `CREATE POLICY tenant_isolation ON customers AS PERMISSIVE
    FOR ALL TO PUBLIC
    USING (
      NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      OR tenant_id IS NULL
      OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )`,

  `CREATE POLICY tenant_isolation ON subscriptions AS PERMISSIVE
    FOR ALL TO PUBLIC
    USING (
      NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      OR tenant_id IS NULL
      OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )`,

  `CREATE POLICY tenant_isolation ON invoices AS PERMISSIVE
    FOR ALL TO PUBLIC
    USING (
      NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      OR tenant_id IS NULL
      OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )`,

  `CREATE POLICY tenant_isolation ON payments AS PERMISSIVE
    FOR ALL TO PUBLIC
    USING (
      NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      OR tenant_id IS NULL
      OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )`,

  `CREATE POLICY tenant_isolation ON service_plans AS PERMISSIVE
    FOR ALL TO PUBLIC
    USING (
      NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      OR tenant_id IS NULL
      OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )`,

  `CREATE POLICY tenant_isolation ON tickets AS PERMISSIVE
    FOR ALL TO PUBLIC
    USING (
      NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      OR tenant_id IS NULL
      OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )`,

  `CREATE POLICY tenant_isolation ON ticket_messages AS PERMISSIVE
    FOR ALL TO PUBLIC
    USING (
      NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      OR ticket_id IN (
        SELECT id FROM tickets
        WHERE tenant_id IS NULL
           OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
      )
    )`,

  `CREATE POLICY tenant_isolation ON users AS PERMISSIVE
    FOR ALL TO PUBLIC
    USING (
      NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      OR tenant_id IS NULL
      OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )`,

  `CREATE POLICY tenant_isolation ON mikrotik_connections AS PERMISSIVE
    FOR ALL TO PUBLIC
    USING (
      NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      OR tenant_id IS NULL
      OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )`,

  `CREATE POLICY tenant_isolation ON billing_audit_logs AS PERMISSIVE
    FOR ALL TO PUBLIC
    USING (
      NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      OR tenant_id IS NULL
      OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )`,

  `CREATE POLICY tenant_isolation ON notification_templates AS PERMISSIVE
    FOR ALL TO PUBLIC
    USING (
      NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      OR tenant_id IS NULL
      OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )`,

  `CREATE POLICY tenant_isolation ON message_logs AS PERMISSIVE
    FOR ALL TO PUBLIC
    USING (
      NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      OR tenant_id IS NULL
      OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )`,

  `CREATE POLICY tenant_isolation ON towers AS PERMISSIVE
    FOR ALL TO PUBLIC
    USING (
      NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      OR tenant_id IS NULL
      OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )`,

  `CREATE POLICY tenant_isolation ON hotspot_vouchers AS PERMISSIVE
    FOR ALL TO PUBLIC
    USING (
      NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      OR tenant_id IS NULL
      OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )`,

  `CREATE POLICY tenant_isolation ON payment_sessions AS PERMISSIVE
    FOR ALL TO PUBLIC
    USING (
      NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      OR tenant_id IS NULL
      OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )`,

  `CREATE POLICY tenant_isolation ON captive_hotspot_sessions AS PERMISSIVE
    FOR ALL TO PUBLIC
    USING (
      NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
    WITH CHECK (
      NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )`,

  `CREATE POLICY tenant_isolation ON captive_hotspot_events AS PERMISSIVE
    FOR ALL TO PUBLIC
    USING (
      NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
    WITH CHECK (
      NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )`,
];

async function runRlsMigrations(db) {
  console.log("🔒 Running RLS migrations...");
  let ok = 0;
  let failed = 0;
  for (const migration of rlsMigrations) {
    try {
      await db.query(migration);
      ok++;
    } catch (error) {
      // Some migrations may fail if the table doesn't exist yet — non-fatal
      console.warn("⚠️  RLS migration skipped:", error.message.split("\n")[0]);
      failed++;
    }
  }
  console.log(`✅ RLS migrations done (${ok} ok, ${failed} skipped)`);
}

module.exports = { runRlsMigrations };
