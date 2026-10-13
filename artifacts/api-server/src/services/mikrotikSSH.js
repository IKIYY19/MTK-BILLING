/**
 * MikroTik SSH Service (RouterOS v6 & v7)
 * Execute scripts via SSH for devices without REST API enabled
 */

const { NodeSSH } = require('node-ssh');
const crypto = require('crypto');

class MikroTikSSHService {
  constructor() {
    this.connections = new Map();
  }

  /**
   * Create a new SSH connection
   */
  async createConnection({ host, port = 22, username, password, privateKey }) {
    const connectionId = crypto.randomBytes(16).toString('hex');
    
    const ssh = new NodeSSH();
    
    try {
      const config = {
        host,
        port,
        username,
        readyTimeout: 10000,
      };

      if (privateKey) {
        config.privateKey = privateKey;
      } else {
        config.password = password;
      }

      await ssh.connect(config);

      const connection = {
        id: connectionId,
        host,
        port,
        username,
        ssh,
        createdAt: new Date(),
        lastUsed: new Date(),
      };

      this.connections.set(connectionId, connection);
      return connection;
    } catch (error) {
      ssh.dispose();
      throw new Error(`SSH connection failed: ${error.message}`);
    }
  }

  /**
   * Get a connection by ID
   */
  getConnection(connectionId) {
    return this.connections.get(connectionId);
  }

