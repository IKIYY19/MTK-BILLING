import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  TrendingUp, Users, DollarSign, Activity, ArrowUpRight, ArrowDownRight,
  Calendar, Download, BarChart3, PieChart, LineChart, Filter, RefreshCw,
  Target, UserMinus, Zap, Clock, ChevronDown
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

/* ─── Animated Number ─── */
function AnimatedNumber({ value, prefix = '', suffix = '' }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const duration = 800;
    const steps = 30;
    const stepTime = duration / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += (value - 0) / steps;
      setDisplay(Math.round(current * 100) / 100);
      if (current >= value) { clearInterval(timer); setDisplay(value); }
    }, stepTime);
    return () => clearInterval(timer);
  }, [value]);
  return <span>{prefix}{typeof value === 'number' && value % 1 !== 0 ? display.toFixed(2) : Math.round(display)}{suffix}</span>;
}

/* ─── Mini Bar Chart (Pure CSS) ─── */
function MiniBarChart({ data, height = 120, color = 'bg-blue-500' }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center flex-1 group relative">
          {/* Tooltip */}
          <div className="absolute bottom-full mb-2 px-2 py-1 bg-zinc-800 rounded text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
            {d.label}: {typeof d.value === 'number' ? d.value.toFixed(2) : d.value}
          </div>
          <div
            className={`w-full rounded-t ${color} opacity-80 group-hover:opacity-100 transition-all duration-200`}
            style={{ height: `${(d.value / max) * 100}%`, minHeight: 4 }}
          />
          <span className="text-[10px] text-zinc-500 mt-1.5 truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Sparkline (Pure CSS) ─── */
function Sparkline({ data, color = '#3b82f6', width = 80, height = 32 }) {
  if (!data || data.length < 2) {return null;}
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

/* ─── Stat Card ─── */
function StatCard({ title, value, icon: Icon, trend, prefix, suffix, sparkData, gradient, bg, ring, textColor }) {
  return (
    <div className="glass rounded-2xl p-5 card-hover group">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${bg} ring-1 ${ring} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
          <Icon className={`w-5 h-5 ${textColor}`} />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${trend >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3 rotate-90" />}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
      <div className={`stat-value ${textColor}`}>
        {typeof value === 'number' ? <AnimatedNumber value={value} prefix={prefix} suffix={suffix} /> : `${prefix}${value}${suffix}`}
      </div>
      <div className="text-sm text-zinc-400 mt-1">{title}</div>
      {sparkData && (
        <div className="mt-3 pt-3 border-t border-zinc-800/40">
          <Sparkline data={sparkData} color={trend >= 0 ? '#10b981' : '#f43f5e'} />
        </div>
      )}
    </div>
  );
}

/* ─── Period Selector ─── */
function PeriodSelector({ period, setPeriod }) {
  const periods = [
    { id: '7d', label: '7 Days' },
    { id: '30d', label: '30 Days' },
    { id: '90d', label: '90 Days' },
    { id: '1y', label: '1 Year' },
  ];
  return (
    <div className="flex gap-2">
      {periods.map(p => (
        <button
          key={p.id}
          onClick={() => setPeriod(p.id)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            period === p.id ? 'bg-blue-600 text-white' : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Revenue Trend Chart ─── */
function RevenueTrendChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-semibold text-white">Revenue Trend</h3>
            <p className="text-sm text-zinc-500 mt-0.5">Monthly revenue over time</p>
          </div>
          <BarChart3 className="w-5 h-5 text-zinc-600" />
        </div>
        <div className="py-16 text-center text-zinc-500">No revenue data yet</div>
      </div>
    );
  }

  const max = Math.max(...data.map(d => d.revenue), 1);
  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);
  const avgRevenue = totalRevenue / data.length;

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-semibold text-white">Revenue Trend</h3>
          <p className="text-sm text-zinc-500 mt-0.5">
            Total: <span className="text-emerald-400 font-semibold">KES {totalRevenue.toFixed(2)}</span> • Avg: <span className="text-blue-400">KES {avgRevenue.toFixed(2)}/mo</span>
          </p>
        </div>
        <BarChart3 className="w-5 h-5 text-zinc-600" />
      </div>

      {/* Chart */}
      <div className="flex items-end gap-2 mb-2" style={{ height: 200 }}>
        {data.map((d, i) => {
          const barHeight = (d.revenue / max) * 100;
          const isAboveAvg = d.revenue >= avgRevenue;
          return (
            <div key={i} className="flex flex-col items-center flex-1 group relative">
              <div className="absolute bottom-full mb-3 px-3 py-2 bg-zinc-800 rounded-lg text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                <div className="text-white font-semibold">KES {d.revenue.toFixed(2)}</div>
                <div className="text-zinc-400 mt-0.5">{d.label}</div>
                {d.customers && <div className="text-zinc-500">{d.customers} customers</div>}
              </div>
              <div
                className={`w-full rounded-t-lg transition-all duration-300 group-hover:opacity-100 ${
                  isAboveAvg ? 'bg-gradient-to-t from-emerald-600 to-emerald-400' : 'bg-gradient-to-t from-blue-600/60 to-blue-400/60'
                }`}
                style={{ height: `${barHeight}%`, minHeight: 8 }}
              />
              <span className="text-[10px] text-zinc-500 mt-2 truncate w-full text-center">{d.label}</span>
            </div>
          );
        })}
      </div>

      {/* Avg line legend */}
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-zinc-800/40">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-gradient-to-t from-emerald-600 to-emerald-400" />
          <span className="text-xs text-zinc-500">Above avg</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-gradient-to-t from-blue-600/60 to-blue-400/60" />
          <span className="text-xs text-zinc-500">Below avg</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Churn Analysis ─── */
function ChurnAnalysis({ data }) {
  if (!data) {return <div className="glass rounded-2xl p-6 py-16 text-center text-zinc-500">Loading churn data...</div>;}

  const churnReasons = data.reasons || [];
  const monthlyChurn = data.monthly || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Monthly Churn Rate */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-semibold text-white">Monthly Churn Rate</h3>
            <p className="text-sm text-zinc-500 mt-0.5">Customer cancellation rate</p>
          </div>
          <UserMinus className="w-5 h-5 text-rose-500" />
        </div>

        {monthlyChurn.length > 0 ? (
          <MiniBarChart data={monthlyChurn} height={160} color="bg-rose-500" />
        ) : (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center mx-auto mb-3">
              <Target className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="text-zinc-300 font-medium">No churn yet!</div>
            <div className="text-sm text-zinc-500 mt-1">All customers are staying</div>
          </div>
        )}
      </div>

      {/* Churn Reasons */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-semibold text-white">Churn Reasons</h3>
            <p className="text-sm text-zinc-500 mt-0.5">Why customers leave</p>
          </div>
          <PieChart className="w-5 h-5 text-zinc-600" />
        </div>

        {churnReasons.length > 0 ? (
          <div className="space-y-3">
            {churnReasons.map((r, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-zinc-300">{r.reason}</span>
                    <span className="text-sm text-zinc-500">{r.count} ({r.percentage}%)</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-rose-500 to-amber-500 rounded-full transition-all duration-500"
                      style={{ width: `${r.percentage}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-zinc-500">No churn data recorded</div>
        )}
      </div>
    </div>
  );
}

/* ─── Customer Growth ─── */
function CustomerGrowth({ data }) {
  if (!data) {return <div className="glass rounded-2xl p-6 py-16 text-center text-zinc-500">Loading growth data...</div>;}

  const growthData = data.growth || [];
  const planDistribution = data.planDistribution || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Growth Trend */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-semibold text-white">Customer Growth</h3>
            <p className="text-sm text-zinc-500 mt-0.5">New customers over time</p>
          </div>
          <Users className="w-5 h-5 text-blue-500" />
        </div>

        {growthData.length > 0 ? (
          <MiniBarChart data={growthData} height={160} color="bg-cyan-500" />
        ) : (
          <div className="py-12 text-center text-zinc-500">No customer data yet</div>
        )}
      </div>

      {/* Plan Distribution */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-semibold text-white">Plan Distribution</h3>
            <p className="text-sm text-zinc-500 mt-0.5">Customers by service plan</p>
          </div>
          <PieChart className="w-5 h-5 text-violet-500" />
        </div>

        {planDistribution.length > 0 ? (
          <div className="space-y-3">
            {planDistribution.map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${
                  ['bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500'][i % 5]
                }`} />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-zinc-300">{p.name}</span>
                    <span className="text-sm text-zinc-500">{p.count} customers</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        ['bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500'][i % 5]
                      }`}
                      style={{ width: `${p.percentage}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-zinc-500">No plan data yet</div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export function AnalyticsReports() {
  const [period, setPeriod] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [revenueTrend, setRevenueTrend] = useState([]);
  const [churnData, setChurnData] = useState(null);
  const [growthData, setGrowthData] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, trendRes, churnRes, growthRes] = await Promise.all([
        axios.get(`${API}/analytics/overview?period=${period}`),
        axios.get(`${API}/analytics/revenue-trend?period=${period}`),
        axios.get(`${API}/analytics/churn?period=${period}`),
        axios.get(`${API}/analytics/customer-growth?period=${period}`),
      ]);
      setAnalytics(statsRes.data);
      setRevenueTrend(trendRes.data);
      setChurnData(churnRes.data);
      setGrowthData(growthRes.data);
    } catch (e) {
      console.error('Analytics fetch error:', e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [period]);

  if (loading) {
    return (
      <div className="p-8 animate-fade-in">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <div key={i} className="skeleton h-32 rounded-2xl" />)}
        </div>
        <div className="skeleton h-80 rounded-2xl mb-6" />
        <div className="grid grid-cols-2 gap-6">
          <div className="skeleton h-64 rounded-2xl" />
          <div className="skeleton h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  const stats = analytics || {};

  return (
    <div className="relative min-h-full p-8 animate-fade-in">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-noise" />

      {/* Header */}
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Analytics & Reports</h1>
          <p className="text-zinc-400 mt-1">Revenue trends, churn analysis & customer growth</p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodSelector period={period} setPeriod={setPeriod} />
          <button onClick={fetchData} className="btn-ghost">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="relative grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Revenue"
          value={stats.total_revenue || 0}
          icon={DollarSign}
          trend={stats.revenue_trend}
          prefix="KES "
          sparkData={stats.revenue_spark}
          bg="bg-emerald-500/10"
          ring="ring-emerald-500/20"
          textColor="text-emerald-400"
        />
        <StatCard
          title="MRR (Monthly Recurring)"
          value={stats.mrr || 0}
          icon={TrendingUp}
          trend={stats.mrr_trend}
          prefix="KES "
          sparkData={stats.mrr_spark}
          bg="bg-blue-500/10"
          ring="ring-blue-500/20"
          textColor="text-blue-400"
        />
        <StatCard
          title="Churn Rate"
          value={stats.churn_rate || 0}
          icon={UserMinus}
          trend={-stats.churn_trend}
          suffix="%"
          sparkData={stats.churn_spark}
          bg="bg-rose-500/10"
          ring="ring-rose-500/20"
          textColor="text-rose-400"
        />
        <StatCard
          title="Net Customer Growth"
          value={stats.net_customer_growth || 0}
          icon={Users}
          trend={stats.customer_growth_trend}
          sparkData={stats.customer_growth_spark}
          bg="bg-cyan-500/10"
          ring="ring-cyan-500/20"
          textColor="text-cyan-400"
        />
        <StatCard
          title="Active Customers"
          value={stats.active_customers || 0}
          icon={Users}
          trend={stats.active_customers_trend}
          sparkData={stats.active_customers_spark}
          bg="bg-violet-500/10"
          ring="ring-violet-500/20"
          textColor="text-violet-400"
        />
        <StatCard
          title="ARPU"
          value={stats.arpu || 0}
          icon={Activity}
          trend={stats.arpu_trend}
          prefix="KES "
          bg="bg-amber-500/10"
          ring="ring-amber-500/20"
          textColor="text-amber-400"
        />
        <StatCard
          title="Customer Lifetime Value"
          value={stats.ltv || 0}
          icon={Target}
          prefix="KES "
          bg="bg-emerald-500/10"
          ring="ring-emerald-500/20"
          textColor="text-emerald-400"
        />
        <StatCard
          title="Avg. Customer Lifespan"
          value={stats.avg_lifespan || 0}
          icon={Clock}
          suffix=" mo"
          bg="bg-zinc-500/10"
          ring="ring-zinc-500/20"
          textColor="text-zinc-400"
        />
      </div>

      {/* Revenue Trend */}
      <div className="relative mb-8">
        <RevenueTrendChart data={revenueTrend} />
      </div>

      {/* Churn + Growth */}
      <div className="relative space-y-6 mb-8">
        <ChurnAnalysis data={churnData} />
        <CustomerGrowth data={growthData} />
      </div>

      {/* Quick Insights */}
      {analytics?.insights && analytics.insights.length > 0 && (
        <div className="relative glass rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-semibold text-white">Key Insights</h3>
          </div>
          <div className="space-y-3">
            {analytics.insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-zinc-800/30 border border-zinc-800/40">
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                  insight.type === 'positive' ? 'bg-emerald-400' : insight.type === 'warning' ? 'bg-amber-400' : 'bg-blue-400'
                }`} />
                <p className="text-sm text-zinc-300">{insight.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
