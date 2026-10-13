"use strict";

/**
 * Real MikroTik Monitoring Service
 *
 * This service intentionally does not generate dummy/random monitoring data.
 * It connects to configured MikroTik routers through the RouterOS API and
 * returns real system, interface, PPPoE, Hotspot, queue, and traffic metrics.
 *
 * If no router is configured, credentials are missing, or a router is offline,
 * the service returns explicit empty/error/degraded states instead of fake data.
 */

const logger = require("../utils/logger");
const routerConnectionManager = require("./routerConnectionManager");

const DEFAULT_API_PORT = 8728;
const DEFAULT_TOTAL_BANDWIDTH_BPS = 0;

class RealMonitoringService {
  constructor() {
    this.previousInterfaceCounters = new Map();
    this.latestSnapshots = new Map();
  }

  getDb() {
    return global.db || require("../db/memory");
  }

  getEncryptionKey() {
    return require("../utils/encryption").getEncryptionKey();
  }


  async listConnections() {
    const db = this.getDb();

    try {
      const result = await db.query(
        `SELECT id,
                name,
                ip_address,
                api_port,
                username,
                password_encrypted,
                connection_type,
                is_online,
                last_seen,
                created_at,
                updated_at
         FROM mikrotik_connections
         ORDER BY created_at DESC`,
        [],
      );

      return result.rows || [];
    } catch (error) {
      logger.error("Failed to list MikroTik connections for monitoring", {
        error: error.message,
      });
      return [];
    }
  }

  async getConnection(connectionId) {
    const db = this.getDb();

    const result = await db.query(
      `SELECT id,
              name,
              ip_address,
              api_port,
              username,
              password_encrypted,
              connection_type,
              is_online,
              last_seen,
              created_at,
              updated_at
       FROM mikrotik_connections
       WHERE id = $1`,
      [connectionId],
    );

    return result.rows[0] || null;
  }