  /**
   * Remove a connection
   */
  async removeConnection(connectionId) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      await connection.ssh.dispose();
      this.connections.delete(connectionId);
    }
  }

  /**
   * Test connection
   */
  async testConnection(connectionId) {
    const connection = this.getConnection(connectionId);
    if (!connection) {
      return { success: false, error: 'Connection not found' };
    }

    try {
      const result = await connection.ssh.execCommand('/system resource print');
      connection.lastUsed = new Date();

      // Parse the output
      const lines = result.stdout.split('\n');
      const data = {};
      lines.forEach(line => {
        const match = line.match(/^([^:]+):\s*(.+)$/);
        if (match) {
          data[match[1].trim().toLowerCase().replace(/ /g, '-')] = match[2].trim();
        }
      });

      return {
        success: true,
        data,
        version: data['version'],
        board: data['board-name'],
        uptime: data['uptime'],
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute a single command
   */
  async executeCommand(connectionId, command) {
    const connection = this.getConnection(connectionId);
    if (!connection) {
      return { success: false, error: 'Connection not found' };
    }

    try {
      const result = await connection.ssh.execCommand(command);
      connection.lastUsed = new Date();

      return {
        success: true,
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute multiple commands in sequence
   */
  async executeCommands(connectionId, commands) {
    const results = [];
    
    for (const command of commands) {
      const result = await this.executeCommand(connectionId, command);
      results.push({ command, result });
    }

    return {
      success: true,
      results,
    };
  }

  /**
   * Execute a script (multi-line)
   */
  async executeScript(connectionId, script) {
    const connection = this.getConnection(connectionId);
    if (!connection) {
      return { success: false, error: 'Connection not found' };
    }

    try {
      // Create a temporary script file
      const scriptName = `deploy_${Date.now()}.rsc`;
      
      // Upload the script
      const uploadResult = await connection.ssh.execCommand(
        `/file print file=${scriptName}`
      );

      // Create the script content
      const createScriptResult = await connection.ssh.execCommand(
        `/system script add name=${scriptName} source="${this.escapeScript(script)}"`
      );

      if (createScriptResult.code !== 0) {
        return {
          success: false,
          error: 'Failed to create script',
          stderr: createScriptResult.stderr,
        };
      }

      // Run the script
      const runResult = await connection.ssh.execCommand(
        `/system script run ${scriptName}`
      );

      // Clean up
      await connection.ssh.execCommand(`/system script remove ${scriptName}`);

      connection.lastUsed = new Date();

      return {
        success: runResult.code === 0,
        stdout: runResult.stdout,
        stderr: runResult.stderr,
        code: runResult.code,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Escape script content for MikroTik
   */
  escapeScript(script) {
    return script
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  }

  /**
   * Get system information
   */
  async getSystemInfo(connectionId) {
    return await this.executeCommand(connectionId, '/system resource print');
  }

  /**
   * Get interfaces
   */
  async getInterfaces(connectionId) {
    return await this.executeCommand(connectionId, '/interface print detail');
  }

  /**
   * Get IP addresses
   */
  async getIPAddresses(connectionId) {
    return await this.executeCommand(connectionId, '/ip address print detail');
  }

  /**
   * Get DHCP leases
   */
  async getDHCPLeases(connectionId) {
    return await this.executeCommand(connectionId, '/ip dhcp-server lease print detail');
  }

  /**
   * Get hotspot users
   */
  async getHotspotUsers(connectionId) {
    return await this.executeCommand(connectionId, '/ip hotspot user print detail');
  }

  /**
   * Get PPPoE secrets
   */
  async getPPPoESecrets(connectionId) {
    return await this.executeCommand(connectionId, '/ppp secret print detail');
  }

  /**
   * Create an IP address
   */
  async createIPAddress(connectionId, { interface: iface, address, comment }) {
    const command = `/ip address add interface=${iface} address=${address} comment="${comment || ''}"`;
    return await this.executeCommand(connectionId, command);
  }

  /**
   * Create a DHCP server
   */
  async createDHCPServer(connectionId, config) {
    const params = Object.entries(config)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    const command = `/ip dhcp-server add ${params}`;
    return await this.executeCommand(connectionId, command);
  }

  /**
   * Create a DHCP network
   */
  async createDHCPNetwork(connectionId, config) {
    const params = Object.entries(config)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    const command = `/ip dhcp-server network add ${params}`;
    return await this.executeCommand(connectionId, command);
  }

  /**
   * Create a DHCP pool
   */
  async createDHCPPool(connectionId, config) {
    const params = Object.entries(config)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    const command = `/ip dhcp-server pool add ${params}`;
    return await this.executeCommand(connectionId, command);
  }

  /**
   * Create a hotspot user
   */
  async createHotspotUser(connectionId, { name, password, profile, limitUptime, limitBytes }) {
    const command = `/ip hotspot user add name=${name} password=${password} profile=${profile} limit-uptime="${limitUptime || ''}" limit-bytes-total="${limitBytes || ''}"`;
    return await this.executeCommand(connectionId, command);
  }

  /**
   * Create a PPPoE secret
   */
  async createPPPoESecret(connectionId, { name, password, profile, service, limitUptime, limitBytes }) {
    const command = `/ppp secret add name=${name} password=${password} profile=${profile} service=${service || 'pppoe'} limit-uptime="${limitUptime || ''}" limit-bytes-total="${limitBytes || ''}"`;
    return await this.executeCommand(connectionId, command);
  }

  /**
   * Create a firewall rule
   */
  async createFirewallRule(connectionId, { chain, srcAddress, dstAddress, action, comment }) {
    const command = `/ip firewall filter add chain=${chain} src-address="${srcAddress || ''}" dst-address="${dstAddress || ''}" action=${action} comment="${comment || ''}"`;
    return await this.executeCommand(connectionId, command);
  }

  /**
   * Create a NAT rule
   */
  async createNATRule(connectionId, { chain, srcAddress, outInterface, action, toAddresses, toPorts }) {
    const command = `/ip firewall nat add chain=${chain} src-address="${srcAddress || ''}" out-interface="${outInterface || ''}" action=${action} to-addresses="${toAddresses || ''}" to-ports="${toPorts || ''}"`;
    return await this.executeCommand(connectionId, command);
  }

  /**
   * Create a queue (bandwidth limit)
   */
  async createQueue(connectionId, { name, target, maxLimit, burstLimit, comment }) {
    const command = `/queue simple add name="${name}" target="${target}" max-limit="${maxLimit || ''}" burst-limit="${burstLimit || ''}" comment="${comment || ''}"`;
    return await this.executeCommand(connectionId, command);
  }

  /**
   * Create a backup
   */
  async createBackup(connectionId, name = null) {
    const backupName = name || `backup_${Date.now()}.backup`;
    const command = `/system backup save name=${backupName}`;
    return await this.executeCommand(connectionId, command);
  }

  /**
   * Restore from backup
   */
  async restoreBackup(connectionId, backupName) {
    const command = `/system backup load name=${backupName}`;
    return await this.executeCommand(connectionId, command);
  }

  /**
   * Reboot the device
   */
  async reboot(connectionId) {
    return await this.executeCommand(connectionId, '/system reboot');
  }

  /**
   * Get active connections
   */
  async getActiveConnections(connectionId) {
    return await this.executeCommand(connectionId, '/ip firewall connection print detail');
  }

  /**
   * Get routing table
   */
  async getRoutes(connectionId) {
    return await this.executeCommand(connectionId, '/ip route print detail');
  }

  /**
   * Get ARP table
   */
  async getARP(connectionId) {
    return await this.executeCommand(connectionId, '/ip arp print detail');
  }

  /**
   * Get wireless registrations
   */
  async getWirelessRegistrations(connectionId) {
    return await this.executeCommand(connectionId, '/interface wireless registration-table print detail');
  }

  /**
   * Get system logs
   */
  async getLogs(connectionId, limit = 100) {
    return await this.executeCommand(connectionId, `/log print without-paging count=${limit}`);
  }

  /**
   * List all connections
   */
  listConnections() {
    return Array.from(this.connections.values()).map(conn => ({
      id: conn.id,
      host: conn.host,
      port: conn.port,
      username: conn.username,
      createdAt: conn.createdAt,
      lastUsed: conn.lastUsed,
    }));
  }
}

module.exports = new MikroTikSSHService();
