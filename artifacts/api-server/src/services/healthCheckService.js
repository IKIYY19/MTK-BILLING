/**
 * Health Check Service
 * Periodically monitors MikroTik router health and creates alerts
 */

const logger = require("../utils/logger");
const { v4: uuidv4 } = require("uuid");
const realMonitoringService = require("./realMonitoringService");

// Health check intervals (in milliseconds)
const CHECK_INTERVALS = {
  connectivity: 60000, // 1 minute
  resources: 300000, // 5 minutes
  bandwidth: 600000, // 10 minutes
};

// Alert types
const ALERT_TYPES = {
  ROUTER_OFFLINE: "router_offline",
  HIGH_CPU: "high_cpu",
  HIGH_MEMORY: "high_memory",
  HIGH_LATENCY: "high_latency",
  INTERFACE_DOWN: "interface_down",
  BANDWIDTH_EXCEEDED: "bandwidth_exceeded",
};

// Severity levels
const SEVERITY = {
  INFO: "info",
  WARNING: "warning",
  CRITICAL: "critical",
};

class HealthCheckService {
  constructor() {
    this.intervals = new Map();
    this.isRunning = false;
  }

  // Get database connection
  getDb() {
    return global.dbAvailable ? global.db : require("../db/memory");
  }

  // Start health checks for all connections (opt-in - disabled by default)
  async start() {
    if (this.isRunning) {
      logger.warn("Health check service already running");
      return;
    }

    logger.info(
      "Health check service is ready - use startConnectionChecks() to enable monitoring for specific connections",
    );
    this.isRunning = true;
  }

