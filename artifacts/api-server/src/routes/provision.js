const express = require("express");
const { getDb } = require("../db");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const logger = require("../utils/logger");
const provisionStore = require("../db/provisionStore");
const memoryDb = require("../db/memory");
const zeroTouchBilling = require("../services/zeroTouchBilling");
const enrollmentMemoryStore = require("../services/enrollmentMemoryStore");
const radiusSync = require("../services/radiusSync");

const isProduction = process.env.NODE_ENV === "production";

function safeError(error) {
  return isProduction ? "Internal server error" : error.message;
}


function getClientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown";
}

async function repairCredentials(tenantId, slug) {
  const db = getDb();
  try {
    const routers = await db.query(
      `SELECT r.id as router_id, r.name, r.linked_mikrotik_connection_id, r.mgmt_username, r.mgmt_password_encrypted, r.mgmt_port,
              mc.id as connection_id, mc.password_encrypted, mc.username as conn_username
       FROM routers r
       INNER JOIN mikrotik_connections mc ON mc.id = r.linked_mikrotik_connection_id
       WHERE r.tenant_id = $1 AND r.provision_status = 'online'
         AND r.mgmt_password_encrypted IS NOT NULL AND r.mgmt_password_encrypted != ''
         AND (mc.password_encrypted IS NULL OR mc.password_encrypted = '')`,
      [tenantId],
    );
    let repaired = 0;
    for (const r of routers.rows || []) {
      try {
        await db.query(
          "UPDATE mikrotik_connections SET username = COALESCE(NULLIF($1,''), username), password_encrypted = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
          [r.mgmt_username || r.conn_username || 'admin', r.mgmt_password_encrypted, r.connection_id],
        );
        repaired++;
        logger.info(`[SelfHeal] Repaired credentials for router ${r.name} (${r.router_id})`);
      } catch (e) {
        logger.warn(`[SelfHeal] Failed to repair router ${r.router_id}: ${e.message}`);
      }
    }
    return repaired;
  } catch (e) {
    return 0;
  }
}

function getServerBaseUrl(req, explicitBaseUrl) {
  return (
    explicitBaseUrl ||
    process.env.PUBLIC_APP_URL ||
    `${req.protocol}://${req.get("host")}`
  );
}

function normalizeRouterAddress(value) {
  let host = String(value || "").trim();
  if (!host) {
    return "";
  }
  host = host.replace(/^[a-z]+:\/\//i, "").split("/")[0].trim();
  return host.startsWith("[") && host.endsWith("]")
    ? host.slice(1, -1)
    : host;
}

function escapeRouterScriptValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseTokenMetadata(tokenRecord) {
  if (!tokenRecord?.metadata) {
    return {};
  }
  if (typeof tokenRecord.metadata === "object") {
    return tokenRecord.metadata;
  }
  try {
    return JSON.parse(tokenRecord.metadata);
  } catch (error) {
    logger.warn("[Enrollment] Could not parse token metadata", {
      error: error.message,
    });
    return {};
  }
}

function getEnrollmentManagementCredentials(
  tokenRecord,
  discovered,
  overrides = {},
) {
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
    (password ? "admin" : null);

  return { username, password };
}

function buildProvisionCommand(serverUrl, token, method = "script", delay = 0) {
  const cleanBaseUrl = serverUrl.replace(/\/$/, "");
  const scriptUrl = `${cleanBaseUrl}/mikrotik/provision/${token}`;
  const fetchScript = provisionStore.buildFetchCommand(
    scriptUrl,
    "provision.rsc",
    true,
  );
  const delaySec = parseInt(delay, 10) || 0;
  const delayCommand = delaySec > 0 ? `; :delay ${delaySec}s` : "";

  switch (method) {
    case "fetch":
      return fetchScript;
    case "inline":
      return `${fetchScript}${delayCommand}; /import file-name=provision.rsc; /file remove provision.rsc`;
    case "script":
    case "import":
    default:
      return `${fetchScript}${delayCommand}; /import file-name=provision.rsc`;
  }
}

// Simple in-memory cache for provision scripts (30s TTL)
const provisionCache = new Map();
const PROVISION_CACHE_TTL = 30_000; // 30 seconds

function getCachedScript(token) {
  const cached = provisionCache.get(token);
  if (cached && Date.now() - cached.timestamp < PROVISION_CACHE_TTL) {
    return cached.script;
  }
  provisionCache.delete(token);
  return null;
}

function setCachedScript(token, script) {
  provisionCache.set(token, { script, timestamp: Date.now() });
  // Evict old entries if cache grows too large
  if (provisionCache.size > 100) {
    const oldest = [...provisionCache.entries()]
      .sort(([, a], [, b]) => a.timestamp - b.timestamp)
      .slice(0, 20);
    oldest.forEach(([key]) => provisionCache.delete(key));
  }
}

// GET /mikrotik/provision/:token - Router downloads its config
router.get("/provision/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const ip = req.ip || req.connection.remoteAddress;
    const ua = req.get("User-Agent") || "unknown";

    // Check cache first
    const cached = getCachedScript(token);
    if (cached) {
      return res.type("text/plain").send(cached);
    }

    // Find router by token
    const result = await getDb().query(
      "SELECT * FROM routers WHERE provision_token = $1",
      [token],
    );

    if (result.rows.length === 0) {
      await getDb().query(
        "INSERT INTO provision_logs (id, token, router_id, ip_address, user_agent, action, status, details) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [
          uuidv4(),
          token,
          null,
          ip,
          ua,
          "script_fetch",
          "failed",
          "Invalid token",
        ],
      );
      return res
        .status(404)
        .type("text/plain")
        .send("# ERROR: Invalid provisioning token");
    }

    const routerData = result.rows[0];

    // Log the fetch
    await getDb().query(
      "INSERT INTO provision_logs (id, token, router_id, ip_address, user_agent, action, status, details) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [
        uuidv4(),
        token,
        routerData.id,
        ip,
        ua,
        "script_fetch",
        "success",
        `Router: ${routerData.name}`,
      ],
    );

    let tunnelIp = routerData.wireguard_tunnel_ip;
    const wgEndpoint = process.env.WIREGUARD_ENDPOINT || "";
    const wgServerPubkey = process.env.WIREGUARD_SERVER_PUBKEY || "";

    if (wgEndpoint && wgServerPubkey && (!tunnelIp || tunnelIp.trim() === "")) {
      try {
        const subnetStr = process.env.WIREGUARD_SUBNET || "10.254.0.0/24";
        const ipResult = await getDb().query(
          "SELECT wireguard_tunnel_ip FROM routers WHERE wireguard_tunnel_ip IS NOT NULL AND wireguard_tunnel_ip != ''",
        );
        const allocatedIps = new Set(
          ipResult.rows
            ? ipResult.rows.map((r) => r.wireguard_tunnel_ip ? r.wireguard_tunnel_ip.split("/")[0].trim() : "").filter(Boolean)
            : []
        );

        const match = subnetStr.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
        if (match) {
          const prefix = match[1];
          const subnetMask = match[3];
          let allocated = null;
          for (let i = 2; i <= 254; i++) {
            const candidateIp = `${prefix}.${i}`;
            if (!allocatedIps.has(candidateIp)) {
              allocated = `${candidateIp}/${subnetMask}`;
              break;
            }
          }
          if (allocated) {
            tunnelIp = allocated;
            await getDb().query(
              "UPDATE routers SET wireguard_tunnel_ip = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
              [tunnelIp, routerData.id],
            );
            logger.info(`Automatically allocated WireGuard IP ${tunnelIp} for router ${routerData.name}`);
          }
        }
      } catch (err) {
        logger.error("Error auto-allocating WireGuard IP:", err);
      }
    }

    // Generate the provisioning script
    const script = provisionStore.generateProvisionScript(
      { ...routerData, wireguard_tunnel_ip: tunnelIp },
      {
        callbackBaseUrl: getServerBaseUrl(req),
        wireguard_endpoint: wgEndpoint,
        wireguard_server_pubkey: wgServerPubkey,
        wireguard_tunnel_ip: tunnelIp,
      },
    );

    // Cache the script for subsequent rapid requests (e.g., retries)
    setCachedScript(token, script);

    // Log the script for debugging
    logger.info(
      `[Provision] Generated script for router ${routerData.id} (${routerData.name}):`,
    );
    logger.info("--- SCRIPT START ---");
    const scriptLines = script.split("\n");
    scriptLines.forEach((line, idx) => {
      logger.info(`${String(idx + 1).padStart(3)}: ${line}`);
    });
    logger.info("--- SCRIPT END ---");

    // Log the event
    await getDb().query(
      "INSERT INTO provision_events (id, router_id, event_type, script_content) VALUES ($1, $2, $3, $4)",
      [uuidv4(), routerData.id, "script_generated", script],
    );

    res.type("text/plain").send(script);
  } catch (error) {
    logger.error("Provision error:", {
      error: error.message,
      stack: error.stack,
    });
    res
      .status(500)
      .type("text/plain")
      .send(`# ERROR: ${safeError(error)}`);
  }
});

// GET /mikrotik/provision/callback/:token - Router confirms provision
router.get("/provision/callback/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const ip = req.ip || req.connection.remoteAddress;
    const ua = req.get("User-Agent") || "unknown";

    // Optional WireGuard public key from router
    const wgPubKey = req.query.wg_pubkey || null;

    // Find router
    const result = await getDb().query(
      "SELECT * FROM routers WHERE provision_token = $1",
      [token],
    );

    if (result.rows.length === 0) {
      return res.type("text/plain").send("# ERROR: Invalid token");
    }

    const routerData = result.rows[0];

    // Store WireGuard public key if provided
    if (wgPubKey && wgPubKey !== "unknown") {
      try {
        await getDb().query(
          `UPDATE routers SET wireguard_public_key = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [wgPubKey, routerData.id],
        );
        logger.info("WireGuard public key stored", {
          router: routerData.id,
          pubkey: wgPubKey.substring(0, 20) + "...",
        });
      } catch (e) {
        logger.warn("Failed to store WireGuard public key", {
          error: e.message,
        });
      }
    }

    // Invalidate cached script so next fetch is fresh
    provisionCache.delete(token);

    // Mark as provisioned
    await getDb().query(
      `UPDATE routers
       SET provision_status = $1,
           last_provisioned_at = CURRENT_TIMESTAMP,
           provision_attempts = COALESCE(provision_attempts, 0) + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      ["provisioned", routerData.id],
    );

    // Trigger webhook
    const { triggerWebhook } = require("./webhooks");
    triggerWebhook("router.provisioned", {
      router_id: routerData.id,
      router_name: routerData.name,
      ip_address: routerData.ip_address || ip,
      wg_pubkey: wgPubKey || null,
    }).catch(() => {});

    // Slack notification
    slack
      .routerProvisioned(routerData.name, "auto-detect", "auto-detect")
      .catch(() => {});

    // Log callback
    await getDb().query(
      "INSERT INTO provision_logs (id, token, router_id, ip_address, user_agent, action, status, details) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [
        uuidv4(),
        token,
        routerData.id,
        ip,
        ua,
        "callback",
        "success",
        "Router confirmed provisioning",
      ],
    );

    // Billing activation handled by auto-complete endpoint
    const activationStatus =
      "Billing activation skipped: handled by auto-complete endpoint";
    await getDb().query(
      "INSERT INTO provision_logs (id, token, router_id, ip_address, user_agent, action, status, details) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [
        uuidv4(),
        token,
        routerData.id,
        ip,
        ua,
        "billing_activation",
        "skipped",
        activationStatus,
      ],
    );

    res.type("text/plain").send(`# OK: Router marked as provisioned. Billing activation: skipped`);
  } catch (error) {
    logger.error("Callback error:", {
      error: error.message,
      stack: error.stack,
    });
    res
      .status(500)
      .type("text/plain")
      .send(`# ERROR: ${safeError(error)}`);
  }
});

