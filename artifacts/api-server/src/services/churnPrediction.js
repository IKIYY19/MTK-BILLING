const logger = require("../utils/logger");

function getDb() {
  return global.dbAvailable ? global.db : require("../db/memory");
}

async function calculateChurnScore(customerId) {
  const db = getDb();

  try {
    const [paymentHistory, usageTrend, subscriptionAge, plansQuery] = await Promise.allSettled([
      db.query(
        `SELECT i.due_date, i.status, p.received_at,
                EXTRACT(DAY FROM (COALESCE(p.received_at, CURRENT_DATE) - i.due_date)) as days_late
         FROM invoices i LEFT JOIN payments p ON p.invoice_id = i.id
         WHERE i.customer_id = $1 AND i.created_at > NOW() - INTERVAL '12 months'
         ORDER BY i.due_date DESC`,
        [customerId]
      ),
      db.query(
        `SELECT COALESCE(SUM(acctinputoctets + acctoutputoctets), 0) as total_bytes,
                EXTRACT(MONTH FROM acctstarttime) as month
         FROM radacct WHERE username IN (SELECT pppoe_username FROM subscriptions WHERE customer_id = $1)
         AND acctstarttime > NOW() - INTERVAL '6 months'
         GROUP BY month ORDER BY month DESC`,
        [customerId]
      ),
      db.query(
        `SELECT EXTRACT(DAY FROM (NOW() - MIN(created_at))) as age_days FROM subscriptions WHERE customer_id = $1`,
        [customerId]
      ),
      db.query(
        "SELECT p.price FROM service_plans p JOIN subscriptions s ON s.plan_id = p.id WHERE s.customer_id = $1 AND s.status = 'active' LIMIT 1",
        [customerId]
      ),
    ]);

    const invoices = paymentHistory.status === "fulfilled" ? paymentHistory.value.rows : [];
    const usageRows = usageTrend.status === "fulfilled" ? usageTrend.value.rows : [];
    const ageDays = subscriptionAge.status === "fulfilled" ? parseFloat(subscriptionAge.value.rows[0]?.age_days || 0) : 0;

    let score = 0;
    const factors = [];

    const completedInvoices = invoices.filter(i => i.status === "paid" || i.status === "partial");
    if (completedInvoices.length > 0) {
      const lateCount = completedInvoices.filter(i => i.days_late > 3).length;
      const lateRatio = lateCount / completedInvoices.length;

      if (lateRatio > 0.7) {
        score += 40;
        factors.push({ name: "Payment pattern", detail: `${Math.round(lateRatio * 100)}% of payments are late`, severity: "high" });
      } else if (lateRatio > 0.4) {
        score += 25;
        factors.push({ name: "Payment pattern", detail: `${Math.round(lateRatio * 100)}% of payments are late`, severity: "medium" });
      } else if (lateRatio > 0.1) {
        score += 10;
        factors.push({ name: "Payment pattern", detail: "Some payments are late", severity: "low" });
      }

      const recentLate = completedInvoices.slice(0, 3);
      if (recentLate.length >= 2) {
        const avgRecentLate = recentLate.reduce((s, i) => s + (i.days_late || 0), 0) / recentLate.length;
        if (avgRecentLate > 14) {
          score += 25;
          factors.push({ name: "Recent lateness", detail: `Average ${Math.round(avgRecentLate)} days late recently`, severity: "high" });
        } else if (avgRecentLate > 5) {
          score += 15;
          factors.push({ name: "Recent lateness", detail: `Average ${Math.round(avgRecentLate)} days late`, severity: "medium" });
        }
      }
    }

    const overdueNow = invoices.filter(i => i.status !== "paid" && i.status !== "cancelled" && new Date(i.due_date) < new Date());
    if (overdueNow.length > 0) {
      score += 20;
      factors.push({ name: "Current overdue", detail: `${overdueNow.length} unpaid invoice(s) past due`, severity: "high" });
    }

    if (usageRows.length >= 2) {
      const recentUsage = usageRows.slice(0, 2);
      const olderUsage = usageRows.slice(2, 4) || usageRows.slice(1, 2);
      if (recentUsage.length > 0 && olderUsage.length > 0) {
        const recentAvg = recentUsage.reduce((s, r) => s + parseInt(r.total_bytes || 0), 0) / recentUsage.length;
        const olderAvg = olderUsage.reduce((s, r) => s + parseInt(r.total_bytes || 0), 0) / olderUsage.length;
        if (olderAvg > 0 && recentAvg < olderAvg * 0.5) {
          score += 15;
          factors.push({ name: "Usage drop", detail: "Bandwidth usage dropped >50% recently", severity: "medium" });
        }
      }
    }

    if (ageDays < 30) {
      score += 5;
      factors.push({ name: "New customer", detail: "Less than 30 days old", severity: "low" });
    }

    const finalScore = Math.min(Math.max(Math.round(score), 0), 100);

    let risk = "low";
    if (finalScore >= 70) risk = "high";
    else if (finalScore >= 40) risk = "medium";

    const planPrice = plansQuery.status === "fulfilled" ? parseFloat(plansQuery.value.rows[0]?.price || 0) : 0;

    return {
      customer_id: customerId,
      score: finalScore,
      risk,
      factors,
      metrics: {
        late_payment_ratio: completedInvoices.length > 0
          ? Math.round((completedInvoices.filter(i => i.days_late > 3).length / completedInvoices.length) * 100)
          : 0,
        overdue_count: overdueNow.length,
        plan_price: planPrice,
      },
    };
  } catch (e) {
    logger.error("[ChurnPrediction] Failed for customer", { customerId, error: e.message });
    return { customer_id: customerId, score: 0, risk: "unknown", factors: [] };
  }
}

