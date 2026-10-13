/**
 * Device Inventory Store
 * Unified store: PostgreSQL when available, in-memory fallback.
 * Tracks all network equipment: routers, switches, APs, ONTs, CPEs, antennas, cables, UPS, etc.
 */

const { v4: uuidv4 } = require("uuid");

// ─── In-memory fallback store ───
const inventoryStore = {
  devices: [],
  categories: [],
  brands: [],
  locations: [],
  maintenanceLogs: [],
  assignments: [],
  alerts: [],
};

// ─── Helpers ───
function getDb() {
  return global.dbAvailable ? global.db : null;
}

function pgNow() {
  return new Date().toISOString();
}

// ─── Default seed data ───
const DEFAULT_CATEGORIES = [
  { id: "cat-router", name: "Router", icon: "Router", color: "#3b82f6" },
  { id: "cat-switch", name: "Switch", icon: "Network", color: "#8b5cf6" },
  { id: "cat-ap", name: "Access Point", icon: "Wifi", color: "#10b981" },
  {
    id: "cat-ont",
    name: "ONT / Fiber Terminal",
    icon: "Cable",
    color: "#f59e0b",
  },
  {
    id: "cat-cpe",
    name: "CPE / Client Device",
    icon: "Monitor",
    color: "#6366f1",
  },
  {
    id: "cat-antenna",
    name: "Antenna / Sector",
    icon: "Radio",
    color: "#ec4899",
  },
  { id: "cat-server", name: "Server", icon: "Server", color: "#64748b" },
  { id: "cat-ups", name: "UPS / Power", icon: "Battery", color: "#84cc16" },
  { id: "cat-cable", name: "Cable / Fiber", icon: "Cable", color: "#a855f7" },
  { id: "cat-rack", name: "Rack / Enclosure", icon: "Grid", color: "#f97316" },
  {
    id: "cat-other",
    name: "Other Equipment",
    icon: "Package",
    color: "#71717a",
  },
];

const DEFAULT_BRANDS = [
  "MikroTik",
  "Ubiquiti",
  "Huawei",
  "ZTE",
  "Cisco",
  "TP-Link",
  "D-Link",
  "Juniper",
  "Aruba",
  "Ruckus",
  "Cambium",
  "FiberHome",
  "Nokia",
  "APC",
  "Eaton",
  "Generic",
  "Other",
];

// ─── Seed in-memory ───
const seedInventory = () => {
  if (inventoryStore.categories.length === 0) {
    inventoryStore.categories = DEFAULT_CATEGORIES.map((c) => ({ ...c }));
  }
  if (inventoryStore.brands.length === 0) {
    inventoryStore.brands = [...DEFAULT_BRANDS];
  }
};
seedInventory();

// ─── Seed PG defaults ───
let pgSeeded = false;
async function seedPgDefaults(db) {
  if (pgSeeded) {return;}
  try {
    const catResult = await db.query(
      "SELECT COUNT(*) as c FROM inventory_categories",
    );
    if (parseInt(catResult.rows[0].c) === 0) {
      for (const cat of DEFAULT_CATEGORIES) {
        await db.query(
          "INSERT INTO inventory_categories (id, name, icon, color) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING",
          [cat.id, cat.name, cat.icon, cat.color],
        );
      }
    }
    const brandResult = await db.query(
      "SELECT COUNT(*) as c FROM inventory_brands",
    );
    if (parseInt(brandResult.rows[0].c) === 0) {
      for (const brand of DEFAULT_BRANDS) {
        await db.query(
          "INSERT INTO inventory_brands (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
          [brand],
        );
      }
    }
    pgSeeded = true;
  } catch (e) {
    console.error("Inventory PG seed error (non-fatal):", e.message);
  }
}

