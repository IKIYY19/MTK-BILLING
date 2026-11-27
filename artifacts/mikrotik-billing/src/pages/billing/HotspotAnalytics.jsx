import { useState, useEffect } from "react";
import axios from "axios";
import {
  BarChart3, TrendingUp, Users, DollarSign, Activity, Calendar,
  PieChart, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "/api";

export default function HotspotAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    axios
      .get(`${API}/captive-hotspot/analytics`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6 text-zinc-400">Loading analytics...</div>
    );
  }
  if (error) {
    return <div className="p-6 text-red-400">{error}</div>;
  }
  if (!data) {
    return <div className="p-6 text-zinc-400">No data available.</div>;
  }

  const { overview, revenue, planPopularity, dailyRevenue } = data;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <BarChart3 className="w-6 h-6 text-amber-400" />
        <h1 className="text-xl font-bold text-white">Hotspot Analytics</h1>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Sessions" value={overview.totalSessions} icon={Users} />
        <StatCard label="Active Now" value={overview.activeNow} icon={Activity} color="text-emerald-400" />
        <StatCard label="Authorized" value={overview.authorized} icon={TrendingUp} color="text-blue-400" />
        <StatCard label="Expired" value={overview.expired} icon={Calendar} color="text-zinc-400" />
        <StatCard label="Suspended" value={overview.suspended} icon={ArrowDownRight} color="text-red-400" />
        <StatCard label="Pending" value={overview.pending} icon={ArrowUpRight} color="text-amber-400" />
      </div>

      {/* Revenue cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            <span className="text-sm text-zinc-400">Total Revenue</span>
          </div>
          <div className="text-2xl font-bold text-white">
            KES {revenue.totalRevenue.toLocaleString()}
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            {revenue.paidCount} paid sessions
          </div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <PieChart className="w-5 h-5 text-amber-400" />
            <span className="text-sm text-zinc-400">Avg. Revenue per Session</span>
          </div>
          <div className="text-2xl font-bold text-white">
            KES {revenue.paidCount > 0 ? Math.round(revenue.totalRevenue / revenue.paidCount).toLocaleString() : 0}
          </div>
          <div className="text-xs text-zinc-500 mt-1">Per paid session</div>
        </div>
      </div>

      {/* Plan popularity */}
      <div className="glass rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-white mb-3">Plan Popularity</h2>
        {planPopularity.length === 0 ? (
          <p className="text-zinc-500 text-sm">No data yet.</p>
        ) : (
          <div className="space-y-2">
            {planPopularity.map((p, i) => {
              const maxCount = Math.max(...planPopularity.map((x) => x.count));
              const pct = maxCount > 0 ? (p.count / maxCount) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm text-zinc-300 w-32 truncate">{p.planName}</span>
                  <div className="flex-1 h-6 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-zinc-400 w-16 text-right">
                    {p.count} · KES {p.revenue.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Daily revenue chart (simple bar chart) */}
      <div className="glass rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-white mb-3">Daily Revenue (Last 30 Days)</h2>
        {dailyRevenue.length === 0 ? (
          <p className="text-zinc-500 text-sm">No data yet.</p>
        ) : (
          <div className="flex items-end gap-1 h-40">
            {dailyRevenue.map((d, i) => {
              const maxRev = Math.max(...dailyRevenue.map((x) => x.revenue), 1);
              const h = (d.revenue / maxRev) * 100;
              return (
                <div
                  key={i}
                  className="flex-1 bg-gradient-to-t from-amber-600 to-amber-400 rounded-t min-w-[4px] relative group"
                  style={{ height: `${Math.max(h, 2)}%` }}
                  title={`${d.day}: KES ${d.revenue} (${d.sessions} sessions)`}
                />
              );
            })}
          </div>
        )}
        {dailyRevenue.length > 0 && (
          <div className="flex justify-between text-[10px] text-zinc-500 mt-2">
            <span>{dailyRevenue[0]?.day}</span>
            <span>{dailyRevenue[dailyRevenue.length - 1]?.day}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color = "text-white" }) {
  return (
    <div className="glass rounded-2xl p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-[11px] text-zinc-400">{label}</span>
      </div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}