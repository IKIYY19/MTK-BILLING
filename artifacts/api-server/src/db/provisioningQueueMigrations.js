const provisioningQueueMigrations = [
  `CREATE TABLE IF NOT EXISTS provisioning_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID REFERENCES mikrotik_connections(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    last_attempt_at TIMESTAMP,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_provisioning_queue_status ON provisioning_queue(status)`,
  `CREATE INDEX IF NOT EXISTS idx_provisioning_queue_conn ON provisioning_queue(connection_id)`,
];

module.exports = provisioningQueueMigrations;
