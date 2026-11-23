const logger = require("../utils/logger");

class NetworkAlertService {
  constructor() {
    this.timer = null;
    this.pppoeBaseline = new Map();
  }

  start() {
    if (this.timer) {return;}
    this.timer = setInterval(() => {
      this.run().catch((error) => {
        logger.warn("Network alert check failed", { error: error.message });
      });
    }, 60 * 1000);
    logger.info("Network alert service started");
    this.run().catch(() => {});
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async threshold(key, fallback) {
    const db = global.dbAvailable ? global.db : require("../db/memory");
    const result = await db.query("SELECT value FROM settings WHERE key = $1", [key]);
    const value = Number(result.rows[0]?.value);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  async alert(title, message, severity, key) {
    await require("./opsAlertService").send(title, message, severity, key, "ops_alert");
  }

  async run() {
    const alerts = require("./opsAlertService");
    const monitoring = require("./realMonitoringService");

    const cpuLimit = await this.threshold("network_cpu_threshold", 85);
    const memoryLimit = await this.threshold("network_memory_threshold", 90);
    const latencyLimit = await this.threshold("network_latency_threshold", 1500);

    const connections = await monitoring.listConnections();
    for (const connection of connections) {
      let snapshot;
      try {
        snapshot = await monitoring.collectSnapshot(connection.id);
      } catch (error) {
        logger.debug("Network snapshot skipped", { id: connection.id, error: error.message });
        continue;
      }
      if (!snapshot || snapshot.status !== "online") {continue;}

      const name = connection.name || connection.ip_address;
      const system = snapshot.systemStatus || {};
      const cpu = Number(system.cpuUsage || 0);
      const memory = Number(system.memoryUsage || 0);
      const latency = Number(snapshot.latencyMs || 0);

      if (cpu >= cpuLimit) {
        await alerts.send(
          "High CPU usage", `${name} CPU is ${cpu.toFixed(0)}% (threshold ${cpuLimit}%).`,
          "warning", `cpu:${connection.id}`, "ops_alert",
        );
      }
      if (memory >= memoryLimit) {
        await alerts.send(
          "High memory usage", `${name} memory is ${memory.toFixed(0)}% (threshold ${memoryLimit}%).`,
          "warning", `memory:${connection.id}`, "ops_alert",
        );
      }
      if (latency >= latencyLimit) {
        await alerts.send(
          "High router latency", `${name} API latency is ${latency.toFixed(0)} ms (threshold ${latencyLimit} ms).`,
          "warning", `latency:${connection.id}`, "ops_alert",
        );
      }

      const down = (snapshot.interfaces || []).filter(
        (iface) => iface.status === "down" && !iface.disabled && iface.type !== "virtual",
      );
      if (down.length > 0) {
        await alerts.send(
          "Interface down", `${name}: ${down.map((iface) => iface.name).join(", ")} has no link.`,
          "warning", `interface:${connection.id}:${down.map((iface) => iface.name).join(",")}`, "ops_alert",
        );
      }

      const current = Number(snapshot.activePppoe || 0);
      const previous = this.pppoeBaseline.get(connection.id);
      this.pppoeBaseline.set(connection.id, { count: current, at: Date.now() });
      if (
        previous &&
        Date.now() - previous.at <= 10 * 60 * 1000 &&
        previous.count >= 5 &&
        current <= previous.count * 0.5
      ) {
        await alerts.send(
          "PPPoE sessions dropped",
          `${name} PPPoE sessions fell from ${previous.count} to ${current} in under 10 minutes.`,
          "critical", `pppoe-drop:${connection.id}`, "ops_alert",
        );
      }
    }

    await this.checkRadiusFailures();
    await this.checkHotspotFailures();
    await this.checkVoucherExpiry();
  }

  async checkRadiusFailures() {
    const db = global.dbAvailable ? global.db : require("../db/memory");
    try {
      const result = await db.query(
        `SELECT username, COUNT(*)::int AS failures
         FROM radpostauth
         WHERE reply = 'Access-Reject' AND authdate > NOW() - INTERVAL '5 minutes'
         GROUP BY username
         HAVING COUNT(*) >= 5
         ORDER BY failures DESC`,
      );
      for (const row of result.rows) {
        await require("./opsAlertService").send(
          "RADIUS authentication failures",
          `${row.username} had ${row.failures} rejected logins in 5 minutes.`,
          "critical", `radius-fail:${row.username}`, "security_alert",
        );
      }
    } catch (error) {
      logger.debug("RADIUS failure check skipped", { error: error.message });
    }
  }

  async checkHotspotFailures() {
    const db = global.dbAvailable ? global.db : require("../db/memory");
    try {
      const result = await db.query(
        `SELECT mc.name AS router, COUNT(*)::int AS failures
         FROM captive_hotspot_sessions s
         LEFT JOIN mikrotik_connections mc ON mc.id = s.router_id
         WHERE s.status = 'authorization_failed' AND s.updated_at > NOW() - INTERVAL '10 minutes'
         GROUP BY mc.name`,
      );
      for (const row of result.rows) {
        await require("./opsAlertService").send(
          "Hotspot authorization failure",
          `${row.failures} paid hotspot session(s) failed to authorize on ${row.router || "a router"} in the last 10 minutes.`,
          "critical", `hotspot-auth:${row.router || "unknown"}`, "ops_alert",
        );
      }
    } catch (error) {
      logger.debug("Hotspot failure check skipped", { error: error.message });
    }
  }

  async checkVoucherExpiry() {
    const db = global.dbAvailable ? global.db : require("../db/memory");
    try {
      const result = await db.query("SELECT id, username, valid_for, created_at FROM hotspot_vouchers");
      for (const voucher of result.rows) {
        const match = /^(\d+)\s*(h|d)$/i.exec(String(voucher.valid_for || "").trim());
        if (!match) {continue;}
        const durationMs = Number(match[1]) * (match[2].toLowerCase() === "h" ? 3600000 : 86400000);
        const expires = new Date(voucher.created_at).getTime() + durationMs;
        if (!Number.isFinite(expires) || expires > Date.now()) {continue;}
        await require("./opsAlertService").send(
          "Voucher expired",
          `Voucher ${voucher.username} (${voucher.valid_for}) expired and should be removed from the router.`,
          "info", `voucher-expired:${voucher.id}`, "ops_alert",
        );
      }
    } catch (error) {
      logger.debug("Voucher expiry check skipped", { error: error.message });
    }
  }

  async recordVoucher(action, username, detail = "") {
    await require("./opsAlertService").send(
      `Voucher ${action}`,
      `Voucher ${username}${detail ? ` — ${detail}` : ""}.`,
      "info", `voucher-${action}:${username}`, "ops_alert",
    );
  }
}

module.exports = new NetworkAlertService();
