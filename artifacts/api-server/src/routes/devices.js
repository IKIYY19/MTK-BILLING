const express = require("express");
const { getDb } = require("../db");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const provisionStore = require("../db/provisionStore");
const memoryDb = require("../db/memory");
const zeroTouchBilling = require("../services/zeroTouchBilling");
const enrollmentMemoryStore = require("../services/enrollmentMemoryStore");



function toSafeDevice(device) {
  if (!device) {return null;}
  const { mgmt_password_encrypted, radius_secret, ...safe } = device;
  return safe;
}

function normalizeStringList(value, fallback = []) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return fallback;
}

async function scanMikroTikRouter({
  ip_address,
  api_port,
  mgmt_port,
  username,
  password,
}) {
  if (!ip_address) {
    throw new Error("Router IP / host is required for scan");
  }

  if (!username || !password) {
    throw new Error("Router username and password are required for scan");
  }

  const routerConnectionManager = require("../services/routerConnectionManager");
  const port = Number(api_port || mgmt_port || 8728);
  const config = { ip_address, api_port: port, username, password };

  try {
    const resources = await routerConnectionManager.print(config, "/system/resource");
    const identities = await routerConnectionManager.print(config, "/system/identity");
    const interfaces = await routerConnectionManager.print(
      config,
      "/interface",
      ".id,name,type,mac-address,disabled,running,default-name,comment",
    );
    const addresses = await routerConnectionManager.print(
      config,
      "/ip/address",
      ".id,address,interface,disabled,comment",
    );

    const normalizedInterfaces = interfaces.map((iface) => ({
      id: iface[".id"] || iface.id || iface.name,
      name: iface.name,
      default_name: iface["default-name"] || "",
      type: iface.type || "",
      mac_address: iface["mac-address"] || "",
      disabled: iface.disabled === "true",
      running: iface.running === "true",
      comment: iface.comment || "",
      addresses: addresses
        .filter((address) => address.interface === iface.name)
        .map((address) => address.address),
    }));

    const usablePorts = normalizedInterfaces
      .filter(
        (iface) =>
          !iface.disabled &&
          ["ether", "vlan", "wlan", "bridge"].some((type) =>
            iface.type.includes(type),
          ),
      )
      .map((iface) => iface.name);

    const suggestedWan =
      usablePorts.find((name) => name === "ether1") ||
      usablePorts[0] ||
      "ether1";
    const suggestedLanPorts = usablePorts.filter(
      (name) => name !== suggestedWan,
    );

    return {
      success: true,
      host: ip_address,
      port,
      identity: identities[0]?.name || "",
      model: resources[0]?.["board-name"] || resources[0]?.platform || "",
      version: resources[0]?.version || "",
      uptime: resources[0]?.uptime || "",
      cpu: resources[0]?.cpu || "",
      interfaces: normalizedInterfaces,
      ip_addresses: addresses,
      suggested: {
        wan_interface: suggestedWan,
        lan_interface: "bridge1",
        lan_ports: suggestedLanPorts,
      },
    };
  } finally {
    routerConnectionManager.closeConnection(config.id || config.ip_address);
  }
}

function getServerBaseUrl(req, explicitBaseUrl) {
  return (
    explicitBaseUrl ||
    process.env.PUBLIC_APP_URL ||
    `${req.protocol}://${req.get("host")}`
  );
}

function generateEnrollmentToken() {
  return `enroll-${require("crypto").randomBytes(32).toString("hex")}`;
}

function generateMgmtPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let pw = "";
  for (let i = 0; i < 12; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)];
  }
  return pw;
}

function buildEnrollmentBootstrapCommand(serverUrl, token, mgmtPassword) {
  const cleanBaseUrl = serverUrl.replace(/\/$/, "");
  let scriptUrl = `${cleanBaseUrl}/mikrotik/enroll/bootstrap/${token}`;
  if (mgmtPassword) {
    scriptUrl += "?mgmt_pass=" + encodeURIComponent(mgmtPassword);
  }
  return `${provisionStore.buildFetchCommand(scriptUrl, "ztp-enroll.rsc", true)}; /import file-name=ztp-enroll.rsc; /file remove ztp-enroll.rsc`;
}

