const schemaFixesMigrations = [
  // customers: columns referenced by routes but missing from base migrations
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS branch_id UUID`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(50)`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS service_type VARCHAR(50) DEFAULT 'pppoe'`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS reactivated_at TIMESTAMP`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS static_ip VARCHAR(45)`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS hotspot_profile VARCHAR(100)`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS pppoe_username VARCHAR(100)`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS pppoe_password VARCHAR(100)`,

  // subscriptions: throttle, FUP, sync state
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS throttled BOOLEAN DEFAULT false`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS throttled_at TIMESTAMP`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS fup_exceeded BOOLEAN DEFAULT false`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS data_used BIGINT DEFAULT 0`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS data_limit BIGINT DEFAULT 0`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS static_ip VARCHAR(45)`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS mac_address VARCHAR(50)`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS mac_binding_enabled BOOLEAN DEFAULT false`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS mikrotik_connection_id UUID`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_sync_status VARCHAR(30)`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_sync_error TEXT`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pppoe_profile VARCHAR(100)`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS hotspot_profile VARCHAR(100)`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS service_type VARCHAR(50) DEFAULT 'pppoe'`,

  // invoices: billing extras
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10,2) DEFAULT 0`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10,2) DEFAULT 0`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS refund_reference VARCHAR(255)`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(255)`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount DECIMAL(10,2) DEFAULT 0`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'KES'`,

  // payments: reconciliation fields
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(255)`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS mpesa_code VARCHAR(50)`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50)`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed'`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes TEXT`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS tenant_id UUID`,

  // service_plans: QoS and plan metadata
  `ALTER TABLE service_plans ADD COLUMN IF NOT EXISTS burst_limit VARCHAR(50)`,
  `ALTER TABLE service_plans ADD COLUMN IF NOT EXISTS burst_threshold VARCHAR(50)`,
  `ALTER TABLE service_plans ADD COLUMN IF NOT EXISTS burst_time VARCHAR(20)`,
  `ALTER TABLE service_plans ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 8`,
  `ALTER TABLE service_plans ADD COLUMN IF NOT EXISTS fup_limit BIGINT`,
  `ALTER TABLE service_plans ADD COLUMN IF NOT EXISTS fup_speed VARCHAR(50)`,
  `ALTER TABLE service_plans ADD COLUMN IF NOT EXISTS data_limit BIGINT`,
  `ALTER TABLE service_plans ADD COLUMN IF NOT EXISTS validity_days INTEGER DEFAULT 30`,
  `ALTER TABLE service_plans ADD COLUMN IF NOT EXISTS plan_type VARCHAR(30) DEFAULT 'monthly'`,
  `ALTER TABLE service_plans ADD COLUMN IF NOT EXISTS radius_profile VARCHAR(100)`,
  `ALTER TABLE service_plans ADD COLUMN IF NOT EXISTS tenant_id UUID`,

  // mikrotik_connections: sync and metadata
  `ALTER TABLE mikrotik_connections ADD COLUMN IF NOT EXISTS last_radius_sync_at TIMESTAMP`,
  `ALTER TABLE mikrotik_connections ADD COLUMN IF NOT EXISTS last_radius_sync_status VARCHAR(30)`,
  `ALTER TABLE mikrotik_connections ADD COLUMN IF NOT EXISTS last_radius_sync_error TEXT`,
  `ALTER TABLE mikrotik_connections ADD COLUMN IF NOT EXISTS location VARCHAR(255)`,
  `ALTER TABLE mikrotik_connections ADD COLUMN IF NOT EXISTS description TEXT`,
  `ALTER TABLE mikrotik_connections ADD COLUMN IF NOT EXISTS tenant_id UUID`,
  `ALTER TABLE mikrotik_connections ADD COLUMN IF NOT EXISTS model VARCHAR(100)`,
  `ALTER TABLE mikrotik_connections ADD COLUMN IF NOT EXISTS firmware_version VARCHAR(50)`,
];

async function runSchemaFixesMigrations(db) {
  for (const migration of schemaFixesMigrations) {
    try {
      await db.query(migration);
    } catch (err) {
      console.warn(`[SchemaFixes] Warning on: ${migration.slice(0, 60)}...`, err.message);
    }
  }
  console.log("Schema fixes migrations completed");
}

module.exports = { runSchemaFixesMigrations, schemaFixesMigrations };
