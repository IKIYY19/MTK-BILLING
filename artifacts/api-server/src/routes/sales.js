const express = require("express");
const { getDb } = require("../db");
const router = express.Router();



router.get("/dashboard", async (req, res) => {
  try {
    const db = getDb();
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const monthStart = `${thisYear}-${String(thisMonth + 1).padStart(2, "0")}-01`;

    const [todayPayments, monthPayments, newCustomersToday, newCustomersMonth,
           totalCustomers, activeSubscriptions, planUpgrades, topAgents,
           recentSales, totalRevenue] = await Promise.allSettled([
      db.query("SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM payments WHERE DATE(received_at) = $1", [today]),
      db.query("SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM payments WHERE received_at >= $1", [monthStart]),
      db.query("SELECT COUNT(*) as count FROM customers WHERE DATE(created_at) = $1", [today]),
      db.query("SELECT COUNT(*) as count FROM customers WHERE created_at >= $1", [monthStart]),
      db.query("SELECT COUNT(*) as count FROM customers"),
      db.query("SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'"),
      db.query(`SELECT sp_new.name as new_plan, sp_old.name as old_plan, COUNT(*) as count FROM billing_audit_logs bal
        JOIN subscriptions s ON s.id = bal.entity_id
        LEFT JOIN service_plans sp_new ON sp_new.id = CAST(bal.new_values->>'plan_id' AS UUID)
        LEFT JOIN service_plans sp_old ON sp_old.id = CAST(bal.old_values->>'plan_id' AS UUID)
        WHERE bal.entity_type = 'subscription' AND bal.action = 'update'
        AND bal.new_values->>'plan_id' IS NOT NULL
        GROUP BY sp_new.name, sp_old.name ORDER BY count DESC LIMIT 10`).catch(() => ({ rows: [] })),
      db.query(`SELECT r.id, r.name, r.company,
        COALESCE((SELECT SUM(p.amount) FROM payments p JOIN customers c ON c.id = p.customer_id WHERE c.reseller_id = r.id), 0) as revenue,
        (SELECT COUNT(*) FROM customers WHERE reseller_id = r.id) as customers
        FROM resellers r WHERE r.status = 'active' ORDER BY revenue DESC LIMIT 5`).catch(() => ({ rows: [] })),
      db.query(`SELECT p.id, p.amount, p.method, p.received_at, c.name as customer_name, r.name as agent_name
        FROM payments p LEFT JOIN customers c ON c.id = p.customer_id
        LEFT JOIN resellers r ON r.id = c.reseller_id
        ORDER BY p.received_at DESC LIMIT 20`).catch(() => ({ rows: [] })),
      db.query("SELECT COALESCE(SUM(amount), 0) as total FROM payments"),
    ]);

    const val = (r, field = "count", fallback = 0) => {
      if (r.status === "fulfilled" && r.value?.rows?.[0]) {
        return field === "total" ? parseFloat(r.value.rows[0].total) || fallback
          : parseInt(r.value.rows[0][field]) || fallback;
      }
      return fallback;
    };

    const todayRev = val(todayPayments, "total");
    const monthRev = val(monthPayments, "total");
    const todayPmtCount = val(todayPayments, "count");
    const monthPmtCount = val(monthPayments, "count");
    const newCustToday = val(newCustomersToday);
    const newCustMonth = val(newCustomersMonth);
    const totalCust = val(totalCustomers);
    const activeSubs = val(activeSubscriptions);
    const totalRev = val(totalRevenue, "total");

    const monthTarget = parseFloat(process.env.MONTHLY_SALES_TARGET || "500000");
    const monthProgress = monthTarget > 0 ? Math.min(Math.round((monthRev / monthTarget) * 100), 100) : 0;

    const lastMonthStart = `${thisYear}-${String(thisMonth).padStart(2, "0")}-01`;
    let lastMonthRev = 0;
    try {
      const lmRes = await db.query("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE received_at >= $1 AND received_at < $2", [lastMonthStart, monthStart]);
      lastMonthRev = parseFloat(lmRes.rows[0]?.total || 0);
    } catch (e) {}

    const growth = lastMonthRev > 0 ? Math.round(((monthRev - lastMonthRev) / lastMonthRev) * 100) : 0;

    const lastMonthStartAlt = thisMonth === 0
      ? `${thisYear - 1}-12-01`
      : `${thisYear}-${String(thisMonth).padStart(2, "0")}-01`;

    res.json({
      today: { revenue: todayRev, payments: todayPmtCount, new_customers: newCustToday },
      month: {
        revenue: monthRev,
        payments: monthPmtCount,
        new_customers: newCustMonth,
        target: monthTarget,
        progress: monthProgress,
        growth,
      },
      totals: { customers: totalCust, active_subscriptions: activeSubs, revenue: totalRev },
      plan_upgrades: planUpgrades.status === "fulfilled" ? planUpgrades.value.rows : [],
      top_agents: topAgents.status === "fulfilled" ? topAgents.value.rows : [],
      recent_sales: recentSales.status === "fulfilled" ? recentSales.value.rows : [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
