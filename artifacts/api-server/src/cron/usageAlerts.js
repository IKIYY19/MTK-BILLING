const billingData = require("../services/billingData");
const notificationService = require("../services/notificationService");
const logger = require("../utils/logger");

function getDb() {
  return global.dbAvailable ? global.db : require("../db/memory");
}

const ALERT_THRESHOLDS = [
  { pct: 80, key: "usage_80", message: "data_usage_80" },
  { pct: 100, key: "usage_100", message: "data_usage_100" },
];

async function ensureAlertLogTable() {
  try {
    const db = getDb();
    await db.query(`
      CREATE TABLE IF NOT EXISTS usage_alert_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID,
        subscription_id UUID,
        alert_key VARCHAR(50),
        threshold_pct INTEGER,
        usage_gb DECIMAL(10,2),
        quota_gb DECIMAL(10,2),
        channel VARCHAR(20),
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {}
}

async function alreadySent(customerId, subscriptionId, alertKey, days = 30) {
  const db = getDb();
  const result = await db.query(
    `SELECT id FROM usage_alert_log
     WHERE customer_id = $1 AND subscription_id = $2 AND alert_key = $3
     AND sent_at > NOW() - INTERVAL '${days} days'
     LIMIT 1`,
    [customerId, subscriptionId, alertKey]
  );
  return result.rows.length > 0;
}

async function logAlert(customerId, subscriptionId, alertKey, thresholdPct, usageGb, quotaGb, channel) {
  const db = getDb();
  await db.query(
    `INSERT INTO usage_alert_log (customer_id, subscription_id, alert_key, threshold_pct, usage_gb, quota_gb, channel)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [customerId, subscriptionId, alertKey, thresholdPct, usageGb, quotaGb, channel]
  );
}

async function getCustomerUsage(username, periodDays = 30) {
  const db = getDb();
  const result = await db.query(
    `SELECT COALESCE(SUM(acctoutputoctets + acctinputoctets), 0) as total_bytes
     FROM radacct
     WHERE username = $1 AND acctstarttime > NOW() - INTERVAL '${periodDays} days'`,
    [username]
  );
  return parseInt(result.rows[0]?.total_bytes || 0) / 1073741824;
}

async function getPlanQuota(planId) {
  if (!planId) return 0;
  try {
    const plans = await billingData.listPlans();
    const plan = plans.find(p => p.id === planId);
    return plan?.quota_gb || 0;
  } catch (e) {
    return 0;
  }
}

async function runUsageAlerts() {
  await ensureAlertLogTable();

  try {
    logger.info("[UsageAlerts] Checking customer data usage...");

    const allSubscriptions = await billingData.listSubscriptions();
    const activeSubs = allSubscriptions.filter(s =>
      s.status === "active" && s.pppoe_username
    );

    const results = { checked: activeSubs.length, alerted: 0, skipped: 0, errors: 0 };

    for (const sub of activeSubs) {
      try {
        const quota = sub.plan?.quota_gb || await getPlanQuota(sub.plan_id);
        if (!quota || quota <= 0) {
          results.skipped++;
          continue;
        }

        const usageGb = await getCustomerUsage(sub.pppoe_username);
        const usagePct = Math.round((usageGb / quota) * 100);

        const customer = sub.customer || await billingData.getCustomerById(sub.customer_id);
        if (!customer?.phone) continue;

        for (const threshold of ALERT_THRESHOLDS) {
          if (usagePct >= threshold.pct) {
            const already = await alreadySent(sub.customer_id, sub.id, threshold.key);
            if (already) continue;

            const channels = ["sms", "whatsapp"];
            const messageText = threshold.pct === 80
              ? `Hi ${customer.name}, you've used ${usagePct}% (${usageGb.toFixed(1)}GB) of your ${quota}GB data plan. ${Math.max(0, quota - usageGb).toFixed(1)}GB remaining. Top up or upgrade to avoid throttling. - ${process.env.COMPANY_NAME || 'Your ISP'}`
              : `URGENT: Hi ${customer.name}, you've used 100% of your ${quota}GB data plan. Your speed has been reduced. Upgrade or top up to restore full speed. - ${process.env.COMPANY_NAME || 'Your ISP'}`;

            for (const channel of channels) {
              try {
                await notificationService.triggerMessage(
                  threshold.message,
                  {
                    customer,
                    plan_name: sub.plan?.name || "Active Plan",
                    usage_gb: usageGb.toFixed(1),
                    quota_gb: quota,
                    usage_pct: usagePct,
                    remaining_gb: Math.max(0, quota - usageGb).toFixed(1),
                    phone: customer.phone,
                    custom_message: messageText,
                    company_name: process.env.COMPANY_NAME || "Your ISP",
                  },
                  channel
                );
              } catch (e) {
                logger.error(`[UsageAlerts] Failed to send ${channel} for ${customer.name}`, { error: e.message });
              }
            }

            await logAlert(sub.customer_id, sub.id, threshold.key, threshold.pct, usageGb, quota, channels.join(","));
            results.alerted++;

            logger.info(
              `[UsageAlerts] ${customer.name}: ${usagePct}% (${usageGb.toFixed(1)}/${quota}GB)`
            );
          }
        }
      } catch (e) {
        results.errors++;
        logger.error(`[UsageAlerts] Error for sub ${sub.id}:`, { error: e.message });
      }
    }

    logger.info("[UsageAlerts] Complete:", results);
    return results;
  } catch (e) {
    logger.error("[UsageAlerts] Failed:", { error: e.message });
    return { error: e.message };
  }
}

function startCron() {
  const intervalMs = 60 * 60 * 1000;
  logger.info("[UsageAlerts] Cron started (every 1 hour)");

  setTimeout(() => runUsageAlerts(), 2 * 60 * 1000);
  setInterval(runUsageAlerts, intervalMs);
}

module.exports = { runUsageAlerts, startCron };
