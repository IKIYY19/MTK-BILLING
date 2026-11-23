const express = require("express");
const { getDb } = require("../db");
const router = express.Router();
const logger = require("../utils/logger");
const { decrypt } = require("../utils/encryption");
const { getTenantId } = require("../db/tenantScope");

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
  const statements = [
    `CREATE TABLE IF NOT EXISTS speedtest_results (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      connection_id UUID,
      test_to VARCHAR(100),
      direction VARCHAR(10),
      duration_secs NUMERIC(8,2),
      protocol VARCHAR(20),
      tenant_id UUID,
      download_mbps DECIMAL(10,2),
      upload_mbps DECIMAL(10,2),
      latency_ms DECIMAL(8,2),
      jitter_ms DECIMAL(8,2),
      packet_loss_pct DECIMAL(5,2),
      connection_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    "ALTER TABLE speedtest_results ADD COLUMN IF NOT EXISTS tenant_id UUID",
    "ALTER TABLE speedtest_results ALTER COLUMN protocol TYPE VARCHAR(20)",
    // Older deployments stored seconds as INTEGER, which rejects fractional
    // durations and made every result fail to save.
    "ALTER TABLE speedtest_results ALTER COLUMN duration_secs TYPE NUMERIC(8,2) USING duration_secs::numeric",
    "CREATE INDEX IF NOT EXISTS idx_speedtest_results_tenant ON speedtest_results(tenant_id, created_at DESC)",
  ];
  for (const statement of statements) {
    try {
      await db.query(statement);
    } catch (e) {
      logger.warn("[SpeedTest] Table check failed", { error: e.message });
    }
  }
}

function measuredNumber(value, max = 100000) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > max) {return null;}
  return Math.round(number * 100) / 100;
}

function scopedWhere(req, baseClause, baseParams) {
  if (req.isSuperAdmin) {return { sql: baseClause, params: baseParams }; }
  return {
    sql: `${baseClause} AND tenant_id = $${baseParams.length + 1}`,
    params: [...baseParams, getTenantId()],
  };
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
    const { connection_id, test_to, direction = "both" } = req.body;
    if (!connection_id) {return res.status(400).json({ error: "Connection ID required" });}

    const conn = await getConnection(connection_id);
    if (!conn.password || !conn.username) {
      return res.status(400).json({
        error: "Connection credentials missing",
        details: "Add management credentials on the Routers page",
      });
    }

    const startedAt = Date.now();
    const routerConnectionManager = require("../services/routerConnectionManager");
    const clientDownload = measuredNumber(req.body.download_mbps);
    const clientUpload = measuredNumber(req.body.upload_mbps);
    let downloadMbps = clientDownload;
    let protocol = String(req.body.protocol || (clientDownload !== null ? "browser-stream" : "http-fetch")).slice(0, 20);
    let target = String(test_to || (clientDownload !== null ? "browser stream" : "")).slice(0, 100);

    // Only fall back to a router-side fetch when the browser did not provide a
    // real measurement. Never fabricate throughput from a hardcoded file size.
    if (downloadMbps === null) {
      target = test_to && /^https?:\/\//.test(test_to)
        ? String(test_to).slice(0, 100)
        : process.env.SPEEDTEST_DOWNLOAD_URL || "https://proof.ovh.net/files/10Mb.dat";
      const fileName = `speedtest-${Date.now()}.bin`;
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
      const elapsed = Math.max((Date.now() - startedAt) / 1000, 0.1);
      const lastFetch = Array.isArray(fetchResult) ? fetchResult[fetchResult.length - 1] : fetchResult;
      const downloadedBytes = Number(lastFetch?.downloaded || 0) * 1024;
      if (!(downloadedBytes > 0)) {
        throw new Error("Router did not report downloaded bytes; cannot calculate a real speed");
      }
      downloadMbps = Math.round(((downloadedBytes * 8) / elapsed / 1000000) * 100) / 100;
      try {
        await routerConnectionManager.executeCommand(conn, "/file/remove", { numbers: fileName });
      } catch (e) {
        logger.warn("[SpeedTest] Could not remove temporary file", { error: e.message });
      }
    }

    const ping = await runPingTest(conn, "8.8.8.8", 3).catch(() => null);
    const result = {
      connection_id,
      connection_name: conn.name,
      test_to: target,
      ping_target: "8.8.8.8",
      direction,
      duration: measuredNumber(req.body.duration) ?? Math.max((Date.now() - startedAt) / 1000, 0.1),
      protocol,
      download_mbps: downloadMbps,
      upload_mbps: clientUpload ?? 0,
      latency_ms: measuredNumber(req.body.latency_ms) ?? ping?.latency_ms ?? 0,
      jitter_ms: measuredNumber(req.body.jitter_ms) ?? ping?.jitter_ms ?? 0,
      packet_loss_pct: measuredNumber(req.body.packet_loss_pct) ?? ping?.packet_loss_pct ?? 0,
      note: protocol === "browser-stream"
        ? "Throughput measured from this browser to the server; latency measured from the router"
        : "Download measured from the router to a public speed-test server",
      timestamp: new Date().toISOString(),
    };

    await saveResult(result);
    logger.info(`[SpeedTest] ${conn.name}: ↓${result.download_mbps}Mbps ↑${result.upload_mbps}Mbps (${protocol})`);
    res.json(result);
  } catch (e) {
    logger.error("[SpeedTest] Failed:", { error: e.message });
    res.status(502).json({ error: e.message });
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
    const tenantId = getTenantId();
    await db.query(
      `INSERT INTO speedtest_results (connection_id, test_to, direction, duration_secs, protocol, download_mbps, upload_mbps, latency_ms, jitter_ms, packet_loss_pct, connection_name, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [result.connection_id, String(result.test_to || "").slice(0, 100), result.direction,
       Number(result.duration) || 0, String(result.protocol || "").slice(0, 20),
       Number(result.download_mbps) || 0, Number(result.upload_mbps) || 0,
       Number(result.latency_ms) || 0, Number(result.jitter_ms) || 0,
       Number(result.packet_loss_pct) || 0, result.connection_name,
       tenantId || null]
    );
  } catch (e) {
    logger.error("[SpeedTest] Failed to save result", { error: e.message });
    throw e;
  }
}

router.get("/history/:connection_id", async (req, res) => {
  try {
    await ensureSpeedtestTable();
    const db = getDb();
    const where = scopedWhere(req, "WHERE connection_id = $1", [req.params.connection_id]);
    const result = await db.query(
      `SELECT * FROM speedtest_results ${where.sql} ORDER BY created_at DESC LIMIT 50`,
      where.params
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
    const where = scopedWhere(req, "WHERE id = $1", [req.params.id]);
    await db.query(`DELETE FROM speedtest_results ${where.sql}`, where.params);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/results", async (req, res) => {
  try {
    await ensureSpeedtestTable();
    const db = getDb();
    const where = scopedWhere(req, "WHERE 1=1", []);
    const result = await db.query(
      `SELECT * FROM speedtest_results ${where.sql} ORDER BY created_at DESC LIMIT 100`,
      where.params
    );
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
