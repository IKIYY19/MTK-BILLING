const express = require("express");
const { getDb } = require("../db");
const router = express.Router();


// ═══════════════════════════════════════
// NAS CLIENTS (MikroTik routers)
// ═══════════════════════════════════════
router.get("/nas", async (req, res) => {
  try {
    const result = await getDb().query(
      "SELECT * FROM nas ORDER BY created_at DESC",
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/nas", async (req, res) => {
  try {
    const { nasname, shortname, secret, description, type, connection_id } =
      req.body;
    if (!nasname || !String(nasname).trim() || !secret || !String(secret).trim()) {
      return res.status(400).json({ error: "nasname and secret are required" });
    }
    if (!/^[A-Za-z0-9.\-:]+$/.test(String(nasname))) {
      return res.status(400).json({ error: "nasname must be an IP address or hostname" });
    }
    const existing = await getDb().query("SELECT id FROM nas WHERE nasname = $1", [nasname]);
    const result = await getDb().query(
      `INSERT INTO nas (nasname, shortname, secret, description, type, connection_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (nasname) DO UPDATE SET
         shortname = EXCLUDED.shortname, secret = EXCLUDED.secret,
         description = EXCLUDED.description, type = EXCLUDED.type,
         connection_id = EXCLUDED.connection_id, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        nasname,
        shortname || nasname,
        secret,
        description || "RADIUS Client",
        type || "other",
        connection_id || null,
      ],
    );
    require('../services/opsAlertService').recordNasChange(
      req, nasname, existing.rows.length > 0 ? 'updated' : 'added',
    ).catch(() => {});
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/nas/:id", async (req, res) => {
  try {
    const { nasname, shortname, secret, description, type, connection_id } = req.body;
    const result = await getDb().query(
      `UPDATE nas SET nasname = COALESCE($1, nasname), shortname = COALESCE($2, shortname),
       secret = COALESCE($3, secret), description = COALESCE($4, description),
       type = COALESCE($5, type), connection_id = COALESCE($6, connection_id),
       updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 RETURNING *`,
      [nasname, shortname, secret, description, type, connection_id, req.params.id],
    );
    if (result.rows.length === 0)
      {return res.status(404).json({ error: "NAS not found" });}
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/nas/:id", async (req, res) => {
  try {
    await getDb().query("DELETE FROM nas WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// RADGROUPS (Service Plans as RADIUS groups)
// ═══════════════════════════════════════
router.get("/groups", async (req, res) => {
  try {
    const checkRes = await getDb().query(
      `SELECT DISTINCT groupname FROM (
         SELECT groupname FROM radgroupcheck
         UNION SELECT groupname FROM radgroupreply
         UNION SELECT groupname FROM radusergroup
       ) all_groups ORDER BY groupname`,
    );
    const groups = checkRes.rows.map((r) => r.groupname);

    const groupData = [];
    for (const group of groups) {
      const check = await getDb().query(
        "SELECT attribute, value, op FROM radgroupcheck WHERE groupname = $1",
        [group],
      );
      const reply = await getDb().query(
        "SELECT attribute, value, op FROM radgroupreply WHERE groupname = $1",
        [group],
      );
      const users = await getDb().query(
        "SELECT COUNT(*) FROM radusergroup WHERE groupname = $1",
        [group],
      );
      groupData.push({
        name: group,
        check: check.rows,
        reply: reply.rows,
        user_count: parseInt(users.rows[0].count),
      });
    }
    res.json(groupData);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/groups", async (req, res) => {
  try {
    const { name, check, reply } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Group name is required" });
    }

    for (const c of check || []) {
      await getDb().query(
        `INSERT INTO radgroupcheck (groupname, attribute, op, value) VALUES ($1, $2, $3, $4)`,
        [name, c.attribute, c.op || "==", c.value],
      );
    }
    for (const r of reply || []) {
      await getDb().query(
        `INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES ($1, $2, $3, $4)`,
        [name, r.attribute, r.op || "=", r.value],
      );
    }
    res.status(201).json({ success: true, name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/groups/:name", async (req, res) => {
  try {
    await getDb().query("DELETE FROM radgroupcheck WHERE groupname = $1", [
      req.params.name,
    ]);
    await getDb().query("DELETE FROM radgroupreply WHERE groupname = $1", [
      req.params.name,
    ]);
    await getDb().query("DELETE FROM radusergroup WHERE groupname = $1", [
      req.params.name,
    ]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// USER AUTH RULES (radcheck/radreply)
// ═══════════════════════════════════════
router.get("/users", async (req, res) => {
  try {
    const result = await getDb().query(
       `SELECT DISTINCT ON (rc.username) rc.username, rc.customer_id, c.name as customer_name,
               (SELECT value FROM radcheck WHERE username = rc.username AND attribute = 'Cleartext-Password' LIMIT 1) as password,
               (SELECT value FROM radcheck WHERE username = rc.username AND attribute = 'Expiration' LIMIT 1) as expiration,
               (SELECT value FROM radreply WHERE username = rc.username AND attribute = 'Framed-IP-Address' LIMIT 1) as framed_ip,
               (SELECT value FROM radreply WHERE username = rc.username AND attribute = 'Mikrotik-Rate-Limit' LIMIT 1) as rate_limit,
               (SELECT string_agg(groupname, ', ') FROM radusergroup WHERE username = rc.username) as groups,
               (SELECT COUNT(*) FROM radacct WHERE username = rc.username AND acctstoptime IS NULL) as active_sessions,
               EXISTS(SELECT 1 FROM radcheck WHERE username = rc.username AND attribute = 'Auth-Type' AND value = 'Reject') as disabled,
               rc.created_at
        FROM radcheck rc
        LEFT JOIN customers c ON c.id = rc.customer_id
        ORDER BY rc.username, rc.created_at DESC`,
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/users", async (req, res) => {
  try {
    const {
      username,
      password,
      customer_id,
      subscription_id,
      groups,
      attributes,
    } = req.body;

    if (!username || !String(username).trim() || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    // Create password check
    await getDb().query(
      `INSERT INTO radcheck (username, attribute, op, value, customer_id, subscription_id)
       VALUES ($1, 'Cleartext-Password', ':=', $2, $3, $4)`,
      [username, password, customer_id || null, subscription_id || null],
    );

    // Add reply attributes
    if (attributes) {
      for (const attr of attributes) {
        if (!attr?.attribute || attr.value === undefined || attr.value === null || attr.value === "") {continue;}
        const table = attr.attribute === "Expiration" ? "radcheck" : "radreply";
        await getDb().query(
          `INSERT INTO ${table} (username, attribute, op, value) VALUES ($1, $2, $3, $4)
           ON CONFLICT (username, attribute) DO UPDATE SET value = EXCLUDED.value, op = EXCLUDED.op`,
          [username, attr.attribute, attr.op || (table === "radcheck" ? ":=" : "="), String(attr.value)],
        );
      }
    }

    // Assign to groups
    if (groups && groups.length > 0) {
      for (const item of groups) {
        const group = typeof item === "string" ? item : item?.name;
        if (!group) {continue;}
        await getDb().query(
          `INSERT INTO radusergroup (username, groupname, priority) VALUES ($1, $2, $3)`,
          [username, group, typeof item === "string" ? 1 : item.priority || 1],
        );
      }
    }

    res.status(201).json({ success: true, username });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/users/:username", async (req, res) => {
  try {
    const { password, attributes, groups } = req.body;

    if (password) {
      await getDb().query(
        `UPDATE radcheck SET value = $1 WHERE username = $2 AND attribute = 'Cleartext-Password'`,
        [password, req.params.username],
      );
    }

    if (attributes) {
      for (const attr of attributes) {
        if (!attr?.attribute || attr.value === undefined || attr.value === null || attr.value === "") {continue;}
        const table = attr.attribute === "Expiration" ? "radcheck" : "radreply";
        await getDb().query(
          `INSERT INTO ${table} (username, attribute, op, value) VALUES ($1, $2, $3, $4)
           ON CONFLICT (username, attribute) DO UPDATE SET value = EXCLUDED.value, op = EXCLUDED.op`,
          [req.params.username, attr.attribute, attr.op || (table === "radcheck" ? ":=" : "="), String(attr.value)],
        );
      }
    }

    if (groups) {
      await getDb().query("DELETE FROM radusergroup WHERE username = $1", [
        req.params.username,
      ]);
      for (const item of groups) {
        const group = typeof item === "string" ? item : item?.name;
        if (!group) {continue;}
        await getDb().query(
          `INSERT INTO radusergroup (username, groupname, priority) VALUES ($1, $2, $3)`,
          [req.params.username, group, typeof item === "string" ? 1 : item.priority || 1],
        );
      }
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/users/:username", async (req, res) => {
  try {
    await getDb().query("DELETE FROM radcheck WHERE username = $1", [
      req.params.username,
    ]);
    await getDb().query("DELETE FROM radreply WHERE username = $1", [
      req.params.username,
    ]);
    await getDb().query("DELETE FROM radusergroup WHERE username = $1", [
      req.params.username,
    ]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Disable/enable user
router.post("/users/:username/toggle", async (req, res) => {
  try {
    const { username } = req.params;
    // Check if disabled
    const disabled = await getDb().query(
      `SELECT id FROM radcheck WHERE username = $1 AND attribute = 'Auth-Type' AND value = 'Reject'`,
      [username],
    );

    if (disabled.rows.length > 0) {
      // Enable
      await getDb().query(
        `DELETE FROM radcheck WHERE username = $1 AND attribute = 'Auth-Type'`,
        [username],
      );
    } else {
      // Disable
      await getDb().query(
        `INSERT INTO radcheck (username, attribute, op, value) VALUES ($1, 'Auth-Type', ':=', 'Reject')`,
        [username],
      );
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// ACCOUNTING (Session tracking)
// ═══════════════════════════════════════
router.get("/accounting", async (req, res) => {
  try {
    const { page = 1, limit = 50, username = "", status = "" } = req.query;
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];
    let paramIdx = 1;

    if (username) {
      where.push(`username ILIKE $${paramIdx}`);
      params.push(`%${username}%`);
      paramIdx++;
    }
    if (status === "online") {
      where.push(`acctstoptime IS NULL`);
    } else if (status === "offline") {
      where.push(`acctstoptime IS NOT NULL`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const countRes = await getDb().query(
      `SELECT COUNT(*) FROM radacct ${whereClause}`,
      params,
    );
    const total = parseInt(countRes.rows[0].count);

    const result = await getDb().query(
      `SELECT r.*, c.name as customer_name, c.email as customer_email
       FROM radacct r
       LEFT JOIN customers c ON c.id = r.customer_id
       ${whereClause}
       ORDER BY r.acctstarttime DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, parseInt(limit), offset],
    );

    res.json({
      data: result.rows,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/accounting/online", async (req, res) => {
  try {
    const result = await getDb().query(
      `SELECT r.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
       FROM radacct r
       LEFT JOIN customers c ON c.id = r.customer_id
       WHERE r.acctstoptime IS NULL
       ORDER BY r.acctstarttime DESC`,
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/accounting/customer/:customerId", async (req, res) => {
  try {
    const result = await getDb().query(
      `SELECT * FROM radacct WHERE customer_id = $1 ORDER BY acctstarttime DESC LIMIT 100`,
      [req.params.customerId],
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Real-time presence for all customers, derived from RADIUS accounting.
// Online  = a session with acctstoptime IS NULL (and a recent update).
// Offline = acctstoptime of the most recently ended session.
router.get("/presence", async (req, res) => {
  try {
    if (!global.dbAvailable) {
      return res.json({ source: "radius", presence: {}, staleAfterSeconds: 300 });
    }
    const STALE_SECONDS = 300; // a session with no update for 5 min is treated as stale
    const result = await getDb().query(`
      SELECT c.id AS customer_id,
             COALESCE(
               EXISTS (
                 SELECT 1 FROM radacct r
                 WHERE r.customer_id = c.id
                   AND r.acctstoptime IS NULL
                   AND GREATEST(r.acctupdatetime, r.acctstarttime) > NOW() - ($1 * INTERVAL '1 second')
               ), false) AS is_online,
             (SELECT r2.acctstarttime FROM radacct r2
              WHERE r2.customer_id = c.id AND r2.acctstoptime IS NULL
              ORDER BY r2.acctstarttime DESC LIMIT 1) AS session_started_at,
             (SELECT r3.acctstoptime FROM radacct r3
              WHERE r3.customer_id = c.id AND r3.acctstoptime IS NOT NULL
              ORDER BY r3.acctstoptime DESC LIMIT 1) AS last_offline_at,
             (SELECT r4.framedipaddress FROM radacct r4
              WHERE r4.customer_id = c.id AND r4.acctstoptime IS NULL
              ORDER BY r4.acctstarttime DESC LIMIT 1) AS ip_address,
             (SELECT r5.callingstationid FROM radacct r5
              WHERE r5.customer_id = c.id AND r5.acctstoptime IS NULL
              ORDER BY r5.acctstarttime DESC LIMIT 1) AS mac
      FROM customers c
    `, [STALE_SECONDS]);

    const presence = {};
    for (const row of result.rows) {
      presence[row.customer_id] = {
        is_online: Boolean(row.is_online),
        session_started_at: row.session_started_at || null,
        last_offline_at: row.last_offline_at || null,
        ip_address: row.ip_address || null,
        mac: row.mac || null,
      };
    }
    res.json({ source: "radius", presence, staleAfterSeconds: STALE_SECONDS });
  } catch (e) {
    console.error("Presence query error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// USAGE REPORTS
// ═══════════════════════════════════════
router.get("/usage/summary", async (req, res) => {
  try {
    const { period = "30d" } = req.query;
    let interval;
    switch (period) {
      case "7d":
        interval = "7 days";
        break;
      case "30d":
        interval = "30 days";
        break;
      case "90d":
        interval = "90 days";
        break;
      case "1y":
        interval = "1 year";
        break;
      default:
        interval = "30 days";
    }

    const result = await getDb().query(
      `SELECT
         c.id as customer_id,
         c.name as customer_name,
         c.email as customer_email,
         COALESCE(SUM(r.acctsessiontime), 0) as total_session_time,
         COALESCE(SUM(r.acctinputoctets), 0) as total_upload,
         COALESCE(SUM(r.acctoutputoctets), 0) as total_download,
         COALESCE(SUM(r.acctinputoctets + r.acctoutputoctets), 0) as total_bytes,
         COUNT(DISTINCT r.acctsessionid) as session_count,
         MAX(r.acctstarttime) as last_session,
         (SELECT COUNT(*) FROM radacct WHERE customer_id = c.id AND acctstoptime IS NULL) as current_sessions
       FROM customers c
       LEFT JOIN radcheck rc ON rc.customer_id = c.id
       LEFT JOIN radacct r ON r.username = rc.username AND r.acctstarttime >= NOW() - INTERVAL '${interval}'
       GROUP BY c.id
       ORDER BY total_bytes DESC`,
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// BILLING SYNC
// ═══════════════════════════════════════
router.post("/sync-from-billing", async (req, res) => {
  try {
    const billingData = require("../services/billingData");
    const created = [];
    const skipped = [];

    const allSubscriptions = await billingData.listSubscriptions();
    const subs = allSubscriptions.filter(
      (s) => s.status === "active" && s.pppoe_username,
    );

    for (const sub of subs) {
      // Check if user already exists in RADIUS
      const exists = await getDb().query(
        `SELECT id FROM radcheck WHERE username = $1`,
        [sub.pppoe_username],
      );

      if (exists.rows.length > 0) {
        skipped.push(sub.pppoe_username);
        continue;
      }

      const allPlans = await billingData.listPlans();
      const plan = allPlans.find((p) => p.id === sub.plan_id);

      // Create RADIUS user
      await getDb().query(
        `INSERT INTO radcheck (username, attribute, op, value, customer_id, subscription_id)
         VALUES ($1, 'Cleartext-Password', ':=', $2, $3, $4)`,
        [sub.pppoe_username, sub.pppoe_password, sub.customer_id, sub.id],
      );

      // Add rate limit if plan exists
      if (plan) {
        const rateLimit = `${plan.speed_down}/${plan.speed_up}`;
        await getDb().query(
          `INSERT INTO radreply (username, attribute, op, value) VALUES ($1, 'Mikrotik-Rate-Limit', ':=', $2)`,
          [sub.pppoe_username, rateLimit],
        );
      }

      created.push(sub.pppoe_username);
    }

    res.json({
      created,
      skipped,
      total_created: created.length,
      total_skipped: skipped.length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// AUTH LOG (radpostauth)
// ═══════════════════════════════════════
router.get("/auth-log", async (req, res) => {
  try {
    const { page = 1, limit = 100, username = "" } = req.query;
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];
    let paramIdx = 1;

    if (username) {
      where.push(`username ILIKE $${paramIdx}`);
      params.push(`%${username}%`);
      paramIdx++;
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const countRes = await getDb().query(
      `SELECT COUNT(*) FROM radpostauth ${whereClause}`,
      params,
    );
    const total = parseInt(countRes.rows[0].count);

    const result = await getDb().query(
      `SELECT * FROM radpostauth ${whereClause} ORDER BY authdate DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, parseInt(limit), offset],
    );

    res.json({
      data: result.rows,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// BULK IMPORT
// ═══════════════════════════════════════
router.post("/import", async (req, res) => {
  try {
    const { users, create_customers } = req.body;

    if (!Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ error: "No users provided" });
    }

    const results = {
      created: 0,
      skipped: 0,
      customers_created: 0,
      errors: [],
    };

    for (const user of users) {
      try {
        const username = user.username || user.UserName || user.user || "";
        const password =
          user.password || user.Password || user.value || user.Value || "";
        const attribute =
          user.attribute || user.Attribute || "Cleartext-Password";
        const op = user.op || user.Op || ":=";
        const customerName = user.customer_name || user.name || username;

        if (!username) {
          results.errors.push({ user, error: "Missing username" });
          continue;
        }

        // Check if already exists
        const exists = await getDb().query(
          "SELECT id FROM radcheck WHERE username = $1 AND attribute = $2",
          [username, attribute],
        );

        if (exists.rows.length > 0) {
          results.skipped++;
          continue;
        }

        // Create customer if requested
        let customerId = user.customer_id || null;
        if (create_customers && !customerId && customerName) {
          const customerResult = await getDb().query(
            `INSERT INTO customers (id, name, phone, email, status)
             VALUES (gen_random_uuid(), $1, $2, $3, 'active')
             ON CONFLICT DO NOTHING
             RETURNING id`,
            [customerName, user.phone || "", user.email || ""],
          );
          if (customerResult.rows.length > 0) {
            customerId = customerResult.rows[0].id;
            results.customers_created++;
          }
        }

        // Insert radcheck
        await getDb().query(
          `INSERT INTO radcheck (username, attribute, op, value, customer_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [username, attribute, op, password, customerId],
        );

        // Insert rate limit if provided
        const rateLimit =
          user.rate_limit || user.RateLimit || user["Mikrotik-Rate-Limit"];
        if (rateLimit) {
          await getDb().query(
            `INSERT INTO radreply (username, attribute, op, value) VALUES ($1, 'Mikrotik-Rate-Limit', ':=', $2)`,
            [username, rateLimit],
          );
        }

        results.created++;
      } catch (e) {
        results.errors.push({
          user: user.username || "unknown",
          error: e.message,
        });
      }
    }

    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
