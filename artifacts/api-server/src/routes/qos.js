/**
 * QoS (Quality of Service) Profiles Management
 * Manage bandwidth limiting, prioritization, and traffic shaping profiles
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

const getDb = () => global.dbAvailable ? global.db : require('../db/memory');

// ─── QoS PROFILES ───

// Get all QoS profiles
router.get('/profiles', async (req, res) => {
  try {
    if (!global.db) {
      return res.json([]);
    }

    const result = await getDb().query(
      `SELECT qp.*,
        (SELECT COUNT(*) FROM service_plans WHERE qos_profile_id = qp.id) as plan_count
       FROM qos_profiles qp
       ORDER BY qp.name ASC`
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get QoS profile by ID
router.get('/profiles/:id', async (req, res) => {
  try {
    const result = await getDb().query(
      'SELECT * FROM qos_profiles WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'QoS profile not found' });
    }
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create QoS profile
router.post('/profiles', async (req, res) => {
  try {
    const {
      name,
      description,
      max_upload,
      max_download,
      burst_upload,
      burst_download,
      burst_time,
      priority,
      limit_at,
      parent_profile_id
    } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    if (!global.db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const id = uuidv4();
    const result = await getDb().query(
      `INSERT INTO qos_profiles (id, name, description, max_upload, max_download, burst_upload, burst_download, burst_time, priority, limit_at, parent_profile_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        id,
        name,
        description || '',
        max_upload || null,
        max_download || null,
        burst_upload || null,
        burst_download || null,
        burst_time || null,
        priority || 'normal',
        limit_at || null,
        parent_profile_id || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error('QoS profile creation error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Update QoS profile
router.put('/profiles/:id', async (req, res) => {
  try {
    const {
      name,
      description,
      max_upload,
      max_download,
      burst_upload,
      burst_download,
      burst_time,
      priority,
      limit_at,
      parent_profile_id
    } = req.body || {};

    if (!global.db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const result = await getDb().query(
      `UPDATE qos_profiles
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           max_upload = COALESCE($3, max_upload),
           max_download = COALESCE($4, max_download),
           burst_upload = COALESCE($5, burst_upload),
           burst_download = COALESCE($6, burst_download),
           burst_time = COALESCE($7, burst_time),
           priority = COALESCE($8, priority),
           limit_at = COALESCE($9, limit_at),
           parent_profile_id = COALESCE($10, parent_profile_id)
       WHERE id = $11 RETURNING *`,
      [
        name,
        description,
        max_upload,
        max_download,
        burst_upload,
        burst_download,
        burst_time,
        priority,
        limit_at,
        parent_profile_id,
        req.params.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'QoS profile not found' });
    }

    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete QoS profile
router.delete('/profiles/:id', async (req, res) => {
  try {
    if (!global.db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    // Check if profile is in use
    const checkResult = await getDb().query(
      'SELECT COUNT(*) FROM service_plans WHERE qos_profile_id = $1',
      [req.params.id]
    );

    if (parseInt(checkResult.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete QoS profile that is in use by service plans' });
    }

    const result = await getDb().query(
      'DELETE FROM qos_profiles WHERE id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'QoS profile not found' });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── QoS RULES ───

// Get QoS rules for a profile
router.get('/profiles/:profile_id/rules', async (req, res) => {
  try {
    if (!global.db) {
      return res.json([]);
    }

    const result = await getDb().query(
      'SELECT * FROM qos_rules WHERE profile_id = $1 ORDER BY priority ASC',
      [req.params.profile_id]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create QoS rule
router.post('/profiles/:profile_id/rules', async (req, res) => {
  try {
    const {
      name,
      protocol,
      src_port,
      dst_port,
      src_address,
      dst_address,
      priority,
      action
    } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    if (!global.db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const id = uuidv4();
    const result = await getDb().query(
      `INSERT INTO qos_rules (id, profile_id, name, protocol, src_port, dst_port, src_address, dst_address, priority, action)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        id,
        req.params.profile_id,
        name,
        protocol || null,
        src_port || null,
        dst_port || null,
        src_address || null,
        dst_address || null,
        priority || 0,
        action || 'limit'
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update QoS rule
router.put('/rules/:id', async (req, res) => {
  try {
    const {
      name,
      protocol,
      src_port,
      dst_port,
      src_address,
      dst_address,
      priority,
      action
    } = req.body || {};

    if (!global.db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const result = await getDb().query(
      `UPDATE qos_rules
       SET name = COALESCE($1, name),
           protocol = COALESCE($2, protocol),
           src_port = COALESCE($3, src_port),
           dst_port = COALESCE($4, dst_port),
           src_address = COALESCE($5, src_address),
           dst_address = COALESCE($6, dst_address),
           priority = COALESCE($7, priority),
           action = COALESCE($8, action)
       WHERE id = $9 RETURNING *`,
      [
        name,
        protocol,
        src_port,
        dst_port,
        src_address,
        dst_address,
        priority,
        action,
        req.params.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'QoS rule not found' });
    }

    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete QoS rule
router.delete('/rules/:id', async (req, res) => {
  try {
    if (!global.db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const result = await getDb().query(
      'DELETE FROM qos_rules WHERE id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'QoS rule not found' });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
