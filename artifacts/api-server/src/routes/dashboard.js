/**
 * Dashboard Stats API
 * Returns real-time statistics for the main dashboard
 * Cached for 10 seconds to eliminate repeated DB round-trips
 */

const express = require("express");
const { getDb } = require("../db");
const billing = require("../services/billingData");
const router = express.Router();

// Simple in-memory cache with TTL
const cache = { stats: null, ts: 0 };
const CACHE_TTL = 10000; // 10 seconds



// ─── GET DASHBOARD STATS ───
router.get("/stats", async (req, res) => {
  // Return cached data if fresh
  if (cache.stats && Date.now() - cache.ts < CACHE_TTL) {
    return res.json({
      success: true,
      timestamp: cache.stats.timestamp,
      stats: cache.stats,
      cached: true,
    });
  }

  try {
    const db = getDb();
    const stats = {};

    // Run ALL independent queries in parallel
    const [
      projectsResult,
      templatesResult,
      customersResult,
      usersResult,
      activeResult,
      suspendedResult,
      revenueResult,
      hotspotTotalResult,
      pendingResult,
      mikrotikResult,
      recentProjectsResult,
      recentCustomersResult,
      todayResult,
      hotspotTodayResult,
      todayCountResult,
      monthResult,
      hotspotMonthResult,
      lastMonthResult,
      outstandingResult,
      overdueResult,
      activeSubsResult,
      topPlansResult,
      revenueByDayResult,
      presenceResult,
      recentPaymentsResult,
      revenueSpark12Result,
      customerSpark12Result,
      outstandingSpark12Result,
      prevWeekActiveResult,
    ] = await Promise.allSettled([
      db.query("SELECT COUNT(*) FROM projects"),
      db.query("SELECT COUNT(*) FROM templates"),
      db.query("SELECT COUNT(*) FROM customers"),
      db.query("SELECT COUNT(*) FROM users"),
      db.query("SELECT COUNT(*) FROM customers WHERE status = 'active'"),
      db.query("SELECT COUNT(*) FROM customers WHERE status = 'suspended'"),
      db.query(
        "SELECT COALESCE(SUM(amount), 0) as total FROM invoices WHERE status = 'paid'",
      ),
      db.query(
        "SELECT COALESCE(SUM(amount), 0) as total FROM captive_hotspot_sessions WHERE status IN ('authorized', 'expired', 'suspended')",
      ),
      db.query(
        "SELECT COALESCE(SUM(amount), 0) as total FROM invoices WHERE status = 'pending'",
      ),
      db.query("SELECT COUNT(*) FROM mikrotik_connections"),
      db.query(
        "SELECT COUNT(*) FROM projects WHERE created_at >= NOW() - INTERVAL '7 days'",
      ),
      db.query(
        "SELECT COUNT(*) FROM customers WHERE created_at >= NOW() - INTERVAL '7 days'",
      ),
      db.query(
        "SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE DATE(received_at) = CURRENT_DATE",
      ),
      db.query(
        "SELECT COALESCE(SUM(amount), 0) as total FROM captive_hotspot_sessions WHERE status IN ('authorized', 'expired', 'suspended') AND DATE(paid_at) = CURRENT_DATE",
      ),
      db.query(
        "SELECT COUNT(*) as count FROM payments WHERE DATE(received_at) = CURRENT_DATE",
      ),
      db.query(
        "SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE EXTRACT(MONTH FROM received_at) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM received_at) = EXTRACT(YEAR FROM CURRENT_DATE)",
      ),
      db.query(
        "SELECT COALESCE(SUM(amount), 0) as total FROM captive_hotspot_sessions WHERE status IN ('authorized', 'expired', 'suspended') AND EXTRACT(MONTH FROM paid_at) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM paid_at) = EXTRACT(YEAR FROM CURRENT_DATE)",
      ),
      db.query(
        "SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE EXTRACT(MONTH FROM received_at) = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '1 month') AND EXTRACT(YEAR FROM received_at) = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 month')",
      ),
      db.query(
        "SELECT COALESCE(SUM(total - COALESCE(paid_amount, 0)), 0) as total FROM invoices WHERE status IN ('pending', 'partial', 'overdue')",
      ),
      db.query(
        "SELECT COUNT(*) as count FROM invoices WHERE status = 'overdue' OR (status = 'pending' AND due_date < CURRENT_DATE)",
      ),
      db.query(
        "SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'",
      ),
      db.query(
        "SELECT p.name, p.price, COUNT(s.id) as customer_count FROM service_plans p LEFT JOIN subscriptions s ON p.id = s.plan_id AND s.status = 'active' GROUP BY p.id, p.name, p.price ORDER BY customer_count DESC LIMIT 5",
      ),
      db.query(
        `SELECT date, SUM(total) as total FROM (
          SELECT DATE(created_at) as date, SUM(amount) as total FROM invoices WHERE status = 'paid' AND created_at >= NOW() - INTERVAL '7 days' GROUP BY DATE(created_at)
          UNION ALL
          SELECT DATE(paid_at) as date, SUM(amount) as total FROM captive_hotspot_sessions WHERE status IN ('authorized', 'expired', 'suspended') AND paid_at >= NOW() - INTERVAL '7 days' GROUP BY DATE(paid_at)
        ) combined GROUP BY date ORDER BY date DESC`,
      ),
      require("../services/onlineStatus").getOnlineStatus(),
      db.query(
        `SELECT * FROM (
          SELECT p.id, p.amount, p.method, p.received_at, c.name as customer_name, 'billing' as source
          FROM payments p LEFT JOIN customers c ON c.id = p.customer_id
          UNION ALL
          SELECT s.id, s.amount, 'hotspot' as method, s.paid_at as received_at, 'Hotspot User' as customer_name, 'hotspot' as source
          FROM captive_hotspot_sessions s
          WHERE s.status IN ('authorized', 'expired', 'suspended') AND s.paid_at IS NOT NULL
        ) combined ORDER BY received_at DESC LIMIT 5`
      ),
      // Sparkline: daily revenue for last 12 days
      db.query(
        `SELECT d::date as date, COALESCE(SUM(p.amount), 0) as total
         FROM generate_series(CURRENT_DATE - INTERVAL '11 days', CURRENT_DATE, '1 day') d
         LEFT JOIN payments p ON DATE(p.received_at) = d::date
         GROUP BY d::date ORDER BY d::date`,
      ),
      // Sparkline: daily new customers for last 12 days
      db.query(
        `SELECT d::date as date, COUNT(c.id) as total
         FROM generate_series(CURRENT_DATE - INTERVAL '11 days', CURRENT_DATE, '1 day') d
         LEFT JOIN customers c ON DATE(c.created_at) = d::date
         GROUP BY d::date ORDER BY d::date`,
      ),
      // Sparkline: daily outstanding balance for last 12 days
      db.query(
        `SELECT d::date as date, COALESCE(SUM(i.total - COALESCE(i.paid_amount, 0)), 0) as total
         FROM generate_series(CURRENT_DATE - INTERVAL '11 days', CURRENT_DATE, '1 day') d
         LEFT JOIN invoices i ON DATE(i.created_at) <= d::date AND i.status IN ('pending', 'partial', 'overdue')
         GROUP BY d::date ORDER BY d::date`,
      ),
      // Customer growth: count at end of previous week vs current
      db.query(
        "SELECT COUNT(*) as count FROM customers WHERE created_at < NOW() - INTERVAL '7 days' AND status = 'active'",
      ),
    ]);

    const val = (result, field = "count", fallback = 0) => {
      if (result.status === "fulfilled" && result.value?.rows?.[0]) {
        return field === "total"
          ? parseFloat(result.value.rows[0].total) || fallback
          : parseInt(result.value.rows[0][field]) || fallback;
      }
      return fallback;
    };

    stats.totalProjects = val(projectsResult);
    stats.totalTemplates = val(templatesResult);
    stats.totalCustomers = val(customersResult);
    stats.totalUsers = val(usersResult);
    stats.activeCustomers = val(activeResult);
    stats.suspendedCustomers = val(suspendedResult);
    stats.totalRevenue = val(revenueResult, "total") + val(hotspotTotalResult, "total");
    stats.pendingRevenue = val(pendingResult, "total");
    stats.activeDevices = val(mikrotikResult);
    stats.recentProjects = val(recentProjectsResult);
    stats.recentCustomers = val(recentCustomersResult);
    stats.todayRevenue = val(todayResult, "total") + val(hotspotTodayResult, "total");
    stats.todayPayments = val(todayCountResult);
    stats.monthRevenue = val(monthResult, "total") + val(hotspotMonthResult, "total");
    stats.lastMonthRevenue = val(lastMonthResult, "total");

    stats.revenueChange =
      stats.lastMonthRevenue > 0
        ? parseFloat(
            (
              ((stats.monthRevenue - stats.lastMonthRevenue) /
                stats.lastMonthRevenue) *
              100
            ).toFixed(1),
          )
        : stats.monthRevenue > 0
          ? 100
          : 0;

    stats.outstandingBalance = val(outstandingResult, "total");
    stats.overdueInvoices = val(overdueResult);
    stats.activeSubscriptions = val(activeSubsResult);
    stats.topPlans =
      topPlansResult.status === "fulfilled" ? topPlansResult.value.rows : [];
    stats.revenueByDay =
      revenueByDayResult.status === "fulfilled"
        ? revenueByDayResult.value.rows
        : [];
    const presence = presenceResult.status === "fulfilled" && presenceResult.value
      ? presenceResult.value
      : { pppoe: [], hotspot: [], total: 0, errors: [] };
    stats.activeRadiusSessions = presence.total;
    stats.onlineSessionsSource = "router";

    // Real-time customer status matrix, derived from live RouterOS sessions
    // joined to billing subscriptions (not from cached radacct/in-memory state).
    try {
      const [allSubscriptions, allCustomers] = await Promise.all([
        billing.listSubscriptions(),
        billing.listCustomers(),
      ]);
      const customerById = new Map(allCustomers.map((customer) => [customer.id, customer]));
      const activeSubs = allSubscriptions.filter((subscription) => subscription.status === "active");
      const suspendedSubs = allSubscriptions.filter((subscription) => subscription.status === "suspended");
      const onlineKeys = new Set(presence.pppoe.map((session) => session.username));

      const activeAuthorized = [];
      for (const subscription of activeSubs) {
        if (subscription.pppoe_username && onlineKeys.has(subscription.pppoe_username)) {
          activeAuthorized.push({
            customer_id: subscription.customer_id,
            customer_name: customerById.get(subscription.customer_id)?.name || subscription.customer_name || "Unknown",
            username: subscription.pppoe_username,
            subscription_id: subscription.id,
            plan_name: subscription.plan_name || "",
          });
        }
      }
      const activeUnauthorized = presence.pppoe
        .filter((session) => !activeSubs.some((subscription) => subscription.pppoe_username === session.username))
        .map((session) => ({
          customer_id: session.customer_id || null,
          customer_name: session.customer_name || "Unknown",
          username: session.username,
          router_name: session.router_name,
          address: session.address,
        }));
      const offlineAuthorized = activeSubs
        .filter((subscription) => subscription.pppoe_username && !onlineKeys.has(subscription.pppoe_username))
        .map((subscription) => ({
          customer_id: subscription.customer_id,
          customer_name: customerById.get(subscription.customer_id)?.name || subscription.customer_name || "Unknown",
          username: subscription.pppoe_username,
          plan_name: subscription.plan_name || "",
        }));
      const suspended = suspendedSubs.map((subscription) => ({
        customer_id: subscription.customer_id,
        customer_name: customerById.get(subscription.customer_id)?.name || subscription.customer_name || "Unknown",
        username: subscription.pppoe_username,
        plan_name: subscription.plan_name || "",
      }));

      stats.customerStatus = {
        online_sessions: presence.total,
        active_authorized: activeAuthorized.length,
        active_unauthorized: activeUnauthorized.length,
        offline_authorized: offlineAuthorized.length,
        suspended: suspended.length,
        lists: { activeAuthorized, activeUnauthorized, offlineAuthorized, suspended },
        source: "router+subscriptions",
        errors: presence.errors || [],
        generated_at: new Date().toISOString(),
      };
    } catch (error) {
      stats.customerStatus = {
        online_sessions: presence.total,
        active_authorized: null,
        active_unauthorized: null,
        offline_authorized: null,
        suspended: null,
        lists: {},
        source: "unavailable",
        errors: [error.message],
      };
    }
    stats.recentPayments =
      recentPaymentsResult.status === "fulfilled"
        ? recentPaymentsResult.value.rows
        : [];

    // Sparkline series (arrays of numbers for the last 12 days)
    const toSparkArray = (result) => {
      if (result.status !== "fulfilled") {
        return [];
      }
      return result.value.rows.map((r) => parseFloat(r.total) || 0);
    };
    stats.revenueSpark = toSparkArray(revenueSpark12Result);
    stats.customerSpark = toSparkArray(customerSpark12Result);
    stats.outstandingSpark = toSparkArray(outstandingSpark12Result);

    // Weekly revenue as day-label + value pairs for the bar chart
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    stats.weeklyRevenue =
      revenueSpark12Result.status === "fulfilled"
        ? revenueSpark12Result.value.rows.slice(-7).map((r) => ({
            label: dayNames[new Date(r.date).getDay()],
            value: parseFloat(r.total) || 0,
          }))
        : [];

    // Customer growth trend (percentage change this week vs last week)
    const prevWeekActive = val(prevWeekActiveResult);
    stats.customerGrowth =
      prevWeekActive > 0
        ? parseFloat(
            (
              ((stats.activeCustomers - prevWeekActive) / prevWeekActive) *
              100
            ).toFixed(1),
          )
        : stats.activeCustomers > 0
          ? 100
          : 0;

    stats.timestamp = new Date().toISOString();

    // Cache for 10 seconds
    cache.stats = stats;
    cache.ts = Date.now();

    res.json({
      success: true,
      timestamp: stats.timestamp,
      stats,
      cached: false,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    // Return stale cache if available
    if (cache.stats) {
      return res.json({
        success: true,
        timestamp: cache.stats.timestamp,
        stats: cache.stats,
        cached: true,
        stale: true,
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET QUICK ACTIONS ───
router.get("/quick-actions", async (req, res) => {
  const user = req.user;
  const actions = [
    {
      id: "new-customer",
      label: "Add Customer",
      icon: "UserPlus",
      route: "/billing-customers?action=add",
      color: "emerald",
    },
    {
      id: "send-sms",
      label: "Send SMS",
      icon: "MessageSquare",
      route: "/billing-messaging",
      color: "blue",
    },
    {
      id: "record-payment",
      label: "Record Payment",
      icon: "CreditCard",
      route: "/billing-payments",
      color: "amber",
    },
    {
      id: "reconcile",
      label: "Reconcile Routers",
      icon: "Link",
      route: "/billing-reconcile",
      color: "violet",
    },
  ];

  res.json({ success: true, actions });
});

module.exports = router;
