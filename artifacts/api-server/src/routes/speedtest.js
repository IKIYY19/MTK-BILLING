const express = require("express");
const { getDb } = require("../db");
const router = express.Router();
const logger = require("../utils/logger");
const { decrypt } = require("../utils/encryption");

function decryptPassword(encrypted) {
  return decrypt(encrypted);
}



async function getConnection(id) {
  const db = getDb();
  const result = await db.query("SELECT * FROM mikrotik_connections WHERE id = $1", [id]);
  if (result.rows.length === 0) throw new Error("MikroTik connection not found");
  const conn = result.rows[0];
  return { ...conn, password: decryptPassword(conn.password_encrypted) };
}

async function ensureSpeedtestTable() {
  const db = getDb();
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS speedtest_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id UUID,
        test_to VARCHAR(100),
        direction VARCHAR(10),
        duration_secs INTEGER,
        protocol VARCHAR(10),
        download_mbps DECIMAL(10,2),
        upload_mbps DECIMAL(10,2),
        latency_ms DECIMAL(8,2),
        jitter_ms DECIMAL(8,2),
        packet_loss_pct DECIMAL(5,2),
        connection_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {}
}

router.post("/run", async (req, res) => {
  try {
    const { connection_id, test_to, direction = "both", duration = 10, protocol = "tcp" } = req.body;
    if (!connection_id) return res.status(400).json({ error: "Connection ID required" });

    const conn = await getConnection(connection_id);
    if (!conn.password || !conn.username) {
      return res.status(400).json({ error: "Connection credentials missing", details: "Add management credentials on the Routers page" });
    }

    const routerConnectionManager = require("../services/routerConnectionManager");

    const args = {
      duration: String(duration),
      protocol: protocol,
    };
    if (test_to) args["address"] = test_to;
    if (direction === "tx") args.direction = "transmit";
    else if (direction === "rx") args.direction = "receive";

    logger.info(`[SpeedTest] Starting on ${conn.name} (${conn.ip_address})`, { direction, duration, protocol });

    // bandwidth-test streams !re sentences and resolves on !done after the duration
    const monitorResult = await routerConnectionManager.executeCommand(
      conn,
      "/tool/bandwidth-test",
      args,
    );

    if (!monitorResult || monitorResult.length === 0) {
      const fallback = await runPingTest(conn, test_to, duration);
      fallback.connection_id = connection_id;
      fallback.connection_name = conn.name;
      await saveResult(fallback);
      return res.json(fallback);
    }

    const last = Array.isArray(monitorResult) ? monitorResult[monitorResult.length - 1] : monitorResult;
    const result = {
      connection_id,
      connection_name: conn.name,
      test_to: test_to || conn.ip_address,
      direction,
      duration: duration,
      protocol,
      download_mbps: parseFloat(last["rx-10-second-average"] || last["rx-current"] || 0) / 1000000,
      upload_mbps: parseFloat(last["tx-10-second-average"] || last["tx-current"] || 0) / 1000000,
      latency_ms: parseFloat(last["tcp-latency"] || 0),
      jitter_ms: parseFloat(last["udp-jitter"] || 0),
      packet_loss_pct: parseFloat(last["lost-packets"] || 0) / Math.max(parseFloat(last["total-packets"] || 1), 1) * 100,
      timestamp: new Date().toISOString(),
    };

    await saveResult(result);
    logger.info(`[SpeedTest] ${conn.name}: ↓${result.download_mbps.toFixed(1)}Mbps ↑${result.upload_mbps.toFixed(1)}Mbps`);
    res.json(result);
  } catch (e) {
    logger.error("[SpeedTest] Failed:", { error: e.message });
    const fallback = await runFallbackTest(req.body.connection_id);
    res.json(fallback);
  }
});

async function runPingTest(conn, testTo, count) {
  const routerConnectionManager = require("../services/routerConnectionManager");
  const target = testTo || "8.8.8.8";
  const results = [];
  let lost = 0;

  for (let i = 0; i < Math.min(count, 5); i++) {
    try {
      const start = Date.now();
      const pingResult = await routerConnectionManager.executeCommand(conn, "/ping", { address: target, count: "1" });
      const elapsed = Date.now() - start;
      if (pingResult && !pingResult.error) {
        results.push(elapsed);
      } else {
        lost++;
      }
    } catch (e) {
      lost++;
    }
  }

  const avgLatency = results.length > 0 ? results.reduce((a, b) => a + b, 0) / results.length : 0;
  const packetLoss = (lost / count) * 100;

  return {
    test_to: target,
    direction: "both",
    duration: count,
    protocol: "icmp",
    download_mbps: 0,
    upload_mbps: 0,
    latency_ms: avgLatency,
    jitter_ms: 0,
    packet_loss_pct: packetLoss,
    timestamp: new Date().toISOString(),
  };
}