// GET /mikrotik/provision/command/:routerId - Generate one-line provision command
router.get("/provision/command/:routerId", async (req, res) => {
  try {
    const { routerId } = req.params;
    const { method = "import", baseUrl, delay = 0 } = req.query;

    // Find router
    const result = await getDb().query("SELECT * FROM routers WHERE id = $1", [
      routerId,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Router not found" });
    }

    const router = result.rows[0];
    const serverUrl = getServerBaseUrl(req, baseUrl);
    const token = router.provision_token;
    const command = buildProvisionCommand(serverUrl, token, method, delay);

    res.json({
      success: true,
      routerId,
      token,
      method,
      command,
      serverUrl,
      copyText: command.replace(/\\\n/g, " "),
    });
  } catch (error) {
    logger.error("Command generation error:", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// POST /mikrotik/provision/command/:routerId - Regenerate token and get new command
router.post("/provision/command/:routerId", async (req, res) => {
  try {
    const { routerId } = req.params;
    const { method = "import", baseUrl, delay = 0 } = req.body;

    // Find router
    const result = await getDb().query("SELECT * FROM routers WHERE id = $1", [
      routerId,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Router not found" });
    }

    const newToken = provisionStore.generateToken();
    const updateResult = await getDb().query(
      `UPDATE routers
       SET provision_token = $1,
           provision_status = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, provision_token`,
      [newToken, "pending", routerId],
    );
    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: "Router not found" });
    }

    const serverUrl = getServerBaseUrl(req, baseUrl);
    const token = updateResult.rows[0].provision_token;
    const command = buildProvisionCommand(serverUrl, token, method, delay);

    res.json({
      success: true,
      routerId,
      token,
      method,
      command,
      serverUrl,
      copyText: command.replace(/\\\n/g, " "),
      message: "Token regenerated",
    });
  } catch (error) {
    logger.error("Command regeneration error:", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ─── ENROLLMENT HELPERS ────────────────────────────────────────────────────

async function findEnrollmentToken(token) {
  if (!global.dbAvailable) {
    return enrollmentMemoryStore.tokens.find((t) => t.token === token) || null;
  }
  try {
    const result = await getDb().query(
      "SELECT * FROM enrollment_tokens WHERE token = $1",
      [token],
    );
    return result.rows[0] || null;
  } catch (e) {
    return null;
  }
}

async function upsertDiscoveredRouter(enrollToken, tokenRecord, data, ip, ua) {
  const now = new Date().toISOString();

  if (!global.dbAvailable) {
    const existing = enrollmentMemoryStore.discovered.find(
      (d) => d.enrollment_token === enrollToken,
    );
    if (existing) {
      Object.assign(existing, {
        ...data,
        last_seen_at: now,
        updated_at: now,
        source_ip: ip,
        user_agent: ua,
      });
      return existing;
    }

    const record = {
      id: uuidv4(),
      enrollment_token: enrollToken,
      token_id: tokenRecord?.id || null,
      router_id: null,
      identity: data.identity || null,
      model: data.model || null,
      version: data.version || null,
      serial_number: data.serial_number || null,
      primary_mac: data.primary_mac || null,
      source_ip: ip,
      user_agent: ua,
      interfaces: data.interfaces || [],
      ip_addresses: data.ip_addresses || [],
      raw_payload: data,
      suggested_wan_interface: data.suggested_wan_interface || null,
      suggested_lan_interface: "bridge1",
      suggested_lan_ports: data.suggested_lan_ports || [],
      mgmt_username: data.mgmt_username || null,
      mgmt_password: data.mgmt_password || null,
      status: "discovered",
      first_seen_at: now,
      last_seen_at: now,
      approved_at: null,
      created_at: now,
      updated_at: now,
    };
    enrollmentMemoryStore.discovered.push(record);
    return record;
  }

  try {
    const existing = await getDb().query(
      "SELECT id FROM discovered_routers WHERE enrollment_token = $1",
      [enrollToken],
    );
    if (existing.rows.length > 0) {
      const result = await getDb().query(
        `UPDATE discovered_routers SET
           identity = COALESCE($1, identity),
           model = COALESCE($2, model),
           version = COALESCE($3, version),
           serial_number = COALESCE($4, serial_number),
           primary_mac = COALESCE($5, primary_mac),
           source_ip = $6,
           user_agent = $7,
           interfaces = COALESCE($8, interfaces),
           ip_addresses = COALESCE($9, ip_addresses),
           raw_payload = $10,
           suggested_wan_interface = COALESCE($11, suggested_wan_interface),
           suggested_lan_ports = COALESCE($12, suggested_lan_ports),
           mgmt_username = COALESCE($14, mgmt_username),
           mgmt_password = COALESCE($15, mgmt_password),
           last_seen_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
         WHERE enrollment_token = $13
         RETURNING *`,
        [
          data.identity || null,
          data.model || null,
          data.version || null,
          data.serial_number || null,
          data.primary_mac || null,
          ip,
          ua,
          JSON.stringify(data.interfaces || []),
          JSON.stringify(data.ip_addresses || []),
          JSON.stringify(data),
          data.suggested_wan_interface || null,
          data.suggested_lan_ports || null,
          enrollToken,
          data.mgmt_username || null,
          data.mgmt_password || null,
        ],
      );
      return result.rows[0];
    }

    const result = await getDb().query(
      `INSERT INTO discovered_routers
         (id, enrollment_token, token_id, identity, model, version, serial_number, primary_mac,
          source_ip, user_agent, interfaces, ip_addresses, raw_payload,
          suggested_wan_interface, suggested_lan_interface, suggested_lan_ports, status,
          mgmt_username, mgmt_password,
          first_seen_at, last_seen_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'bridge1',$15,'discovered',
               $16,$17,
               CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        uuidv4(),
        enrollToken,
        tokenRecord?.id || null,
        data.identity || null,
        data.model || null,
        data.version || null,
        data.serial_number || null,
        data.primary_mac || null,
        ip,
        ua,
        JSON.stringify(data.interfaces || []),
        JSON.stringify(data.ip_addresses || []),
        JSON.stringify(data),
        data.suggested_wan_interface || null,
        data.suggested_lan_ports || null,
        data.mgmt_username || null,
        data.mgmt_password || null,
      ],
    );
    return result.rows[0];
  } catch (e) {
    logger.error("[Enrollment] upsertDiscoveredRouter error:", {
      error: e.message,
    });
    return null;
  }
}

function appendInterfaceToDiscovered(enrollToken, iface) {
  if (!global.dbAvailable) {
    const record = enrollmentMemoryStore.discovered.find(
      (d) => d.enrollment_token === enrollToken,
    );
    if (record) {
      const list = Array.isArray(record.interfaces) ? record.interfaces : [];
      const existing = list.findIndex((i) => i.name === iface.name);
      if (existing >= 0) {
        list[existing] = { ...list[existing], ...iface };
      } else {
        list.push(iface);
      }

      record.interfaces = list;

      // Auto-suggest WAN (first running non-bridge ethernet)
      const ethRunning = list.filter(
        (i) => !i.disabled && i.running && i.type && i.type.includes("ether"),
      );
      if (!record.suggested_wan_interface && ethRunning.length > 0) {
        record.suggested_wan_interface = ethRunning[0].name;
        record.suggested_lan_ports = ethRunning.slice(1).map((i) => i.name);
      }
    }

    return;
  }

  getDb()
    .query(
      `UPDATE discovered_routers
     SET interfaces = (
           CASE
             WHEN interfaces @> $1::jsonb THEN interfaces
             ELSE interfaces || $1::jsonb
           END
         ),
         suggested_wan_interface = COALESCE(suggested_wan_interface, $2),
         last_seen_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE enrollment_token = $3`,
      [
        JSON.stringify([iface]),
        iface.running &&
        !iface.disabled &&
        iface.type &&
        iface.type.includes("ether")
          ? iface.name
          : null,
        enrollToken,
      ],
    )
    .catch((e) =>
      logger.error("[Enrollment] appendInterface error:", { error: e.message }),
    );
}

function appendAddressToDiscovered(enrollToken, addr) {
  if (!global.dbAvailable) {
    const record = enrollmentMemoryStore.discovered.find(
      (d) => d.enrollment_token === enrollToken,
    );
    if (record) {
      const list = Array.isArray(record.ip_addresses)
        ? record.ip_addresses
        : [];
      if (
        !list.find(
          (a) => a.address === addr.address && a.interface === addr.interface,
        )
      ) {
        list.push(addr);
      }

      record.ip_addresses = list;
    }

    return;
  }

  getDb()
    .query(
      `UPDATE discovered_routers
     SET ip_addresses = ip_addresses || $1::jsonb,
         last_seen_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE enrollment_token = $2`,
      [JSON.stringify([addr]), enrollToken],
    )
    .catch((e) =>
      logger.error("[Enrollment] appendAddress error:", { error: e.message }),
    );
}

// ─── ENROLLMENT PUBLIC ROUTES ──────────────────────────────────────────────

/**
 * GET /mikrotik/enroll/bootstrap/:token
 * The MikroTik downloads and runs this script.
 * It collects identity, model, version, interfaces, IPs and reports back.
 */
router.get("/enroll/bootstrap/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const ip = req.ip || req.connection.remoteAddress;
    const ua = req.get("User-Agent") || "RouterOS";

    const mgmtPass = req.query.mgmt_pass || req.body?.mgmt_pass || "";

    const tokenRecord = await findEnrollmentToken(token);

    if (!tokenRecord) {
      return res
        .status(404)
        .type("text/plain")
        .send(
          "# ERROR: Invalid enrollment token. Generate a new one from the platform.",
        );
    }

    if (tokenRecord.status === "approved" || tokenRecord.status === "expired") {
      return res
        .status(410)
        .type("text/plain")
        .send(
          `# ERROR: Enrollment token is ${tokenRecord.status}. Generate a new one.`,
        );
    }

    if (
      tokenRecord.expires_at &&
      new Date(tokenRecord.expires_at) < new Date()
    ) {
      return res
        .status(410)
        .type("text/plain")
        .send(
          "# ERROR: Enrollment token has expired. Generate a new one from the platform.",
        );
    }

    const serverUrl = getServerBaseUrl(req);
    const cleanUrl = serverUrl.replace(/\/$/, "");
    const isHttps = cleanUrl.startsWith("https");
    const mode = isHttps ? "https" : "http";
    // check-certificate=no is required for HTTPS on RouterOS when the server
    // uses a certificate from a CA that RouterOS does not have in its store,
    // or when TLS negotiation times out (common on Render, Railway, etc).
    // We always set it so the script works regardless of RouterOS cert store state.
    const certCheck = "check-certificate=no";

    // NOTE: All /tool fetch calls inside this script use GET-only with query
    // params.  http-method=post / http-data= are RouterOS v7-only and silently
    // break on v6.  GET works on all versions (v6.49+, v7.x).

    const fetchCmd = (urlExpr) =>
      `/tool fetch mode=${mode} ${certCheck} url=${urlExpr} keep-result=no`;

    const fetchSaveFile = (urlExpr, dst) =>
      `/tool fetch mode=${mode} ${certCheck} url=${urlExpr} dst-path=${dst}`;

    // RouterOS enrollment script - works on RouterOS v6.49+ and all v7
    const script = [
      "#############################################",
      "# Zero-Touch Provisioning Script (One Command)",
      "# Generated by MikroTik Billing Platform",
      `# Token: ${token}`,
      `# Server: ${cleanUrl}`,
      "# Works on RouterOS v6.49+ and v7.x",
      "#############################################",
      "",
      ':local enrollToken "' + token + '"',
      ':local serverUrl "' + cleanUrl + '"',
      "",
      "# ── Optional: Management credentials for auto billing linking ──",
      "# Set these on the router BEFORE running this script:",
      '#   :global ztpMgmtUser "admin"',
      '#   :global ztpMgmtPass "password"',
      ":global ztpMgmtUser; :global ztpMgmtPass;",
      ":local mgmtUser $ztpMgmtUser",
      ":local mgmtPass $ztpMgmtPass",
      ':local ztpPass "' + mgmtPass + '"',
      ":if ([:len \$ztpPass] > 0) do={",
      '  :set mgmtUser "admin"',
      "  :set mgmtPass \$ztpPass",
      '  :put "[ZTP] Auto-generated admin password: \$ztpPass"',
      "  /user set admin password=\$ztpPass",
      "}",
      ':if ([:len $mgmtUser] > 0) do={ :log info message="[ZTP] Mgmt user provided: $mgmtUser" }',
      "",
      "# ── Optional: Port selection overrides ──",
      "# Set these BEFORE running the script to pick WAN / LAN ports:",
      '#   :global ztpWanPort "ether1"',
      '#   :global ztpLanPorts "ether2,ether3,ether4"',
      ":global ztpWanPort; :global ztpLanPorts;",
      ":local wanPort \$ztpWanPort",
      ":local lanPorts \$ztpLanPorts",
      ':if ([:len \$wanPort] > 0) do={ :put "[ZTP] WAN port override: \$wanPort" }',
      ':if ([:len \$lanPorts] > 0) do={ :put "[ZTP] LAN ports override: \$lanPorts" }',
      "",
      "# URL-encode subroutine - encodes special characters in URL parameters",
      ":global ztpUrlEncode do={",
      "  :local str $1",
      '  :local result ""',
      "  :local i 0",
      '  :local ch ""',
      "  :local len [:len $str]",
      "  :while ($i < $len) do={",
      "    :set ch [:pick $str $i]",
      '    :if ($ch = " ") do={ :set result ($result . "%20") } else={',
      '      :if ($ch = "&") do={ :set result ($result . "%26") } else={',
      '        :if ($ch = "=") do={ :set result ($result . "%3D") } else={',
      '          :if ($ch = "/") do={ :set result ($result . "%2F") } else={',
      '            :if ($ch = "?") do={ :set result ($result . "%3F") } else={',
      '              :if ($ch = "#") do={ :set result ($result . "%23") } else={',
      '                :if ($ch = "+") do={ :set result ($result . "%2B") } else={',
      '                  :if ($ch = "@") do={ :set result ($result . "%40") } else={',
      '                    :if ($ch = ":") do={ :set result ($result . "%3A") } else={',
      '                      :if ($ch = "*") do={ :set result ($result . "%2A") } else={',
      '                        :if ($ch = "%") do={ :set result ($result . "%25") } else={',
      "                          :set result ($result . $ch)",
      "                        }",
      "                      }",
      "                    }",
      "                  }",
      "                }",
      "              }",
      "            }",
      "          }",
      "        }",
      "      }",
      "    }",
      "    :set i ($i + 1)",
      "  }",
      "  :return $result",
      "}",
      "",
      "# ── Step 1: Collect system info ──",
      ":local sysIdentity [/system identity get name]",
      ':local sysModel ""',
      ':local sysVersion ""',
      ':local sysUptime ""',
      ':local sysSerial ""',
      ':local sysMac ""',
      "",
      ":do { :set sysModel [/system resource get board-name] } on-error={}",
      ":do { :set sysVersion [/system resource get version] } on-error={}",
      ":do { :set sysUptime [/system resource get uptime] } on-error={}",
      ":do { :set sysSerial [/system routerboard get serial-number] } on-error={}",
      "",
      "# Get first ethernet MAC as primary identifier",
      ":do {",
      "  :local eths [/interface ethernet find]",
      "  :if ([:len $eths] > 0) do={",
      "    :set sysMac [/interface ethernet get ($eths->0) mac-address]",
      "  }",
      "} on-error={}",
      "",
      "# ── Step 2: Report system info via GET (v6 + v7 compatible) ──",
      ':local reportUrl ($serverUrl . "/mikrotik/enroll/report/" . $enrollToken . "?identity=" . [$ztpUrlEncode $sysIdentity] . "&model=" . [$ztpUrlEncode $sysModel] . "&version=" . [$ztpUrlEncode $sysVersion] . "&uptime=" . [$ztpUrlEncode $sysUptime] . "&serial=" . [$ztpUrlEncode $sysSerial] . "&mac=" . [$ztpUrlEncode $sysMac])',
      ":if ([:len $ztpPass] > 0) do={",
      `:do { ${fetchCmd('($reportUrl . "&mgmt_user=admin&mgmt_pass=" . [$ztpUrlEncode $ztpPass])')} } on-error={}`,
      "} else={",
      `:do { ${fetchCmd("$reportUrl")} } on-error={}`,
      "}",
      ':log info message=("[ZTP] Reported system info: " . $sysIdentity)',
      "",
      "# ── Step 3: Report each interface (one GET per interface) ──",
      ":foreach iface in=[/interface find] do={",
      '  :local iName ""',
      '  :local iType ""',
      '  :local iMac ""',
      '  :local iRunning "false"',
      '  :local iDisabled "false"',
      "",
      "  :do { :set iName [/interface get $iface name] } on-error={}",
      "  :do { :set iType [/interface get $iface type] } on-error={}",
      "  :do { :set iMac [/interface get $iface mac-address] } on-error={}",
      "  :do {",
      '    :if ([/interface get $iface running]) do={ :set iRunning "true" }',
      "  } on-error={}",
      "  :do {",
      '    :if ([/interface get $iface disabled]) do={ :set iDisabled "true" }',
      "  } on-error={}",
      "",
      '  :local ifaceUrl ($serverUrl . "/mikrotik/enroll/iface/" . $enrollToken . "?n=" . [$ztpUrlEncode $iName] . "&t=" . [$ztpUrlEncode $iType] . "&m=" . [$ztpUrlEncode $iMac] . "&r=" . [$ztpUrlEncode $iRunning] . "&d=" . [$ztpUrlEncode $iDisabled])',
      `  :do { ${fetchCmd("$ifaceUrl")} } on-error={}`,
      "}",
      "",
      "# ── Step 4: Report IP addresses ──",
      ":foreach addr in=[/ip address find] do={",
      '  :local aAddr ""',
      '  :local aIface ""',
      "  :do { :set aAddr [/ip address get $addr address] } on-error={}",
      "  :do { :set aIface [/ip address get $addr interface] } on-error={}",
      '  :local addrUrl ($serverUrl . "/mikrotik/enroll/addr/" . $enrollToken . "?addr=" . [$ztpUrlEncode $aAddr] . "&iface=" . [$ztpUrlEncode $aIface])',
      `  :do { ${fetchCmd("$addrUrl")} } on-error={}`,
      "}",
      "",
      "# ── Scan complete: print detected ethernet ports ──",
      ':put ""',
      ':put "[ZTP] ===== Interface Scan Results ====="',
      ":local ethCount 0; :local ethLine",
      ':local ethList ""',
      ":foreach iface in=[/interface ethernet find] do={",
      "  :local n [/interface ethernet get $iface name]",
      '  :local r "DOWN"',
      '  :do { :if ([/interface ethernet get $iface running]) do={ :set r "UP" } } on-error={}',
      '  :set ethLine ("  ether: " . $n . " [ " . $r . " ]"); :put $ethLine',
      "  :set ethCount ($ethCount + 1)",
      '  :if ($ethCount > 1) do={ :set ethList ($ethList . "," . $n) } else={ :set ethList ($ethList . $n) }',
      "}",
      ':put "[ZTP] ================================"',
      ':put ""',
      "",
      "# ── Auto-detect WAN / LAN if not overridden ──",
      ":if ([:len $wanPort] = 0) do={",
      "  :local foundWan false",
      "",
      "  # Method 1: Check default route gateway-interface",
      "  :local defRoutes [/ip route find where dst-address=0.0.0.0/0]",
      "  :if ([:len $defRoutes] > 0) do={",
      "    :local gwIface \"\"",
      '    :do { :set gwIface [/ip route get ([:pick $defRoutes 0]) gateway-interface] } on-error={}',
      '    :put "[ZTP] Default route gateway-interface: $gwIface"',
      "    :if ([:len $gwIface] > 0) do={",
      "      :set wanPort $gwIface",
      "      :set foundWan true",
      '      :put "[ZTP] WAN detected from default route: $wanPort"',
      "    }",
      "  }",
      "",
      "  # Method 2: Check DHCP client interface",
      "  :if (!$foundWan) do={",
      "    :local dhcpClients [/ip dhcp-client find]",
      "    :if ([:len $dhcpClients] > 0) do={",
      "      :local dhcpIface [/ip dhcp-client get ([:pick $dhcpClients 0]) interface]",
      "      :if ([:len $dhcpIface] > 0) do={",
      "        :set wanPort $dhcpIface",
      "        :set foundWan true",
      '        :put "[ZTP] WAN detected from DHCP client: $wanPort"',
      "      }",
      "    }",
      "  }",
      "",
      "  # Method 3: Scan running interfaces — test internet connectivity",
      "  :if (!$foundWan) do={",
      '    :put "[ZTP] Scanning interfaces for internet connectivity..."',
      "    :foreach iface in=[/interface ethernet find where running=yes] do={",
      "      :if (!$foundWan) do={",
      "        :local testIface [/interface ethernet get $iface name]",
      '        :do {',
      "          :if ([:resolve cloudflare-dns.com server=1.1.1.1] != \"\") do={",
      '            :set wanPort $testIface',
      '            :set foundWan true',
      '            :put "[ZTP] WAN detected via connectivity test: $wanPort"',
      '          }',
      '        } on-error={}',
      "      }",
      "    }",
      "  }",
      "",
      "  # Method 4: Scan running interfaces — test with ARP gateway",
      "  :if (!$foundWan) do={",
      "    :foreach iface in=[/interface ethernet find where running=yes] do={",
      "      :if (!$foundWan) do={",
      "        :local testIface [/interface ethernet get $iface name]",
      '        :do {',
      '          :if ([:len [/ip arp find where interface=$testIface and !dynamic]] > 0) do={',
      '            :set wanPort $testIface',
      '            :set foundWan true',
      '            :put "[ZTP] WAN detected via ARP on interface: $wanPort"',
      '          }',
      '        } on-error={}',
      "      }",
      "    }",
      "  }",
      "",
      "  :if (!$foundWan) do={",
      '    :set wanPort "ether1"',
      '    :put "[ZTP] WARNING: Could not detect WAN, using ether1"',
      "  }",
      "}",
      ":if ([:len $lanPorts] = 0) do={",
      '  :local lanList ""',
      "  :local idx 0",
      "  :foreach iface in=[/interface ethernet find] do={",
      "    :local n [/interface ethernet get $iface name]",
      "    :if ($n != $wanPort) do={",
      '      :if ($idx > 0) do={ :set lanList ($lanList . "," . $n) } else={ :set lanList ($lanList . $n) }',
      "      :set idx ($idx + 1)",
      "    }",
      "  }",
      "  :set lanPorts $lanList",
      '  :put "[ZTP] Auto-detected LAN: $lanPorts"',
      "}",
      ':put ""',
      "",
      "# ── Step 5: Signal enrollment complete ──",
      `:do { ${fetchCmd('($serverUrl . "/mikrotik/enroll/done/" . $enrollToken)')} } on-error={}`,
      "",
      ':log info message="[ZTP] Enrollment complete. Auto-provisioning now..."',
      ':put "[ZTP] Auto-approving and provisioning..."',
      "",
      "# ── Step 6: Auto-complete (approve + get provision script) ──",
      `:local autoUrl ($serverUrl . "/mikrotik/enroll/auto-complete/" . $enrollToken . "?serverUrl=" . [$ztpUrlEncode $serverUrl] . "&wan=" . [$ztpUrlEncode $wanPort] . "&lan=" . [$ztpUrlEncode $lanPorts] . "&mgmt_pass=" . [$ztpUrlEncode $ztpPass])`,
      `:do { ${fetchSaveFile("$autoUrl", "ztp-provision.rsc")} } on-error={ :put "[ZTP] Failed to get provision script" }`,
      "",
      ":delay 2s;",
      "",
      "# ── Step 7: Apply the provision script ──",
      ':do { /import file-name=ztp-provision.rsc } on-error={ :put "[ZTP] Provision script failed - check server logs" }',
      "",
      ':log info message="[ZTP] Zero-touch provisioning complete"',
      ':local doneMsg ("[ZTP] Done. Router provisioned — WAN=" . $wanPort . " LAN=" . $lanPorts); :put $doneMsg',
      "#############################################",
      "# End of Zero-Touch Provisioning Script",
      "#############################################",
    ].join("\n");

    // Log the bootstrap download
    logger.info(`[Enrollment] Bootstrap fetched - token: ${token}, ip: ${ip}`);

    res.type("text/plain").send(script);
  } catch (error) {
    logger.error("[Enrollment] Bootstrap error:", { error: error.message });
    res.status(500).type("text/plain").send("# ERROR: Internal server error");
  }
});

/**
 * POST /mikrotik/enroll/report/:token  (also accepts GET with query params)
 * Router reports system identity, model, version, serial number, primary MAC
 */
router.all("/enroll/report/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const ip = req.ip || req.connection.remoteAddress;
    const ua = req.get("User-Agent") || "RouterOS";
    const raw = { ...req.query, ...req.body };

    const tokenRecord = await findEnrollmentToken(token);
    if (!tokenRecord) {
      return res.type("text/plain").send("# ERROR: Invalid enrollment token");
    }

    if (
      tokenRecord.expires_at &&
      new Date(tokenRecord.expires_at) < new Date()
    ) {
      return res.type("text/plain").send("# ERROR: Token expired");
    }

    const data = {
      identity: raw.identity || raw.name || null,
      model: raw.model || raw.board || null,
      version: raw.version || raw.ver || null,
      serial_number: raw.serial || raw.serial_number || null,
      primary_mac: raw.mac || raw.primary_mac || null,
      uptime: raw.uptime || null,
      interfaces: [],
      ip_addresses: [],
      suggested_wan_interface: null,
      suggested_lan_ports: [],
      mgmt_username: raw.mgmt_user || null,
      mgmt_password: raw.mgmt_pass || null,
    };

    await upsertDiscoveredRouter(token, tokenRecord, data, ip, ua);

    logger.info(
      `[Enrollment] System report received - identity: ${data.identity}, model: ${data.model}, ip: ${ip}`,
    );
    res.type("text/plain").send("# OK: System info received");
  } catch (error) {
    logger.error("[Enrollment] Report error:", { error: error.message });
    res.type("text/plain").send("# ERROR: " + safeError(error));
  }
});

/**
 * GET /mikrotik/enroll/iface/:token
 * Router reports a single interface (called once per interface in a loop)
 * Query: n=name, t=type, m=mac, r=running(true/false), d=disabled(true/false)
 */
router.get("/enroll/iface/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { n: name, t: type, m: mac, r: running, d: disabled } = req.query;

    if (!name) {
      return res.type("text/plain").send("# SKIP: no name");
    }

    const tokenRecord = await findEnrollmentToken(token);
    if (!tokenRecord) {
      return res.type("text/plain").send("# ERROR: Invalid token");
    }

    const iface = {
      name,
      type: type || "",
      mac_address: mac || "",
      running: running === "true",
      disabled: disabled === "true",
      addresses: [],
    };

    appendInterfaceToDiscovered(token, iface);

    res.type("text/plain").send("# OK");
  } catch (error) {
    logger.error("[Enrollment] Iface error:", { error: error.message });
    res.type("text/plain").send("# ERROR: " + safeError(error));
  }
});

/**
 * GET /mikrotik/enroll/addr/:token
 * Router reports a single IP address
 * Query: addr=192.168.88.1/24, iface=ether1
 */
router.get("/enroll/addr/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { addr, iface } = req.query;

    if (!addr) {
      return res.type("text/plain").send("# SKIP: no address");
    }

    const tokenRecord = await findEnrollmentToken(token);
    if (!tokenRecord) {
      return res.type("text/plain").send("# ERROR: Invalid token");
    }

    appendAddressToDiscovered(token, { address: addr, interface: iface || "" });

    res.type("text/plain").send("# OK");
  } catch (error) {
    logger.error("[Enrollment] Addr error:", { error: error.message });
    res.type("text/plain").send("# ERROR: " + safeError(error));
  }
});

