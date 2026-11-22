const { getDb } = require("../db");

const logger = require("../utils/logger");

async function run() {
  const db = getDb();
  if (!db) {return;}

  const statements = [
    "CREATE EXTENSION IF NOT EXISTS pgcrypto",
    `DELETE FROM radreply a USING radreply b
      WHERE a.id > b.id AND a.username = b.username AND a.attribute = b.attribute`,
    `DELETE FROM radcheck a USING radcheck b
      WHERE a.id > b.id AND a.username = b.username AND a.attribute = b.attribute`,
    `DELETE FROM radgroupreply a USING radgroupreply b
      WHERE a.id > b.id AND a.groupname = b.groupname AND a.attribute = b.attribute`,
    `DELETE FROM radgroupcheck a USING radgroupcheck b
      WHERE a.id > b.id AND a.groupname = b.groupname AND a.attribute = b.attribute`,
    `DELETE FROM nas a USING nas b
      WHERE a.id > b.id AND a.nasname = b.nasname`,
    "CREATE UNIQUE INDEX IF NOT EXISTS radreply_username_attribute_idx ON radreply (username, attribute)",
    "CREATE UNIQUE INDEX IF NOT EXISTS radcheck_username_attribute_idx ON radcheck (username, attribute)",
    "CREATE UNIQUE INDEX IF NOT EXISTS radgroupreply_group_attribute_idx ON radgroupreply (groupname, attribute)",
    "CREATE UNIQUE INDEX IF NOT EXISTS radgroupcheck_group_attribute_idx ON radgroupcheck (groupname, attribute)",
    "CREATE UNIQUE INDEX IF NOT EXISTS nas_nasname_idx ON nas (nasname)",
    "ALTER TABLE ipam_subnets ADD COLUMN IF NOT EXISTS tenant_id UUID",
    "ALTER TABLE ipam_ips ADD COLUMN IF NOT EXISTS tenant_id UUID",
    "ALTER TABLE ipam_ips ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL",
    "ALTER TABLE ipam_ips ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL",
    `DELETE FROM ipam_ips a USING ipam_ips b
      WHERE a.id > b.id AND a.subnet_id = b.subnet_id AND a.ip_address = b.ip_address`,
    `DELETE FROM ipam_subnets a USING ipam_subnets b
      WHERE a.id > b.id AND a.network = b.network AND a.mask = b.mask`,
    "CREATE UNIQUE INDEX IF NOT EXISTS ipam_ips_subnet_address_idx ON ipam_ips (subnet_id, ip_address)",
    "CREATE UNIQUE INDEX IF NOT EXISTS ipam_subnets_network_mask_idx ON ipam_subnets (network, mask)",
    `UPDATE ipam_subnets SET tenant_id = (SELECT id FROM tenants ORDER BY created_at LIMIT 1) WHERE tenant_id IS NULL`,
    `UPDATE ipam_ips SET tenant_id = (SELECT id FROM tenants ORDER BY created_at LIMIT 1) WHERE tenant_id IS NULL`,
  ];

  for (const statement of statements) {
    try {
      await db.query(statement);
    } catch (error) {
      logger.warn("Radius/IPAM fix migration statement failed", {
        error: error.message,
        statement: statement.slice(0, 80),
      });
    }
  }
  logger.info("Radius/IPAM fix migration complete");
}

module.exports = { run };
