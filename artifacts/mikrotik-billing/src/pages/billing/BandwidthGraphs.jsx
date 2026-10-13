import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import {
  Activity, Users, ArrowUpRight, ArrowDownRight, Wifi, RefreshCw, Search,
  TrendingUp, Zap, Clock, BarChart3, Download, Settings
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

/* ─── Sparkline SVG ─── */
function Sparkline({ data, color = '#3b82f6', width = 200, height = 60 }) {
  if (!data || data.length < 2) {return null;}
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill={`url(#grad-${color.replace('#', '')})`} points={areaPoints} />
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

/* ─── Bar Chart ─── */
function BarChart({ data, height = 200, color = 'bg-blue-500' }) {
  if (!data || data.length === 0) {return <div className="text-center text-zinc-600 py-8">No data</div>;}
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center flex-1 group relative">
          <div className="absolute bottom-full mb-2 px-2 py-1 bg-zinc-800 rounded text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
            {d.label}: {d.formatted || d.value}
          </div>
          <div className={`w-full rounded-t ${color} transition-all duration-300 group-hover:opacity-100`}
            style={{ height: `${(d.value / max) * 100}%`, minHeight: 4 }} />
          <span className="text-[9px] text-zinc-600 mt-1 truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) {return '0 B';}
  const b = parseInt(bytes);
  if (b < 1024) {return `${b} B`;}
  if (b < 1048576) {return `${(b / 1024).toFixed(1)} KB`;}
  if (b < 1073741824) {return `${(b / 1048576).toFixed(1)} MB`;}
  return `${(b / 1073741824).toFixed(2)} GB`;
}

function formatUptime(seconds) {
  if (!seconds) {return '0s';}
  const s = parseInt(seconds);
  if (s < 60) {return `${s}s`;}
  if (s < 3600) {return `${Math.floor(s / 60)}m`;}
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

export function BandwidthGraphs() {
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState('');
  const [activeSessions, setActiveSessions] = useState([]);
  const [usageData, setUsageData] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [customers, setCustomers] = useState([]);
  const [timeRange, setTimeRange] = useState('1h');
  const [polling, setPolling] = useState(true);
  const intervalRef = useRef(null);

  useEffect(() => {
    axios.get(`${API}/mikrotik`).then(r => setConnections(r.data)).catch(() => {});
    axios.get(`${API}/billing/customers`).then(r => setCustomers(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedConnection) {fetchBandwidthData();}
  }, [selectedConnection]);

  useEffect(() => {
    if (polling && selectedConnection) {
      intervalRef.current = setInterval(fetchBandwidthData, 30000); // Poll every 30s for real data
    }
    return () => clearInterval(intervalRef.current);
  }, [polling, selectedConnection, timeRange]);

  // Refetch usage history when timeRange changes
  useEffect(() => {
    if (selectedConnection || usageData.length > 0) {
      fetchUsageHistory();
    }
  }, [timeRange]);

  const fetchBandwidthData = async () => {
    setLoading(true);
    try {
      // Get active PPPoE sessions
      const pppoeRes = await axios.get(`${API}/network/pppoe/active${selectedConnection ? `?connection_id=${selectedConnection}` : ''}`).catch(() => ({ data: [] }));
      // Get active Hotspot sessions
      const hotspotRes = await axios.get(`${API}/network/hotspot/active${selectedConnection ? `?connection_id=${selectedConnection}` : ''}`).catch(() => ({ data: [] }));

      const sessions = [
        ...(pppoeRes.data || []).map(s => ({ ...s, type: 'pppoe' })),
        ...(hotspotRes.data || []).map(s => ({ ...s, type: 'hotspot', username: s.user })),
      ];
      setActiveSessions(sessions);

      // Fetch REAL historical usage data from backend
      await fetchUsageHistory();
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const fetchUsageHistory = async () => {
    try {
      const params = new URLSearchParams({ time_range: timeRange });
      if (selectedConnection) {params.append('connection_id', selectedConnection);}
      if (selectedCustomer) {params.append('customer_id', selectedCustomer);}

      const { data } = await axios.get(`${API}/billing/usage/history?${params.toString()}`).catch(() => ({ data: { data: [] } }));

      // Transform backend data to match frontend format
      const historyData = (data.data || []).map(d => ({
        time: new Date(d.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        download: d.download || 0,
        upload: d.upload || 0,
        total: d.total || 0,
        sessions: d.sessions || 0,
      }));

      setUsageData(historyData);
    } catch (e) {
      console.error('Failed to fetch usage history:', e);
      setUsageData([]);
    }
  };

  const totalDownload = usageData.reduce((s, d) => s + d.download, 0);
  const totalUpload = usageData.reduce((s, d) => s + d.upload, 0);
  const peakDownload = Math.max(...usageData.map(d => d.download), 0);
  const avgSessions = usageData.length > 0 ? Math.round(usageData.reduce((s, d) => s + d.sessions, 0) / usageData.length) : 0;

  return (
    <div className="relative min-h-full p-8 animate-fade-in">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-noise" />

      {/* Header */}
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Activity className="w-4 h-4 text-white" />
            </div>
            Bandwidth Monitor
          </h1>
          <p className="text-zinc-400 mt-1">Real-time bandwidth graphs and per-customer usage tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={selectedConnection} onChange={e => setSelectedConnection(e.target.value)} className="modern-input text-sm py-2">
            <option value="">Select router...</option>
            {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex gap-1">
            {['1h', '6h', '24h', '7d'].map(r => (
              <button key={r} onClick={() => { setTimeRange(r); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${timeRange === r ? 'bg-emerald-600 text-white' : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700/60'}`}>
                {r}
              </button>
            ))}
          </div>
          <button onClick={() => setPolling(!polling)}
            className={`btn-ghost ${polling ? 'text-emerald-400' : 'text-zinc-500'}`}>
            <RefreshCw className={`w-4 h-4 ${polling ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="relative grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2"><ArrowDownRight className="w-4 h-4 text-blue-400" /><span className="text-sm text-zinc-400">Total Download</span></div>
          <div className="stat-value text-blue-400">{formatBytes(totalDownload)}</div>
        </div>
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2"><ArrowUpRight className="w-4 h-4 text-emerald-400" /><span className="text-sm text-zinc-400">Total Upload</span></div>
          <div className="stat-value text-emerald-400">{formatBytes(totalUpload)}</div>
        </div>
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2"><TrendingUp className="w-4 h-4 text-amber-400" /><span className="text-sm text-zinc-400">Peak Download</span></div>
          <div className="stat-value text-amber-400">{formatBytes(peakDownload)}</div>
        </div>
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2"><Users className="w-4 h-4 text-violet-400" /><span className="text-sm text-zinc-400">Avg Sessions</span></div>
          <div className="stat-value text-violet-400">{avgSessions}</div>
        </div>
      </div>

      {/* Main Graph */}
      <div className="relative glass rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-semibold text-white">Bandwidth Over Time</h3>
            <p className="text-sm text-zinc-500 mt-0.5">Download and upload traffic</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-blue-500" /><span className="text-xs text-zinc-500">Download</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-emerald-500" /><span className="text-xs text-zinc-500">Upload</span></div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="text-xs text-zinc-500 mb-2">Download</div>
            <Sparkline data={usageData.map(d => d.download)} color="#3b82f6" width={400} height={120} />
          </div>
          <div>
            <div className="text-xs text-zinc-500 mb-2">Upload</div>
            <Sparkline data={usageData.map(d => d.upload)} color="#10b981" width={400} height={120} />
          </div>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Sessions Table */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wifi className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-semibold text-white">Active Sessions ({activeSessions.length})</h3>
          </div>
          {activeSessions.length === 0 ? (
            <div className="py-12 text-center text-zinc-500">No active sessions</div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {activeSessions.slice(0, 20).map((s, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 status-dot" />
                    <div className="min-w-0">
                      <div className="text-sm text-white font-medium truncate">{s.username || 'Unknown'}</div>
                      <div className="text-xs text-zinc-500">{s.address}{s['mac-address'] ? ` • ${s['mac-address']}` : ''}</div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs text-zinc-300">{s.uptime || '—'}</div>
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-blue-400">↓ {formatBytes(s['bytes-in'] || 0)}</span>
                      <span className="text-emerald-400">↑ {formatBytes(s['bytes-out'] || 0)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hourly Distribution */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            <h3 className="text-base font-semibold text-white">Hourly Distribution</h3>
          </div>
          <BarChart
            data={usageData.filter((_, i) => i % Math.max(1, Math.floor(usageData.length / 24)) === 0).slice(-24).map(d => ({
              label: d.time.slice(0, 5),
              value: d.total,
              formatted: formatBytes(d.total),
            }))}
            height={160}
            color="bg-blue-500"
          />
        </div>
      </div>
    </div>
  );
}