/**
 * GET /mikrotik/enroll/done/:token
 * Router signals it has finished reporting all data.
 * We do a final auto-suggestion of WAN/LAN ports if not already set.
 */
router.get("/enroll/done/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const ip = req.ip || req.connection.remoteAddress;

    if (!global.dbAvailable) {
      const record = enrollmentMemoryStore.discovered.find(
        (d) => d.enrollment_token === token,
      );
      if (record && record.interfaces?.length > 0) {
        const etherRunning = record.interfaces.filter(
          (i) => !i.disabled && i.running && i.type?.includes("ether"),
        );
        if (!record.suggested_wan_interface && etherRunning.length > 0) {
          record.suggested_wan_interface = etherRunning[0].name;
          record.suggested_lan_ports = etherRunning.slice(1).map((i) => i.name);
        }
      }
    } else {
      // Re-compute suggested WAN/LAN from interfaces stored in DB
      try {
        const result = await getDb().query(
          "SELECT id, interfaces FROM discovered_routers WHERE enrollment_token = $1",
          [token],
        );
        if (result.rows.length > 0) {
          const row = result.rows[0];
          let interfaces = row.interfaces;
          if (typeof interfaces === "string") {
            try {
              interfaces = JSON.parse(interfaces);
            } catch (e) {
              interfaces = [];
            }
          }

          if (Array.isArray(interfaces) && interfaces.length > 0) {
            const etherRunning = interfaces.filter(
              (i) => !i.disabled && i.running && i.type?.includes("ether"),
            );
            if (etherRunning.length > 0) {
              await getDb().query(
                `UPDATE discovered_routers
                 SET suggested_wan_interface = COALESCE(suggested_wan_interface, $1),
                     suggested_lan_ports = COALESCE(suggested_lan_ports, $2),
                     last_seen_at = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE enrollment_token = $3`,
                [
                  etherRunning[0].name,
                  etherRunning.slice(1).map((i) => i.name),
                  token,
                ],
              );
            }
          }
        }
      } catch (e) {
        console.warn("[Enrollment] done finalization error:", e.message);
      }
    }

    logger.info(
      `[Enrollment] Done signal received - token: ${token}, ip: ${ip}`,
    );
    res
      .type("text/plain")
      .send(
        "# OK: Enrollment complete. Check the platform to approve this router.",
      );
  } catch (error) {
    logger.error("[Enrollment] Done error:", { error: error.message });
    res.type("text/plain").send("# ERROR: " + safeError(error));
  }
});

/**
 * GET /mikrotik/enroll/auto-complete/:token
 * Called by the one-shot script after reporting all data.
 * Auto-approves the discovered router, creates a router record,
 * generates a provision token, and returns a RouterOS script that
 * directly fetches and applies the provision script (no variable passing needed).
 */
