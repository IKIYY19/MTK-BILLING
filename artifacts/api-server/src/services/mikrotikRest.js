/**
 * MikroTik RouterOS v7 REST API Service
 * Enables programmatic configuration without manual script copying
 */

const axios = require("axios");
const crypto = require("crypto");

class MikroTikRestService {
  constructor() {
    this.connections = new Map(); // Store active connections
  }

  /**
   * Create a new MikroTik REST API connection
   */
  createConnection({ host, port = 443, username, password, useSSL = true }) {
    const connectionId = crypto.randomBytes(16).toString("hex");

    const connection = {
      id: connectionId,
      host,
      port,
      username,
      password,
      useSSL,
      baseUrl: `${useSSL ? "https" : "http"}://${host}:${port}/rest`,
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    this.connections.set(connectionId, connection);
    return connection;
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
  removeConnection(connectionId) {
    this.connections.delete(connectionId);
  }

  /**
   * Test connection to MikroTik device
   */
  async testConnection(connectionId) {
    const connection = this.getConnection(connectionId);
    if (!connection) {
      return { success: false, error: "Connection not found" };
    }

    try {
      const response = await axios.get(
        `${connection.baseUrl}/system/resource`,
        {
          auth: {
            username: connection.username,
            password: connection.password,
          },
          timeout: 5000,
          httpsAgent: !connection.useSSL
            ? new (require("https").Agent)({ rejectUnauthorized: false })
            : undefined,
        },
      );

      connection.lastUsed = new Date();

      return {
        success: true,
        data: response.data,
        version: response.data["version"],
        board: response.data["board-name"],
        uptime: response.data["uptime"],
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || error.message,
      };
    }
  }

  /**
   * Execute a REST API command
   */
  async executeCommand(connectionId, path, method = "GET", data = null) {
    const connection = this.getConnection(connectionId);
    if (!connection) {
      return { success: false, error: "Connection not found" };
    }

    try {
      const config = {
        auth: {
          username: connection.username,
          password: connection.password,
        },
        timeout: 30000,
      };

      if (!connection.useSSL) {
        config.httpsAgent = new (require("https").Agent)({
          rejectUnauthorized: false,
        });
      }

      let response;
      switch (method.toUpperCase()) {
        case "GET":
          response = await axios.get(`${connection.baseUrl}${path}`, config);
          break;
        case "POST":
          response = await axios.post(
            `${connection.baseUrl}${path}`,
            data,
            config,
          );
          break;
        case "PUT":
          response = await axios.put(
            `${connection.baseUrl}${path}`,
            data,
            config,
          );
          break;
        case "PATCH":
          response = await axios.patch(
            `${connection.baseUrl}${path}`,
            data,
            config,
          );
          break;
        case "DELETE":
          response = await axios.delete(`${connection.baseUrl}${path}`, config);
          break;
        default:
          return { success: false, error: "Invalid HTTP method" };
      }

      connection.lastUsed = new Date();

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || error.message,
        status: error.response?.status,
      };
    }
  }

  /**
   * Get system information
   */
  async getSystemInfo(connectionId) {
    return await this.executeCommand(connectionId, "/system/resource");
  }

  /**
   * Get interface list
   */
  async getInterfaces(connectionId) {
    return await this.executeCommand(connectionId, "/interface");
  }

  /**
   * Get IP addresses
   */
  async getIPAddresses(connectionId) {
    return await this.executeCommand(connectionId, "/ip/address");
  }

  /**
   * Get DHCP leases
   */
  async getDHCPLeases(connectionId) {
    return await this.executeCommand(connectionId, "/ip/dhcp-server/lease");
  }

  /**
   * Get hotspot users
   */
  async getHotspotUsers(connectionId) {
    return await this.executeCommand(connectionId, "/ip/hotspot/user");
  }

  /**
   * Get PPPoE secrets
   */
  async getPPPoESecrets(connectionId) {
    return await this.executeCommand(connectionId, "/ppp/secret");
  }

  /**
   * Create an IP address
   */
  async createIPAddress(connectionId, { interface: iface, address, comment }) {
    return await this.executeCommand(connectionId, "/ip/address", "PUT", {
      interface: iface,
      address,
      comment,
    });
  }

  /**
   * Create a DHCP server
   */
  async createDHCPServer(connectionId, config) {
    return await this.executeCommand(
      connectionId,
      "/ip/dhcp-server",
      "PUT",
      config,
    );
  }

  /**
   * Create a DHCP network
   */
  async createDHCPNetwork(connectionId, config) {
    return await this.executeCommand(
      connectionId,
      "/ip/dhcp-server/network",
      "PUT",
      config,
    );
  }

  /**
   * Create a DHCP pool
   */
  async createDHCPPool(connectionId, config) {
    return await this.executeCommand(
      connectionId,
      "/ip/dhcp-server/pool",
      "PUT",
      config,
    );
  }

  /**
   * Create a hotspot user
   */
  async createHotspotUser(
    connectionId,
    { name, password, profile, limitUptime, limitBytes },
  ) {
    return await this.executeCommand(connectionId, "/ip/hotspot/user", "PUT", {
      name,
      password,
      profile,
      "limit-uptime": limitUptime,
      "limit-bytes-total": limitBytes,
    });
  }

  /**
   * Create a PPPoE secret
   */
  async createPPPoESecret(
    connectionId,
    { name, password, profile, service, limitUptime, limitBytes },
  ) {
    return await this.executeCommand(connectionId, "/ppp/secret", "PUT", {
      name,
      password,
      profile,
      service,
      "limit-uptime": limitUptime,
      "limit-bytes-total": limitBytes,
    });
  }

  /**
   * Create a firewall rule
   */
  async createFirewallRule(
    connectionId,
    { chain, srcAddress, dstAddress, action, comment },
  ) {
    return await this.executeCommand(
      connectionId,
      "/ip/firewall/filter",
      "PUT",
      {
        chain,
        "src-address": srcAddress,
        "dst-address": dstAddress,
        action,
        comment,
      },
    );
  }

  /**
   * Create a NAT rule
   */
  async createNATRule(
    connectionId,
    { chain, srcAddress, outInterface, action, toAddresses, toPorts },
  ) {
    return await this.executeCommand(connectionId, "/ip/firewall/nat", "PUT", {
      chain,
      "src-address": srcAddress,
      "out-interface": outInterface,
      action,
      "to-addresses": toAddresses,
      "to-ports": toPorts,
    });
  }

  /**
   * Create a queue (bandwidth limit)
   */
  async createQueue(
    connectionId,
    { name, target, maxLimit, burstLimit, comment },
  ) {
    return await this.executeCommand(connectionId, "/queue/simple", "PUT", {
      name,
      target,
      "max-limit": maxLimit,
      "burst-limit": burstLimit,
      comment,
    });
  }

  /**
   * Upload and execute a script
   */
  async executeScript(connectionId, script) {
    const connection = this.getConnection(connectionId);
    if (!connection) {
      return { success: false, error: "Connection not found" };
    }

    try {
      // Create a temporary script file
      const scriptName = `deploy_${Date.now()}.rsc`;

      // First, create the script
      const createResponse = await this.executeCommand(
        connectionId,
        "/system/script",
        "PUT",
        {
          name: scriptName,
          source: script,
          dontRequirePermissions: true,
        },
      );

      if (!createResponse.success) {
        return createResponse;
      }

      // Execute the script
      const executeResponse = await this.executeCommand(
        connectionId,
        `/system/script/run`,
        "POST",
        {
          name: scriptName,
        },
      );

      // Clean up the script
      await this.executeCommand(
        connectionId,
        `/system/script/${scriptName}`,
        "DELETE",
      );

      return executeResponse;
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get backup of current configuration
   */
  async createBackup(connectionId, name = null) {
    const backupName = name || `backup_${Date.now()}.backup`;

    const response = await this.executeCommand(
      connectionId,
      "/system/backup/save",
      "POST",
      {
        name: backupName,
      },
    );

    return response;
  }

  /**
   * Restore configuration from backup
   */
  async restoreBackup(connectionId, backupName) {
    return await this.executeCommand(
      connectionId,
      "/system/backup/load",
      "POST",
      {
        name: backupName,
      },
    );
  }

  /**
   * Get all backups
   */
  async getBackups(connectionId) {
    return await this.executeCommand(connectionId, "/file", "GET");
  }

  /**
   * Reboot the device
   */
  async reboot(connectionId) {
    return await this.executeCommand(connectionId, "/system/reboot", "POST");
  }

  /**
   * Get active connections
   */
  async getActiveConnections(connectionId) {
    return await this.executeCommand(connectionId, "/ip/firewall/connection");
  }

  /**
   * Get routing table
   */
  async getRoutes(connectionId) {
    return await this.executeCommand(connectionId, "/ip/route");
  }

  /**
   * Get ARP table
   */
  async getARP(connectionId) {
    return await this.executeCommand(connectionId, "/ip/arp");
  }

  /**
   * Get wireless registrations
   */
  async getWirelessRegistrations(connectionId) {
    return await this.executeCommand(
      connectionId,
      "/interface/wireless/registration-table",
    );
  }

  /**
   * Get system logs
   */
  async getLogs(connectionId, limit = 100) {
    return await this.executeCommand(
      connectionId,
      `/log/print?topics=${limit}`,
    );
  }

  /**
   * List all connections
   */
  listConnections() {
    return Array.from(this.connections.values()).map((conn) => ({
      id: conn.id,
      host: conn.host,
      port: conn.port,
      username: conn.username,
      createdAt: conn.createdAt,
      lastUsed: conn.lastUsed,
    }));
  }

  /**
   * Upload a file to the MikroTik router via REST API
   * Used for captive portal HTML files, logos, etc.
   */
  async uploadFile(connectionId, fileName, fileContent) {
    const connection = this.getConnection(connectionId);
    if (!connection) {
      return { success: false, error: "Connection not found" };
    }

    try {
      const FormData = require("form-data");
      const form = new FormData();
      form.append("file", Buffer.from(fileContent, "utf-8"), {
        filename: fileName,
        contentType: "text/html",
      });

      const response = await axios.post(`${connection.baseUrl}/file`, form, {
        auth: {
          username: connection.username,
          password: connection.password,
        },
        headers: form.getHeaders(),
        timeout: 30000,
        maxContentLength: 10 * 1024 * 1024,
        httpsAgent: !connection.useSSL
          ? new (require("https").Agent)({ rejectUnauthorized: false })
          : undefined,
      });

      connection.lastUsed = new Date();
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || error.message,
        status: error.response?.status,
      };
    }
  }

  /**
   * Upload captive portal HTML to router and configure hotspot
   */
  async uploadHotspotPortal(connectionId, html, portalName) {
    const name = portalName || `portal-${Date.now()}`;
    const connection = this.getConnection(connectionId);
    if (!connection) {
      return { success: false, error: "Connection not found" };
    }

    const results = {
      method: "rest-direct",
      uploaded: [],
      failed: [],
      configured: false,
      portalUrl: null,
    };

    try {
      // Upload login.html (what RouterOS looks for in hotspot directory)
      const loginResult = await this.uploadFile(
        connectionId,
        "login.html",
        html,
      );
      if (loginResult.success) {
        results.uploaded.push("login.html");
      } else {
        results.failed.push({ file: "login.html", error: loginResult.error });
      }

      // Upload named backup copy
      const namedResult = await this.uploadFile(
        connectionId,
        `${name}.html`,
        html,
      );
      if (namedResult.success) {
        results.uploaded.push(`${name}.html`);
      }

      // Move file to hotspot directory via script
      const moveScript = `
:do {
  /file remove [find name="hotspot/login.html"]
} on-error={}
:delay 500ms
:do {
  /file move [find name="login.html"] destination=hotspot/
} on-error={}
`;
      const moveResult = await this.executeScript(connectionId, moveScript);
      results.configured = moveResult.success;

      return {
        success: results.uploaded.length > 0,
        results,
        message:
          results.uploaded.length > 0
            ? `Portal pushed: ${results.uploaded.join(", ")}`
            : "Failed to upload any files",
      };
    } catch (error) {
      return {
        success: false,
        results,
        error: error.message,
      };
    }
  }

  /**
   * Get hotspot profiles from router
   */
  async getHotspotProfiles(connectionId) {
    return await this.executeCommand(connectionId, "/ip/hotspot/profile");
  }
}

module.exports = new MikroTikRestService();
