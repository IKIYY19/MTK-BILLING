const dnsAdblockMigrations = [
  `CREATE TABLE IF NOT EXISTS dns_adblock_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, name VARCHAR(160) NOT NULL,
    url TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT true, domain_limit INTEGER NOT NULL DEFAULT 200000,
    domain_count INTEGER NOT NULL DEFAULT 0, last_known_good_domains JSONB NOT NULL DEFAULT '[]'::jsonb, etag TEXT, last_modified TEXT,
    last_successful_at TIMESTAMP, last_error TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (tenant_id, url)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dns_adblock_sources_tenant ON dns_adblock_sources(tenant_id, enabled)`,
  `CREATE TABLE IF NOT EXISTS dns_adblock_source_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, source_id UUID REFERENCES dns_adblock_sources(id) ON DELETE CASCADE,
    status VARCHAR(24) NOT NULL, domain_count INTEGER NOT NULL DEFAULT 0, invalid_count INTEGER NOT NULL DEFAULT 0,
    http_status INTEGER, message TEXT, created_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dns_source_history ON dns_adblock_source_history(tenant_id,source_id,created_at DESC)`,
  `ALTER TABLE dns_adblock_source_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `CREATE TABLE IF NOT EXISTS dns_adblock_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, name VARCHAR(120) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true, self_service_allowed BOOLEAN NOT NULL DEFAULT false,
    default_blocking BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (tenant_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS dns_adblock_router_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, connection_id UUID NOT NULL REFERENCES mikrotik_connections(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT false, network_wide BOOLEAN NOT NULL DEFAULT true,
    enforce_dns BOOLEAN NOT NULL DEFAULT true, block_dot BOOLEAN NOT NULL DEFAULT false,
    enforce_ipv6 BOOLEAN NOT NULL DEFAULT false, lan_interface_list VARCHAR(64) NOT NULL DEFAULT 'LAN',
    protected_ipv4_subnets TEXT NOT NULL DEFAULT '', protected_ipv6_prefixes TEXT NOT NULL DEFAULT '',
    wan_interface_list VARCHAR(64) NOT NULL DEFAULT 'WAN', dns_baseline JSONB,
    bypass_dns_v4 VARCHAR(100) NOT NULL DEFAULT '1.1.1.1,1.0.0.1',
    bypass_dns_v6 VARCHAR(100) NOT NULL DEFAULT '2606:4700:4700::1111,2606:4700:4700::1001',
    domain_limit INTEGER NOT NULL DEFAULT 200000, routeros_version VARCHAR(64), hardware_model VARCHAR(160),
    compatibility VARCHAR(24) NOT NULL DEFAULT 'unknown', active_version_id UUID,
    last_successful_sync TIMESTAMP, last_sync_status VARCHAR(24) NOT NULL DEFAULT 'never', last_sync_error TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(), UNIQUE (tenant_id, connection_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dns_adblock_router_tenant ON dns_adblock_router_configs(tenant_id, enabled)`,
  `CREATE TABLE IF NOT EXISTS dns_adblock_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, router_config_id UUID NOT NULL REFERENCES dns_adblock_router_configs(id) ON DELETE CASCADE,
    version BIGINT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'staged', domain_count INTEGER NOT NULL DEFAULT 0,
    domains JSONB NOT NULL DEFAULT '[]'::jsonb, sha256 CHAR(64) NOT NULL, feed_signature CHAR(64) NOT NULL,
    created_by UUID, created_at TIMESTAMP DEFAULT NOW(), activated_at TIMESTAMP, retired_at TIMESTAMP,
    UNIQUE (router_config_id, version)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dns_adblock_versions_lookup ON dns_adblock_versions(tenant_id, router_config_id, version)`,
  `CREATE TABLE IF NOT EXISTS dns_adblock_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    router_config_id UUID NOT NULL REFERENCES dns_adblock_router_configs(id) ON DELETE CASCADE,
    access_type VARCHAR(16) NOT NULL CHECK (access_type IN ('pppoe','hotspot')),
    username VARCHAR(100) NOT NULL, enabled BOOLEAN NOT NULL DEFAULT true,
    self_service_allowed BOOLEAN NOT NULL DEFAULT false, group_id UUID REFERENCES dns_adblock_groups(id) ON DELETE SET NULL,
    last_sync_status VARCHAR(24) NOT NULL DEFAULT 'pending', last_sync_error TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(), UNIQUE (router_config_id, access_type, username)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dns_adblock_policies_customer ON dns_adblock_policies(tenant_id, customer_id)`,
  `CREATE TABLE IF NOT EXISTS dns_adblock_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, domain VARCHAR(253) NOT NULL,
    list_type VARCHAR(8) NOT NULL CHECK (list_type IN ('allow','deny')), enabled BOOLEAN NOT NULL DEFAULT true,
    note VARCHAR(500), created_by UUID, created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (tenant_id, domain, list_type)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dns_adblock_domains_tenant ON dns_adblock_domains(tenant_id, list_type, enabled)`,
  `CREATE TABLE IF NOT EXISTS dns_adblock_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, router_config_id UUID REFERENCES dns_adblock_router_configs(id) ON DELETE SET NULL,
    operation VARCHAR(40) NOT NULL, status VARCHAR(24) NOT NULL, version BIGINT, domain_count INTEGER,
    message TEXT, details JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dns_adblock_sync_logs_router ON dns_adblock_sync_logs(tenant_id, router_config_id, created_at DESC)`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS hotspot_username VARCHAR(100)`,
  `ALTER TABLE dns_adblock_router_configs ADD COLUMN IF NOT EXISTS protected_ipv4_subnets TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE dns_adblock_router_configs ADD COLUMN IF NOT EXISTS protected_ipv6_prefixes TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE dns_adblock_router_configs ADD COLUMN IF NOT EXISTS wan_interface_list VARCHAR(64) NOT NULL DEFAULT 'WAN'`,
  `ALTER TABLE dns_adblock_router_configs ADD COLUMN IF NOT EXISTS dns_baseline JSONB`,
  `ALTER TABLE dns_adblock_sources ADD COLUMN IF NOT EXISTS last_known_good_domains JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE dns_adblock_source_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS dns_adblock_policy_id UUID REFERENCES dns_adblock_policies(id) ON DELETE SET NULL`,
  `ALTER TABLE radreply ADD COLUMN IF NOT EXISTS customer_id UUID`,
  `ALTER TABLE radreply ADD COLUMN IF NOT EXISTS subscription_id UUID`,
];

async function runDnsAdblockMigrations(db) {
  for (const migration of dnsAdblockMigrations) await db.query(migration);
}

module.exports = { dnsAdblockMigrations, runDnsAdblockMigrations };