router.get("/enroll/auto-complete/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const serverUrl = req.query.serverUrl || getServerBaseUrl(req);
    const cleanBaseUrl = serverUrl.replace(/\/$/, "");
    const isHttps = cleanBaseUrl.startsWith("https");
    const mode = isHttps ? "https" : "http";
    const certCheck = "check-certificate=no";

    const wanOverride = req.query.wan || null;
    const lanOverride = req.query.lan
      ? req.query.lan
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
      : null;

    const mgmtPass = req.query.mgmt_pass || req.body?.mgmt_pass || "";
    const mgmtUser = req.query.mgmt_user || req.body?.mgmt_user || null;

    const tokenRecord = await findEnrollmentToken(token);
    if (!tokenRecord) {
      return res.type("text/plain").send("# ERROR: Invalid enrollment token");
    }

    if (
      tokenRecord.expires_at &&
      new Date(tokenRecord.expires_at) < new Date()
    ) {
      return res.type("text/plain").send("# ERROR: Token expired");
    }

    // 1. Find the discovered router
    let discovered = null;
    if (!global.dbAvailable) {
      discovered = enrollmentMemoryStore.discovered.find(
        (d) => d.enrollment_token === token,
      );
    } else {
      const result = await getDb().query(
        "SELECT * FROM discovered_routers WHERE enrollment_token = $1",
        [token],
      );
      discovered = result.rows[0] || null;
    }

    if (!discovered) {
      if (!global.dbAvailable) {
        discovered = {
          id: uuidv4(),
          enrollment_token: token,
          identity: "router",
          model: "unknown",
          primary_mac: "00:00:00:00:00:00",
          suggested_wan_interface: "ether1",
          suggested_lan_ports: [
            "ether2",
            "ether3",
            "ether4",
            "ether5",
            "ether6",
            "ether7",
            "ether8",
          ],
          status: "discovered",
        };
        enrollmentMemoryStore.discovered.push(discovered);
      } else {
        return res
          .type("text/plain")
          .send(
            "# ERROR: Router not discovered yet. Complete enrollment first.",
          );
      }
    }

    // 2. Mark as approved
    const now = new Date().toISOString();
    if (!global.dbAvailable) {
      discovered.status = "approved";
      discovered.approved_at = now;
    } else {
      await getDb().query(
        `UPDATE discovered_routers SET status = 'approved', approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE enrollment_token = $1`,
        [token],
      );
    }

    // 3. Create router record with provision token
    let provisionToken = provisionStore.generateToken();
    let routerId = discovered.router_id || tokenRecord.router_id || null;
    const routerName = discovered.identity || "ztp-router";
    const wanIface =
      wanOverride || discovered.suggested_wan_interface || "ether1";
    const lanIface = discovered.suggested_lan_interface || "bridge1";
    const lanPorts = lanOverride ||
      discovered.suggested_lan_ports || ["ether2", "ether3", "ether4"];
    const macAddr = discovered.primary_mac || "00:00:00:00:00:00";
    const managementCredentials = getEnrollmentManagementCredentials(
      tokenRecord,
      discovered,
      { mgmt_username: mgmtUser, mgmt_password: mgmtPass },
    );
    const mgmtPasswordEncrypted = managementCredentials.password
      ? zeroTouchBilling.encryptForMikrotik(managementCredentials.password)
      : null;

    if (!global.dbAvailable) {
      const store = provisionStore.extendStore();
      const routerRecord = routerId
        ? store.routers.find((r) => r.id === routerId)
        : null;
      if (!routerRecord) {
        routerId = routerId || `router-${uuidv4().slice(0, 8)}`;
        store.routers.push({
          id: routerId,
          project_id: null,
          name: routerName,
          identity: routerName,
          model: discovered.model || "unknown",
          mac_address: macAddr,
          ip_address: discovered.source_ip || "",
          wan_interface: wanIface,
          lan_interface: lanIface,
          provision_token: provisionToken,
          provision_status: "pending",
          last_provisioned_at: null,
          provision_attempts: 0,
          dns_servers: ["8.8.8.8", "8.8.4.4"],
          ntp_servers: ["pool.ntp.org"],
          radius_server: "",
          radius_secret: "",
          radius_port: 1812,
          hotspot_enabled: false,
          pppoe_enabled: false,
          pppoe_interface: "",
          pppoe_service_name: "",
          mgmt_port: 8728,
          mgmt_username: managementCredentials.username || "",
          mgmt_password_encrypted: mgmtPasswordEncrypted,
          connection_type: "api",
          notes: "",
          lan_ports: lanPorts,
          created_at: now,
          updated_at: now,
        });
      } else {
        provisionToken = routerRecord.provision_token;
      }
      discovered.router_id = routerId;
    } else {
      let existingRouter = { rows: [] };
      if (routerId) {
        existingRouter = await getDb().query(
          "SELECT id, provision_token FROM routers WHERE id = $1",
          [routerId],
        );
      }
      if (existingRouter.rows.length === 0) {
        routerId = routerId || `router-${uuidv4().slice(0, 8)}`;
        await getDb().query(
          `INSERT INTO routers (id, name, identity, model, mac_address, ip_address, wan_interface, lan_interface, provision_token, provision_status, mgmt_username, mgmt_password_encrypted, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
          [
            routerId,
            routerName,
            routerName,
            discovered.model || "unknown",
            macAddr,
            discovered.source_ip || "",
            wanIface,
            lanIface,
            provisionToken,
            managementCredentials.username,
            mgmtPasswordEncrypted,
          ],
        );
      } else {
        provisionToken = existingRouter.rows[0].provision_token;
      }

      await getDb().query(
        `UPDATE discovered_routers
         SET router_id = $1,
             status = 'approved',
             approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE enrollment_token = $2`,
        [routerId, token],
      );
    }

    if (global.dbAvailable) {
      await getDb().query(
        `UPDATE enrollment_tokens
         SET status = $1,
             used_at = COALESCE(used_at, CURRENT_TIMESTAMP),
             router_id = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE token = $3`,
        ["approved", routerId, token],
      );
    } else {
      tokenRecord.status = "approved";
      tokenRecord.used_at = tokenRecord.used_at || now;
      tokenRecord.router_id = routerId;
      tokenRecord.updated_at = now;
    }

    logger.info(
      `[Enrollment] Auto-complete - token: ${token}, provisionToken: ${provisionToken}, router: ${routerName}`,
    );

    // 4. Auto-link to billing if management credentials were provided
    console.log(
      "AUTOCOMPLETE: routerId=" +
        routerId +
        " user=" +
        (managementCredentials.username || "none") +
        " passLen=" +
        (managementCredentials.password || "").length,
    );
    try {
      const billingResult = await zeroTouchBilling.activateRouterInBilling(
        routerId,
        {
          mgmt_username: managementCredentials.username,
          mgmt_password: managementCredentials.password,
        },
      );
      logger.info(
        `[Enrollment] Billing activation for ${routerName}: ${billingResult.success ? "linked" : `skipped (${billingResult.error || "missing credentials"})`}`,
      );
    } catch (e) {
      logger.warn(
        `[Enrollment] Billing activation failed (non-fatal): ${e.message}`,
      );
    }

    // Return a script that directly fetches AND applies the provision script
    // This avoids RouterOS variable scoping issues between imported files
    const provUrl = `${cleanBaseUrl}/mikrotik/provision/${provisionToken}`;
    const fetchCmd = `/tool fetch mode=${mode} ${certCheck} url="${provUrl}" dst-path=provision.rsc`;
    const response = [
      "# Auto-generated by MikroTik Billing Platform",
      fetchCmd + "; /import file-name=provision.rsc",
    ].join("\n");

    res.type("text/plain").send(response);
  } catch (error) {
    logger.error("[Enrollment] Auto-complete error:", { error: error.message });
    res.type("text/plain").send("# ERROR: " + safeError(error));
  }
});

/**
 * GET /mikrotik/ztp/one-shot/:token
 * ONE-STEP Zero-Touch Provisioning — discover + auto-approve + provision in a single script.
 * Just run this ONE command on the router and it's fully set up.
 */
router.get("/ztp/one-shot/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const tokenRecord = await findEnrollmentToken(token);
    const metadata = parseTokenMetadata(tokenRecord);
    const mgmtPass = req.query.mgmt_pass || metadata.mgmt_password || "";

    const serverUrl = getServerBaseUrl(req);
    const cleanUrl = serverUrl.replace(/\/$/, "");
    const isHttps = cleanUrl.startsWith("https");
    const mode = isHttps ? "https" : "http";
    const certCheck = "check-certificate=no";

    const fetchNoKeep = (urlExpr) =>
      `/tool fetch mode=${mode} ${certCheck} url=${urlExpr} keep-result=no`;
    const fetchSaveFile = (urlExpr, dst) =>
      `/tool fetch mode=${mode} ${certCheck} url=${urlExpr} dst-path=${dst}`;

    const script = [
      "#############################################",
      "# MikroTik One-Shot ZTP Script (One Command)",
      "# Generated by MikroTik Billing Platform",
      `# Token: ${token}`,
      `# Server: ${cleanUrl}`,
      "# Discover + Auto-Approve + Provision in ONE step",
      "# Works on RouterOS v6.49+ and v7.x",
      "#############################################",
      "",
      ':local enrollToken "' + token + '"',
      ':local serverUrl "' + cleanUrl + '"',
      "",
      "# ── Optional: Management credentials for auto billing linking ──",
      "# Set these on the router BEFORE running this script:",
      '#   :global ztpMgmtUser "admin"',
      '#   :global ztpMgmtPass "password"',
      ":global ztpMgmtUser; :global ztpMgmtPass;",
      ':local ztpPass "' + mgmtPass + '"',
      ":local mgmtUser $ztpMgmtUser",
      ":local mgmtPass $ztpMgmtPass",
      ":if ([:len $ztpPass] > 0) do={",
      '  :put "[ZTP] Auto-generated admin password: $ztpPass"',
      "  /user set admin password=$ztpPass",
      '  :set mgmtUser "admin"',
      "  :set mgmtPass $ztpPass",
      "}",
      ':if ([:len $mgmtUser] > 0) do={ :log info message="[ZTP] Mgmt user provided: $mgmtUser" }',
      "",
      "# ── Optional: Port selection overrides ──",
      "# Set these BEFORE running the script to pick WAN / LAN ports:",
      '#   :global ztpWanPort "ether1"',
      '#   :global ztpLanPorts "ether2,ether3,ether4"',
      ":global ztpWanPort; :global ztpLanPorts;",
      ":local wanPort \$ztpWanPort",
      ":local lanPorts \$ztpLanPorts",
      ':if ([:len \$wanPort] > 0) do={ :put "[ZTP] WAN port override: \$wanPort" }',
      ':if ([:len \$lanPorts] > 0) do={ :put "[ZTP] LAN ports override: \$lanPorts" }',
      "",
      "# URL-encode subroutine - encodes special characters in URL parameters",
      ":global ztpUrlEncode do={",
      "  :local str $1",
      '  :local result ""',
      "  :local i 0",
      '  :local ch ""',
      "  :local len [:len $str]",
      "  :while ($i < $len) do={",
      "    :set ch [:pick $str $i]",
      '    :if ($ch = " ") do={ :set result ($result . "%20") } else={',
      '      :if ($ch = "&") do={ :set result ($result . "%26") } else={',
      '        :if ($ch = "=") do={ :set result ($result . "%3D") } else={',
      '          :if ($ch = "/") do={ :set result ($result . "%2F") } else={',
      '            :if ($ch = "?") do={ :set result ($result . "%3F") } else={',
      '              :if ($ch = "#") do={ :set result ($result . "%23") } else={',
      '                :if ($ch = "+") do={ :set result ($result . "%2B") } else={',
      '                  :if ($ch = "@") do={ :set result ($result . "%40") } else={',
      '                    :if ($ch = ":") do={ :set result ($result . "%3A") } else={',
      '                      :if ($ch = "*") do={ :set result ($result . "%2A") } else={',
      '                        :if ($ch = "%") do={ :set result ($result . "%25") } else={',
      "                          :set result ($result . $ch)",
      "                        }",
      "                      }",
      "                    }",
      "                  }",
      "                }",
      "              }",
      "            }",
      "          }",
      "        }",
      "      }",
      "    }",
      "    :set i ($i + 1)",
      "  }",
      "  :return $result",
      "}",
      "",
      "# ── Step 1: Collect system info ──",
      ":local sysIdentity [/system identity get name]",
      ':local sysModel ""',
      ':local sysVersion ""',
      ':local sysUptime ""',
      ':local sysSerial ""',
      ':local sysMac ""',
      "",
      ":do { :set sysModel [/system resource get board-name] } on-error={}",
      ":do { :set sysVersion [/system resource get version] } on-error={}",
      ":do { :set sysUptime [/system resource get uptime] } on-error={}",
      ":do { :set sysSerial [/system routerboard get serial-number] } on-error={}",
      "",
      "# Get first ethernet MAC as primary identifier",
      ":do {",
      "  :local eths [/interface ethernet find]",
      "  :if ([:len $eths] > 0) do={",
      "    :set sysMac [/interface ethernet get ($eths->0) mac-address]",
      "  }",
      "} on-error={}",
      "",
      "# ── Step 2: Report system info ──",
      ':local reportUrl ($serverUrl . "/mikrotik/enroll/report/" . $enrollToken . "?identity=" . [$ztpUrlEncode $sysIdentity] . "&model=" . [$ztpUrlEncode $sysModel] . "&version=" . [$ztpUrlEncode $sysVersion] . "&uptime=" . [$ztpUrlEncode $sysUptime] . "&serial=" . [$ztpUrlEncode $sysSerial] . "&mac=" . [$ztpUrlEncode $sysMac])',
      ":if ([:len $ztpPass] > 0) do={",
      `:do { ${fetchNoKeep('($reportUrl . "&mgmt_user=admin&mgmt_pass=" . [$ztpUrlEncode $ztpPass])')} } on-error={}`,
      "} else={",
      `:do { ${fetchNoKeep("$reportUrl")} } on-error={}`,
      "}",
      ':log info message=("[ZTP] Reported system info: " . $sysIdentity)',
      "",
      "# ── Step 3: Report each interface ──",
      ":foreach iface in=[/interface find] do={",
      '  :local iName ""',
      '  :local iType ""',
      '  :local iMac ""',
      '  :local iRunning "false"',
      '  :local iDisabled "false"',
      "",
      "  :do { :set iName [/interface get $iface name] } on-error={}",
      "  :do { :set iType [/interface get $iface type] } on-error={}",
      "  :do { :set iMac [/interface get $iface mac-address] } on-error={}",
      '  :do {\n    :if ([/interface get $iface running]) do={ :set iRunning "true" }\n  } on-error={}',
      '  :do {\n    :if ([/interface get $iface disabled]) do={ :set iDisabled "true" }\n  } on-error={}',
      "",
      '  :local ifaceUrl ($serverUrl . "/mikrotik/enroll/iface/" . $enrollToken . "?n=" . [$ztpUrlEncode $iName] . "&t=" . [$ztpUrlEncode $iType] . "&m=" . [$ztpUrlEncode $iMac] . "&r=" . [$ztpUrlEncode $iRunning] . "&d=" . [$ztpUrlEncode $iDisabled])',
      `  :do { ${fetchNoKeep("$ifaceUrl")} } on-error={}`,
      "}",
      "",
      "# ── Step 4: Report IP addresses ──",
      ":foreach addr in=[/ip address find] do={",
      '  :local aAddr ""',
      '  :local aIface ""',
      "  :do { :set aAddr [/ip address get $addr address] } on-error={}",
      "  :do { :set aIface [/ip address get $addr interface] } on-error={}",
      '  :local addrUrl ($serverUrl . "/mikrotik/enroll/addr/" . $enrollToken . "?addr=" . [$ztpUrlEncode $aAddr] . "&iface=" . [$ztpUrlEncode $aIface])',
      `  :do { ${fetchNoKeep("$addrUrl")} } on-error={}`,
      "}",
      "",
      "# ── Scan complete: print detected ethernet ports ──",
      ':put ""',
      ':put "[ZTP] ===== Interface Scan Results ====="',
      ":local ethCount 0; :local ethLine",
      ':local ethList ""',
      ":foreach iface in=[/interface ethernet find] do={",
      "  :local n [/interface ethernet get $iface name]",
      '  :local r "DOWN"',
      '  :do { :if ([/interface ethernet get $iface running]) do={ :set r "UP" } } on-error={}',
      '  :set ethLine ("  ether: " . $n . " [ " . $r . " ]"); :put $ethLine',
      "  :set ethCount ($ethCount + 1)",
      '  :if ($ethCount > 1) do={ :set ethList ($ethList . "," . $n) } else={ :set ethList ($ethList . $n) }',
      "}",
      ':put "[ZTP] ================================"',
      ':put ""',
      "",
      "# ── Auto-detect WAN / LAN if not overridden ──",
      ":if ([:len $wanPort] = 0) do={",
      "  :local foundWan false",
      "",
      "  # Method 1: Check default route gateway-interface",
      "  :local defRoutes [/ip route find where dst-address=0.0.0.0/0]",
      "  :if ([:len $defRoutes] > 0) do={",
      "    :local gwIface \"\"",
      '    :do { :set gwIface [/ip route get ([:pick $defRoutes 0]) gateway-interface] } on-error={}',
      '    :put "[ZTP] Default route gateway-interface: $gwIface"',
      "    :if ([:len $gwIface] > 0) do={",
      "      :set wanPort $gwIface",
      "      :set foundWan true",
      '      :put "[ZTP] WAN detected from default route: $wanPort"',
      "    }",
      "  }",
      "",
      "  # Method 2: Check DHCP client interface",
      "  :if (!$foundWan) do={",
      "    :local dhcpClients [/ip dhcp-client find]",
      "    :if ([:len $dhcpClients] > 0) do={",
      "      :local dhcpIface [/ip dhcp-client get ([:pick $dhcpClients 0]) interface]",
      "      :if ([:len $dhcpIface] > 0) do={",
      "        :set wanPort $dhcpIface",
      "        :set foundWan true",
      '        :put "[ZTP] WAN detected from DHCP client: $wanPort"',
      "      }",
      "    }",
      "  }",
      "",
      "  # Method 3: Scan running interfaces — test internet connectivity",
      "  :if (!$foundWan) do={",
      '    :put "[ZTP] Scanning interfaces for internet connectivity..."',
      "    :foreach iface in=[/interface ethernet find where running=yes] do={",
      "      :if (!$foundWan) do={",
      "        :local testIface [/interface ethernet get $iface name]",
      '        :do {',
      "          :if ([:resolve cloudflare-dns.com server=1.1.1.1] != \"\") do={",
      '            :set wanPort $testIface',
      '            :set foundWan true',
      '            :put "[ZTP] WAN detected via connectivity test: $wanPort"',
      '          }',
      '        } on-error={}',
      "      }",
      "    }",
      "  }",
      "",
      "  # Method 4: Scan running interfaces — test with ARP gateway",
      "  :if (!$foundWan) do={",
      "    :foreach iface in=[/interface ethernet find where running=yes] do={",
      "      :if (!$foundWan) do={",
      "        :local testIface [/interface ethernet get $iface name]",
      '        :do {',
      '          :if ([:len [/ip arp find where interface=$testIface and !dynamic]] > 0) do={',
      '            :set wanPort $testIface',
      '            :set foundWan true',
      '            :put "[ZTP] WAN detected via ARP on interface: $wanPort"',
      '          }',
      '        } on-error={}',
      "      }",
      "    }",
      "  }",
      "",
      "  :if (!$foundWan) do={",
      '    :set wanPort "ether1"',
      '    :put "[ZTP] WARNING: Could not detect WAN, using ether1"',
      "  }",
      "}",
      ":if ([:len $lanPorts] = 0) do={",
      '  :local lanList ""',
      "  :local idx 0",
      "  :foreach iface in=[/interface ethernet find] do={",
      "    :local n [/interface ethernet get $iface name]",
      "    :if ($n != $wanPort) do={",
      '      :if ($idx > 0) do={ :set lanList ($lanList . "," . $n) } else={ :set lanList ($lanList . $n) }',
      "      :set idx ($idx + 1)",
      "    }",
      "  }",
      "  :set lanPorts $lanList",
      '  :put "[ZTP] Auto-detected LAN: $lanPorts"',
      "}",
      ':put ""',
      "",
      "# ── Step 5: Auto-complete + provision (server approves, generates & returns provision script) ──",
      ':log info message="[ZTP] Enrollment complete. Auto-approving and provisioning..."',
      ':put "[ZTP] Auto-approving and applying configuration..."',
      `:local autoUrl ($serverUrl . "/mikrotik/enroll/auto-complete/" . $enrollToken . "?serverUrl=" . [$ztpUrlEncode $serverUrl] . "&wan=" . [$ztpUrlEncode $wanPort] . "&lan=" . [$ztpUrlEncode $lanPorts] . "&mgmt_pass=" . [$ztpUrlEncode $ztpPass])`,
      `:do { ${fetchSaveFile("$autoUrl", "ztp-provision.rsc")} } on-error={ :put "[ZTP] Failed to get provision script" }`,
      "",
      "# Wait up to 30s for the file to finish downloading before importing",
      ":local attempts 0",
      ":while ([:len [/file find name=ztp-provision.rsc]] = 0 && $attempts < 30) do={",
      "  :delay 1s",
      "  :set attempts ($attempts + 1)",
      "}",
      ':if ($attempts >= 30) do={ :put "[ZTP] Timeout waiting for provision script" }',
      "",
      "# ── Step 6: Run the provision script (auto-complete returned a fetch+import command) ──",
      ':do { /import file-name=ztp-provision.rsc } on-error={ :put "[ZTP] Provision script failed - check server logs" }',
      "",
      "# Cleanup temp files",
      ":do { /file remove ztp-provision.rsc } on-error={}",
      ":do { /file remove provision.rsc } on-error={}",
      "",
      ':local doneMsg ("[ZTP] One-shot provisioning complete! Router configured — WAN=" . $wanPort . " LAN=" . $lanPorts); :put $doneMsg',
      ':log info message="[ZTP] One-shot provisioning complete!"',
      "#############################################",
      "# End of One-Shot ZTP Script",
      "#############################################",
    ].join("\n");

    logger.info(`[ZTP] One-shot script fetched - token: ${token}`);
    res.type("text/plain").send(script);
  } catch (error) {
    logger.error("[ZTP] One-shot error:", { error: error.message });
    res.status(500).type("text/plain").send("# ERROR: Internal server error");
  }
});

