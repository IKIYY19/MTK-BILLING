const express = require("express");
const router = express.Router();
const db = global.dbAvailable ? global.db : require("../db/memory");
const { v4: uuidv4 } = require("uuid");
const { resellerValidation } = require("../middleware/validation");
const logger = require("../utils/logger");
const { decrypt } = require("../utils/encryption");

function decryptPassword(encrypted) {
  return decrypt(encrypted) || encrypted;
}

// Helper: host portal HTML on our server and return URL
function hostPortalLocally(html, portalName) {
  const fs = require("fs");
  const path = require("path");
  const portalsDir = path.join(__dirname, "..", "public", "portals");
  if (!fs.existsSync(portalsDir)) {
    fs.mkdirSync(portalsDir, { recursive: true });
  }
  const portalFile = `${portalName || "portal"}-${Date.now()}.html`;
  fs.writeFileSync(path.join(portalsDir, portalFile), html);
  const baseUrl =
    process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  return `${baseUrl}/portals/${portalFile}`;
}

// ═══════════════════════════════════════
// RESELLERS
// ═══════════════════════════════════════
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT r.*,
              (SELECT COUNT(*) FROM customers WHERE reseller_id = r.id) as customer_count,
              (SELECT COALESCE(SUM(p.amount), 0) FROM payments p JOIN customers c ON c.id = p.customer_id WHERE c.reseller_id = r.id) as total_revenue
       FROM resellers r ORDER BY r.created_at DESC`,
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// CAPTIVE PORTALS
// ═══════════════════════════════════════
router.get("/captive-portals", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM captive_portals ORDER BY created_at DESC",
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/captive-portals", async (req, res) => {
  try {
    const { name, elements, styles, hotspot_profile, connection_id } = req.body;
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO captive_portals (id, name, elements, styles, hotspot_profile, connection_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        id,
        name,
        JSON.stringify(elements),
        JSON.stringify(styles),
        hotspot_profile,
        connection_id,
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * PUSH Captive Portal to MikroTik Router
 *
 * 3-tier fallback:
 *   1. REST API file upload (RouterOS v7) — uploads login.html directly to router
 *   2. SSH script (RouterOS v6) — creates portal via script
 *   3. Hosted URL (always works) — serves portal from this server
 */
router.post("/captive-portals/push", async (req, res) => {
  try {
    const { connection_id, html, profile, portal_name } = req.body;
    if (!connection_id)
      {return res.status(400).json({ error: "Connection ID required" });}
    if (!html) {return res.status(400).json({ error: "HTML content required" });}

    // Fetch connection from DB
    const connResult = await db.query(
      "SELECT * FROM mikrotik_connections WHERE id = $1",
      [connection_id],
    );
    if (connResult.rows.length === 0)
      {return res.status(404).json({ error: "Connection not found" });}

    const conn = connResult.rows[0];
    const password = decryptPassword(conn.password_encrypted);
    const results = {
      method: null,
      success: false,
      portalUrl: null,
      details: null,
    };

    // ── Tier 1: REST API (RouterOS v7) ──
    try {
      const mikrotikRest = require("../services/mikrotikRest");
      const restConn = mikrotikRest.createConnection({
        host: conn.ip_address,
        port: conn.api_port || 443,
        username: conn.username,
        password,
        useSSL: true,
      });
      const restResult = await mikrotikRest.uploadHotspotPortal(
        restConn.id,
        html,
        portal_name || `portal-${Date.now()}`,
      );
      mikrotikRest.removeConnection(restConn.id);
      if (restResult.success) {
        return res.json({
          method: "rest",
          success: true,
          details: restResult.results,
          message: "Portal pushed directly to router via REST API.",
        });
      }
      results.details = { restError: restResult.error };
    } catch (restErr) {
      results.details = { restError: restErr.message };
    }

    // ── Tier 2: SSH (RouterOS v6) ──
    try {
      const mikrotikSSH = require("../services/mikrotikSSH");
      const sshConn = await mikrotikSSH.createConnection({
        host: conn.ip_address,
        port: conn.ssh_port || 22,
        username: conn.username,
        password,
      });
      const safeHtml = html
        .replace(/\\/g, "\\\\")
        .replace(/`/g, "\\`")
        .replace(/\$/g, "\\$");
      const sshScript = [
        ':do { /file remove [find name="hotspot/login.html"] } on-error={}',
        ":delay 500ms",
        `/system script add name=__portal_gen source="${safeHtml}"`,
      ].join("\n");
      await mikrotikSSH.executeCommand(sshConn.id, sshScript);
      await mikrotikSSH.removeConnection(sshConn.id);
      return res.json({
        method: "ssh",
        success: true,
        details: { ...results.details, uploaded: ["login.html"], via: "ssh" },
        message: "Portal pushed to router via SSH.",
      });
    } catch (sshErr) {
      results.details = { ...results.details, sshError: sshErr.message };
    }

    // ── Tier 3: Host on our server ──
    const portalUrl = hostPortalLocally(html, portal_name);
    return res.json({
      method: "hosted",
      success: true,
      portalUrl,
      details: results.details,
      message:
        "Portal hosted on server (direct push failed). Add this URL to your hotspot walled garden.",
    });
  } catch (e) {
    console.error("Captive portal push error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// RESELLER CRUD
// ═══════════════════════════════════════
router.get("/:id", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM resellers WHERE id = $1", [
      req.params.id,
    ]);
    if (result.rows.length === 0)
      {return res.status(404).json({ error: "Not found" });}
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", resellerValidation, async (req, res) => {
  try {
    const {
      name,
      company,
      email,
      phone,
      commission_rate,
      credit_limit,
      status,
    } = req.body;
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO resellers (id, name, company, email, phone, commission_rate, credit_limit, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        id,
        name,
        company,
        email,
        phone,
        commission_rate || 10,
        credit_limit || 0,
        status || "active",
      ],
    );
    logger.info("Reseller created", { id, name, email });
    res.status(201).json(result.rows[0]);
  } catch (e) {
    logger.error("Failed to create reseller", { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

router.put("/:id", [...resellerValidation.slice(0, -1)], async (req, res) => {
  try {
    const {
      name,
      company,
      email,
      phone,
      commission_rate,
      credit_limit,
      status,
    } = req.body;
    const result = await db.query(
      `UPDATE resellers SET name = COALESCE($1, name), company = COALESCE($2, company),
       email = COALESCE($3, email), phone = COALESCE($4, phone), commission_rate = COALESCE($5, commission_rate),
       credit_limit = COALESCE($6, credit_limit), status = COALESCE($7, status)
       WHERE id = $8 RETURNING *`,
      [
        name,
        company,
        email,
        phone,
        commission_rate,
        credit_limit,
        status,
        req.params.id,
      ],
    );
    if (result.rows.length === 0)
      {return res.status(404).json({ error: "Not found" });}
    logger.info("Reseller updated", { id: req.params.id });
    res.json(result.rows[0]);
  } catch (e) {
    logger.error("Failed to update reseller", { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM resellers WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// AGENT / RESELLER LOGIN
// ═══════════════════════════════════════
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }
    const result = await db.query(
      "SELECT * FROM resellers WHERE email = $1 AND status = 'active'",
      [email],
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const agent = result.rows[0];
    const valid = agent.password_hash
      ? await require("bcryptjs").compare(password, agent.password_hash)
      : false;
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const jwt = require("jsonwebtoken");
    const token = jwt.sign(
      { id: agent.id, email: agent.email, role: "reseller", name: agent.name },
      process.env.JWT_SECRET || "default-secret",
      { expiresIn: "7d" },
    );
    res.json({ token, agent: { id: agent.id, name: agent.name, company: agent.company, email: agent.email, phone: agent.phone, commission_rate: agent.commission_rate } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/:id/password", async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 4) {
      return res.status(400).json({ error: "Password must be at least 4 characters" });
    }
    const bcrypt = require("bcryptjs");
    const hash = await bcrypt.hash(password, 10);
    await db.query("UPDATE resellers SET password_hash = $1 WHERE id = $2", [hash, req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/bulk/plan-change", async (req, res) => {
  try {
    const { customer_ids, plan_id } = req.body;
    if (!Array.isArray(customer_ids) || !customer_ids.length || !plan_id) {
      return res.status(400).json({ error: "customer_ids array and plan_id required" });
    }
    const results = [];
    for (const cid of customer_ids) {
      try {
        const subs = await db.query("SELECT id FROM subscriptions WHERE customer_id = $1 AND status = 'active'", [cid]);
        for (const s of subs.rows) {
          await db.query("UPDATE subscriptions SET plan_id = $1 WHERE id = $2", [plan_id, s.id]);
        }
        results.push({ customer_id: cid, updated: subs.rows.length });
      } catch (e) { results.push({ customer_id: cid, error: e.message }); }
    }
    res.json({ success: true, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/bulk/suspend", async (req, res) => {
  try {
    const { customer_ids, action } = req.body;
    if (!Array.isArray(customer_ids) || !customer_ids.length || !action) {
      return res.status(400).json({ error: "customer_ids array and action (suspend|activate) required" });
    }
    const newStatus = action === "activate" ? "active" : "suspended";
    const results = [];
    for (const cid of customer_ids) {
      try {
        await db.query("UPDATE customers SET status = $1 WHERE id = $2", [newStatus, cid]);
        await db.query("UPDATE subscriptions SET status = $1 WHERE customer_id = $2", [newStatus, cid]);
        results.push({ customer_id: cid, status: newStatus });
      } catch (e) { results.push({ customer_id: cid, error: e.message }); }
    }
    res.json({ success: true, action, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
