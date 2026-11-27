/**
 * Hotspot FUP Enforcement
 * Every 5 minutes, check active hotspot sessions against their data quota.
 * If a session has exceeded its quota (limit-bytes-total), mark it as
 * suspended in the DB and remove the RouterOS user.
 */
const logger = require("../utils/logger");

async function run() {
  if (!global.dbAvailable || !global.db) {return;}
  try {
    const captiveHotspot = require("../services/captiveHotspot");
    const routerManager = require("../services/routerConnectionManager");
    const db = global.db;

    // Find authorized sessions with a quota
    const result = await db.query(
      `SELECT s.id, s.router_id, s.tenant_id, s.mac_address, s.phone, s.plan_id,
              p.quota_gb, p.name AS plan_name
       FROM captive_hotspot_sessions s
       JOIN service_plans p ON p.id = s.plan_id AND p.tenant_id = s.tenant_id
       WHERE s.status = 'authorized' AND p.quota_gb IS NOT NULL AND p.quota_gb > 0`,
    );

    let enforced = 0;
    for (const session of result.rows) {
      try {
        // Get the RouterOS hotspot user for this session
        const users = await routerManager.print(
          session.router_id,
          "/ip/hotspot/user",
          ".id,name,comment,bytes-in,bytes-out,limit-bytes-total",
        );
        const routerUser = users.find(
          (u) => u.comment === `paid-hotspot:${session.id}`,
        );
        if (!routerUser) {continue;}

        const bytesIn = parseInt(routerUser["bytes-in"] || "0", 10);
        const bytesOut = parseInt(routerUser["bytes-out"] || "0", 10);
        const totalBytes = bytesIn + bytesOut;
        const quotaBytes = Math.floor(Number(session.quota_gb) * 1024 ** 3);

        if (totalBytes >= quotaBytes) {
          // Suspend the session
          await captiveHotspot.suspendHotspotSession(
            session.id,
            session.tenant_id,
            "Data quota exceeded (FUP)",
          );
          await db.query(
            `INSERT INTO captive_hotspot_events (tenant_id, session_id, event_type, details)
             VALUES ($1, $2, 'fup.quota_exceeded', $3::jsonb)`,
            [
              session.tenant_id,
              session.id,
              JSON.stringify({
                bytesUsed: totalBytes,
                quotaBytes,
                planName: session.plan_name,
              }),
            ],
          );
          enforced += 1;
          logger.info("FUP quota enforced", {
            sessionId: session.id,
            bytesUsed: totalBytes,
            quotaBytes,
          });
        }
      } catch (error) {
        logger.error("FUP enforcement failed for session", {
          sessionId: session.id,
          error: error.message,
        });
      }
    }
    if (enforced > 0) {
      logger.info("Hotspot FUP enforcement complete", { enforced });
    }
  } catch (error) {
    logger.error("Hotspot FUP enforcement cron failed", { error: error.message });
  }
}

function startCron() {
  const timer = setInterval(run, 5 * 60 * 1000);
  if (timer.unref) {timer.unref();}
  const initial = setTimeout(run, 60 * 1000);
  if (initial.unref) {initial.unref();}
  return timer;
}

module.exports = { startCron, run };
