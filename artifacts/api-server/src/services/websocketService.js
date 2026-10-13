"use strict";

/**
 * Real-time MikroTik WebSocket Monitoring Service
 *
 * This service does not generate simulated, mock, random, or placeholder metrics.
 * All monitoring payloads are collected from configured MikroTik RouterOS API
 * connections through realMonitoringService.
 *
 * If there are no configured routers, missing credentials, or unreachable routers,
 * the service reports explicit not_configured/offline/error states instead of
 * inventing data.
 */

const WebSocket = require("ws");
const crypto = require("crypto");
const logger = require("../utils/logger");
const realMonitoringService = require("./realMonitoringService");

class BandwidthWebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map();
    this.history = [];
    this.latestData = null;
    this.collectionInterval = null;
    this.isRunning = false;

    this.collectionIntervalMs = Number(
      process.env.MONITORING_WS_INTERVAL_MS || 5000,
    );
    this.historyLimit = Number(process.env.MONITORING_WS_HISTORY_LIMIT || 300);
    this.cpuWarningThreshold = Number(
      process.env.MONITORING_CPU_WARNING_THRESHOLD || 85,
    );
    this.memoryWarningThreshold = Number(
      process.env.MONITORING_MEMORY_WARNING_THRESHOLD || 85,
    );
  }

  initialize(server) {
    if (this.wss) {
      logger.warn("Bandwidth WebSocket service already initialized");
      return;
    }

    try {
      this.wss = new WebSocket.Server({
        server,
        path: "/ws-bandwidth",
      });

      this.wss.on("connection", (ws, req) => {
        const clientId = this.generateClientId();
        const clientInfo = {
          id: clientId,
          ws,
          ip: req.socket.remoteAddress,
          connectedAt: new Date(),
          subscriptions: new Set(),
        };

        this.clients.set(clientId, clientInfo);

        logger.info("Real monitoring WebSocket client connected", {
          clientId,
          ip: req.socket.remoteAddress,
        });

        this.sendInitialData(clientId);

        ws.on("message", (message) => {
          this.handleMessage(clientId, message);
        });

        ws.on("close", () => {
          this.clients.delete(clientId);
          logger.info("Real monitoring WebSocket client disconnected", {
            clientId,
          });
        });

        ws.on("error", (error) => {
          logger.error("Real monitoring WebSocket client error", {
            clientId,
            error: error.message,
          });
          this.clients.delete(clientId);
        });
      });

      this.startBandwidthCollection();

      logger.info("Real MikroTik bandwidth WebSocket service initialized", {
        path: "/ws-bandwidth",
        collectionIntervalMs: this.collectionIntervalMs,
      });
    } catch (error) {
      logger.error("Failed to initialize real monitoring WebSocket service", {
        error: error.message,
      });
    }
  }

  generateClientId() {
    if (typeof crypto.randomUUID === "function") {
      return `client_${crypto.randomUUID()}`;
    }

    return `client_${crypto.randomBytes(12).toString("hex")}`;
  }

  async handleMessage(clientId, message) {
    try {
      const data = JSON.parse(message);
      const client = this.clients.get(clientId);

      if (!client) {
        return;
      }

      switch (data.type) {
        case "subscribe":
          this.handleSubscription(
            clientId,
            Array.isArray(data.channels) ? data.channels : [],
          );
          break;

        case "unsubscribe":
          this.handleUnsubscription(
            clientId,
            Array.isArray(data.channels) ? data.channels : [],
          );
          break;

        case "getHistoricalData":
          this.sendHistoricalData(clientId, data.timeRange);
          break;

        case "refresh":
          await this.collectBandwidthData({ forceBroadcast: true });
          break;

        default:
          logger.warn("Unknown real monitoring WebSocket message type", {
            type: data.type,
            clientId,
          });
      }
    } catch (error) {
      logger.error("Error handling real monitoring WebSocket message", {
        clientId,
        error: error.message,
      });
    }
  }

  handleSubscription(clientId, channels) {
    const client = this.clients.get(clientId);

    if (!client) {
      return;
    }

    channels.forEach((channel) => {
      client.subscriptions.add(channel);
    });

    logger.info("Real monitoring client subscribed", {
      clientId,
      channels,
    });

    if (this.latestData) {
      this.sendToClient(clientId, {
        type: "bandwidth_update",
        timestamp: this.latestData.timestamp,
        data: this.latestData.currentBandwidth,
        connections: this.latestData.connections,
        snapshots: this.latestData.snapshots,
        status: this.latestData.status,
        message: this.latestData.message || null,
      });
    }
  }

  handleUnsubscription(clientId, channels) {
    const client = this.clients.get(clientId);

    if (!client) {
      return;
    }

    channels.forEach((channel) => {
      client.subscriptions.delete(channel);
    });

    logger.info("Real monitoring client unsubscribed", {
      clientId,
      channels,
    });
  }

  async sendInitialData(clientId) {
    const client = this.clients.get(clientId);

    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      const data =
        this.latestData || (await realMonitoringService.collectAllSnapshots());
      this.latestData = data;

      this.sendToClient(clientId, {
        type: "initial_data",
        timestamp: data.timestamp,
        status: data.status,
        message: data.message || null,
        data: {
          currentBandwidth: data.currentBandwidth,
          activeConnections: {
            total: data.currentBandwidth?.activeConnections || 0,
            active: data.currentBandwidth?.activeConnections || 0,
            pppoe: data.currentBandwidth?.activePppoe || 0,
            hotspot: data.currentBandwidth?.activeHotspot || 0,
          },
          systemStatus: data.currentBandwidth?.systemStatus || null,
          connections: data.connections || [],
          snapshots: data.snapshots || [],
        },
      });
    } catch (error) {
      logger.error("Error sending real monitoring initial data", {
        clientId,
        error: error.message,
      });

      this.sendToClient(clientId, {
        type: "monitoring_error",
        timestamp: new Date().toISOString(),
        error: error.message,
      });
    }
  }

  sendHistoricalData(clientId, timeRange) {
    const client = this.clients.get(clientId);

    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      this.sendToClient(clientId, {
        type: "historical_data",
        timestamp: new Date().toISOString(),
        timeRange,
        data: this.getHistoricalBandwidthData(timeRange),
      });
    } catch (error) {
      logger.error("Error sending real monitoring historical data", {
        clientId,
        error: error.message,
      });
    }
  }

  startBandwidthCollection() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    this.collectBandwidthData({ forceBroadcast: true }).catch((error) => {
      logger.error("Initial real monitoring collection failed", {
        error: error.message,
      });
    });

    this.collectionInterval = setInterval(() => {
      this.collectBandwidthData().catch((error) => {
        logger.error("Scheduled real monitoring collection failed", {
          error: error.message,
        });
      });
    }, this.collectionIntervalMs);

    logger.info("Real MikroTik bandwidth collection started", {
      intervalMs: this.collectionIntervalMs,
    });
  }

  stopBandwidthCollection() {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }

    this.isRunning = false;

    logger.info("Real MikroTik bandwidth collection stopped");
  }

  async collectBandwidthData({ forceBroadcast = false } = {}) {
    const data = await realMonitoringService.collectAllSnapshots();

    this.latestData = data;
    this.appendHistory(data);

    const message = {
      type: "bandwidth_update",
      timestamp: data.timestamp,
      status: data.status,
      message: data.message || null,
      data: data.currentBandwidth,
      connections: data.connections || [],
      snapshots: data.snapshots || [],
    };

    if (forceBroadcast || this.hasSubscribers("bandwidth")) {
      this.broadcastToSubscribers("bandwidth", message);
    }

    this.checkRealAlerts(data);

    return data;
  }

  appendHistory(data) {
    this.history.push({
      timestamp: data.timestamp,
      status: data.status,
      currentBandwidth: data.currentBandwidth,
      connections: data.connections || [],
    });

    while (this.history.length > this.historyLimit) {
      this.history.shift();
    }
  }

  getHistoricalBandwidthData(timeRange) {
    const now = Date.now();
    let windowMs = 60 * 60 * 1000;

    switch (timeRange) {
      case "15m":
        windowMs = 15 * 60 * 1000;
        break;

      case "1h":
        windowMs = 60 * 60 * 1000;
        break;

      case "6h":
        windowMs = 6 * 60 * 60 * 1000;
        break;

      case "24h":
        windowMs = 24 * 60 * 60 * 1000;
        break;

      case "7d":
        windowMs = 7 * 24 * 60 * 60 * 1000;
        break;

      default:
        windowMs = 60 * 60 * 1000;
    }

    return this.history.filter((item) => {
      const timestamp = new Date(item.timestamp).getTime();
      return Number.isFinite(timestamp) && timestamp >= now - windowMs;
    });
  }

  hasSubscribers(channel) {
    for (const client of this.clients.values()) {
      if (
        client.subscriptions.has(channel) &&
        client.ws.readyState === WebSocket.OPEN
      ) {
        return true;
      }
    }

    return false;
  }

  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);

    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      client.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error("Failed to send real monitoring WebSocket message", {
        clientId,
        error: error.message,
      });
      return false;
    }
  }

  broadcastToSubscribers(channel, message) {
    this.clients.forEach((client, clientId) => {
      if (!client.subscriptions.has(channel)) {
        return;
      }

      if (client.ws.readyState !== WebSocket.OPEN) {
        return;
      }

      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        logger.error("Error broadcasting real monitoring update", {
          clientId,
          channel,
          error: error.message,
        });
      }
    });
  }

  checkRealAlerts(data) {
    if (!data) {
      return;
    }

    if (data.status === "not_configured") {
      this.broadcastToSubscribers("alerts", {
        type: "alert",
        level: "info",
        message:
          data.message ||
          "No MikroTik connections configured for real monitoring",
        timestamp: data.timestamp || new Date().toISOString(),
        data: {
          status: data.status,
        },
      });
      return;
    }

    const snapshots = Array.isArray(data.snapshots) ? data.snapshots : [];

    snapshots.forEach((snapshot) => {
      const connectionName =
        snapshot.connection?.name ||
        snapshot.connection?.ip_address ||
        "Unknown router";

      if (snapshot.status !== "online") {
        this.broadcastToSubscribers("alerts", {
          type: "alert",
          level: "error",
          message: `${connectionName} is offline or unreachable${snapshot.error ? `: ${snapshot.error}` : ""}`,
          timestamp: snapshot.timestamp || new Date().toISOString(),
          data: {
            connection: snapshot.connection,
            status: snapshot.status,
            error: snapshot.error || null,
          },
        });
        return;
      }

      const cpuUsage = Number(snapshot.systemStatus?.cpuUsage || 0);
      const memoryUsage = Number(snapshot.systemStatus?.memoryUsage || 0);

      if (cpuUsage >= this.cpuWarningThreshold) {
        this.broadcastToSubscribers("alerts", {
          type: "alert",
          level: "warning",
          message: `${connectionName} CPU usage is ${cpuUsage.toFixed(1)}%`,
          timestamp: snapshot.timestamp || new Date().toISOString(),
          data: {
            connection: snapshot.connection,
            cpuUsage,
            threshold: this.cpuWarningThreshold,
          },
        });
      }

      if (memoryUsage >= this.memoryWarningThreshold) {
        this.broadcastToSubscribers("alerts", {
          type: "alert",
          level: "warning",
          message: `${connectionName} memory usage is ${memoryUsage.toFixed(1)}%`,
          timestamp: snapshot.timestamp || new Date().toISOString(),
          data: {
            connection: snapshot.connection,
            memoryUsage,
            threshold: this.memoryWarningThreshold,
          },
        });
      }

      const interfaces = Array.isArray(snapshot.interfaces)
        ? snapshot.interfaces
        : [];
      interfaces
        .filter((iface) => !iface.disabled && iface.status === "down")
        .forEach((iface) => {
          this.broadcastToSubscribers("alerts", {
            type: "alert",
            level: "warning",
            message: `${connectionName} interface ${iface.name} is down`,
            timestamp: snapshot.timestamp || new Date().toISOString(),
            data: {
              connection: snapshot.connection,
              interface: iface,
            },
          });
        });

      const customers = Array.isArray(snapshot.customerUsage)
        ? snapshot.customerUsage
        : [];
      customers
        .filter((customer) => customer.limit > 0 && customer.percentage >= 90)
        .forEach((customer) => {
          this.broadcastToSubscribers("alerts", {
            type: "alert",
            level: customer.percentage >= 98 ? "warning" : "info",
            message: `${customer.name} is at ${customer.percentage.toFixed(1)}% of data quota`,
            timestamp: snapshot.timestamp || new Date().toISOString(),
            data: {
              connection: snapshot.connection,
              customer,
            },
          });
        });
    });
  }

  getCurrentBandwidthData() {
    return (
      this.latestData?.currentBandwidth ||
      realMonitoringService.emptyBandwidth()
    );
  }

  getStats() {
    return {
      connectedClients: this.clients.size,
      isRunning: this.isRunning,
      dataPoints: this.history.length,
      latestStatus: this.latestData?.status || "unknown",
      latestTimestamp: this.latestData?.timestamp || null,
      collectionIntervalMs: this.collectionIntervalMs,
      mode: "real_mikrotik",
      dummyDataEnabled: false,
    };
  }
}

module.exports = new BandwidthWebSocketService();
