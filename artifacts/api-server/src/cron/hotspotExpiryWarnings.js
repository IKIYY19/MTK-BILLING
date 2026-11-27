/**
 * Hotspot Expiry Warnings
 * Every 10 minutes, flag paid hotspot sessions expiring within an hour.
 * Writes an audit event and sends an ops alert once per session.
 */

const logger = require("../utils/logger");

async function run() {
  if (!global.dbAvailable || !global.db) {return;}
  try {
    const captiveHotspot = require("../services/captiveHotspot");
    const alerts = require("../services/networkAlertService");
    const tenants = await global.db.query(
      "SELECT DISTINCT tenant_id FROM captive_hotspot_sessions WHERE tenant_id IS NOT NULL",
    );
    let warned = 0;
    for (const row of tenants.rows) {
      const sessions = await captiveHotspot.findExpiringSessions(row.tenant_id, 60);
      for (const session of sessions) {
        const minutesLeft = Math.max(
          0,
          Math.round((new Date(session.expires_at).getTime() - Date.now()) / 60000),
        );
        await global.db.query(
          `INSERT INTO captive_hotspot_events (tenant_id, session_id, event_type, details)
           VALUES ($1, $2, 'expiry.warning', $3::jsonb)`,
          [
            row.tenant_id,
            session.id,
            JSON.stringify({
              expiresAt: session.expires_at,
              minutesLeft,
              planName: session.plan_name,
              routerName: session.router_name,
            }),
          ],
        );
        await alerts
          .alert(
            "Hotspot access expiring",
            `${session.plan_name || "Hotspot"} for ${session.mac_address} on ${session.router_name || "router"} expires in ${minutesLeft} minute(s).`,
            "warning",
            `hotspot-expiry-${session.id}`,
          )
          .catch(() => {});
        // Send SMS notification (non-blocking)
        try {
          const notificationService = require("../services/notificationService");
          const phone = session.phone || "";
          if (phone && phone !== "voucher" && /^254/.test(phone)) {
            notificationService
              .triggerSMS("hotspot_access_expiring", {
                customer: { phone },
                planName: session.plan_name || "Hotspot",
                minutesLeft,
              })
              .catch(() => {});
          }
        } catch (smsErr) {
          // Non-fatal
        }
        warned += 1;
      }
    }
    if (warned > 0) {logger.info("Hotspot expiry warnings sent", { count: warned });}
  } catch (error) {
    logger.error("Hotspot expiry warning cron failed", { error: error.message });
  }
}

function startCron() {
  const timer = setInterval(run, 10 * 60 * 1000);
  if (timer.unref) {timer.unref();}
  const initial = setTimeout(run, 30 * 1000);
  if (initial.unref) {initial.unref();}
  return timer;
}

module.exports = { startCron, run };
