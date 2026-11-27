const express = require("express");
const { getDb } = require("../db");

const router = express.Router();

function normalizeClientIp(value) {
  let ip = String(value || "").split(",")[0].trim();
  if (ip.startsWith("::ffff:")) {ip = ip.slice(7);}
  return ip;
}

function portalUrl() {
  for (const key of ["CAPPORT_PORTAL_URL", "VITE_PUBLIC_APP_URL", "APP_URL"]) {
    try {
      const url = new URL(process.env[key] || "");
      if (url.protocol === "http:" || url.protocol === "https:") {
        return `${url.origin}/hotspot`;
      }
    } catch {
      // Ignore unset or malformed values.
    }
  }
  return "http://192.168.100.8:5000/hotspot";
}

/**
 * RFC 8910 / DHCP option 114 Captive Portal API. Android 11+ and iOS 14+
 * query this endpoint before probing `generate_204`. Returning `captive:true`
 * makes the OS show the automatic "Sign in to network" prompt instead of
 * leaving the client in the misleading "Connected, no internet" state.
 */
router.get("/", async (req, res) => {
  const clientIp = normalizeClientIp(req.ip || req.socket?.remoteAddress);
  let captive = true;

  if (clientIp) {
    try {
      const { rows } = await getDb().query(
        `SELECT status, expires_at
           FROM captive_hotspot_sessions
          WHERE client_ip = $1
          ORDER BY created_at DESC
          LIMIT 1`,
        [clientIp],
      );
      const session = rows[0];
      if (
        session?.status === "authorized" &&
        session.expires_at &&
        new Date(session.expires_at).getTime() > Date.now()
      ) {
        captive = false;
      }
    } catch {
      // If billing state is unavailable, fail closed so clients still see the
      // portal rather than silently being told the network is fine.
      captive = true;
    }
  }

  res.set("Cache-Control", "no-store");
  res.set("Content-Type", "application/json");
  res.json({
    captive,
    ...(captive ? { "user-portal-url": portalUrl() } : {}),
  });
});

module.exports = router;
