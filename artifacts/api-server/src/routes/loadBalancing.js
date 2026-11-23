const express = require("express");
const { getDb } = require("../db");
const { requirePermission } = require("../middleware/auth");
const routerConnectionManager = require("../services/routerConnectionManager");
const loadBalancing = require("../services/loadBalancing");
const bonding = require("../services/bonding");

const router = express.Router();

async function resolveRouter(req, connectionId) {
  if (!global.dbAvailable) {
    throw Object.assign(new Error("Load balancing requires PostgreSQL storage"), { status: 503 });
  }
  if (!connectionId) {
    throw Object.assign(new Error("Router connection is required"), { status: 400 });
  }
  const params = [connectionId];
  let sql = "SELECT id, name, ip_address, is_online FROM mikrotik_connections WHERE id = $1";
  if (!req.isSuperAdmin && req.tenantId) {
    sql += " AND tenant_id = $2";
    params.push(req.tenantId);
  }
  const result = await getDb().query(sql, params);
  if (!result.rows.length) {
    throw Object.assign(new Error("Router not found or not accessible"), { status: 404 });
  }
  return result.rows[0];
}

async function markOnline(connectionId) {
  try {
    await getDb().query(
      "UPDATE mikrotik_connections SET is_online = true, last_seen = CURRENT_TIMESTAMP WHERE id = $1",
      [connectionId],
    );
  } catch {
    // Best effort only.
  }
}

function handle(error, res) {
  const status = error.status || 500;
  if (status >= 500) {console.error("Load balancing error:", error.message);}
  res.status(status).json({ error: error.message });
}

router.post("/scan", requirePermission("network:read"), async (req, res) => {
  try {
    const connection = await resolveRouter(req, req.body?.connection_id);
    const result = await loadBalancing.scanInterfaces(connection.id, {
      target: req.body?.target,
    });
    await markOnline(connection.id);
    res.json({
      success: true,
      router: { id: connection.id, name: connection.name, ip_address: connection.ip_address },
      ...result,
    });
  } catch (error) {
    handle(error, res);
  }
});

router.post("/generate", requirePermission("network:read"), async (req, res) => {
  try {
    if (req.body?.connection_id) {
      await resolveRouter(req, req.body.connection_id);
    }
    const routerosMajor = req.body?.connection_id
      ? await loadBalancing.detectRouterOsVersion(req.body.connection_id)
      : 7;
    const script = loadBalancing.generatePccScript(req.body?.wans, {
      lanInterface: req.body?.lan_interface,
      routerosMajor,
    });
    res.json({ success: true, script, lines: script.split("\n").length });
  } catch (error) {
    handle(error, res);
  }
});

router.post("/push", requirePermission("network:write"), async (req, res) => {
  try {
    const connection = await resolveRouter(req, req.body?.connection_id);
    const routerosMajor = await loadBalancing.detectRouterOsVersion(connection.id);
    // Apply the same v7 compatibility pass to scripts from every panel.
    const script = loadBalancing.normalizeScriptForRouterOS(
      loadBalancing.validateScript(req.body?.script),
      routerosMajor,
    );
    const dryRun = req.body?.dry_run === true;

    if (dryRun) {
      return res.json({
        success: true,
        dry_run: true,
        message: "Dry run only - nothing was sent to the router",
        router: connection.name,
        routeros_major: routerosMajor,
        script_length: script.length,
        lines: script.split("\n").length,
      });
    }

    let backup = { attempted: false, success: false };
    if (req.body?.backup !== false) {
      backup.attempted = true;
      try {
        await routerConnectionManager.executeCommand(
          connection.id,
          "/system/backup/save",
          { name: `before-lb-${Date.now()}` },
          { timeoutMs: 20000 },
        );
        backup.success = true;
      } catch (error) {
        backup.error = error.message;
      }
    }

    await routerConnectionManager.executeScript(connection.id, script, {
      name: `lb-config-${Date.now()}`,
    });
    await markOnline(connection.id);

    res.json({
      success: true,
      message: `Load balancing configuration pushed to ${connection.name}`,
      backup,
    });
  } catch (error) {
    if (/routing-mark/i.test(error.message)) {
      error.message += " — regenerate the script first: RouterOS v7 needs routing tables created before mark-routing";
    }
    handle(error, res);
  }
});

router.post("/bonding/scan", requirePermission("network:read"), async (req, res) => {
  try {
    const connection = await resolveRouter(req, req.body?.connection_id);
    const result = await bonding.scanBondCandidates(connection.id);
    await markOnline(connection.id);
    res.json({
      success: true,
      router: { id: connection.id, name: connection.name, ip_address: connection.ip_address },
      ...result,
    });
  } catch (error) {
    handle(error, res);
  }
});

router.post("/bonding/generate", requirePermission("network:read"), async (req, res) => {
  try {
    if (req.body?.connection_id) {
      await resolveRouter(req, req.body.connection_id);
    }
    const script = bonding.generateBondScript(req.body || {});
    res.json({ success: true, script, lines: script.split("\n").length });
  } catch (error) {
    handle(error, res);
  }
});

module.exports = router;
