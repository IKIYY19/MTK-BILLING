const logger = require("../utils/logger");

class RouterConnectionManager {
  constructor() {
    this.connections = new Map();
    this.queues = new Map();
    this.startIdleCleanup();
  }

  // Retrieve database connection
  getDb() {
    return global.dbAvailable ? global.db : require("../db/memory");
  }

  // Decrypt encrypted password
  decryptPassword(encrypted) {
    return require("../utils/encryption").decrypt(encrypted) || encrypted || "";
  }

  normalizeHost(value) {
    let host = String(value || "").trim();
    if (!host) {
      return "";
    }

    // Router records sometimes store an address with CIDR notation
    // (10.200.0.4/24). TCP clients need only the host portion.
    host = host.replace(/^[a-z]+:\/\//i, "").split("/")[0].trim();
    if (host.startsWith("[") && host.endsWith("]")) {
      host = host.slice(1, -1);
    }
    return host;
  }

  describeError(error) {
    if (!error) {
      return "Unknown MikroTik connection error";
    }

    const errorCode = String(error.code ?? error.errno ?? "").trim();
    const errorMessage = String(error.message || "").trim();
    // node-routeros may expose Linux errno 111 without the symbolic name.
    // 111 is ECONNREFUSED: the host answered, but port 8728 is closed or
    // blocked by the router/firewall.
    if (
      errorCode === "-111" ||
      errorCode === "111" ||
      errorMessage === "-111" ||
      /(?:^|[\s:(])(?:-111|ECONNREFUSED)(?:$|[\s):])/i.test(errorMessage)
    ) {
      return "ECONNREFUSED (connection refused: MikroTik API port is closed or blocked)";
    }

    const details = [
      error.message,
      error.code,
      error.errno,
      error.syscall,
      error.address,
      error.port,
    ].filter((value) => value !== undefined && value !== null && String(value).trim() !== "");

    if (details.length > 0) {
      return [...new Set(details.map(String))].join(" | ");
    }

    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") {
        return serialized;
      }
    } catch (serializationError) {
      // Ignore serialization failures and use the stable fallback below.
    }
    return "Unknown MikroTik connection error";
  }

  // Fetch router details from the database
  async fetchRouterConfig(routerId) {
    const db = this.getDb();
    const result = await db.query(
      "SELECT * FROM mikrotik_connections WHERE id = $1",
      [routerId]
    );
    return result.rows[0] || null;
  }

  /**
   * Resolve the effective connection parameters for a router.
   * If the router is behind CGNAT and has a WireGuard tunnel configured,
   * use the tunnel IP address for the connection. This enables the billing
   * server to reach routers that are otherwise unreachable due to CGNAT.
   */
  resolveEffectiveConfig(config) {
    const effective = { ...config };
    effective.ip_address = this.normalizeHost(config.ip_address);

    // If use_tunnel is enabled and we have a WireGuard tunnel IP, use it
    if (config.use_tunnel && config.wireguard_tunnel_ip) {
      const tunnelIp = this.normalizeHost(config.wireguard_tunnel_ip);
      if (tunnelIp && tunnelIp !== effective.ip_address) {
        logger.info(
          `Router ${config.name || config.ip_address} is behind CGNAT — routing via WireGuard tunnel IP ${tunnelIp}`
        );
        effective.ip_address = tunnelIp;
      }
    }

    // If use_tunnel is enabled and we have SSH tunnel settings (legacy support)
    if (config.use_tunnel && config.tunnel_host && !config.wireguard_tunnel_ip) {
      logger.info(
        `Router ${config.name || config.ip_address} using SSH jump host ${config.tunnel_host}`
      );
      // For SSH tunnel, we'll handle this in the SSH connection method
      effective._useSshJump = true;
    }

    return effective;
  }

  // Determine SSL usage and port from a router config
  resolveApiParams(config) {
    const isSSL =
      config.connection_type === "api-ssl" ||
      (config.api_port && Number(config.api_port) === 8729);
    const defaultPort = isSSL ? 8729 : 8728;
    const port = Number(config.api_port || defaultPort);
    return { isSSL, port };
  }

  // Convert object-style args ({ name: 'x', '.proplist': 'a,b' }) into
  // RouterOS API params ([ '=name=x', '=.proplist=a,b' ]). Arrays pass through.
  toApiParams(args) {
    if (!args) {
      return [];
    }
    if (Array.isArray(args)) {
      return args;
    }
    return Object.entries(args)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `=${key}=${value}`);
  }

  // Create and connect a node-routeros API client for a router config
  async createApiClient(config) {
    const { RouterOSAPI } = require("node-routeros");
    const effectiveConfig = this.resolveEffectiveConfig(config);
    const password = this.decryptPassword(
      effectiveConfig.password_encrypted || effectiveConfig.password
    );
    const { isSSL, port } = this.resolveApiParams(effectiveConfig);

    const api = new RouterOSAPI({
      host: effectiveConfig.ip_address,
      user: effectiveConfig.username,
      password,
      port,
      timeout: 8, // seconds
      // RouterOS routers typically use self-signed certs for api-ssl
      tls: isSSL ? { rejectUnauthorized: false } : undefined,
    });

    try {
      await api.connect();
    } catch (error) {
      throw new Error(
        `MikroTik API connection to ${effectiveConfig.ip_address}:${port} failed: ${this.describeError(error)}`,
      );
    }
    return api;
  }

  // Get an existing cached connection or establish a new one
  async getOrCreateConnection(routerIdOrConfig) {
    let config = null;
    let routerId = null;

    if (typeof routerIdOrConfig === "string") {
      routerId = routerIdOrConfig;
      config = await this.fetchRouterConfig(routerId);
    } else {
      config = routerIdOrConfig;
      routerId = config.id || config.ip_address;
    }

    if (!config) {
      throw new Error("Router configuration not found");
    }

    // Check cached connection (reuse only while still connected)
    if (this.connections.has(routerId)) {
      const connObj = this.connections.get(routerId);
      if (connObj.api && connObj.api.connected) {
        connObj.lastUsed = Date.now();
        return connObj;
      }
      this.closeConnection(routerId);
    }

    const { isSSL, port } = this.resolveApiParams(config);
    logger.info(
      `Establishing new MikroTik connection to ${config.name || config.ip_address} on port ${port} (SSL: ${isSSL})`
    );

    const api = await this.createApiClient(config);

    const connObj = {
      api,
      config,
      created: Date.now(),
      lastUsed: Date.now(),
    };

    this.connections.set(routerId, connObj);
    return connObj;
  }

  // Execute a command sequentially (using promise queuing) on the connection
  async executeCommand(routerIdOrConfig, command, args = {}) {
    let routerId = typeof routerIdOrConfig === "string" ? routerIdOrConfig : routerIdOrConfig.id;
    if (!routerId && typeof routerIdOrConfig === "object") {
      routerId = routerIdOrConfig.ip_address || "temp";
    }

    // Enforce sequential command execution per router
    if (!this.queues.has(routerId)) {
      this.queues.set(routerId, Promise.resolve());
    }

    const queuePromise = this.queues.get(routerId);
    const resultPromise = queuePromise.then(async () => {
      let retries = 1;
      while (retries >= 0) {
        let connObj = null;
        try {
          connObj = await this.getOrCreateConnection(routerIdOrConfig);
          const result = await connObj.api.write(command, this.toApiParams(args));
          connObj.lastUsed = Date.now();
          return result;
        } catch (error) {
          const errorMessage = this.describeError(error);
          logger.warn(`Command execution failed on router ${routerId}: ${errorMessage}. Retries left: ${retries}`);
          this.closeConnection(routerId);
          if (retries === 0) {
            throw new Error(`MikroTik command ${command} failed: ${errorMessage}`);
          }
          retries--;
        }
      }
    });

    // Capture rejection on the queue level to prevent blocking subsequent commands
    this.queues.set(routerId, resultPromise.catch(() => {}));

    return resultPromise;
  }

  // Execute command but gracefully handle errors by returning a fallback value
  async executeCommandSafe(routerIdOrConfig, command, args = {}, fallback = []) {
    try {
      const result = await this.executeCommand(routerIdOrConfig, command, args);
      return Array.isArray(result) ? result : [];
    } catch (error) {
      logger.debug(`Safe execution failed for command ${command}: ${error.message}`);
      return fallback;
    }
  }

  // Print command shorthand
  async print(routerIdOrConfig, path, proplist = null) {
    const args = proplist ? { ".proplist": proplist } : {};
    const result = await this.executeCommand(routerIdOrConfig, `${path}/print`, args);
    return Array.isArray(result) ? result : [];
  }

  // Close and delete a cached connection
  closeConnection(routerId) {
    if (this.connections.has(routerId)) {
      const connObj = this.connections.get(routerId);
      try {
        if (connObj.api) {
          connObj.api.close();
        }
      } catch (err) {
        logger.debug(`Error closing MikroTik connection for router ${routerId}: ${err.message}`);
      }
      this.connections.delete(routerId);
    }
  }

  // Close all cached connections
  closeAll() {
    for (const routerId of this.connections.keys()) {
      this.closeConnection(routerId);
    }
  }

  // Test credentials/API connection without caching
  async testConnection(config) {
    const api = await this.createApiClient(config);
    try {
      // A lightweight command confirms both login and command execution.
      await api.write("/system/identity/print");
    } finally {
      try {
        api.close();
      } catch (err) {
        logger.debug(`Error closing test connection: ${err.message}`);
      }
    }
    return true;
  }

  // Upload a RouterOS script through the API, run it, then remove the
  // temporary script record. This is the remote equivalent of /import.
  async executeScript(routerIdOrConfig, script, { name = `billing-${Date.now()}` } = {}) {
    if (!String(script || "").trim()) {
      throw new Error("RouterOS script is empty");
    }

    const routerId = typeof routerIdOrConfig === "string"
      ? routerIdOrConfig
      : routerIdOrConfig.id || routerIdOrConfig.ip_address;
    const connObj = await this.getOrCreateConnection(routerIdOrConfig);
    let scriptId = null;

    try {
      const addResult = await connObj.api.write(
        "/system/script/add",
        this.toApiParams({
          name,
          source: String(script),
          comment: "MikroTik Billing remote deployment",
        }),
      );

      const addRow = Array.isArray(addResult) ? addResult[0] : addResult;
      scriptId = addRow?.ret || addRow?.[".id"] || null;
      const runTarget = scriptId || name;

      await connObj.api.write(
        "/system/script/run",
        this.toApiParams({ number: runTarget }),
      );
      connObj.lastUsed = Date.now();

      return {
        success: true,
        script_name: name,
        script_id: scriptId,
      };
    } catch (error) {
      throw new Error(`Remote RouterOS script execution failed: ${this.describeError(error)}`);
    } finally {
      if (scriptId || name) {
        try {
          await connObj.api.write(
            "/system/script/remove",
            this.toApiParams({ number: scriptId || name }),
          );
        } catch (cleanupError) {
          logger.warn(
            `Could not remove temporary RouterOS script ${name} from router ${routerId}: ${this.describeError(cleanupError)}`,
          );
        }
      }
    }
  }

  // Test SSH connection
  async testSSHConnection(config) {
    const { NodeSSH } = require("node-ssh");
    const effectiveConfig = this.resolveEffectiveConfig(config);
    const password = this.decryptPassword(effectiveConfig.password_encrypted || effectiveConfig.password);

    // If SSH jump host is configured, use it
    if (effectiveConfig._useSshJump && effectiveConfig.tunnel_host) {
      const jumpSsh = new NodeSSH();
      const jumpPassword = this.decryptPassword(effectiveConfig.tunnel_password_encrypted);
      await jumpSsh.connect({
        host: effectiveConfig.tunnel_host,
        port: Number(effectiveConfig.tunnel_port || 22),
        username: effectiveConfig.tunnel_username || "root",
        password: jumpPassword,
        readyTimeout: 10000,
      });

      // Use the jump host to connect to the target router
      const targetSsh = new NodeSSH();
      await targetSsh.connect({
        host: effectiveConfig.ip_address,
        port: Number(effectiveConfig.ssh_port || 22),
        username: effectiveConfig.username,
        password: password,
        readyTimeout: 10000,
        sock: jumpSsh.getConnection(),
      });

      await targetSsh.execCommand("/system resource print");
      targetSsh.dispose();
      jumpSsh.dispose();
      return true;
    }

    // Direct SSH connection (including through WireGuard tunnel IP)
    const ssh = new NodeSSH();
    await ssh.connect({
      host: effectiveConfig.ip_address,
      port: Number(effectiveConfig.ssh_port || 22),
      username: effectiveConfig.username,
      password: password,
      readyTimeout: 10000,
    });
    await ssh.execCommand("/system resource print");
    ssh.dispose();
    return true;
  }

  // Setup idle connections manager
  startIdleCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const idleTimeout = 2 * 60 * 1000; // 2 minutes

      for (const [routerId, connObj] of this.connections.entries()) {
        if (now - connObj.lastUsed > idleTimeout) {
          logger.info(`Closing idle MikroTik connection to ${connObj.config.name || connObj.config.ip_address}`);
          this.closeConnection(routerId);
        }
      }
    }, 30000); // 30s interval
    
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }
}

module.exports = new RouterConnectionManager();
