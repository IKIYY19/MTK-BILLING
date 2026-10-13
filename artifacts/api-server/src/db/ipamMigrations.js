const migrations = [
  `CREATE TABLE IF NOT EXISTS ipam_subnets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    network VARCHAR(50) NOT NULL,
    mask INTEGER DEFAULT 24,
    gateway VARCHAR(50),
    description TEXT DEFAULT '',
    vlan_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS ipam_ips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subnet_id UUID REFERENCES ipam_subnets(id) ON DELETE CASCADE,
    ip_address VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'free' CHECK(status IN ('free','used','reserved')),
    description TEXT DEFAULT '',
    assigned_to VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`
];

async function run() {
  const db = global.db;
  if (!db) {return;}
  for (const m of migrations) { try { await db.query(m); } catch(e) { console.error(e.message); } }
  console.log("IPAM migrations complete");
}
module.exports = { run };
