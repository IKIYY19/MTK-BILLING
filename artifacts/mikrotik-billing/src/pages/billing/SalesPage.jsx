import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  TrendingUp, DollarSign, Users, UserPlus, Target, Zap,
  BarChart3, ArrowUpRight, ArrowDownRight, Trophy,
  RefreshCw, Activity, CreditCard, ShoppingCart,
  Sparkles, Crown, Medal, Star,
} from "lucide-react";
import { useToast } from "../../hooks/useToast";

const API = import.meta.env.VITE_API_URL || "/api";

function AnimatedNumber({ value, prefix = "", decimals = 0 }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let frame;
    const duration = 600;
    const start = performance.now();
    const animate = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span>{prefix}{display.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</span>;
}

function ProgressBar({ value, max, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-2 bg-zinc-800/50 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-1000"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

function StatGlow({ icon: Icon, label, value, prefix, suffix, trend, color, onClick }) {
  return (
    <div onClick={onClick} className="surface-card p-5 cursor-pointer hover:shadow-xl group relative overflow-hidden">
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `radial-gradient(circle at 50% 0%, ${color}15, transparent 70%)` }} />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}15` }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
        </div>
        <div className="text-2xl font-bold text-white">
          <AnimatedNumber value={value} prefix={prefix || ""} />
          {suffix}
        </div>
        {trend !== undefined && (
          <div className="flex items-center gap-1 mt-1">
            {trend >= 0 ? <ArrowUpRight className="w-3 h-3 text-green-400" /> : <ArrowDownRight className="w-3 h-3 text-red-400" />}
            <span className={`text-xs font-medium ${trend >= 0 ? "text-green-400" : "text-red-400"}`}>
              {trend >= 0 ? "+" : ""}{trend}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SalesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: res } = await axios.get(`${API}/sales/dashboard`);
      setData(res);
    } catch (e) {
      toast.error("Failed to load sales data");
    } finally { setLoading(false); }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <Activity className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            Sales Command Center
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Revenue, targets, pipeline &amp; performance</p>
        </div>
        <button onClick={fetchData} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-all">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Monthly Target */}
      {data?.month && (
        <div className="surface-card p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-amber-400" />
              <span className="text-sm font-semibold text-white">Monthly Revenue Target</span>
            </div>
            <span className="text-sm font-bold text-white">
              KES <AnimatedNumber value={data.month.revenue} />{" "}
              <span className="text-zinc-500 font-normal">/ KES {data.month.target?.toLocaleString()}</span>
            </span>
          </div>
          <ProgressBar value={data.month.revenue} max={data.month.target} color="linear-gradient(90deg, #f59e0b, #fbbf24)" />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-zinc-500">{data.month.progress}% achieved</span>
            <span className="text-xs text-zinc-500">
              {data.month.progress >= 100 ? "🏆 Target reached!" : `${data.month.progress >= 75 ? "Almost there!" : "Keep pushing"}`}
            </span>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <StatGlow icon={DollarSign} label="Today's Revenue" value={data?.today?.revenue || 0} prefix="KES " color="#22c55e" trend={data?.month?.growth} />
        <StatGlow icon={ShoppingCart} label="Today's Sales" value={data?.today?.payments || 0} color="#3b82f6" />
        <StatGlow icon={UserPlus} label="New Today" value={data?.today?.new_customers || 0} color="#a855f7" />
        <StatGlow icon={Users} label="New This Month" value={data?.month?.new_customers || 0} color="#06b6d4" />
        <StatGlow icon={TrendingUp} label="Total Revenue" value={data?.totals?.revenue || 0} prefix="KES " color="#f59e0b" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Sales Feed */}
        <div className="lg:col-span-2">
          <div className="surface-card p-4">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-green-400" /> Recent Sales Activity
            </h2>
            <div className="space-y-0">
              {data?.recent_sales?.map((sale, i) => (
                <div key={sale.id || i} className="flex items-center justify-between py-2.5 border-b border-zinc-800/30 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                      i === 0 ? "bg-amber-500/10 text-amber-400" :
                      i < 3 ? "bg-blue-500/10 text-blue-400" : "bg-zinc-500/10 text-zinc-400"
                    }`}>
                      {i === 0 ? <Crown className="w-3.5 h-3.5" /> :
                       i < 3 ? <Medal className="w-3.5 h-3.5" /> :
                       <Star className="w-3.5 h-3.5" />}
                    </div>
                    <div>
                      <p className="text-sm text-white font-medium">{sale.customer_name || "Unknown"}</p>
                      <p className="text-xs text-zinc-500">{sale.method || "payment"} {sale.agent_name ? `· ${sale.agent_name}` : ""}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-green-400">+{(sale.amount || 0).toLocaleString()} KES</span>
                    <p className="text-xs text-zinc-600">{sale.received_at ? new Date(sale.received_at).toLocaleDateString() : ""}</p>
                  </div>
                </div>
              ))}
              {(!data?.recent_sales || data.recent_sales.length === 0) && (
                <p className="text-center text-zinc-500 text-sm py-8">No sales recorded yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          {/* Top Agents */}
          <div className="surface-card p-4">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" /> Top Agents
            </h2>
            <div className="space-y-3">
              {data?.top_agents?.map((agent, i) => (
                <div key={agent.id} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? "bg-amber-500 text-black" :
                    i === 1 ? "bg-zinc-400 text-black" :
                    i === 2 ? "bg-amber-700 text-white" : "bg-zinc-800 text-zinc-400"
                  }`}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{agent.name || "Unknown"}</p>
                    <p className="text-xs text-zinc-500">{agent.customers || 0} customers</p>
                  </div>
                  <span className="text-sm font-semibold text-green-400 shrink-0">
                    {(agent.revenue || 0).toLocaleString()} KES
                  </span>
                </div>
              ))}
              {(!data?.top_agents || data.top_agents.length === 0) && (
                <p className="text-center text-zinc-500 text-sm py-4">No agents yet</p>
              )}
            </div>
          </div>

          {/* Plan Upgrades / Upsells */}
          <div className="surface-card p-4">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-violet-400" /> Plan Upgrades
            </h2>
            <div className="space-y-2">
              {data?.plan_upgrades?.map((up, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="w-3 h-3 text-green-400" />
                    <span className="text-xs text-zinc-400">{up.old_plan || "—"} → <span className="text-white">{up.new_plan || "—"}</span></span>
                  </div>
                  <span className="text-xs font-semibold text-zinc-500">{up.count}x</span>
                </div>
              ))}
              {(!data?.plan_upgrades || data.plan_upgrades.length === 0) && (
                <p className="text-center text-zinc-500 text-sm py-4">No upgrades tracked</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
