const express = require('express');
const router = express.Router();
const db = require('../db');

// ═══════════════════════════════════════
// ANALYTICS OVERVIEW
// ═══════════════════════════════════════
router.get('/overview', async (req, res) => {
  try {
    const { period = '30d' } = req.query;

    // Calculate date range
    const now = new Date();
    let startDate;
    switch (period) {
      case '7d': startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
      case '30d': startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
      case '90d': startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); break;
      case '1y': startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); break;
      default: startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const [
      totalRevenueRes,
      prevTotalRevenueRes,
      mrrRes,
      prevMrrRes,
      churnRes,
      prevChurnRes,
      newCustomersRes,
      prevNewCustomersRes,
      activeCustomersRes,
      prevActiveCustomersRes,
      arpuRes,
      ltvRes,
      lifespanRes,
    ] = await Promise.all([
      // Total revenue (current period)
      db.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE received_at >= $1`,
        [startDate]
      ),
      // Total revenue (previous period - for trend)
      db.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE received_at >= $1 AND received_at < $2`,
        [new Date(startDate.getTime() - (now.getTime() - startDate.getTime())), startDate]
      ),
      // MRR
      db.query(
        `SELECT COALESCE(SUM(sp.price), 0) as mrr FROM subscriptions s
         LEFT JOIN service_plans sp ON sp.id = s.plan_id WHERE s.status = 'active'`
      ),
      // Previous MRR (approximate)
      db.query(
        `SELECT COALESCE(SUM(sp.price), 0) as mrr FROM subscriptions s
         LEFT JOIN service_plans sp ON sp.id = s.plan_id
         WHERE s.status = 'active' AND s.created_at < $1`,
        [startDate]
      ),
      // Churn rate
      db.query(
        `SELECT COUNT(*) as churned FROM subscriptions
         WHERE status = 'suspended' AND updated_at >= $1`,
        [startDate]
      ),
      // Previous churn
      db.query(
        `SELECT COUNT(*) as churned FROM subscriptions
         WHERE status = 'suspended' AND updated_at >= $1 AND updated_at < $2`,
        [new Date(startDate.getTime() - (now.getTime() - startDate.getTime())), startDate]
      ),
      // New customers
      db.query(
        `SELECT COUNT(*) as new_cust FROM customers WHERE created_at >= $1`,
        [startDate]
      ),
      // Previous new customers
      db.query(
        `SELECT COUNT(*) as new_cust FROM customers WHERE created_at >= $1 AND created_at < $2`,
        [new Date(startDate.getTime() - (now.getTime() - startDate.getTime())), startDate]
      ),
      // Active customers
      db.query(`SELECT COUNT(*) as active FROM customers WHERE status = 'active'`),
      // Previous active customers
      db.query(`SELECT COUNT(*) as active FROM customers WHERE status = 'active' AND created_at < $1`, [startDate]),
      // ARPU (Average Revenue Per User)
      db.query(
        `SELECT CASE WHEN COUNT(DISTINCT c.id) > 0
          THEN COALESCE(SUM(p.amount), 0) / COUNT(DISTINCT c.id) ELSE 0 END as arpu
         FROM customers c
         LEFT JOIN payments p ON p.customer_id = c.id AND p.received_at >= $1
         WHERE c.status = 'active'`,
        [startDate]
      ),
      // LTV (Customer Lifetime Value)
      db.query(
        `SELECT CASE WHEN COUNT(DISTINCT c.id) > 0
          THEN COALESCE(SUM(p.amount), 0) / COUNT(DISTINCT c.id) ELSE 0 END as ltv
         FROM customers c
         LEFT JOIN payments p ON p.customer_id = c.id
         WHERE c.status != 'cancelled'`
      ),
      // Avg customer lifespan
      db.query(
        `SELECT COALESCE(AVG(EXTRACT(DAY FROM (COALESCE(cancelled_at, CURRENT_DATE) - created_at)) / 30.0), 0) as avg_months
         FROM customers`
      ),
    ]);

    const totalRevenue = parseFloat(totalRevenueRes.rows[0].total);
    const prevTotalRevenue = parseFloat(prevTotalRevenueRes.rows[0].total);
    const mrr = parseFloat(mrrRes.rows[0].mrr);
    const prevMrr = parseFloat(prevMrrRes.rows[0].mrr);
    const churned = parseInt(churnRes.rows[0].churned);
    const prevChurned = parseInt(prevChurnRes.rows[0].churned);
    const newCustomers = parseInt(newCustomersRes.rows[0].new_cust);
    const prevNewCustomers = parseInt(prevNewCustomersRes.rows[0].new_cust);
    const activeCustomers = parseInt(activeCustomersRes.rows[0].active);
    const prevActiveCustomers = parseInt(prevActiveCustomersRes.rows[0].active);
    const arpu = parseFloat(arpuRes.rows[0].arpu);
    const ltv = parseFloat(ltvRes.rows[0].ltv);
    const avgLifespan = parseFloat(lifespanRes.rows[0].avg_months);

    // Calculate trends (% change)
    const revenueTrend = prevTotalRevenue > 0 ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100 : 0;
    const mrrTrend = prevMrr > 0 ? ((mrr - prevMrr) / prevMrr) * 100 : 0;
    const churnRate = activeCustomers > 0 ? (churned / activeCustomers) * 100 : 0;
    const prevChurnRate = prevActiveCustomers > 0 ? (prevChurned / prevActiveCustomers) * 100 : 0;
    const churnTrend = prevChurnRate > 0 ? churnRate - prevChurnRate : 0;
    const customerGrowthTrend = prevNewCustomers > 0 ? ((newCustomers - prevNewCustomers) / prevNewCustomers) * 100 : 0;
    const activeCustomersTrend = prevActiveCustomers > 0 ? ((activeCustomers - prevActiveCustomers) / prevActiveCustomers) * 100 : 0;

    // Real daily sparklines (last 14 days)
    const sparkStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [churnSparkRes, growthSparkRes, activeSparkRes, prevArpuRes] = await Promise.all([
      db.query(
        `SELECT DATE(updated_at) as day, COUNT(*) as cnt
         FROM subscriptions WHERE status = 'suspended' AND updated_at >= $1
         GROUP BY DATE(updated_at) ORDER BY day ASC`,
        [sparkStart]
      ),
      db.query(
        `SELECT DATE(created_at) as day, COUNT(*) as cnt
         FROM customers WHERE created_at >= $1
         GROUP BY DATE(created_at) ORDER BY day ASC`,
        [sparkStart]
      ),
      db.query(
        `SELECT DATE(created_at) as day, COUNT(*) as cnt
         FROM customers WHERE status = 'active' AND created_at >= $1
         GROUP BY DATE(created_at) ORDER BY day ASC`,
        [sparkStart]
      ),
      // ARPU previous period for trend
      db.query(
        `SELECT CASE WHEN COUNT(DISTINCT c.id) > 0
          THEN COALESCE(SUM(p.amount), 0) / COUNT(DISTINCT c.id) ELSE 0 END as arpu
         FROM customers c
         LEFT JOIN payments p ON p.customer_id = c.id
           AND p.received_at >= $1 AND p.received_at < $2
         WHERE c.status = 'active'`,
        [new Date(startDate.getTime() - (now.getTime() - startDate.getTime())), startDate]
      ),
    ]);

    // Fill 14-slot arrays from daily query results
    function fillSpark(rows, valueKey = 'cnt') {
      const arr = new Array(14).fill(0);
      rows.forEach(row => {
        const idx = Math.floor((new Date(row.day) - sparkStart) / (24 * 60 * 60 * 1000));
        if (idx >= 0 && idx < 14) { arr[idx] = parseFloat(row[valueKey]); }
      });
      return arr;
    }

    const churnSpark = fillSpark(churnSparkRes.rows);
    const growthSpark = fillSpark(growthSparkRes.rows);
    const activeSpark = fillSpark(activeSparkRes.rows);
    const prevArpu = parseFloat(prevArpuRes.rows[0].arpu);
    const arpuTrend = prevArpu > 0 ? ((arpu - prevArpu) / prevArpu) * 100 : 0;

    // Also generate revenue sparkline
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365;
    const dailyRevenueRes = await db.query(
      `SELECT DATE(received_at) as day, COALESCE(SUM(amount), 0) as total
       FROM payments WHERE received_at >= $1
       GROUP BY DATE(received_at) ORDER BY day ASC`,
      [new Date(now.getTime() - days * 24 * 60 * 60 * 1000)]
    );
    const revenueSpark = new Array(days).fill(0);
    dailyRevenueRes.rows.forEach(row => {
      const idx = Math.floor((new Date(row.day) - new Date(now.getTime() - days * 24 * 60 * 60 * 1000)) / (24 * 60 * 60 * 1000));
      if (idx >= 0 && idx < days) {revenueSpark[idx] = parseFloat(row.total);}
    });

    // Generate insights from real data
    const insights = [];
    if (revenueTrend > 10) {insights.push({ type: 'positive', text: `Revenue is up ${revenueTrend.toFixed(1)}% compared to the previous period. Great growth momentum!` });}
    else if (revenueTrend < -10) {insights.push({ type: 'warning', text: `Revenue declined ${Math.abs(revenueTrend).toFixed(1)}% vs previous period. Consider reviewing pricing or retention strategies.` });}

    if (churnRate > 5) {insights.push({ type: 'warning', text: `Churn rate is at ${churnRate.toFixed(1)}%. Focus on customer retention to reduce cancellations.` });}
    else if (churnRate === 0 && churned === 0) {insights.push({ type: 'positive', text: 'Zero churn this period — excellent customer satisfaction!' });}

    if (newCustomers > prevNewCustomers) {insights.push({ type: 'positive', text: `Acquired ${newCustomers} new customers, up from ${prevNewCustomers} last period.` });}

    if (ltv > 0 && arpu > 0) {
      const ltvCacRatio = ltv / arpu;
      if (ltvCacRatio > 3) {insights.push({ type: 'positive', text: `LTV:CAC ratio is healthy at ${ltvCacRatio.toFixed(1)}:1. Your business model is sustainable.` });}
    }

    if (insights.length === 0) {insights.push({ type: 'info', text: 'Business is stable. Keep monitoring trends for optimization opportunities.' });}

    res.json({
      total_revenue: totalRevenue,
      revenue_trend: revenueTrend,
      revenue_spark: revenueSpark.slice(-14),
      mrr,
      mrr_trend: mrrTrend,
      churn_rate: parseFloat(churnRate.toFixed(2)),
      churn_trend: parseFloat(churnTrend.toFixed(2)),
      churn_spark: churnSpark,
      net_customer_growth: newCustomers - churned,
      customer_growth_trend: customerGrowthTrend,
      customer_growth_spark: growthSpark,
      active_customers: activeCustomers,
      active_customers_trend: activeCustomersTrend,
      active_customers_spark: activeSpark,
      arpu: parseFloat(arpu.toFixed(2)),
      arpu_trend: parseFloat(arpuTrend.toFixed(2)),
      ltv: parseFloat(ltv.toFixed(2)),
      avg_lifespan: parseFloat(avgLifespan.toFixed(1)),
      insights,
    });
  } catch (e) {
    console.error('Analytics overview error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// REVENUE TREND
// ═══════════════════════════════════════
router.get('/revenue-trend', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const now = new Date();
    const months = period === '1y' ? 12 : period === '90d' ? 3 : period === '30d' ? 1 : 1;

    const result = await db.query(
      `SELECT TO_CHAR(DATE_TRUNC('month', received_at), 'Mon YYYY') as label,
              COALESCE(SUM(amount), 0) as revenue,
              COUNT(DISTINCT customer_id) as customers
       FROM payments
       WHERE received_at >= $1
       GROUP BY DATE_TRUNC('month', received_at)
       ORDER BY DATE_TRUNC('month', received_at) ASC`,
      [new Date(now.getTime() - months * 30 * 24 * 60 * 60 * 1000)]
    );

    // If no data, generate placeholder months
    if (result.rows.length === 0) {
      const labels = [];
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        labels.push({ label: d.toLocaleString('default', { month: 'short' }), revenue: 0, customers: 0 });
      }
      return res.json(labels);
    }

    res.json(result.rows.map(row => ({
      label: row.label.split(' ')[0],
      revenue: parseFloat(row.revenue),
      customers: parseInt(row.customers),
    })));
  } catch (e) {
    console.error('Revenue trend error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// CHURN ANALYSIS
// ═══════════════════════════════════════
router.get('/churn', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const now = new Date();
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Monthly churn breakdown
    const monthlyResult = await db.query(
      `SELECT TO_CHAR(DATE_TRUNC('month', updated_at), 'Mon') as label,
              COUNT(*) as count
       FROM subscriptions
       WHERE status = 'suspended' AND updated_at >= $1
       GROUP BY DATE_TRUNC('month', updated_at)
       ORDER BY DATE_TRUNC('month', updated_at) ASC`,
      [startDate]
    );

    // Churn reasons (if tracked in notes or metadata)
    const churnedSubs = await db.query(
      `SELECT s.*, c.name as customer_name, sp.name as plan_name
       FROM subscriptions s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN service_plans sp ON sp.id = s.plan_id
       WHERE s.status = 'suspended' AND s.updated_at >= $1`,
      [startDate]
    );

    // Simplified reason categorization
    const reasons = [];
    if (churnedSubs.rows.length > 0) {
      // Categorize by plan price (higher price = more likely "too expensive")
      const highPrice = churnedSubs.rows.filter(s => parseFloat(s.plan_price || 0) > 1000).length;
      const shortLifespan = churnedSubs.rows.filter(s => {
        const created = new Date(s.created_at);
        const suspended = new Date(s.updated_at);
        return (suspended - created) / (30 * 24 * 60 * 60 * 1000) < 2;
      }).length;
      const other = churnedSubs.rows.length - highPrice - shortLifespan;

      if (highPrice > 0) {reasons.push({ reason: 'Too expensive (inferred from plan price)', count: highPrice, percentage: Math.round((highPrice / churnedSubs.rows.length) * 100) });}
      if (shortLifespan > 0) {reasons.push({ reason: 'Trial / Short usage (inferred from subscription age)', count: shortLifespan, percentage: Math.round((shortLifespan / churnedSubs.rows.length) * 100) });}
      if (other > 0) {reasons.push({ reason: 'Other / Unknown', count: other, percentage: Math.round((other / churnedSubs.rows.length) * 100) });}
    }

    res.json({
      monthly: monthlyResult.rows.map(r => ({ label: r.label, value: parseInt(r.count) })),
      reasons,
      total_churned: churnedSubs.rows.length,
    });
  } catch (e) {
    console.error('Churn analysis error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// CUSTOMER GROWTH
// ═══════════════════════════════════════
router.get('/customer-growth', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const now = new Date();
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Growth over time (daily or monthly)
    const growthResult = await db.query(
      `SELECT TO_CHAR(DATE_TRUNC('day', created_at), 'Mon DD') as label,
              COUNT(*) as count
       FROM customers
       WHERE created_at >= $1
       GROUP BY DATE_TRUNC('day', created_at)
       ORDER BY DATE_TRUNC('day', created_at) ASC`,
      [startDate]
    );

    // Plan distribution
    const planResult = await db.query(
      `SELECT sp.name, COUNT(s.id) as count
       FROM subscriptions s
       LEFT JOIN service_plans sp ON sp.id = s.plan_id
       WHERE s.status = 'active' AND sp.id IS NOT NULL
       GROUP BY sp.name
       ORDER BY count DESC`
    );

    const totalPlanCustomers = planResult.rows.reduce((sum, r) => sum + parseInt(r.count), 0);

    res.json({
      growth: growthResult.rows.map(r => ({
        label: r.label,
        value: parseInt(r.count),
      })),
      planDistribution: planResult.rows.map(r => ({
        name: r.name,
        count: parseInt(r.count),
        percentage: totalPlanCustomers > 0 ? Math.round((parseInt(r.count) / totalPlanCustomers) * 100) : 0,
      })),
    });
  } catch (e) {
    console.error('Customer growth error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// CHURN PREDICTION
// ═══════════════════════════════════════
router.get('/churn-report', async (req, res) => {
  try {
    const churnPrediction = require('../services/churnPrediction');
    const report = await churnPrediction.getChurnReport();
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
