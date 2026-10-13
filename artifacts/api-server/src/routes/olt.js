/**
 * OLT Management Routes
 * Handles OLT connections, ONU management, and monitoring
 */

const express = require('express');
const router = express.Router();
const OLTService = require('../services/oltService');
const { validate, validations } = require('../middleware/validation');
const logger = require('../utils/logger');
const rateLimit = require('express-rate-limit');

// Rate limiting for OLT operations (prevent abuse)
const oltRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many OLT requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiting for command execution
const commandRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // Limit each IP to 20 commands per 5 minutes
  message: { error: 'Too many command executions, please wait' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ═══════════════════════════════════════
// OLT CONNECTIONS
// ═══════════════════════════════════════

// Get all OLT connections
router.get('/', async (req, res) => {
  try {
    const connections = await OLTService.getAllConnections();
    res.json(connections);
  } catch (e) {
    logger.error('Failed to get OLT connections', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Get single OLT connection
router.get('/:id', async (req, res) => {
  try {
    const connection = await OLTService.getConnection(req.params.id);
    if (!connection) {return res.status(404).json({ error: 'Not found' });}
    res.json(connection);
  } catch (e) {
    logger.error('Failed to get OLT connection', { error: e.message, id: req.params.id });
    res.status(500).json({ error: e.message });
  }
});

// Create/Update OLT connection
router.post('/', [
  validations.name,
  validations.status,
  validate,
], async (req, res) => {
  try {
    const { name, vendor, model, ip_address, telnet_port, snmp_port, username, password, snmp_community, location, status } = req.body;
    
    const connection = await OLTService.saveConnection({
      name,
      vendor: vendor.toLowerCase(), // huawei, zte, fiberhome
      model,
      ip_address,
      telnet_port,
      snmp_port,
      username,
      password,
      snmp_community,
      location,
      status,
    });

    logger.info('OLT connection saved', { id: connection.id, name, vendor });
    res.status(201).json(connection);
  } catch (e) {
    logger.error('Failed to save OLT connection', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Update OLT connection
router.put('/:id', async (req, res) => {
  try {
    const connection = await OLTService.saveConnection({
      id: req.params.id,
      ...req.body,
    });
    
    if (!connection) {return res.status(404).json({ error: 'Not found' });}
    logger.info('OLT connection updated', { id: req.params.id });
    res.json(connection);
  } catch (e) {
    logger.error('Failed to update OLT connection', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Delete OLT connection
router.delete('/:id', async (req, res) => {
  try {
    await OLTService.deleteConnection(req.params.id);
    logger.info('OLT connection deleted', { id: req.params.id });
    res.json({ success: true });
  } catch (e) {
    logger.error('Failed to delete OLT connection', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// OLT OPERATIONS
// ═══════════════════════════════════════

// Test OLT connectivity
router.post('/:id/test', async (req, res) => {
  try {
    const result = await OLTService.testConnection(req.params.id);
    res.json(result);
  } catch (e) {
    logger.error('OLT connection test failed', { error: e.message, id: req.params.id });
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get OLT system info
router.get('/:id/info', async (req, res) => {
  try {
    const info = await OLTService.getSystemInfo(req.params.id);
    res.json(info);
  } catch (e) {
    logger.error('Failed to get OLT info', { error: e.message, id: req.params.id });
    res.status(500).json({ error: e.message });
  }
});

// Get OLT statistics
router.get('/:id/statistics', async (req, res) => {
  try {
    const stats = await OLTService.getStatistics(req.params.id);
    res.json(stats);
  } catch (e) {
    logger.error('Failed to get OLT statistics', { error: e.message, id: req.params.id });
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// ONU MANAGEMENT
// ═══════════════════════════════════════

// Get all ONUs on OLT
router.get('/:id/onu', async (req, res) => {
  try {
    const result = await OLTService.getONUs(req.params.id);
    res.json(result);
  } catch (e) {
    logger.error('Failed to get ONUs', { error: e.message, id: req.params.id });
    res.status(500).json({ error: e.message });
  }
});

// Get PON ports
router.get('/:id/ports', async (req, res) => {
  try {
    const result = await OLTService.getPONPorts(req.params.id);
    res.json(result);
  } catch (e) {
    logger.error('Failed to get PON ports', { error: e.message, id: req.params.id });
    res.status(500).json({ error: e.message });
  }
});

// Get optical power levels
router.get('/:id/optical-power', async (req, res) => {
  try {
    const result = await OLTService.getONUs(req.params.id);
    res.json({ opticalPower: result.opticalPower || [] });
  } catch (e) {
    logger.error('Failed to get optical power', { error: e.message, id: req.params.id });
    res.status(500).json({ error: e.message });
  }
});

// Execute command on OLT (Telnet)
router.post('/:id/command', commandRateLimit, async (req, res) => {
  try {
    const { command } = req.body;
    if (!command) {return res.status(400).json({ error: 'Command required' });}

    logger.info('Executing OLT command', { id: req.params.id, command });
    const result = await OLTService.executeCommand(req.params.id, command);
    res.json(result);
  } catch (e) {
    logger.error('OLT command execution failed', { error: e.message, id: req.params.id });
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// MONITORING & ALERTS
// ═══════════════════════════════════════

// Get ONUs with low optical power (alert threshold)
router.get('/:id/alerts/low-power', async (req, res) => {
  try {
    const threshold = parseFloat(req.query.threshold) || -25; // dBm
    const result = await OLTService.getONUs(req.params.id);
    
    // Filter ONUs with low optical power
    const lowPowerONUs = (result.opticalPower || []).filter(op => {
      const power = parseFloat(op.value);
      return power < threshold;
    });

    res.json({
      threshold,
      count: lowPowerONUs.length,
      onus: lowPowerONUs,
    });
  } catch (e) {
    logger.error('Failed to get low power alerts', { error: e.message, id: req.params.id });
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
