/**
 * CGNAT Tunnel Routes
 * API endpoints for managing WireGuard tunnels that bypass CGNAT
 * for MikroTik routers that cannot be reached directly.
 */

const express = require("express");
const router = express.Router();
const cgnatTunnelService = require("../services/cgnatTunnelService");
const getDb = () => global.db || require("../db/memory");
const db = { query: (...args) => getDb().query(...args) };
const { encrypt, decrypt } = require("../utils/encryption");

/**
 * GET /api/cgnat-tunnel/status
 * Get overall tunnel service status
 */
router.get("/status", async (req, res) => {
  try {
    const initialized = await cgnatTunnelService.initialize();
    const tunnels = await cgnatTunnelService.listTunnels();

    res.json({
      success: true,
      serviceInitialized: initialized,
      readiness: cgnatTunnelService.getReadiness(),
      serverPublicKey: cgnatTunnelService.serverPublicKey,
      serverEndpoint: cgnatTunnelService.getServerEndpoint(),
      serverPort: cgnatTunnelService.serverPort || parseInt(process.env.WG_TUNNEL_PORT || "51820", 10),
      tunnelSubnet: `${process.env.WG_TUNNEL_SUBNET || "10.200.0"}.0/24`,
      activeTunnels: tunnels.tunnels?.length || 0,
      tunnels: tunnels.tunnels || [],
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/cgnat-tunnel/tunnels
 * List all configured tunnels
 */
router.get("/tunnels", async (req, res) => {
  try {
    const result = await cgnatTunnelService.listTunnels();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cgnat-tunnel/create
 * Create a WireGuard tunnel for a router behind CGNAT
 * Body: { connectionId, routerPublicKey? }
 */
router.post("/create", async (req, res) => {
  try {
    const { connectionId, routerPublicKey } = req.body;

    if (!connectionId) {
      return res.status(400).json({
        success: false,
        error: "connectionId is required",
      });
    }

    // Verify connection exists
    const connResult = await db.query(
      "SELECT id, name, ip_address, use_tunnel FROM mikrotik_connections WHERE id = $1",
      [connectionId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Connection not found",
      });
    }

    const connection = connResult.rows[0];

    // Check if already behind CGNAT
    const isCGNAT = cgnatTunnelService.isCGNATIpAddress(connection.ip_address);

    const result = await cgnatTunnelService.createTunnel(connectionId, routerPublicKey);

    res.json({
      ...result,
      isCGNAT,
      hint: isCGNAT
        ? `${connection.ip_address} appears to be a private/CGNAT address. A WireGuard tunnel is the recommended solution.`
        : `${connection.ip_address} appears to be a public IP. A tunnel may not be needed unless the router is still unreachable.`,
    });
  } catch (error) {
    const status = error.message.includes("WireGuard tunnel server is not ready") ? 503 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/cgnat-tunnel/:connectionId
 * Remove a WireGuard tunnel
 */
router.delete("/:connectionId", async (req, res) => {
  try {
    const { connectionId } = req.params;
    const result = await cgnatTunnelService.removeTunnel(connectionId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/cgnat-tunnel/:connectionId/status
 * Get tunnel status for a specific router
 */
router.get("/:connectionId/status", async (req, res) => {
  try {
    const { connectionId } = req.params;
    const result = await cgnatTunnelService.getTunnelStatus(connectionId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/cgnat-tunnel/:connectionId/mikrotik-script
 * Get the MikroTik configuration script for an existing tunnel
 */
router.get("/:connectionId/mikrotik-script", async (req, res) => {
  try {
    const { connectionId } = req.params;
    const script = await cgnatTunnelService.generateExistingRouterTunnelScript(connectionId);
    res.json({ success: true, script });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/cgnat-tunnel/server-setup-script
 * Get the server-side WireGuard setup script
 */
router.get("/scripts/server-setup", async (req, res) => {
  try {
    const script = await cgnatTunnelService.generateServerSetupScript();
    res.type("text/plain").send(script);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cgnat-tunnel/health/sync
 * Refresh is_online/last_seen for all tunnel routers from WireGuard handshakes.
 */
router.post("/health/sync", async (req, res) => {
  try {
    const staleSeconds = parseInt(req.body?.staleSeconds, 10) || 180;
    const result = await cgnatTunnelService.syncTunnelHealth(staleSeconds);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cgnat-tunnel/detect-cgnat
 * Check if an IP address appears to be behind CGNAT
 * Body: { ip_address }
 */
router.post("/detect-cgnat", async (req, res) => {
  try {
    const { ip_address } = req.body;

    if (!ip_address) {
      return res.status(400).json({
        success: false,
        error: "ip_address is required",
      });
    }

    const isCGNAT = cgnatTunnelService.isCGNATIpAddress(ip_address);
    const isTunnelIp = ip_address.startsWith(
      (process.env.WG_TUNNEL_SUBNET || "10.200.0").split(".")[0] + "." +
      (process.env.WG_TUNNEL_SUBNET || "10.200.0").split(".")[1] + "."
    );

    res.json({
      success: true,
      ip_address,
      isCGNAT,
      isTunnelIp,
      recommendation: isCGNAT
        ? "This IP is in a private/CGNAT range. Set up a WireGuard tunnel for remote access."
        : isTunnelIp
          ? "This is already a WireGuard tunnel IP. The router should be reachable through the tunnel."
          : "This appears to be a public IP. Direct connection should work if the router is online.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cgnat-tunnel/:connectionId/regenerate-keys
 * Regenerate WireGuard keys for a router tunnel
 */
router.post("/:connectionId/regenerate-keys", async (req, res) => {
  try {
    const { connectionId } = req.params;
    const initialized = await cgnatTunnelService.initialize();
    if (!initialized) {
      return res.status(503).json({
        success: false,
        error: "Could not initialize CGNAT tunnel storage. Check the database connection.",
      });
    }
    const readiness = cgnatTunnelService.getReadiness();
    if (!readiness.ready) {
      return res.status(503).json({
        success: false,
        error: `WireGuard tunnel server is not ready: ${readiness.blockers.join(" ")}`,
        readiness,
      });
    }

    // Remove old tunnel and create new one
    await cgnatTunnelService.removeTunnel(connectionId);
    const result = await cgnatTunnelService.createTunnel(connectionId);

    res.json({
      ...result,
      message: "Keys regenerated. Apply the new mikrotikScript on your router to update the tunnel.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cgnat-tunnel/new-router-script
 * Pre-allocate a WireGuard tunnel for a brand-new router and return a
 * combined RouterOS script (WireGuard setup + API enable + enrollment).
 * Paste the script ONCE on the MikroTik terminal — done.
 *
 * Body: { routerName, apiUsername?, apiPassword, apiPort?, serverUrl, tenantSlug, enrollApiKey }
 */
router.post("/new-router-script", async (req, res) => {
  try {
    const {
      routerName,
      apiUsername = "billing",
      apiPassword,
      apiPort = 8728,
      serverUrl,
      tenantSlug,
      enrollApiKey,
    } = req.body;

    if (!routerName) return res.status(400).json({ success: false, error: "routerName is required" });
    if (!apiPassword) return res.status(400).json({ success: false, error: "apiPassword is required" });
    if (!serverUrl) return res.status(400).json({ success: false, error: "serverUrl is required" });
    if (!enrollApiKey) return res.status(400).json({ success: false, error: "enrollApiKey is required" });

    const initialized = await cgnatTunnelService.initialize();
    if (!initialized) {
      return res.status(503).json({
        success: false,
        error: "Could not initialize CGNAT tunnel storage. Check the database connection.",
      });
    }
    const readiness = cgnatTunnelService.getReadiness();
    if (!readiness.ready) {
      return res.status(503).json({
        success: false,
        error: `WireGuard tunnel server is not ready: ${readiness.blockers.join(" ")}`,
        readiness,
      });
    }

    // Create a placeholder mikrotik_connections row so we can call createTunnel()
    const safeName = routerName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
    const encryptedPassword = encrypt(apiPassword);
    const insertResult = await (global.db || db).query(
      `INSERT INTO mikrotik_connections
         (name, ip_address, api_port, username, password_encrypted, connection_type, is_online, use_tunnel, created_at, updated_at)
       VALUES ($1, '0.0.0.0', $2, $3, $4, 'api', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [safeName, parseInt(apiPort, 10) || 8728, apiUsername, encryptedPassword]
    );

    const connectionId = insertResult.rows[0].id;

    // Generate WireGuard tunnel (allocates tunnel IP + keys)
    const tunnel = await cgnatTunnelService.createTunnel(connectionId);
    if (!tunnel.success) {
      // Clean up placeholder on failure
      await db.query("DELETE FROM mikrotik_connections WHERE id = $1", [connectionId]).catch(() => {});
      return res.status(500).json({ success: false, error: tunnel.error || "Failed to create tunnel" });
    }

    const slugPath = tenantSlug ? `/v1/${tenantSlug}/install` : "/v1/scripts/install";

    const script = cgnatTunnelService.generateCombinedLinkScript({
      routerName,
      routerPrivateKey: tunnel.routerPrivateKey,
      routerTunnelIp: tunnel.routerTunnelIp,           // "10.200.0.X/24" — now returned by createTunnel
      serverPublicKey: cgnatTunnelService.serverPublicKey,
      serverEndpoint: cgnatTunnelService.getServerEndpoint(),
      serverWgPort: tunnel.serverPort,                  // was tunnel.serverWgPort (undefined)
      serverWgIp: cgnatTunnelService.serverWgIp,
      interfaceName: tunnel.interfaceName,              // now returned by createTunnel
      apiUsername,
      apiPassword,
      apiPort: parseInt(apiPort, 10) || 8728,
      serverUrl: serverUrl.replace(/\/$/, ""),
      slugPath,
      enrollApiKey,
    });

    res.json({
      success: true,
      connectionId,
      tunnelIp: tunnel.routerTunnelIp,
      interfaceName: tunnel.interfaceName,
      script,
      hint: `Apply this script on ${routerName} — it sets up WireGuard, enables the API, and enrolls the router in one step.`,
    });
  } catch (error) {
    const status = error.message.includes("WireGuard tunnel server is not ready") ? 503 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

module.exports = router;
