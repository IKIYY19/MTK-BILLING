/**
 * Inventory API Routes
 * Unified: PostgreSQL-aware with in-memory fallback
 */

const express = require("express");
const { getDb } = require("../db");
const router = express.Router();
const inv = require("../db/inventoryStore");



// ─── Stats ───
router.get("/stats", async (req, res) => {
  try {
    const stats = await inv.getStats();
    const alerts = await inv.generateAlerts();
    res.json({ ...stats, alerts: alerts.slice(0, 20) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Categories ───
router.get("/categories", async (req, res) => {
  try {
    const db = getDb();
    if (db) {
      const result = await db.query(
        "SELECT * FROM inventory_categories ORDER BY name",
      );
      return res.json(result.rows);
    }
    res.json(inv.inventoryStore.categories);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Brands ───
router.get("/brands", async (req, res) => {
  try {
    const db = getDb();
    if (db) {
      const result = await db.query(
        "SELECT name FROM inventory_brands ORDER BY name",
      );
      return res.json(result.rows.map((r) => r.name));
    }
    res.json(inv.inventoryStore.brands);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Locations ───
router.get("/locations", async (req, res) => {
  try {
    const db = getDb();
    if (db) {
      const result = await db.query(
        "SELECT * FROM inventory_locations ORDER BY name",
      );
      return res.json(result.rows);
    }
    res.json(inv.inventoryStore.locations);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/locations", async (req, res) => {
  try {
    const db = getDb();
    const loc = { id: `loc-${Date.now()}`, ...req.body };
    if (db) {
      await db.query(
        "INSERT INTO inventory_locations (id, name, type, address) VALUES ($1,$2,$3,$4)",
        [loc.id, loc.name, loc.type, loc.address],
      );
      return res.status(201).json(loc);
    }
    inv.inventoryStore.locations.push(loc);
    res.status(201).json(loc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Devices ───
router.get("/devices", async (req, res) => {
  try {
    const db = getDb();
    const { status, category_id, brand, location_id, search } = req.query;
    let devices;

    if (db) {
      const where = [];
      const params = [];
      let idx = 1;
      if (status) {
        where.push(`d.status = $${idx}`);
        params.push(status);
        idx++;
      }
      if (category_id) {
        where.push(`d.category_id = $${idx}`);
        params.push(category_id);
        idx++;
      }
      if (brand) {
        where.push(`d.brand = $${idx}`);
        params.push(brand);
        idx++;
      }
      if (location_id) {
        where.push(`d.location_id = $${idx}`);
        params.push(location_id);
        idx++;
      }
      if (search) {
        where.push(
          `(d.name ILIKE $${idx} OR d.model ILIKE $${idx} OR d.serial ILIKE $${idx} OR d.mac ILIKE $${idx} OR d.brand ILIKE $${idx} OR d.ip_address ILIKE $${idx})`,
        );
        params.push(`%${search}%`);
        idx++;
      }
      const whereClause =
        where.length > 0 ? "WHERE " + where.join(" AND ") : "";
      const result = await db.query(
        `SELECT d.*, c.name as category_name, c.icon as category_icon, c.color as category_color
         FROM inventory_devices d
         LEFT JOIN inventory_categories c ON c.id = d.category_id
         ${whereClause}
         ORDER BY d.created_at DESC`,
        params,
      );
      return res.json(result.rows);
    }

    devices = [...inv.inventoryStore.devices];
    if (status) {devices = devices.filter((d) => d.status === status);}
    if (category_id)
      {devices = devices.filter((d) => d.category_id === category_id);}
    if (brand) {devices = devices.filter((d) => d.brand === brand);}
    if (location_id)
      {devices = devices.filter((d) => d.location_id === location_id);}
    if (search) {
      const s = search.toLowerCase();
      devices = devices.filter(
        (d) =>
          d.name.toLowerCase().includes(s) ||
          d.model.toLowerCase().includes(s) ||
          d.serial.toLowerCase().includes(s) ||
          d.mac.toLowerCase().includes(s) ||
          d.brand.toLowerCase().includes(s) ||
          d.ip_address.toLowerCase().includes(s),
      );
    }
    devices = devices.map((d) => {
      const cat = inv.inventoryStore.categories.find(
        (c) => c.id === d.category_id,
      );
      return {
        ...d,
        category_name: cat?.name || "Unknown",
        category_icon: cat?.icon || "Package",
        category_color: cat?.color || "#71717a",
      };
    });
    res.json(devices);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/devices/:id", async (req, res) => {
  try {
    const device = await inv.getDevice(req.params.id);
    if (!device) {return res.status(404).json({ error: "Device not found" });}

    const db = getDb();
    let cat, location, maintenanceLogs, assignmentHistory;

    if (db) {
      const [catRes, locRes, maintRes, assignRes] = await Promise.all([
        db.query("SELECT * FROM inventory_categories WHERE id = $1", [
          device.category_id,
        ]),
        db.query("SELECT * FROM inventory_locations WHERE id = $1", [
          device.location_id,
        ]),
        db.query(
          "SELECT * FROM inventory_maintenance_logs WHERE device_id = $1 ORDER BY created_at DESC",
          [device.id],
        ),
        db.query(
          "SELECT * FROM inventory_assignments WHERE device_id = $1 ORDER BY assigned_at DESC",
          [device.id],
        ),
      ]);
      cat = catRes.rows[0];
      location = locRes.rows[0];
      maintenanceLogs = maintRes.rows;
      assignmentHistory = assignRes.rows;
    } else {
      cat = inv.inventoryStore.categories.find(
        (c) => c.id === device.category_id,
      );
      location = inv.inventoryStore.locations.find(
        (l) => l.id === device.location_id,
      );
      maintenanceLogs = inv.inventoryStore.maintenanceLogs.filter(
        (l) => l.device_id === device.id,
      );
      assignmentHistory = inv.inventoryStore.assignments.filter(
        (a) => a.device_id === device.id,
      );
    }

    res.json({
      ...device,
      category_name: cat?.name || "Unknown",
      category_icon: cat?.icon || "Package",
      category_color: cat?.color || "#71717a",
      location_name: location?.name || null,
      maintenance_logs: maintenanceLogs,
      assignment_history: assignmentHistory,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/devices", async (req, res) => {
  try {
    const device = await inv.createDevice(req.body);
    res.status(201).json(device);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/devices/:id", async (req, res) => {
  try {
    const device = await inv.updateDevice(req.params.id, req.body);
    if (!device) {return res.status(404).json({ error: "Device not found" });}
    res.json(device);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/devices/:id", async (req, res) => {
  try {
    const device = await inv.deleteDevice(req.params.id);
    if (!device) {return res.status(404).json({ error: "Device not found" });}
    res.json({ message: "Device deleted" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Assignment ───
router.post("/devices/:id/assign", async (req, res) => {
  try {
    const { customer_name, customer_id } = req.body;
    const device = await inv.assignDevice(
      req.params.id,
      customer_name,
      customer_id,
    );
    if (!device) {return res.status(404).json({ error: "Device not found" });}
    res.json(device);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/devices/:id/unassign", async (req, res) => {
  try {
    const device = await inv.unassignDevice(req.params.id);
    if (!device) {return res.status(404).json({ error: "Device not found" });}
    res.json(device);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Maintenance ───
router.get("/devices/:id/maintenance", async (req, res) => {
  try {
    const db = getDb();
    if (db) {
      const result = await db.query(
        "SELECT * FROM inventory_maintenance_logs WHERE device_id = $1 ORDER BY created_at DESC",
        [req.params.id],
      );
      return res.json(result.rows);
    }
    const logs = inv.inventoryStore.maintenanceLogs.filter(
      (l) => l.device_id === req.params.id,
    );
    res.json(logs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/devices/:id/maintenance", async (req, res) => {
  try {
    const log = await inv.addMaintenanceLog(req.params.id, req.body);
    res.status(201).json(log);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Alerts ───
router.get("/alerts", async (req, res) => {
  try {
    const db = getDb();
    if (db) {
      const result = await db.query(
        "SELECT * FROM inventory_alerts ORDER BY created_at DESC",
      );
      return res.json(result.rows);
    }
    const alerts = await inv.generateAlerts();
    res.json(alerts);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/alerts/:id/acknowledge", async (req, res) => {
  try {
    const db = getDb();
    if (db) {
      const result = await db.query(
        "UPDATE inventory_alerts SET acknowledged = true WHERE id = $1 RETURNING *",
        [req.params.id],
      );
      if (result.rows.length === 0)
        {return res.status(404).json({ error: "Alert not found" });}
      return res.json(result.rows[0]);
    }
    const alert = inv.inventoryStore.alerts.find((a) => a.id === req.params.id);
    if (!alert) {return res.status(404).json({ error: "Alert not found" });}
    alert.acknowledged = true;
    res.json(alert);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Import/Export ───
router.post("/import", async (req, res) => {
  try {
    const { devices } = req.body;
    if (!Array.isArray(devices))
      {return res.status(400).json({ error: "devices array required" });}
    const created = [];
    for (const d of devices) {
      created.push(await inv.createDevice(d));
    }
    res.status(201).json({ imported: created.length, devices: created });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/export", async (req, res) => {
  try {
    const db = getDb();
    const { status } = req.query;
    let devices;

    if (db) {
      let where = "";
      const params = [];
      if (status) {
        where = "WHERE d.status = $1";
        params.push(status);
      }
      const result = await db.query(
        `SELECT d.*, c.name as category_name, l.name as location_name
         FROM inventory_devices d
         LEFT JOIN inventory_categories c ON c.id = d.category_id
         LEFT JOIN inventory_locations l ON l.id = d.location_id
         ${where} ORDER BY d.created_at DESC`,
        params,
      );
      devices = result.rows;
    } else {
      devices = [...inv.inventoryStore.devices];
      if (status) {devices = devices.filter((d) => d.status === status);}
    }

    const headers = [
      "Name",
      "Category",
      "Brand",
      "Model",
      "Serial",
      "MAC",
      "Firmware",
      "IP",
      "Status",
      "Purchase Date",
      "Cost",
      "Warranty",
      "Location",
      "Assigned To",
      "Notes",
    ];
    const rows = devices.map((d) => {
      const cat = db
        ? { name: d.category_name }
        : inv.inventoryStore.categories.find((c) => c.id === d.category_id);
      const loc = db
        ? { name: d.location_name }
        : inv.inventoryStore.locations.find((l) => l.id === d.location_id);
      return [
        d.name,
        cat?.name || "",
        d.brand,
        d.model,
        d.serial,
        d.mac,
        d.firmware,
        d.ip_address,
        d.status,
        d.purchase_date,
        d.purchase_cost,
        d.warranty_expires || "",
        loc?.name || "",
        d.assigned_customer || "",
        d.notes || "",
      ];
    });

    let csv = headers.join(",") + "\n";
    rows.forEach((row) => {
      csv +=
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",") +
        "\n";
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="inventory-${new Date().toISOString().split("T")[0]}.csv"`,
    );
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Bulk Actions ───
router.post("/bulk/status", async (req, res) => {
  try {
    const { device_ids, status } = req.body;
    if (!Array.isArray(device_ids) || !status)
      {return res.status(400).json({ error: "device_ids and status required" });}
    const updated = [];
    for (const id of device_ids) {
      const device = await inv.updateDevice(id, { status });
      if (device) {updated.push(device);}
    }
    res.json({ updated: updated.length, devices: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/bulk/location", async (req, res) => {
  try {
    const { device_ids, location_id } = req.body;
    if (!Array.isArray(device_ids))
      {return res.status(400).json({ error: "device_ids required" });}
    const updated = [];
    for (const id of device_ids) {
      const device = await inv.updateDevice(id, { location_id });
      if (device) {updated.push(device);}
    }
    res.json({ updated: updated.length, devices: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