  toNumber(value, fallback = 0) {
    if (value === undefined || value === null || value === "") {
      return fallback;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  parseBoolean(value) {
    if (typeof value === "boolean") {
      return value;
    }

    const text = String(value ?? "").toLowerCase();
    return text === "true" || text === "yes" || text === "1";
  }

  parseBytes(value) {
    if (value === undefined || value === null || value === "") {
      return 0;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }

    const text = String(value).trim();

    if (/^\d+$/.test(text)) {
      return Number(text);
    }

    const match = text.match(/^([\d.]+)\s*([kmgtp]?i?b?)?$/i);
    if (!match) {
      return 0;
    }

    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) {
      return 0;
    }

    const unit = String(match[2] || "")
      .toLowerCase()
      .replace("ib", "")
      .replace("b", "");
    const multipliers = {
      "": 1,
      k: 1024,
      m: 1024 ** 2,
      g: 1024 ** 3,
      t: 1024 ** 4,
      p: 1024 ** 5,
    };

    return Math.round(amount * (multipliers[unit] || 1));
  }

  parseRateToBps(value) {
    if (!value) {
      return 0;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }

    const text = String(value).trim();

    if (/^\d+$/.test(text)) {
      return Number(text);
    }

    const match = text.match(/^([\d.]+)\s*([kmgt]?)(bit|bps|b)?$/i);
    if (!match) {
      return 0;
    }

    const amount = Number(match[1]);
    const unit = String(match[2] || "").toLowerCase();
    const multipliers = {
      "": 1,
      k: 1000,
      m: 1000 ** 2,
      g: 1000 ** 3,
      t: 1000 ** 4,
    };

    return Math.round(amount * (multipliers[unit] || 1));
  }

  parseUptimeToSeconds(value) {
    if (!value) {
      return 0;
    }

    if (typeof value === "number") {
      return value;
    }

    const text = String(value);
    let total = 0;

    const weeks = text.match(/(\d+)w/);
    const days = text.match(/(\d+)d/);
    const hours = text.match(/(\d+)h/);
    const minutes = text.match(/(\d+)m/);
    const seconds = text.match(/(\d+)s/);

    if (weeks) {total += Number(weeks[1]) * 7 * 24 * 60 * 60;}
    if (days) {total += Number(days[1]) * 24 * 60 * 60;}
    if (hours) {total += Number(hours[1]) * 60 * 60;}
    if (minutes) {total += Number(minutes[1]) * 60;}
    if (seconds) {total += Number(seconds[1]);}

    return total;
  }

  getMemoryUsage(resource) {
    const total = this.parseBytes(resource["total-memory"]);
    const free = this.parseBytes(resource["free-memory"]);

    if (!total) {
      return 0;
    }

    return Math.max(0, Math.min(100, ((total - free) / total) * 100));
  }

  normalizeSystemResource(resource = {}) {
    const cpuUsage = this.toNumber(resource["cpu-load"]);
    const totalMemory = this.parseBytes(resource["total-memory"]);
    const freeMemory = this.parseBytes(resource["free-memory"]);

    return {
      boardName: resource["board-name"] || resource.board || null,
      platform: resource.platform || null,
      version: resource.version || null,
      architecture: resource["architecture-name"] || null,
      cpu: resource.cpu || null,
      cpuCount: this.toNumber(resource["cpu-count"]),
      cpuFrequency: this.toNumber(resource["cpu-frequency"]),
      cpuUsage,
      memoryUsage: this.getMemoryUsage(resource),
      totalMemory,
      freeMemory,
      usedMemory: Math.max(0, totalMemory - freeMemory),
      uptime: resource.uptime || null,
      uptimeSeconds: this.parseUptimeToSeconds(resource.uptime),
      buildTime: resource["build-time"] || null,
      factorySoftware: resource["factory-software"] || null,
    };
  }

  normalizeInterface(raw = {}, connectionId, timestampMs) {
    const id = raw[".id"] || raw.id || raw.name;
    const name = raw.name || id;
    const rxByte = this.parseBytes(raw["rx-byte"] ?? raw.rx_byte ?? raw.rx);
    const txByte = this.parseBytes(raw["tx-byte"] ?? raw.tx_byte ?? raw.tx);
    const previousKey = `${connectionId}:${name}`;
    const previous = this.previousInterfaceCounters.get(previousKey);

    let rxBps = 0;
    let txBps = 0;

    if (previous && timestampMs > previous.timestampMs) {
      const elapsedSeconds = (timestampMs - previous.timestampMs) / 1000;
      const rxDelta = Math.max(0, rxByte - previous.rxByte);
      const txDelta = Math.max(0, txByte - previous.txByte);

      rxBps = Math.round((rxDelta * 8) / elapsedSeconds);
      txBps = Math.round((txDelta * 8) / elapsedSeconds);
    }

    this.previousInterfaceCounters.set(previousKey, {
      timestampMs,
      rxByte,
      txByte,
    });

    const disabled = this.parseBoolean(raw.disabled);
    const running = this.parseBoolean(raw.running);

    return {
      id,
      name,
      type: raw.type || null,
      macAddress: raw["mac-address"] || null,
      mtu: this.toNumber(raw.mtu),
      actualMtu: this.toNumber(raw["actual-mtu"]),
      disabled,
      running,
      status: disabled ? "disabled" : running ? "up" : "down",
      rxByte,
      txByte,
      rxPacket: this.toNumber(raw["rx-packet"]),
      txPacket: this.toNumber(raw["tx-packet"]),
      rxDrop: this.toNumber(raw["rx-drop"]),
      txDrop: this.toNumber(raw["tx-drop"]),
      rxError: this.toNumber(raw["rx-error"]),
      txError: this.toNumber(raw["tx-error"]),
      rxBps,
      txBps,
      totalBps: rxBps + txBps,
      comment: raw.comment || null,
    };
  }

  normalizePppoeSession(session = {}) {
    const uptime = session.uptime || session["session-time"] || null;

    return {
      id: session[".id"] || session.id || session.name,
      username: session.name || session.username || null,
      service: session.service || null,
      callerId: session["caller-id"] || null,
      address: session.address || null,
      uptime,
      uptimeSeconds: this.parseUptimeToSeconds(uptime),
      encoding: session.encoding || null,
      bytesIn: this.parseBytes(session["bytes-in"] ?? session.bytes_in),
      bytesOut: this.parseBytes(session["bytes-out"] ?? session.bytes_out),
      packetsIn: this.toNumber(session["packets-in"] ?? session.packets_in),
      packetsOut: this.toNumber(session["packets-out"] ?? session.packets_out),
    };
  }

  normalizeHotspotSession(session = {}) {
    const uptime = session.uptime || null;

    return {
      id: session[".id"] || session.id || session.user,
      username: session.user || session.name || null,
      address: session.address || null,
      macAddress: session["mac-address"] || null,
      uptime,
      uptimeSeconds: this.parseUptimeToSeconds(uptime),
      bytesIn: this.parseBytes(session["bytes-in"] ?? session.bytes_in),
      bytesOut: this.parseBytes(session["bytes-out"] ?? session.bytes_out),
      loginBy: session["login-by"] || null,
      server: session.server || null,
    };
  }

  normalizeQueue(queue = {}) {
    const bytes = String(queue.bytes || "");
    const [bytesInText, bytesOutText] = bytes.split("/");
    const rate = String(queue.rate || "");
    const [rateInText, rateOutText] = rate.split("/");

    return {
      id: queue[".id"] || queue.id || queue.name,
      name: queue.name || null,
      target: queue.target || null,
      maxLimit: queue["max-limit"] || null,
      bytesIn: this.parseBytes(bytesInText),
      bytesOut: this.parseBytes(bytesOutText),
      rateInBps: this.parseRateToBps(rateInText),
      rateOutBps: this.parseRateToBps(rateOutText),
      disabled: this.parseBoolean(queue.disabled),
      comment: queue.comment || null,
    };
  }

  async getCustomerUsageBySessions(pppoeSessions = []) {
    if (!pppoeSessions.length) {
      return [];
    }

    const db = this.getDb();
    const usage = [];

    for (const session of pppoeSessions) {
      if (!session.username) {
        continue;
      }

      let customer = null;

      try {
        const result = await db.query(
          `SELECT c.id,
                  c.name,
                  sp.quota_gb,
                  s.id AS subscription_id,
                  s.pppoe_username
           FROM subscriptions s
           JOIN customers c ON c.id = s.customer_id
           LEFT JOIN service_plans sp ON sp.id = s.plan_id
           WHERE s.pppoe_username = $1
           ORDER BY s.created_at DESC
           LIMIT 1`,
          [session.username],
        );

        customer = result.rows[0] || null;
      } catch (error) {
        logger.debug("Customer usage lookup failed", {
          username: session.username,
          error: error.message,
        });
      }

      const used = session.bytesIn + session.bytesOut;
      const limit = customer?.quota_gb
        ? Number(customer.quota_gb) * 1024 ** 3
        : 0;

      usage.push({
        id: customer?.id || session.username,
        subscriptionId: customer?.subscription_id || null,
        username: session.username,
        name: customer?.name || session.username,
        usage: used,
        limit,
        percentage: limit > 0 ? Math.min(100, (used / limit) * 100) : 0,
      });
    }

    return usage;
  }

  async updateConnectionStatus(connectionId, isOnline) {
    const db = this.getDb();

    try {
      await db.query(
        `UPDATE mikrotik_connections
         SET is_online = $1,
             last_seen = CASE WHEN $1 = true THEN CURRENT_TIMESTAMP ELSE last_seen END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [isOnline, connectionId],
      );
    } catch (error) {
      logger.debug("Failed to update MikroTik monitoring connection status", {
        connectionId,
        error: error.message,
      });
    }
  }

  async collectConnectionSnapshot(connection) {
    const startedAt = Date.now();
    const timestamp = new Date().toISOString();

    try {
      const resources = await routerConnectionManager.print(
        connection,
        "/system/resource"
      );
      const interfacesRaw = await routerConnectionManager.print(
        connection,
        "/interface",
        ".id,name,type,mtu,actual-mtu,mac-address,disabled,running,rx-byte,tx-byte,rx-packet,tx-packet,rx-drop,tx-drop,rx-error,tx-error,comment"
      );

      const pppoeRaw = await routerConnectionManager.executeCommandSafe(
        connection,
        "/ppp/active/print",
        {
          ".proplist":
            ".id,name,service,caller-id,address,uptime,encoding,bytes-in,bytes-out,packets-in,packets-out",
        }
      );

      const hotspotRaw = await routerConnectionManager.executeCommandSafe(
        connection,
        "/ip/hotspot/active/print",
        {
          ".proplist":
            ".id,user,address,mac-address,uptime,bytes-in,bytes-out,login-by,server",
        }
      );

      const queuesRaw = await routerConnectionManager.executeCommandSafe(
        connection,
        "/queue/simple/print",
        {
          ".proplist":
            ".id,name,target,max-limit,bytes,rate,disabled,comment",
        }
      );

      const resource = this.normalizeSystemResource(resources[0] || {});
      const interfaces = interfacesRaw.map((item) =>
        this.normalizeInterface(item, connection.id, startedAt),
      );
      const pppoeSessions = pppoeRaw.map((item) =>
        this.normalizePppoeSession(item),
      );
      const hotspotSessions = hotspotRaw.map((item) =>
        this.normalizeHotspotSession(item),
      );
      const queues = queuesRaw.map((item) => this.normalizeQueue(item));
      const customerUsage =
        await this.getCustomerUsageBySessions(pppoeSessions);

      const downloadSpeed = interfaces.reduce(
        (sum, item) => sum + item.rxBps,
        0,
      );
      const uploadSpeed = interfaces.reduce(
        (sum, item) => sum + item.txBps,
        0,
      );
      const usedBandwidth = downloadSpeed + uploadSpeed;

      const totalBandwidth = Number(
        process.env.MONITORING_TOTAL_BANDWIDTH_BPS ||
          DEFAULT_TOTAL_BANDWIDTH_BPS,
      );

      const snapshot = {
        connection: {
          id: connection.id,
          name: connection.name,
          ip_address: connection.ip_address,
          api_port: connection.api_port || DEFAULT_API_PORT,
        },
        timestamp,
        status: "online",
        latencyMs: Date.now() - startedAt,
        totalBandwidth,
        usedBandwidth,
        downloadSpeed,
        uploadSpeed,
        activeConnections: pppoeSessions.length + hotspotSessions.length,
        activePppoe: pppoeSessions.length,
        activeHotspot: hotspotSessions.length,
        latency: Date.now() - startedAt,
        packetLoss: null,
        systemStatus: resource,
        interfaces,
        pppoeSessions,
        hotspotSessions,
        queues,
        customerUsage,
      };

      await this.updateConnectionStatus(connection.id, true);
      this.latestSnapshots.set(connection.id, snapshot);

      return snapshot;
    } catch (error) {
      await this.updateConnectionStatus(connection.id, false);

      const offlineSnapshot = {
        connection: {
          id: connection.id,
          name: connection.name,
          ip_address: connection.ip_address,
          api_port: connection.api_port || DEFAULT_API_PORT,
        },
        timestamp,
        status: "offline",
        latencyMs: Date.now() - startedAt,
        error: error.message,
        totalBandwidth: 0,
        usedBandwidth: 0,
        downloadSpeed: 0,
        uploadSpeed: 0,
        activeConnections: 0,
        activePppoe: 0,
        activeHotspot: 0,
        latency: null,
        packetLoss: null,
        systemStatus: null,
        interfaces: [],
        pppoeSessions: [],
        hotspotSessions: [],
        queues: [],
        customerUsage: [],
      };

      this.latestSnapshots.set(connection.id, offlineSnapshot);

      logger.warn("Real MikroTik monitoring snapshot failed", {
        connectionId: connection.id,
        name: connection.name,
        ip: connection.ip_address,
        error: error.message,
      });

      return offlineSnapshot;
    }
  }

  async collectAllSnapshots() {
    const connections = await this.listConnections();

    if (connections.length === 0) {
      return {
        timestamp: new Date().toISOString(),
        status: "not_configured",
        message: "No MikroTik connections configured",
        connections: [],
        currentBandwidth: this.emptyBandwidth(),
        snapshots: [],
      };
    }

    const snapshots = await Promise.all(
      connections.map((connection) =>
        this.collectConnectionSnapshot(connection),
      ),
    );

    return this.aggregateSnapshots(snapshots);
  }

  async collectSnapshot(connectionId) {
    const connection = await this.getConnection(connectionId);

    if (!connection) {
      throw new Error("MikroTik connection not found");
    }

    return this.collectConnectionSnapshot(connection);
  }

  aggregateSnapshots(snapshots = []) {
    const online = snapshots.filter((snapshot) => snapshot.status === "online");
    const interfaces = snapshots.flatMap(
      (snapshot) => snapshot.interfaces || [],
    );
    const customerUsage = snapshots.flatMap(
      (snapshot) => snapshot.customerUsage || [],
    );
    const pppoeSessions = snapshots.flatMap(
      (snapshot) => snapshot.pppoeSessions || [],
    );
    const hotspotSessions = snapshots.flatMap(
      (snapshot) => snapshot.hotspotSessions || [],
    );

    const currentBandwidth = {
      totalBandwidth: snapshots.reduce(
        (sum, item) => sum + (item.totalBandwidth || 0),
        0,
      ),
      usedBandwidth: snapshots.reduce(
        (sum, item) => sum + (item.usedBandwidth || 0),
        0,
      ),
      downloadSpeed: snapshots.reduce(
        (sum, item) => sum + (item.downloadSpeed || 0),
        0,
      ),
      uploadSpeed: snapshots.reduce(
        (sum, item) => sum + (item.uploadSpeed || 0),
        0,
      ),
      activeConnections: snapshots.reduce(
        (sum, item) => sum + (item.activeConnections || 0),
        0,
      ),
      activePppoe: snapshots.reduce(
        (sum, item) => sum + (item.activePppoe || 0),
        0,
      ),
      activeHotspot: snapshots.reduce(
        (sum, item) => sum + (item.activeHotspot || 0),
        0,
      ),
      latency: online.length
        ? Math.round(
            online.reduce((sum, item) => sum + (item.latency || 0), 0) /
              online.length,
          )
        : null,
      packetLoss: null,
      interfaces,
      customerUsage,
      systemStatus: {
        routersOnline: online.length,
        routersTotal: snapshots.length,
        routersOffline: snapshots.length - online.length,
      },
    };

    return {
      timestamp: new Date().toISOString(),
      status: online.length > 0 ? "online" : "offline",
      connections: snapshots.map((snapshot) => ({
        ...snapshot.connection,
        status: snapshot.status,
        error: snapshot.error || null,
        latencyMs: snapshot.latencyMs,
      })),
      currentBandwidth,
      snapshots,
      pppoeSessions,
      hotspotSessions,
    };
  }

  emptyBandwidth() {
    return {
      totalBandwidth: 0,
      usedBandwidth: 0,
      downloadSpeed: 0,
      uploadSpeed: 0,
      activeConnections: 0,
      activePppoe: 0,
      activeHotspot: 0,
      latency: null,
      packetLoss: null,
      interfaces: [],
      customerUsage: [],
      systemStatus: {
        routersOnline: 0,
        routersTotal: 0,
        routersOffline: 0,
      },
    };
  }

  getLatestSnapshot(connectionId) {
    if (connectionId) {
      return this.latestSnapshots.get(connectionId) || null;
    }

    return this.aggregateSnapshots(Array.from(this.latestSnapshots.values()));
  }

  async testConnection(connectionId) {
    const snapshot = await this.collectSnapshot(connectionId);

    return {
      success: snapshot.status === "online",
      status: snapshot.status,
      latencyMs: snapshot.latencyMs,
      error: snapshot.error || null,
      systemStatus: snapshot.systemStatus,
    };
  }
}

module.exports = new RealMonitoringService();
