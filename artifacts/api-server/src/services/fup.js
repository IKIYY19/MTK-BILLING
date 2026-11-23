/**
 * Fair Usage Policy engine.
 *
 * Evaluates real RADIUS accounting usage against active FUP profiles and
 * applies/restores the reduced Mikrotik-Rate-Limit in radreply. Unlike the old
 * check buried in auto-suspend, this runs for every active subscription and
 * honours each profile's reset period.
 */

const radiusSync = require("./radiusSync");
const radiusPod = require("./radiusPod");
const logger = require("../utils/logger");

const UNIT_BYTES = {
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4,
};

function db() {
  if (!global.dbAvailable || !global.db) {
    throw new Error("Fair Usage Policy requires the PostgreSQL database");
  }
  return global.db;
}

function limitBytes(profile) {
  const value = Number(profile?.data_limit ?? profile?.fup_limit);
  if (!Number.isFinite(value) || value <= 0) {return null;}
  const unit = String(profile?.data_limit_unit || "GB").toUpperCase();
  return value * (UNIT_BYTES[unit] || UNIT_BYTES.GB);
}

function windowStart(period) {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (String(period || "monthly").toLowerCase()) {
    case "daily":
      return midnight;
    case "weekly": {
      const start = new Date(midnight);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      return start;
    }
    case "never":
      return new Date(0);
    case "monthly":
    default:
      return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

function nextResetAt(period) {
  const now = new Date();
  switch (String(period || "monthly").toLowerCase()) {
    case "daily":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    case "weekly": {
      const start = windowStart("weekly");
      start.setDate(start.getDate() + 7);
      return start;
    }
    case "never":
      return null;
    case "monthly":
    default:
      return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }
}

function pickProfile(profiles, subscription, overrideProfileId = null) {
  if (overrideProfileId) {
    const override = profiles.find((profile) => profile.id === overrideProfileId);
    if (override) {return override;}
  }
  const candidates = profiles.filter((profile) => {
    if (profile.plan_id && profile.plan_id !== subscription.plan_id) {return false;}
    if (profile.tenant_id && subscription.tenant_id && profile.tenant_id !== subscription.tenant_id) {
      return false;
    }
    return true;
  });
  // A plan-specific profile always wins over a global fallback.
  candidates.sort((a, b) => {
    const specific = Number(Boolean(b.plan_id)) - Number(Boolean(a.plan_id));
    if (specific) {return specific;}
    return Number(a.priority || 100) - Number(b.priority || 100);
  });
  return candidates[0] || null;
}

async function usageBytes(username, since) {
  const result = await db().query(
    `SELECT COALESCE(SUM(COALESCE(acctinputoctets, 0) + COALESCE(acctoutputoctets, 0)), 0)::bigint AS total
     FROM radacct
     WHERE username = $1 AND acctstarttime >= $2`,
    [username, since],
  );
  return Number(result.rows[0]?.total || 0);
}

async function evaluateFup() {
  if (!global.dbAvailable || !global.db) {
    return {
      evaluated: 0, throttled: [], restored: [], unchanged: 0,
      errors: [{ error: "Fair Usage Policy requires PostgreSQL accounting data" }],
    };
  }
  const database = db();
  const results = {
    evaluated: 0,
    throttled: [],
    restored: [],
    unchanged: 0,
    errors: [],
  };

  const [profilesResult, subscriptions] = await Promise.all([
    database.query("SELECT * FROM fup_profiles WHERE is_active = true"),
    require("../services/billingData").listSubscriptions(),
  ]);
  const profiles = profilesResult.rows;

  for (const subscription of subscriptions) {
    if (subscription.status !== "active" || !subscription.pppoe_username) {continue;}
    results.evaluated += 1;

    const customerResult = await database.query(
      "SELECT fup_profile_id FROM customers WHERE id = $1 LIMIT 1",
      [subscription.customer_id],
    );
    const profile = pickProfile(profiles, subscription, customerResult.rows[0]?.fup_profile_id);
    const limit = profile ? limitBytes(profile) : null;
    const wasThrottled = Boolean(subscription.fup_exceeded);

    // Profile removed or no limit configured: clear any stale throttle.
    if (!profile || !limit) {
      if (wasThrottled) {
        try {
          await radiusSync.upsertRadiusUser(subscription);
          await database.query(
            `UPDATE subscriptions SET fup_exceeded = false, throttled = false,
             throttle_reason = NULL, fup_applied_at = NULL, fup_reset_at = NULL WHERE id = $1`,
            [subscription.id],
          );
          results.restored.push({ username: subscription.pppoe_username, reason: "profile_removed" });
        } catch (error) {
          results.errors.push({ username: subscription.pppoe_username, error: error.message });
        }
      }
      continue;
    }

    try {
      const since = windowStart(profile.reset_period);
      const used = await usageBytes(subscription.pppoe_username, since);
      const exceeded = used > limit;
      const appliedAt = subscription.fup_applied_at ? new Date(subscription.fup_applied_at) : null;
      const currentWindow = appliedAt && appliedAt >= since;

      if (exceeded) {
        const speed = String(profile.throttle_speed || "").trim() || "512k/512k";
        // A subscription sync can rewrite radreply back to the full plan speed.
        // Re-apply whenever the stored value differs from the FUP speed.
        const reply = await database.query(
          "SELECT value FROM radreply WHERE username = $1 AND attribute = 'Mikrotik-Rate-Limit' LIMIT 1",
          [subscription.pppoe_username],
        );
        const currentSpeed = reply.rows[0]?.value;
        if (wasThrottled && currentWindow && currentSpeed === speed) {
          results.unchanged += 1;
          continue;
        }
        await radiusSync.updateThrottle(subscription.pppoe_username, speed);
        await radiusPod.kickUser(subscription.pppoe_username, subscription).catch(() => {});
        await database.query(
          `UPDATE subscriptions SET fup_exceeded = true, throttled = true,
           throttle_reason = 'fup_exceeded', fup_applied_at = CURRENT_TIMESTAMP,
           fup_reset_at = $2 WHERE id = $1`,
          [subscription.id, nextResetAt(profile.reset_period)],
        );
        results.throttled.push({
          username: subscription.pppoe_username,
          profile: profile.name,
          usedGB: Number((used / UNIT_BYTES.GB).toFixed(2)),
          limitGB: Number((limit / UNIT_BYTES.GB).toFixed(2)),
          speed,
        });
        logger.info("[FUP] Throttled subscriber", {
          username: subscription.pppoe_username,
          profile: profile.name,
          usedGB: results.throttled.at(-1).usedGB,
        });
      } else if (!exceeded && wasThrottled) {
        await radiusSync.upsertRadiusUser(subscription);
        await radiusPod.kickUser(subscription.pppoe_username, subscription).catch(() => {});
        await database.query(
          `UPDATE subscriptions SET fup_exceeded = false, throttled = false,
           throttle_reason = NULL, fup_applied_at = NULL,
           fup_reset_at = NULL WHERE id = $1`,
          [subscription.id],
        );
        results.restored.push({ username: subscription.pppoe_username, reason: "usage_below_limit" });
        logger.info("[FUP] Restored subscriber speed", { username: subscription.pppoe_username });
      } else {
        results.unchanged += 1;
      }
    } catch (error) {
      results.errors.push({ username: subscription.pppoe_username, error: error.message });
      logger.error("[FUP] Evaluation failed for subscriber", {
        username: subscription.pppoe_username,
        error: error.message,
      });
    }
  }

  return results;
}

function startCron() {
  const interval = Number(process.env.FUP_CHECK_INTERVAL_MS) || 10 * 60 * 1000;
  const run = () => {
    evaluateFup().catch((error) => {
      logger.error("[FUP] Scheduled evaluation failed", { error: error.message });
    });
  };
  const timer = setInterval(run, interval);
  timer.unref();
  setTimeout(run, 60 * 1000).unref();
  return timer;
}

module.exports = { evaluateFup, startCron, limitBytes, windowStart, nextResetAt };