// ─── Router Link endpoints (simple install flow) ───
// These match the legacy /api/router/v1/* paths, now consolidated here

// GET /v1/scripts/install
router.get("/v1/scripts/install", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .type("text/plain")
        .send("# ERROR: Missing Bearer token");
    }
    const apiKey = authHeader.split(" ")[1];
    if (!apiKey || apiKey.length < 10) {
      return res
        .status(401)
        .type("text/plain")
        .send("# ERROR: Invalid API key");
    }

    const db = getDb();
    let tenant;
    try {
      const result = await db.query(
        "SELECT * FROM tenants WHERE settings->>'api_key' = $1 AND is_active = true LIMIT 1",
        [apiKey],
      );
      tenant = result.rows[0];
    } catch (e) {
      tenant = null;
    }

    if (!tenant) {
      return res
        .status(403)
        .type("text/plain")
        .send("# ERROR: Invalid API key");
    }

    const baseUrl = process.env.APP_URL ||
      `${req.protocol}://${req.get("host")}`;
    const isHttps = baseUrl.startsWith("https");
    const fetchMode = isHttps ? "https" : "http";
    const certCheck = isHttps ? " check-certificate=no" : "";
    const radiusServer = process.env.RADIUS_SERVER || req.get("host");
    const radiusSecret = process.env.RADIUS_SECRET || apiKey.substring(0, 16);
    const wgEndpoint = process.env.WIREGUARD_ENDPOINT || "";
    const wgServerPubkey = process.env.WIREGUARD_SERVER_PUBKEY || "";

    const scriptLines = [
      "#############################################",
      "# MikroTik Billing - Router Link Script",
      `# Server: ${baseUrl}`,
      "#############################################",
      "",
      `:put "[Billing] Starting router link..."`,
      "",
      "# ── IMPORTANT: Set management credentials BEFORE running ──",
      "# Run these commands on your router first to auto-create the API connection:",
      '#   :global ztpMgmtUser "admin"',
      '#   :global ztpMgmtPass "your-password"',
      ":global ztpMgmtUser; :global ztpMgmtPass;",
      ":local hasCreds [:len $ztpMgmtUser]",
      `:if ($hasCreds > 0) do={ :log info "[Billing] Management credentials provided" } else={ :log info "[Billing] No management credentials set - add later via Router Link page" }`,
      "",
      "# RADIUS",
      `:put "[Billing] Setting up RADIUS..."`,
      `:do { /radius add address=${radiusServer} secret="${radiusSecret}" service=ppp,hotspot timeout=300ms comment="Billing RADIUS" disabled=no; :put "[Billing] RADIUS configured" } on-error={ :put "[Billing] RADIUS skipped (unsupported or exists)" }`,
      "",
      "# PPPoE",
      `:put "[Billing] Setting up PPPoE..."`,
      ":do {",
      "  :if ([:len [/interface pppoe-server server find]] = 0) do={",
      "    /interface pppoe-server server add service-name=pppoe-internet interface=bridge1 authentication=pap,chap,mschap1,mschap2 one-session-per-host=yes disabled=no",
      '    :put "[Billing] PPPoE server created"',
      "  } else={",
      '    :put "[Billing] PPPoE server already exists"',
      "  }",
      '} on-error={ :put "[Billing] PPPoE setup skipped" }',
      "",
    ];

    if (wgEndpoint && wgServerPubkey) {
      scriptLines.push(
        "# WireGuard Tunnel",
        `:global wgPubKey; :set wgPubKey ""`,
        ":do {",
        `  :if ([:len [/interface wireguard find name=mgmt-tunnel]] = 0) do={`,
        `    /interface wireguard add name=mgmt-tunnel listen-port=13231 comment="Billing management tunnel"`,
        `    /interface wireguard peers add interface=mgmt-tunnel public-key="${wgServerPubkey}" endpoint-address="${wgEndpoint}" endpoint-port=13231 allowed-address=0.0.0.0/0 persistent-keepalive=25s comment="Billing server"`,
        `    :set wgPubKey [/interface wireguard get [find name=mgmt-tunnel] public-key]`,
        `    /ip firewall filter add chain=input protocol=udp dst-port=13231 action=accept comment="Allow WireGuard billing"`,
        `    :log info "[Billing] WireGuard tunnel created"`,
        `  } else={`,
        `    :set wgPubKey [/interface wireguard get [find name=mgmt-tunnel] public-key]`,
        `    :log info "[Billing] WireGuard tunnel already exists"`,
        `  }`,
        '} on-error={ :log warning "[Billing] WireGuard setup failed" }',
        "",
      );
    } else {
      scriptLines.push(`:global wgPubKey; :set wgPubKey ""`, "");
    }

    scriptLines.push(
      `:put "[Billing] Collecting management credentials..."`,
      ":global ztpMgmtUser; :global ztpMgmtPass;",
      ":local mgmtUser $ztpMgmtUser",
      ":local mgmtPass $ztpMgmtPass",
      ':if ([:len $mgmtUser] > 0) do={ :put "[Billing] Management user found: $mgmtUser" } else={ :log info "[Billing] No management credentials set - add later via Router Link page" }',
      "",
      `:put "[Billing] Reporting to server..."`,
      ":local model [/system routerboard get model]",
      ":local serial [/system routerboard get serial-number]",
      ":local version [/system package get [find name=routeros] version]",
      ":local mac [/interface ethernet get [find default-name=ether1] mac-address]",
      `:local url "${baseUrl}/api/router/v1/report?model=\$model&serial=\$serial&version=\$version&mac=\$mac"`,
      `:if ([:len \$wgPubKey] > 0) do={ :set url (\$url . "&wg_pubkey=" . \$wgPubKey) }`,
      `:if ([:len \$mgmtUser] > 0) do={ :set url (\$url . "&mgmt_user=" . \$mgmtUser) }`,
      `:if ([:len \$mgmtPass] > 0) do={ :set url (\$url . "&mgmt_pass=" . \$mgmtPass) }`,
      `:do { /tool fetch url=\$url http-header-field="Authorization: Bearer ${apiKey}" mode=${fetchMode} output=none } on-error={ :log warning "[Billing] Report failed" }`,
      "",
      "# Schedule auto-sync",
      "/system scheduler remove [find name=billing-sync]",
      `/system scheduler add name=billing-sync interval=5m on-event="/tool fetch url=\\"${baseUrl}/api/router/v1/scripts/sync\\" http-header-field=\\"Authorization: Bearer ${apiKey}\\" mode=${fetchMode} output=none" comment="Billing Sync" disabled=no`,
      "",
      `:put "[Billing] Done!"`,
      `:put "[Billing] Router linked to ${baseUrl}"`,
    );

    const script = scriptLines.join("\n");

    try {
      await db.query(
        "INSERT INTO provision_logs (id, token, ip_address, action, status, details) VALUES ($1,$2,$3,$4,$5,$6)",
        [
          uuidv4(),
          apiKey.substring(0, 16),
          getClientIp(req),
          "install_script_fetch",
          "success",
          tenant.name,
        ],
      );
    } catch (e) {}

    res.type("text/plain").send(script);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════
// SLUG-BASED ROUTES (tenant in URL path)
// More reliable: tenant identified by URL slug, API key is validation only
// ═══════════════════════════════════════

async function findTenantBySlugOrKey(slug, apiKey) {
  const db = getDb();
  if (slug) {
    const result = await db.query(
      "SELECT * FROM tenants WHERE slug = $1 AND is_active = true LIMIT 1",
      [slug],
    );
    return result.rows[0] || null;
  }
  if (apiKey) {
    const result = await db.query(
      "SELECT * FROM tenants WHERE settings->>'api_key' = $1 AND is_active = true LIMIT 1",
      [apiKey],
    );
    return result.rows[0] || null;
  }
  return null;
}

// GET /v1/:slug/install
router.get("/v1/:slug/install", async (req, res) => {
  try {
    const { slug } = req.params;
    const authHeader = req.headers.authorization;
    const apiKey = (authHeader && authHeader.startsWith("Bearer ")) ? authHeader.split(" ")[1] : "";

    const tenant = await findTenantBySlugOrKey(slug, apiKey);
    if (!tenant) {
      return res.status(403).type("text/plain").send("# ERROR: Invalid tenant or API key");
    }

    const storedKey = tenant.settings?.api_key;
    if (apiKey && storedKey && apiKey !== storedKey) {
      return res.status(403).type("text/plain").send("# ERROR: API key does not match this tenant");
    }

    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const isHttps = baseUrl.startsWith("https");
    const fetchMode = isHttps ? "https" : "http";
    const certFlag = isHttps ? "check-certificate=no" : "";
    const radiusServer = process.env.RADIUS_SERVER || req.get("host");
    const radiusSecret = process.env.RADIUS_SECRET || (apiKey || slug).substring(0, 16);
    const routerIdentity = req.query.identity || tenant.name || slug;

    const db = getDb();
    const settingsRes = await db.query("SELECT value FROM settings WHERE key = $1", ["vpn_server_address"]).catch(() => ({ rows: [] }));
    const vpnServerAddress = settingsRes.rows[0]?.value || process.env.VPN_SERVER_ADDRESS || req.query.vpn_address || "";
    const vpnServerPort = process.env.VPN_SERVER_PORT || req.query.vpn_port || "443";
    const vpnUsername = req.query.vpn_user || tenant.settings?.vpn_username || `isp-${slug}`;
    const vpnPassword = req.query.vpn_pass || tenant.settings?.vpn_password || apiKey.substring(0, 16);

    const scriptTemplates = require("../services/scriptTemplates");
    const script = scriptTemplates.buildInstallScript({
      baseUrl,
      apiKey,
      slug,
      radiusServer,
      radiusSecret,
      routerIdentity,
      fetchMode,
      certFlag,
      vpnServerAddress,
      vpnServerPort,
      vpnUsername,
      vpnPassword,
    });

    res.type("text/plain").send(script);
  } catch (error) {
    res.status(500).type("text/plain").send("# ERROR: Internal server error");
  }
});

// GET /v1/:slug/scripts/vpn — generate SSTP VPN client script
router.get("/v1/:slug/scripts/vpn", async (req, res) => {
  try {
    const { slug } = req.params;
    const authHeader = req.headers.authorization;
    const apiKey = (authHeader && authHeader.startsWith("Bearer ")) ? authHeader.split(" ")[1] : "";

    const tenant = await findTenantBySlugOrKey(slug, apiKey);
    if (!tenant) {
      return res.status(403).type("text/plain").send("# ERROR: Invalid tenant or API key");
    }

    const db = getDb();
    const settingsRes = await db.query("SELECT value FROM settings WHERE key = $1", ["vpn_server_address"]).catch(() => ({ rows: [] }));
    const serverAddress = settingsRes.rows[0]?.value || process.env.VPN_SERVER_ADDRESS || req.query.address || "";
    const serverPort = process.env.VPN_SERVER_PORT || req.query.port || "443";

    if (!serverAddress) {
      return res.type("text/plain").send([
        ":put \"=== VPN Setup Required ===\"",
        ":put \"Configure the VPN server address in:\"",
        ":put \"  Settings > General > Remote Access VPN\"",
      ].join("\n"));
    }

    const username = req.query.user || tenant.settings?.vpn_username || `isp-${slug}`;
    const password = req.query.pass || tenant.settings?.vpn_password || apiKey.substring(0, 16);
    const identity = tenant.name || slug;
    const isHttps = (process.env.APP_URL || "").startsWith("https");
    const fetchMode = isHttps ? "https" : "http";

    const scriptTemplates = require("../services/scriptTemplates");
    const script = scriptTemplates.buildVpnScript({
      serverAddress,
      serverPort,
      username,
      password,
      routerIdentity: identity,
      fetchMode,
    });

    res.type("text/plain").send(script);
  } catch (error) {
    res.status(500).type("text/plain").send("# ERROR: Internal server error");
  }
});

// GET /v1/:slug/health — lightweight diagnostic for routers to self-check
router.get("/v1/:slug/health", async (req, res) => {
  const { slug } = req.params;
  const tenant = await findTenantBySlugOrKey(slug, null);
  const db = getDb();

  let report = ":put \"=== Router Health Check ===\"";

  if (!tenant) {
    return res.type("text/plain").send(report + "\n:put \"FAIL: Tenant not found\"");
  }

  try {
    const routers = await db.query(
      "SELECT id, name, provision_status, linked_mikrotik_connection_id FROM routers WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT 1",
      [tenant.id],
    );

    if (routers.rows.length === 0) {
      return res.type("text/plain").send(report + "\n:put \"STATUS: No router registered yet\"");
    }

    const r = routers.rows[0];
    report += `\n:put "  Router: ${(r.name || 'Unknown').replace(/"/g, '')}"`;
    report += `\n:put "  Provision: ${r.provision_status || 'unknown'}"`;

    let hasCreds = false;
    if (r.linked_mikrotik_connection_id) {
      const conn = await db.query(
        "SELECT username, password_encrypted, is_online FROM mikrotik_connections WHERE id = $1",
        [r.linked_mikrotik_connection_id],
      );
      if (conn.rows.length > 0) {
        const c = conn.rows[0];
        report += `\n:put "  API User: ${c.username || '(none)'}"`;
        report += `\n:put "  API Password: ${c.password_encrypted ? 'SET' : 'MISSING'}"`;
        report += `\n:put "  API Online: ${c.is_online ? 'YES' : 'NO'}"`;
        hasCreds = !!(c.username && c.password_encrypted);
      }
    }

    report += `\n:put "  Status: ${hasCreds ? 'FULLY MANAGED' : 'NEEDS CREDENTIALS'}"`;
    report += "\n:put \"=== End Health Check ===\"";
  } catch (e) {
    report += `\n:put "ERROR: ${e.message.replace(/"/g, '')}"`;
  }

  res.type("text/plain").send(report);
});

