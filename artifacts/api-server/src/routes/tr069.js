/**
 * TR-069 (CPE WAN Management Protocol) Routes
 * Handles CPE device management and provisioning
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const tr069Service = require('../services/tr069Service');

// Get all TR-069 devices
router.get('/', async (req, res) => {
  try {
    const db = global.db || require('../db/memory');
    const result = await db.query('SELECT * FROM tr069_devices ORDER BY last_inform DESC NULLS LAST');
    res.json(result.rows);
  } catch (e) {
    logger.error('Failed to fetch TR-069 devices', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Get single TR-069 device
router.get('/:id', async (req, res) => {
  try {
    const db = global.db || require('../db/memory');
    const result = await db.query('SELECT * FROM tr069_devices WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {return res.status(404).json({ error: 'Device not found' });}
    res.json(result.rows[0]);
  } catch (e) {
    logger.error('Failed to fetch TR-069 device', { error: e.message, id: req.params.id });
    res.status(500).json({ error: e.message });
  }
});

// Get device by serial number
router.get('/serial/:serial', async (req, res) => {
  try {
    const db = global.db || require('../db/memory');
    const result = await db.query('SELECT * FROM tr069_devices WHERE serial_number = $1', [req.params.serial]);
    if (result.rows.length === 0) {return res.status(404).json({ error: 'Device not found' });}
    res.json(result.rows[0]);
  } catch (e) {
    logger.error('Failed to fetch TR-069 device by serial', { error: e.message, serial: req.params.serial });
    res.status(500).json({ error: e.message });
  }
});

// Register/add TR-069 device
router.post('/', async (req, res) => {
  try {
    const { serial_number, manufacturer, model, firmware_version, connection_id, ip_address, parameters } = req.body;
    const db = global.db || require('../db/memory');
    const { v4: uuidv4 } = require('uuid');

    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO tr069_devices (id, serial_number, manufacturer, model, firmware_version, connection_id, ip_address, status, last_inform, parameters, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (serial_number) DO UPDATE SET
         manufacturer = $3, model = $4, firmware_version = $5, connection_id = $6, ip_address = $7,
         last_inform = CURRENT_TIMESTAMP, parameters = $9, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [id, serial_number, manufacturer, model, firmware_version, connection_id || null, ip_address, 'online', parameters ? JSON.stringify(parameters) : null]
    );

    logger.info('TR-069 device registered', { id, serial_number });
    res.json(result.rows[0]);
  } catch (e) {
    logger.error('Failed to register TR-069 device', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Update TR-069 device
router.put('/:id', async (req, res) => {
  try {
    const { manufacturer, model, firmware_version, connection_id, ip_address, status, parameters } = req.body;
    const db = global.db || require('../db/memory');

    const result = await db.query(
      `UPDATE tr069_devices 
       SET manufacturer = $1, model = $2, firmware_version = $3, connection_id = $4, ip_address = $5, 
           status = $6, parameters = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [manufacturer, model, firmware_version, connection_id, ip_address, status, parameters ? JSON.stringify(parameters) : null, req.params.id]
    );

    if (result.rows.length === 0) {return res.status(404).json({ error: 'Device not found' });}

    logger.info('TR-069 device updated', { id: req.params.id });
    res.json(result.rows[0]);
  } catch (e) {
    logger.error('Failed to update TR-069 device', { error: e.message, id: req.params.id });
    res.status(500).json({ error: e.message });
  }
});

// Update device parameters (TR-069 Inform)
router.post('/:id/inform', async (req, res) => {
  try {
    const { parameters, firmware_version } = req.body;
    const db = global.db || require('../db/memory');

    const result = await db.query(
      `UPDATE tr069_devices 
       SET last_inform = CURRENT_TIMESTAMP, parameters = $1, firmware_version = COALESCE($2, firmware_version), status = 'online', updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [parameters ? JSON.stringify(parameters) : null, firmware_version, req.params.id]
    );

    if (result.rows.length === 0) {return res.status(404).json({ error: 'Device not found' });}

    logger.info('TR-069 device inform received', { id: req.params.id });
    res.json(result.rows[0]);
  } catch (e) {
    logger.error('Failed to process TR-069 inform', { error: e.message, id: req.params.id });
    res.status(500).json({ error: e.message });
  }
});

// Delete TR-069 device
router.delete('/:id', async (req, res) => {
  try {
    const db = global.db || require('../db/memory');
    const result = await db.query('DELETE FROM tr069_devices WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {return res.status(404).json({ error: 'Device not found' });}

    logger.info('TR-069 device deleted', { id: req.params.id });
    res.json({ success: true });
  } catch (e) {
    logger.error('Failed to delete TR-069 device', { error: e.message, id: req.params.id });
    res.status(500).json({ error: e.message });
  }
});

// Reboot device (TR-069 RPC)
router.post('/:id/reboot', async (req, res) => {
  try {
    const db = global.db || require('../db/memory');
    const result = await db.query('SELECT * FROM tr069_devices WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {return res.status(404).json({ error: 'Device not found' });}

    const device = result.rows[0];
    
    // Send reboot command via TR-069 service
    const rebootResult = await tr069Service.rebootDevice(device.serial_number);
    
    logger.info('TR-069 device reboot requested', { id: req.params.id, serial: device.serial_number });
    res.json({ success: true, message: 'Reboot command sent to device', ...rebootResult });
  } catch (e) {
    logger.error('Failed to reboot TR-069 device', { error: e.message, id: req.params.id });
    res.status(500).json({ error: e.message });
  }
});

// Factory reset device (TR-069 RPC)
router.post('/:id/factory-reset', async (req, res) => {
  try {
    const db = global.db || require('../db/memory');
    const result = await db.query('SELECT * FROM tr069_devices WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {return res.status(404).json({ error: 'Device not found' });}

    const device = result.rows[0];
    
    // Send factory reset command via TR-069 service
    const resetResult = await tr069Service.factoryResetDevice(device.serial_number);
    
    logger.info('TR-069 device factory reset requested', { id: req.params.id, serial: device.serial_number });
    res.json({ success: true, message: 'Factory reset command sent to device', ...resetResult });
  } catch (e) {
    logger.error('Failed to factory reset TR-069 device', { error: e.message, id: req.params.id });
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
