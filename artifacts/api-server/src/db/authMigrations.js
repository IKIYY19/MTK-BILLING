/**
 * Auto Migration
 * Runs on server startup to ensure database schema is up to date
 */

const db = require("./index");

const authMigrations = [
  // Add auth-related columns to users table if they don't exist
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_password_change TIMESTAMP`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'staff'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`,

  // Customer portal auth columns
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS portal_pin_hash VARCHAR(255)`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS pin_reset_code VARCHAR(10)`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS pin_reset_expires TIMESTAMP`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_portal_login TIMESTAMP`,

  // Audit logs table
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    user_id UUID,
    user_name VARCHAR(255),
    user_role VARCHAR(50),
    ip_address VARCHAR(45),
    user_agent TEXT,
    details JSONB,
    before_data JSONB,
    after_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at)`,
];

async function runAuthMigrations() {
  console.log("🔧 Running auth migrations...");
  try {
    for (const migration of authMigrations) {
      await db.query(migration);
    }
    console.log("✅ Auth migrations completed");
    return true;
  } catch (error) {
    console.error("❌ Auth migration error:", error.message);
    return false;
  }
}

module.exports = { runAuthMigrations };
