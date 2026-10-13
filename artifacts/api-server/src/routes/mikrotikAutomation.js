/**
 * MikroTik Automation API Routes
 * REST API and SSH-based configuration management
 */

const express = require('express');
const router = express.Router();
const mikrotikRest = require('../services/mikrotikRest');
const mikrotikSSH = require('../services/mikrotikSSH');
const mikrotikDeployer = require('../services/mikrotikDeployer');

// ═══════════════════════════════════════
// REST API CONNECTIONS
// ═══════════════════════════════════════

router.post('/rest/connect', (req, res) => {
  try {
    const { host, port, username, password, useSSL } = req.body;

    if (!host || !username || !password) {
      return res.status(400).json({ error: 'host, username, and password are required' });
    }

    const connection = mikrotikRest.createConnection({
      host,
      port: port || 443,
      username,
      password,
      useSSL: useSSL !== false,
    });

    res.json({ success: true, connection });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/rest/test', async (req, res) => {
  try {
    const { connectionId } = req.body;
    const result = await mikrotikRest.testConnection(connectionId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/rest/disconnect', (req, res) => {
  try {
    const { connectionId } = req.body;
    mikrotikRest.removeConnection(connectionId);
    res.json({ success: true, message: 'Disconnected' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/rest/connections', (req, res) => {
  try {
    const connections = mikrotikRest.listConnections();
    res.json({ success: true, connections });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════
// SSH CONNECTIONS
// ═══════════════════════════════════════

router.post('/ssh/connect', async (req, res) => {
  try {
    const { host, port, username, password, privateKey } = req.body;

    if (!host || !username || (!password && !privateKey)) {
      return res.status(400).json({ error: 'host, username, and password or privateKey are required' });
    }

    const connection = await mikrotikSSH.createConnection({
      host,
      port: port || 22,
      username,
      password,
      privateKey,
    });

    res.json({ success: true, connection });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ssh/test', async (req, res) => {
  try {
    const { connectionId } = req.body;
    const result = await mikrotikSSH.testConnection(connectionId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ssh/disconnect', async (req, res) => {
  try {
    const { connectionId } = req.body;
    await mikrotikSSH.removeConnection(connectionId);
    res.json({ success: true, message: 'Disconnected' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/ssh/connections', (req, res) => {
  try {
    const connections = mikrotikSSH.listConnections();
    res.json({ success: true, connections });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════
// DEVICE INFORMATION
// ═══════════════════════════════════════

router.get('/:connectionId/info', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { method = 'auto' } = req.query;

    let result;
    if (method === 'rest') {
      result = await mikrotikRest.getSystemInfo(connectionId);
    } else if (method === 'ssh') {
      result = await mikrotikSSH.getSystemInfo(connectionId);
    } else {
      // Auto-detect
      const restConn = mikrotikRest.getConnection(connectionId);
      if (restConn) {
        result = await mikrotikRest.getSystemInfo(connectionId);
      } else {
        result = await mikrotikSSH.getSystemInfo(connectionId);
      }
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:connectionId/interfaces', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { method = 'auto' } = req.query;

    let result;
    if (method === 'rest') {
      result = await mikrotikRest.getInterfaces(connectionId);
    } else if (method === 'ssh') {
      result = await mikrotikSSH.getInterfaces(connectionId);
    } else {
      const restConn = mikrotikRest.getConnection(connectionId);
      result = restConn 
        ? await mikrotikRest.getInterfaces(connectionId)
        : await mikrotikSSH.getInterfaces(connectionId);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:connectionId/ip-addresses', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { method = 'auto' } = req.query;

    let result;
    if (method === 'rest') {
      result = await mikrotikRest.getIPAddresses(connectionId);
    } else if (method === 'ssh') {
      result = await mikrotikSSH.getIPAddresses(connectionId);
    } else {
      const restConn = mikrotikRest.getConnection(connectionId);
      result = restConn 
        ? await mikrotikRest.getIPAddresses(connectionId)
        : await mikrotikSSH.getIPAddresses(connectionId);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:connectionId/dhcp-leases', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { method = 'auto' } = req.query;

    let result;
    if (method === 'rest') {
      result = await mikrotikRest.getDHCPLeases(connectionId);
    } else if (method === 'ssh') {
      result = await mikrotikSSH.getDHCPLeases(connectionId);
    } else {
      const restConn = mikrotikRest.getConnection(connectionId);
      result = restConn 
        ? await mikrotikRest.getDHCPLeases(connectionId)
        : await mikrotikSSH.getDHCPLeases(connectionId);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:connectionId/hotspot-users', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { method = 'auto' } = req.query;

    let result;
    if (method === 'rest') {
      result = await mikrotikRest.getHotspotUsers(connectionId);
    } else if (method === 'ssh') {
      result = await mikrotikSSH.getHotspotUsers(connectionId);
    } else {
      const restConn = mikrotikRest.getConnection(connectionId);
      result = restConn 
        ? await mikrotikRest.getHotspotUsers(connectionId)
        : await mikrotikSSH.getHotspotUsers(connectionId);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:connectionId/pppoe-secrets', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { method = 'auto' } = req.query;

    let result;
    if (method === 'rest') {
      result = await mikrotikRest.getPPPoESecrets(connectionId);
    } else if (method === 'ssh') {
      result = await mikrotikSSH.getPPPoESecrets(connectionId);
    } else {
      const restConn = mikrotikRest.getConnection(connectionId);
      result = restConn 
        ? await mikrotikRest.getPPPoESecrets(connectionId)
        : await mikrotikSSH.getPPPoESecrets(connectionId);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════
// CONFIGURATION COMMANDS
// ═══════════════════════════════════════

router.post('/:connectionId/ip-address', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { method = 'auto', ...config } = req.body;

    let result;
    if (method === 'rest') {
      result = await mikrotikRest.createIPAddress(connectionId, config);
    } else if (method === 'ssh') {
      result = await mikrotikSSH.createIPAddress(connectionId, config);
    } else {
      const restConn = mikrotikRest.getConnection(connectionId);
      result = restConn 
        ? await mikrotikRest.createIPAddress(connectionId, config)
        : await mikrotikSSH.createIPAddress(connectionId, config);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:connectionId/hotspot-user', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { method = 'auto', ...config } = req.body;

    let result;
    if (method === 'rest') {
      result = await mikrotikRest.createHotspotUser(connectionId, config);
    } else if (method === 'ssh') {
      result = await mikrotikSSH.createHotspotUser(connectionId, config);
    } else {
      const restConn = mikrotikRest.getConnection(connectionId);
      result = restConn 
        ? await mikrotikRest.createHotspotUser(connectionId, config)
        : await mikrotikSSH.createHotspotUser(connectionId, config);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:connectionId/pppoe-secret', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { method = 'auto', ...config } = req.body;

    let result;
    if (method === 'rest') {
      result = await mikrotikRest.createPPPoESecret(connectionId, config);
    } else if (method === 'ssh') {
      result = await mikrotikSSH.createPPPoESecret(connectionId, config);
    } else {
      const restConn = mikrotikRest.getConnection(connectionId);
      result = restConn 
        ? await mikrotikRest.createPPPoESecret(connectionId, config)
        : await mikrotikSSH.createPPPoESecret(connectionId, config);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:connectionId/firewall-rule', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { method = 'auto', ...config } = req.body;

    let result;
    if (method === 'rest') {
      result = await mikrotikRest.createFirewallRule(connectionId, config);
    } else if (method === 'ssh') {
      result = await mikrotikSSH.createFirewallRule(connectionId, config);
    } else {
      const restConn = mikrotikRest.getConnection(connectionId);
      result = restConn 
        ? await mikrotikRest.createFirewallRule(connectionId, config)
        : await mikrotikSSH.createFirewallRule(connectionId, config);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:connectionId/nat-rule', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { method = 'auto', ...config } = req.body;

    let result;
    if (method === 'rest') {
      result = await mikrotikRest.createNATRule(connectionId, config);
    } else if (method === 'ssh') {
      result = await mikrotikSSH.createNATRule(connectionId, config);
    } else {
      const restConn = mikrotikRest.getConnection(connectionId);
      result = restConn 
        ? await mikrotikRest.createNATRule(connectionId, config)
        : await mikrotikSSH.createNATRule(connectionId, config);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:connectionId/queue', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { method = 'auto', ...config } = req.body;

    let result;
    if (method === 'rest') {
      result = await mikrotikRest.createQueue(connectionId, config);
    } else if (method === 'ssh') {
      result = await mikrotikSSH.createQueue(connectionId, config);
    } else {
      const restConn = mikrotikRest.getConnection(connectionId);
      result = restConn 
        ? await mikrotikRest.createQueue(connectionId, config)
        : await mikrotikSSH.createQueue(connectionId, config);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════
// SCRIPT EXECUTION
// ═══════════════════════════════════════

router.post('/:connectionId/execute', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { script, method = 'auto' } = req.body;

    if (!script) {
      return res.status(400).json({ error: 'script is required' });
    }

    let result;
    if (method === 'rest') {
      result = await mikrotikRest.executeScript(connectionId, script);
    } else if (method === 'ssh') {
      result = await mikrotikSSH.executeScript(connectionId, script);
    } else {
      const restConn = mikrotikRest.getConnection(connectionId);
      result = restConn 
        ? await mikrotikRest.executeScript(connectionId, script)
        : await mikrotikSSH.executeScript(connectionId, script);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════
// DEPLOYMENT
// ═══════════════════════════════════════

router.post('/:connectionId/deploy', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { script, method, createBackup, validateBeforeDeploy, comment } = req.body;

    if (!script) {
      return res.status(400).json({ error: 'script is required' });
    }

    const result = await mikrotikDeployer.deploy(connectionId, script, {
      method,
      createBackup: createBackup !== false,
      validateBeforeDeploy: validateBeforeDeploy !== false,
      comment,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/deployments/:deploymentId', (req, res) => {
  try {
    const { deploymentId } = req.params;
    const deployment = mikrotikDeployer.getDeployment(deploymentId);
    
    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    res.json({ success: true, deployment });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/deployments', (req, res) => {
  try {
    const { connectionId } = req.query;
    const deployments = mikrotikDeployer.listDeployments(connectionId);
    res.json({ success: true, deployments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/deployments/:deploymentId/rollback', async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const result = await mikrotikDeployer.rollback(deploymentId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/deployments/stats', (req, res) => {
  try {
    const stats = mikrotikDeployer.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════
// BACKUP & RESTORE
// ═══════════════════════════════════════

router.post('/:connectionId/backup', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { name } = req.body;

    const result = await mikrotikDeployer.createBackup(connectionId, name);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:connectionId/restore', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { backupName } = req.body;

    if (!backupName) {
      return res.status(400).json({ error: 'backupName is required' });
    }

    const result = await mikrotikDeployer.restoreBackup(connectionId, backupName);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:connectionId/reboot', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { method = 'auto' } = req.body;

    let result;
    if (method === 'rest') {
      result = await mikrotikRest.reboot(connectionId);
    } else if (method === 'ssh') {
      result = await mikrotikSSH.reboot(connectionId);
    } else {
      const restConn = mikrotikRest.getConnection(connectionId);
      result = restConn 
        ? await mikrotikRest.reboot(connectionId)
        : await mikrotikSSH.reboot(connectionId);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
