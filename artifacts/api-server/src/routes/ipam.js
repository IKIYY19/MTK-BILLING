const express = require("express");
const { getDb } = require("../db");
const { getTenantId } = require("../db/tenantScope");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");

const VALID_STATUS = new Set(["free", "used", "reserved"]);

// Import RouterOS PPPoE pools and apply live session IPs to IPAM.
router.post("/sync", async (req, res) => {
  try {
    res.json(await require("../services/ipamSync").syncAll());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function parseIp(value) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(value || "").trim());
  if (!match) {return null;}
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) {return null;}
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

function formatIp(value) {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join(".");
}

function hostRange(network, mask) {
  const base = parseIp(network);
  if (base === null) {return null;}
  const prefix = Number(mask);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {return null;}
  const maskBits = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const networkAddress = (base & maskBits) >>> 0;
  const broadcast = (networkAddress | (~maskBits >>> 0)) >>> 0;
  if (prefix >= 31) {return { networkAddress, broadcast, first: networkAddress, last: broadcast }; }
  return { networkAddress, broadcast, first: (networkAddress + 1) >>> 0, last: (broadcast - 1) >>> 0 };
}

async function withTransaction(fn) {
  const db = getDb();
  if (!global.dbAvailable || !db.pool) {return fn(db);}
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [
      getTenantId(),
    ]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function tenantId(req) {
  return req.user?.tenant_id || req.tenantId || null;
}

router.get("/subnets", async (req, res) => {
  try {
    const result = await getDb().query(
      `SELECT s.*,
        COALESCE(SUM(CASE WHEN i.status = 'used' THEN 1 ELSE 0 END), 0) AS used_ips,
        COALESCE(SUM(CASE WHEN i.status = 'reserved' THEN 1 ELSE 0 END), 0) AS reserved_ips,
        COUNT(i.id) AS tracked_ips
       FROM ipam_subnets s
       LEFT JOIN ipam_ips i ON i.subnet_id = s.id
       WHERE ($1::uuid IS NULL OR s.tenant_id = $1::uuid)
       GROUP BY s.id
       ORDER BY s.name`,
      [tenantId(req)],
    );
    res.json(result.rows.map((row) => {
      const total = Math.max(0, 2 ** (32 - Number(row.mask)) - 2);
      const used = Number(row.used_ips);
      const reserved = Number(row.reserved_ips);
      return {
        ...row,
        used_ips: used,
        reserved_ips: reserved,
        total_ips: total,
        tracked_ips: Number(row.tracked_ips),
        free_ips: Math.max(0, total - used - reserved),
      };
    }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/subnets", async (req, res) => {
  try {
    const { name, network, mask, gateway, description, vlan_id } = req.body;
    if (!name || !String(name).trim()) {return res.status(400).json({ error: "Name is required" });}
    const range = hostRange(network, mask);
    if (!range) {return res.status(400).json({ error: "Valid network and mask (0-32) are required" });}
    if (vlan_id !== undefined && vlan_id !== null && vlan_id !== "") {
      const vlan = Number(vlan_id);
      if (!Number.isInteger(vlan) || vlan < 1 || vlan > 4094) {
        return res.status(400).json({ error: "VLAN must be between 1 and 4094" });
      }
    }
    const gatewayInt = gateway ? parseIp(gateway) : null;
    if (gateway && gatewayInt === null) {return res.status(400).json({ error: "Invalid gateway address" });}
    if (gatewayInt !== null && (gatewayInt < range.first || gatewayInt > range.last)) {
      return res.status(400).json({ error: "Gateway must be inside the subnet" });
    }

    const id = uuidv4();
    const limit = Math.min(256, Math.max(0, range.last - range.first + 1));
    const addresses = [];
    for (let offset = 0; offset < limit; offset++) {
      addresses.push((range.first + offset) >>> 0);
    }

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO ipam_subnets (id, name, network, mask, gateway, description, vlan_id, tenant_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, name, network, Number(mask), gateway || null, description || "", vlan_id || null, tenantId(req)],
      );
      for (const address of addresses) {
        const isGateway = gatewayInt !== null && address === gatewayInt;
        await client.query(
          `INSERT INTO ipam_ips (id, subnet_id, ip_address, status, description, tenant_id)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [uuidv4(), id, formatIp(address), isGateway ? "reserved" : "free", isGateway ? "Gateway" : "", tenantId(req)],
        );
      }
    });

    res.status(201).json({ id, name, network, mask: Number(mask), generated: addresses.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/subnets/:id", async (req, res) => {
  try {
    await withTransaction(async (client) => {
      await client.query("DELETE FROM ipam_ips WHERE subnet_id = $1", [req.params.id]);
      const result = await client.query("DELETE FROM ipam_subnets WHERE id = $1", [req.params.id]);
      if (result.rowCount === 0) {
        const error = new Error("Subnet not found");
        error.status = 404;
        throw error;
      }
    });
    res.json({ success: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.get("/subnets/:id/ips", async (req, res) => {
  try {
    const result = await getDb().query(
      `SELECT i.*, c.name AS customer_name
       FROM ipam_ips i
       LEFT JOIN customers c ON c.id = i.customer_id
       WHERE i.subnet_id = $1
       ORDER BY i.ip_address`,
      [req.params.id],
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/ips/:id", async (req, res) => {
  try {
    const { status, description, assigned_to, customer_id, subscription_id } = req.body;
    if (status && !VALID_STATUS.has(status)) {
      return res.status(400).json({ error: "Invalid IP status" });
    }
    const nextStatus = assigned_to || customer_id || subscription_id ? "used" : status;
    const result = await getDb().query(
      `UPDATE ipam_ips SET
         status = COALESCE($1, status),
         description = COALESCE($2, description),
         assigned_to = COALESCE($3, assigned_to),
         customer_id = COALESCE($4, customer_id),
         subscription_id = COALESCE($5, subscription_id),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 RETURNING *`,
      [nextStatus, description, assigned_to, customer_id, subscription_id, req.params.id],
    );
    if (result.rows.length === 0) {return res.status(404).json({ error: "IP not found" });}
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/subnets/:id/allocate", async (req, res) => {
  try {
    const { customer_id, subscription_id, assigned_to } = req.body;
    if (!customer_id && !subscription_id && !assigned_to) {
      return res.status(400).json({ error: "customer_id, subscription_id or assigned_to is required" });
    }
    const result = await withTransaction(async (client) => {
      const available = await client.query(
        `SELECT * FROM ipam_ips WHERE subnet_id = $1 AND status = 'free' ORDER BY id LIMIT 1`,
        [req.params.id],
      );
      if (available.rows.length === 0) {
        const error = new Error("No free addresses in this subnet");
        error.status = 409;
        throw error;
      }
      const ip = available.rows[0];
      const updated = await client.query(
        `UPDATE ipam_ips SET status = 'used', assigned_to = $2, customer_id = $3,
           subscription_id = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 RETURNING *`,
        [
          ip.id,
          assigned_to || `Customer ${customer_id || subscription_id}`,
          customer_id || null,
          subscription_id || null,
        ],
      );
      return updated.rows[0];
    });
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const subnets = await getDb().query(
      "SELECT COUNT(*) AS count FROM ipam_subnets WHERE ($1::uuid IS NULL OR tenant_id = $1::uuid)",
      [tenantId(req)],
    );
    const ips = await getDb().query(
      `SELECT i.status, COUNT(*) AS count FROM ipam_ips i
       LEFT JOIN ipam_subnets s ON s.id = i.subnet_id
       WHERE ($1::uuid IS NULL OR i.tenant_id = $1::uuid)
       GROUP BY i.status`,
      [tenantId(req)],
    );
    const masks = await getDb().query(
      "SELECT mask FROM ipam_subnets WHERE ($1::uuid IS NULL OR tenant_id = $1::uuid)",
      [tenantId(req)],
    );
    const stats = { subnets: Number(subnets.rows[0].count), total_ips: 0, used_ips: 0, free_ips: 0, reserved_ips: 0 };
    for (const row of masks.rows) {
      stats.total_ips += Math.max(0, 2 ** (32 - Number(row.mask)) - 2);
    }
    ips.rows.forEach((row) => {
      const count = Number(row.count);
      if (row.status === "used") {stats.used_ips += count;}
      if (row.status === "free") {stats.free_ips += count;}
      if (row.status === "reserved") {stats.reserved_ips += count;}
    });
    stats.free_ips = Math.max(0, stats.total_ips - stats.used_ips - stats.reserved_ips);
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
