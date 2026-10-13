/**
 * Unified Database Migrations
 * PostgreSQL tables for stores that previously only had in-memory support:
 * - Inventory (devices, categories, brands, locations, maintenance, assignments, alerts)
 * - Wallet (wallets, transactions)
 * - Backup (schedules, backups)
 * - Multi-Feature (branches, agents, grace config)
 * - RADIUS (sessions, daily usage, quota enforcement)
 */

const unifiedMigrations = [
  // ═══════════════════════════════════════
  // INVENTORY
  // ═══════════════════════════════════════

  `CREATE TABLE IF NOT EXISTS inventory_categories (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50),
    color VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS inventory_brands (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_brands_name ON inventory_brands(name)`,

  `CREATE TABLE IF NOT EXISTS inventory_locations (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'warehouse',
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_locations_type ON inventory_locations(type)`,

  `CREATE TABLE IF NOT EXISTS inventory_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    category_id VARCHAR(50) REFERENCES inventory_categories(id) ON DELETE SET NULL,
    brand VARCHAR(100),
    model VARCHAR(100),
    serial VARCHAR(255),
    mac VARCHAR(50),
    firmware VARCHAR(100),
    ip_address VARCHAR(45),
    status VARCHAR(50) DEFAULT 'in-stock',
    purchase_date DATE,
    purchase_cost NUMERIC(10,2) DEFAULT 0,
    warranty_expires DATE,
    location_id VARCHAR(50) REFERENCES inventory_locations(id) ON DELETE SET NULL,
    assigned_to VARCHAR(255),
    assigned_customer VARCHAR(255),
    notes TEXT,
    specs JSONB DEFAULT '{}'::jsonb,
    maintenance_schedule VARCHAR(50) DEFAULT 'none',
    last_maintenance DATE,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_devices_status ON inventory_devices(status)`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_devices_category ON inventory_devices(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_devices_brand ON inventory_devices(brand)`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_devices_location ON inventory_devices(location_id)`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_devices_serial ON inventory_devices(serial)`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_devices_name ON inventory_devices(name)`,

  `CREATE TABLE IF NOT EXISTS inventory_maintenance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES inventory_devices(id) ON DELETE CASCADE,
    type VARCHAR(50) DEFAULT 'general',
    notes TEXT,
    performed_by VARCHAR(255) DEFAULT 'Unknown',
    cost NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_maint_device ON inventory_maintenance_logs(device_id)`,

  `CREATE TABLE IF NOT EXISTS inventory_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES inventory_devices(id) ON DELETE CASCADE,
    assigned_to VARCHAR(255),
    customer_name VARCHAR(255),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_assign_device ON inventory_assignments(device_id)`,

  `CREATE TABLE IF NOT EXISTS inventory_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,
    device_id UUID REFERENCES inventory_devices(id) ON DELETE CASCADE,
    device_name VARCHAR(255),
    message TEXT,
    severity VARCHAR(20) DEFAULT 'info',
    acknowledged BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_alerts_device ON inventory_alerts(device_id)`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_alerts_type ON inventory_alerts(type)`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_alerts_ack ON inventory_alerts(acknowledged)`,

  // ═══════════════════════════════════════
  // WALLET
  // ═══════════════════════════════════════

  `CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    balance NUMERIC(12,2) DEFAULT 0,
    daily_rate NUMERIC(10,2) DEFAULT 0,
    auto_renew BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'inactive',
    activated_at TIMESTAMP,
    expires_at TIMESTAMP,
    last_deduction DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_wallets_customer ON wallets(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_wallets_status ON wallets(status)`,

  `CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    type VARCHAR(20) NOT NULL,
    amount NUMERIC(12,2) DEFAULT 0,
    method VARCHAR(50) DEFAULT 'mpesa',
    reference VARCHAR(255),
    balance_after NUMERIC(12,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_wallet_trans_customer ON wallet_transactions(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_wallet_trans_wallet ON wallet_transactions(wallet_id)`,
  `CREATE INDEX IF NOT EXISTS idx_wallet_trans_created ON wallet_transactions(created_at)`,

  // ═══════════════════════════════════════
  // BACKUP
  // ═══════════════════════════════════════

  `CREATE TABLE IF NOT EXISTS backup_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    device_type VARCHAR(50) DEFAULT 'routeros',
    ip_address VARCHAR(45) NOT NULL,
    api_port INTEGER DEFAULT 8728,
    username VARCHAR(100) NOT NULL,
    password_encrypted TEXT NOT NULL,
    schedule VARCHAR(50) DEFAULT 'daily',
    time VARCHAR(10) DEFAULT '02:00',
    enabled BOOLEAN DEFAULT true,
    last_run TIMESTAMP,
    last_status VARCHAR(50) DEFAULT 'never',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_backup_schedules_enabled ON backup_schedules(enabled)`,

  `CREATE TABLE IF NOT EXISTS backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID REFERENCES backup_schedules(id) ON DELETE SET NULL,
    device_name VARCHAR(255),
    ip_address VARCHAR(45),
    config_content TEXT,
    file_size INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'success',
    error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_backups_schedule ON backups(schedule_id)`,
  `CREATE INDEX IF NOT EXISTS idx_backups_created ON backups(created_at)`,

  // ═══════════════════════════════════════
  // MULTI-FEATURE (Branches, Agents, Grace Config)
  // ═══════════════════════════════════════

  `CREATE TABLE IF NOT EXISTS branches (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(100),
    address TEXT,
    contact VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active',
    lat NUMERIC(10,8),
    lng NUMERIC(11,8),
    active_pppoe INTEGER DEFAULT 0,
    online_routers INTEGER DEFAULT 0,
    total_routers INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_branches_status ON branches(status)`,
  `CREATE INDEX IF NOT EXISTS idx_branches_city ON branches(city)`,

  `CREATE TABLE IF NOT EXISTS agents (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    branch_id VARCHAR(50) REFERENCES branches(id) ON DELETE SET NULL,
    commission_rate NUMERIC(5,2) DEFAULT 10,
    balance NUMERIC(12,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agents_branch ON agents(branch_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)`,

  `CREATE TABLE IF NOT EXISTS grace_period_config (
    id SERIAL PRIMARY KEY,
    warn_days INTEGER DEFAULT 7,
    throttle_days INTEGER DEFAULT 14,
    suspend_days INTEGER DEFAULT 30,
    throttle_speed_up VARCHAR(20) DEFAULT '1M',
    throttle_speed_down VARCHAR(20) DEFAULT '1M',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // ═══════════════════════════════════════
  // RADIUS SESSIONS & USAGE
  // ═══════════════════════════════════════

  `CREATE TABLE IF NOT EXISTS radius_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL,
    customer_id UUID,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    bytes_in BIGINT DEFAULT 0,
    bytes_out BIGINT DEFAULT 0,
    session_time INTEGER DEFAULT 0,
    framed_ip VARCHAR(45),
    nas_ip VARCHAR(45),
    mac_address VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active',
    terminate_cause VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_radius_sessions_session ON radius_sessions(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_radius_sessions_customer ON radius_sessions(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_radius_sessions_username ON radius_sessions(username)`,
  `CREATE INDEX IF NOT EXISTS idx_radius_sessions_status ON radius_sessions(status)`,
  `CREATE INDEX IF NOT EXISTS idx_radius_sessions_start ON radius_sessions(start_time)`,

  `CREATE TABLE IF NOT EXISTS radius_daily_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    customer_id UUID NOT NULL,
    bytes_in BIGINT DEFAULT 0,
    bytes_out BIGINT DEFAULT 0,
    sessions INTEGER DEFAULT 0,
    UNIQUE(date, customer_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_radius_daily_customer ON radius_daily_usage(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_radius_daily_date ON radius_daily_usage(date)`,

  `CREATE TABLE IF NOT EXISTS radius_quota_enforcement_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_radius_quota_customer ON radius_quota_enforcement_log(customer_id)`,
];

module.exports = unifiedMigrations;
