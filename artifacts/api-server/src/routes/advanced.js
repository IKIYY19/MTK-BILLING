/**
 * API Routes for: Prepaid Wallet, Map View, Auto Backup
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const walletStore = require("../db/walletStore");
const backupStore = require("../db/backupStore");
const billingData = require("../services/billingData");
const { triggerMessage } = require("./sms");

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// ═══════════════════════════════════════
// PREPAID WALLET
// ═══════════════════════════════════════

router.get("/wallet/all", async (req, res) => {
  await walletStore.autoSetRatesFromPlans();
  res.json(await walletStore.getAllWallets());
});

router.get("/wallet/:customerId", async (req, res) => {
  const wallet = await walletStore.getWallet(req.params.customerId);
  const transactions = await walletStore.getTransactions(req.params.customerId);

  if (!wallet) {
    // Create wallet if doesn't exist
    const newWallet = await walletStore.topUp(req.params.customerId, 0);
    return res.json({ wallet: newWallet.wallet, transactions: [] });
  }

  res.json({ wallet, transactions });
});

router.post("/wallet/:customerId/topup", async (req, res) => {
  const { amount, method = "mpesa", reference } = req.body;
  if (!amount || parseFloat(amount) <= 0)
    {return res.status(400).json({ error: "Invalid amount" });}

  const result = await walletStore.topUp(
    req.params.customerId,
    parseFloat(amount),
    method,
    reference,
  );

  // Send confirmation SMS/WhatsApp
  const customer = await billingData.getCustomerById(req.params.customerId);
  if (customer?.phone) {
    triggerMessage("payment_received", {
      customer,
      payment: { reference: reference || result.transaction.id },
      invoice: { total: amount, paid_amount: amount },
    }).catch((e) => console.error("triggerMessage failed:", e?.message || e));
  }

  res.json(result);
});

router.post("/wallet/:customerId/set-rate", async (req, res) => {
  const { daily_rate } = req.body;
  if (!daily_rate || parseFloat(daily_rate) <= 0)
    {return res.status(400).json({ error: "Invalid rate" });}

  const wallet = await walletStore.setDailyRate(
    req.params.customerId,
    parseFloat(daily_rate),
  );
  if (!wallet) {return res.status(404).json({ error: "Wallet not found" });}

  res.json(wallet);
});

router.post("/wallet/daily-run", async (req, res) => {
  const results = await walletStore.runDailyDeductions();
  res.json(results);
});

// ═══════════════════════════════════════
// MAP / GIS
// ═══════════════════════════════════════

router.get("/map/data", async (req, res) => {
  try {
    const db = global.dbAvailable ? global.db : require("../db/memory");
    const billing = require("../db/billingStore");
    const walletStore = require("../db/walletStore");

    // Get branches from database or fallback to in-memory
    let branches = [];
    if (global.dbAvailable) {
      const branchResult = await db.query(
        "SELECT * FROM branches ORDER BY name",
      );
      branches = branchResult.rows.map((b) => ({
        id: b.id,
        name: b.name,
        type: "branch",
        lat: parseFloat(b.lat),
        lng: parseFloat(b.lng),
        city: b.city,
        status: b.status,
        active_pppoe: b.active_pppoe || 0,
        online_routers: b.online_routers || 0,
        total_routers: b.total_routers || 0,
      }));
    } else {
      const multiStore = require("../db/multiFeatureStore");
      const rawBranches = await multiStore.getBranches();
      branches = rawBranches.map((b) => ({
        id: b.id,
        name: b.name,
        type: "branch",
        lat: b.lat || null,
        lng: b.lng || null,
        city: b.city,
        status: b.status,
        active_pppoe: b.active_pppoe || 0,
        online_routers: b.online_routers || 0,
        total_routers: b.total_routers || 0,
      }));
    }

    // Get customers with coordinates
    let customers = [];
    if (global.dbAvailable) {
      const customerResult = await db.query(
        `SELECT c.id, c.name, c.lat, c.lng, c.phone, c.status, c.branch_id,
         s.plan_id, s.status as sub_status, s.throttled
         FROM customers c
         LEFT JOIN subscriptions s ON s.customer_id = c.id AND s.status = 'active'
         WHERE c.lat IS NOT NULL AND c.lng IS NOT NULL`,
      );

      const plans = await db.query("SELECT id, name FROM service_plans");
      const planMap = new Map(plans.rows.map((p) => [p.id, p.name]));

      customers = customerResult.rows.map((c) => ({
        id: c.id,
        name: c.name,
        type: "customer",
        lat: parseFloat(c.lat),
        lng: parseFloat(c.lng),
        status:
          c.status === "suspended"
            ? "suspended"
            : c.throttled
              ? "throttled"
              : "active",
        phone: c.phone,
        plan: c.plan_id ? planMap.get(c.plan_id) : null,
        branch_id: c.branch_id,
      }));
    } else {
      const allCustomers = await billingData.listCustomers();
      const allSubscriptions = await billingData.listSubscriptions();
      const allPlans = await billingData.listPlans();

      customers = await Promise.all(
        allCustomers.map(async (c) => {
          const sub = allSubscriptions.find(
            (s) => s.customer_id === c.id && s.status === "active",
          );
          const wallet = await walletStore.getWallet(c.id);
          const isSuspended =
            sub?.status === "suspended" || wallet?.status === "suspended";
          const isThrottled = sub?.throttled;
          const plan = sub?.plan_id ? allPlans.find((p) => p.id === sub.plan_id) : null;

          return {
            id: c.id,
            name: c.name,
            type: "customer",
            lat: c.lat || null,
            lng: c.lng || null,
            status: isSuspended
              ? "suspended"
              : isThrottled
                ? "throttled"
                : "active",
            phone: c.phone,
            plan: plan?.name || null,
            branch_id: c.branch_id,
          };
        }),
      );
    }

    // Towers (infrastructure)
    let towers = [];
    try {
      const towerResult = await db.query(
        "SELECT * FROM towers ORDER BY name"
      );
      towers = towerResult.rows.map(t => ({
        id: t.id, name: t.name, type: "tower",
        lat: parseFloat(t.lat), lng: parseFloat(t.lng),
        height: t.height, coverage_radius: t.coverage_radius || 5000,
        customer_count: t.customer_count || 0,
      }));
    } catch(e) { towers = []; }

    // Calculate center point from all locations
    const allLats = [
      ...branches.map((b) => b.lat),
      ...customers.map((c) => c.lat),
      ...towers.map((t) => t.lat),
    ];
    const allLngs = [
      ...branches.map((b) => b.lng),
      ...customers.map((c) => c.lng),
      ...towers.map((t) => t.lng),
    ];
    const centerLat =
      allLats.length > 0
        ? allLats.reduce((a, b) => a + b, 0) / allLats.length
        : -1.2921;
    const centerLng =
      allLngs.length > 0
        ? allLngs.reduce((a, b) => a + b, 0) / allLngs.length
        : 36.8219;

    res.json({ branches, customers, towers, center: [centerLat, centerLng], zoom: 10 });
  } catch (e) {
    console.error("Map data error:", e);
    res.status(500).json({ error: e.message });
  }
});

router.put("/map/customer/:id", async (req, res) => {
  const customer = await billingData.getCustomerById(req.params.id);
  if (!customer) {return res.status(404).json({ error: "Customer not found" });}

  if (req.body.lat !== undefined) {customer.lat = req.body.lat;}
  if (req.body.lng !== undefined) {customer.lng = req.body.lng;}

  res.json(customer);
});

// ═══════════════════════════════════════
// AUTO BACKUP
// ═══════════════════════════════════════

router.get("/backup/schedules", async (req, res) => {
  res.json(await backupStore.getAllSchedules());
});

router.get("/backup/schedules/:id", async (req, res) => {
  const schedule = await backupStore.getSchedule(req.params.id);
  if (!schedule) {return res.status(404).json({ error: "Schedule not found" });}
  res.json(schedule);
});

router.post("/backup/schedules", async (req, res) => {
  const schedule = await backupStore.createSchedule(req.body);
  res.status(201).json(schedule);
});

router.put("/backup/schedules/:id", async (req, res) => {
  const schedule = await backupStore.updateSchedule(req.params.id, req.body);
  if (!schedule) {return res.status(404).json({ error: "Schedule not found" });}
  res.json(schedule);
});

router.delete("/backup/schedules/:id", async (req, res) => {
  const schedule = await backupStore.deleteSchedule(req.params.id);
  if (!schedule) {return res.status(404).json({ error: "Schedule not found" });}
  res.json({ message: "Schedule deleted" });
});

router.post("/backup/schedules/:id/run", async (req, res) => {
  const result = await backupStore.runBackup(req.params.id);
  res.json(result);
});

router.post("/backup/run-all", async (req, res) => {
  const results = await backupStore.runAllBackups();
  res.json(results);
});

router.get("/backup/backups", async (req, res) => {
  const backups = await backupStore.getBackups(
    req.query.schedule_id,
    parseInt(req.query.limit) || 50,
  );
  res.json(backups);
});

router.get("/backup/backups/:id", async (req, res) => {
  const content = await backupStore.getBackupContent(req.params.id);
  if (!content) {return res.status(404).json({ error: "Backup not found" });}
  res.json(content);
});

router.post("/backup/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const file = req.file;

  // Read file content
  const content = file.buffer.toString("utf-8");

  // Create backup entry
  const backup = await backupStore.createUploadedBackup({
    device_name: file.originalname.replace(/\.(rsc|backup)$/, ""),
    ip_address: "uploaded",
    config_content: content,
    file_size: file.size,
    status: "success",
  });

  res.json(backup);
});

router.post("/backup/restore/:id", async (req, res) => {
  const { target_ip, target_port, target_username, target_password } = req.body;

  if (!target_ip || !target_username || !target_password) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const backup = await backupStore.getBackupContent(req.params.id);
    if (!backup) {
      return res.status(404).json({ error: "Backup not found" });
    }

    const scriptText = backup.content || "";
    
    // Import deployer to validate script
    const mikrotikDeployer = require("../services/mikrotikDeployer");
    const validation = mikrotikDeployer.validateScript(scriptText);
    if (!validation.valid) {
      return res.status(400).json({ 
        error: "Script validation failed due to safety checks", 
        errors: validation.errors 
      });
    }

    const port = Number(target_port) || 8728;
    let result = { success: false, error: "Unsupported port or protocol" };

    if (port === 22 || port === 2222) {
      // SSH protocol
      const mikrotikSSH = require("../services/mikrotikSSH");
      const connection = await mikrotikSSH.createConnection({
        host: target_ip,
        port,
        username: target_username,
        password: target_password,
      });
      try {
        result = await mikrotikSSH.executeScript(connection.id, scriptText);
      } finally {
        await mikrotikSSH.removeConnection(connection.id).catch(() => {});
      }
    } else if (port === 80 || port === 443 || port === 8080) {
      // REST API protocol
      const mikrotikRest = require("../services/mikrotikRest");
      const connection = mikrotikRest.createConnection({
        host: target_ip,
        port,
        username: target_username,
        password: target_password,
        useSSL: port === 443,
      });
      try {
        result = await mikrotikRest.executeScript(connection.id, scriptText);
      } finally {
        mikrotikRest.removeConnection(connection.id);
      }
    } else if (port === 8728 || port === 8729) {
      // RouterOS API protocol
      const routerConnectionManager = require("../services/routerConnectionManager");
      const device = {
        ip_address: target_ip,
        api_port: port,
        username: target_username,
        password: target_password,
        connection_type: port === 8729 ? "api-ssl" : "api",
      };
      
      const scriptName = `restore_${Date.now()}`;
      try {
        await routerConnectionManager.executeCommand(device, "/system/script/add", {
          name: scriptName,
          source: scriptText,
        });
        
        await routerConnectionManager.executeCommand(device, "/system/script/run", {
          number: scriptName,
        });
        
        result = { success: true };
      } catch (err) {
        result = { success: false, error: err.message };
      } finally {
        await routerConnectionManager.executeCommand(device, "/system/script/remove", {
          numbers: scriptName,
        }).catch(() => {});
      }
    }

    if (result.success) {
      return res.json({ 
        message: "Backup script restored successfully", 
        backup_id: req.params.id,
        details: result
      });
    } else {
      return res.status(500).json({ 
        error: result.error || "Failed to execute restore script", 
        details: result 
      });
    }
  } catch (error) {
    console.error("Backup restoration error:", error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
