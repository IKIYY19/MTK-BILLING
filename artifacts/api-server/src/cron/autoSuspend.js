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

    const results = { suspended: [], mikrotik_disabled: [], mikrotik_failed: [], radius_disabled: [], pod_kicked: [], skipped: [] };

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

      require("../services/opsAlertService").subscriptionEvent(
        "auto-suspended",
        sub.pppoe_username || sub.customer_id,
        `${daysOverdue} days overdue`,
      ).catch(() => {});

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

      // FUP is evaluated for all active subscriptions by services/fup.js.
      // It must not depend on a customer having an overdue invoice.

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
