/**
 * Row-Level Security (RLS) Migrations
 *
 * Enforces tenant isolation in PostgreSQL. Every application query sets
 * `app.current_tenant_id` on the same connection and inside the same
 * transaction as the query (see db/index.js).
 *
 * Policy rules (fail-closed):
 *   - setting missing (NULL)  -> deny everything
 *   - setting = ''            -> system / super-admin, allow all
 *   - otherwise               -> allow only rows with a matching tenant_id
 *
 * FORCE ROW LEVEL SECURITY is applied because the application connects as the
 * table owner, which would otherwise bypass RLS entirely.
 */

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const SETTING = "current_setting('app.current_tenant_id', true)";

function tenantPolicy(column = "tenant_id") {
  return `CASE WHEN ${SETTING} IS NULL THEN false WHEN ${SETTING} = '' THEN true ELSE ${column} = ${SETTING}::uuid END`;
}

const tenantTables = [
  "customers",
  "subscriptions",
  "invoices",
  "payments",
  "service_plans",
  "tickets",
  "users",
  "mikrotik_connections",
  "billing_audit_logs",
  "audit_logs",
  "notification_templates",
  "message_logs",
  "towers",
  "hotspot_vouchers",
  "payment_sessions",
  "captive_hotspot_sessions",
  "captive_hotspot_events",
  "dns_adblock_sources",
  "dns_adblock_groups",
  "dns_adblock_router_configs",
  "dns_adblock_versions",
  "dns_adblock_policies",
  "dns_adblock_domains",
  "dns_adblock_sync_logs",
  "dns_adblock_source_history",
];

// Tables whose pre-existing NULL tenant rows belong to the default tenant.
// `users` is deliberately excluded: a NULL tenant_id marks a super-admin.
const backfillTables = [
  "customers",
  "subscriptions",
  "invoices",
  "payments",
  "service_plans",
  "tickets",
  "mikrotik_connections",
  "billing_audit_logs",
  "audit_logs",
  "notification_templates",
  "message_logs",
  "towers",
  "hotspot_vouchers",
  "payment_sessions",
  "captive_hotspot_sessions",
  "captive_hotspot_events",
];

const dnsTables = [
  "dns_adblock_sources",
  "dns_adblock_groups",
  "dns_adblock_router_configs",
  "dns_adblock_versions",
  "dns_adblock_policies",
  "dns_adblock_domains",
  "dns_adblock_sync_logs",
  "dns_adblock_source_history",
];

