const express = require('express');
const router = express.Router();

const routerConnectionManager = require('../services/routerConnectionManager');

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
async function getFromMikrotik(device, path) {
  try {
    return await routerConnectionManager.executeCommand(device, path + '/print', { 
      '.proplist': '.id,name,comment,disabled' 
    });
  } catch (error) {
    console.error(`MikroTik get error: ${error.message}`);
    return [];
  }
}

// ═══════════════════════════════════════
// PPPoE ROUTES
// ═══════════════════════════════════════

// Get PPPoE secrets
router.get('/pppoe/secrets', async (req, res) => {
  try {
    const { connection_id } = req.query;
    if (!connection_id) {return res.json([]);}

    const device = await getMikrotikConnection(connection_id);
    const result = await getFromMikrotik(device, '/ppp/secret');
    res.json(Array.isArray(result) ? result : []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create PPPoE secret
router.post('/pppoe/secrets', async (req, res) => {
  try {
    const { connection_id, name, password, service, profile, rate_limit, comment } = req.body;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}

    const device = await getMikrotikConnection(connection_id);
    const args = { name, password, service: service || 'pppoe' };
    if (profile) {args.profile = profile;}
    if (rate_limit) {args['rate-limit'] = rate_limit;}
    if (comment) {args.comment = comment;}

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
    if (!connection_id) {return res.json([]);}

    const device = await getMikrotikConnection(connection_id);
    const result = await getFromMikrotik(device, '/ppp/profile');
    res.json(Array.isArray(result) ? result : []);
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
    if (!connection_id) {return res.json([]);}

    const device = await getMikrotikConnection(connection_id);
    const result = await getFromMikrotik(device, '/ppp/active');
    res.json(Array.isArray(result) ? result : []);
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    const result = await getFromMikrotik(device, '/ip/hotspot/user');
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
    if (profile) {args.profile = profile;}
    if (disabled) {args.disabled = disabled;}
    if (comment) {args.comment = comment;}
    if (limit_bytes_total) {args['limit-bytes-total'] = limit_bytes_total;}
    if (rate_limit) {args['rate-limit'] = rate_limit;}

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

// Create Hotspot vouchers (batch)
router.post('/network/vouchers', async (req, res) => {
  try {
    const { vouchers, connection_id } = req.body;
    console.log('Received voucher creation request:', { voucherCount: vouchers?.length, connection_id });
    
    const db = global.db || require('../db/memory');
    const { v4: uuidv4 } = require('uuid');

    for (const v of vouchers) {
      const id = uuidv4();
      console.log('Inserting voucher:', { username: v.username, id });
      await db.query(
        `INSERT INTO hotspot_vouchers (id, username, password, profile, valid_for, rate_limit, data_limit, price, company_name, connection_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [id, v.username, v.password, v.profile, v.valid_for, v.rate_limit, v.data_limit, v.price, v.company_name, v.connection_id || connection_id || null, new Date().toISOString()]
      );
    }

    // Push to Mikrotik if connection selected
    if (connection_id && vouchers.length > 0) {
      const device = await getMikrotikConnection(connection_id);
      for (const v of vouchers) {
        const args = { name: v.username, password: v.password };
        if (v.profile) {args.profile = v.profile;}
        if (v.rate_limit) {args['rate-limit'] = v.rate_limit;}
        if (v.comment) {args.comment = v.comment;}
        try { await executeCommand(device, '/ip/hotspot/user/add', args); } catch (e) { console.error(`Failed to create user ${v.username}:`, e.message); }
      }
    }

    console.log('Vouchers created successfully');
    res.json({ success: true, count: vouchers.length });
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
    const { connection_id, name, target, max_limit, priority, parent, comment } = req.body;
    if (!connection_id) {return res.status(400).json({ error: 'Connection ID required' });}

    const device = await getMikrotikConnection(connection_id);
    const args = { name };
    if (target) {args.target = target;}
    if (max_limit) {args['max-limit'] = max_limit;}
    if (priority) {args.priority = priority;}
    if (parent) {args.parent = parent;}
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
        try { device.password = decrypt(device.password_encrypted); } catch (e) { continue; }
      }
      if (!device.password) continue;

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
              "SELECT COUNT(*) as count FROM radacct WHERE nasipaddress = $1 AND acctstoptime IS NULL",
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
      pppoeSessionsRes,
    ] = await Promise.allSettled([
      db.query(`SELECT id, name, ip_address, connection_type, is_online, last_seen FROM mikrotik_connections ORDER BY name`),
      db.query(`SELECT id, nasname, shortname, type, description, connection_id FROM nas ORDER BY shortname`),
      db.query(`SELECT
          COUNT(*) FILTER (WHERE status = 'free') AS free_ips,
          COUNT(*) FILTER (WHERE status = 'used') AS used_ips,
          COUNT(*) FILTER (WHERE status = 'reserved') AS reserved_ips,
          COUNT(*) AS total_ips
        FROM ip_addresses`).catch(() => ({ rows: [{ free_ips: 0, used_ips: 0, reserved_ips: 0, total_ips: 0 }] })),
      db.query(`SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'active') AS active,
          COUNT(*) FILTER (WHERE status = 'suspended') AS suspended,
          COUNT(*) FILTER (WHERE status = 'expired') AS expired
        FROM subscriptions`).catch(() => ({ rows: [{ total: 0, active: 0, suspended: 0, expired: 0 }] })),
      db.query(`SELECT COUNT(*) AS total FROM radius_sessions WHERE end_time IS NULL`).catch(() => ({ rows: [{ total: 0 }] })),
    ]);

    const routers = routersRes.status === 'fulfilled' ? routersRes.value.rows : [];
    const nas = nasRes.status === 'fulfilled' ? nasRes.value.rows : [];
    const ipam = ipamRes.status === 'fulfilled' ? ipamRes.value.rows[0] : {};
    const subs = subsRes.status === 'fulfilled' ? subsRes.value.rows[0] : {};
    const pppoeSessionCount = pppoeSessionsRes.status === 'fulfilled'
      ? pppoeSessionsRes.value?.rows?.[0]?.total
      : undefined;
    const inMemoryPppoeSessionCount = require('../db/radiusStore').radiusStore.sessions
      .filter((session) => session.status === 'active' && !session.end_time)
      .length;

    const onlineRouters = routers.filter((r) => r.is_online).length;
    const offlineRouters = routers.filter((r) => !r.is_online).length;

    let subnets = [];
    try {
      const snRes = await db.query(
        `SELECT s.id, s.name, s.network, s.mask, s.description,
                COUNT(a.id) FILTER (WHERE a.status='used') AS used_ips,
                COUNT(a.id) FILTER (WHERE a.status='free') AS free_ips,
                COUNT(a.id) AS total_ips
         FROM ip_subnets s
         LEFT JOIN ip_addresses a ON a.subnet_id = s.id
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
      pppoe_sessions: Number(pppoeSessionCount ?? inMemoryPppoeSessionCount) || 0,
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
