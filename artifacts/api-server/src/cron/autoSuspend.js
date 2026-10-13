/**
 * Auto-Suspend Cron
 * Runs daily to suspend non-paying customers:
 * 1. Find overdue invoices
 * 2. Suspend subscriptions in database
 * 3. Push suspension to MikroTik (disable PPPoE secrets)
 */
const billingData = require("../services/billingData");
const mikrotikProvisioning = require("../services/mikrotikProvisioning");
const radiusPod = require("../services/radiusPod");
const radiusSync = require("../services/radiusSync");
const logger = require("../utils/logger");

async function runAutoSuspend() {
  try {
    logger.info("[AutoSuspend] Running check...");

    const allSubscriptions = await billingData.listSubscriptions();
    const allInvoices = await billingData.listInvoices();
    const activeSubs = allSubscriptions.filter((s) => s.status === "active");

    const results = { suspended: [], mikrotik_disabled: [], mikrotik_failed: [], radius_disabled: [], pod_kicked: [], fup_throttled: [], skipped: [] };

    for (const sub of activeSubs) {
      const overdueInvoices = allInvoices.filter(
        (i) =>
          i.customer_id === sub.customer_id &&
          i.status !== "paid" &&
          i.status !== "cancelled" &&
          new Date(i.due_date) < new Date(),
      );

      if (overdueInvoices.length === 0) {continue;}

      const daysOverdue = Math.max(
        ...overdueInvoices.map((i) =>
          Math.floor((Date.now() - new Date(i.due_date).getTime()) / (24 * 60 * 60 * 1000)),
        ),
      );

      await billingData.updateSubscription(sub.id, {
        status: "suspended",
        last_sync_status: "suspended",
        last_sync_error: `Auto-suspended: ${daysOverdue} days overdue`,
      });

      results.suspended.push({
        subscription_id: sub.id,
        customer_id: sub.customer_id,
        days_overdue: daysOverdue,
      });

      if (sub.pppoe_username) {
        try {
          await radiusSync.upsertRadiusUser({ ...sub, status: "suspended" });
          results.radius_disabled.push({ subscription_id: sub.id, pppoe_username: sub.pppoe_username });
        } catch (e) {
          logger.error("[AutoSuspend] RADIUS disable failed:", { error: e.message });
        }

        try {
          const podResult = await radiusPod.kickUser(sub.pppoe_username, sub);
          if (podResult.success) {
            results.pod_kicked.push({ subscription_id: sub.id, pppoe_username: sub.pppoe_username });
          }
        } catch (e) {
          logger.error("[AutoSuspend] PoD failed:", { error: e.message });
        }
      }

      if (sub.plan_id && sub.pppoe_username) {
        try {
          const db = global.dbAvailable ? global.db : require("../db/memory");
          const fupRes = await db.query(
            "SELECT * FROM fup_profiles WHERE plan_id = $1 AND is_active = true LIMIT 1",
            [sub.plan_id]
          );
          if (fupRes.rows.length > 0) {
            const fup = fupRes.rows[0];
            const usageRes = await db.query(
              "SELECT COALESCE(SUM(acctoutputoctets + acctinputoctets), 0) as total FROM radacct WHERE username = $1 AND acctstarttime > NOW() - INTERVAL '30 days'",
              [sub.pppoe_username]
            );
            const totalGB = parseInt(usageRes.rows[0].total || 0) / 1073741824;
            const dataLimit = parseFloat(fup.data_limit_gb || fup.data_limit || Infinity);
            if (totalGB > dataLimit) {
              const throttleRate = fup.throttle_speed || "512k/512k";
              await radiusSync.updateThrottle(sub.pppoe_username, throttleRate);
              await radiusPod.kickUser(sub.pppoe_username, sub);
              results.fup_throttled.push({ subscription_id: sub.id, username: sub.pppoe_username, used_gb: parseFloat(totalGB.toFixed(2)) });
              logger.info(`[FUP] Throttled ${sub.pppoe_username}: ${totalGB.toFixed(1)}GB of ${dataLimit}GB`);
            }
          }
        } catch (e) { logger.error("[FUP] Check failed:", { error: e.message }); }
      }

      if (sub.mikrotik_connection_id && sub.pppoe_username) {
        try {
          const syncResult = await mikrotikProvisioning.suspendSubscriptionSecret(sub);
          if (syncResult?.success) {
            results.mikrotik_disabled.push({ subscription_id: sub.id, pppoe_username: sub.pppoe_username });
          } else {
            results.mikrotik_failed.push({ subscription_id: sub.id, error: syncResult?.error || "Unknown error" });
          }
        } catch (e) {
          results.mikrotik_failed.push({ subscription_id: sub.id, error: e.message });
          logger.error("[AutoSuspend] MikroTik suspend failed:", { subscription_id: sub.id, error: e.message });
        }
      } else {
        results.skipped.push({ subscription_id: sub.id, reason: "No MikroTik connection or PPPoE username" });
      }

      logger.info(
        `[AutoSuspend] Suspended ${sub.id} (${daysOverdue}d overdue)` +
          (sub.pppoe_username ? ` — PPPoE: ${sub.pppoe_username}` : " — no PPPoE"),
      );
    }

    logger.info("[AutoSuspend] Complete:", {
      suspended: results.suspended.length,
      radius_disabled: results.radius_disabled.length,
      pod_kicked: results.pod_kicked.length,
      fup_throttled: results.fup_throttled.length,
      mikrotik_disabled: results.mikrotik_disabled.length,
      mikrotik_failed: results.mikrotik_failed.length,
      skipped: results.skipped.length,
    });

    return results;
  } catch (error) {
    logger.error("[AutoSuspend] Error:", { error: error.message, stack: error.stack });
    return { error: error.message };
  }
}

function startCron() {
  const interval = 24 * 60 * 60 * 1000;
  logger.info("[AutoSuspend] Cron started (every 24h)");

  setTimeout(() => runAutoSuspend(), 5 * 60 * 1000);
  setInterval(runAutoSuspend, interval);
}

module.exports = { runAutoSuspend, startCron };