// ─── Device CRUD ───
async function createDevice(data) {
  const db = getDb();
  if (db) {
    await seedPgDefaults(db);
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO inventory_devices (id, name, category_id, brand, model, serial, mac, firmware, ip_address, status, purchase_date, purchase_cost, warranty_expires, location_id, assigned_to, assigned_customer, notes, specs, maintenance_schedule, last_maintenance, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
      [
        id,
        data.name,
        data.category_id || "cat-other",
        data.brand || "",
        data.model || "",
        data.serial || "",
        data.mac || "",
        data.firmware || "",
        data.ip_address || "",
        data.status || "in-stock",
        data.purchase_date || pgNow().split("T")[0],
        parseFloat(data.purchase_cost) || 0,
        data.warranty_expires || null,
        data.location_id || null,
        data.assigned_to || null,
        data.assigned_customer || null,
        data.notes || "",
        JSON.stringify(data.specs || {}),
        data.maintenance_schedule || "none",
        data.last_maintenance || null,
        data.tags || [],
      ],
    );
    return result.rows[0];
  }
  const device = {
    id: uuidv4(),
    name: data.name,
    category_id: data.category_id || "cat-other",
    brand: data.brand || "",
    model: data.model || "",
    serial: data.serial || "",
    mac: data.mac || "",
    firmware: data.firmware || "",
    ip_address: data.ip_address || "",
    status: data.status || "in-stock",
    purchase_date: data.purchase_date || new Date().toISOString().split("T")[0],
    purchase_cost: parseFloat(data.purchase_cost) || 0,
    warranty_expires: data.warranty_expires || null,
    location_id: data.location_id || null,
    assigned_to: data.assigned_to || null,
    assigned_customer: data.assigned_customer || null,
    notes: data.notes || "",
    specs: data.specs || {},
    maintenance_schedule: data.maintenance_schedule || "none",
    last_maintenance: data.last_maintenance || null,
    tags: data.tags || [],
    created_at: pgNow(),
    updated_at: pgNow(),
  };
  inventoryStore.devices.push(device);
  return device;
}

async function updateDevice(id, data) {
  const db = getDb();
  if (db) {
    const existing = await db.query(
      "SELECT * FROM inventory_devices WHERE id = $1",
      [id],
    );
    if (existing.rows.length === 0) {return null;}
    const merged = { ...existing.rows[0], ...data, updated_at: pgNow() };
    const result = await db.query(
      `UPDATE inventory_devices SET name=$1, category_id=$2, brand=$3, model=$4, serial=$5, mac=$6, firmware=$7, ip_address=$8, status=$9, purchase_date=$10, purchase_cost=$11, warranty_expires=$12, location_id=$13, assigned_to=$14, assigned_customer=$15, notes=$16, specs=$17, maintenance_schedule=$18, last_maintenance=$19, tags=$20, updated_at=$21 WHERE id=$22 RETURNING *`,
      [
        merged.name,
        merged.category_id,
        merged.brand,
        merged.model,
        merged.serial,
        merged.mac,
        merged.firmware,
        merged.ip_address,
        merged.status,
        merged.purchase_date,
        merged.purchase_cost,
        merged.warranty_expires,
        merged.location_id,
        merged.assigned_to,
        merged.assigned_customer,
        merged.notes,
        JSON.stringify(merged.specs || {}),
        merged.maintenance_schedule,
        merged.last_maintenance,
        merged.tags || [],
        merged.updated_at,
        id,
      ],
    );
    return result.rows[0];
  }
  const idx = inventoryStore.devices.findIndex((d) => d.id === id);
  if (idx === -1) {return null;}
  inventoryStore.devices[idx] = {
    ...inventoryStore.devices[idx],
    ...data,
    updated_at: pgNow(),
  };
  return inventoryStore.devices[idx];
}

async function deleteDevice(id) {
  const db = getDb();
  if (db) {
    const result = await db.query(
      "DELETE FROM inventory_devices WHERE id = $1 RETURNING *",
      [id],
    );
    return result.rows[0] || null;
  }
  const idx = inventoryStore.devices.findIndex((d) => d.id === id);
  if (idx === -1) {return null;}
  return inventoryStore.devices.splice(idx, 1)[0];
}