  // Stop all health checks
  stop() {
    logger.info("Stopping health check service");
    this.isRunning = false;

    for (const [connectionId, interval] of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }

  // Start checks for a specific connection
  startConnectionChecks(connectionId) {
    if (this.intervals.has(connectionId)) {
      this.stopConnectionChecks(connectionId);
    }

    // Connectivity check (every minute)
    const connectivityInterval = setInterval(() => {
      this.checkConnectivity(connectionId);
    }, CHECK_INTERVALS.connectivity);
    this.intervals.set(`${connectionId}_connectivity`, connectivityInterval);

    // Resource check (every 5 minutes)
    const resourcesInterval = setInterval(() => {
      this.checkResources(connectionId);
    }, CHECK_INTERVALS.resources);
    this.intervals.set(`${connectionId}_resources`, resourcesInterval);

    // Bandwidth check (every 10 minutes)
    const bandwidthInterval = setInterval(() => {
      this.checkBandwidth(connectionId);
    }, CHECK_INTERVALS.bandwidth);
    this.intervals.set(`${connectionId}_bandwidth`, bandwidthInterval);

    logger.info("Started health checks for connection", { connectionId });
  }

  // Stop checks for a specific connection
  stopConnectionChecks(connectionId) {
    const keys = [
      `${connectionId}_connectivity`,
      `${connectionId}_resources`,
      `${connectionId}_bandwidth`,
    ];

    for (const key of keys) {
      if (this.intervals.has(key)) {
        clearInterval(this.intervals.get(key));
        this.intervals.delete(key);
      }
    }

    logger.info("Stopped health checks for connection", { connectionId });
  }

  // Check router connectivity using the real MikroTik RouterOS API
  async checkConnectivity(connectionId) {
    try {
      const db = this.getDb();
      const now = new Date();
      const snapshot =
        await realMonitoringService.collectSnapshot(connectionId);
      const isOnline = snapshot.status === "online";

      await db.query(
        `INSERT INTO health_checks (id, connection_id, check_type, status, latency_ms, checked_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          uuidv4(),
          connectionId,
          "connectivity",
          isOnline ? "healthy" : "unhealthy",
          isOnline ? snapshot.latencyMs : null,
          now.toISOString(),
        ],
      );

      if (!isOnline) {
        await this.createAlert(
          connectionId,
          ALERT_TYPES.ROUTER_OFFLINE,
          SEVERITY.CRITICAL,
          "Router Offline",
          `Router ${snapshot.connection?.name || connectionId} (${snapshot.connection?.ip_address || "unknown IP"}) is not responding${snapshot.error ? `: ${snapshot.error}` : ""}`,
        );
      } else {
        await this.resolveAlerts(connectionId, ALERT_TYPES.ROUTER_OFFLINE);
      }

      logger.debug("Connectivity check completed", {
        connectionId,
        isOnline,
        latencyMs: snapshot.latencyMs,
      });
    } catch (error) {
      logger.error("Connectivity check failed", {
        connectionId,
        error: error.message,
      });

      try {
        await this.createAlert(
          connectionId,
          ALERT_TYPES.ROUTER_OFFLINE,
          SEVERITY.CRITICAL,
          "Router Offline",
          `Router health check failed: ${error.message}`,
        );
      } catch (alertError) {
        logger.error("Failed to create connectivity alert", {
          connectionId,
          error: alertError.message,
        });
      }
    }
  }

  // Check router resources (CPU, memory) using real RouterOS /system/resource data
  async checkResources(connectionId) {
    try {
      const db = this.getDb();
      const now = new Date();

      const rulesResult = await db.query(
        "SELECT rule_type, threshold_value, comparison_operator, alert_severity FROM monitoring_rules WHERE connection_id = $1 AND is_enabled = true",
        [connectionId],
      );

      const rules = rulesResult.rows;
      const snapshot =
        await realMonitoringService.collectSnapshot(connectionId);

      if (snapshot.status !== "online") {
        await db.query(
          `INSERT INTO health_checks (id, connection_id, check_type, status, checked_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [uuidv4(), connectionId, "resources", "unhealthy", now.toISOString()],
        );

        await this.createAlert(
          connectionId,
          ALERT_TYPES.ROUTER_OFFLINE,
          SEVERITY.CRITICAL,
          "Router Offline",
          `Cannot collect resource metrics from ${snapshot.connection?.name || connectionId}${snapshot.error ? `: ${snapshot.error}` : ""}`,
        );
        return;
      }

      const cpuUsage = Number(snapshot.systemStatus?.cpuUsage || 0);
      const memoryUsage = Number(snapshot.systemStatus?.memoryUsage || 0);
      const status = cpuUsage > 90 || memoryUsage > 90 ? "warning" : "healthy";

      await db.query(
        `INSERT INTO health_checks (id, connection_id, check_type, status, cpu_usage, memory_usage, uptime_seconds, checked_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          uuidv4(),
          connectionId,
          "resources",
          status,
          cpuUsage,
          memoryUsage,
          snapshot.systemStatus?.uptimeSeconds || 0,
          now.toISOString(),
        ],
      );

      for (const rule of rules) {
        if (
          rule.rule_type === "high_cpu" &&
          this.checkThreshold(
            cpuUsage,
            Number(rule.threshold_value),
            rule.comparison_operator,
          )
        ) {
          await this.createAlert(
            connectionId,
            ALERT_TYPES.HIGH_CPU,
            rule.alert_severity,
            "High CPU Usage",
            `CPU usage is ${cpuUsage.toFixed(1)}% (threshold: ${rule.threshold_value}%)`,
          );
        } else if (rule.rule_type === "high_cpu") {
          await this.resolveAlerts(connectionId, ALERT_TYPES.HIGH_CPU);
        }

        if (
          rule.rule_type === "high_memory" &&
          this.checkThreshold(
            memoryUsage,
            Number(rule.threshold_value),
            rule.comparison_operator,
          )
        ) {
          await this.createAlert(
            connectionId,
            ALERT_TYPES.HIGH_MEMORY,
            rule.alert_severity,
            "High Memory Usage",
            `Memory usage is ${memoryUsage.toFixed(1)}% (threshold: ${rule.threshold_value}%)`,
          );
        } else if (rule.rule_type === "high_memory") {
          await this.resolveAlerts(connectionId, ALERT_TYPES.HIGH_MEMORY);
        }
      }

      logger.debug("Resource check completed", {
        connectionId,
        cpuUsage,
        memoryUsage,
        uptimeSeconds: snapshot.systemStatus?.uptimeSeconds || 0,
      });
    } catch (error) {
      logger.error("Resource check failed", {
        connectionId,
        error: error.message,
      });
    }
  }

  // Check bandwidth usage using real RouterOS interface counters/rates
  async checkBandwidth(connectionId) {
    try {
      const db = this.getDb();
      const now = new Date();
      const snapshot =
        await realMonitoringService.collectSnapshot(connectionId);

      if (snapshot.status !== "online") {
        await db.query(
          `INSERT INTO health_checks (id, connection_id, check_type, status, bandwidth_usage, checked_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            uuidv4(),
            connectionId,
            "bandwidth",
            "unhealthy",
            JSON.stringify({ error: snapshot.error || "Router is offline" }),
            now.toISOString(),
          ],
        );
        return;
      }

      const bandwidthUsage = {
        download_bps: snapshot.downloadSpeed || 0,
        upload_bps: snapshot.uploadSpeed || 0,
        total_bps: snapshot.usedBandwidth || 0,
        active_pppoe: snapshot.activePppoe || 0,
        active_hotspot: snapshot.activeHotspot || 0,
        interfaces: (snapshot.interfaces || []).map((iface) => ({
          name: iface.name,
          status: iface.status,
          rx_bps: iface.rxBps,
          tx_bps: iface.txBps,
          rx_bytes: iface.rxByte,
          tx_bytes: iface.txByte,
          rx_errors: iface.rxError,
          tx_errors: iface.txError,
        })),
      };

      await db.query(
        `INSERT INTO health_checks (id, connection_id, check_type, status, bandwidth_usage, checked_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          uuidv4(),
          connectionId,
          "bandwidth",
          "healthy",
          JSON.stringify(bandwidthUsage),
          now.toISOString(),
        ],
      );

      logger.debug("Bandwidth check completed", {
        connectionId,
        bandwidthUsage,
      });
    } catch (error) {
      logger.error("Bandwidth check failed", {
        connectionId,
        error: error.message,
      });
    }
  }

  // Test connection to router using the actual MikroTik API
  async testConnection(connection) {
    const snapshot = await realMonitoringService.collectSnapshot(connection.id);
    return snapshot.status === "online";
  }

  // Check if value meets threshold condition
  checkThreshold(value, threshold, operator) {
    switch (operator) {
      case ">":
        return value > threshold;
      case "<":
        return value < threshold;
      case ">=":
        return value >= threshold;
      case "<=":
        return value <= threshold;
      case "==":
        return value === threshold;
      default:
        return value > threshold;
    }
  }

  // Create an alert
  async createAlert(connectionId, alertType, severity, title, message) {
    try {
      const db = this.getDb();

      // Check if there's already an open alert of this type for this connection
      const existingAlert = await db.query(
        `SELECT id FROM alerts
         WHERE connection_id = $1 AND alert_type = $2 AND status = 'open'
         ORDER BY created_at DESC LIMIT 1`,
        [connectionId, alertType],
      );

      if (existingAlert.rows.length > 0) {
        // Alert already exists, don't create duplicate
        return;
      }

      // Create new alert
      await db.query(
        `INSERT INTO alerts (id, connection_id, alert_type, severity, title, message, status, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          uuidv4(),
          connectionId,
          alertType,
          severity,
          title,
          message,
          "open",
          "{}",
          new Date().toISOString(),
        ],
      );

      logger.info("Alert created", {
        connectionId,
        alertType,
        severity,
        title,
      });

      // Trigger notifications (to be implemented)
      await this.sendNotifications(
        connectionId,
        alertType,
        severity,
        title,
        message,
      );
    } catch (error) {
      logger.error("Failed to create alert", {
        connectionId,
        alertType,
        error: error.message,
      });
    }
  }