// Simple in-memory cache for churn report
let cachedReport = null;
let lastCacheTime = 0;
const CHURN_CACHE_DURATION = 15 * 60 * 1000; // 15 minutes cache

async function getChurnReport() {
  const now = Date.now();
  if (cachedReport && (now - lastCacheTime < CHURN_CACHE_DURATION)) {
    return cachedReport;
  }

  const db = getDb();
  try {
    const customers = await db.query(
      "SELECT id, name, email, phone, status FROM customers WHERE status = 'active' ORDER BY name LIMIT 200"
    );
    if (customers.rows.length === 0) return { high_risk: [], summary: { total: 0, high_risk: 0, medium_risk: 0, low_risk: 0 } };

    const scores = [];
    const batchSize = 10;
    const targets = customers.rows.slice(0, 50);

    for (let i = 0; i < targets.length; i += batchSize) {
      const batch = targets.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (c) => {
          const result = await calculateChurnScore(c.id);
          return { ...result, name: c.name, email: c.email, phone: c.phone };
        })
      );
      scores.push(...batchResults);
    }

    const highRisk = scores.filter(s => s.risk === "high").sort((a, b) => b.score - a.score);
    const mediumRisk = scores.filter(s => s.risk === "medium");
    const lowRisk = scores.filter(s => s.risk === "low");

    const report = {
      high_risk: highRisk,
      all_risk: scores.sort((a, b) => b.score - a.score),
      summary: {
        total: scores.length,
        high_risk: highRisk.length,
        medium_risk: mediumRisk.length,
        low_risk: lowRisk.length,
      },
    };

    cachedReport = report;
    lastCacheTime = Date.now();
    return report;
  } catch (e) {
    logger.error("[ChurnPrediction] Report failed", { error: e.message });
    if (cachedReport) return cachedReport;
    return { high_risk: [], summary: { total: 0, high_risk: 0, medium_risk: 0, low_risk: 0 } };
  }
}

module.exports = { calculateChurnScore, getChurnReport };