async function getDevice(id) {
  const db = getDb();
  if (db) {
    const result = await db.query(
      "SELECT * FROM inventory_devices WHERE id = $1",
      [id],
    );
    return result.rows[0] || null;
  }
  return inventoryStore.devices.find((d) => d.id === id) || null;
}

// ─── Assign Device ───
async function assignDevice(deviceId, customerName, customerId) {
  const db = getDb();
  if (db) {
    const deviceResult = await db.query(
      "SELECT * FROM inventory_devices WHERE id = $1",
      [deviceId],
    );
    if (deviceResult.rows.length === 0) {return null;}
    await db.query(
      "UPDATE inventory_devices SET assigned_to=$1, assigned_customer=$2, status='deployed', updated_at=$3 WHERE id=$4",
      [customerId || customerName, customerName, pgNow(), deviceId],
    );
    const assignId = uuidv4();
    await db.query(
      "INSERT INTO inventory_assignments (id, device_id, assigned_to, customer_name, assigned_at, notes) VALUES ($1,$2,$3,$4,$5,$6)",
      [
        assignId,
        deviceId,
        customerId || customerName,
        customerName,
        pgNow(),
        `Assigned to ${customerName}`,
      ],
    );
    const updated = await db.query(
      "SELECT * FROM inventory_devices WHERE id = $1",
      [deviceId],
    );
    return updated.rows[0];
  }
  const device = inventoryStore.devices.find((d) => d.id === deviceId);
  if (!device) {return null;}
  device.assigned_to = customerId || customerName;
  device.assigned_customer = customerName;
  device.status = "deployed";
  device.updated_at = pgNow();
  inventoryStore.assignments.push({
    id: uuidv4(),
    device_id: deviceId,
    assigned_to: customerId || customerName,
    customer_name: customerName,
    assigned_at: pgNow(),
    notes: `Assigned to ${customerName}`,
  });
  return device;
}

async function unassignDevice(deviceId) {
  const db = getDb();
  if (db) {
    const deviceResult = await db.query(
      "SELECT * FROM inventory_devices WHERE id = $1",
      [deviceId],
    );
    if (deviceResult.rows.length === 0) {return null;}
    await db.query(
      "UPDATE inventory_devices SET assigned_to=NULL, assigned_customer=NULL, status='in-stock', updated_at=$1 WHERE id=$2",
      [pgNow(), deviceId],
    );
    const updated = await db.query(
      "SELECT * FROM inventory_devices WHERE id = $1",
      [deviceId],
    );
    return updated.rows[0];
  }
  const device = inventoryStore.devices.find((d) => d.id === deviceId);
  if (!device) {return null;}
  device.assigned_to = null;
  device.assigned_customer = null;
  device.status = "in-stock";
  device.updated_at = pgNow();
  return device;
}

// ─── Maintenance Logs ───
async function addMaintenanceLog(deviceId, data) {
  const db = getDb();
  const logDate = data.date || pgNow();
  if (db) {
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO inventory_maintenance_logs (id, device_id, type, notes, performed_by, cost, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        id,
        deviceId,
        data.type || "general",
        data.notes || "",
        data.performed_by || "Unknown",
        parseFloat(data.cost) || 0,
        logDate,
      ],
    );
    await db.query(
      "UPDATE inventory_devices SET last_maintenance=$1, updated_at=$2 WHERE id=$3",
      [logDate.split("T")[0], pgNow(), deviceId],
    );
    return result.rows[0];
  }
  const log = {
    id: uuidv4(),
    device_id: deviceId,
    type: data.type || "general",
    notes: data.notes || "",
    performed_by: data.performed_by || "Unknown",
    cost: parseFloat(data.cost) || 0,
    created_at: logDate,
  };
  inventoryStore.maintenanceLogs.unshift(log);
  const device = inventoryStore.devices.find((d) => d.id === deviceId);
  if (device) {
    device.last_maintenance = log.created_at.split("T")[0];
    device.updated_at = pgNow();
  }
  return log;
}

