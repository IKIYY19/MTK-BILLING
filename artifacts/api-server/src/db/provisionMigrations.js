/**
 * Database migrations for Zero-Touch Provisioning
 * Adds routers/devices table with provisioning tokens and audit logging
 */

const provisioningMigrations = [
  // Routers/Devices table
  `CREATE TABLE IF NOT EXISTS routers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    identity VARCHAR(255),
    model VARCHAR(100),
    mac_address VARCHAR(17),
    ip_address VARCHAR(45),
    wan_interface VARCHAR(50) DEFAULT 'ether1',
    lan_interface VARCHAR(50) DEFAULT 'bridge1',
    lan_ports TEXT[] DEFAULT ARRAY['ether2', 'ether3', 'ether4', 'ether5'],

    -- Provisioning
    provision_token VARCHAR(128) UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    provision_status VARCHAR(20) DEFAULT 'pending',
    last_provisioned_at TIMESTAMP,
    provision_attempts INTEGER DEFAULT 0,

    -- Router settings
    dns_servers TEXT[],
    ntp_servers TEXT[],
    radius_server VARCHAR(45),
    radius_secret VARCHAR(255),
    radius_port INTEGER DEFAULT 1812,
    hotspot_enabled BOOLEAN DEFAULT false,
    pppoe_enabled BOOLEAN DEFAULT false,
    pppoe_interface VARCHAR(50),
    pppoe_service_name VARCHAR(100),
    mgmt_port INTEGER DEFAULT 8728,
    mgmt_username VARCHAR(100),
    mgmt_password_encrypted TEXT,
    connection_type VARCHAR(10) DEFAULT 'api',

    -- Billing link
    linked_mikrotik_connection_id UUID,
    billing_activated_at TIMESTAMP,
    billing_activation_error TEXT,

    -- Metadata
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Provisioning audit logs
  `CREATE TABLE IF NOT EXISTS provision_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(128) NOT NULL,
    router_id UUID REFERENCES routers(id) ON DELETE SET NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    action VARCHAR(50),
    status VARCHAR(20),
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Provisioning events (script generation history)
  `CREATE TABLE IF NOT EXISTS provision_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    router_id UUID REFERENCES routers(id) ON DELETE CASCADE,
    event_type VARCHAR(50),
    script_content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Zero-touch enrollment tokens for router self-registration
  `CREATE TABLE IF NOT EXISTS enrollment_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(160) UNIQUE NOT NULL,
    status VARCHAR(30) DEFAULT 'pending',
    expires_at TIMESTAMP,
    used_at TIMESTAMP,
    router_id UUID REFERENCES routers(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Routers that called home using an enrollment script and are waiting for approval
  `CREATE TABLE IF NOT EXISTS discovered_routers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_token VARCHAR(160) NOT NULL,
    token_id UUID REFERENCES enrollment_tokens(id) ON DELETE SET NULL,
    router_id UUID REFERENCES routers(id) ON DELETE SET NULL,
    identity VARCHAR(255),
    model VARCHAR(100),
    version VARCHAR(100),
    serial_number VARCHAR(255),
    primary_mac VARCHAR(50),
    source_ip VARCHAR(45),
    user_agent TEXT,
    interfaces JSONB DEFAULT '[]'::jsonb,
    ip_addresses JSONB DEFAULT '[]'::jsonb,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    suggested_wan_interface VARCHAR(50),
    suggested_lan_interface VARCHAR(50) DEFAULT 'bridge1',
    suggested_lan_ports TEXT[],
    status VARCHAR(30) DEFAULT 'discovered',
    first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Add management credentials columns to discovered_routers for auto billing linking
  `ALTER TABLE discovered_routers ADD COLUMN IF NOT EXISTS mgmt_username VARCHAR(100)`,
  `ALTER TABLE discovered_routers ADD COLUMN IF NOT EXISTS mgmt_password TEXT`,

  // WireGuard public key
  `ALTER TABLE routers ADD COLUMN IF NOT EXISTS wireguard_public_key VARCHAR(64)`,
  `ALTER TABLE routers ADD COLUMN IF NOT EXISTS wireguard_tunnel_ip VARCHAR(45)`,
  `ALTER TABLE routers ADD COLUMN IF NOT EXISTS wireguard_listen_port INTEGER DEFAULT 13231`,

  // Indexes
  `CREATE INDEX IF NOT EXISTS idx_routers_project_id ON routers(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_routers_token ON routers(provision_token)`,
  `CREATE INDEX IF NOT EXISTS idx_routers_status ON routers(provision_status)`,
  // Safely add FK constraint on linked_mikrotik_connection_id (column already exists from CREATE TABLE)
  // Using a DO block to avoid errors if mikrotik_connections table doesn't exist
  `DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'fk_routers_linked_mikrotik_connection'
      AND table_name = 'routers'
    ) THEN
      ALTER TABLE routers ADD CONSTRAINT fk_routers_linked_mikrotik_connection
        FOREIGN KEY (linked_mikrotik_connection_id) REFERENCES mikrotik_connections(id) ON DELETE SET NULL;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    -- mikrotik_connections table doesn't exist yet; skip FK creation
  END $$`,
  `CREATE INDEX IF NOT EXISTS idx_routers_linked_mikrotik_connection ON routers(linked_mikrotik_connection_id)`,
  `CREATE INDEX IF NOT EXISTS idx_enrollment_tokens_token ON enrollment_tokens(token)`,
  `CREATE INDEX IF NOT EXISTS idx_enrollment_tokens_status ON enrollment_tokens(status)`,
  `CREATE INDEX IF NOT EXISTS idx_enrollment_tokens_expires ON enrollment_tokens(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_discovered_routers_token ON discovered_routers(enrollment_token)`,
  `CREATE INDEX IF NOT EXISTS idx_discovered_routers_status ON discovered_routers(status)`,
  `CREATE INDEX IF NOT EXISTS idx_discovered_routers_router ON discovered_routers(router_id)`,
  `CREATE INDEX IF NOT EXISTS idx_discovered_routers_last_seen ON discovered_routers(last_seen_at)`,
  `CREATE INDEX IF NOT EXISTS idx_provision_logs_token ON provision_logs(token)`,
  `CREATE INDEX IF NOT EXISTS idx_provision_logs_router ON provision_logs(router_id)`,
  `CREATE INDEX IF NOT EXISTS idx_provision_events_router ON provision_events(router_id)`,

  // Add tenant_id to routers for reliable tenant-based lookup
  `ALTER TABLE routers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS idx_routers_tenant_id ON routers(tenant_id)`,
];

module.exports = provisioningMigrations;