  // Resolve open alerts
  async resolveAlerts(connectionId, alertType) {
    try {
      const db = this.getDb();

      await db.query(
        `UPDATE alerts
         SET status = 'resolved', resolved_at = $1
         WHERE connection_id = $2 AND alert_type = $3 AND status = 'open'`,
        [new Date().toISOString(), connectionId, alertType],
      );

      logger.info("Alerts resolved", { connectionId, alertType });
    } catch (error) {
      logger.error("Failed to resolve alerts", {
        connectionId,
        alertType,
        error: error.message,
      });
    }
  }

  // Send notifications via real email, SMS, and WhatsApp channels
  async sendNotifications(connectionId, alertType, severity, title, message) {
    try {
      const db = this.getDb();

      // Get enabled notification channels for admin users
      const channelsResult = await db.query(
        `SELECT nc.channel_type, nc.config, u.email, u.phone, u.name
         FROM notification_channels nc
         JOIN users u ON u.id = nc.user_id
         WHERE nc.is_enabled = true AND u.role = 'admin'`,
      );

      if (channelsResult.rows.length === 0) {
        logger.debug('No enabled notification channels for admins', { connectionId, alertType });
        return;
      }

      const emailService = require('./email');
      const notificationService = require('./notificationService');

      const alertData = {
        customer: null, // system alert, not customer-specific
        subject: `[${severity.toUpperCase()}] ${title}`,
        body: message,
        alertType,
        severity,
        connectionId,
      };

      for (const channel of channelsResult.rows) {
        try {
          if (channel.channel_type === 'email' && channel.email) {
            await emailService.sendEmail({
              to: channel.email,
              subject: `[${severity.toUpperCase()}] ${title}`,
              html: `<div style="font-family:Arial,sans-serif;max-width:600px"><h3 style="color:${severity === 'critical' ? '#ef4444' : '#f59e0b'}">${title}</h3><p>${message}</p><p style="color:#6b7280;font-size:12px">Alert type: ${alertType} | Severity: ${severity} | Connection: ${connectionId}</p></div>`,
            });
            logger.info('Alert email sent', { to: channel.email, title });
          } else if (channel.channel_type === 'sms') {
            const phone = channel.config?.phone || channel.phone;
            if (phone) {
              await notificationService.triggerSMS('service_suspended', {
                customer: { phone, name: channel.name || 'Admin' },
                custom_message: `[${severity.toUpperCase()}] ${title}: ${message}`,
              });
              logger.info('Alert SMS sent', { phone, title });
            }
          } else if (channel.channel_type === 'whatsapp') {
            const phone = channel.config?.phone || channel.phone;
            if (phone) {
              const wa = await notificationService.getWhatsAppService();
              if (wa && wa.isConfigured) {
                await wa.sendMessage(phone, `*[${severity.toUpperCase()}] ${title}*\n${message}`);
                logger.info('Alert WhatsApp sent', { phone, title });
              }
            }
          }
        } catch (channelError) {
          logger.error('Failed to send alert via channel', {
            channel: channel.channel_type,
            error: channelError.message,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to send notifications', { error: error.message });
    }
  }
}

// Singleton instance
const healthCheckService = new HealthCheckService();

module.exports = healthCheckService;