// ─── Alerts ───
async function generateAlerts() {
  const db = getDb();
  const now = new Date();

  if (db) {
    await seedPgDefaults(db);
    await db.query("DELETE FROM inventory_alerts");
    const devices = (await db.query("SELECT * FROM inventory_devices")).rows;
    const newAlerts = [];

    for (const device of devices) {
      if (device.warranty_expires) {
        const warrantyEnd = new Date(device.warranty_expires);
        const daysUntil = (warrantyEnd - now) / (24 * 60 * 60 * 1000);
        if (daysUntil > 0 && daysUntil < 90) {
          newAlerts.push([
            uuidv4(),
            "warranty_expiring",
            device.id,
            device.name,
            `${device.name} warranty expires in ${Math.round(daysUntil)} days (${device.warranty_expires})`,
            daysUntil < 30 ? "critical" : "warning",
            false,
            pgNow(),
          ]);
        }
        if (daysUntil < 0) {
          newAlerts.push([
            uuidv4(),
            "warranty_expired",
            device.id,
            device.name,
            `${device.name} warranty expired on ${device.warranty_expires}`,
            "info",
            false,
            pgNow(),
          ]);
        }
      }
      if (device.maintenance_schedule !== "none" && device.last_maintenance) {
        const lastMaint = new Date(device.last_maintenance);
        const daysSince = (now - lastMaint) / (24 * 60 * 60 * 1000);
        const intervals = {
          monthly: 30,
          quarterly: 90,
          "semi-annual": 180,
          annual: 365,
        };
        const interval = intervals[device.maintenance_schedule] || 365;
        if (daysSince > interval) {
          newAlerts.push([
            uuidv4(),
            "maintenance_overdue",
            device.id,
            device.name,
            `${device.name} maintenance overdue (${Math.round(daysSince - interval)} days past)`,
            "warning",
            false,
            pgNow(),
          ]);
        }
      }
    }

    // Low stock alerts
    const categoryCounts = {};
    for (const d of devices) {
      if (d.status === "in-stock") {
        const key = `${d.category_id}-${d.brand}-${d.model}`;
        categoryCounts[key] = (categoryCounts[key] || 0) + 1;
      }
    }
    for (const [key, count] of Object.entries(categoryCounts)) {
      if (count < 5) {
        const parts = key.split("-");
        const refDevice = devices.find(
          (d) => d.category_id === parts[0] && d.status === "in-stock",
        );
        newAlerts.push([
          uuidv4(),
          "low_stock",
          null,
          refDevice?.name || "Unknown",
          `Low stock: ${refDevice?.brand || ""} ${refDevice?.model || ""} (${count} remaining)`,
          count < 3 ? "critical" : "info",
          false,
          pgNow(),
        ]);
      }
    }

    for (const alert of newAlerts) {
      await db.query(
        "INSERT INTO inventory_alerts (id, type, device_id, device_name, message, severity, acknowledged, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        alert,
      );
    }
    return (
      await db.query("SELECT * FROM inventory_alerts ORDER BY created_at DESC")
    ).rows;
  }

  // In-memory fallback
  inventoryStore.alerts = [];
  for (const device of inventoryStore.devices) {
    if (device.warranty_expires) {
      const warrantyEnd = new Date(device.warranty_expires);
      const daysUntil = (warrantyEnd - now) / (24 * 60 * 60 * 1000);
      if (daysUntil > 0 && daysUntil < 90) {
        inventoryStore.alerts.push({
          id: uuidv4(),
          type: "warranty_expiring",
          device_id: device.id,
          device_name: device.name,
          message: `${device.name} warranty expires in ${Math.round(daysUntil)} days (${device.warranty_expires})`,
          severity: daysUntil < 30 ? "critical" : "warning",
          acknowledged: false,
          created_at: pgNow(),
        });
      }
      if (daysUntil < 0) {
        inventoryStore.alerts.push({
          id: uuidv4(),
          type: "warranty_expired",
          device_id: device.id,
          device_name: device.name,
          message: `${device.name} warranty expired on ${device.warranty_expires}`,
          severity: "info",
          acknowledged: false,
          created_at: pgNow(),
        });
      }
    }
    if (device.maintenance_schedule !== "none" && device.last_maintenance) {
      const lastMaint = new Date(device.last_maintenance);
      const daysSince = (now - lastMaint) / (24 * 60 * 60 * 1000);
      const intervals = {
        monthly: 30,
        quarterly: 90,
        "semi-annual": 180,
        annual: 365,
      };
      const interval = intervals[device.maintenance_schedule] || 365;
      if (daysSince > interval) {
        inventoryStore.alerts.push({
          id: uuidv4(),
          type: "maintenance_overdue",
          device_id: device.id,
          device_name: device.name,
          message: `${device.name} maintenance overdue (${Math.round(daysSince - interval)} days past)`,
          severity: "warning",
          acknowledged: false,
          created_at: pgNow(),
        });
      }
    }
  }
  const categoryCounts = {};
  for (const d of inventoryStore.devices) {
    if (d.status === "in-stock") {
      const key = `${d.category_id}-${d.brand}-${d.model}`;
      categoryCounts[key] = (categoryCounts[key] || 0) + 1;
    }
  }
  for (const [key, count] of Object.entries(categoryCounts)) {
    if (count < 5) {
      const parts = key.split("-");
      const refDevice = inventoryStore.devices.find(
        (d) => d.category_id === parts[0] && d.status === "in-stock",
      );
      inventoryStore.alerts.push({
        id: uuidv4(),
        type: "low_stock",
        device_id: null,
        device_name: refDevice?.name || "Unknown",
        message: `Low stock: ${refDevice?.brand || ""} ${refDevice?.model || ""} (${count} remaining)`,
        severity: count < 3 ? "critical" : "info",
        acknowledged: false,
        created_at: pgNow(),
      });
    }
  }
  return inventoryStore.alerts;
}

