/**
 * Monitoring and Alerting Routes
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const healthCheckService = require('../services/healthCheckService');

// Get database connection
const getDb = () => global.dbAvailable ? global.db : require('../db/memory');

// ─── BANDWIDTH MONITORING ───

// Get bandwidth history for a customer
router.get('/bandwidth/customer/:customer_id', async (req, res) => {
  try {
    const { customer_id } = req.params;
    const { hours = 24 } = req.query;

    const startTime = new Date();
    startTime.setHours(startTime.getHours() - parseInt(hours));

    const result = await getDb().query(
      `SELECT 
         DATE_TRUNC('hour', recorded_at) as hour,
         SUM(bytes_in) as total_bytes_in,
         SUM(bytes_out) as total_bytes_out,
         COUNT(*) as record_count
       FROM usage_records
       WHERE customer_id = $1 AND recorded_at >= $2
       GROUP BY DATE_TRUNC('hour', recorded_at)
       ORDER BY hour ASC`,
      [customer_id, startTime.toISOString()]
    );

    res.json(result.rows);
  } catch (e) {
    logger.error('Failed to fetch customer bandwidth', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Get bandwidth history for a router
router.get('/bandwidth/router/:router_id', async (req, res) => {
  try {
    const { router_id } = req.params;
    const { hours = 24 } = req.query;

    const startTime = new Date();
    startTime.setHours(startTime.getHours() - parseInt(hours));

    const result = await getDb().query(
      `SELECT 
         DATE_TRUNC('hour', recorded_at) as hour,
         AVG(bandwidth_in) as avg_bandwidth_in,
         AVG(bandwidth_out) as avg_bandwidth_out,
         AVG(active_pppoe) as avg_active_pppoe,
         AVG(cpu_usage) as avg_cpu_usage,
         AVG(memory_usage) as avg_memory_usage
       FROM device_metrics
       WHERE router_id = $1 AND recorded_at >= $2
       GROUP BY DATE_TRUNC('hour', recorded_at)
       ORDER BY hour ASC`,
      [router_id, startTime.toISOString()]
    );

    res.json(result.rows);
  } catch (e) {
    logger.error('Failed to fetch router bandwidth', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Get customer usage summary
router.get('/usage/customer/:customer_id', async (req, res) => {
  try {
    const { customer_id } = req.params;
    const { days = 30 } = req.query;

    const startTime = new Date();
    startTime.setDate(startTime.getDate() - parseInt(days));

    const result = await getDb().query(
      `SELECT 
         DATE_TRUNC('day', recorded_at) as day,
         SUM(bytes_in) as total_bytes_in,
         SUM(bytes_out) as total_bytes_out,
         SUM(session_time) as total_session_time,
         COUNT(*) as session_count
       FROM usage_records
       WHERE customer_id = $1 AND recorded_at >= $2
       GROUP BY DATE_TRUNC('day', recorded_at)
       ORDER BY day ASC`,
      [customer_id, startTime.toISOString()]
    );

    res.json(result.rows);
  } catch (e) {
    logger.error('Failed to fetch customer usage', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Get top bandwidth consumers
router.get('/bandwidth/top-consumers', async (req, res) => {
  try {
    const { limit = 10, days = 7 } = req.query;

    const startTime = new Date();
    startTime.setDate(startTime.getDate() - parseInt(days));

    const result = await getDb().query(
      `SELECT 
         ur.customer_id,
         c.name as customer_name,
         c.email,
         SUM(ur.bytes_in + ur.bytes_out) as total_bytes,
         COUNT(*) as session_count
       FROM usage_records ur
       JOIN customers c ON c.id = ur.customer_id
       WHERE ur.recorded_at >= $1
       GROUP BY ur.customer_id, c.name, c.email
       ORDER BY total_bytes DESC
       LIMIT $2`,
      [startTime.toISOString(), parseInt(limit)]
    );

    res.json(result.rows);
  } catch (e) {
    logger.error('Failed to fetch top consumers', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ─── HEALTH CHECKS ───

// Get health check history for a connection
router.get('/health-checks/:connection_id', async (req, res) => {
  try {
    const { connection_id } = req.params;
    const { limit = 100, check_type } = req.query;
    
    let query = 'SELECT * FROM health_checks WHERE connection_id = $1';
    const params = [connection_id];
    let paramIndex = 2;

    if (check_type) {
      query += ` AND check_type = $${paramIndex}`;
      params.push(check_type);
      paramIndex++;
    }

    query += ` ORDER BY checked_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));

    const result = await getDb().query(query, params);
    res.json(result.rows);
  } catch (e) {
    logger.error('Failed to fetch health checks', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Get latest health check for a connection
router.get('/health-checks/:connection_id/latest', async (req, res) => {
  try {
    const { connection_id } = req.params;
    
    const result = await getDb().query(
      'SELECT * FROM health_checks WHERE connection_id = $1 ORDER BY checked_at DESC LIMIT 1',
      [connection_id]
    );

    res.json(result.rows[0] || null);
  } catch (e) {
    logger.error('Failed to fetch latest health check', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ─── ALERTS ───

// Get all alerts
router.get('/alerts', async (req, res) => {
  try {
    const { connection_id, status, severity, limit = 100 } = req.query;
    
    let query = 'SELECT a.*, mc.name as connection_name FROM alerts a LEFT JOIN mikrotik_connections mc ON mc.id = a.connection_id WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (connection_id) {
      query += ` AND a.connection_id = $${paramIndex}`;
      params.push(connection_id);
      paramIndex++;
    }

    if (status) {
      query += ` AND a.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (severity) {
      query += ` AND a.severity = $${paramIndex}`;
      params.push(severity);
      paramIndex++;
    }

    query += ` ORDER BY a.created_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));

    const result = await getDb().query(query, params);
    res.json(result.rows);
  } catch (e) {
    logger.error('Failed to fetch alerts', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Get alert by ID
router.get('/alerts/:id', async (req, res) => {
  try {
    const result = await getDb().query(
      'SELECT * FROM alerts WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(result.rows[0]);
  } catch (e) {
    logger.error('Failed to fetch alert', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Acknowledge an alert
router.post('/alerts/:id/acknowledge', async (req, res) => {
  try {
    // Use authenticated user's ID from JWT — never trust client-supplied user_id
    const user_id = req.user?.id || req.user?.userId || null;
    
    const result = await getDb().query(
      `UPDATE alerts 
       SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = $2 
       WHERE id = $3 RETURNING *`,
      [user_id, new Date().toISOString(), req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(result.rows[0]);
  } catch (e) {
    logger.error('Failed to acknowledge alert', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Resolve an alert
router.post('/alerts/:id/resolve', async (req, res) => {
  try {
    const result = await getDb().query(
      `UPDATE alerts 
       SET status = 'resolved', resolved_at = $1 
       WHERE id = $2 RETURNING *`,
      [new Date().toISOString(), req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(result.rows[0]);
  } catch (e) {
    logger.error('Failed to resolve alert', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Delete an alert
router.delete('/alerts/:id', async (req, res) => {
  try {
    const result = await getDb().query(
      'DELETE FROM alerts WHERE id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ success: true });
  } catch (e) {
    logger.error('Failed to delete alert', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ─── MONITORING RULES ───

// Get monitoring rules for a connection
router.get('/rules/:connection_id', async (req, res) => {
  try {
    const result = await getDb().query(
      'SELECT * FROM monitoring_rules WHERE connection_id = $1 ORDER BY created_at DESC',
      [req.params.connection_id]
    );

    res.json(result.rows);
  } catch (e) {
    logger.error('Failed to fetch monitoring rules', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Create a monitoring rule
router.post('/rules', async (req, res) => {
  try {
    const { connection_id, rule_type, threshold_value, comparison_operator, is_enabled, alert_severity, notification_channels } = req.body;
    
    const result = await getDb().query(
      `INSERT INTO monitoring_rules (id, connection_id, rule_type, threshold_value, comparison_operator, is_enabled, alert_severity, notification_channels, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [require('uuid').v4(), connection_id, rule_type, threshold_value, comparison_operator || '>', is_enabled !== false, alert_severity || 'warning', notification_channels || [], new Date().toISOString(), new Date().toISOString()]
    );

    res.status(201).json(result.rows[0]);
  } catch (e) {
    logger.error('Failed to create monitoring rule', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Update a monitoring rule
router.put('/rules/:id', async (req, res) => {
  try {
    const { rule_type, threshold_value, comparison_operator, is_enabled, alert_severity, notification_channels } = req.body;
    
    const result = await getDb().query(
      `UPDATE monitoring_rules 
       SET rule_type = COALESCE($1, rule_type),
           threshold_value = COALESCE($2, threshold_value),
           comparison_operator = COALESCE($3, comparison_operator),
           is_enabled = COALESCE($4, is_enabled),
           alert_severity = COALESCE($5, alert_severity),
           notification_channels = COALESCE($6, notification_channels),
           updated_at = $7
       WHERE id = $8 RETURNING *`,
      [rule_type, threshold_value, comparison_operator, is_enabled, alert_severity, notification_channels, new Date().toISOString(), req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json(result.rows[0]);
  } catch (e) {
    logger.error('Failed to update monitoring rule', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Delete a monitoring rule
router.delete('/rules/:id', async (req, res) => {
  try {
    const result = await getDb().query(
      'DELETE FROM monitoring_rules WHERE id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json({ success: true });
  } catch (e) {
    logger.error('Failed to delete monitoring rule', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ─── NOTIFICATION CHANNELS ───

// Get notification channels for a user
router.get('/notification-channels/:user_id', async (req, res) => {
  try {
    const result = await getDb().query(
      'SELECT * FROM notification_channels WHERE user_id = $1 ORDER BY created_at DESC',
      [req.params.user_id]
    );

    res.json(result.rows);
  } catch (e) {
    logger.error('Failed to fetch notification channels', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Create a notification channel
router.post('/notification-channels', async (req, res) => {
  try {
    const { user_id, channel_type, is_enabled, config } = req.body;
    
    const result = await getDb().query(
      `INSERT INTO notification_channels (id, user_id, channel_type, is_enabled, config, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [require('uuid').v4(), user_id, channel_type, is_enabled !== false, config, new Date().toISOString(), new Date().toISOString()]
    );

    res.status(201).json(result.rows[0]);
  } catch (e) {
    logger.error('Failed to create notification channel', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Update a notification channel
router.put('/notification-channels/:id', async (req, res) => {
  try {
    const { is_enabled, config } = req.body;
    
    const result = await getDb().query(
      `UPDATE notification_channels 
       SET is_enabled = COALESCE($1, is_enabled),
           config = COALESCE($2, config),
           updated_at = $3
       WHERE id = $4 RETURNING *`,
      [is_enabled, config, new Date().toISOString(), req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    res.json(result.rows[0]);
  } catch (e) {
    logger.error('Failed to update notification channel', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Delete a notification channel
router.delete('/notification-channels/:id', async (req, res) => {
  try {
    const result = await getDb().query(
      'DELETE FROM notification_channels WHERE id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    res.json({ success: true });
  } catch (e) {
    logger.error('Failed to delete notification channel', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ─── HEALTH CHECK SERVICE CONTROL ───

// Start health checks for a connection
router.post('/health-checks/:connection_id/start', async (req, res) => {
  try {
    healthCheckService.startConnectionChecks(req.params.connection_id);
    res.json({ success: true, message: 'Health checks started' });
  } catch (e) {
    logger.error('Failed to start health checks', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Stop health checks for a connection
router.post('/health-checks/:connection_id/stop', async (req, res) => {
  try {
    healthCheckService.stopConnectionChecks(req.params.connection_id);
    res.json({ success: true, message: 'Health checks stopped' });
  } catch (e) {
    logger.error('Failed to stop health checks', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
