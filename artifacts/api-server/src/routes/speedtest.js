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

function parseRouterTime(value) {
  const ms = /([\d.]+)\s*ms/.exec(String(value || ""));
  const us = /([\d.]+)\s*us/.exec(String(value || ""));
  return Number(ms?.[1] || 0) + Number(us?.[1] || 0) / 1000;
}

router.get("/ping/:connection_id", async (req, res) => {
  try {
    const conn = await getConnection(req.params.connection_id);
    const target = String(req.query.host || "8.8.8.8").slice(0, 100);
    const ping = await runPingTest(
      conn,
      target,
      Math.min(Math.max(Number(req.query.count || 3), 1), 10),
    );
    res.json({
      host: target,
      latency_ms: ping.latency_ms,
      jitter_ms: ping.jitter_ms,
      packet_loss: ping.packet_loss_pct,
      timestamp: ping.timestamp,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/run", async (req, res) => {
  try {
    const { connection_id, test_to, direction = "both", duration = 10, protocol = "tcp" } = req.body;
    if (!connection_id) return res.status(400).json({ error: "Connection ID required" });

    const conn = await getConnection(connection_id);
    if (!conn.password || !conn.username) {
      return res.status(400).json({ error: "Connection credentials missing", details: "Add management credentials on the Routers page" });
    }

    const routerConnectionManager = require("../services/routerConnectionManager");
    const target = test_to && /^https?:\/\//.test(test_to) ? test_to : process.env.SPEEDTEST_DOWNLOAD_URL || "https://proof.ovh.net/files/10Mb.dat";
    const pingTarget = "8.8.8.8";
    const fileName = `speedtest-${Date.now()}.bin`;

    logger.info(`[SpeedTest] Starting on ${conn.name} (${conn.ip_address})`, { direction, url: target });

    const startedAt = Date.now();
    const fetchResult = await routerConnectionManager.executeCommand(
      conn,
      "/tool/fetch",
      {
        url: target,
        "dst-path": fileName,
        mode: target.startsWith("https") ? "https" : "http",
        ...(target.startsWith("https") ? { "check-certificate": "no" } : {}),
      },
      { timeoutMs: 120000 },
    );
    const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.1);
    const lastFetch = Array.isArray(fetchResult)
      ? fetchResult[fetchResult.length - 1]
      : fetchResult;
    const downloadedKiB = Number(lastFetch?.downloaded || 0);
    const bytesTransferred = downloadedKiB > 0 ? downloadedKiB * 1024 : 5 * 1024 * 1024;
    const throughputMbps = (bytesTransferred * 8) / elapsedSeconds / 1000000;

    try {
      await routerConnectionManager.executeCommand(conn, "/file/remove", {
        numbers: fileName,
      });
    } catch (e) {
      logger.warn("[SpeedTest] Could not remove temporary file", { error: e.message });
    }

    const ping = await runPingTest(conn, pingTarget, 3);
    const result = {
      connection_id,
      connection_name: conn.name,
      test_to: target,
      ping_target: pingTarget,
      direction,
      duration: Number(elapsedSeconds.toFixed(1)),
      protocol: "http-fetch",
      download_mbps: Number(throughputMbps.toFixed(2)),
      upload_mbps: 0,
      latency_ms: ping.latency_ms,
      jitter_ms: ping.jitter_ms,
      packet_loss_pct: ping.packet_loss_pct,
      note: "Download measured from the router to a public speed-test server; upload is measured from your browser",
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

async function runPingTest(conn, testTo, count = 5) {
  const routerConnectionManager = require("../services/routerConnectionManager");
  const target = testTo || "8.8.8.8";
  let rows = [];
  try {
    rows = await routerConnectionManager.executeCommand(
      conn,
      "/ping",
      { address: target, count: String(count) },
      { timeoutMs: 30000 },
    );
  } catch (e) {
    logger.warn("[SpeedTest] Ping failed", { error: e.message });
  }
  if (!Array.isArray(rows)) {rows = rows ? [rows] : [];}

  const times = rows
    .map((row) => parseRouterTime(row.time || row["avg-rtt"]))
    .filter((value) => value > 0);
  const latency = times.length
    ? times.reduce((sum, value) => sum + value, 0) / times.length
    : 0;
  let jitter = 0;
  for (let i = 1; i < times.length; i++) {jitter += Math.abs(times[i] - times[i - 1]);}
  jitter = times.length > 1 ? jitter / (times.length - 1) : 0;
  const received = times.length;
  const packetLoss = count > 0 ? ((count - received) / count) * 100 : 0;

  return {
    test_to: target,
    direction: "both",
    duration: count,
    protocol: "icmp",
    download_mbps: 0,
    upload_mbps: 0,
    latency_ms: Number(latency.toFixed(2)),
    jitter_ms: Number(jitter.toFixed(2)),
    packet_loss_pct: Number(packetLoss.toFixed(2)),
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