// ─── Stats ───
async function getStats() {
  const db = getDb();
  let devices;
  if (db) {
    await seedPgDefaults(db);
    devices = (await db.query("SELECT * FROM inventory_devices")).rows;
  } else {
    devices = inventoryStore.devices;
  }

  const statusCounts = {};
  const categoryCounts = {};
  const brandCounts = {};
  let totalValue = 0;
  let depreciatedValue = 0;

  for (const d of devices) {
    statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
    categoryCounts[d.category_id] = (categoryCounts[d.category_id] || 0) + 1;
    brandCounts[d.brand] = (brandCounts[d.brand] || 0) + 1;
    totalValue += parseFloat(d.purchase_cost) || 0;
    const age =
      (Date.now() - new Date(d.purchase_date).getTime()) /
      (365 * 24 * 60 * 60 * 1000);
    depreciatedValue += Math.max(
      0,
      (parseFloat(d.purchase_cost) || 0) * (1 - age / 5),
    );
  }

  return {
    total_devices: devices.length,
    total_value: totalValue,
    depreciated_value: depreciatedValue,
    by_status: statusCounts,
    by_category: categoryCounts,
    by_brand: brandCounts,
    active_count: statusCounts["active"] || 0,
    in_stock_count: statusCounts["in-stock"] || 0,
    deployed_count: statusCounts["deployed"] || 0,
    in_repair_count: statusCounts["in-repair"] || 0,
    retired_count: statusCounts["retired"] || 0,
  };
}

module.exports = {
  inventoryStore,
  createDevice,
  updateDevice,
  deleteDevice,
  getDevice,
  assignDevice,
  unassignDevice,
  addMaintenanceLog,
  generateAlerts,
  getStats,
};
