const express = require("express");
const { getDb } = require("../db");
const router = express.Router();
const os = require("os");



// Prometheus metrics endpoint (no auth - used by Prometheus server internally)
router.get("/", async (req, res) => {
  try {
    const metrics = [];
    const push = (name, help, type, value, labels = {}) => {
      metrics.push(`# HELP ${name} ${help}`);
      metrics.push(`# TYPE ${name} ${type}`);
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(",");
      metrics.push(
        `${name}${labelStr ? `{${labelStr}}` : ""} ${value}`,
      );
    };

    // System metrics
    push("node_uptime_seconds", "System uptime", "gauge", process.uptime());
    push(
      "node_memory_total_bytes",
      "Total system memory",
      "gauge",
      os.totalmem(),
    );
    push(
      "node_memory_free_bytes",
      "Free system memory",
      "gauge",
      os.freemem(),
    );
    push("node_cpu_count", "Number of CPU cores", "gauge", os.cpus().length);
    push("node_process_memory_bytes", "Process RSS", "gauge", process.memoryUsage().rss);

    // Database metrics
    let dbAvailable = false;
    let dbRouterCount = 0;
    let dbDiscoveredCount = 0;
    let dbTokenCount = 0;

    try {
      const db = getDb();
      if (global.dbAvailable) {
        const routers = await db.query("SELECT COUNT(*) as c FROM routers");
        dbRouterCount = parseInt(routers.rows[0]?.c || 0);

        const discovered = await db.query(
          "SELECT COUNT(*) as c FROM discovered_routers WHERE status = 'discovered'",
        );
        dbDiscoveredCount = parseInt(discovered.rows[0]?.c || 0);

        const tokens = await db.query(
          "SELECT COUNT(*) as c FROM enrollment_tokens WHERE status = 'pending'",
        );
        dbTokenCount = parseInt(tokens.rows[0]?.c || 0);

        dbAvailable = true;
      } else {
        const memoryDb = require("../db/memory");
        const store = memoryDb._getStore ? memoryDb._getStore() : {};
        dbRouterCount = store.routers?.length || 0;
        dbDiscoveredCount =
          require("../services/enrollmentMemoryStore").discovered.filter(
            (r) => r.status === "discovered",
          ).length || 0;
        dbTokenCount =
          require("../services/enrollmentMemoryStore").tokens.filter(
            (t) => t.status === "pending",
          ).length || 0;
      }
    } catch (e) {
      // DB unavailable - report zeroes
    }

    push("mikrotik_db_available", "Database is connected", "gauge", dbAvailable ? 1 : 0);
    push("mikrotik_routers_total", "Total managed routers", "gauge", dbRouterCount);
    push("mikrotik_discovered_routers", "Pending discovered routers", "gauge", dbDiscoveredCount);
    push("mikrotik_pending_tokens", "Pending enrollment tokens", "gauge", dbTokenCount);

    res.type("text/plain").send(metrics.join("\n"));
  } catch (error) {
    res.status(500).type("text/plain").send(`# Error: ${error.message}`);
  }
});

module.exports = router;