async function createEnrollmentToken(req, options = {}) {
  const token = generateEnrollmentToken();
  const expiresHours = Number(options.expires_hours || 24);
  const expiresAt = new Date(
    Date.now() + expiresHours * 60 * 60 * 1000,
  ).toISOString();
  const mgmtPassword = generateMgmtPassword();
  const metadata = {
    mgmt_password: mgmtPassword,
    label: options.label || "",
    notes: options.notes || "",
  };

  if (!global.dbAvailable) {
    const memoryToken = {
      id: uuidv4(),
      token,
      status: "pending",
      expires_at: expiresAt,
      used_at: null,
      router_id: null,
      created_by: req.user?.id || null,
      metadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    enrollmentMemoryStore.tokens.push(memoryToken);
    return memoryToken;
  }

  const result = await getDb().query(
    `INSERT INTO enrollment_tokens (id, token, status, expires_at, created_by, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING *`,
    [
      uuidv4(),
      token,
      "pending",
      expiresAt,
      req.user?.id || null,
      JSON.stringify(metadata),
    ],
  );

  return result.rows[0];
}

function parseJsonField(value, fallback) {
  if (!value) {
    return fallback;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function parseTokenMetadata(tokenRecord) {
  return parseJsonField(tokenRecord?.metadata, {});
}

async function getEnrollmentTokenByValue(token) {
  if (!token) {
    return null;
  }

  if (!global.dbAvailable) {
    return (
      enrollmentMemoryStore.tokens.find((record) => record.token === token) ||
      null
    );
  }

  const result = await getDb().query(
    "SELECT * FROM enrollment_tokens WHERE token = $1",
    [token],
  );
  return result.rows[0] || null;
}

async function getDiscoveredManagementCredentials(discovered, overrides = {}) {
  const tokenRecord = await getEnrollmentTokenByValue(
    discovered?.enrollment_token,
  );
  const metadata = parseTokenMetadata(tokenRecord);
  const password =
    overrides.mgmt_password ||
    discovered?.mgmt_password ||
    metadata.mgmt_password ||
    null;
  const username =
    overrides.mgmt_username ||
    discovered?.mgmt_username ||
    metadata.mgmt_username ||
    (password ? "admin" : "");

  return { username, password };
}

function normalizeDiscoveredRouter(row) {
  return {
    ...row,
    interfaces: parseJsonField(row.interfaces, []),
    ip_addresses: parseJsonField(row.ip_addresses, []),
    raw_payload: parseJsonField(row.raw_payload, {}),
    suggested_lan_ports: normalizeStringList(row.suggested_lan_ports, []),
  };
}

async function listDiscoveredRouters(status = null) {
  if (!global.dbAvailable) {
    return enrollmentMemoryStore.discovered
      .filter((router) => !status || router.status === status)
      .sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))
      .map(normalizeDiscoveredRouter);
  }

  const params = [];
  let query = "SELECT * FROM discovered_routers";

  if (status) {
    query += " WHERE status = $1";
    params.push(status);
  }

  query += " ORDER BY last_seen_at DESC";

  const result = await getDb().query(query, params);
  return result.rows.map(normalizeDiscoveredRouter);
}

async function getDiscoveredRouter(discoveredId) {
  if (!global.dbAvailable) {
    return (
      enrollmentMemoryStore.discovered.find(
        (router) => router.id === discoveredId,
      ) || null
    );
  }

  const result = await getDb().query(
    "SELECT * FROM discovered_routers WHERE id = $1",
    [discoveredId],
  );
  return result.rows[0] ? normalizeDiscoveredRouter(result.rows[0]) : null;
}

async function markDiscoveredApproved(discoveredId, routerId) {
  if (!global.dbAvailable) {
    const discovered = enrollmentMemoryStore.discovered.find(
      (router) => router.id === discoveredId,
    );
    if (discovered) {
      discovered.router_id = routerId;
      discovered.status = "approved";
      discovered.approved_at = new Date().toISOString();
      discovered.updated_at = new Date().toISOString();
    }
    return;
  }

  await getDb().query(
    `UPDATE discovered_routers
     SET router_id = $1,
         status = $2,
         approved_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [routerId, "approved", discoveredId],
  );
}

// GET all devices
router.get("/", async (req, res) => {
  try {
    const { project_id } = req.query;
    let result;
    if (project_id) {
      result = await getDb().query(
        "SELECT * FROM routers WHERE project_id = $1 ORDER BY created_at DESC",
        [project_id],
      );
    } else {
      result = await getDb().query(
        "SELECT * FROM routers ORDER BY created_at DESC",
        [],
      );
    }
    res.json(result.rows.map(toSafeDevice));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST scan MikroTik router before creating/updating zero-touch device
router.post("/scan", async (req, res) => {
  try {
    const scan = await scanMikroTikRouter(req.body || {});
    res.json(scan);
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
      message:
        "Scan failed. Ensure the API service is enabled, credentials are correct, and this server can reach the router.",
    });
  }
});

// POST create a one-time enrollment token and bootstrap command
router.post("/enrollment-token", async (req, res) => {
  try {
    const { baseUrl, expires_hours, label, notes } = req.body || {};
    const enrollment = await createEnrollmentToken(req, {
      expires_hours,
      label,
      notes,
    });
    const serverUrl = getServerBaseUrl(req, baseUrl);
    const meta = typeof enrollment.metadata === "string"
      ? JSON.parse(enrollment.metadata || "{}")
      : (enrollment.metadata || {});
    const mgmtPassword = meta.mgmt_password || "";
    const bootstrapCommand = buildEnrollmentBootstrapCommand(
      serverUrl,
      enrollment.token,
      mgmtPassword,
    );

    res.status(201).json({
      success: true,
      enrollment,
      mgmt_password: mgmtPassword,
      serverUrl,
      bootstrap_command: bootstrapCommand,
      copyText: bootstrapCommand,
      message:
        "Enrollment token created. Run the bootstrap command on the MikroTik router.",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET routers that enrolled and are waiting for approval
router.get("/discovered", async (req, res) => {
  try {
    const discovered = await listDiscoveredRouters(req.query.status || null);
    res.json(discovered);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE a discovered router
router.delete("/discovered/:id", async (req, res) => {
  try {
    const discoveredId = req.params.id;

    if (!global.dbAvailable) {
      const idx = enrollmentMemoryStore.discovered.findIndex(
        (r) => r.id === discoveredId,
      );
      if (idx === -1) {
        return res.status(404).json({ error: "Discovered router not found" });
      }
      enrollmentMemoryStore.discovered.splice(idx, 1);
      return res.json({ success: true });
    }

    const result = await getDb().query(
      "DELETE FROM discovered_routers WHERE id = $1 RETURNING id",
      [discoveredId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Discovered router not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Delete discovered router error:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST approve a discovered router and create a managed zero-touch device
router.post("/discovered/:id/approve", async (req, res) => {
  try {
    const discovered = await getDiscoveredRouter(req.params.id);

    if (!discovered) {
      return res.status(404).json({ error: "Discovered router not found" });
    }

    if (discovered.status === "approved" && discovered.router_id) {
      return res.status(409).json({
        error: "Discovered router is already approved",
        router_id: discovered.router_id,
      });
    }

    const {
      name,
      wan_interface,
      lan_interface,
      lan_ports,
      dns_servers,
      ntp_servers,
      radius_server,
      radius_secret,
      radius_port,
      hotspot_enabled,
      pppoe_enabled,
      pppoe_interface,
      pppoe_service_name,
      mgmt_port,
      mgmt_username,
      mgmt_password,
      connection_type,
      notes,
      wireguard_tunnel_ip,
      wireguard_listen_port,
    } = req.body || {};

    const routerId = uuidv4();
    const provisionToken = provisionStore.generateToken();
    const managementCredentials = await getDiscoveredManagementCredentials(
      discovered,
      { mgmt_username, mgmt_password },
    );
    const encryptedMgmtPassword = managementCredentials.password
      ? zeroTouchBilling.encryptForMikrotik(managementCredentials.password)
      : null;

    const selectedLanPorts = normalizeStringList(
      lan_ports,
      discovered.suggested_lan_ports?.length
        ? discovered.suggested_lan_ports
        : ["ether2", "ether3", "ether4", "ether5"],
    );

    const result = await getDb().query(
      `INSERT INTO routers (id, project_id, name, identity, model, mac_address, ip_address,
       wan_interface, lan_interface, lan_ports, provision_token, provision_status,
       dns_servers, ntp_servers, radius_server, radius_secret, radius_port,
       hotspot_enabled, pppoe_enabled, pppoe_interface, pppoe_service_name,
       mgmt_port, mgmt_username, mgmt_password_encrypted, connection_type, notes,
       wireguard_tunnel_ip, wireguard_listen_port)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
       RETURNING *`,
      [
        routerId,
        null,
        name ||
          discovered.identity ||
          `Discovered Router ${discovered.primary_mac || discovered.source_ip || ""}`.trim(),
        discovered.identity || name || "MikroTik Router",
        discovered.model || "",
        discovered.primary_mac || "",
        discovered.source_ip || "",
        wan_interface || discovered.suggested_wan_interface || "ether1",
        lan_interface || discovered.suggested_lan_interface || "bridge1",
        selectedLanPorts,
        provisionToken,
        "pending",
        dns_servers || ["8.8.8.8", "8.8.4.4"],
        ntp_servers || ["pool.ntp.org"],
        radius_server || "",
        radius_secret || "",
        radius_port || 1812,
        hotspot_enabled || false,
        pppoe_enabled || false,
        pppoe_interface || "",
        pppoe_service_name || "",
        mgmt_port || 8728,
        managementCredentials.username,
        encryptedMgmtPassword,
        connection_type || "api",
        notes ||
          `Approved from enrollment token ${discovered.enrollment_token}`,
        wireguard_tunnel_ip || "",
        wireguard_listen_port ? Number(wireguard_listen_port) : 13231,
      ],
    );

    await markDiscoveredApproved(discovered.id, routerId);

    if (global.dbAvailable) {
      await getDb().query(
        `UPDATE enrollment_tokens
         SET status = $1,
             used_at = CURRENT_TIMESTAMP,
             router_id = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE token = $3`,
        ["approved", routerId, discovered.enrollment_token],
      );
    } else {
      const memoryToken = enrollmentMemoryStore.tokens.find(
        (token) => token.token === discovered.enrollment_token,
      );
      if (memoryToken) {
        memoryToken.status = "approved";
        memoryToken.used_at = new Date().toISOString();
        memoryToken.router_id = routerId;
        memoryToken.updated_at = new Date().toISOString();
      }
    }

    res.status(201).json({
      success: true,
      router: toSafeDevice(result.rows[0]),
      provision_token: provisionToken,
      message: "Discovered router approved and device created",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single device
router.get("/:id", async (req, res) => {
  try {
    const result = await getDb().query("SELECT * FROM routers WHERE id = $1", [
      req.params.id,
    ]);
    if (result.rows.length === 0)
      {return res.status(404).json({ error: "Device not found" });}
    res.json(toSafeDevice(result.rows[0]));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET device provision logs
router.get("/:id/logs", async (req, res) => {
  try {
    const result = await getDb().query(
      "SELECT * FROM provision_logs WHERE router_id = $1 ORDER BY created_at DESC LIMIT 50",
      [req.params.id],
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET provision script preview
router.get("/:id/script", async (req, res) => {
  try {
    const result = await getDb().query("SELECT * FROM routers WHERE id = $1", [
      req.params.id,
    ]);
    if (result.rows.length === 0)
      {return res.status(404).json({ error: "Device not found" });}
    const baseUrl =
      process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get("host")}`;
    const script = provisionStore.generateProvisionScript(result.rows[0], {
      callbackBaseUrl: baseUrl,
      wireguard_endpoint: process.env.WIREGUARD_ENDPOINT,
      wireguard_server_pubkey: process.env.WIREGUARD_SERVER_PUBKEY,
      wireguard_tunnel_ip: result.rows[0].wireguard_tunnel_ip,
    });
    res.json({ script });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE device
router.post("/", async (req, res) => {
  try {
    const {
      project_id,
      name,
      identity,
      model,
      mac_address,
      ip_address,
      wan_interface,
      lan_interface,
      lan_ports,
      dns_servers,
      ntp_servers,
      radius_server,
      radius_secret,
      radius_port,
      hotspot_enabled,
      pppoe_enabled,
      pppoe_interface,
      pppoe_service_name,
      mgmt_port,
      mgmt_username,
      mgmt_password,
      connection_type,
      notes,
      wireguard_tunnel_ip,
      wireguard_listen_port,
    } = req.body;

    const id = uuidv4();
    const token = provisionStore.generateToken();
    const encryptedMgmtPassword = mgmt_password
      ? zeroTouchBilling.encryptForMikrotik(mgmt_password)
      : null;

    const result = await getDb().query(
      `INSERT INTO routers (id, project_id, name, identity, model, mac_address, ip_address,
       wan_interface, lan_interface, lan_ports, provision_token, provision_status,
       dns_servers, ntp_servers, radius_server, radius_secret, radius_port,
       hotspot_enabled, pppoe_enabled, pppoe_interface, pppoe_service_name,
       mgmt_port, mgmt_username, mgmt_password_encrypted, connection_type, notes,
       wireguard_tunnel_ip, wireguard_listen_port)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
       RETURNING *`,
      [
        id,
        project_id,
        name,
        identity || name,
        model || "",
        mac_address || "",
        ip_address || "",
        wan_interface || "ether1",
        lan_interface || "bridge1",
        normalizeStringList(lan_ports, [
          "ether2",
          "ether3",
          "ether4",
          "ether5",
        ]),
        token,
        "pending",
        dns_servers || ["8.8.8.8", "8.8.4.4"],
        ntp_servers || ["pool.ntp.org"],
        radius_server || "",
        radius_secret || "",
        radius_port || 1812,
        hotspot_enabled || false,
        pppoe_enabled || false,
        pppoe_interface || "",
        pppoe_service_name || "",
        mgmt_port || 8728,
        mgmt_username || "",
        encryptedMgmtPassword,
        connection_type || "api",
        notes || "",
        wireguard_tunnel_ip || "",
        wireguard_listen_port ? Number(wireguard_listen_port) : 13231,
      ],
    );

    res.status(201).json(toSafeDevice(result.rows[0]));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE device
router.put("/:id", async (req, res) => {
  try {
    const {
      name,
      identity,
      model,
      mac_address,
      ip_address,
      wan_interface,
      lan_interface,
      lan_ports,
      dns_servers,
      ntp_servers,
      radius_server,
      radius_secret,
      radius_port,
      hotspot_enabled,
      pppoe_enabled,
      pppoe_interface,
      pppoe_service_name,
      mgmt_port,
      mgmt_username,
      mgmt_password,
      connection_type,
      notes,
      wireguard_tunnel_ip,
      wireguard_listen_port,
    } = req.body;

    const existing = await getDb().query(
      "SELECT * FROM routers WHERE id = $1",
      [req.params.id],
    );
    if (existing.rows.length === 0)
      {return res.status(404).json({ error: "Device not found" });}

    const r = existing.rows[0];
    const encryptedMgmtPassword = mgmt_password
      ? zeroTouchBilling.encryptForMikrotik(mgmt_password)
      : r.mgmt_password_encrypted;
    const result = await getDb().query(
      `UPDATE routers SET
        name = COALESCE($1, name), identity = COALESCE($2, identity),
        model = COALESCE($3, model), mac_address = COALESCE($4, mac_address),
        ip_address = COALESCE($5, ip_address), wan_interface = COALESCE($6, wan_interface),
        lan_interface = COALESCE($7, lan_interface), lan_ports = COALESCE($8, lan_ports),
        dns_servers = COALESCE($9, dns_servers), ntp_servers = COALESCE($10, ntp_servers),
        radius_server = COALESCE($11, radius_server),
        radius_secret = COALESCE($12, radius_secret), radius_port = COALESCE($13, radius_port),
        hotspot_enabled = COALESCE($14, hotspot_enabled), pppoe_enabled = COALESCE($15, pppoe_enabled),
        pppoe_interface = COALESCE($16, pppoe_interface), pppoe_service_name = COALESCE($17, pppoe_service_name),
        mgmt_port = COALESCE($18, mgmt_port), mgmt_username = COALESCE($19, mgmt_username),
        mgmt_password_encrypted = COALESCE($20, mgmt_password_encrypted), connection_type = COALESCE($21, connection_type),
        notes = COALESCE($22, notes),
        wireguard_tunnel_ip = COALESCE($23, wireguard_tunnel_ip),
        wireguard_listen_port = COALESCE($24, wireguard_listen_port),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $25 RETURNING *`,
      [
        name || r.name,
        identity || r.identity,
        model || r.model,
        mac_address || r.mac_address,
        ip_address || r.ip_address,
        wan_interface || r.wan_interface,
        lan_interface || r.lan_interface,
        lan_ports !== undefined
          ? normalizeStringList(lan_ports, r.lan_ports || [])
          : r.lan_ports,
        dns_servers || r.dns_servers,
        ntp_servers || r.ntp_servers,
        radius_server !== undefined ? radius_server : r.radius_server,
        radius_secret !== undefined ? radius_secret : r.radius_secret,
        radius_port || r.radius_port,
        hotspot_enabled !== undefined ? hotspot_enabled : r.hotspot_enabled,
        pppoe_enabled !== undefined ? pppoe_enabled : r.pppoe_enabled,
        pppoe_interface || r.pppoe_interface,
        pppoe_service_name || r.pppoe_service_name,
        mgmt_port || r.mgmt_port,
        mgmt_username !== undefined ? mgmt_username : r.mgmt_username,
        encryptedMgmtPassword,
        connection_type || r.connection_type || "api",
        notes !== undefined ? notes : r.notes,
        wireguard_tunnel_ip !== undefined ? wireguard_tunnel_ip : r.wireguard_tunnel_ip,
        wireguard_listen_port !== undefined ? (wireguard_listen_port ? Number(wireguard_listen_port) : null) : r.wireguard_listen_port,
        req.params.id,
      ],
    );

    res.json(toSafeDevice(result.rows[0]));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// REGENERATE token
router.post("/:id/regenerate-token", async (req, res) => {
  try {
    const token = provisionStore.generateToken();
    const result = await getDb().query(
      `UPDATE routers
       SET provision_token = $1,
           provision_status = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, provision_token, provision_status`,
      [token, "pending", req.params.id],
    );
    if (result.rows.length === 0)
      {return res.status(404).json({ error: "Device not found" });}
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ACTIVATE router as billing-linked MikroTik connection
router.post("/:id/activate-billing", async (req, res) => {
  try {
    const activation = await zeroTouchBilling.activateRouterInBilling(
      req.params.id,
      req.body || {},
    );
    if (!activation.success) {
      return res.status(400).json(activation);
    }
    res.json({
      ...activation,
      router: toSafeDevice(activation.router),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE device
router.delete("/:id", async (req, res) => {
  try {
    const result = await getDb().query(
      "DELETE FROM routers WHERE id = $1 RETURNING id",
      [req.params.id],
    );
    if (result.rows.length === 0)
      {return res.status(404).json({ error: "Device not found" });}
    res.json({ message: "Device deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET count of discovered routers still in 'discovered' status
router.get("/discovered/count", async (req, res) => {
  try {
    if (!global.dbAvailable) {
      const count = enrollmentMemoryStore.discovered.filter(
        (r) => r.status === "discovered" || !r.status,
      ).length;
      return res.json({ count });
    }
    const result = await getDb().query(
      "SELECT COUNT(*) as count FROM discovered_routers WHERE status = 'discovered'",
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all provision logs across all routers, most recent first, limited to 100
router.get("/logs", async (req, res) => {
  try {
    if (!global.dbAvailable) {
      const logs = (provisionStore.store.provision_logs || [])
        .slice()
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 100)
        .map((log) => {
          const router = provisionStore.store.routers.find(
            (r) => r.id === log.router_id,
          );
          return {
            ...log,
            router_name: router ? router.name : null,
            router_identity: router ? router.identity : null,
          };
        });
      return res.json(logs);
    }
    const result = await getDb().query(
      `SELECT pl.*, r.name AS router_name, r.identity AS router_identity
       FROM provision_logs pl
       LEFT JOIN routers r ON pl.router_id = r.id
       ORDER BY pl.created_at DESC
       LIMIT 100`,
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST batch-approve multiple discovered routers with a shared config
router.post("/discovered/batch-approve", async (req, res) => {
  try {
    const { ids, config } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids must be a non-empty array" });
    }
    if (!config || typeof config !== "object") {
      return res.status(400).json({ error: "config object is required" });
    }

    const succeeded = [];
    const failed = [];

    for (const discoveredId of ids) {
      try {
        const discovered = await getDiscoveredRouter(discoveredId);

        if (!discovered) {
          failed.push({
            id: discoveredId,
            error: "Discovered router not found",
          });
          continue;
        }

        if (discovered.status === "approved" && discovered.router_id) {
          failed.push({
            id: discoveredId,
            error: "Already approved",
            router_id: discovered.router_id,
          });
          continue;
        }

        const routerId = uuidv4();
        const provisionToken = provisionStore.generateToken();
        const managementCredentials = await getDiscoveredManagementCredentials(
          discovered,
          {
            mgmt_username: config.mgmt_username,
            mgmt_password: config.mgmt_password,
          },
        );
        const encryptedMgmtPassword = managementCredentials.password
          ? zeroTouchBilling.encryptForMikrotik(managementCredentials.password)
          : null;

        const selectedLanPorts = normalizeStringList(
          config.lan_ports,
          discovered.suggested_lan_ports?.length
            ? discovered.suggested_lan_ports
            : ["ether2", "ether3", "ether4", "ether5"],
        );

        const result = await getDb().query(
          `INSERT INTO routers (id, project_id, name, identity, model, mac_address, ip_address,
           wan_interface, lan_interface, lan_ports, provision_token, provision_status,
           dns_servers, ntp_servers, radius_server, radius_secret, radius_port,
           hotspot_enabled, pppoe_enabled, pppoe_interface, pppoe_service_name,
           mgmt_port, mgmt_username, mgmt_password_encrypted, connection_type, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
           RETURNING *`,
          [
            routerId,
            null,
            config.name ||
              discovered.identity ||
              `Discovered Router ${discovered.primary_mac || discovered.source_ip || ""}`.trim(),
            discovered.identity || config.name || "MikroTik Router",
            discovered.model || "",
            discovered.primary_mac || "",
            discovered.source_ip || "",
            config.wan_interface ||
              discovered.suggested_wan_interface ||
              "ether1",
            config.lan_interface ||
              discovered.suggested_lan_interface ||
              "bridge1",
            selectedLanPorts,
            provisionToken,
            "pending",
            config.dns_servers || ["8.8.8.8", "8.8.4.4"],
            config.ntp_servers || ["pool.ntp.org"],
            config.radius_server || "",
            config.radius_secret || "",
            config.radius_port || 1812,
            config.hotspot_enabled || false,
            config.pppoe_enabled || false,
            config.pppoe_interface || "",
            config.pppoe_service_name || "",
            config.mgmt_port || 8728,
            managementCredentials.username,
            encryptedMgmtPassword,
            config.connection_type || "api",
            config.notes ||
              `Approved from enrollment token ${discovered.enrollment_token}`,
          ],
        );

        await markDiscoveredApproved(discovered.id, routerId);

        if (global.dbAvailable) {
          await getDb().query(
            `UPDATE enrollment_tokens
             SET status = $1,
                 used_at = CURRENT_TIMESTAMP,
                 router_id = $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE token = $3`,
            ["approved", routerId, discovered.enrollment_token],
          );
        } else {
          const memoryToken = enrollmentMemoryStore.tokens.find(
            (token) => token.token === discovered.enrollment_token,
          );
          if (memoryToken) {
            memoryToken.status = "approved";
            memoryToken.used_at = new Date().toISOString();
            memoryToken.router_id = routerId;
            memoryToken.updated_at = new Date().toISOString();
          }
        }

        succeeded.push({
          id: discoveredId,
          router_id: routerId,
          provision_token: provisionToken,
          router: toSafeDevice(result.rows[0]),
        });
      } catch (err) {
        failed.push({ id: discoveredId, error: err.message });
      }
    }

    res.status(201).json({
      succeeded,
      failed,
      total_succeeded: succeeded.length,
      total_failed: failed.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
