/**
 * PostgreSQL migrations for ISP Billing
 */

const billingMigrations = [
  // Service Plans
  `CREATE TABLE IF NOT EXISTS service_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    speed_up VARCHAR(20) NOT NULL DEFAULT '1M',
    speed_down VARCHAR(20) NOT NULL DEFAULT '1M',
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    quota_gb INTEGER,
    priority INTEGER DEFAULT 8,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Customers (authoritative definition is in migrate.js coreMigrations)
  // Only add billing-specific columns here via ALTER TABLE

  // Subscriptions
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES service_plans(id) ON DELETE SET NULL,
    router_id UUID,
    mikrotik_connection_id UUID REFERENCES mikrotik_connections(id) ON DELETE SET NULL,
    pppoe_username VARCHAR(100),
    pppoe_password VARCHAR(255),
    mac_address VARCHAR(50),
    mac_binding_enabled BOOLEAN DEFAULT false,
    pppoe_profile VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active',
    start_date DATE,
    end_date DATE,
    billing_cycle VARCHAR(20) DEFAULT 'monthly',
    auto_provision BOOLEAN DEFAULT true,
    last_synced_at TIMESTAMP,
    last_sync_status VARCHAR(30),
    last_sync_error TEXT,
    last_radius_sync_status VARCHAR(30),
    last_radius_sync_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Invoices
  `CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    tax DECIMAL(10,2) DEFAULT 0,
    tax_rate DECIMAL(5,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL DEFAULT 0,
    due_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Payments
  `CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    method VARCHAR(50) DEFAULT 'cash',
    reference VARCHAR(255),
    receipt_number VARCHAR(50),
    gateway_transaction_id VARCHAR(255),
    refund_amount DECIMAL(10,2),
    refund_reference VARCHAR(255),
    notes TEXT,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Credit Notes
  `CREATE TABLE IF NOT EXISTS credit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_note_number VARCHAR(50) UNIQUE NOT NULL,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Usage Records (from RADIUS)
  `CREATE TABLE IF NOT EXISTS usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    session_id VARCHAR(255),
    bytes_in BIGINT DEFAULT 0,
    bytes_out BIGINT DEFAULT 0,
    session_time INTEGER DEFAULT 0,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Audit Trail
  `CREATE TABLE IF NOT EXISTS billing_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Tax Configuration
  `CREATE TABLE IF NOT EXISTS tax_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    rate DECIMAL(5,2) NOT NULL DEFAULT 0,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Notification Templates
  `CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    channel VARCHAR(20) NOT NULL,
    subject VARCHAR(255),
    body TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `ALTER TABLE notification_templates DROP CONSTRAINT IF EXISTS notification_templates_event_type_key`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_templates_event_channel
   ON notification_templates(event_type, channel)`,

  // QoS Profiles
  `CREATE TABLE IF NOT EXISTS qos_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    max_upload VARCHAR(50),
    max_download VARCHAR(50),
    burst_upload VARCHAR(50),
    burst_download VARCHAR(50),
    burst_time INTEGER,
    priority VARCHAR(20) DEFAULT 'normal',
    limit_at VARCHAR(50),
    parent_profile_id UUID REFERENCES qos_profiles(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_qos_profiles_name ON qos_profiles(name)`,

  // QoS Rules
  `CREATE TABLE IF NOT EXISTS qos_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES qos_profiles(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    protocol VARCHAR(20),
    src_port VARCHAR(50),
    dst_port VARCHAR(50),
    src_address VARCHAR(50),
    dst_address VARCHAR(50),
    priority INTEGER DEFAULT 0,
    action VARCHAR(20) DEFAULT 'limit',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_qos_rules_profile ON qos_rules(profile_id)`,

  // Captive Portal Templates
  `CREATE TABLE IF NOT EXISTS captive_portal_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    theme VARCHAR(50) DEFAULT 'default',
    logo_url TEXT,
    background_image TEXT,
    primary_color VARCHAR(20) DEFAULT '#3b82f6',
    secondary_color VARCHAR(20) DEFAULT '#1e40af',
    custom_css TEXT,
    custom_html TEXT,
    login_method VARCHAR(20) DEFAULT 'voucher',
    show_pricing BOOLEAN DEFAULT false,
    show_terms BOOLEAN DEFAULT false,
    terms_text TEXT,
    welcome_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_captive_portal_templates_name ON captive_portal_templates(name)`,

  // Users (authoritative definition is in migrate.js coreMigrations)
  // Only add role/auth columns here via ALTER TABLE

  // Indexes
  `CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status)`,
  `CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON subscriptions(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)`,
  `DO $$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_name = 'subscriptions'
    ) AND EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_name = 'mikrotik_connections'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'subscriptions' AND column_name = 'mikrotik_connection_id'
    ) THEN
      ALTER TABLE subscriptions
      ADD COLUMN mikrotik_connection_id UUID REFERENCES mikrotik_connections(id) ON DELETE SET NULL;
    END IF;
  END $$`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pppoe_profile VARCHAR(100)`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_sync_status VARCHAR(30)`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_sync_error TEXT`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_radius_sync_status VARCHAR(30)`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_radius_sync_error TEXT`,
  `DO $$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'subscriptions' AND column_name = 'mikrotik_connection_id'
    ) THEN
      CREATE INDEX IF NOT EXISTS idx_subscriptions_mikrotik_connection
      ON subscriptions(mikrotik_connection_id);
    END IF;
  END $$`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date)`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_received ON payments(received_at)`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10,2)`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_reference VARCHAR(255)`,
  `CREATE INDEX IF NOT EXISTS idx_usage_customer ON usage_records(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_usage_customer_recorded ON usage_records(customer_id, recorded_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_entity ON billing_audit_logs(entity_type, entity_id)`,

  // Hotspot vouchers (authoritative definition is in migrate.js coreMigrations)

  // RADIUS NAS clients
  `CREATE TABLE IF NOT EXISTS nas (
    id SERIAL PRIMARY KEY,
    nasname VARCHAR(128) NOT NULL,
    shortname VARCHAR(32),
    type VARCHAR(30) DEFAULT 'other',
    ports INTEGER,
    secret VARCHAR(60) NOT NULL,
    server VARCHAR(64),
    community VARCHAR(50),
    description VARCHAR(200) DEFAULT 'RADIUS Client',
    connection_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // RADIUS radcheck
  `CREATE TABLE IF NOT EXISTS radcheck (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op CHAR(2) NOT NULL DEFAULT '==',
    value VARCHAR(253) NOT NULL,
    customer_id UUID,
    subscription_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // RADIUS radreply
  `CREATE TABLE IF NOT EXISTS radreply (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op CHAR(2) NOT NULL DEFAULT '=',
    value VARCHAR(253) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // RADIUS radgroupcheck
  `CREATE TABLE IF NOT EXISTS radgroupcheck (
    id SERIAL PRIMARY KEY,
    groupname VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op CHAR(2) NOT NULL DEFAULT '==',
    value VARCHAR(253) NOT NULL
  )`,

  // RADIUS radgroupreply
  `CREATE TABLE IF NOT EXISTS radgroupreply (
    id SERIAL PRIMARY KEY,
    groupname VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op CHAR(2) NOT NULL DEFAULT '=',
    value VARCHAR(253) NOT NULL
  )`,

  // RADIUS radusergroup
  `CREATE TABLE IF NOT EXISTS radusergroup (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    groupname VARCHAR(64) NOT NULL,
    priority INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // RADIUS radacct
  `CREATE TABLE IF NOT EXISTS radacct (
    radacctid BIGSERIAL PRIMARY KEY,
    acctsessionid VARCHAR(64) NOT NULL,
    acctuniqueid VARCHAR(32),
    username VARCHAR(64) NOT NULL,
    realm VARCHAR(64),
    nasipaddress VARCHAR(50),
    nasportid VARCHAR(15),
    nasporttype VARCHAR(32),
    acctstarttime TIMESTAMP,
    acctupdatetime TIMESTAMP,
    acctstoptime TIMESTAMP,
    acctinterval INTEGER,
    acctsessiontime INTEGER,
    acctauthentic VARCHAR(32),
    connectinfo_start VARCHAR(50),
    connectinfo_stop VARCHAR(50),
    acctinputoctets BIGINT,
    acctoutputoctets BIGINT,
    calledstationid VARCHAR(50),
    callingstationid VARCHAR(50),
    acctterminatecause VARCHAR(32),
    servicetype VARCHAR(32),
    framedprotocol VARCHAR(32),
    framedipaddress VARCHAR(50),
    customer_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // RADIUS radpostauth
  `CREATE TABLE IF NOT EXISTS radpostauth (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    pass VARCHAR(64),
    reply VARCHAR(32) NOT NULL,
    authdate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    nasipaddress VARCHAR(50),
    calledstationid VARCHAR(50),
    callingstationid VARCHAR(50)
  )`,

  // RADIUS indexes
  `CREATE INDEX IF NOT EXISTS idx_radcheck_username ON radcheck(username)`,
  `CREATE INDEX IF NOT EXISTS idx_radreply_username ON radreply(username)`,
  `CREATE INDEX IF NOT EXISTS idx_radacct_username ON radacct(username)`,
  `CREATE INDEX IF NOT EXISTS idx_radacct_sessionid ON radacct(acctsessionid)`,
  `CREATE INDEX IF NOT EXISTS idx_radacct_starttime ON radacct(acctstarttime)`,
  `CREATE INDEX IF NOT EXISTS idx_radacct_stoptime ON radacct(acctstoptime)`,
  `CREATE INDEX IF NOT EXISTS idx_radacct_stop_start ON radacct(acctstoptime, acctstarttime)`,

  // Resellers
  `CREATE TABLE IF NOT EXISTS resellers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    password_hash VARCHAR(255),
    commission_rate DECIMAL(5,2) DEFAULT 10.00,
    credit_limit DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `ALTER TABLE resellers ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS reseller_id UUID REFERENCES resellers(id) ON DELETE SET NULL`,

  // Captive Portals
  `CREATE TABLE IF NOT EXISTS captive_portals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    elements JSONB DEFAULT '[]',
    styles JSONB,
    hotspot_profile VARCHAR(100),
    connection_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Support Tickets
  `CREATE TABLE IF NOT EXISTS ticket_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    sla_hours INTEGER DEFAULT 24,
    color VARCHAR(7) DEFAULT '#3b82f6',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    category_id UUID REFERENCES ticket_categories(id) ON DELETE SET NULL,
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(20) DEFAULT 'open',
    assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    sla_deadline TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS ticket_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
    filename VARCHAR(255),
    file_type VARCHAR(50),
    file_size INTEGER,
    file_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Indexes for tickets
  `CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)`,

  // Add missing city column to customers table (if it doesn't exist)
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='customers' AND column_name='city'
    ) THEN
      ALTER TABLE customers ADD COLUMN city VARCHAR(100);
    END IF;
  END $$`,

  // Add missing country column to customers table (if it doesn't exist)
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='customers' AND column_name='country'
    ) THEN
      ALTER TABLE customers ADD COLUMN country VARCHAR(100);
    END IF;
  END $$`,

  // Add missing lat column to customers table (if it doesn't exist)
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='customers' AND column_name='lat'
    ) THEN
      ALTER TABLE customers ADD COLUMN lat DECIMAL(10,8);
    END IF;
  END $$`,

  // Add missing lng column to customers table (if it doesn't exist)
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='customers' AND column_name='lng'
    ) THEN
      ALTER TABLE customers ADD COLUMN lng DECIMAL(11,8);
    END IF;
  END $$`,

  // Add missing id_number column to customers table (if it doesn't exist)
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='customers' AND column_name='id_number'
    ) THEN
      ALTER TABLE customers ADD COLUMN id_number VARCHAR(100);
    END IF;
  END $$`,

  // Add missing notes column to customers table (if it doesn't exist)
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='customers' AND column_name='notes'
    ) THEN
      ALTER TABLE customers ADD COLUMN notes TEXT;
    END IF;
  END $$`,

  // Add missing updated_at column to customers table (if it doesn't exist)
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='customers' AND column_name='updated_at'
    ) THEN
      ALTER TABLE customers ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
  END $$`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS account_number VARCHAR(50)`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS pin_reset_code VARCHAR(10)`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS pin_reset_expires TIMESTAMP`,
  `CREATE INDEX IF NOT EXISTS idx_customers_account_number ON customers(account_number)`,

  // Create branches table for network map
  `CREATE TABLE IF NOT EXISTS branches (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(100),
    address TEXT,
    contact VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active',
    lat DECIMAL(10,8),
    lng DECIMAL(11,8),
    active_pppoe INTEGER DEFAULT 0,
    online_routers INTEGER DEFAULT 0,
    total_routers INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Seed initial branches
  `INSERT INTO branches (id, name, city, address, contact, status, lat, lng)
   SELECT 'branch-nairobi-main', 'Nairobi Main POP', 'Nairobi', 'Moi Avenue', '+254700000001', 'active', -1.2921, 36.8219
   WHERE NOT EXISTS (SELECT 1 FROM branches WHERE id = 'branch-nairobi-main')`,

  `INSERT INTO branches (id, name, city, address, contact, status, lat, lng)
   SELECT 'branch-mombasa', 'Mombasa POP', 'Mombasa', 'Moi Road', '+254700000002', 'active', -4.0435, 39.6682
   WHERE NOT EXISTS (SELECT 1 FROM branches WHERE id = 'branch-mombasa')`,

  `INSERT INTO branches (id, name, city, address, contact, status, lat, lng)
   SELECT 'branch-kisumu', 'Kisumu POP', 'Kisumu', 'Oginga Odinga St', '+254700000003', 'active', -0.0917, 34.7679
   WHERE NOT EXISTS (SELECT 1 FROM branches WHERE id = 'branch-kisumu')`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_customer ON tickets(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id)`,

  // Payment sessions - keeps pending gateway state out of process memory
  `CREATE TABLE IF NOT EXISTS payment_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    phone VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    method VARCHAR(50) NOT NULL DEFAULT 'mpesa_stk',
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    checkout_request_id VARCHAR(255) UNIQUE NOT NULL,
    mpesa_receipt VARCHAR(255),
    provider_response JSONB,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_payment_sessions_checkout ON payment_sessions(checkout_request_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payment_sessions_status ON payment_sessions(status)`,

  // Message logs - persists SMS/WhatsApp history
  `CREATE TABLE IF NOT EXISTS message_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel VARCHAR(20) NOT NULL DEFAULT 'sms',
    event_type VARCHAR(100),
    template_id VARCHAR(100),
    recipients TEXT[] NOT NULL DEFAULT '{}',
    message TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'queued',
    message_id VARCHAR(255),
    cost DECIMAL(10,2) DEFAULT 0,
    is_sandbox BOOLEAN DEFAULT false,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_message_logs_channel ON message_logs(channel)`,
  `CREATE INDEX IF NOT EXISTS idx_message_logs_created_at ON message_logs(created_at)`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS mac_address VARCHAR(50)`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS mac_binding_enabled BOOLEAN DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS towers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    lat DECIMAL(10,8) NOT NULL,
    lng DECIMAL(11,8) NOT NULL,
    height INTEGER,
    coverage_radius INTEGER DEFAULT 5000,
    customer_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS captive_hotspot_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    router_id UUID NOT NULL REFERENCES mikrotik_connections(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES service_plans(id) ON DELETE RESTRICT,
    session_token_hash VARCHAR(64) NOT NULL UNIQUE,
    mac_address VARCHAR(17) NOT NULL,
    client_ip VARCHAR(45),
    gateway_ip VARCHAR(45) NOT NULL,
    original_url TEXT,
    link_login_only TEXT NOT NULL,
    phone VARCHAR(20) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'initiating',
    checkout_request_id VARCHAR(255) UNIQUE,
    mpesa_receipt VARCHAR(50),
    provider_response JSONB,
    hotspot_username VARCHAR(64),
    hotspot_password_encrypted TEXT,
    expires_at TIMESTAMP,
    paid_at TIMESTAMP,
    authorized_at TIMESTAMP,
    last_checked_at TIMESTAMP,
    error_code VARCHAR(80),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_captive_sessions_router_mac
   ON captive_hotspot_sessions(router_id, mac_address, expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_captive_sessions_status
   ON captive_hotspot_sessions(status, updated_at)`,
  `CREATE TABLE IF NOT EXISTS captive_hotspot_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    session_id UUID NOT NULL REFERENCES captive_hotspot_sessions(id) ON DELETE CASCADE,
    event_type VARCHAR(80) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_captive_events_session_created
   ON captive_hotspot_events(session_id, created_at DESC)`,
];

async function runBillingMigrations(db) {
  for (const migration of billingMigrations) {
    await db.query(migration);
  }
}

module.exports = { billingMigrations, runBillingMigrations };
