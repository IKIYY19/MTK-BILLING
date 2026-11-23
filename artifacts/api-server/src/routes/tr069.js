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

async function findDeviceRow(id) {
  const db = global.db || require('../db/memory');
  const result = await db.query('SELECT * FROM tr069_devices WHERE id = $1', [id]);
  return result.rows[0] || null;
}

function acsId(row) {
  return row.acs_device_id || row.serial_number;
}

function respondWithTask(res, result) {
  if (!result.configured) {return res.status(503).json(result);}
  if (!result.success) {return res.status(502).json(result);}
  return res.json(result);
}

// GenieACS connection status
router.get('/acs/status', async (req, res) => {
  const status = await tr069Service.status();
  res.status(status.configured && !status.reachable ? 502 : 200).json(status);
});

// Import devices discovered by GenieACS
router.post('/sync', async (req, res) => {
  try {
    if (!global.dbAvailable) {return res.status(503).json({ error: 'Device sync requires PostgreSQL storage' });}
    const outcome = await tr069Service.listDevices(Number(req.body?.limit) || 500);
    if (!outcome.configured) {return res.status(503).json(outcome);}
    if (!outcome.success) {return res.status(502).json(outcome);}

    const db = global.db || require('../db/memory');
    let created = 0;
    let updated = 0;
    for (const device of outcome.devices) {
      const acsDeviceId = String(device._id || device._deviceId || '').trim();
      if (!acsDeviceId) {continue;}
      const parsed = tr069Service.parseDevice(device);
      const serial = parsed.serial.slice(0, 255) || acsDeviceId;
      const manufacturer = parsed.manufacturer;
      const model = parsed.model;
      const firmware = parsed.firmware;
      const lastInform = device._lastInform ? new Date(device._lastInform) : null;
      const status = lastInform && Date.now() - lastInform.getTime() < 5 * 60 * 1000 ? 'online' : 'offline';
      const parameters = parsed.parameters;
      const exists = await db.query('SELECT id FROM tr069_devices WHERE serial_number = $1', [serial]);
      if (exists.rows.length) {updated += 1;} else {created += 1;}
      await db.query(
        `INSERT INTO tr069_devices (serial_number, manufacturer, model, firmware_version, ip_address, status, last_inform, parameters, acs_device_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
         ON CONFLICT (serial_number) DO UPDATE SET
           manufacturer = EXCLUDED.manufacturer,
           model = EXCLUDED.model,
           firmware_version = EXCLUDED.firmware_version,
           ip_address = EXCLUDED.ip_address,
           status = EXCLUDED.status,
           last_inform = EXCLUDED.last_inform,
           parameters = EXCLUDED.parameters,
           acs_device_id = EXCLUDED.acs_device_id,
           updated_at = CURRENT_TIMESTAMP`,
        [serial, manufacturer, model, firmware, device._ip || null, status,
         lastInform ? lastInform.toISOString() : null, JSON.stringify(parameters), acsDeviceId],
      );
    }
    res.json({ success: true, configured: true, discovered: outcome.devices.length, created, updated });
  } catch (e) {
    logger.error('TR-069 sync failed', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Read parameters from the device via GenieACS
router.get('/:id/parameters', async (req, res) => {
  try {
    const row = await findDeviceRow(req.params.id);
    if (!row) {return res.status(404).json({ error: 'Device not found' });}
    const result = await tr069Service.getParameters(acsId(row));
    if (!result.configured) {return res.status(503).json(result);}
    if (!result.success) {return res.status(502).json(result);}
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Write parameters to the device via GenieACS
router.put('/:id/parameters', async (req, res) => {
  try {
    const row = await findDeviceRow(req.params.id);
    if (!row) {return res.status(404).json({ error: 'Device not found' });}
    const result = await tr069Service.setParameters(acsId(row), req.body?.parameters || {});
    respondWithTask(res, result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Firmware upgrade via TR-069 Download RPC
router.post('/:id/download', async (req, res) => {
  try {
    const row = await findDeviceRow(req.params.id);
    if (!row) {return res.status(404).json({ error: 'Device not found' });}
    const result = await tr069Service.downloadFirmware(acsId(row), req.body?.file_url);
    respondWithTask(res, result);
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    
    const rebootResult = await tr069Service.rebootDevice(acsId(device));
    logger.info('TR-069 device reboot requested', { id: req.params.id, serial: device.serial_number });
    respondWithTask(res, rebootResult);
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
    
    const resetResult = await tr069Service.factoryResetDevice(acsId(device));
    logger.info('TR-069 device factory reset requested', { id: req.params.id, serial: device.serial_number });
    respondWithTask(res, resetResult);
  } catch (e) {
    logger.error('Failed to factory reset TR-069 device', { error: e.message, id: req.params.id });
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
