const express = require("express");
const { getDb } = require("../db");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");



// GET /api/ipam/subnets — List all subnets
router.get("/subnets", async (req, res) => {
  try {
    if (!global.dbAvailable) {return res.json([]);}
    const result = await getDb().query("SELECT * FROM ipam_subnets ORDER BY name");
    // Calculate usage for each subnet
    const subnets = await Promise.all(result.rows.map(async (s) => {
      const used = await getDb().query("SELECT COUNT(*) as count FROM ipam_ips WHERE subnet_id = $1 AND status = 'used'", [s.id]);
      const total = await getDb().query("SELECT COUNT(*) as count FROM ipam_ips WHERE subnet_id = $1", [s.id]);
      return { ...s, used_ips: parseInt(used.rows[0].count), total_ips: parseInt(total.rows[0].count) };
    }));
    res.json(subnets);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/ipam/subnets — Create subnet + auto-generate IPs
router.post("/subnets", async (req, res) => {
  try {
    const { name, network, mask, gateway, description, vlan_id } = req.body;
    const id = uuidv4();
    if (!global.dbAvailable) {
      return res.json({ id, name, network, mask, gateway, description, vlan_id, created_at: new Date().toISOString() });
    }
    await getDb().query(
      `INSERT INTO ipam_subnets (id, name, network, mask, gateway, description, vlan_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, name, network, mask, gateway, description || "", vlan_id || null]
    );

    // Auto-generate IP range (first 20 IPs of the subnet)
    const base = network.split('.').slice(0, 3).join('.');
    const start = parseInt(network.split('.')[3]) + 1;
    for (let i = start; i < start + 20; i++) {
      const ip = `${base}.${i}`;
      const ipId = uuidv4();
      await getDb().query(
        `INSERT INTO ipam_ips (id, subnet_id, ip_address, status) VALUES ($1,$2,$3,'free')`,
        [ipId, id, ip]
      );
    }
    // Mark gateway as reserved
    if (gateway) {
      await getDb().query(`UPDATE ipam_ips SET status = 'reserved', description = 'Gateway' WHERE subnet_id = $1 AND ip_address = $2`, [id, gateway]);
    }

    res.status(201).json({ id, name, network, mask });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/ipam/subnets/:id
router.delete("/subnets/:id", async (req, res) => {
  await getDb().query("DELETE FROM ipam_ips WHERE subnet_id = $1", [req.params.id]);
  await getDb().query("DELETE FROM ipam_subnets WHERE id = $1", [req.params.id]);
  res.json({ success: true });
});

// GET /api/ipam/subnets/:id/ips — List IPs in a subnet
router.get("/subnets/:id/ips", async (req, res) => {
  try {
    if (!global.dbAvailable) {return res.json([]);}
    const result = await getDb().query(
      "SELECT * FROM ipam_ips WHERE subnet_id = $1 ORDER BY ip_address", [req.params.id]
    );
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/ipam/ips/:id — Update IP status/description/assignment
router.put("/ips/:id", async (req, res) => {
  try {
    const { status, description, assigned_to } = req.body;
    const result = await getDb().query(
      `UPDATE ipam_ips SET status = COALESCE($1, status), description = COALESCE($2, description), assigned_to = COALESCE($3, assigned_to), updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *`,
      [status, description, assigned_to, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/ipam/stats
router.get("/stats", async (req, res) => {
  try {
    if (!global.dbAvailable) {return res.json({ subnets: 0, total_ips: 0, used_ips: 0, free_ips: 0 });}
    const subnets = await getDb().query("SELECT COUNT(*) as count FROM ipam_subnets");
    const ips = await getDb().query("SELECT status, COUNT(*) as count FROM ipam_ips GROUP BY status");
    const stats = { subnets: parseInt(subnets.rows[0].count), total_ips: 0, used_ips: 0, free_ips: 0, reserved_ips: 0 };
    ips.rows.forEach(r => { stats.total_ips += parseInt(r.count); if (r.status === 'used') {stats.used_ips += parseInt(r.count);} if (r.status === 'free') {stats.free_ips += parseInt(r.count);} if (r.status === 'reserved') {stats.reserved_ips += parseInt(r.count);} });
    res.json(stats);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
