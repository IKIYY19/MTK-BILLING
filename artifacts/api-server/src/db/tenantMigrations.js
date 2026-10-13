/**
 * Multi-Tenant Migrations
 * Adds tenants table and tenant_id to core tables for white-label ISP support
 */

const tenantMigrations = [
  // ─── Tenants table ───
  `CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    company_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    logo_url TEXT,
    primary_color VARCHAR(20) DEFAULT '#3b82f6',
    secondary_color VARCHAR(20) DEFAULT '#1e293b',
    accent_color VARCHAR(20) DEFAULT '#f59e0b',
    domain VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    max_customers INTEGER DEFAULT 0,
    max_routers INTEGER DEFAULT 0,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug)`,
  `CREATE INDEX IF NOT EXISTS idx_tenants_domain ON tenants(domain)`,
  `CREATE INDEX IF NOT EXISTS idx_tenants_active ON tenants(is_active)`,

  // ─── Default tenant ───
  `INSERT INTO tenants (id, name, slug, company_name, is_active)
   VALUES ('00000000-0000-0000-0000-000000000001', 'Default ISP', 'default', 'My ISP', true)
   ON CONFLICT (slug) DO NOTHING`,

  // ─── Add tenant_id to users ───
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id)`,
  // Assign existing users to default tenant
  `UPDATE users SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL`,

  // ─── Add tenant_id to customers ───
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id)`,
  `UPDATE customers SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL`,

  // ─── Add tenant_id to mikrotik_connections ───
  `ALTER TABLE mikrotik_connections ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_mikrotik_tenant ON mikrotik_connections(tenant_id)`,
  `UPDATE mikrotik_connections SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL`,

  // ─── Add tenant_id to service_plans ───
  `ALTER TABLE service_plans ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_service_plans_tenant ON service_plans(tenant_id)`,
  `UPDATE service_plans SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL`,

  // ─── Add tenant_id to subscriptions ───
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id)`,
  `UPDATE subscriptions SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL`,

  // ─── Add tenant_id to invoices ───
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id)`,
  `UPDATE invoices SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL`,

  // ─── Add tenant_id to payments ───
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id)`,
  `UPDATE payments SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL`,

  // ─── Add tenant_id to hotspot_vouchers ───
  `ALTER TABLE hotspot_vouchers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_hotspot_vouchers_tenant ON hotspot_vouchers(tenant_id)`,
  `UPDATE hotspot_vouchers SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL`,

  // ─── Add tenant_id to resellers ───
  `ALTER TABLE resellers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_resellers_tenant ON resellers(tenant_id)`,
  `UPDATE resellers SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL`,

  // ─── Add tenant_id to branches ───
  `ALTER TABLE branches ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches(tenant_id)`,
  `UPDATE branches SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL`,

  // ─── Add tenant_id to agents ───
  `ALTER TABLE agents ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id)`,
  `UPDATE agents SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL`,

  // ─── Add tenant_id to captive_portals ───
  `ALTER TABLE captive_portals ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_captive_portals_tenant ON captive_portals(tenant_id)`,
  `UPDATE captive_portals SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL`,

  // ─── Add tenant_id to tickets ───
  `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_tenant ON tickets(tenant_id)`,
  `UPDATE tickets SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL`,

  // ─── Add tenant_id to wallet tables ───
  `ALTER TABLE wallets ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_wallets_tenant ON wallets(tenant_id)`,
  `UPDATE wallets SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL`,
];

module.exports = tenantMigrations;
