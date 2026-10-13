/**
 * FUP (Fair Usage Policy) Routes
 * Handles FUP profile management for bandwidth throttling
 */

const express = require('express');
const router = express.Router();
const { validate, validations } = require('../middleware/validation');
const logger = require('../utils/logger');

// Get all FUP profiles
router.get('/', async (req, res) => {
  try {
    const db = global.db || require('../db/memory');
    const result = await db.query('SELECT * FROM fup_profiles ORDER BY priority ASC, name ASC');
    res.json(result.rows);
  } catch (e) {
    logger.error('Failed to fetch FUP profiles', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Get single FUP profile
router.get('/:id', async (req, res) => {
  try {
    const db = global.db || require('../db/memory');
    const result = await db.query('SELECT * FROM fup_profiles WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {return res.status(404).json({ error: 'FUP profile not found' });}
    res.json(result.rows[0]);
  } catch (e) {
    logger.error('Failed to fetch FUP profile', { error: e.message, id: req.params.id });
    res.status(500).json({ error: e.message });
  }
});

// Create FUP profile
router.post('/', async (req, res) => {
  try {
    const { name, description, data_limit, data_limit_unit, reset_period, throttle_speed, priority, is_active, plan_id } = req.body;
    const db = global.db || require('../db/memory');
    const { v4: uuidv4 } = require('uuid');

    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO fup_profiles (id, name, description, data_limit, data_limit_unit, reset_period, throttle_speed, priority, is_active, plan_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [id, name, description, data_limit, data_limit_unit || 'GB', reset_period || 'monthly', throttle_speed, priority || 100, is_active !== false, plan_id || null]
    );

    logger.info('FUP profile created', { id, name });
    res.json(result.rows[0]);
  } catch (e) {
    logger.error('Failed to create FUP profile', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Update FUP profile
router.put('/:id', async (req, res) => {
  try {
    const { name, description, data_limit, data_limit_unit, reset_period, throttle_speed, priority, is_active, plan_id } = req.body;
    const db = global.db || require('../db/memory');

    const result = await db.query(
      `UPDATE fup_profiles 
       SET name = $1, description = $2, data_limit = $3, data_limit_unit = $4, reset_period = $5, 
           throttle_speed = $6, priority = $7, is_active = $8, plan_id = $10, updated_at = CURRENT_TIMESTAMP
       WHERE id = $9
       RETURNING *`,
      [name, description, data_limit, data_limit_unit, reset_period, throttle_speed, priority, is_active, req.params.id, plan_id || null]
    );

    if (result.rows.length === 0) {return res.status(404).json({ error: 'FUP profile not found' });}

    logger.info('FUP profile updated', { id: req.params.id });
    res.json(result.rows[0]);
  } catch (e) {
    logger.error('Failed to update FUP profile', { error: e.message, id: req.params.id });
    res.status(500).json({ error: e.message });
  }
});

// Delete FUP profile
router.delete('/:id', async (req, res) => {
  try {
    const db = global.db || require('../db/memory');
    const result = await db.query('DELETE FROM fup_profiles WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {return res.status(404).json({ error: 'FUP profile not found' });}

    logger.info('FUP profile deleted', { id: req.params.id });
    res.json({ success: true });
  } catch (e) {
    logger.error('Failed to delete FUP profile', { error: e.message, id: req.params.id });
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
