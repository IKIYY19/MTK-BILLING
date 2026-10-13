/**
 * CGNAT Tunnel Service
 * Manages WireGuard tunnels for MikroTik routers behind CGNAT.
 *
 * When a MikroTik router sits behind Carrier-Grade NAT, the billing server
 * cannot reach it directly. This service creates and manages a WireGuard
 * tunnel on the server side. The router initiates an outbound WireGuard
 * connection (which always works through CGNAT), and the billing server
 * reaches the router through the tunnel IP.
 *
 * Architecture:
 *   Billing Server (VPS)  <--- WireGuard Tunnel --->  MikroTik (behind CGNAT)
 *   Public IP: x.x.x.x                                  Private IP via CGNAT
 *   WG IP: 10.200.0.1                                   WG IP: 10.200.0.2
 *
 * The router's `ip_address` in mikrotik_connections is set to the
 * WireGuard tunnel IP (e.g. 10.200.0.2), and the connection manager
 * routes API/SSH traffic through the WireGuard interface.
 */

const { execSync, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const net = require("net");

// Try to import the application logger, fall back to console if unavailable
let logger;
try {
  logger = require("../utils/logger");
} catch (e) {
  logger = { info: console.log, error: console.error, warn: console.warn, debug: console.log };
}

const WG_CONFIG_DIR = process.env.WG_CONFIG_DIR || "/etc/wireguard";
const WG_INTERFACE = process.env.WG_INTERFACE || "wg-billing";
const WG_TUNNEL_SUBNET = process.env.WG_TUNNEL_SUBNET || "10.200.0";
const WG_TUNNEL_PORT = parseInt(process.env.WG_TUNNEL_PORT || "51820", 10);
const WG_CONFIG_PATH = path.join(WG_CONFIG_DIR, `${WG_INTERFACE}.conf`);
const WG_PERSISTENT_KEEPALIVE = process.env.WG_PERSISTENT_KEEPALIVE || "25";

class CGNATTunnelService {
  constructor() {
    this.tunnels = new Map(); // routerId -> tunnel info
    this.serverPublicKey = null;
    this.serverPrivateKey = null;
    this.serverWgIp = `${WG_TUNNEL_SUBNET}.1`;
    this.serverPort = WG_TUNNEL_PORT;
    this.initialized = false;
  }

  /**
   * Get database connection
   */
  getDb() {
    return global.dbAvailable ? global.db : require("../db/memory");
  }

  /**
   * Initialize the tunnel service - load or generate server keys
   */
  async initialize() {
    if (this.initialized) return true;

    try {
      const db = this.getDb();

      // Ensure system_keys table exists BEFORE querying it
      await db.query(`
        CREATE TABLE IF NOT EXISTS system_keys (
          key_name VARCHAR(100) PRIMARY KEY,
          key_value TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Try to load existing keys from DB
      const keyResult = await db.query(
        "SELECT key_name, key_value FROM system_keys WHERE key_name LIKE 'wireguard_%'"
      );

      const keys = {};
      for (const row of (keyResult.rows || [])) {
        keys[row.key_name] = row.key_value;
      }

      if (keys.wireguard_server_private && keys.wireguard_server_public) {
        this.serverPrivateKey = keys.wireguard_server_private;
        this.serverPublicKey = keys.wireguard_server_public;
      } else {
        // Generate new keys
        const keyPair = this.generateKeyPair();
        this.serverPrivateKey = keyPair.privateKey;
        this.serverPublicKey = keyPair.publicKey;

        // Store in DB
        await this.storeKey("wireguard_server_private", keyPair.privateKey);
        await this.storeKey("wireguard_server_public", keyPair.publicKey);
      }

      // Load existing tunnels from DB
      await this.loadTunnelsFromDB();

      this.initialized = true;
      logger.info("CGNAT Tunnel Service initialized", {
        serverPublicKey: this.serverPublicKey?.substring(0, 20) + "...",
        tunnelsActive: this.tunnels.size,
      });
      return true;
    } catch (error) {
      logger.error("Failed to initialize CGNAT Tunnel Service", {
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Store a system key in the database
   */
  async storeKey(keyName, keyValue) {
    const db = this.getDb();
    try {
      // Ensure table exists
      await db.query(`
        CREATE TABLE IF NOT EXISTS system_keys (
          key_name VARCHAR(100) PRIMARY KEY,
          key_value TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.query(
        `INSERT INTO system_keys (key_name, key_value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key_name) DO UPDATE SET key_value = $2, updated_at = NOW()`,
        [keyName, keyValue]
      );
    } catch (error) {
      logger.error("Failed to store system key", { keyName, error: error.message });
    }
  }

  /**
   * Generate a WireGuard key pair
   */
  generateKeyPair() {
    if (process.platform === "linux") {
      try {
        const privateKey = execFileSync("wg", ["genkey"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        const publicKey = execFileSync("wg", ["pubkey"], {
          encoding: "utf8",
          input: privateKey,
          stdio: ["pipe", "pipe", "ignore"],
        }).trim();
        return { privateKey, publicKey };
      } catch {
        // Fall back to Node's X25519 implementation when wireguard-tools are absent.
      }
    }

    const pair = crypto.generateKeyPairSync("x25519");
    const privateKey = pair.privateKey
      .export({ format: "der", type: "pkcs8" })
      .subarray(-32)
      .toString("base64");
    const publicKey = pair.publicKey
      .export({ format: "der", type: "spki" })
      .subarray(-32)
      .toString("base64");
    return { privateKey, publicKey };
  }

  getReadiness() {
    const endpoint = this.getServerEndpoint();
    const endpointConfigured = Boolean(endpoint && this.isValidServerEndpoint(endpoint));
    let wireguardAvailable = false;
    let interfaceActive = false;

    if (process.platform === "linux") {
      try {
        execFileSync("wg", ["--version"], { stdio: "ignore", timeout: 5000 });
        wireguardAvailable = true;
      } catch {
        wireguardAvailable = false;
      }

      if (wireguardAvailable) {
        try {
          execFileSync("wg", ["show", WG_INTERFACE], {
            stdio: "ignore",
            timeout: 5000,
          });
          interfaceActive = true;
        } catch {
          interfaceActive = false;
        }
      }
    }

    const blockers = [];
    if (process.platform !== "linux") {
      blockers.push("Run the tunnel service on a Linux VPS with a public, reachable endpoint.");
    } else if (!wireguardAvailable) {
      blockers.push("Install WireGuard tools on the Linux server and run the server setup script.");
    } else if (!interfaceActive) {
      blockers.push(`Start the ${WG_INTERFACE} WireGuard interface by running the server setup script.`);
    }
    if (!endpointConfigured) {
      blockers.push("Set WG_SERVER_ENDPOINT to the VPS public IP address or DNS name.");
    }

    return {
      ready: blockers.length === 0,
      wireguardAvailable,
      interfaceActive,
      endpointConfigured,
      blockers,
    };
  }

  isValidServerEndpoint(endpoint) {
    const value = String(endpoint || "").trim();
    if (!value || value.includes("://") || /[\s/]/.test(value)) return false;
    if (net.isIP(value)) return true;
    return /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/.test(value);
  }

  /**
   * Load tunnels from database
   */
  async loadTunnelsFromDB() {
    const db = this.getDb();
    try {
      const result = await db.query(
        `SELECT id, name, ip_address, use_tunnel, tunnel_host, tunnel_port,
                tunnel_username, wireguard_tunnel_ip, wireguard_public_key,
                wireguard_interface_name
         FROM mikrotik_connections
         WHERE use_tunnel = true AND wireguard_public_key IS NOT NULL`
      );

      for (const row of result.rows) {
        this.tunnels.set(row.id, {
          routerId: row.id,
          routerName: row.name,
          tunnelIp: row.wireguard_tunnel_ip || row.ip_address,
          publicKey: row.wireguard_public_key,
          interfaceName: row.wireguard_interface_name || "wg-billing",
        });
      }
    } catch (error) {
      logger.debug("Could not load tunnels from DB", { error: error.message });
    }
  }

  /**
   * Allocate a new tunnel IP address
   */
  async allocateTunnelIp() {
    const db = this.getDb();
    try {
      const result = await db.query(
        `SELECT wireguard_tunnel_ip FROM mikrotik_connections
         WHERE wireguard_tunnel_ip IS NOT NULL AND wireguard_tunnel_ip != ''`
      );

      const usedIps = new Set();
      for (const row of result.rows) {
        if (row.wireguard_tunnel_ip) {
          usedIps.add(row.wireguard_tunnel_ip.split("/")[0].trim());
        }
      }

      // Also check in-memory tunnels
      for (const [, tunnel] of this.tunnels) {
        usedIps.add(tunnel.tunnelIp?.split("/")[0].trim());
      }

      // Allocate from 10.200.0.2 - 10.200.0.254
      for (let i = 2; i <= 254; i++) {
        const ip = `${WG_TUNNEL_SUBNET}.${i}`;
        if (!usedIps.has(ip)) {
          return `${ip}/24`;
        }
      }

      throw new Error("No available tunnel IP addresses in subnet");
    } catch (error) {
      logger.error("Failed to allocate tunnel IP", { error: error.message });
      throw error;
    }
  }

  /**
   * Create a new WireGuard tunnel for a router
   * Returns the configuration that needs to be applied to the MikroTik
   */
  async createTunnel(connectionId, routerPublicKey = null) {
    const initialized = await this.initialize();
    if (!initialized) {
      throw new Error("Could not initialize CGNAT tunnel storage. Check the database connection.");
    }
    const readiness = this.getReadiness();
    if (!readiness.ready) {
      throw new Error(`WireGuard tunnel server is not ready: ${readiness.blockers.join(" ")}`);
    }

    const db = this.getDb();

    // Get connection details
    const connResult = await db.query(
      "SELECT * FROM mikrotik_connections WHERE id = $1",
      [connectionId]
    );
    if (connResult.rows.length === 0) {
      throw new Error("Connection not found");
    }

    const connection = connResult.rows[0];

    // Generate router key pair if not provided
    let routerPrivateKey, routerPubKey;
    if (routerPublicKey) {
      routerPubKey = routerPublicKey;
      // We don't have the private key - router already has it
    } else {
      const keyPair = this.generateKeyPair();
      routerPrivateKey = keyPair.privateKey;
      routerPubKey = keyPair.publicKey;
    }

    // Allocate tunnel IP
    const tunnelIpWithMask = await this.allocateTunnelIp();
    const tunnelIp = tunnelIpWithMask.split("/")[0];

    // Determine interface name
    const wgInterfaceName = `wg-${connection.name?.replace(/[^a-zA-Z0-9]/g, "")?.substring(0, 8) || connectionId.substring(0, 8)}`;

    // Store tunnel info in database
    await db.query(
      `UPDATE mikrotik_connections
       SET use_tunnel = true,
           wireguard_tunnel_ip = $1,
           wireguard_public_key = $2,
           wireguard_interface_name = $3,
           wireguard_private_key = $4,
           ip_address = CASE WHEN ip_address LIKE '${WG_TUNNEL_SUBNET}%' THEN ip_address ELSE $1 END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [tunnelIpWithMask, routerPubKey, wgInterfaceName, routerPrivateKey || null, connectionId]
    );

    // Add to in-memory tunnels
    this.tunnels.set(connectionId, {
      routerId: connectionId,
      routerName: connection.name,
      tunnelIp,
      publicKey: routerPubKey,
      interfaceName: wgInterfaceName,
    });

    // Update WireGuard server config
    await this.updateWireGuardServerConfig();

    // Generate MikroTik configuration script
    const mikrotikScript = this.generateMikrotikConfig({
      routerPrivateKey: routerPrivateKey,
      routerTunnelIp: tunnelIpWithMask,
      serverPublicKey: this.serverPublicKey,
      serverEndpoint: this.getServerEndpoint(),
      serverWgPort: WG_TUNNEL_PORT,
      interfaceName: wgInterfaceName,
      allowedAddresses: `${this.serverWgIp}/32`,
    });

    logger.info("WireGuard tunnel created for router", {
      connectionId,
      tunnelIp,
      interfaceName: wgInterfaceName,
    });

    return {
      success: true,
      tunnelIp,
      routerTunnelIp: tunnelIpWithMask,  // with /24 CIDR — used by generateCombinedLinkScript
      interfaceName: wgInterfaceName,
      routerPublicKey: routerPubKey,
      routerPrivateKey: routerPrivateKey,
      serverPublicKey: this.serverPublicKey,
      serverEndpoint: this.getServerEndpoint(),
      serverPort: WG_TUNNEL_PORT,
      serverWgPort: WG_TUNNEL_PORT,       // alias used by new-router-script route
      mikrotikScript,
      message: "Apply the mikrotikScript on your router to establish the tunnel, then update the connection IP to the tunnel IP.",
    };
  }

  /**
   * Remove a WireGuard tunnel for a router
   */
  async removeTunnel(connectionId) {
    const db = this.getDb();

    await db.query(
      `UPDATE mikrotik_connections
       SET use_tunnel = false,
           wireguard_tunnel_ip = NULL,
           wireguard_public_key = NULL,
           wireguard_interface_name = NULL,
           wireguard_private_key = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [connectionId]
    );

    this.tunnels.delete(connectionId);

    // Update WireGuard server config
    await this.updateWireGuardServerConfig();

    logger.info("WireGuard tunnel removed for router", { connectionId });

    return { success: true, message: "Tunnel removed" };
  }

  /**
   * Generate the server-side WireGuard setup script.
   * Uses the ACTUAL server private key stored in the DB so the router scripts
   * and this config are always in sync.
   */
  async generateServerSetupScript() {
    await this.initialize();

    const serverPrivateKey = this.serverPrivateKey || "(run service once to generate)";
    const serverPublicKey = this.serverPublicKey || "(run service once to generate)";
    const peerConfigs = [...this.tunnels.values()]
      .map((tunnel) => {
        const tunnelIpOnly = tunnel.tunnelIp?.split("/")[0] || tunnel.tunnelIp;
        return `
[Peer]
# Router: ${tunnel.routerName} (${tunnel.routerId})
PublicKey = ${tunnel.publicKey}
AllowedIPs = ${tunnelIpOnly}/32`;
      })
      .join("\n");

    return `#!/bin/bash
#############################################
# MikroTik Billing - WireGuard Server Setup
# Run this ONCE on your billing server/VPS
# as root (or with sudo).
#
# Server public key : ${serverPublicKey}
# Tunnel subnet     : ${WG_TUNNEL_SUBNET}.0/24
# Listen port       : ${WG_TUNNEL_PORT}
# Interface         : ${WG_INTERFACE}
#############################################

set -e

echo "=== MikroTik Billing WireGuard Server Setup ==="

# ── 1. Install WireGuard ─────────────────────────────────────────────────────
if ! command -v wg &> /dev/null; then
    echo "Installing WireGuard..."
    if command -v apt-get &> /dev/null; then
        apt-get update -qq && apt-get install -y wireguard wireguard-tools
    elif command -v yum &> /dev/null; then
        yum install -y wireguard-tools
    elif command -v dnf &> /dev/null; then
        dnf install -y wireguard-tools
    else
        echo "ERROR: Cannot install WireGuard automatically. Install wireguard-tools manually."
        exit 1
    fi
    echo "WireGuard installed."
else
    echo "WireGuard already installed."
fi

# ── 2. Enable IP forwarding ──────────────────────────────────────────────────
echo "Enabling IP forwarding..."
sysctl -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/99-wireguard-billing.conf
sysctl -p /etc/sysctl.d/99-wireguard-billing.conf 2>/dev/null || true

# ── 3. Write WireGuard config ────────────────────────────────────────────────
# This uses the EXACT private key the billing service generated and stored in
# its database. Router scripts embed the matching public key.
echo "Writing WireGuard config..."
mkdir -p ${WG_CONFIG_DIR}

cat > ${WG_CONFIG_PATH} << 'WGEOF'
[Interface]
# MikroTik Billing - WireGuard Tunnel Server
# Auto-managed by CGNAT Tunnel Service — do NOT manually add/remove peers here.
Address = ${WG_TUNNEL_SUBNET}.1/24
ListenPort = ${WG_TUNNEL_PORT}
PrivateKey = ${serverPrivateKey}
SaveConfig = false
${peerConfigs}
WGEOF

# Replace shell variable placeholders in the heredoc output
sed -i "s|\\${WG_TUNNEL_SUBNET}|${WG_TUNNEL_SUBNET}|g; s|\\${WG_TUNNEL_PORT}|${WG_TUNNEL_PORT}|g; s|\\${serverPrivateKey}|${serverPrivateKey}|g" ${WG_CONFIG_PATH}
chmod 600 ${WG_CONFIG_PATH}
echo "Config written to ${WG_CONFIG_PATH}"

# ── 4. Open firewall ─────────────────────────────────────────────────────────
echo "Opening firewall port ${WG_TUNNEL_PORT}/udp..."
if command -v ufw &> /dev/null; then
    ufw allow ${WG_TUNNEL_PORT}/udp
    echo "UFW rule added."
elif command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-port=${WG_TUNNEL_PORT}/udp && firewall-cmd --reload
    echo "Firewalld rule added."
else
    echo "WARNING: Add UDP ${WG_TUNNEL_PORT} to your firewall manually."
fi

# ── 5. Start WireGuard ───────────────────────────────────────────────────────
echo "Starting WireGuard interface..."
wg-quick down ${WG_INTERFACE} 2>/dev/null || true
wg-quick up   ${WG_INTERFACE}

# Enable on boot
systemctl enable wg-quick@${WG_INTERFACE} 2>/dev/null || true

echo ""
echo "=== Setup Complete ==="
echo "Interface   : ${WG_INTERFACE}"
echo "Listen port : ${WG_TUNNEL_PORT}"
echo "Server IP   : ${WG_TUNNEL_SUBNET}.1/24"
echo "Public key  : ${serverPublicKey}"
echo ""
echo "Router scripts generated by the billing dashboard already include this"
echo "public key. Paste a generated script on each MikroTik to connect it."
echo ""
echo "To verify: run 'wg show ${WG_INTERFACE}' after a router connects."
`;
  }

  /**
   * Get the server's public endpoint address
   */
  getServerEndpoint() {
    return (
      process.env.WG_SERVER_ENDPOINT?.trim() ||
      process.env.SERVER_PUBLIC_IP?.trim() ||
      null
    );
  }

  /**
   * Update the WireGuard server configuration file
   * This writes the wg-billing.conf file with all peer entries
   */
  async updateWireGuardServerConfig() {
    const peers = [];

    for (const [, tunnel] of this.tunnels) {
      const tunnelIpOnly = tunnel.tunnelIp?.split("/")[0] || tunnel.tunnelIp;
      peers.push(`
[Peer]
# Router: ${tunnel.routerName} (${tunnel.routerId})
PublicKey = ${tunnel.publicKey}
AllowedIPs = ${tunnelIpOnly}/32`);
    }

    const config = `[Interface]
# MikroTik Billing - WireGuard Tunnel Server
# Auto-generated by CGNAT Tunnel Service - DO NOT EDIT MANUALLY
Address = ${this.serverWgIp}/24
ListenPort = ${WG_TUNNEL_PORT}
PrivateKey = ${this.serverPrivateKey}
SaveConfig = false
${peers.join("\n")}
`;

    // Write config file
    try {
      // Ensure directory exists
      const configDir = path.dirname(WG_CONFIG_PATH);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      fs.writeFileSync(WG_CONFIG_PATH, config, { mode: 0o600 });

      // Try to reload WireGuard
      await this.reloadWireGuard();

      logger.info("WireGuard server config updated", {
        peerCount: this.tunnels.size,
        configPath: WG_CONFIG_PATH,
      });
    } catch (error) {
      logger.warn("Could not write WireGuard config file", {
        error: error.message,
        configPath: WG_CONFIG_PATH,
        hint: "Run the server as root or set WG_CONFIG_DIR to a writable directory",
      });
    }

    return config;
  }

  /**
   * Reload the WireGuard interface
   */
  async reloadWireGuard() {
    try {
      execSync(`wg syncconf ${WG_INTERFACE} <(wg-quick strip ${WG_INTERFACE})`, {
        encoding: "utf8",
        timeout: 10000,
        shell: "/bin/bash",
      });
      logger.info("WireGuard configuration reloaded", { interface: WG_INTERFACE });
    } catch (error) {
      // Try alternative: bring down and up
      try {
        execSync(`wg-quick down ${WG_INTERFACE} 2>/dev/null; wg-quick up ${WG_INTERFACE}`, {
          encoding: "utf8",
          timeout: 15000,
          shell: "/bin/bash",
        });
        logger.info("WireGuard interface restarted", { interface: WG_INTERFACE });
      } catch (e2) {
        logger.debug("Could not reload WireGuard (may not be running on this host)", {
          error: e2.message,
        });
      }
    }
  }

  /**
   * Generate a combined RouterOS script: WireGuard setup + API enable + enrollment.
   * Paste this ONCE on the MikroTik terminal — the router fully links itself.
   */
  generateCombinedLinkScript({
    routerName,
    routerPrivateKey,
    routerTunnelIp,
    serverPublicKey,
    serverEndpoint,
    serverWgPort,
    serverWgIp,
    interfaceName,
    apiUsername,
    apiPassword,
    apiPort,
    serverUrl,
    slugPath,
    enrollApiKey,
  }) {
    const tunnelIpPlain = routerTunnelIp.split("/")[0];
    const ts = new Date().toISOString().slice(0, 16).replace("T", " ");

    return `#############################################
# MikroTik Billing -- WireGuard + Auto-Link
# Router  : ${routerName}
# Server  : ${serverUrl}
# Tunnel  : ${tunnelIpPlain}
# Created : ${ts} UTC
# Requires: RouterOS v7.x (WireGuard support)
#############################################

:log info "=== Billing setup starting: ${routerName} ==="
:put "============================================"
:put " MikroTik Billing - WireGuard Remote Link"
:put " Router: ${routerName}"
:put "============================================"
:put ""

# ──────────────────────────────────────────────
# PHASE 1/4 -- WireGuard interface
# ──────────────────────────────────────────────
:put ">>> [1/4] Configuring WireGuard tunnel..."
:local wgIface "${interfaceName}"
:do { /interface wireguard remove [find name=$wgIface] } on-error={}
:delay 500ms
/interface wireguard add name=$wgIface private-key="${routerPrivateKey}" listen-port=13231 comment="billing-mgmt"
/interface wireguard peers add interface=$wgIface public-key="${serverPublicKey}" endpoint-address=${serverEndpoint} endpoint-port=${serverWgPort} allowed-address=${serverWgIp}/32 persistent-keepalive=25s comment="billing-server"
:do { /ip address remove [find comment="billing-tunnel-ip"] } on-error={}
/ip address add address=${routerTunnelIp} interface=$wgIface comment="billing-tunnel-ip"
:do { /ip firewall filter remove [find comment="billing-wg-in"] } on-error={}
/ip firewall filter add chain=input protocol=udp dst-port=13231 action=accept comment="billing-wg-in" place-before=0
:put ">>> [1/4] WireGuard interface ready"

# ──────────────────────────────────────────────
# PHASE 2/4 -- Enable router API
# ──────────────────────────────────────────────
:put ">>> [2/4] Enabling API service..."
/ip service set api disabled=no port=${apiPort}
:do { /user remove [find name="${apiUsername}"] } on-error={}
/user add name="${apiUsername}" group=full password="${apiPassword}" comment="MikroTik Billing API"
:put ">>> [2/4] API user '${apiUsername}' ready on port ${apiPort}"

# ──────────────────────────────────────────────
# PHASE 3/4 -- Wait for WireGuard to connect
# ──────────────────────────────────────────────
:put ">>> [3/4] Waiting for WireGuard tunnel (12s)..."
:delay 12s
:local tunnelUp [/interface wireguard get [find name=$wgIface] running]
:if ($tunnelUp) do={
  :put ">>> [3/4] Tunnel is UP -- server can reach ${tunnelIpPlain}"
} else={
  :put ">>> [3/4] WARN: Tunnel not up yet. Ensure UDP ${serverWgPort} is open to ${serverEndpoint}"
  :put ">>> Continuing enrollment -- retry if billing shows router offline."
}

# ──────────────────────────────────────────────
# PHASE 4/4 -- Enroll with billing server
# ──────────────────────────────────────────────
:put ">>> [4/4] Enrolling with billing server..."
:global ztpMgmtUser "${apiUsername}"
:global ztpMgmtPass "${apiPassword}"
:global ztpMgmtPort "${apiPort}"
/tool fetch url="${serverUrl}/api/router${slugPath}" http-header-field="Authorization: Bearer ${enrollApiKey}" dst-path=install.rsc mode=https check-certificate=no
:delay 5s
/import file-name=install.rsc
:delay 3s
:do { /file remove install.rsc } on-error={}

:put ""
:put "============================================"
:put " Setup complete!"
:put " Tunnel IP : ${tunnelIpPlain}"
:put " API port  : ${apiPort}"
:put " API user  : ${apiUsername}"
:put " The billing dashboard will show this router"
:put " as ONLINE once the tunnel handshake occurs."
:put "============================================"
:log info "=== Billing setup complete: ${routerName} (${tunnelIpPlain}) ==="
`;
  }

  generateMikrotikConfig({
    routerPrivateKey,
    routerTunnelIp,
    serverPublicKey,
    serverEndpoint,
    serverWgPort,
    interfaceName,
    allowedAddresses,
  }) {
    return `#############################################
# MikroTik CGNAT Bypass - WireGuard Tunnel Setup
# Generated by MikroTik Billing CGNAT Tunnel Service
# Apply this script on your MikroTik router (RouterOS v7+)
#############################################

# --- Create WireGuard Interface ---
:do {
  /interface wireguard remove [find name="${interfaceName}"]
} on-error={}

:delay 500ms

/interface wireguard add name="${interfaceName}" private-key="${routerPrivateKey}" listen-port=13231 comment="Billing management tunnel"

# --- Add Server Peer ---
/interface wireguard peers add interface=${interfaceName} public-key="${serverPublicKey}" endpoint-address=${serverEndpoint} endpoint-port=${serverWgPort} allowed-address=${allowedAddresses} persistent-keepalive=25s comment="Billing server"

# --- Assign Tunnel IP Address ---
/ip address add address=${routerTunnelIp} interface=${interfaceName} comment="Billing tunnel IP"

# --- Firewall: Allow WireGuard ---
:do {
  /ip firewall filter remove [find comment="Allow WireGuard billing"]
} on-error={}
/ip firewall filter add chain=input protocol=udp dst-port=13231 action=accept comment="Allow WireGuard billing" place-before=0

# --- NAT Masquerade (for LAN access through tunnel) ---
:do {
  /ip firewall nat remove [find comment="Billing tunnel masquerade"]
} on-error={}
/ip firewall nat add chain=srcnat out-interface=${interfaceName} action=masquerade comment="Billing tunnel masquerade"

# --- Verify ---
:delay 3s
:local wgStatus [/interface wireguard get [find name="${interfaceName}"] running]
:if ($wgStatus) do={
  :put "[CGNAT] WireGuard tunnel is UP"
  :put "[CGNAT] Tunnel IP: ${routerTunnelIp}"
  :put "[CGNAT] Server: ${serverEndpoint}:${serverWgPort}"
  :put "[CGNAT] You can now manage this router remotely via the tunnel IP"
} else={
  :put "[CGNAT] WireGuard tunnel is NOT UP - check endpoint and keys"
  :put "[CGNAT] Verify: ${serverEndpoint}:${serverWgPort} is reachable"
}

#############################################
# After applying this script:
# 1. Verify tunnel with: /interface wireguard print
# 2. Check peer with: /interface wireguard peers print
# 3. Update billing system: set connection IP to ${routerTunnelIp.split("/")[0]}
#############################################`;
  }

  /**
   * Get tunnel status for a specific router
   */
  async getTunnelStatus(connectionId) {
    await this.initialize();

    const db = this.getDb();
    const result = await db.query(
      `SELECT id, name, ip_address, use_tunnel, wireguard_tunnel_ip,
              wireguard_public_key, wireguard_interface_name, is_online, last_seen
       FROM mikrotik_connections WHERE id = $1`,
      [connectionId]
    );

    if (result.rows.length === 0) {
      return { success: false, error: "Connection not found" };
    }

    const conn = result.rows[0];
    const tunnel = this.tunnels.get(connectionId);

    // Try to check WireGuard handshake
    let handshake = null;
    if (tunnel) {
      try {
        const wgOutput = execSync(`wg show ${WG_INTERFACE} latest-handshakes`, {
          encoding: "utf8",
          timeout: 5000,
        }).trim();
        const lines = wgOutput.split("\n");
        for (const line of lines) {
          if (line.includes(tunnel.publicKey?.substring(0, 20) || "NOMATCH")) {
            const parts = line.split("\t");
            handshake = parseInt(parts[parts.length - 1], 10);
            break;
          }
        }
      } catch {
        handshake = null;
      }
    }

    const isTunnelUp = handshake !== null && handshake > 0 && (Math.floor(Date.now() / 1000) - handshake) < 180;

    return {
      success: true,
      connectionId: conn.id,
      routerName: conn.name,
      tunnelEnabled: conn.use_tunnel,
      tunnelIp: conn.wireguard_tunnel_ip,
      wireguardPublicKey: conn.wireguard_public_key,
      wireguardInterfaceName: conn.wireguard_interface_name,
      isOnline: conn.is_online,
      lastSeen: conn.last_seen,
      tunnelActive: isTunnelUp,
      lastHandshake: handshake ? new Date(handshake * 1000).toISOString() : null,
      serverPublicKey: this.serverPublicKey,
      serverEndpoint: this.getServerEndpoint(),
    };
  }

  /**
   * Read all current WireGuard handshakes once and return a map of
   * peerPublicKey -> lastHandshakeEpochSeconds. Returns {} if wg is
   * unavailable on this host (e.g. running off the tunnel server).
   */
  readHandshakes() {
    try {
      const wgOutput = execSync(`wg show ${WG_INTERFACE} latest-handshakes`, {
        encoding: "utf8",
        timeout: 5000,
      }).trim();
      const map = {};
      for (const line of wgOutput.split("\n")) {
        if (!line.trim()) continue;
        const parts = line.split("\t");
        if (parts.length >= 2) {
          map[parts[0].trim()] = parseInt(parts[parts.length - 1], 10) || 0;
        }
      }
      return map;
    } catch {
      return {};
    }
  }

  /**
   * Sync is_online / last_seen for every tunnel-enabled router based on the
   * WireGuard handshake age. A peer is considered online if it handshook in
   * the last `staleSeconds` (default 180s). This is the cheapest, most
   * reliable health signal for CGNAT routers because it requires no probe
   * back through the tunnel.
   */
  async syncTunnelHealth(staleSeconds = 180) {
    await this.initialize();
    const db = this.getDb();

    const result = await db.query(
      `SELECT id, name, wireguard_public_key, is_online
       FROM mikrotik_connections
       WHERE use_tunnel = true AND wireguard_public_key IS NOT NULL`
    );

    const handshakes = this.readHandshakes();
    const wgAvailable = Object.keys(handshakes).length > 0;
    const now = Math.floor(Date.now() / 1000);
    const updated = [];

    for (const row of result.rows || []) {
      const hs = handshakes[row.wireguard_public_key] || 0;
      const online = hs > 0 && now - hs < staleSeconds;

      // Only write when status actually changes to avoid churn
      if (online !== row.is_online) {
        await db.query(
          `UPDATE mikrotik_connections
           SET is_online = $1,
               last_seen = CASE WHEN $1 THEN CURRENT_TIMESTAMP ELSE last_seen END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [online, row.id]
        );
      } else if (online) {
        await db.query(
          `UPDATE mikrotik_connections SET last_seen = CURRENT_TIMESTAMP WHERE id = $1`,
          [row.id]
        );
      }

      updated.push({
        connectionId: row.id,
        routerName: row.name,
        online,
        lastHandshake: hs ? new Date(hs * 1000).toISOString() : null,
        handshakeAgeSeconds: hs ? now - hs : null,
      });
    }

    return {
      success: true,
      wgAvailable,
      checked: updated.length,
      onlineCount: updated.filter((u) => u.online).length,
      results: updated,
    };
  }

  /**
   * List all tunnels
   */
  async listTunnels() {
    await this.initialize();

    const db = this.getDb();
    const result = await db.query(
      `SELECT id, name, ip_address, use_tunnel, wireguard_tunnel_ip,
              wireguard_public_key, wireguard_interface_name, is_online, last_seen
       FROM mikrotik_connections
       WHERE use_tunnel = true`
    );

    // Read WireGuard handshakes once for live status (cheap, single exec)
    const handshakes = this.readHandshakes();
    const now = Math.floor(Date.now() / 1000);

    return {
      success: true,
      serverPublicKey: this.serverPublicKey,
      serverEndpoint: this.getServerEndpoint(),
      serverPort: WG_TUNNEL_PORT,
      tunnelSubnet: `${WG_TUNNEL_SUBNET}.0/24`,
      tunnels: result.rows.map((row) => {
        const hs = handshakes[row.wireguard_public_key] || 0;
        const tunnelActive = hs > 0 && now - hs < 180;
        return {
          connectionId: row.id,
          routerName: row.name,
          connectionIp: row.ip_address,
          tunnelIp: row.wireguard_tunnel_ip,
          publicKey: row.wireguard_public_key,
          interfaceName: row.wireguard_interface_name,
          isOnline: row.is_online,
          lastSeen: row.last_seen,
          tunnelActive,
          lastHandshake: hs ? new Date(hs * 1000).toISOString() : null,
        };
      }),
    };
  }

  /**
   * Check if a given IP address appears to be behind CGNAT
   */
  isCGNATIpAddress(ip) {
    if (!ip) return false;
    const cgnatRanges = [
      /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // 100.64.0.0/10 (CGNAT range)
      /^10\./,       // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
      /^192\.168\./, // 192.168.0.0/16
    ];
    return cgnatRanges.some((regex) => regex.test(ip));
  }

  /**
   * Generate a MikroTik script for an existing router to switch to tunnel mode
   * This is for when you already have a connection but need to add the tunnel
   */
  async generateExistingRouterTunnelScript(connectionId) {
    await this.initialize();

    const db = this.getDb();
    const result = await db.query(
      "SELECT * FROM mikrotik_connections WHERE id = $1",
      [connectionId]
    );

    if (result.rows.length === 0) {
      throw new Error("Connection not found");
    }

    const conn = result.rows[0];

    if (!conn.wireguard_public_key) {
      throw new Error("No WireGuard tunnel configured for this connection. Create a tunnel first.");
    }

    const routerPrivateKey = conn.wireguard_private_key;
    if (!routerPrivateKey) {
      throw new Error("Router private key not stored. Cannot generate configuration.");
    }

    const tunnelIp = conn.wireguard_tunnel_ip || `${WG_TUNNEL_SUBNET}.2/24`;
    const interfaceName = conn.wireguard_interface_name || "wg-billing";

    return this.generateMikrotikConfig({
      routerPrivateKey,
      routerTunnelIp: tunnelIp,
      serverPublicKey: this.serverPublicKey,
      serverEndpoint: this.getServerEndpoint(),
      serverWgPort: WG_TUNNEL_PORT,
      interfaceName,
      allowedAddresses: `${this.serverWgIp}/32`,
    });
  }
}

// Singleton instance
const cgnatTunnelService = new CGNATTunnelService();

module.exports = cgnatTunnelService;