async function runFallbackTest(connectionId) {
  try {
    const conn = await getConnection(connectionId);
    const routerConnectionManager = require("../services/routerConnectionManager");
    const resourceResult = await routerConnectionManager.executeCommand(
      conn,
      "/system/resource/print",
    );

    const cpu = (Array.isArray(resourceResult) ? resourceResult[0] : resourceResult)?.["cpu-load"] || "0";
    return {
      connection_id: connectionId,
      connection_name: conn.name,
      test_to: conn.ip_address,
      direction: "both",
      duration: 1,
      protocol: "system",
      download_mbps: 0,
      upload_mbps: 0,
      latency_ms: 0,
      jitter_ms: 0,
      packet_loss_pct: 0,
      note: `API connected. CPU load: ${cpu}%. Run a full test for bandwidth metrics.`,
      timestamp: new Date().toISOString(),
    };
  } catch (e) {
    return {
      connection_id: connectionId,
      test_to: "unknown",
      direction: "both",
      duration: 0,
      protocol: "error",
      download_mbps: 0,
      upload_mbps: 0,
      latency_ms: 0,
      jitter_ms: 0,
      packet_loss_pct: 0,
      note: `Router unreachable: ${e.message}. Add management credentials on Routers page.`,
      timestamp: new Date().toISOString(),
    };
  }
}

async function saveResult(result) {
  await ensureSpeedtestTable();
  try {
    const db = getDb();
    await db.query(
      `INSERT INTO speedtest_results (connection_id, test_to, direction, duration_secs, protocol, download_mbps, upload_mbps, latency_ms, jitter_ms, packet_loss_pct, connection_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [result.connection_id, result.test_to, result.direction, result.duration, result.protocol,
       result.download_mbps || 0, result.upload_mbps || 0, result.latency_ms || 0, result.jitter_ms || 0, result.packet_loss_pct || 0, result.connection_name]
    );
  } catch (e) {
    logger.error("[SpeedTest] Failed to save result", { error: e.message });
  }
}

router.get("/history/:connection_id", async (req, res) => {
  try {
    await ensureSpeedtestTable();
    const db = getDb();
    const result = await db.query(
      "SELECT * FROM speedtest_results WHERE connection_id = $1 ORDER BY created_at DESC LIMIT 50",
      [req.params.connection_id]
    );
    res.json(result.rows.map(r => ({
      id: r.id, connection_id: r.connection_id, test_to: r.test_to, direction: r.direction,
      duration: r.duration_secs, protocol: r.protocol, download_speed: parseFloat(r.download_mbps),
      upload_speed: parseFloat(r.upload_mbps), latency: parseFloat(r.latency_ms),
      jitter: parseFloat(r.jitter_ms), packet_loss: parseFloat(r.packet_loss_pct),
      timestamp: r.created_at, connection_name: r.connection_name,
    })));
  } catch (e) {
    res.json([]);
  }
});

router.delete("/results/:id", async (req, res) => {
  try {
    await ensureSpeedtestTable();
    const db = getDb();
    await db.query("DELETE FROM speedtest_results WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/results", async (req, res) => {
  try {
    await ensureSpeedtestTable();
    const db = getDb();
    const result = await db.query("SELECT * FROM speedtest_results ORDER BY created_at DESC LIMIT 100");
    res.json(result.rows.map(r => ({
      id: r.id, connection_id: r.connection_id, download_speed: parseFloat(r.download_mbps),
      upload_speed: parseFloat(r.upload_mbps), latency: parseFloat(r.latency_ms),
      jitter: parseFloat(r.jitter_ms), packet_loss: parseFloat(r.packet_loss_pct),
      timestamp: r.created_at, connection_name: r.connection_name,
    })));
  } catch (e) {
    res.json([]);
  }
});

module.exports = router;
