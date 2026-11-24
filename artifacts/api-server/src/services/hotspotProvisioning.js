/**
 * Hotspot user-profile provisioning.
 *
 * RouterOS applies speed limits on /ip/hotspot/user/profile, not on the
 * individual user record. This helper creates a deterministic profile per
 * rate limit and returns its name so users/vouchers can reference it.
 */

const routerConnectionManager = require("./routerConnectionManager");

function buildProfileName(rateLimit) {
  return `billing_hs_${String(rateLimit).replace(/[^A-Za-z0-9]/g, "_")}`;
}

async function ensureRateLimitProfile(connectionId, rateLimit, baseProfileName = "default") {
  if (!rateLimit) {return baseProfileName || "default";}
  const name = buildProfileName(rateLimit);
  const profiles = await routerConnectionManager.print(
    connectionId,
    "/ip/hotspot/user/profile",
    ".id,name,rate-limit",
  );
  const existing = profiles.find((profile) => profile.name === name);
  const args = { name, "rate-limit": rateLimit };
  if (existing) {
    await routerConnectionManager.executeCommand(
      connectionId,
      "/ip/hotspot/user/profile/set",
      { numbers: existing[".id"] || existing.name, ...args },
    );
  } else {
    await routerConnectionManager.executeCommand(
      connectionId,
      "/ip/hotspot/user/profile/add",
      args,
    );
  }
  return name;
}

module.exports = { buildProfileName, ensureRateLimitProfile };
