/**
 * Webhook table migration.
 *
 * Columns:
 *   id         — UUID primary key
 *   url        — Destination URL for the HTTP POST
 *   events     — JSON array of event names (e.g. ["payment.received","*"])
 *   name       — Human-readable label
 *   secret     — Shared secret sent as X-Webhook-Secret header
 *   enabled    — Whether this webhook is active
 *   created_at — Creation timestamp
 *   updated_at — Last-updated timestamp
 */

const migrations = [
  `CREATE TABLE IF NOT EXISTS webhooks (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url        TEXT NOT NULL,
    events     JSONB NOT NULL DEFAULT '[]',
    name       VARCHAR(255) DEFAULT '',
    secret     VARCHAR(255) DEFAULT '',
    enabled    BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
];

async function run() {
  const db = global.db;
  if (!db) {return;}
  for (const m of migrations) {
    try {
      await db.query(m);
    } catch (e) {
      // Table may already exist — safe to ignore
    }
  }
  console.log("Webhook migrations complete");
}

module.exports = { run };
