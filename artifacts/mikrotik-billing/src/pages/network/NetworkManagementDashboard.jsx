import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Server, Cpu, HardDrive, Wifi, Shield, Network, Activity,
  AlertTriangle, CheckCircle2, XCircle, Clock, ArrowUpRight,
  ArrowDownRight, RefreshCw, Users, Router, Gauge, Globe,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

const API = import.meta.env.VITE_API_URL || '/api';

/* ── Utility ── */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function formatUptime(uptimeFormatted) {
  return uptimeFormatted || '—';
}

/* ── Animated Number ── */
function AnimatedNumber({ value, decimals = 0 }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const duration = 600;
    const steps = 25;
    const stepTime = duration / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += value / steps;
      setDisplay(current);
      if (current >= value) { clearInterval(timer); setDisplay(value); }
    }, stepTime);
    return () => clearInterval(timer);
  }, [value]);
  return <span>{decimals > 0 ? display.toFixed(decimals) : Math.round(display)}</span>;
}

/* ── Status Badge ── */
function StatusBadge({ status }) {
  const config = {
    online: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle2 },
    active: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle2 },
    idle: { color: 'text-zinc-400', bg: 'bg-zinc-500/10', icon: Clock },
    offline: { color: 'text-rose-400', bg: 'bg-rose-500/10', icon: XCircle },
    warning: { color: 'text-amber-400', bg: 'bg-amber-500/10', icon: AlertTriangle },
  };
  const c = config[status] || config.offline;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.color}`}>
      <Icon className="w-3 h-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

/* ── Usage Bar ── */
function UsageBar({ used, total, color = 'bg-indigo-500' }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const barColor = pct > 90 ? 'bg-rose-500' : pct > 75 ? 'bg-amber-500' : color;
  return (
    <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ── Summary Card ── */
function SummaryCard({ label, value, icon: Icon, color, sub }) {
  const c = {
    emerald: { bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20', text: 'text-emerald-400' },
    blue: { bg: 'bg-blue-500/10', ring: 'ring-blue-500/20', text: 'text-blue-400' },
    violet: { bg: 'bg-violet-500/10', ring: 'ring-violet-500/20', text: 'text-violet-400' },
    amber: { bg: 'bg-amber-500/10', ring: 'ring-amber-500/20', text: 'text-amber-400' },
    rose: { bg: 'bg-rose-500/10', ring: 'ring-rose-500/20', text: 'text-rose-400' },
    cyan: { bg: 'bg-cyan-500/10', ring: 'ring-cyan-500/20', text: 'text-cyan-400' },
    indigo: { bg: 'bg-indigo-500/10', ring: 'ring-indigo-500/20', text: 'text-indigo-400' },
  }[color] || { bg: 'bg-blue-500/10', ring: 'ring-blue-500/20', text: 'text-blue-400' };

  return (
    <Card className="card-hover group">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className={`w-10 h-10 rounded-xl ${c.bg} ring-1 ${c.ring} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
            <Icon className={`w-5 h-5 ${c.text}`} />
          </div>
        </div>
        <div className={`stat-value ${c.text}`}>
          <AnimatedNumber value={typeof value === 'number' ? value : 0} />
        </div>
        <div className="flex items-center justify-between mt-1">
          <div className="text-sm text-zinc-400">{label}</div>
          {sub && <div className="text-xs text-zinc-500">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Router Health Card ── */
function RouterHealthCard({ router }) {
  return (
    <Card className="card-hover">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center">
              <Router className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white truncate max-w-[140px]">{router.name}</div>
              <div className="text-xs text-zinc-500">{router.host}</div>
            </div>
          </div>
          <StatusBadge status={router.status} />
        </div>

        {router.status === 'online' ? (
          <div className="space-y-3">
            {/* CPU */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-zinc-400 flex items-center gap-1"><Cpu className="w-3 h-3" /> CPU</span>
                <span className={`text-xs font-medium ${router.cpu > 80 ? 'text-rose-400' : router.cpu > 60 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {router.cpu}%
                </span>
              </div>
              <UsageBar used={router.cpu} total={100} color="bg-indigo-500" />
            </div>

            {/* Memory */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-zinc-400 flex items-center gap-1"><HardDrive className="w-3 h-3" /> Memory</span>
                <span className={`text-xs font-medium ${router.memory > 80 ? 'text-rose-400' : router.memory > 60 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {router.memory}% ({formatBytes(router.memoryUsed)})
                </span>
              </div>
              <UsageBar used={router.memory} total={100} color="bg-violet-500" />
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="text-center p-2 rounded-lg bg-zinc-800/50">
                <div className="text-[10px] text-zinc-500 mb-0.5">Uptime</div>
                <div className="text-xs font-medium text-zinc-300">{formatUptime(router.uptimeFormatted)}</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-zinc-800/50">
                <div className="text-[10px] text-zinc-500 mb-0.5">PPPoE</div>
                <div className="text-xs font-medium text-zinc-300">{router.activePPPoE} active</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-zinc-800/50">
                <div className="text-[10px] text-zinc-500 mb-0.5 flex items-center justify-center gap-0.5"><ArrowDownRight className="w-2.5 h-2.5 text-emerald-400" /> RX</div>
                <div className="text-xs font-medium text-zinc-300">{formatBytes(router.bandwidthIn)}</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-zinc-800/50">
                <div className="text-[10px] text-zinc-500 mb-0.5 flex items-center justify-center gap-0.5"><ArrowUpRight className="w-2.5 h-2.5 text-blue-400" /> TX</div>
                <div className="text-xs font-medium text-zinc-300">{formatBytes(router.bandwidthOut)}</div>
              </div>
            </div>

            {/* Version / Board */}
            <div className="text-[10px] text-zinc-600 pt-1">
              {router.board && <span>{router.board}</span>}
              {router.version && <span> · RouterOS {router.version}</span>}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center py-6 text-zinc-500">
            <XCircle className="w-8 h-8 mb-2 opacity-40" />
            <span className="text-xs">Router Unreachable</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── IP Pool Row ── */
function IPPoolRow({ pool }) {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-zinc-800/30 last:border-0">
      <div className="w-9 h-9 rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/20 flex items-center justify-center flex-shrink-0">
        <Network className="w-4 h-4 text-cyan-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">{pool.name || pool.network}</div>
        <div className="text-xs text-zinc-500">{pool.network}/{pool.mask} {pool.vlan_id ? `· VLAN ${pool.vlan_id}` : ''}</div>
        <div className="mt-1.5">
          <UsageBar used={pool.used_ips} total={pool.total_ips} color="bg-cyan-500" />
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-sm font-medium text-zinc-300">{pool.usage_percent}%</div>
        <div className="text-xs text-zinc-500">{pool.used_ips}/{pool.total_ips} IPs</div>
      </div>
    </div>
  );
}

/* ── NAS Row ── */
function NASRow({ nas }) {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-zinc-800/30 last:border-0">
      <div className="w-9 h-9 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20 flex items-center justify-center flex-shrink-0">
        <Shield className="w-4 h-4 text-amber-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">{nas.shortname || nas.nasname}</div>
        <div className="text-xs text-zinc-500">{nas.nasname} · {nas.type || 'other'}</div>
      </div>
      <div className="text-right flex-shrink-0 flex items-center gap-3">
        <div>
          <div className="text-sm font-medium text-zinc-300">{nas.active_sessions}</div>
          <div className="text-xs text-zinc-500">sessions</div>
        </div>
        <StatusBadge status={nas.status} />
      </div>
    </div>
  );
}

/* ── PPPoE Session Row ── */
function PPPoESessionRow({ session }) {
  return (
    <tr className="border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors">
      <td className="py-2.5 px-3 text-sm text-white">{session.username}</td>
      <td className="py-2.5 px-3 text-sm text-zinc-400">{session.ip_address}</td>
      <td className="py-2.5 px-3 text-sm text-zinc-500">{session.router_name}</td>
      <td className="py-2.5 px-3 text-sm text-zinc-500">{session.uptime}</td>
      <td className="py-2.5 px-3 text-sm text-emerald-400">{formatBytes(session.bytes_in)}</td>
      <td className="py-2.5 px-3 text-sm text-blue-400">{formatBytes(session.bytes_out)}</td>
    </tr>
  );
}

/* ── Main Page ── */
export function NetworkManagementDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await axios.get(`${API}/network/management/dashboard`);
      setData(res.data);
      setError(null);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="p-8 animate-fade-in">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
          {[1,2,3,4,5,6,7].map(i => <div key={i} className="skeleton h-28 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {[1,2,3,4].map(i => <div key={i} className="skeleton h-64 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[50vh]">
        <AlertTriangle className="w-12 h-12 text-amber-400 mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">Failed to Load Dashboard</h3>
        <p className="text-zinc-400 mb-4">{error}</p>
        <Button onClick={fetchData} variant="outline" className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Retry
        </Button>
      </div>
    );
  }

  const d = data || {
    routers: [],
    ipPools: [],
    pppoeSessions: { total: 0, sessions: [], byRouter: {} },
    radiusNAS: [],
    summary: {},
  };
  const s = {
    totalRouters: 0,
    onlineRouters: 0,
    totalPPPoEActive: 0,
    totalIPPools: 0,
    totalIPUsed: 0,
    totalIPFree: 0,
    totalNASDevices: 0,
    activeNASSessions: 0,
    ...(d.summary || {}),
  };
  const routers = Array.isArray(d.routers) ? d.routers : [];
  const ipPools = Array.isArray(d.ipPools) ? d.ipPools : [];
  const radiusNAS = Array.isArray(d.radiusNAS) ? d.radiusNAS : [];
  const pppoeSessions = {
    total: 0,
    sessions: [],
    byRouter: {},
    ...(d.pppoeSessions || {}),
  };
  const topSessions = Array.isArray(d.pppoeSessions?.sessions)
    ? d.pppoeSessions.sessions.slice(0, 10)
    : [];

  return (
    <div className="p-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white gradient-text">Network Management</h2>
          <p className="text-slate-400 mt-1">Unified view of routers, IP pools, PPPoE sessions, and RADIUS NAS</p>
        </div>
        <Button
          onClick={fetchData}
          disabled={refreshing}
          variant="outline"
          className="flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
        <SummaryCard label="Routers" value={s.totalRouters} icon={Router} color="blue" sub={`${s.onlineRouters} online`} />
        <SummaryCard label="PPPoE Active" value={s.totalPPPoEActive} icon={Wifi} color="emerald" />
        <SummaryCard label="IP Pools" value={s.totalIPPools} icon={Network} color="cyan" />
        <SummaryCard label="IPs Used" value={s.totalIPUsed} icon={Globe} color="indigo" sub={`${s.totalIPFree} free`} />
        <SummaryCard label="NAS Devices" value={s.totalNASDevices} icon={Shield} color="amber" />
        <SummaryCard label="NAS Sessions" value={s.activeNASSessions} icon={Users} color="violet" />
        <SummaryCard label="Online" value={s.onlineRouters} icon={CheckCircle2} color="emerald" sub={`of ${s.totalRouters}`} />
      </div>

      {/* Router Health Section */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Server className="w-5 h-5 text-blue-400" /> Router Health
        </h3>
        {routers.length === 0 ? (
          <Card className="card-gradient">
            <CardContent className="p-8 flex flex-col items-center">
              <Router className="w-10 h-10 text-zinc-600 mb-3" />
              <p className="text-zinc-500 text-sm">No routers configured. Add routers in the Routers page.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {routers.map(r => <RouterHealthCard key={r.id} router={r} />)}
          </div>
        )}
      </div>

      {/* Two-column: IP Pools + RADIUS NAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* IP Pool Usage */}
        <Card className="card-gradient">
          <CardHeader className="border-b border-zinc-800">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Network className="w-4 h-4 text-cyan-400" /> IP Pool Usage
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 max-h-[400px] overflow-y-auto">
            {ipPools.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-zinc-500">
                <Network className="w-8 h-8 mb-2 opacity-40" />
                <span className="text-sm">No IP pools configured. Create subnets in IPAM.</span>
              </div>
            ) : (
              ipPools.map(pool => <IPPoolRow key={pool.id} pool={pool} />)
            )}
          </CardContent>
        </Card>

        {/* RADIUS NAS Status */}
        <Card className="card-gradient">
          <CardHeader className="border-b border-zinc-800">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" /> RADIUS NAS Status
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 max-h-[400px] overflow-y-auto">
            {radiusNAS.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-zinc-500">
                <Shield className="w-8 h-8 mb-2 opacity-40" />
                <span className="text-sm">No NAS devices configured. Add NAS in RADIUS management.</span>
              </div>
            ) : (
              radiusNAS.map(nas => <NASRow key={nas.id} nas={nas} />)
            )}
          </CardContent>
        </Card>
      </div>

      {/* PPPoE Active Sessions Table */}
      <Card className="card-gradient mb-8">
        <CardHeader className="border-b border-zinc-800">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Wifi className="w-4 h-4 text-emerald-400" /> Active PPPoE Sessions
              <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium">
                {pppoeSessions.total}
              </span>
            </CardTitle>
            {pppoeSessions.total > 10 && (
              <span className="text-xs text-zinc-500">Showing top 10 by router</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {topSessions.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-zinc-500">
              <Wifi className="w-8 h-8 mb-2 opacity-40" />
              <span className="text-sm">No active PPPoE sessions</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="py-2.5 px-3 text-left text-xs font-medium text-zinc-500">Username</th>
                    <th className="py-2.5 px-3 text-left text-xs font-medium text-zinc-500">IP Address</th>
                    <th className="py-2.5 px-3 text-left text-xs font-medium text-zinc-500">Router</th>
                    <th className="py-2.5 px-3 text-left text-xs font-medium text-zinc-500">Uptime</th>
                    <th className="py-2.5 px-3 text-left text-xs font-medium text-zinc-500">↓ RX</th>
                    <th className="py-2.5 px-3 text-left text-xs font-medium text-zinc-500">↑ TX</th>
                  </tr>
                </thead>
                <tbody>
                  {topSessions.map(session => <PPPoESessionRow key={session.id} session={session} />)}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bandwidth by Router */}
      {Object.keys(pppoeSessions.byRouter).length > 0 && (
        <Card className="card-gradient">
          <CardHeader className="border-b border-zinc-800">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" /> Bandwidth by Router
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(pppoeSessions.byRouter).map(([id, r]) => (
                <div key={id} className="p-4 rounded-xl bg-zinc-800/30 border border-zinc-800/50">
                  <div className="text-sm font-medium text-white mb-3">{r.name}</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500 flex items-center gap-1"><ArrowDownRight className="w-3 h-3 text-emerald-400" /> RX</span>
                      <span className="text-xs font-medium text-emerald-400">{formatBytes(r.bandwidthIn)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500 flex items-center gap-1"><ArrowUpRight className="w-3 h-3 text-blue-400" /> TX</span>
                      <span className="text-xs font-medium text-blue-400">{formatBytes(r.bandwidthOut)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500 flex items-center gap-1"><Users className="w-3 h-3 text-violet-400" /> Sessions</span>
                      <span className="text-xs font-medium text-violet-400">{r.count}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default NetworkManagementDashboard;