const rlsMigrations = [
  // ── Prerequisites ────────────────────────────────────────────────────────
  `ALTER TABLE service_plans ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_service_plans_tenant ON service_plans(tenant_id)`,
  `ALTER TABLE billing_audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_billing_audit_tenant ON billing_audit_logs(tenant_id)`,
  `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id)`,
  `ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_notif_templates_tenant ON notification_templates(tenant_id)`,
  `ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_message_logs_tenant ON message_logs(tenant_id)`,
  `ALTER TABLE towers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_towers_tenant ON towers(tenant_id)`,
  `ALTER TABLE branches ADD COLUMN IF NOT EXISTS tenant_id UUID`,
  `CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches(tenant_id)`,
  `ALTER TABLE payment_sessions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_payment_sessions_tenant ON payment_sessions(tenant_id)`,
  `ALTER TABLE captive_hotspot_sessions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_captive_sessions_tenant ON captive_hotspot_sessions(tenant_id)`,
  `ALTER TABLE captive_hotspot_events ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_captive_events_tenant ON captive_hotspot_events(tenant_id)`,
  `ALTER TABLE hotspot_vouchers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_hotspot_vouchers_tenant ON hotspot_vouchers(tenant_id)`,

  `CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_domain_unique ON tenants(domain) WHERE domain IS NOT NULL AND domain != ''`,
  `CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug)`,
  `CREATE INDEX IF NOT EXISTS idx_tenants_domain ON tenants(domain) WHERE domain IS NOT NULL`,

  // ── DNS tables ──────────────────────────────────────────────────────────
  `ALTER TABLE dns_adblock_source_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `ALTER TABLE dns_adblock_sources ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `ALTER TABLE dns_adblock_groups ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `ALTER TABLE dns_adblock_router_configs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `ALTER TABLE dns_adblock_versions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `ALTER TABLE dns_adblock_policies ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `ALTER TABLE dns_adblock_domains ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `ALTER TABLE dns_adblock_sync_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `UPDATE dns_adblock_sources SET tenant_id='${DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL`,
  `UPDATE dns_adblock_groups SET tenant_id='${DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL`,
  `UPDATE dns_adblock_router_configs SET tenant_id='${DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL`,
  `UPDATE dns_adblock_versions v SET tenant_id=c.tenant_id FROM dns_adblock_router_configs c WHERE v.router_config_id=c.id AND v.tenant_id IS NULL`,
  `UPDATE dns_adblock_policies p SET tenant_id=c.tenant_id FROM dns_adblock_router_configs c WHERE p.router_config_id=c.id AND p.tenant_id IS NULL`,
  `UPDATE dns_adblock_domains SET tenant_id='${DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL`,
  `UPDATE dns_adblock_sync_logs l SET tenant_id=c.tenant_id FROM dns_adblock_router_configs c WHERE l.router_config_id=c.id AND l.tenant_id IS NULL`,
  `UPDATE dns_adblock_source_history h SET tenant_id=s.tenant_id FROM dns_adblock_sources s WHERE h.source_id=s.id AND h.tenant_id IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_dns_sources_tenant ON dns_adblock_sources(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_dns_router_tenant ON dns_adblock_router_configs(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_dns_source_history_tenant ON dns_adblock_source_history(tenant_id,source_id,created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_dns_policy_tenant ON dns_adblock_policies(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_dns_domains_tenant ON dns_adblock_domains(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_dns_logs_tenant ON dns_adblock_sync_logs(tenant_id)`,

  // ── Backfill legacy rows so the default tenant keeps its data ──────────
  ...backfillTables.map(
    (table) => `UPDATE ${table} SET tenant_id='${DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL`,
  ),

  // ── Fail-closed policies ────────────────────────────────────────────────
  ...tenantTables.flatMap((table) => [
    `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS tenant_isolation ON ${table}`,
    `CREATE POLICY tenant_isolation ON ${table} AS PERMISSIVE FOR ALL TO PUBLIC USING (${tenantPolicy()}) WITH CHECK (${tenantPolicy()})`,
  ]),

  // New rows inherit the current request tenant unless explicitly overridden.
  ...tenantTables.map(
    (table) =>
      `ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT NULLIF(${SETTING}, '')::uuid`,
  ),

  // ticket_messages has no tenant_id; scope it through its parent ticket.
  `ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE ticket_messages FORCE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS tenant_isolation ON ticket_messages`,
  `CREATE POLICY tenant_isolation ON ticket_messages AS PERMISSIVE FOR ALL TO PUBLIC USING (
    CASE WHEN ${SETTING} IS NULL THEN false
         WHEN ${SETTING} = '' THEN true
         ELSE ticket_id IN (SELECT id FROM tickets WHERE tenant_id = ${SETTING}::uuid)
    END
  ) WITH CHECK (
    CASE WHEN ${SETTING} IS NULL THEN false
         WHEN ${SETTING} = '' THEN true
         ELSE ticket_id IN (SELECT id FROM tickets WHERE tenant_id = ${SETTING}::uuid)
    END
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
      // Some tables may not exist yet in partial deployments — keep going,
      // but make the failure visible rather than silently ignoring it.
      console.warn("RLS migration failed:", error.message.split("\n")[0]);
      failed++;
    }
  }
  console.log(`RLS migrations done (${ok} ok, ${failed} failed)`);
  if (failed > 0) {
    console.error(
      `WARNING: ${failed} RLS migration(s) failed. Affected tables fail closed (no access) until the migration succeeds.`,
    );
  }
}

module.exports = { runRlsMigrations, rlsMigrations, tenantPolicy };