// GET /v1/:slug/report
router.get("/v1/:slug/report", async (req, res) => {
  try {
    const { slug } = req.params;
    const authHeader = req.headers.authorization;
    const apiKey = (authHeader && authHeader.startsWith("Bearer ")) ? authHeader.split(" ")[1] : "";
    const { model, serial, version, mac, mgmt_user, mgmt_pass, mgmt_port, vpn_ip } = req.query;
    const db = getDb();

    const tenant = await findTenantBySlugOrKey(slug, apiKey);
    if (!tenant) {
      return res.status(403).json({ error: "Invalid tenant or API key" });
    }

    let routerId = null;
    const routerIp = (vpn_ip && vpn_ip.trim() !== '') ? vpn_ip.trim() : getClientIp(req);
    const routerIdentifier = mac || `ip-${routerIp.replace(/[.:]/g, "-")}`;

    try {
      let existingRouter = null;
      if (mac) {
        existingRouter = await db.query("SELECT id FROM routers WHERE mac_address = $1 LIMIT 1", [mac]);
      }
      if (!existingRouter || existingRouter.rows.length === 0) {
        existingRouter = await db.query("SELECT id FROM routers WHERE ip_address = $1 AND provision_status = 'online' ORDER BY updated_at DESC LIMIT 1", [routerIp]);
      }

      const routerName = model || `Router-${routerIdentifier}`;

      // Try to get a project_id, but don't fail if projects don't exist
      let projectId = null;
      try { const pr = await db.query("SELECT id FROM projects ORDER BY created_at ASC LIMIT 1"); projectId = pr.rows[0]?.id || null; } catch (e) {}

      if (existingRouter && existingRouter.rows.length > 0) {
        routerId = existingRouter.rows[0].id;
        await db.query(
          "UPDATE routers SET model = COALESCE(NULLIF($1, ''), model), ip_address = $2, provision_status = 'online', mac_address = COALESCE(NULLIF($4, ''), mac_address), updated_at = CURRENT_TIMESTAMP WHERE id = $3",
          [model, routerIp, routerId, mac || null],
        );
        try { await db.query("UPDATE routers SET tenant_id = $1 WHERE id = $2", [tenant.id, routerId]); } catch(colErr) {}
      } else {
        const newRouter = await db.query(
          "INSERT INTO routers (project_id, name, identity, model, mac_address, ip_address, provision_status) VALUES ($1,$2,$3,$4,$5,$6,'online') RETURNING id",
          [projectId, routerName, routerName, model || "Unknown", mac || null, routerIp],
        );
        routerId = newRouter.rows[0].id;
        try { await db.query("UPDATE routers SET tenant_id = $1 WHERE id = $2", [tenant.id, routerId]); } catch(colErr) {}
      }
    } catch (e) {
      console.error("Failed to upsert router:", e.message);
    }

    // Create mikrotik_connection if credentials provided
    let connectionId = null;
    if (routerId && mgmt_user && mgmt_pass) {
      try {
        const activationResult = await zeroTouchBilling.ensureMikrotikConnection(routerId, {
          mgmt_username: mgmt_user,
          mgmt_password: mgmt_pass,
          mgmt_port: mgmt_port ? parseInt(mgmt_port, 10) : 8728,
          connection_type: "api",
        });
        if (activationResult?.connection?.id) {
          connectionId = activationResult.connection.id;
          await db.query("UPDATE routers SET linked_mikrotik_connection_id = $1, billing_activated_at = CURRENT_TIMESTAMP WHERE id = $2", [connectionId, routerId]);
          try {
            await zeroTouchBilling.activateRouterInBilling(routerId);
          } catch (syncErr) {
            console.error("Failed to sync subscriptions:", syncErr.message);
          }
        }
      } catch (e) {
        console.error("Failed to create connection:", e.message);
      }
    }

    try {
      await db.query(
        "INSERT INTO provision_logs (id, token, router_id, ip_address, action, status, details) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [uuidv4(), slug.substring(0, 16), routerId, getClientIp(req), "router_scan", "success", JSON.stringify({ model, serial, version, mac, has_credentials: !!(mgmt_user && mgmt_pass), connection_id: connectionId })],
      );
    } catch (logErr) {}

    res.json({ success: true, router_id: routerId, connection_id: connectionId, linked: !!connectionId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /v1/:slug/status
router.get("/v1/:slug/status", async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = await findTenantBySlugOrKey(slug, null);
    if (!tenant) {
      return res.json({ connected: false, status: "invalid_tenant", message: "Tenant not found." });
    }

    const routers = await findRoutersByTenant(tenant.id, slug);
    if (routers.length > 0) {
      const r = routers[0];
      return res.json({
        connected: true,
        status: r.is_online ? "online" : "offline",
        message: r.is_online ? "Router online" : "Router offline",
        lastSeen: r.updated_at,
        ip: r.ip_address,
        router: { id: r.id, name: r.name, model: r.model, mac: r.mac_address, ip: r.ip_address, is_online: r.is_online, has_connection: !!r.linked_mikrotik_connection_id },
      });
    }

    return res.json({ connected: false, status: "waiting", message: "Awaiting router connection..." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /v1/:slug/routers — List all routers for this tenant (diagnostic)
router.get("/v1/:slug/routers", async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = await findTenantBySlugOrKey(slug, null);
    if (!tenant) {
      return res.json({ error: "Tenant not found", routers: [] });
    }

    const routers = await findRoutersByTenant(tenant.id, slug, { includeAllStatuses: true });
    res.json({
      tenant: { id: tenant.id, name: tenant.name, slug },
      routers,
    });
  } catch (error) {
    res.status(500).json({ error: error.message, routers: [] });
  }
});

// DELETE /v1/:slug/routers/:id — Remove an unwanted router
router.delete("/v1/:slug/routers/:id", async (req, res) => {
  try {
    const { slug, id } = req.params;
    const db = getDb();
    const tenant = await findTenantBySlugOrKey(slug, null);
    if (!tenant) {return res.status(404).json({ error: "Tenant not found" });}

    const router = await db.query("SELECT id, linked_mikrotik_connection_id FROM routers WHERE id = $1 AND tenant_id = $2", [id, tenant.id]);
    if (router.rows.length === 0) {return res.status(404).json({ error: "Router not found" });}

    // Delete associated mikrotik_connection if it exists
    if (router.rows[0].linked_mikrotik_connection_id) {
      try {
        await db.query("DELETE FROM mikrotik_connections WHERE id = $1", [router.rows[0].linked_mikrotik_connection_id]);
      } catch (e) { /* non-fatal */ }
    }

    // Delete provision_logs and the router itself
    await db.query("DELETE FROM provision_logs WHERE router_id = $1", [id]);
    await db.query("DELETE FROM routers WHERE id = $1", [id]);

    res.json({ success: true, message: "Router removed" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// In-memory watch sessions
const watchSessions = new Map();

async function findRoutersByTenant(tenantId, slug, { includeAllStatuses = false } = {}) {
  const db = getDb();
  const statusFilter = includeAllStatuses ? "" : " AND r.provision_status = 'online'";
  // Try tenant_id first
  try {
    const result = await db.query(
      `SELECT r.id, r.name, r.model, r.mac_address, r.ip_address,
              r.linked_mikrotik_connection_id, r.provision_status, r.updated_at,
              COALESCE(mc.is_online, false) as is_online,
              (r.updated_at > NOW() - INTERVAL '10 minutes') as is_reporting
       FROM routers r
       LEFT JOIN mikrotik_connections mc ON mc.id = r.linked_mikrotik_connection_id
       WHERE r.tenant_id = $1${statusFilter}
       ORDER BY r.updated_at DESC`,
      [tenantId],
    );
    if (result.rows.length > 0) {return result.rows;}
  } catch (e) {
    // tenant_id column might not exist, try without it
    try {
      const result = await db.query(
        `SELECT r.id, r.name, r.model, r.mac_address, r.ip_address,
                r.linked_mikrotik_connection_id, r.provision_status, r.updated_at,
                COALESCE(mc.is_online, false) as is_online,
                (r.updated_at > NOW() - INTERVAL '10 minutes') as is_reporting
         FROM routers r
         LEFT JOIN mikrotik_connections mc ON mc.id = r.linked_mikrotik_connection_id
         WHERE r.linked_mikrotik_connection_id IS NOT NULL
         ORDER BY r.updated_at DESC`,
      );
      if (result.rows.length > 0) {return result.rows;}
    } catch (e2) {}
  }
  // Fallback: find by provision_logs token
  try {
    const logResult = await db.query(
      "SELECT DISTINCT router_id FROM provision_logs WHERE token = $1 AND router_id IS NOT NULL ORDER BY router_id DESC LIMIT 20",
      [(slug || "").substring(0, 16)],
    );
    const ids = logResult.rows.map(r => r.router_id).filter(Boolean);
    if (ids.length > 0) {
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
      const result = await db.query(
        `SELECT id, name, model, mac_address, ip_address, linked_mikrotik_connection_id, provision_status, updated_at FROM routers WHERE id IN (${placeholders}) ORDER BY updated_at DESC`,
        ids,
      );
      return result.rows;
    }
  } catch (e) {
    // provision_logs might not exist either
  }
  return [];
}

// POST /v1/:slug/watch/start — Create a watch session
router.post("/v1/:slug/watch/start", async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = await findTenantBySlugOrKey(slug, null);
    if (!tenant) {return res.status(404).json({ error: "Tenant not found" });}

    const sessionId = uuidv4();
    watchSessions.set(sessionId, {
      tenantId: tenant.id,
      slug,
      startedAt: Date.now(),
      found: false,
      router: null,
    });

    // Auto-cleanup after 10 minutes
    setTimeout(() => watchSessions.delete(sessionId), 10 * 60 * 1000);

    res.json({ sessionId, slug, message: "Watch session started" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /v1/:slug/watch/:sessionId — Poll watch session
router.get("/v1/:slug/watch/:sessionId", async (req, res) => {
  try {
    const { slug, sessionId } = req.params;
    const session = watchSessions.get(sessionId);

    if (!session) {
      return res.json({ found: false, expired: true, message: "Session expired" });
    }

    if (session.found) {
      return res.json({ found: true, router: session.router, message: "Router discovered!" });
    }

    const tenant = await findTenantBySlugOrKey(slug, null);
    if (!tenant) {
      return res.json({ found: false, message: "Tenant not found" });
    }

    const routers = await findRoutersByTenant(tenant.id, slug);
    if (routers.length > 0) {
      const r = routers[0];
      const router = { id: r.id, name: r.name, model: r.model, mac: r.mac_address, ip: r.ip_address, has_connection: !!r.linked_mikrotik_connection_id };
      session.found = true;
      session.router = router;
      return res.json({ found: true, router, message: `Router ${r.name} discovered!` });
    }

    const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
    res.json({ found: false, elapsed, message: `Watching... (${elapsed}s)` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /v1/:slug/watch — SSE stream (legacy, may not work on Render)
router.get("/v1/:slug/watch", async (req, res) => {
  const { slug } = req.params;
  const db = getDb();

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent("connected", { slug, message: "Watching for router..." });

  let found = false;
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes (120 x 5s)

  const poll = setInterval(async () => {
    attempts++;
    if (found || attempts > maxAttempts) {
      clearInterval(poll);
      if (!found) {
        sendEvent("timeout", { message: "No router discovered after 10 minutes. Check the command on your MikroTik." });
      }
      res.end();
      return;
    }

    try {
      const tenant = await findTenantBySlugOrKey(slug, null);
      if (!tenant) {
        sendEvent("error", { message: "Tenant not found" });
        clearInterval(poll);
        res.end();
        return;
      }

      // Check for new routers
      const routerResult = await db.query(
        "SELECT id, name, model, mac_address, ip_address, linked_mikrotik_connection_id, provision_status, updated_at FROM routers WHERE tenant_id = $1 AND provision_status = 'online' ORDER BY updated_at DESC LIMIT 1",
        [tenant.id],
      );

      if (routerResult.rows.length > 0) {
        const r = routerResult.rows[0];
        found = true;
        clearInterval(poll);
        sendEvent("discovered", {
          connected: true,
          router: { id: r.id, name: r.name, model: r.model, mac: r.mac_address, ip: r.ip_address, has_connection: !!r.linked_mikrotik_connection_id },
          message: `Router ${r.name} discovered!`,
        });
        sendEvent("done", { message: "Discovery complete" });
        res.end();
        return;
      }

      // Also check provision_logs as fallback
      const logResult = await db.query(
        "SELECT router_id, created_at FROM provision_logs WHERE token = $1 AND router_id IS NOT NULL ORDER BY created_at DESC LIMIT 1",
        [slug.substring(0, 16)],
      );

      if (logResult.rows.length > 0 && logResult.rows[0].router_id) {
        const rResult = await db.query(
          "SELECT id, name, model, mac_address, ip_address, linked_mikrotik_connection_id, provision_status FROM routers WHERE id = $1",
          [logResult.rows[0].router_id],
        );
        if (rResult.rows.length > 0) {
          const r = rResult.rows[0];
          found = true;
          clearInterval(poll);
          sendEvent("discovered", {
            connected: true,
            router: { id: r.id, name: r.name, model: r.model, mac: r.mac_address, ip: r.ip_address, has_connection: !!r.linked_mikrotik_connection_id },
            message: `Router ${r.name} found via logs!`,
          });
          sendEvent("done", { message: "Discovery complete" });
          res.end();
          return;
        }
      }

      // Send heartbeat
      sendEvent("heartbeat", { attempts, remaining: maxAttempts - attempts, message: `Still watching... (${attempts}/${maxAttempts})` });
    } catch (e) {
      sendEvent("error", { message: e.message });
    }
  }, 5000);

  req.on("close", () => {
    clearInterval(poll);
    found = true;
  });
});

// GET /v1/:slug/sync
router.get("/v1/:slug/sync", async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = await findTenantBySlugOrKey(slug, null);
    if (tenant) {
      try {
        await getDb().query("UPDATE routers SET provision_status = 'online', updated_at = CURRENT_TIMESTAMP WHERE tenant_id = $1 AND provision_status != 'offline'", [tenant.id]);
        repairCredentials(tenant.id, slug).catch(() => {});
      } catch (e) {}
    }
    res.type("text/plain").send(':log info "[Billing] Sync OK"');
  } catch (e) {
    res.type("text/plain").send(':log info "[Billing] Sync OK"');
  }
});

// GET /v1/report
router.get("/v1/report", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing token" });
    }
    const apiKey = authHeader.split(" ")[1];
    const { model, serial, version, mac, wg_pubkey, mgmt_user, mgmt_pass, mgmt_port, vpn_ip } = req.query;
    const db = getDb();

    let tenant;
    try {
      const tenantResult = await db.query(
        "SELECT * FROM tenants WHERE settings->>'api_key' = $1 AND is_active = true LIMIT 1",
        [apiKey],
      );
      tenant = tenantResult.rows[0];
    } catch (e) {
      tenant = null;
    }

    let routerId = null;
    if (tenant) {
      try {
        let projectId = null;
        try { const pr = await db.query("SELECT id FROM projects ORDER BY created_at ASC LIMIT 1"); projectId = pr.rows[0]?.id || null; } catch (e) {}
        const routerIp = (vpn_ip && vpn_ip.trim() !== '') ? vpn_ip.trim() : getClientIp(req);
        const routerIdentifier = mac || `ip-${routerIp.replace(/[.:]/g, "-")}`;
        let existingRouter = null;
        if (mac) {
          existingRouter = await db.query("SELECT * FROM routers WHERE mac_address = $1 LIMIT 1", [mac]);
        }
        if (!existingRouter || existingRouter.rows.length === 0) {
          existingRouter = await db.query("SELECT id FROM routers WHERE ip_address = $1 AND provision_status = 'online' ORDER BY updated_at DESC LIMIT 1", [routerIp]);
        }
        const routerName = model || `Router-${routerIdentifier}`;

        if (existingRouter.rows.length > 0) {
          routerId = existingRouter.rows[0].id;
          await db.query(
            `UPDATE routers SET model = COALESCE(NULLIF($1, ''), model), ip_address = $2, provision_status = 'online', wireguard_public_key = COALESCE(NULLIF($4, ''), wireguard_public_key), updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
            [model, routerIp, routerId, wg_pubkey || null],
          );
          // Set tenant_id separately (column may not exist yet, don't break the flow)
          try {
            await db.query("UPDATE routers SET tenant_id = $1 WHERE id = $2", [tenant.id, routerId]);
          } catch (colErr) {
            console.error("routers.tenant_id column missing, skipping:", colErr.message);
          }
        } else {
          const newRouter = await db.query(
            `INSERT INTO routers (project_id, name, identity, model, mac_address, ip_address, wireguard_public_key, provision_status) VALUES ($1,$2,$3,$4,$5,$6,$7,'online') RETURNING id`,
            [
              projectId,
              routerName,
              routerName,
              model,
              mac,
              routerIp,
              wg_pubkey || null,
            ],
          );
          routerId = newRouter.rows[0].id;
          // Set tenant_id separately
          try {
            await db.query("UPDATE routers SET tenant_id = $1 WHERE id = $2", [tenant.id, routerId]);
          } catch (colErr) {
            console.error("routers.tenant_id column missing, skipping:", colErr.message);
          }
        }
      } catch (e) {
        console.error("Failed to upsert router:", e.message);
      }
    }

    // Create mikrotik_connection if management credentials were provided
    let connectionId = null;
    if (routerId && mgmt_user && mgmt_pass) {
      try {
        const activationResult = await zeroTouchBilling.ensureMikrotikConnection(
          routerId,
          {
            mgmt_username: mgmt_user,
            mgmt_password: mgmt_pass,
            mgmt_port: mgmt_port ? parseInt(mgmt_port, 10) : 8728,
            connection_type: "api",
          },
        );

        if (activationResult?.connection?.id) {
          connectionId = activationResult.connection.id;
          await db.query(
            "UPDATE routers SET linked_mikrotik_connection_id = $1, billing_activated_at = CURRENT_TIMESTAMP WHERE id = $2",
            [connectionId, routerId],
          );

          // Also store credentials on the router record for future use
          const encryption = require("../utils/encryption");
          const encryptedPass = await encryption.encrypt(mgmt_pass);
          await db.query(
            "UPDATE routers SET mgmt_username = $1, mgmt_password_encrypted = $2, mgmt_port = $3 WHERE id = $4",
            [mgmt_user, encryptedPass, mgmt_port ? parseInt(mgmt_port, 10) : 8728, routerId],
          );

          // Try to sync existing subscriptions for this tenant
          try {
            await zeroTouchBilling.activateRouterInBilling(routerId);
          } catch (syncErr) {
            console.error("Failed to sync subscriptions:", syncErr.message);
          }
        }
      } catch (e) {
        console.error("Failed to create connection from router link:", e.message);
      }
    }

    if (routerId) {
      try {
        const routerRecord = await db.query(
          "SELECT id, name, ip_address, linked_mikrotik_connection_id FROM routers WHERE id = $1",
          [routerId],
        );
        if (routerRecord.rows[0]) {
          await radiusSync.ensureRadiusNas({
            ...routerRecord.rows[0],
            connection_id: connectionId,
          });
        }
      } catch (radiusErr) {
        logger.warn(`[RADIUS] NAS registration failed: ${radiusErr.message}`);
      }
    }

    await db.query(
      "INSERT INTO provision_logs (id, token, router_id, ip_address, action, status, details) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [
        uuidv4(),
        apiKey.substring(0, 16),
        routerId,
        getClientIp(req),
        "router_scan",
        "success",
        JSON.stringify({ model, serial, version, mac, wg_pubkey, has_credentials: !!(mgmt_user && mgmt_pass), connection_id: connectionId }),
      ],
    );

    res.json({ success: true, router_id: routerId, connection_id: connectionId, linked: !!connectionId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /v1/status (legacy key-based - just check provision_logs, no tenant validation)
router.get("/v1/status", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing token" });
    }
    const apiKey = authHeader.split(" ")[1];
    const tokenPrefix = apiKey.substring(0, 16);
    const db = getDb();

    // Check provision_logs first
    const logResult = await db.query(
      "SELECT action, status, ip_address, router_id, created_at, details FROM provision_logs WHERE token = $1 ORDER BY created_at DESC LIMIT 1",
      [tokenPrefix],
    );

    if (logResult.rows.length > 0) {
      const log = logResult.rows[0];
      let router = null;
      if (log.router_id) {
        try {
          const rResult = await db.query(
            "SELECT id, name, model, mac_address, ip_address, linked_mikrotik_connection_id, provision_status FROM routers WHERE id = $1",
            [log.router_id],
          );
          if (rResult.rows.length > 0) {
            const r = rResult.rows[0];
            router = { id: r.id, name: r.name, model: r.model, mac: r.mac_address, ip: r.ip_address, has_connection: !!r.linked_mikrotik_connection_id };
          }
        } catch (e) {}
      }

      return res.json({
        connected: true,
        status: "online",
        message: "Router found via logs",
        lastSeen: log.created_at,
        ip: log.ip_address,
        lastAction: log.action,
        router,
      });
    }

    // Fallback: check if there's any router with this token's MAC in logs
    try {
      const macResult = await db.query(
        "SELECT id, name, model, mac_address, ip_address, linked_mikrotik_connection_id, provision_status FROM routers WHERE mac_address IN (SELECT details->>'mac' FROM provision_logs WHERE token = $1) LIMIT 1",
        [tokenPrefix],
      );
      if (macResult.rows.length > 0) {
        const r = macResult.rows[0];
        return res.json({
          connected: true,
          status: "online",
          message: "Router found via MAC",
          router: { id: r.id, name: r.name, model: r.model, mac: r.mac_address, ip: r.ip_address, has_connection: !!r.linked_mikrotik_connection_id },
        });
      }
    } catch (e) {}

    return res.json({
      connected: false,
      status: "waiting",
      message: "Awaiting router connection... Run the command on your MikroTik.",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /v1/:slug/routers/:routerId/link-billing
// Link an unmanaged discovered router to the billing engine.
// STEP 1: Performs a REAL live connection test against the MikroTik API.
// STEP 2: Only if the live test passes, saves credentials and activates billing.
router.post("/v1/:slug/routers/:routerId/link-billing", async (req, res) => {
  try {
    const { slug, routerId } = req.params;
    const { username, password, port, connection_type, test_ip: testIpOverride } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    const db = getDb();

    // Accept both Bearer-token auth (admin UI) and slug-based tenant lookup
    const authHeader = req.headers.authorization;
    const apiKey = (authHeader && authHeader.startsWith("Bearer ")) ? authHeader.split(" ")[1] : null;

    // Resolve the tenant
    let tenant = await findTenantBySlugOrKey(slug, null);
    if (!tenant && apiKey) {
      tenant = await findTenantBySlugOrKey(null, apiKey);
    }
    if (!tenant && apiKey) {
      const tenantByKey = await db.query(
        "SELECT * FROM tenants WHERE settings->>'api_key' = $1 AND is_active = true LIMIT 1",
        [apiKey],
      );
      tenant = tenantByKey.rows[0] || null;
    }

    if (!tenant) {
      return res.status(403).json({ error: "Invalid tenant or API key" });
    }

    // Find the router
    const routerResult = await db.query("SELECT * FROM routers WHERE id = $1", [routerId]);
    if (routerResult.rows.length === 0) {
      return res.status(404).json({ error: "Router not found" });
    }

    const routerRow = routerResult.rows[0];

    if (routerRow.tenant_id && routerRow.tenant_id !== tenant.id) {
      return res.status(403).json({ error: "Router does not belong to this tenant" });
    }

    // ── STEP 1: REAL LIVE CONNECTION TEST ──────────────────────────────────
    // We MUST verify credentials actually work on the router before saving anything.
    const routerConnectionManager = require("../services/routerConnectionManager");
    const resolvedPort = port ? parseInt(port, 10) : 8728;
    const resolvedType = connection_type || "api";
    if (!Number.isInteger(resolvedPort) || resolvedPort < 1 || resolvedPort > 65535) {
      return res.status(400).json({ error: "port must be a valid TCP port between 1 and 65535" });
    }

    // Determine the IP to test against (prefer stored IP, fallback to source IP)
    const testIp = normalizeRouterAddress(
      (testIpOverride && String(testIpOverride).trim()) ||
      routerRow.wireguard_tunnel_ip ||
      routerRow.ip_address ||
      routerRow.source_ip ||
      null,
    );
    if (!testIp) {
      return res.status(400).json({
        error: "Cannot test connection: router has no known IP address yet. Make sure the router has reported its IP by running the install command first.",
        code: "NO_ROUTER_IP",
      });
    }

    logger.info(`[link-billing] Testing real connection to ${testIp}:${resolvedPort} (${resolvedType}) for router ${routerRow.name}`);

    const testConfig = {
      ip_address: testIp,
      api_port: resolvedPort,
      ssh_port: resolvedType === "ssh" ? resolvedPort : 22,
      username,
      password,           // testConnection handles decryption; plain text is fine here
      password_encrypted: null,
      connection_type: resolvedType,
      use_tunnel: Boolean(routerRow.wireguard_tunnel_ip),
      wireguard_tunnel_ip: routerRow.wireguard_tunnel_ip || null,
    };

    try {
      if (resolvedType === "ssh") {
        await routerConnectionManager.testSSHConnection(testConfig);
      } else {
        await routerConnectionManager.testConnection(testConfig);
      }
      logger.info(`[link-billing] Real connection test PASSED for router ${routerRow.name} (${testIp})`);
    } catch (testErr) {
      // Connection test failed — return the real error, save nothing
      const rawMsg = testErr.message || String(testErr);
      logger.warn(`[link-billing] Real connection test FAILED for ${testIp}: ${rawMsg}`);

      // Translate common MikroTik errors into helpful messages
      let friendlyMsg = rawMsg;
      if (/ECONNREFUSED/.test(rawMsg))    { friendlyMsg = `Connection refused on ${testIp}:${resolvedPort}. Make sure the router's API (or SSH) service is enabled and the port is correct.`; }
      else if (/ETIMEDOUT|EHOSTUNREACH/.test(rawMsg)) { friendlyMsg = `Cannot reach ${testIp}:${resolvedPort}. Check that your server can reach the router (firewall, NAT, or VPN issue).`; }
      else if (/ENOTFOUND/.test(rawMsg))  { friendlyMsg = `Cannot resolve host ${testIp}. Use the router's IP address, not a hostname.`; }
      else if (/wrong password|invalid user|cannot log in|login failed|authentication|rejected/i.test(rawMsg)) {
        friendlyMsg = `Authentication failed — wrong username or password. Check MikroTik Users > user "${username}" exists and has full API access.`;
      } else if (/ssl|certificate/i.test(rawMsg)) {
        friendlyMsg = `SSL handshake failed. Try connection type "API" (port 8728) instead of "API-SSL".`;
      }

      return res.status(400).json({
        error: friendlyMsg,
        raw_error: rawMsg,
        code: "CONNECTION_TEST_FAILED",
        test_ip: testIp,
        test_port: resolvedPort,
      });
    }
    // ── END REAL TEST ────────────────────────────────────────────────────────

    // ── STEP 2: Save credentials and activate billing ────────────────────────
    // We only reach here if the live test passed.

    const activationResult = await zeroTouchBilling.ensureMikrotikConnection(routerId, {
      mgmt_username: username,
      mgmt_password: password,
      mgmt_port: resolvedPort,
      connection_type: resolvedType,
    });

    if (!activationResult.success) {
      return res.status(400).json({
        error: activationResult.error || "Failed to create MikroTik connection record",
        detail: activationResult,
      });
    }

    const connectionId = activationResult.connection?.id;
    if (!connectionId) {
      return res.status(500).json({ error: "Connection record created but ID missing" });
    }

    // Persist credentials on the router row
    const encryption = require("../utils/encryption");
    const encryptedPass = encryption.encrypt(password);

    await db.query(
      `UPDATE routers
       SET linked_mikrotik_connection_id = $1,
           mgmt_username = $2,
           mgmt_password_encrypted = $3,
           mgmt_port = $4,
           billing_activated_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [connectionId, username, encryptedPass, resolvedPort, routerId],
    );

    try {
      await db.query(
        "UPDATE mikrotik_connections SET tenant_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [tenant.id, connectionId],
      );
    } catch (tenantColErr) {
      logger.warn(`[link-billing] Could not set tenant_id on connection: ${tenantColErr.message}`);
    }

    if (testIp && testIp !== normalizeRouterAddress(routerRow.ip_address)) {
      try {
        await db.query(
          "UPDATE routers SET ip_address = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
          [testIp, routerId],
        );
        await db.query(
          "UPDATE mikrotik_connections SET ip_address = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
          [testIp, connectionId],
        );
      } catch (ipErr) {
        logger.warn(`[link-billing] Could not persist override IP: ${ipErr.message}`);
      }
    }

    // Sync existing subscriptions that were waiting for a connection
    let syncResults = [];
    try {
      const fullActivation = await zeroTouchBilling.activateRouterInBilling(routerId);
      syncResults = fullActivation?.sync_results || [];
      logger.info(`[link-billing] Synced ${syncResults.length} subscription(s) for router ${routerRow.name}`);
    } catch (syncErr) {
      logger.warn(`[link-billing] Subscription sync after link failed: ${syncErr.message}`);
    }

    const updatedRouter = await db.query(
      "SELECT id, name, model, ip_address, mac_address, linked_mikrotik_connection_id, provision_status, billing_activated_at FROM routers WHERE id = $1",
      [routerId],
    );

    res.json({
      success: true,
      router_id: routerId,
      connection_id: connectionId,
      name: routerRow.name || routerRow.identity,
      test_ip: testIp,
      router: updatedRouter.rows[0] || null,
      subscriptions_synced: syncResults.length,
      sync_results: syncResults,
    });
  } catch (error) {
    logger.error("[link-billing] Unexpected error:", { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// POST /v1/:slug/routers/:routerId/push
// Generate and execute the standard billing configuration through the
// router's saved API connection. The script is never returned to the client.
router.post("/v1/:slug/routers/:routerId/push", async (req, res) => {
  try {
    const { slug, routerId } = req.params;
    const authHeader = req.headers.authorization;
    const apiKey = authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";

    if (!apiKey) {
      return res.status(401).json({ error: "Missing API key" });
    }

    const db = getDb();
    const tenant = await findTenantBySlugOrKey(slug, null);
    if (!tenant || tenant.settings?.api_key !== apiKey) {
      return res.status(403).json({ error: "Invalid tenant or API key" });
    }

    const routerResult = await db.query("SELECT * FROM routers WHERE id = $1", [routerId]);
    if (routerResult.rows.length === 0) {
      return res.status(404).json({ error: "Router not found" });
    }

    const routerRow = routerResult.rows[0];
    if (routerRow.tenant_id && routerRow.tenant_id !== tenant.id) {
      return res.status(403).json({ error: "Router does not belong to this tenant" });
    }
    if (!routerRow.linked_mikrotik_connection_id) {
      return res.status(400).json({
        error: "Router has no management connection. Upgrade it to Full Management first.",
      });
    }

    const connResult = await db.query(
      "SELECT * FROM mikrotik_connections WHERE id = $1",
      [routerRow.linked_mikrotik_connection_id],
    );
    if (connResult.rows.length === 0) {
      return res.status(400).json({ error: "Linked MikroTik connection was not found" });
    }

    const connection = connResult.rows[0];
    const encryption = require("../utils/encryption");
    const managementPassword =
      encryption.decrypt(connection.password_encrypted) ||
      encryption.decrypt(routerRow.mgmt_password_encrypted);
    const managementUsername = connection.username || routerRow.mgmt_username || "admin";

    if (!managementPassword) {
      return res.status(400).json({
        error: "The saved router password could not be decrypted. Re-enter the router credentials and link it again.",
        code: "PASSWORD_DECRYPTION_FAILED",
      });
    }

    const scriptTemplates = require("../services/scriptTemplates");
    const baseUrl = getServerBaseUrl(req);
    const fetchMode = baseUrl.startsWith("https") ? "https" : "http";
    const certFlag = fetchMode === "https" ? "check-certificate=no" : "";
    const settingsResult = await db.query(
      "SELECT value FROM settings WHERE key = $1",
      ["vpn_server_address"],
    ).catch(() => ({ rows: [] }));
    const vpnServerAddress =
      settingsResult.rows[0]?.value || process.env.VPN_SERVER_ADDRESS || "";
    const vpnServerPort = process.env.VPN_SERVER_PORT || "443";
    const routerIdentity = routerRow.identity || routerRow.name || slug;
    const script = [
      `:global ztpMgmtUser "${escapeRouterScriptValue(managementUsername)}"`,
      `:global ztpMgmtPass "${escapeRouterScriptValue(managementPassword)}"`,
      scriptTemplates.buildInstallScript({
        baseUrl,
        apiKey,
        slug,
        radiusServer: process.env.RADIUS_SERVER || req.get("host"),
        radiusSecret: process.env.RADIUS_SECRET || apiKey.substring(0, 16),
        routerIdentity,
        fetchMode,
        certFlag,
        vpnServerAddress,
        vpnServerPort,
        vpnUsername: `isp-${slug}`,
        vpnPassword: apiKey.substring(0, 16),
      }),
    ].join("\n");

    if (script.length > 200000) {
      return res.status(413).json({ error: "Generated RouterOS script is too large to push" });
    }

    const routerConnectionManager = require("../services/routerConnectionManager");
    const connectionConfig = {
      ...connection,
      ip_address: normalizeRouterAddress(connection.ip_address || routerRow.ip_address),
      wireguard_tunnel_ip:
        connection.wireguard_tunnel_ip || routerRow.wireguard_tunnel_ip || null,
      use_tunnel:
        Boolean(connection.use_tunnel) ||
        Boolean(connection.wireguard_tunnel_ip || routerRow.wireguard_tunnel_ip),
    };
    const effectiveHost = routerConnectionManager.resolveEffectiveConfig(connectionConfig).ip_address;
    const result = await routerConnectionManager.executeScript(
      connectionConfig,
      script,
      { name: `billing-link-${Date.now()}` },
    );

    await db.query(
      "UPDATE mikrotik_connections SET is_online = true, last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [connection.id],
    ).catch(() => {});

    res.json({
      success: true,
      message: `Billing configuration executed successfully on ${routerRow.name || routerIdentity}`,
      router_id: routerId,
      connection_id: connection.id,
      host: effectiveHost,
      script_name: result.script_name,
    });
  } catch (error) {
    logger.error("[router-link-push] Remote configuration failed:", {
      error: error.message,
      stack: error.stack,
    });
    res.status(502).json({
      error: error.message || "Remote configuration failed",
      code: "REMOTE_PUSH_FAILED",
    });
  }
});


// PUT /v1/upgrade — Add management credentials to an existing router link
router.put("/v1/upgrade", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing token" });
    }
    const apiKey = authHeader.split(" ")[1];
    const { mac, username, password, port, connection_type } = req.body;

    if (!mac || !username || !password) {
      return res.status(400).json({ error: "mac, username, and password are required" });
    }

    const db = getDb();

    // Verify the tenant owns this router
    const tenantResult = await db.query(
      "SELECT * FROM tenants WHERE settings->>'api_key' = $1 AND is_active = true LIMIT 1",
      [apiKey],
    );
    if (tenantResult.rows.length === 0) {
      return res.status(403).json({ error: "Invalid API key" });
    }

    // Find the router
    const routerResult = await db.query(
      "SELECT * FROM routers WHERE mac_address = $1 LIMIT 1",
      [mac],
    );
    if (routerResult.rows.length === 0) {
      return res.status(404).json({ error: "Router not found. Make sure the router has reported in first." });
    }

    const router = routerResult.rows[0];

    // Encrypt the password
    const encryption = require("../utils/encryption");
    const encryptedPass = await encryption.encrypt(password);

    // Create the mikrotik_connection
    const activationResult = await zeroTouchBilling.ensureMikrotikConnection(
      router.id,
      {
        mgmt_username: username,
        mgmt_password: password,
        mgmt_port: port ? parseInt(port, 10) : 8728,
        connection_type: connection_type || "api",
      },
    );

    const connectionId = activationResult?.connection?.id;
    if (!connectionId) {
      throw new Error(activationResult?.error || "Failed to create MikroTik connection");
    }

    // Link and store credentials
    await db.query(
      "UPDATE routers SET linked_mikrotik_connection_id = $1, mgmt_username = $2, mgmt_password_encrypted = $3, mgmt_port = $4, billing_activated_at = CURRENT_TIMESTAMP WHERE id = $5",
      [connectionId, username, encryptedPass, port || 8728, router.id],
    );

    // Try to sync subscriptions
    try {
      await zeroTouchBilling.activateRouterInBilling(router.id);
    } catch (syncErr) {
      console.error("Failed to sync subscriptions on upgrade:", syncErr.message);
    }

    res.json({
      success: true,
      router_id: router.id,
      connection_id: connectionId,
      name: router.name,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /v1/scripts/sync
router.get("/v1/scripts/sync", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const apiKey = authHeader.split(" ")[1];
      const db = getDb();
      const token = apiKey.substring(0, 16);
      await db
        .query(
          `UPDATE routers SET provision_status = 'online', updated_at = CURRENT_TIMESTAMP WHERE id IN (SELECT router_id FROM provision_logs WHERE token = $1 AND router_id IS NOT NULL ORDER BY created_at DESC LIMIT 1)`,
          [token],
        )
        .catch(() => {});
      const tenant = await findTenantBySlugOrKey(token, null);
      if (tenant) {
        repairCredentials(tenant.id, token).catch(() => {});
      }
    }
  } catch (e) {}
  res.type("text/plain").send(':log info "[Billing] Sync OK"');
});

// GET /v1/:slug/routers/:routerId/diagnostics
router.get("/v1/:slug/routers/:routerId/diagnostics", async (req, res) => {
  try {
    const { slug, routerId } = req.params;
    const authHeader = req.headers.authorization;
    const apiKey = (authHeader && authHeader.startsWith("Bearer ")) ? authHeader.split(" ")[1] : null;

    const db = getDb();
    let tenant = await findTenantBySlugOrKey(slug, null);
    if (!tenant && apiKey) {
      tenant = await findTenantBySlugOrKey(null, apiKey);
    }
    if (!tenant) {
      return res.status(403).json({ error: "Invalid tenant or API key" });
    }

    const routerResult = await db.query("SELECT * FROM routers WHERE id = $1", [routerId]);
    if (routerResult.rows.length === 0) {
      return res.status(404).json({ error: "Router not found" });
    }
    const routerRow = routerResult.rows[0];

    const steps = [];

    // 1. Check if router has a management connection linked
    if (!routerRow.linked_mikrotik_connection_id) {
      steps.push({
        id: "credentials",
        label: "Management Credentials",
        status: "error",
        message: "No management credentials are configured for this router. Sync and push features will not work.",
        fix: "Upgrade to Full Management by submitting the router admin credentials below."
      });
      return res.json({ status: "error", steps });
    }

    // Load connection record
    const connResult = await db.query("SELECT * FROM mikrotik_connections WHERE id = $1", [routerRow.linked_mikrotik_connection_id]);
    if (connResult.rows.length === 0) {
      steps.push({
        id: "credentials",
        label: "Management Connection",
        status: "error",
        message: "The linked connection record was deleted or is missing from database.",
        fix: "Re-link this router by upgrading to full management again."
      });
      return res.json({ status: "error", steps });
    }
    const conn = connResult.rows[0];

    // Check TCP reachability
    const routerConnectionManager = require("../services/routerConnectionManager");
    const effectiveConn = routerConnectionManager.resolveEffectiveConfig({
      ...conn,
      wireguard_tunnel_ip: conn.wireguard_tunnel_ip || routerRow.wireguard_tunnel_ip || null,
      use_tunnel:
        Boolean(conn.use_tunnel) ||
        Boolean(conn.wireguard_tunnel_ip || routerRow.wireguard_tunnel_ip),
    });
    const effectiveHost = effectiveConn.ip_address;
    const targetPort = conn.connection_type === "ssh" ? (conn.ssh_port || 22) : (conn.api_port || 8728);
    const net = require("net");
    const checkTcp = () => new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2500);
      socket.on("connect", () => { socket.destroy(); resolve(true); });
      socket.on("timeout", () => { socket.destroy(); resolve(false); });
      socket.on("error", () => { socket.destroy(); resolve(false); });
       socket.connect(targetPort, effectiveHost);
    });

    const isTcpReachable = await checkTcp();
    steps.push({
      id: "api_service",
      label: "API Service Reachability",
      status: isTcpReachable ? "ok" : "error",
      message: isTcpReachable 
       ? `API port ${targetPort} is open and reachable at ${effectiveHost}.`
       : `Could not reach API port ${targetPort} at ${effectiveHost}. The router may be offline or firewall is blocking incoming connections.`,
       fix: isTcpReachable ? null : `/ip service enable api\n/ip firewall filter add chain=input protocol=tcp dst-port=${targetPort} action=accept comment="Allow Billing Server API" place-before=0`
    });

    if (!isTcpReachable) {
      return res.json({ status: "error", steps });
    }

    // Try connecting to verify credentials
    const config = {
      ip_address: effectiveHost,
      api_port: conn.api_port,
      ssh_port: conn.ssh_port,
      username: conn.username,
      password: require("../utils/encryption").decrypt(conn.password_encrypted),
      connection_type: conn.connection_type,
      use_tunnel: conn.use_tunnel,
      wireguard_tunnel_ip: conn.wireguard_tunnel_ip,
    };

    let isAuthOk = false;
    let authErrorMsg = "";
    try {
      await routerConnectionManager.testConnection(config);
      isAuthOk = true;
    } catch (authErr) {
      authErrorMsg = authErr.message || String(authErr);
    }

    steps.push({
      id: "credentials",
      label: "Router Authentication",
      status: isAuthOk ? "ok" : "error",
      message: isAuthOk 
        ? "API authentication credentials verified successfully."
        : `API login failed for user "${conn.username}". Error: ${authErrorMsg}.`,
      fix: isAuthOk ? null : "Enter the correct router Winbox admin username and password under 'Upgrade to Full Management' below and submit."
    });

    if (!isAuthOk) {
      return res.json({ status: "error", steps });
    }

    // If connected, query settings to verify RADIUS, PPPoE server, and Sync scheduler
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const isHttps = baseUrl.startsWith("https");
    const fetchMode = isHttps ? "https" : "http";
    const certFlag = isHttps ? "check-certificate=no" : "";

    try {
      const radiusClientList = await routerConnectionManager.print(conn, "/radius");
      const radiusOk = radiusClientList.some(r => r.address && r.service && r.service.includes("ppp"));
      
      steps.push({
        id: "radius_client",
        label: "RADIUS Client Configuration",
        status: radiusOk ? "ok" : "warning",
        message: radiusOk 
          ? "RADIUS client is configured on the router."
          : "RADIUS client is missing or not configured for PPP/Hotspot services.",
        fix: radiusOk ? null : `/radius add address=${process.env.RADIUS_SERVER || req.get("host")} secret="YOUR_RADIUS_SECRET" service=ppp,hotspot timeout=300ms comment="ISP RADIUS" disabled=no`
      });
    } catch (e) {
      steps.push({ id: "radius_client", label: "RADIUS Client Configuration", status: "warning", message: `Failed to check: ${e.message}` });
    }

    try {
      const pppoeServers = await routerConnectionManager.print(conn, "/interface/pppoe-server/server");
      const pppoeOk = pppoeServers.some(s => s.disabled === "false");
      steps.push({
        id: "pppoe_server",
        label: "PPPoE Server Service",
        status: pppoeOk ? "ok" : "warning",
        message: pppoeOk 
          ? "PPPoE server is running on the router."
          : "No active PPPoE server found on the router interface.",
        fix: pppoeOk ? null : `/interface pppoe-server server add service-name=pppoe-internet interface=bridge1 authentication=pap,chap,mschap1,mschap2 one-session-per-host=yes disabled=no`
      });
    } catch (e) {
      steps.push({ id: "pppoe_server", label: "PPPoE Server Service", status: "warning", message: `Failed to check: ${e.message}` });
    }

    try {
      const schedulers = await routerConnectionManager.print(conn, "/system/scheduler");
      const syncOk = schedulers.some(s => s.name === "billing-sync" && s.disabled === "false");
      steps.push({
        id: "billing_sync",
        label: "Billing Sync Scheduler",
        status: syncOk ? "ok" : "warning",
        message: syncOk 
          ? "Billing auto-sync scheduler is active."
          : "Billing auto-sync scheduler is missing or disabled on the router.",
        fix: syncOk ? null : `/system scheduler add name=billing-sync interval=5m on-event="/tool fetch url=\\"${baseUrl}/api/router/v1/${slug}/sync\\" http-header-field=\\"Authorization: Bearer ${apiKey}\\" mode=${fetchMode} ${certFlag} output=none" comment="ISP Billing Sync" disabled=no`
      });
    } catch (e) {
      steps.push({ id: "billing_sync", label: "Billing Sync Scheduler", status: "warning", message: `Failed to check: ${e.message}` });
    }

    res.json({ status: "ok", steps });
  } catch (err) {
    logger.error("Router diagnostics error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /v1/:slug/routers/:routerId/diagnostics/:stepId/apply
router.post("/v1/:slug/routers/:routerId/diagnostics/:stepId/apply", async (req, res) => {
  try {
    const { slug, routerId, stepId } = req.params;
    const authHeader = req.headers.authorization;
    const apiKey = (authHeader && authHeader.startsWith("Bearer ")) ? authHeader.split(" ")[1] : null;

    const db = getDb();
    let tenant = await findTenantBySlugOrKey(slug, null);
    if (!tenant && apiKey) {
      tenant = await findTenantBySlugOrKey(null, apiKey);
    }
    if (!tenant) {
      return res.status(403).json({ error: "Invalid tenant or API key" });
    }

    const routerResult = await db.query("SELECT * FROM routers WHERE id = $1", [routerId]);
    if (routerResult.rows.length === 0) {
      return res.status(404).json({ error: "Router not found" });
    }
    const routerRow = routerResult.rows[0];

    if (!routerRow.linked_mikrotik_connection_id) {
      return res.status(400).json({ error: "Router has no management connection linked" });
    }

    const connResult = await db.query("SELECT * FROM mikrotik_connections WHERE id = $1", [routerRow.linked_mikrotik_connection_id]);
    if (connResult.rows.length === 0) {
      return res.status(400).json({ error: "Linked connection not found" });
    }
    const conn = connResult.rows[0];

    const routerConnectionManager = require("../services/routerConnectionManager");

    if (stepId === "radius_client") {
      const radiusServer = process.env.RADIUS_SERVER || req.get("host");
      const radiusSecret = process.env.RADIUS_SECRET || (apiKey || slug).substring(0, 16);
      
      try {
        const existing = await routerConnectionManager.print(conn, "/radius");
        if (existing.length > 0) {
          await routerConnectionManager.executeCommand(conn, "/radius/set", {
            ".id": existing[0][".id"],
            address: radiusServer,
            secret: radiusSecret,
            service: "ppp,hotspot",
            comment: "ISP RADIUS",
            disabled: "no"
          });
        } else {
          await routerConnectionManager.executeCommand(conn, "/radius/add", {
            address: radiusServer,
            secret: radiusSecret,
            service: "ppp,hotspot",
            timeout: "300ms",
            comment: "ISP RADIUS",
            disabled: "no"
          });
        }
      } catch (e) {
        throw new Error(`Failed to configure RADIUS client: ${e.message}`);
      }
      return res.json({ success: true, message: "RADIUS client configured successfully" });
    }

    if (stepId === "pppoe_server") {
      try {
        const existing = await routerConnectionManager.print(conn, "/interface/pppoe-server/server");
        if (existing.length > 0) {
          await routerConnectionManager.executeCommand(conn, "/interface/pppoe-server/server/set", {
            ".id": existing[0][".id"],
            disabled: "no"
          });
        } else {
          await routerConnectionManager.executeCommand(conn, "/interface/pppoe-server/server/add", {
            "service-name": "pppoe-internet",
            interface: "bridge1",
            authentication: "pap,chap,mschap1,mschap2",
            "one-session-per-host": "yes",
            disabled: "no"
          });
        }
      } catch (e) {
        throw new Error(`Failed to configure PPPoE server: ${e.message}`);
      }
      return res.json({ success: true, message: "PPPoE server enabled successfully" });
    }

    if (stepId === "billing_sync") {
      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const isHttps = baseUrl.startsWith("https");
      const fetchMode = isHttps ? "https" : "http";
      const certFlag = isHttps ? "check-certificate=no" : "";
      const syncUrl = `${baseUrl}/api/router/v1/${slug}/sync`;

      try {
        const existing = await routerConnectionManager.print(conn, "/system/scheduler", { name: "billing-sync" });
        if (existing.length > 0) {
          await routerConnectionManager.executeCommand(conn, "/system/scheduler/remove", {
            ".id": existing[0][".id"]
          });
        }
        await routerConnectionManager.executeCommand(conn, "/system/scheduler/add", {
          name: "billing-sync",
          interval: "5m",
          "on-event": `/tool fetch url="${syncUrl}" http-header-field="Authorization: Bearer ${apiKey}" mode=${fetchMode} ${certFlag} output=none`,
          comment: "ISP Billing Sync",
          disabled: "no"
        });
      } catch (e) {
        throw new Error(`Failed to configure sync scheduler: ${e.message}`);
      }
      return res.json({ success: true, message: "Billing auto-sync scheduler installed successfully" });
    }

    res.status(400).json({ error: `Step '${stepId}' is not auto-fixable via this API` });
  } catch (err) {
    logger.error("Failed to apply diagnostics fix:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
