const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const routerConnectionManager = require('../services/routerConnectionManager');
const mikrotikProvisioning = require('../services/mikrotikProvisioning');
const hotspotProvisioning = require('../services/hotspotProvisioning');
const { parseUptime, getOnlineStatus } = require('../services/onlineStatus');
const billingData = require('../services/billingData');
const realtimeTraffic = require('../services/realtimeTraffic');

// Live RX/TX rates sampled from RouterOS counters (not cumulative byte totals).
router.get('/network/realtime', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(realtimeTraffic.getLatest());
});

router.post('/network/realtime/sample', async (req, res) => {
  try {
    res.json(await realtimeTraffic.sample());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Helper: get MikroTik connection
async function getMikrotikConnection(connectionId) {
  const db = global.db || require('../db/memory');
  const result = await db.query('SELECT * FROM mikrotik_connections WHERE id = $1', [connectionId]);
  if (result.rows.length === 0) {throw new Error('Connection not found');}

  const device = result.rows[0];
  device.password = routerConnectionManager.decryptPassword(device.password_encrypted);
  return device;
}

// Helper: execute MikroTik command
async function executeCommand(device, command, args = {}) {
  try {
    return await routerConnectionManager.executeCommand(device, command, args);
  } catch (error) {
    throw new Error(`MikroTik API error: ${error.message}`);
  }
}

// Helper: get all from MikroTik path
async function getFromMikrotik(device, path, proplist = '.id,name,comment,disabled') {
  try {
    return await routerConnectionManager.executeCommand(device, path + '/print', { 
      '.proplist': proplist
    });
  } catch (error) {
    console.error(`MikroTik get error: ${error.message}`);
    return [];
  }
}

async function listConnections(connectionId) {
  const db = global.db || require('../db/memory');
  const result = connectionId
    ? await db.query('SELECT * FROM mikrotik_connections WHERE id = $1', [connectionId])
    : await db.query('SELECT * FROM mikrotik_connections ORDER BY name ASC');
  return result.rows;
}

// ═══════════════════════════════════════
// PPPoE ROUTES
// ═══════════════════════════════════════

// Get PPPoE secrets
router.get('/pppoe/secrets', async (req, res) => {
  try {
    const { connection_id } = req.query;
    const rows = [];
    for (const device of await listConnections(connection_id)) {
      const result = await getFromMikrotik(
        device,
        '/ppp/secret',
        '.id,name,password,service,profile,disabled,comment',
      ).catch(() => []);
      for (const row of (Array.isArray(result) ? result : [])) {
        rows.push({ ...row, connection_id: device.id, router_name: device.name });
      }
    }
    res.set('Cache-Control', 'no-store');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update PPPoE secret
router.put('/pppoe/secrets/:name', async (req, res) => {
  try {
    const { connection_id, password, profile, service, comment, rate_limit, disabled, local_address, remote_address, routes } = req.body;
    const { name } = req.params;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}

    const device = await getMikrotikConnection(connection_id);
    const secrets = await getFromMikrotik(device, '/ppp/secret', '.id,name');
    const existing = secrets.find((s) => s.name === name);
    if (!existing?.['.id']) {return res.status(404).json({ error: 'PPPoE secret not found' });}

    const args = { 'numbers': existing['.id'] };
    if (password !== undefined) {args.password = String(password);}
    if (service !== undefined) {args.service = String(service);}
    if (comment !== undefined) {args.comment = String(comment);}
    if (disabled !== undefined) {args.disabled = disabled ? 'yes' : 'no';}
    if (local_address) {args['local-address'] = String(local_address);}
    if (remote_address) {args['remote-address'] = String(remote_address);}
    if (routes) {args.routes = String(routes);}
    if (rate_limit) {
      args.profile = await mikrotikProvisioning.ensureRateLimitProfile(device, rate_limit, profile);
    } else if (profile !== undefined) {
      args.profile = String(profile);
    }

    await executeCommand(device, '/ppp/secret/set', args);
    res.json({ success: true, message: 'PPPoE secret updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create PPPoE secret
router.post('/pppoe/secrets', async (req, res) => {
  try {
    const { connection_id, name, password, service, profile, rate_limit, comment, local_address, remote_address, routes } = req.body;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}

    const device = await getMikrotikConnection(connection_id);
    const args = { name, password, service: service || 'pppoe' };
    if (rate_limit) {args.profile = await mikrotikProvisioning.ensureRateLimitProfile(device, rate_limit, profile);}
    else if (profile) {args.profile = profile;}
    if (comment) {args.comment = comment;}
    if (local_address) {args['local-address'] = String(local_address);}
    if (remote_address) {args['remote-address'] = String(remote_address);}
    if (routes) {args.routes = String(routes);}

    await executeCommand(device, '/ppp/secret/add', args);
    res.json({ success: true, message: 'PPPoE secret created' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete PPPoE secret
router.delete('/pppoe/secrets/:name', async (req, res) => {
  try {
    const { connection_id } = req.query;
    const { name } = req.params;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}

    const device = await getMikrotikConnection(connection_id);
    await executeCommand(device, '/ppp/secret/remove', { 'numbers': name });
    res.json({ success: true, message: 'PPPoE secret deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Toggle PPPoE secret
router.post('/pppoe/secrets/:name/toggle', async (req, res) => {
  try {
    const { connection_id } = req.query;
    const { name } = req.params;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}

    const device = await getMikrotikConnection(connection_id);
    // Find the secret to get current disabled status
    const secrets = await getFromMikrotik(device, '/ppp/secret');
    const secret = secrets.find(s => s.name === name);
    const isDisabled = secret?.disabled === 'true' || secret?.disabled === 'yes';

    await executeCommand(device, `/ppp/secret/set`, { 'numbers': name, 'disabled': isDisabled ? 'no' : 'yes' });
    res.json({ success: true, message: `PPPoE secret ${isDisabled ? 'enabled' : 'disabled'}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get PPPoE profiles
router.get('/pppoe/profiles', async (req, res) => {
  try {
    const { connection_id } = req.query;
    const rows = [];
    for (const device of await listConnections(connection_id)) {
      const result = await getFromMikrotik(
        device,
        '/ppp/profile',
        '.id,name,rate-limit,local-address,remote-address,dns-server,only-one,comment',
      ).catch(() => []);
      for (const row of (Array.isArray(result) ? result : [])) {
        rows.push({ ...row, connection_id: device.id, router_name: device.name });
      }
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create PPPoE profile
router.post('/pppoe/profiles', async (req, res) => {
  try {
    const { connection_id, name, local_address, remote_address, rate_limit, dns_server } = req.body;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}

    const device = await getMikrotikConnection(connection_id);
    const args = { name };
    if (local_address) {args['local-address'] = local_address;}
    if (remote_address) {args['remote-address'] = remote_address;}
    if (rate_limit) {args['rate-limit'] = rate_limit;}
    if (dns_server) {args['dns-server'] = dns_server;}

    await executeCommand(device, '/ppp/profile/add', args);
    res.json({ success: true, message: 'PPPoE profile created' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update PPPoE profile
router.put('/pppoe/profiles/:name', async (req, res) => {
  try {
    const { connection_id, name: newName, local_address, remote_address, rate_limit, dns_server } = req.body;
    const { name } = req.params;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}

    const device = await getMikrotikConnection(connection_id);
    const profiles = await getFromMikrotik(device, '/ppp/profile', '.id,name');
    const existing = profiles.find((p) => p.name === name);
    if (!existing?.['.id']) {return res.status(404).json({ error: 'PPPoE profile not found' });}

    const args = { 'numbers': existing['.id'] };
    if (newName !== undefined) {args.name = String(newName);}
    if (local_address !== undefined) {args['local-address'] = String(local_address);}
    if (remote_address !== undefined) {args['remote-address'] = String(remote_address);}
    if (rate_limit !== undefined) {args['rate-limit'] = String(rate_limit);}
    if (dns_server !== undefined) {args['dns-server'] = String(dns_server);}

    await executeCommand(device, '/ppp/profile/set', args);
    res.json({ success: true, message: 'PPPoE profile updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete PPPoE profile
router.delete('/pppoe/profiles/:name', async (req, res) => {
  try {
    const { connection_id } = req.query;
    const { name } = req.params;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}

    const device = await getMikrotikConnection(connection_id);
    await executeCommand(device, '/ppp/profile/remove', { 'numbers': name });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get PPPoE active sessions
router.get('/pppoe/active', async (req, res) => {
  try {
    const { connection_id } = req.query;
    const rows = [];
    for (const device of await listConnections(connection_id)) {
      const result = await getFromMikrotik(
        device,
        '/ppp/active',
        '.id,name,address,uptime,encoding,comment,caller-id',
      ).catch(() => []);
      for (const row of (Array.isArray(result) ? result : [])) {
        rows.push({
          ...row,
          connection_id: device.id,
          router_name: device.name,
          uptime_seconds: parseUptime(row.uptime),
        });
      }
    }
    res.set('Cache-Control', 'no-store');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Apply a plan's current speed/burst to an already-connected PPPoE session.
router.post('/pppoe/secrets/:name/apply-rate', async (req, res) => {
  try {
    const username = req.params.name;
    const subscriptions = await billingData.listSubscriptions();
    const subscription = subscriptions.find((sub) => sub.pppoe_username === username);
    if (!subscription) {
      return res.status(404).json({ error: 'No billing subscription uses this PPPoE username' });
    }
    const plan = subscription.plan_id
      ? await billingData.getPlanById(subscription.plan_id)
      : subscription.plan;
    const rateLimit = mikrotikProvisioning.buildRateLimit(plan);
    if (!rateLimit) {
      return res.status(400).json({ error: 'The plan has no speed limit configured' });
    }
    const connectionId = req.body?.connection_id || subscription.mikrotik_connection_id;
    const applied = await mikrotikProvisioning.applyRateLimitToActiveSession(
      connectionId, username, rateLimit,
    );
    res.json({
      success: Boolean(applied),
      rate_limit: rateLimit,
      applied,
      message: applied
        ? `Applied ${rateLimit} to the live session`
        : 'Session is not connected or its queue was not found',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Kick PPPoE user
router.post('/pppoe/active/:name/kick', async (req, res) => {
  try {
    const { connection_id } = req.query;
    const { name } = req.params;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}

    const device = await getMikrotikConnection(connection_id);
    await executeCommand(device, '/ppp/active/remove', { 'numbers': name });
    res.json({ success: true, message: 'User disconnected' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════
// HOTSPOT ROUTES
// ═══════════════════════════════════════

// Get Hotspot users
router.get('/hotspot/users', async (req, res) => {
  try {
    const { connection_id } = req.query;
    if (!connection_id) {return res.json([]);}

    const device = await getMikrotikConnection(connection_id);
    const result = await getFromMikrotik(
      device,
      '/ip/hotspot/user',
      '.id,name,profile,comment,disabled,limit-uptime,limit-bytes-total',
    );
    res.json(Array.isArray(result) ? result : []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create Hotspot user
router.post('/hotspot/users', async (req, res) => {
  try {
    const { connection_id, name, password, profile, disabled, comment, limit_bytes_total, rate_limit } = req.body;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}

    const device = await getMikrotikConnection(connection_id);
    const args = { name, password };
    if (rate_limit) {
      args.profile = await hotspotProvisioning.ensureRateLimitProfile(
        connection_id, rate_limit, profile || 'default',
      );
    } else if (profile) {
      args.profile = profile;
    }
    if (disabled) {args.disabled = disabled;}
    if (comment) {args.comment = comment;}
    if (limit_bytes_total) {args['limit-bytes-total'] = limit_bytes_total;}

    await executeCommand(device, '/ip/hotspot/user/add', args);
    res.json({ success: true, message: 'Hotspot user created' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete Hotspot user
router.delete('/hotspot/users/:name', async (req, res) => {
  try {
    const { connection_id } = req.query;
    const { name } = req.params;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}

    const device = await getMikrotikConnection(connection_id);
    await executeCommand(device, '/ip/hotspot/user/remove', { 'numbers': name });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Toggle Hotspot user
router.post('/hotspot/users/:name/toggle', async (req, res) => {
  try {
    const { connection_id } = req.query;
    const { name } = req.params;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}

    const device = await getMikrotikConnection(connection_id);
    const users = await getFromMikrotik(device, '/ip/hotspot/user');
    const user = users.find(u => u.name === name);
    const isDisabled = user?.disabled === 'true' || user?.disabled === 'yes';

    await executeCommand(device, '/ip/hotspot/user/set', { 'numbers': name, 'disabled': isDisabled ? 'no' : 'yes' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const MAC_PATTERN = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

// Get MAC/IP bindings (TVs, printers and other browserless devices)
router.get('/hotspot/mac-bindings', async (req, res) => {
  try {
    const { connection_id } = req.query;
    if (!connection_id) {return res.json([]);}
    const device = await getMikrotikConnection(connection_id);
    const result = await routerConnectionManager.executeCommand(
      device,
      '/ip/hotspot/ip-binding/print',
      { '.proplist': '.id,mac-address,address,type,disabled,comment' },
    );
    res.json(Array.isArray(result) ? result : []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create a MAC binding. "bypassed" gives the device internet without a portal.
router.post('/hotspot/mac-bindings', async (req, res) => {
  try {
    const { connection_id, mac_address, type, address, comment } = req.body;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}
    const mac = String(mac_address || '').trim().replace(/-/g, ':').toUpperCase();
    if (!MAC_PATTERN.test(mac)) {
      return res.status(400).json({ error: 'Enter a valid MAC address, e.g. AA:BB:CC:DD:EE:FF' });
    }
    const bindingType = ['bypassed', 'blocked', 'regular'].includes(type) ? type : 'bypassed';
    const device = await getMikrotikConnection(connection_id);
    const args = { 'mac-address': mac, type: bindingType };
    if (address) {args.address = String(address).trim().slice(0, 64);}
    if (comment) {args.comment = String(comment).trim().slice(0, 200);}
    await executeCommand(device, '/ip/hotspot/ip-binding/add', args);
    res.json({ success: true, message: 'MAC binding created' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete a MAC binding by RouterOS id
router.delete('/hotspot/mac-bindings/:id', async (req, res) => {
  try {
    const { connection_id } = req.query;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}
    const device = await getMikrotikConnection(connection_id);
    await executeCommand(device, '/ip/hotspot/ip-binding/remove', { numbers: req.params.id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Enable/disable a MAC binding
router.post('/hotspot/mac-bindings/:id/toggle', async (req, res) => {
  try {
    const { connection_id } = req.query;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}
    const device = await getMikrotikConnection(connection_id);
    const bindings = await routerConnectionManager.executeCommand(
      device,
      '/ip/hotspot/ip-binding/print',
      { '.proplist': '.id,disabled' },
    );
    const binding = (Array.isArray(bindings) ? bindings : []).find(b => b['.id'] === req.params.id);
    const isDisabled = ['true', 'yes'].includes(String(binding?.disabled || '').toLowerCase());
    await executeCommand(device, '/ip/hotspot/ip-binding/set', {
      numbers: req.params.id,
      disabled: isDisabled ? 'no' : 'yes',
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get Hotspot profiles
router.get('/hotspot/profiles', async (req, res) => {
  try {
    const { connection_id } = req.query;
    if (!connection_id) {return res.json([]);}

    const device = await getMikrotikConnection(connection_id);
    const result = await getFromMikrotik(device, '/ip/hotspot/profile');
    res.json(Array.isArray(result) ? result : []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// User profiles are a different RouterOS menu from hotspot server profiles.
// Hotspot users and vouchers must reference /ip/hotspot/user/profile names.
router.get('/hotspot/user-profiles', async (req, res) => {
  try {
    const { connection_id } = req.query;
    if (!connection_id) {return res.json([]);}
    const device = await getMikrotikConnection(connection_id);
    const result = await getFromMikrotik(device, '/ip/hotspot/user/profile', '.id,name,rate-limit');
    res.json(Array.isArray(result) ? result : []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create a hotspot USER profile (where RouterOS applies rate limits)
router.post('/hotspot/user-profiles', async (req, res) => {
  try {
    const { connection_id, name, rate_limit, session_timeout, shared_users } = req.body;
    if (!connection_id || !name) {return res.status(400).json({ error: 'Connection ID and name required' });}
    const device = await getMikrotikConnection(connection_id);
    const args = { name };
    if (rate_limit) {args['rate-limit'] = rate_limit;}
    if (session_timeout) {args['session-timeout'] = session_timeout;}
    if (shared_users) {args['shared-users'] = shared_users;}
    await executeCommand(device, '/ip/hotspot/user/profile/add', args);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/hotspot/user-profiles/:name', async (req, res) => {
  try {
    const { connection_id } = req.query;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}
    const device = await getMikrotikConnection(connection_id);
    await executeCommand(device, '/ip/hotspot/user/profile/remove', { numbers: req.params.name });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create Hotspot profile
router.post('/hotspot/profiles', async (req, res) => {
  try {
    const { connection_id, name, rate_limit, shared_users, session_timeout, idle_timeout, login_by, advertising } = req.body;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}

    const device = await getMikrotikConnection(connection_id);
    const args = { name };
    if (rate_limit) {args['rate-limit'] = rate_limit;}
    if (shared_users) {args['shared-users'] = shared_users;}
    if (session_timeout) {args['session-timeout'] = session_timeout;}
    if (idle_timeout) {args['idle-timeout'] = idle_timeout;}
    if (login_by) {args['login-by'] = login_by;}
    if (advertising) {args.advertising = advertising;}

    await executeCommand(device, '/ip/hotspot/profile/add', args);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete Hotspot profile
router.delete('/hotspot/profiles/:name', async (req, res) => {
  try {
    const { connection_id } = req.query;
    const { name } = req.params;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}

    const device = await getMikrotikConnection(connection_id);
    await executeCommand(device, '/ip/hotspot/profile/remove', { 'numbers': name });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get Hotspot active sessions
router.get('/hotspot/active', async (req, res) => {
  try {
    const { connection_id } = req.query;
    if (!connection_id) {return res.json([]);}

    const device = await getMikrotikConnection(connection_id);
    const result = await getFromMikrotik(device, '/ip/hotspot/active');
    res.json(Array.isArray(result) ? result : []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Kick Hotspot user
router.post('/hotspot/active/:address/kick', async (req, res) => {
  try {
    const { connection_id } = req.query;
    const { address } = req.params;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}

    const device = await getMikrotikConnection(connection_id);
    await executeCommand(device, '/ip/hotspot/active/remove', { 'numbers': address });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get Hotspot vouchers
router.get('/network/vouchers', async (req, res) => {
  try {
    const db = global.db || require('../db/memory');
    const result = await db.query('SELECT * FROM hotspot_vouchers ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function voucherUptime(value) {
  const text = String(value || '').trim();
  if (!text) {return null;}
  if (/^\d+(?:\.\d+)?[smhdw]$/i.test(text)) {return text;}
  if (/^\d+(?:\.\d+)?$/.test(text)) {return `${text}h`;}
  return null;
}

function voucherBytes(value) {
  const match = String(value || '').trim().match(/^(\d+(?:\.\d+)?)\s*([KMGT]?)B?$/i);
  if (!match) {return null;}
  const multiplier = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }[match[2].toUpperCase()];
  return Math.floor(Number(match[1]) * multiplier);
}

// Create Hotspot vouchers (batch).
// Code-only vouchers: the customer enters a single code on the Giraffe Hotspot
// portal. No RouterOS user is created here — it is created at redemption, with
// the plan's real speed/validity, bound to the redeeming device.
router.post('/network/vouchers', async (req, res) => {
  try {
    const db = global.db || require('../db/memory');
    const { v4: uuidv4 } = require('uuid');
    const { vouchers, connection_id } = req.body;
    let entries = [];

    if (Array.isArray(vouchers) && vouchers.length) {
      entries = vouchers.map((v) => ({ ...v }));
    } else {
      const quantity = Number(req.body.quantity || 0);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 200) {
        return res.status(400).json({ error: 'Generate between 1 and 200 vouchers' });
      }
      const prefix = String(req.body.prefix || 'GH').replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'GH';
      const codeLength = Math.min(Math.max(Number(req.body.code_length || 8), 4), 16);
      const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      const seen = new Set();
      while (entries.length < quantity) {
        const bytes = crypto.randomBytes(codeLength);
        let suffix = '';
        for (let i = 0; i < codeLength; i += 1) {
          suffix += alphabet[bytes[i] % alphabet.length];
        }
        const code = `${prefix}-${suffix}`;
        if (seen.has(code)) {continue;}
        seen.add(code);
        entries.push({
          code,
          plan_id: req.body.plan_id,
          company_name: req.body.company_name || 'Giraffe Hotspot',
          connection_id: connection_id || null,
        });
      }
    }

    if (entries.length === 0) {
      return res.status(400).json({ error: 'At least one voucher is required' });
    }
    if (entries.length > 200) {
      return res.status(400).json({ error: 'A batch may contain at most 200 vouchers' });
    }

    const plans = new Map();
    const created = [];
    for (const v of entries) {
      const code = String(v.code || v.username || '').trim().toUpperCase();
      if (!code) {continue;}
      const planId = v.plan_id || null;
      if (planId && !plans.has(planId)) {
        const found = await db.query(
          `SELECT id, name, price, validity_days, speed_up, speed_down, quota_gb
           FROM service_plans WHERE id = $1 AND plan_type = 'hotspot' AND is_active = true`,
          [planId],
        );
        plans.set(planId, found.rows[0] || null);
      }
      const plan = planId ? plans.get(planId) : null;
      if (planId && !plan) {
        return res.status(400).json({ error: 'The selected hotspot plan is not available' });
      }
      const rate = plan ? `${plan.speed_up}/${plan.speed_down}` : (v.rate_limit || '');
      const uptime = plan ? `${Number(plan.validity_days)}d` : (voucherUptime(v.valid_for) || '');
      const dataLimit = plan && Number(plan.quota_gb) > 0
        ? `${plan.quota_gb}G`
        : (v.data_limit || '');
      const id = uuidv4();
      const result = await db.query(
        `INSERT INTO hotspot_vouchers
           (id, code, username, password, profile, valid_for, rate_limit, data_limit,
            price, company_name, connection_id, plan_id, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'unused',$13)
         RETURNING id, code`,
        [
          id, code, code, code,
          plan?.name || v.profile || 'default',
          uptime, rate, dataLimit,
          plan ? Number(plan.price) : Number(v.price || 0),
          v.company_name || 'Giraffe Hotspot',
          v.connection_id || connection_id || null,
          planId,
          new Date().toISOString(),
        ],
      );
      created.push({
        id: result.rows[0]?.id || id,
        code,
        plan_id: planId,
        plan_name: plan?.name || v.profile || 'default',
        company_name: v.company_name || 'Giraffe Hotspot',
        price: plan ? Number(plan.price) : Number(v.price || 0),
        valid_for: uptime,
        rate_limit: rate,
        connection_id: v.connection_id || connection_id || null,
      });
    }

    for (const voucher of created) {
      require('../services/networkAlertService')
        .recordVoucher('created', voucher.code, `${created.length} vouchers in batch`)
        .catch(() => {});
    }
    res.json({
      success: created.length > 0,
      count: created.length,
      codes: created,
      message: `${created.length} voucher code(s) generated. Customers enter only the code on the hotspot portal.`,
    });
  } catch (e) {
    console.error('Failed to create vouchers:', e);
    res.status(500).json({ error: e.message });
  }
});

// Delete voucher
router.delete('/network/vouchers/:id', async (req, res) => {
  try {
    const db = global.db || require('../db/memory');
    await db.query('DELETE FROM hotspot_vouchers WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════
// NETWORK SERVICES ROUTES
// ═══════════════════════════════════════

// Get Simple Queues
router.get('/network/queues', async (req, res) => {
  try {
    const { connection_id } = req.query;
    if (!connection_id) {return res.json([]);}

    const device = await getMikrotikConnection(connection_id);
    const result = await getFromMikrotik(device, '/queue/simple');
    res.json(Array.isArray(result) ? result : []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create Simple Queue
router.post('/network/queues', async (req, res) => {
  try {
    const { connection_id, name, target, max_limit, priority, parent, comment, limit_at, burst_limit, burst_threshold, burst_time, queue_type } = req.body;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}

    const device = await getMikrotikConnection(connection_id);
    const args = { name };
    if (target) {args.target = target;}
    if (max_limit) {args['max-limit'] = max_limit;}
    if (priority) {args.priority = priority;}
    if (parent) {args.parent = parent;}
    if (limit_at) {args['limit-at'] = limit_at;}
    if (burst_limit) {args['burst-limit'] = burst_limit;}
    if (burst_threshold) {args['burst-threshold'] = burst_threshold;}
    if (burst_time) {args['burst-time'] = burst_time;}
    if (queue_type) {args['queue-type'] = queue_type;}
    if (comment) {args.comment = comment;}

    await executeCommand(device, '/queue/simple/add', args);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete queue
router.delete('/network/queues/:name', async (req, res) => {
  try {
    const { connection_id } = req.query;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}

    const device = await getMikrotikConnection(connection_id);
    await executeCommand(device, '/queue/simple/remove', { 'numbers': req.params.name });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Toggle queue
router.post('/network/queues/:name/toggle', async (req, res) => {
  try {
    const { connection_id } = req.query;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}

    const device = await getMikrotikConnection(connection_id);
    const queues = await getFromMikrotik(device, '/queue/simple');
    const queue = queues.find(q => q.name === req.params.name);
    const isDisabled = queue?.disabled === 'true' || queue?.disabled === 'yes';

    await executeCommand(device, '/queue/simple/set', { 'numbers': req.params.name, 'disabled': isDisabled ? 'no' : 'yes' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get DHCP Leases
router.get('/network/dhcp-leases', async (req, res) => {
  try {
    const { connection_id } = req.query;
    if (!connection_id) {return res.json([]);}

    const device = await getMikrotikConnection(connection_id);
    const result = await getFromMikrotik(device, '/ip/dhcp-server/lease');
    res.json(Array.isArray(result) ? result : []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get DHCP Networks
router.get('/network/dhcp-networks', async (req, res) => {
  try {
    const { connection_id } = req.query;
    if (!connection_id) {return res.json([]);}

    const device = await getMikrotikConnection(connection_id);
    const result = await getFromMikrotik(device, '/ip/dhcp-server/network');
    res.json(Array.isArray(result) ? result : []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get DHCP Servers
router.get('/network/dhcp-servers', async (req, res) => {
  try {
    const { connection_id } = req.query;
    if (!connection_id) {return res.json([]);}

    const device = await getMikrotikConnection(connection_id);
    const result = await getFromMikrotik(device, '/ip/dhcp-server');
    res.json(Array.isArray(result) ? result : []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get DNS Settings
router.get('/network/dns', async (req, res) => {
  try {
    const { connection_id } = req.query;
    if (!connection_id) {return res.json(null);}

    const device = await getMikrotikConnection(connection_id);
    const result = await routerConnectionManager.print(device, '/ip/dns');
    res.json(Array.isArray(result) && result.length > 0 ? result[0] : null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get Firewall rules
router.get('/network/firewall', async (req, res) => {
  try {
    const { connection_id } = req.query;
    if (!connection_id) {return res.json([]);}

    const device = await getMikrotikConnection(connection_id);
    const result = await getFromMikrotik(device, '/ip/firewall/filter');
    res.json(Array.isArray(result) ? result : []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create Firewall rule
router.post('/network/firewall', async (req, res) => {
  try {
    const { connection_id, chain, action, src_address, dst_address, protocol, dst_port, comment } = req.body;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}

    const device = await getMikrotikConnection(connection_id);
    const args = { chain: chain || 'forward', action };
    if (src_address) {args['src-address'] = src_address;}
    if (dst_address) {args['dst-address'] = dst_address;}
    if (protocol) {args.protocol = protocol;}
    if (dst_port) {args['dst-port'] = dst_port;}
    if (comment) {args.comment = comment;}

    await executeCommand(device, '/ip/firewall/filter/add', args);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete Firewall rule
router.delete('/network/firewall/:id', async (req, res) => {
  try {
    const { connection_id } = req.query;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}

    const device = await getMikrotikConnection(connection_id);
    await executeCommand(device, '/ip/firewall/filter/remove', { 'numbers': req.params.id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Toggle Firewall rule
router.post('/network/firewall/:id/toggle', async (req, res) => {
  try {
    const { connection_id } = req.query;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}

    const device = await getMikrotikConnection(connection_id);
    const rules = await getFromMikrotik(device, '/ip/firewall/filter');
    const rule = rules.find(r => r['.id'] === req.params.id || r.id === req.params.id);
    const isDisabled = rule?.disabled === 'true' || rule?.disabled === 'yes';

    await executeCommand(device, '/ip/firewall/filter/set', { 'numbers': req.params.id, 'disabled': isDisabled ? 'no' : 'yes' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════
// WIREGUARD ROUTES
// ═══════════════════════════════════════

// Create WireGuard interface
router.post('/network/wireguard/interface', async (req, res) => {
  try {
    const { connection_id, name, 'private-key': privateKey, 'listen-port': listenPort, mtu } = req.body;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}
    if (!name) {return res.status(400).json({ error: 'Interface name is required' });}

    const device = await getMikrotikConnection(connection_id);
    const args = { name };
    if (privateKey) {args['private-key'] = privateKey;}
    if (listenPort) {args['listen-port'] = listenPort;}
    if (mtu) {args.mtu = mtu;}

    await executeCommand(device, '/interface wireguard add', args);
    res.json({ success: true, message: 'WireGuard interface created' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create WireGuard peer
router.post('/network/wireguard/peer', async (req, res) => {
  try {
    const { connection_id, interface: interfaceName, 'public-key': publicKey, 'allowed-address': allowedAddress, endpoint } = req.body;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}
    if (!publicKey) {return res.status(400).json({ error: 'Public key is required' });}

    const device = await getMikrotikConnection(connection_id);
    const args = { 'public-key': publicKey };
    if (interfaceName) {args.interface = interfaceName;}
    if (allowedAddress) {args['allowed-address'] = allowedAddress;}
    if (endpoint) {args.endpoint = endpoint;}

    await executeCommand(device, '/interface wireguard peers add', args);
    res.json({ success: true, message: 'WireGuard peer added' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ──────────────────────────────────────────────────────────────────
// UNIFIED NETWORK MANAGEMENT DASHBOARD
// Aggregates router health, IP pool usage, active PPPoE sessions,
// and RADIUS NAS status into a single API response
// ──────────────────────────────────────────────────────────────────
router.get('/network/management/dashboard', async (req, res) => {
  try {
    const db = global.db || require('../db/memory');
    const dashboard = {
      routers: [],
      ipPools: [],
      pppoeSessions: { total: 0, sessions: [], byRouter: {} },
      radiusNAS: [],
      summary: {
        totalRouters: 0,
        onlineRouters: 0,
        totalPPPoEActive: 0,
        totalIPPools: 0,
        totalIPUsed: 0,
        totalIPFree: 0,
        totalNASDevices: 0,
        activeNASSessions: 0,
      },
    };

    // ── Parse helpers ──
    function parseBytes(bytesStr) {
      if (!bytesStr) return 0;
      const str = String(bytesStr);
      if (/^\d+$/.test(str)) return parseInt(str);
      const match = str.match(/^([\d.]+)\s*([KMGTP]i?B)?$/i);
      if (!match) return 0;
      const value = parseFloat(match[1]);
      const unit = (match[2] || '').toLowerCase().replace('ib', '');
      const multipliers = { '': 1, k: 1024, m: 1048576, g: 1073741824, t: 1099511627776 };
      return Math.round(value * (multipliers[unit] || 1));
    }

    function parseUptime(uptimeStr) {
      if (!uptimeStr) return 0;
      const str = String(uptimeStr);
      let totalSeconds = 0;
      const daysMatch = str.match(/(\d+)d/);
      const hoursMatch = str.match(/(\d+)h/);
      const minsMatch = str.match(/(\d+)m/);
      const secsMatch = str.match(/(\d+)s/);
      if (daysMatch) totalSeconds += parseInt(daysMatch[1]) * 86400;
      if (hoursMatch) totalSeconds += parseInt(hoursMatch[1]) * 3600;
      if (minsMatch) totalSeconds += parseInt(minsMatch[1]) * 60;
      if (secsMatch) totalSeconds += parseInt(secsMatch[1]);
      return totalSeconds;
    }

    function formatUptime(totalSeconds) {
      if (!totalSeconds) return '0s';
      const d = Math.floor(totalSeconds / 86400);
      const h = Math.floor((totalSeconds % 86400) / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      if (d > 0) return `${d}d ${h}h ${m}m`;
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
    }

    // ── 1. Router Health (from mikrotik_connections + live MikroTik API) ──
    let connections = [];
    try {
      if (global.dbAvailable && db) {
        const result = await db.query('SELECT * FROM mikrotik_connections ORDER BY name');
        connections = result.rows;
      }
    } catch (e) {
      console.warn('[NetDashboard] Could not fetch connections:', e.message);
    }

    // Live sessions are read independently of /system/resource so a slow or
    // failing resource query can never make an active PPPoE user look offline.
    const liveSessions = await getOnlineStatus().catch((error) => ({
      pppoe: [], hotspot: [], total: 0, errors: [error.message],
    }));
    dashboard.errors = liveSessions.errors || [];
    dashboard.session_source = 'router';

    const { decrypt } = require('../utils/encryption');
    for (const conn of connections) {
      const routerEntry = {
        id: conn.id,
        name: conn.name || conn.host,
        host: conn.host,
        status: 'offline',
        cpu: 0,
        memory: 0,
        memoryTotal: 0,
        memoryUsed: 0,
        uptime: 0,
        uptimeFormatted: '0s',
        version: '',
        architecture: '',
        board: '',
        activePPPoE: 0,
        bandwidthIn: 0,
        bandwidthOut: 0,
      };

      const device = { ...conn };
      if (device.password_encrypted) {
        device.password = routerConnectionManager.decryptPassword(device.password_encrypted);
      }
      if (!device.password) {
        routerEntry.status = 'unknown';
        dashboard.routers.push(routerEntry);
        continue;
      }

      try {
        const resources = await routerConnectionManager.executeCommand(device, '/system/resource/print');
        const resource = Array.isArray(resources) ? resources[0] || {} : {};
        const cpuLoad = parseFloat(resource['cpu-load'] || 0);
        const totalMem = parseBytes(resource['total-memory']);
        const freeMem = parseBytes(resource['free-memory']);
        const memUsed = totalMem - freeMem;
        const memPercent = totalMem > 0 ? Math.round((memUsed / totalMem) * 100) : 0;
        const uptimeSecs = parseUptime(resource.uptime);

        routerEntry.status = 'online';
        routerEntry.cpu = cpuLoad;
        routerEntry.memory = memPercent;
        routerEntry.memoryTotal = totalMem;
        routerEntry.memoryUsed = memUsed;
        routerEntry.uptime = uptimeSecs;
        routerEntry.uptimeFormatted = formatUptime(uptimeSecs);
        routerEntry.version = resource.version || resource['software-id'] || '';
        routerEntry.architecture = resource['architecture-name'] || resource.architecture || '';
        routerEntry.board = resource['board-name'] || '';

        // Get PPPoE active count from this router
        try {
          const pppoeActive = await routerConnectionManager.print(device, '/ppp/active');
          const sessions = Array.isArray(pppoeActive) ? pppoeActive : [];
          routerEntry.activePPPoE = sessions.length;

          // Aggregate bandwidth from active sessions
          let bwIn = 0, bwOut = 0;
          for (const s of sessions) {
            bwIn += parseBytes(s['bytes-in'] || s.bytes_in);
            bwOut += parseBytes(s['bytes-out'] || s.bytes_out);
          }
          routerEntry.bandwidthIn = bwIn;
          routerEntry.bandwidthOut = bwOut;

          // Add sessions to the global list
          for (const s of sessions) {
            dashboard.pppoeSessions.sessions.push({
              id: s['.id'] || s.id || s.name,
              username: s.name || s.username || '',
              ip_address: s.address || '',
              caller_id: s['caller-id'] || '',
              uptime: s.uptime || '',
              bytes_in: parseBytes(s['bytes-in'] || s.bytes_in),
              bytes_out: parseBytes(s['bytes-out'] || s.bytes_out),
              router_id: conn.id,
              router_name: conn.name || conn.host,
            });
          }
          dashboard.pppoeSessions.byRouter[conn.id] = {
            name: conn.name || conn.host,
            count: sessions.length,
            bandwidthIn: bwIn,
            bandwidthOut: bwOut,
          };
          dashboard.pppoeSessions.total += sessions.length;
        } catch (e) {
          // PPPoE query may fail on some routers
        }
      } catch (e) {
        // Router unreachable — stays offline
      }

      dashboard.routers.push(routerEntry);
    }

    // Authoritative session data from the shared live presence service.
    dashboard.pppoeSessions.sessions = liveSessions.pppoe.map((session) => ({
      id: session.username,
      username: session.username,
      ip_address: session.address,
      caller_id: '',
      uptime: session.uptime,
      bytes_in: 0,
      bytes_out: 0,
      router_id: session.router_id,
      router_name: session.router_name,
    }));
    dashboard.pppoeSessions.total = liveSessions.pppoe.length;
    dashboard.pppoeSessions.byRouter = {};
    for (const session of liveSessions.pppoe) {
      const entry = dashboard.pppoeSessions.byRouter[session.router_id] || {
        name: session.router_name, count: 0, bandwidthIn: 0, bandwidthOut: 0,
      };
      entry.count += 1;
      dashboard.pppoeSessions.byRouter[session.router_id] = entry;
      const router = dashboard.routers.find((item) => item.id === session.router_id);
      if (router) {router.activePPPoE = entry.count;}
    }

    dashboard.summary.totalRouters = connections.length;
    dashboard.summary.onlineRouters = dashboard.routers.filter(r => r.status === 'online').length;
    dashboard.summary.totalPPPoEActive = dashboard.pppoeSessions.total;

    // ── 2. IP Pool Usage (from ipam_subnets + ipam_ips) ──
    try {
      if (global.dbAvailable && db) {
        const subnetsResult = await db.query('SELECT * FROM ipam_subnets ORDER BY name');
        for (const subnet of subnetsResult.rows) {
          const usedResult = await db.query("SELECT COUNT(*) as count FROM ipam_ips WHERE subnet_id = $1 AND status = 'used'", [subnet.id]);
          const totalResult = await db.query('SELECT COUNT(*) as count FROM ipam_ips WHERE subnet_id = $1', [subnet.id]);
          const used = parseInt(usedResult.rows[0].count) || 0;
          const total = parseInt(totalResult.rows[0].count) || 0;
          const free = total - used;
          dashboard.ipPools.push({
            id: subnet.id,
            name: subnet.name,
            network: subnet.network,
            mask: subnet.mask,
            gateway: subnet.gateway,
            vlan_id: subnet.vlan_id,
            used_ips: used,
            total_ips: total,
            free_ips: free,
            usage_percent: total > 0 ? Math.round((used / total) * 100) : 0,
          });
          dashboard.summary.totalIPPools++;
          dashboard.summary.totalIPUsed += used;
          dashboard.summary.totalIPFree += free;
        }
      }
    } catch (e) {
      console.warn('[NetDashboard] IPAM query failed:', e.message);
    }

    // ── 3. RADIUS NAS Status (from nas table + radacct) ──
    try {
      if (global.dbAvailable && db) {
        const nasResult = await db.query('SELECT * FROM nas ORDER BY nasname');
        for (const nas of nasResult.rows) {
          // Get active sessions count for this NAS
          let activeSessions = 0;
          try {
            const sessResult = await db.query(
              `SELECT COUNT(*) as count FROM radacct WHERE nasipaddress = $1 AND acctstoptime IS NULL
               AND GREATEST(COALESCE(acctupdatetime, acctstarttime), acctstarttime)
                   > NOW() - INTERVAL '15 minutes'`,
              [nas.nasname]
            );
            activeSessions = parseInt(sessResult.rows[0].count) || 0;
          } catch (e) {
            // radacct might not exist
          }

          dashboard.radiusNAS.push({
            id: nas.id,
            nasname: nas.nasname,
            shortname: nas.shortname,
            type: nas.type,
            description: nas.description || '',
            secret: '••••••', // Never expose RADIUS secret
            connection_id: nas.connection_id || null,
            active_sessions: activeSessions,
            status: activeSessions > 0 ? 'active' : 'idle',
          });
          dashboard.summary.totalNASDevices++;
          dashboard.summary.activeNASSessions += activeSessions;
        }
      }
    } catch (e) {
      console.warn('[NetDashboard] NAS query failed:', e.message);
    }

    res.json(dashboard);
  } catch (e) {
    console.error('[NetDashboard] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// NETWORK MANAGEMENT SUMMARY
// Single endpoint for the unified dashboard
// ═══════════════════════════════════════
async function networkSummaryHandler(req, res) {
  const db = global.db || require('../db/memory');
  try {
    const [
      routersRes,
      nasRes,
      ipamRes,
      subsRes,
      liveSessionsRes,
    ] = await Promise.allSettled([
      db.query(`SELECT id, name, ip_address, connection_type, is_online, last_seen FROM mikrotik_connections ORDER BY name`),
      db.query(`SELECT id, nasname, shortname, type, description, connection_id FROM nas ORDER BY shortname`),
      db.query(`SELECT
          COUNT(*) FILTER (WHERE status = 'free') AS free_ips,
          COUNT(*) FILTER (WHERE status = 'used') AS used_ips,
          COUNT(*) FILTER (WHERE status = 'reserved') AS reserved_ips,
          COUNT(*) AS total_ips
         FROM ipam_ips`).catch(() => ({ rows: [{ free_ips: 0, used_ips: 0, reserved_ips: 0, total_ips: 0 }] })),
      db.query(`SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'active') AS active,
          COUNT(*) FILTER (WHERE status = 'suspended') AS suspended,
          COUNT(*) FILTER (WHERE status = 'expired') AS expired
        FROM subscriptions`).catch(() => ({ rows: [{ total: 0, active: 0, suspended: 0, expired: 0 }] })),
      getOnlineStatus(),
    ]);

    const routers = routersRes.status === 'fulfilled' ? routersRes.value.rows : [];
    const nas = nasRes.status === 'fulfilled' ? nasRes.value.rows : [];
    const ipam = ipamRes.status === 'fulfilled' ? ipamRes.value.rows[0] : {};
    const subs = subsRes.status === 'fulfilled' ? subsRes.value.rows[0] : {};
    const liveSessions = liveSessionsRes.status === 'fulfilled'
      ? liveSessionsRes.value
      : null;
    const pppoeSessionCount = liveSessions ? liveSessions.total : null;
    const sessionErrors = liveSessions
      ? liveSessions.errors || []
      : [liveSessionsRes.reason?.message || 'Live session query failed'];

    const onlineRouters = routers.filter((r) => r.is_online).length;
    const offlineRouters = routers.filter((r) => !r.is_online).length;

    let subnets = [];
    try {
      const snRes = await db.query(
        `SELECT s.id, s.name, s.network, s.mask, s.description,
                COUNT(a.id) FILTER (WHERE a.status='used') AS used_ips,
                COUNT(a.id) FILTER (WHERE a.status='free') AS free_ips,
                COUNT(a.id) AS total_ips
          FROM ipam_subnets s
          LEFT JOIN ipam_ips a ON a.subnet_id = s.id
         GROUP BY s.id ORDER BY s.network LIMIT 20`,
      );
      subnets = snRes.rows;
    } catch (_) {
      /* subnets table may not exist */
    }

    res.json({
      routers: { total: routers.length, online: onlineRouters, offline: offlineRouters, list: routers },
      nas: { total: nas.length, list: nas },
      ipam: { ...ipam, subnets },
      subscriptions: subs,
      pppoe_sessions: pppoeSessionCount,
      pppoe_sessions_status: pppoeSessionCount === null ? 'unavailable' : 'ok',
      session_source: 'router',
      errors: sessionErrors,
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Registered on both paths because the alias router prepends /network for non-pppoe routes
router.get('/network/summary', networkSummaryHandler);
router.get('/summary', networkSummaryHandler);

module.exports = router;
