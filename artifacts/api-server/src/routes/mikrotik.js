const express = require('express');
const router = express.Router();
const db = global.db || require('../db/memory');
const { v4: uuidv4 } = require('uuid');
const billing = require('../services/billingData');
const { encrypt, decrypt } = require('../utils/encryption');

function toSafeConnection(connection) {
  if (!connection) {return null;}
  return {
    id: connection.id,
    name: connection.name,
    ip_address: connection.ip_address,
    api_port: connection.api_port,
    ssh_port: connection.ssh_port,
    username: connection.username,
    connection_type: connection.connection_type,
    use_tunnel: connection.use_tunnel,
    tunnel_host: connection.tunnel_host,
    tunnel_port: connection.tunnel_port,
    tunnel_username: connection.tunnel_username,
    wireguard_tunnel_ip: connection.wireguard_tunnel_ip,
    wireguard_public_key: connection.wireguard_public_key,
    wireguard_interface_name: connection.wireguard_interface_name,
    is_online: connection.is_online,
    last_seen: connection.last_seen,
    created_at: connection.created_at,
    updated_at: connection.updated_at,
  };
}

function normalizeRouterAddress(value) {
  let host = String(value || "").trim();
  if (!host) {
    return "";
  }
  host = host.replace(/^[a-z]+:\/\//i, "").split("/")[0].trim();
  return host.startsWith("[") && host.endsWith("]")
    ? host.slice(1, -1)
    : host;
}

function describeConnectionError(error) {
  if (!error) {
    return "Unknown MikroTik connection error";
  }
  return [
    error.message,
    error.code,
    error.errno,
    error.syscall,
    error.address,
    error.port,
  ]
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(String)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(" | ") || "Unknown MikroTik connection error";
}

// Get all connections
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT id, name, ip_address, api_port, ssh_port, username, connection_type, use_tunnel, tunnel_host, tunnel_port, tunnel_username, is_online, last_seen, created_at, updated_at FROM mikrotik_connections');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create connection
router.post('/', async (req, res) => {
  try {
    const { name, ip_address, api_port, ssh_port, username, password, connection_type, use_tunnel, tunnel_host, tunnel_port, tunnel_username, tunnel_password } = req.body;
    const id = uuidv4();
    const encryptedPassword = encrypt(password);
    const encryptedTunnelPassword = use_tunnel && tunnel_password ? encrypt(tunnel_password) : null;

    const result = await db.query(
      `INSERT INTO mikrotik_connections (id, name, ip_address, api_port, ssh_port, username, password_encrypted, connection_type, use_tunnel, tunnel_host, tunnel_port, tunnel_username, tunnel_password_encrypted)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id, name, ip_address, api_port, ssh_port, username, connection_type, use_tunnel, tunnel_host, tunnel_port, tunnel_username, created_at`,
      [id, name, ip_address, api_port || 8728, ssh_port || 22, username, encryptedPassword, connection_type || 'api', use_tunnel || false, tunnel_host, tunnel_port || 22, tunnel_username, encryptedTunnelPassword]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update connection
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      ip_address,
      api_port,
      ssh_port,
      username,
      password,
      connection_type,
      use_tunnel,
      tunnel_host,
      tunnel_port,
      tunnel_username,
      tunnel_password,
    } = req.body;

    const existingResult = await db.query('SELECT * FROM mikrotik_connections WHERE id = $1', [id]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const existing = existingResult.rows[0];
    const passwordEncrypted = password ? encrypt(password) : existing.password_encrypted;
    const tunnelPasswordEncrypted = tunnel_password
      ? encrypt(tunnel_password)
      : (use_tunnel ? existing.tunnel_password_encrypted : null);

    const result = await db.query(
      `UPDATE mikrotik_connections
       SET name = $1,
           ip_address = $2,
           api_port = $3,
           ssh_port = $4,
           username = $5,
           password_encrypted = $6,
           connection_type = $7,
           use_tunnel = $8,
           tunnel_host = $9,
           tunnel_port = $10,
           tunnel_username = $11,
           tunnel_password_encrypted = $12,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $13
       RETURNING id, name, ip_address, api_port, ssh_port, username, connection_type, use_tunnel, tunnel_host, tunnel_port, tunnel_username, is_online, last_seen, created_at, updated_at`,
      [
        name || existing.name,
        ip_address || existing.ip_address,
        api_port || existing.api_port,
        ssh_port || existing.ssh_port || 22,
        username || existing.username,
        passwordEncrypted,
        connection_type || existing.connection_type || 'api',
        use_tunnel === undefined ? existing.use_tunnel : use_tunnel,
        use_tunnel === false ? null : (tunnel_host ?? existing.tunnel_host),
        use_tunnel === false ? 22 : (tunnel_port || existing.tunnel_port || 22),
        use_tunnel === false ? null : (tunnel_username ?? existing.tunnel_username),
        tunnelPasswordEncrypted,
        id,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Categorize errors and return fix suggestions
function diagnoseConnectionError(error, config) {
  const msg = (error.message || '').toLowerCase();
  const port = config.connection_type === 'ssh' ? (config.ssh_port || 22) : (config.api_port || 8728);
  const protocol = config.connection_type === 'ssh' ? 'SSH' : 'API';

  if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('ehostunreach') || msg.includes('econnreset')) {
    const fixes = [];
    if (config.connection_type !== 'ssh') {
      fixes.push('Run on the router: /ip service enable api  (or /ip service enable api-ssl for port 8729)');
      fixes.push(`Allow the port: /ip firewall filter add chain=input protocol=tcp dst-port=${port} src-address=<billing-server-ip> action=accept`);
      fixes.push(`Verify the router is reachable: ping ${config.ip_address} from this server`);
    } else {
      fixes.push('Run on the router: /ip service enable ssh');
      fixes.push(`Allow SSH: /ip firewall filter add chain=input protocol=tcp dst-port=${port} src-address=<billing-server-ip> action=accept`);
    }
    if (/^10\.|^172\.1[6-9]\.|^172\.2\d\.|^172\.3[0-1]\.|^192\.168\.|^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(config.ip_address || '')) {
      fixes.push(`${config.ip_address} is a private/CGNAT IP. The router is behind NAT and cannot be reached directly.`);
      fixes.push('Set up a WireGuard tunnel: POST /api/cgnat-tunnel/create with { connectionId }');
      fixes.push('Or use the CGNAT Tunnel page in the UI to create a WireGuard tunnel automatically.');
    }
    return { category: 'unreachable', title: 'Router unreachable', description: `Could not reach ${config.ip_address}:${port} via ${protocol}. The router may be offline, the port may be blocked, or the IP may be wrong.`, fixes };
  }

  if (msg.includes('login') || msg.includes('auth') || msg.includes('credential') || msg.includes('denied') || msg.includes('invalid') || msg.includes('could not login') || msg.includes('not allowed')) {
    return { category: 'auth_failed', title: 'Authentication failed', description: `The ${protocol} login was rejected for user "${config.username}" on ${config.ip_address}.`, fixes: [
      `Verify the username and password are correct for ${config.ip_address}`,
      'Check the user group has API/SSH permissions: /user print detail',
      'Create a dedicated user: /user add name=api-billing group=full password=<strong-password>',
    ] };
  }

  if (msg.includes('ssl') || msg.includes('tls') || msg.includes('certificate') || msg.includes('unsafe legacy') || msg.includes('self signed')) {
    return { category: 'ssl_error', title: 'SSL/TLS error', description: `API-SSL connection to ${config.ip_address}:${port} failed due to a certificate or TLS issue.`, fixes: [
      'Install a certificate on the router: /certificate add name=local-cert common-name=<router-ip>',
      'For api-ssl, enable it: /ip service enable api-ssl',
      'Or use plain API (port 8728) on a trusted management network instead',
    ] };
  }

  if (msg.includes('decrypt') || msg.includes('encryption') || msg.includes('auth tag')) {
    return { category: 'encryption_error', title: 'Password decryption failed', description: 'The saved password could not be decrypted. The ENCRYPTION_KEY may have changed.', fixes: [
      'Re-enter the router password in the connection form and save again',
      'Ensure ENCRYPTION_KEY is stable across deployments',
    ] };
  }

  return { category: 'unknown', title: 'Connection failed', description: `${protocol} connection to ${config.ip_address}:${port} failed: ${error.message}`, fixes: [
    'Verify the router is powered on and accessible',
    'Confirm the correct IP, port, and connection type',
    'Check router services: /ip service print',
    `Try connecting manually: ssh admin@${config.ip_address}`,
  ] };
}

// Fast TCP reachability check (3s timeout, fails fast)
function checkTcpReachable(host, port, timeoutMs = 3000) {
  const net = require('net');
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => { socket.destroy(); resolve({ reachable: true }); });
    socket.on('timeout', () => { socket.destroy(); resolve({ reachable: false, reason: 'timeout' }); });
    socket.on('error', (err) => { socket.destroy(); resolve({ reachable: false, reason: err.code || err.message }); });
    socket.connect(port, host);
  });
}

// Test connection with fast TCP-first diagnostics
router.post('/test', async (req, res) => {
  const startTime = Date.now();
  const { ip_address, api_port, ssh_port, username, password, connection_type, use_tunnel, tunnel_host, tunnel_port, tunnel_username, tunnel_password } = req.body;
  const config = { ip_address, api_port, ssh_port, username, password, connection_type, use_tunnel, tunnel_host, tunnel_port, tunnel_username, tunnel_password };
  const diagnostics = { steps: [] };

  if (!ip_address || !username) {
    return res.json({ success: false, message: 'Router IP and username are required', diagnostics: { steps: [{ step: 'input_validation', status: 'failed', detail: 'Missing ip_address or username' }] } });
  }
  diagnostics.steps.push({ step: 'input_validation', status: 'passed' });

  // Proactively flag private/CGNAT addresses so the UI can recommend a tunnel
  // regardless of whether the connection attempt later succeeds or fails.
  const isPrivateOrCgnat = /^10\.|^172\.1[6-9]\.|^172\.2\d\.|^172\.3[0-1]\.|^192\.168\.|^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(ip_address || '');
  const wgSubnetPrefix = (process.env.WG_TUNNEL_SUBNET || '10.200.0');
  const isTunnelIp = (ip_address || '').startsWith(wgSubnetPrefix + '.');
  diagnostics.cgnat = {
    isPrivateOrCgnat,
    isTunnelIp,
    recommendation: isTunnelIp
      ? 'This is a WireGuard tunnel IP — the router is reachable through the CGNAT tunnel.'
      : isPrivateOrCgnat
        ? 'This IP is in a private/CGNAT range. If the router is behind CGNAT, create a WireGuard tunnel on the CGNAT Tunnel tab.'
        : 'Public IP detected — a direct connection should work if the router is online.',
  };

  // Fast TCP check (3s) before slow API/SSH attempt
  const targetPort = connection_type === 'ssh' ? (ssh_port || 22) : (api_port || 8728);
  const tcpCheck = await checkTcpReachable(ip_address, targetPort);
  diagnostics.steps.push({
    step: 'tcp_reachability',
    status: tcpCheck.reachable ? 'passed' : 'failed',
    detail: tcpCheck.reachable ? `TCP ${ip_address}:${targetPort} reachable` : `TCP ${ip_address}:${targetPort} failed (${tcpCheck.reason})`,
  });

  if (!tcpCheck.reachable) {
    const diag = diagnoseConnectionError(new Error(tcpCheck.reason === 'timeout' ? 'ETIMEDOUT' : 'ECONNREFUSED'), config);
    return res.json({ success: false, message: `Could not reach ${ip_address}:${targetPort}`, diagnostics: { ...diagnostics, elapsed_ms: Date.now() - startTime }, diagnosis: diag });
  }

  // Authenticate (5s timeout)
  if (connection_type === 'ssh') {
    const sshService = require('../services/mikrotikSSH');
    try {
      if (use_tunnel) {
        return res.json({ success: false, message: 'SSH tunneling requires additional setup. Use VPN or direct SSH.', diagnostics: { ...diagnostics, elapsed_ms: Date.now() - startTime }, diagnosis: { category: 'tunnel_unsupported', title: 'SSH tunneling not fully supported', description: 'Jump-host SSH tunneling is basic. Use VPN for reliable remote access.', fixes: ['Set up WireGuard or IPsec VPN', 'Use the router VPN-side IP with the VPN/API profile'] } });
      }
      const connection = await sshService.createConnection({ host: ip_address, port: ssh_port || 22, username, password });
      const testResult = await sshService.testConnection(connection.id);
      await sshService.removeConnection(connection.id);
      diagnostics.steps.push({ step: 'authentication', status: 'passed', detail: 'SSH login successful' });
      res.json({ success: true, message: 'SSH connection successful', data: testResult.data, diagnostics: { ...diagnostics, elapsed_ms: Date.now() - startTime } });
    } catch (error) {
      const diag = diagnoseConnectionError(error, config);
      diagnostics.steps.push({ step: 'authentication', status: 'failed', detail: error.message });
      res.json({ success: false, message: error.message, diagnostics: { ...diagnostics, elapsed_ms: Date.now() - startTime }, diagnosis: diag });
    }
  } else {
    const routerConnectionManager = require('../services/routerConnectionManager');
    try {
      await routerConnectionManager.testConnection({ ip_address, api_port, connection_type, username, password });
      diagnostics.steps.push({ step: 'authentication', status: 'passed', detail: 'API login successful' });
      res.json({ success: true, message: 'API connection successful', diagnostics: { ...diagnostics, elapsed_ms: Date.now() - startTime } });
    } catch (error) {
      const diag = diagnoseConnectionError(error, config);
      diagnostics.steps.push({ step: 'authentication', status: 'failed', detail: error.message });
      res.json({ success: false, message: error.message, diagnostics: { ...diagnostics, elapsed_ms: Date.now() - startTime }, diagnosis: diag });
    }
  }
});

// Diagnose a saved connection (fetches from DB, tests, returns full report)
router.post('/:id/diagnose', async (req, res) => {
  const startTime = Date.now();
  try {
    const { id } = req.params;
    const connResult = await db.query('SELECT * FROM mikrotik_connections WHERE id = $1', [id]);
    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const conn = connResult.rows[0];
    const config = {
      ip_address: conn.ip_address, api_port: conn.api_port, ssh_port: conn.ssh_port,
      username: conn.username,
      password: require('../utils/encryption').decrypt(conn.password_encrypted),
      connection_type: conn.connection_type, use_tunnel: conn.use_tunnel,
      tunnel_host: conn.tunnel_host, tunnel_port: conn.tunnel_port, tunnel_username: conn.tunnel_username,
    };
    const diagnostics = { steps: [], connection: toSafeConnection(conn) };

    if (!config.password) {
      diagnostics.steps.push({ step: 'decryption', status: 'failed', detail: 'Saved password could not be decrypted. ENCRYPTION_KEY may have changed.' });
      return res.json({ success: false, message: 'Password decryption failed. Re-enter the password and save the connection again.', diagnostics: { ...diagnostics, elapsed_ms: Date.now() - startTime }, diagnosis: { category: 'encryption_error', title: 'Password decryption failed', description: 'The saved password could not be decrypted. This usually means the ENCRYPTION_KEY has changed.', fixes: ['Re-enter the router password in the connection form and save again', 'Ensure ENCRYPTION_KEY is stable across deployments'] } });
    }
    diagnostics.steps.push({ step: 'decryption', status: 'passed' });

    const targetPort = config.connection_type === 'ssh' ? (config.ssh_port || 22) : (config.api_port || 8728);
    const tcpCheck = await checkTcpReachable(config.ip_address, targetPort);
    diagnostics.steps.push({ step: 'tcp_reachability', status: tcpCheck.reachable ? 'passed' : 'failed', detail: tcpCheck.reachable ? `TCP ${config.ip_address}:${targetPort} reachable` : `TCP ${config.ip_address}:${targetPort} failed (${tcpCheck.reason})` });

    if (!tcpCheck.reachable) {
      const diag = diagnoseConnectionError(new Error(tcpCheck.reason === 'timeout' ? 'ETIMEDOUT' : 'ECONNREFUSED'), config);
      await db.query('UPDATE mikrotik_connections SET is_online = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
      return res.json({ success: false, message: `Router at ${config.ip_address}:${targetPort} is not reachable`, diagnostics: { ...diagnostics, elapsed_ms: Date.now() - startTime }, diagnosis: diag });
    }

    const routerConnectionManager = require('../services/routerConnectionManager');
    try {
      await routerConnectionManager.testConnection(config);
      diagnostics.steps.push({ step: 'authentication', status: 'passed', detail: `${config.connection_type || 'api'} login successful` });
      await db.query('UPDATE mikrotik_connections SET is_online = true, last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
      res.json({ success: true, message: 'Connection healthy', diagnostics: { ...diagnostics, elapsed_ms: Date.now() - startTime } });
    } catch (error) {
      const diag = diagnoseConnectionError(error, config);
      diagnostics.steps.push({ step: 'authentication', status: 'failed', detail: error.message });
      await db.query('UPDATE mikrotik_connections SET is_online = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
      res.json({ success: false, message: error.message, diagnostics: { ...diagnostics, elapsed_ms: Date.now() - startTime }, diagnosis: diag });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Push script to device
router.post('/push', async (req, res) => {
  try {
    const { connection_id, script, dry_run } = req.body;

    if (!connection_id || !String(script || "").trim()) {
      return res.status(400).json({ error: 'connection_id and script are required' });
    }

    if (String(script).length > 200000) {
      return res.status(413).json({ error: 'Script is too large to push (maximum 200,000 characters)' });
    }

    // Get connection details
    const conn = await db.query('SELECT * FROM mikrotik_connections WHERE id = $1', [connection_id]);
    if (conn.rows.length === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const device = conn.rows[0];

    if (dry_run) {
      return res.json({ 
        success: true, 
        message: 'Dry run - script would be executed',
        script_length: script.length,
        lines: script.split('\n').length 
      });
    }

    const routerConnectionManager = require('../services/routerConnectionManager');
    try {
      const host = routerConnectionManager.resolveEffectiveConfig(device).ip_address;
      const result = await routerConnectionManager.executeScript(device, script, {
        name: `config-builder-${Date.now()}`,
      });
      await db.query(
        'UPDATE mikrotik_connections SET is_online = true, last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [connection_id],
      ).catch(() => {});
      res.json({ success: true, message: 'Script executed successfully on the router', host, result });
    } catch (error) {
      res.status(502).json({ success: false, message: describeConnectionError(error), error: describeConnectionError(error) });
    }
  } catch (error) {
    res.status(500).json({ error: describeConnectionError(error) });
  }
});

// Delete connection
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM mikrotik_connections WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    res.json({ message: 'Connection deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check connectivity for a specific connection
router.post('/:id/check', async (req, res) => {
  try {
    const { id } = req.params;
    const routerConnectivityService = require('../services/routerConnectivity');
    await routerConnectivityService.checkConnectionNow(id);
    
    // Get updated connection status
    const result = await db.query(
      'SELECT id, name, ip_address, is_online, last_seen FROM mikrotik_connections WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }
    
    res.json({ success: true, connection: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get alerts for a specific connection
router.get('/:id/alerts', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, limit = 50 } = req.query;
    
    let query = 'SELECT * FROM alerts WHERE connection_id = $1';
    const params = [id];
    
    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }
    
    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
    params.push(parseInt(limit));
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all alerts (admin view)
router.get('/alerts/all', async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    
    let query = 'SELECT a.*, mc.name as connection_name, mc.ip_address FROM alerts a LEFT JOIN mikrotik_connections mc ON a.connection_id = mc.id WHERE 1=1';
    const params = [];
    
    if (status) {
      query += ' AND a.status = $1';
      params.push(status);
    }
    
    query += ' ORDER BY a.created_at DESC LIMIT $' + (params.length + 1);
    params.push(parseInt(limit));
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Acknowledge an alert
router.post('/alerts/:id/acknowledge', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    
    const result = await db.query(
      'UPDATE alerts SET status = $1, acknowledged_by = $2, acknowledged_at = $3 WHERE id = $4 RETURNING *',
      ['acknowledged', userId, new Date().toISOString(), id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resolve an alert
router.post('/alerts/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(
      'UPDATE alerts SET status = $1, resolved_at = $2 WHERE id = $3 RETURNING *',
      ['resolved', new Date().toISOString(), id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch PPP secrets from MikroTik
router.get('/:id/ppp-secrets', async (req, res) => {
  try {
    const { id } = req.params;
    const routerConnectionManager = require('../services/routerConnectionManager');
    
    // Fetch PPP secrets
    const secrets = await routerConnectionManager.print(id, '/ppp/secret');
    
    // Format the response
    const users = secrets.map(secret => ({
      name: secret.name,
      service: secret.service,
      profile: secret.profile,
      caller_id: secret['caller-id'],
      comment: secret.comment,
      disabled: secret.disabled === 'true',
      last_logged_in: secret['last-logged-out'],
      limit_bytes_in: secret['limit-bytes-in'],
      limit_bytes_out: secret['limit-bytes-out']
    }));
    
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch Hotspot users from MikroTik
router.get('/:id/hotspot-users', async (req, res) => {
  try {
    const { id } = req.params;
    const routerConnectionManager = require('../services/routerConnectionManager');
    
    // Fetch Hotspot users
    const users = await routerConnectionManager.print(id, '/ip/hotspot/user');
    
    // Format the response
    const hotspotUsers = users.map(user => ({
      name: user.name,
      profile: user.profile,
      mac_address: user['mac-address'],
      comment: user.comment,
      disabled: user.disabled === 'true',
      uptime: user.uptime,
      bytes_in: user['bytes-in'],
      bytes_out: user['bytes-out'],
      packets_in: user['packets-in'],
      packets_out: user['packets-out']
    }));
    
    res.json({ success: true, users: hotspotUsers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import MikroTik users as customers
router.post('/:id/import-users', async (req, res) => {
  try {
    const { id } = req.params;
    const { users, userType, plan_id, billing_cycle = 'monthly' } = req.body; // userType: 'ppp' or 'hotspot'
    
    if (!users || !Array.isArray(users)) {
      return res.status(400).json({ error: 'users array is required' });
    }

    if (userType === 'ppp' && !plan_id) {
      return res.status(400).json({ error: 'plan_id is required when importing PPP users into billing subscriptions' });
    }
    
    const connectionResult = await db.query(
      'SELECT id, name FROM mikrotik_connections WHERE id = $1',
      [id]
    );
    
    if (connectionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }
    
    const imported = [];
    const errors = [];
    const existingSubscriptions = await billing.listSubscriptions();
    const plan = plan_id ? await billing.getPlanById(plan_id) : null;
    
    for (const user of users) {
      try {
        const duplicateSub = existingSubscriptions.find((sub) =>
          sub.mikrotik_connection_id === id && sub.pppoe_username === user.name
        );

        if (duplicateSub) {
          errors.push({ user: user.name, error: 'Billing subscription already exists for this router user' });
          continue;
        }

        const customer = await billing.createCustomer({
          name: user.comment || user.name,
          email: '',
          phone: '',
          status: normalizeDisabled(user.disabled) ? 'inactive' : 'active',
          notes: `Imported from MikroTik ${userType} user on ${connectionResult.rows[0].name}`,
        });

        let subscription = null;
        if (userType === 'ppp') {
          subscription = await billing.createSubscription({
            customer_id: customer.id,
            plan_id,
            router_id: null,
            mikrotik_connection_id: id,
            pppoe_username: user.name,
            pppoe_password: '',
            pppoe_profile: user.profile || '',
            status: normalizeDisabled(user.disabled) ? 'suspended' : 'active',
            billing_cycle,
            auto_provision: true,
          });
        }

        imported.push({
          customer_id: customer.id,
          customer_name: customer.name,
          subscription_id: subscription?.id || null,
          username: user.name,
          plan_name: plan?.name || null,
          type: userType,
        });
      } catch (error) {
        errors.push({ user: user.name, error: error.message });
      }
    }
    
    res.json({ 
      success: true, 
      imported: imported.length, 
      importedUsers: imported,
      errors: errors.length,
      errorDetails: errors
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function normalizeDisabled(value) {
  return value === true || value === 'true' || value === 'yes';
}

module.exports = router;
