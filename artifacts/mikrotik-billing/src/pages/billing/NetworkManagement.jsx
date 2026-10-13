/**
 * NetworkManagement.jsx — Unified Network Management Dashboard
 * Centralises: Routers, NAS devices, IP Pools, PPPoE sessions,
 * Subscriptions, and quick-links to all network sub-pages.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  Server, Wifi, Shield, Network, Activity, AlertTriangle,
  CheckCircle2, XCircle, RefreshCw, ExternalLink, Clock,
  Cpu, HardDrive, Globe, Radio, Gauge, Router, Zap, Users,
  TrendingUp, ArrowUpRight, Package, BarChart2, Eye,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';
const AUTO_REFRESH_MS = 30_000;

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmtTime(ts) {
  if (!ts) return 'Never';
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

function pct(used, total) {
  if (!total || total === '0') return 0;
  return Math.round((parseInt(used) / parseInt(total)) * 100);
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color, linkTo }) {
  const colors = {
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', glow: 'shadow-emerald-500/10' },
    blue:    { bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/20',    glow: 'shadow-blue-500/10'    },
    amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20',   glow: 'shadow-amber-500/10'   },
    red:     { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/20',     glow: 'shadow-red-500/10'     },
    violet:  { bg: 'bg-violet-500/10',  text: 'text-violet-400',  border: 'border-violet-500/20',  glow: 'shadow-violet-500/10'  },
    cyan:    { bg: 'bg-cyan-500/10',    text: 'text-cyan-400',    border: 'border-cyan-500/20',    glow: 'shadow-cyan-500/10'    },
  };
  const c = colors[color] || colors.blue;
  const inner = (
    <div className={`relative bg-[#151821] border ${c.border} rounded-2xl p-5 hover:bg-[#1a1e2e] transition-all duration-200 shadow-lg ${c.glow} group h-full`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.text}`} />
        </div>
        {linkTo && <ExternalLink className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 transition-colors" />}
      </div>
      <div className={`text-3xl font-bold ${c.text} tabular-nums`}>{value ?? '—'}</div>
      <div className="text-sm text-gray-400 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-600 mt-1">{sub}</div>}
    </div>
  );
  return linkTo ? <Link to={linkTo} className="block h-full">{inner}</Link> : inner;
}

// ─── Router Status Card ─────────────────────────────────────────────────────
function RouterCard({ router }) {
  const online = router.is_online;
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ${
      online
        ? 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10'
        : 'bg-red-500/5 border-red-500/20 hover:bg-red-500/10'
    }`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${online ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
        <Router className={`w-4 h-4 ${online ? 'text-emerald-400' : 'text-red-400'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{router.name}</div>
        <div className="text-xs text-gray-500 font-mono">{router.ip_address}</div>
      </div>
      <div className="flex-shrink-0 text-right">
        <div className={`flex items-center gap-1.5 text-xs font-medium ${online ? 'text-emerald-400' : 'text-red-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          {online ? 'Online' : 'Offline'}
        </div>
        <div className="text-xs text-gray-600 mt-0.5">{fmtTime(router.last_seen)}</div>
      </div>
    </div>
  );
}

// ─── NAS Card ──────────────────────────────────────────────────────────────────
function NasCard({ nas }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-violet-500/20 bg-violet-500/5 hover:bg-violet-500/10 transition-all">
      <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0">
        <Shield className="w-4 h-4 text-violet-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{nas.shortname || nas.nasname}</div>
        <div className="text-xs text-gray-500 font-mono">{nas.nasname}</div>
      </div>
      <div className="text-xs text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-lg border border-violet-500/20 capitalize">
        {nas.type || 'other'}
      </div>
    </div>
  );
}

// ─── IP Pool Bar ─────────────────────────────────────────────────────────────
function PoolBar({ subnet }) {
  const used    = parseInt(subnet.used_ips  || 0);
  const free    = parseInt(subnet.free_ips  || 0);
  const total   = parseInt(subnet.total_ips || used + free);
  const percent = pct(used, total);
  const color   = percent > 90 ? 'bg-red-500' : percent > 70 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-all">
      <div className="flex items-center justify-between mb-2">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-white">{subnet.network}/{subnet.mask ?? subnet.name ?? ''}</span>
          {subnet.name && subnet.name !== subnet.network && (
            <span className="ml-2 text-xs text-gray-500">{subnet.name}</span>
          )}
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
          percent > 90 ? 'text-red-400 bg-red-500/10' :
          percent > 70 ? 'text-amber-400 bg-amber-500/10' :
          'text-emerald-400 bg-emerald-500/10'
        }`}>{percent}%</span>
      </div>
      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden mb-1.5">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${percent}%` }} />
      </div>
      <div className="flex justify-between text-xs text-gray-600">
        <span>{used} used</span>
        <span>{free} free</span>
        <span>{total} total</span>
      </div>
    </div>
  );
}

// ─── Quick-link Tile ────────────────────────────────────────────────────────
function QuickLink({ to, icon: Icon, label, desc, color }) {
  const c = {
    blue:   { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/20'   },
    emerald:{ bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
    amber:  { bg: 'bg-amber-500/10',  text: 'text-amber-400',  border: 'border-amber-500/20'  },
    violet: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' },
    cyan:   { bg: 'bg-cyan-500/10',   text: 'text-cyan-400',   border: 'border-cyan-500/20'   },
    red:    { bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500/20'    },
  }[color] || { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' };
  return (
    <Link to={to} className={`flex items-center gap-3 p-3.5 rounded-xl border ${c.border} bg-[#151821] hover:bg-[#1a1e2e] transition-all group`}>
      <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
        <Icon className={`w-4.5 h-4.5 ${c.text}`} />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white">{label}</div>
        <div className="text-xs text-gray-500 truncate">{desc}</div>
      </div>
    </Link>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export function NetworkManagement() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing]   = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const res = await axios.get(`${API}/network/summary`);
      setData(res.data);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(() => load(true), AUTO_REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f111a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Loading network data…</p>
        </div>
      </div>
    );
  }

  // ─── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-[#0f111a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-white font-bold text-xl">Failed to load network data</h2>
          <p className="text-gray-400 text-sm">{error}</p>
          <button onClick={() => load()} className="px-6 py-2.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
        </div>
      </div>
    );
  }

  const { routers, nas, ipam, subscriptions: subs, pppoe_sessions } = data || {};

  const routerOnlinePct = routers?.total ? Math.round((routers.online / routers.total) * 100) : 0;
  const ipUsedPct       = ipam?.total_ips ? pct(ipam.used_ips, ipam.total_ips) : 0;

  return (
    <div className="bg-[#0f111a] text-white p-6 md:p-8 space-y-8 overflow-x-hidden">
      {/* ─── Gradient overlay ─── */}
      <div className="fixed top-0 left-0 right-0 h-64 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none z-0" />

      <div className="relative z-10 space-y-8 max-w-7xl mx-auto">

        {/* ─── HEADER ─── */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Network className="w-6 h-6 text-blue-400" />
              </div>
              Network Management
            </h1>
            <p className="text-gray-400 text-sm mt-1 ml-[52px]">
              Centralised view of routers, NAS devices, IP pools, and sessions
            </p>
          </div>
          <div className="flex items-center gap-3 ml-[52px] md:ml-0">
            {lastUpdated && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Updated {fmtTime(lastUpdated)}
              </span>
            )}
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-all text-sm font-medium disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* ─── STAT CARDS ─── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Total Routers"    value={routers?.total}   sub={`${routers?.online ?? 0} online`}            icon={Router}    color="blue"    linkTo="/routers" />
          <StatCard label="Online Routers"   value={routers?.online}  sub={`${routerOnlinePct}% uptime`}                icon={CheckCircle2} color="emerald" linkTo="/routers" />
          <StatCard label="Offline Routers"  value={routers?.offline} sub="Requires attention"                           icon={XCircle}   color={routers?.offline > 0 ? 'red' : 'emerald'} linkTo="/routers" />
          <StatCard label="NAS Devices"      value={nas?.total}       sub="RADIUS clients"                              icon={Shield}    color="violet"  linkTo="/radius" />
          <StatCard label="PPPoE Sessions"   value={pppoe_sessions}   sub="Active right now"                            icon={Wifi}      color="cyan"    linkTo="/pppoe" />
          <StatCard label="Active Subs"      value={subs?.active}     sub={`${subs?.suspended ?? 0} suspended`}         icon={Users}     color="amber"   linkTo="/billing-subscriptions" />
        </div>

        {/* ─── ROUTERS + NAS ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Routers */}
          <div className="bg-[#151821] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Router className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-white font-bold text-sm">MikroTik Routers</h2>
                  <p className="text-gray-500 text-xs">{routers?.total ?? 0} registered</p>
                </div>
              </div>
              <Link to="/routers" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                Manage <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>

            {/* Online bar */}
            <div className="px-5 py-3 bg-white/[0.02] border-b border-white/[0.04]">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                <span>Network Health</span>
                <span className={routerOnlinePct === 100 ? 'text-emerald-400' : routerOnlinePct > 70 ? 'text-amber-400' : 'text-red-400'}>
                  {routerOnlinePct}%
                </span>
              </div>
              <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${routerOnlinePct === 100 ? 'bg-emerald-500' : routerOnlinePct > 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${routerOnlinePct}%` }}
                />
              </div>
            </div>

            <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
              {(routers?.list || []).length === 0 ? (
                <div className="text-center py-8 text-gray-600">
                  <Router className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No routers configured</p>
                  <Link to="/routers" className="text-xs text-blue-400 hover:underline mt-1 inline-block">Add a router →</Link>
                </div>
              ) : (
                // Sort: offline first
                [...(routers?.list || [])].sort((a, b) => (a.is_online === b.is_online ? 0 : a.is_online ? 1 : -1))
                  .map(r => <RouterCard key={r.id} router={r} />)
              )}
            </div>
          </div>

          {/* NAS Devices */}
          <div className="bg-[#151821] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <h2 className="text-white font-bold text-sm">NAS / RADIUS Clients</h2>
                  <p className="text-gray-500 text-xs">{nas?.total ?? 0} registered</p>
                </div>
              </div>
              <Link to="/radius" className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors">
                Manage <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
              {(nas?.list || []).length === 0 ? (
                <div className="text-center py-8 text-gray-600">
                  <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No NAS clients configured</p>
                  <Link to="/radius" className="text-xs text-violet-400 hover:underline mt-1 inline-block">Add a NAS →</Link>
                </div>
              ) : (
                (nas?.list || []).map(n => <NasCard key={n.id} nas={n} />)
              )}
            </div>
          </div>
        </div>

        {/* ─── IP POOL / IPAM ─── */}
        <div className="bg-[#151821] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                <Globe className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <h2 className="text-white font-bold text-sm">IP Address Management (IPAM)</h2>
                <p className="text-gray-500 text-xs">Pool utilisation across all subnets</p>
              </div>
            </div>
            <Link to="/ipam" className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors">
              Full IPAM <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Totals row */}
          <div className="grid grid-cols-4 divide-x divide-white/[0.06] border-b border-white/[0.06]">
            {[
              { label: 'Total IPs',    value: ipam?.total_ips,    color: 'text-white' },
              { label: 'Used',         value: ipam?.used_ips,     color: 'text-blue-400' },
              { label: 'Free',         value: ipam?.free_ips,     color: 'text-emerald-400' },
              { label: 'Reserved',     value: ipam?.reserved_ips, color: 'text-amber-400' },
            ].map(s => (
              <div key={s.label} className="px-4 py-3 text-center">
                <div className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value ?? 0}</div>
                <div className="text-xs text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Global bar */}
          {parseInt(ipam?.total_ips) > 0 && (
            <div className="px-5 py-3 border-b border-white/[0.04] bg-white/[0.01]">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                <span>Global IP utilisation</span>
                <span className={ipUsedPct > 90 ? 'text-red-400' : ipUsedPct > 70 ? 'text-amber-400' : 'text-emerald-400'}>{ipUsedPct}%</span>
              </div>
              <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden flex">
                <div className="h-full bg-blue-500 transition-all duration-700" style={{ width: `${pct(ipam?.used_ips, ipam?.total_ips)}%` }} />
                <div className="h-full bg-amber-500 transition-all duration-700" style={{ width: `${pct(ipam?.reserved_ips, ipam?.total_ips)}%` }} />
              </div>
              <div className="flex gap-4 mt-1.5 text-xs text-gray-600">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Used</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Reserved</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Free</span>
              </div>
            </div>
          )}

          {/* Subnet list */}
          <div className="p-5">
            {(ipam?.subnets || []).length === 0 ? (
              <div className="text-center py-10 text-gray-600">
                <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No subnets configured</p>
                <Link to="/ipam" className="text-xs text-cyan-400 hover:underline mt-1 inline-block">Set up IPAM →</Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {(ipam?.subnets || []).map(s => <PoolBar key={s.id} subnet={s} />)}
              </div>
            )}
          </div>
        </div>

        {/* ─── SUBSCRIPTION SUMMARY ─── */}
        <div className="bg-[#151821] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <Users className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-white font-bold text-sm">Subscription Status</h2>
                <p className="text-gray-500 text-xs">All service subscriptions</p>
              </div>
            </div>
            <Link to="/billing-subscriptions" className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors">
              View all <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-white/[0.06]">
            {[
              { label: 'Total',     value: subs?.total,     color: 'text-white',         icon: Package },
              { label: 'Active',    value: subs?.active,    color: 'text-emerald-400',   icon: CheckCircle2 },
              { label: 'Suspended', value: subs?.suspended, color: 'text-amber-400',     icon: AlertTriangle },
              { label: 'Expired',   value: subs?.expired,   color: 'text-red-400',       icon: XCircle },
            ].map(s => (
              <div key={s.label} className="p-5 text-center">
                <s.icon className={`w-5 h-5 mx-auto mb-2 ${s.color}`} />
                <div className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value ?? 0}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          {/* Mini stacked bar */}
          {parseInt(subs?.total) > 0 && (
            <div className="px-5 pb-4">
              <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden flex">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct(subs?.active, subs?.total)}%` }} />
                <div className="h-full bg-amber-500 transition-all"  style={{ width: `${pct(subs?.suspended, subs?.total)}%` }} />
                <div className="h-full bg-red-500 transition-all"    style={{ width: `${pct(subs?.expired, subs?.total)}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* ─── QUICK LINKS ─── */}
        <div>
          <h2 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" /> Quick Access
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            <QuickLink to="/routers"          icon={Router}    label="Routers"        desc="Manage connections"       color="blue"    />
            <QuickLink to="/pppoe"            icon={Wifi}      label="PPPoE"          desc="Sessions & secrets"       color="cyan"    />
            <QuickLink to="/hotspot"          icon={Activity}  label="Hotspot"        desc="Users & servers"          color="emerald" />
            <QuickLink to="/radius"           icon={Shield}    label="RADIUS"         desc="NAS & AAA"                color="violet"  />
            <QuickLink to="/ipam"             icon={Globe}     label="IPAM"           desc="IP pools & subnets"       color="cyan"    />
            <QuickLink to="/network-services" icon={Server}    label="Net Services"   desc="DHCP, DNS, Firewall"      color="blue"    />
            <QuickLink to="/olt"              icon={Radio}     label="OLT / Fiber"    desc="GPON devices"             color="amber"   />
            <QuickLink to="/fup"              icon={Gauge}     label="FUP Profiles"   desc="Fair usage policies"      color="amber"   />
            <QuickLink to="/tr069"            icon={Router}    label="TR-069 CPE"     desc="CPE device mgmt"          color="blue"    />
            <QuickLink to="/bandwidth"        icon={BarChart2} label="Bandwidth"      desc="Historical graphs"        color="emerald" />
            <QuickLink to="/speedtest"        icon={Zap}       label="Speed Test"     desc="Live throughput test"     color="cyan"    />
            <QuickLink to="/billing-monitoring" icon={Eye}     label="Monitoring"     desc="Real-time stats"          color="red"     />
          </div>
        </div>

      </div>
    </div>
  );
}

export default NetworkManagement;
