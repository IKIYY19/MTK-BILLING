import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle, CheckCircle, XCircle, Clock, RefreshCw, ShieldAlert,
  Server, Activity, ChevronDown, ChevronUp, Search, Bell, Trash2,
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { getUser } from '../../lib/auth';

const API = import.meta.env.VITE_API_URL || '/api';

const severityStyles = {
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  info: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
};

const statusStyles = {
  open: 'bg-red-500/10 text-red-400',
  acknowledged: 'bg-amber-500/10 text-amber-400',
  resolved: 'bg-emerald-500/10 text-emerald-400',
};

function formatWhen(value) {
  if (!value) {return '—';}
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {return String(value);}
  const absolute = date.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  let relative;
  if (seconds < 60) {relative = 'just now';}
  else if (seconds < 3600) {relative = `${Math.floor(seconds / 60)}m ago`;}
  else if (seconds < 86400) {relative = `${Math.floor(seconds / 3600)}h ago`;}
  else {relative = `${Math.floor(seconds / 86400)}d ago`;}
  return `${absolute} (${relative})`;
}

function typeLabel(type) {
  return String(type || 'alert')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function typeIcon(type) {
  if (String(type).startsWith('router')) {return Server;}
  if (String(type).includes('security')) {return ShieldAlert;}
  if (String(type).includes('ops')) {return Activity;}
  return Bell;
}

export function Alerts() {
  const { info, error: toastError } = useToast();
  const [alerts, setAlerts] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  const fetchAlerts = async (silent = false) => {
    if (!silent) {setLoading(true);}
    try {
      const { data } = await axios.get(`${API}/mikrotik/alerts/all`, {
        params: { limit: 200 },
      });
      setAlerts(Array.isArray(data) ? data : []);
      setLastUpdated(new Date());
    } catch (requestError) {
      console.error('Failed to fetch alerts:', requestError);
    } finally {
      if (!silent) {setLoading(false);}
    }
  };

  useEffect(() => {
    fetchAlerts();
    const timer = setInterval(() => fetchAlerts(true), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setSelectedIds((previous) => {
      const available = new Set(alerts.map((alert) => alert.id));
      const next = previous.filter((id) => available.has(id));
      return next.length === previous.length ? previous : next;
    });
  }, [alerts]);

  const updateAlert = async (id, action) => {
    try {
      const user = getUser();
      await axios.post(
        `${API}/mikrotik/alerts/${id}/${action}`,
        action === 'acknowledge' ? { userId: user?.id } : {},
      );
      info('Success', action === 'acknowledge' ? 'Alert acknowledged' : 'Alert resolved');
      fetchAlerts(true);
    } catch (requestError) {
      toastError('Error', requestError.response?.data?.error || 'Action failed');
    }
  };

  const types = useMemo(() => {
    const unique = new Set(alerts.map((alert) => alert.alert_type));
    return ['all', ...Array.from(unique).filter(Boolean).sort()];
  }, [alerts]);

  const filtered = useMemo(() => alerts.filter((alert) => {
    if (statusFilter !== 'all' && alert.status !== statusFilter) {return false;}
    if (severityFilter !== 'all' && alert.severity !== severityFilter) {return false;}
    if (typeFilter !== 'all' && alert.alert_type !== typeFilter) {return false;}
    if (search) {
      const haystack = `${alert.title} ${alert.message} ${alert.connection_name || ''}`.toLowerCase();
      if (!haystack.includes(search.toLowerCase())) {return false;}
    }
    return true;
  }), [alerts, statusFilter, severityFilter, typeFilter, search]);

  const filteredIds = useMemo(() => filtered.map((alert) => alert.id), [filtered]);
  const allFilteredSelected = filteredIds.length > 0 &&
    filteredIds.every((id) => selectedIds.includes(id));

  const toggleAlert = (id) => {
    setSelectedIds((previous) =>
      previous.includes(id)
        ? previous.filter((selected) => selected !== id)
        : [...previous, id],
    );
  };

  const toggleAllFiltered = () => {
    setSelectedIds((previous) =>
      allFilteredSelected
        ? previous.filter((id) => !filteredIds.includes(id))
        : [...new Set([...previous, ...filteredIds])],
    );
  };

  const deleteAlerts = async (ids) => {
    if (!ids.length) {return;}
    if (!window.confirm(
      `Delete ${ids.length} alert${ids.length === 1 ? '' : 's'}? This cannot be undone.`,
    )) {return;}
    try {
      const { data } = await axios.post(`${API}/mikrotik/alerts/bulk-delete`, { ids });
      info('Deleted', `${data.deleted ?? ids.length} alert(s) removed`);
      setSelectedIds((previous) => previous.filter((id) => !ids.includes(id)));
      fetchAlerts(true);
    } catch (requestError) {
      toastError('Error', requestError.response?.data?.error || 'Could not delete alerts');
    }
  };

  const stats = useMemo(() => ({
    open: alerts.filter((alert) => alert.status === 'open').length,
    critical: alerts.filter((alert) => alert.severity === 'critical' && alert.status !== 'resolved').length,
    acknowledged: alerts.filter((alert) => alert.status === 'acknowledged').length,
    resolved: alerts.filter((alert) => alert.status === 'resolved').length,
  }), [alerts]);

  const selectClass = 'bg-zinc-900/70 border border-zinc-700/60 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/50';

  return (
    <div className="relative p-4 sm:p-6 space-y-5 animate-fade-in">
      <div className="absolute inset-0 bg-mesh pointer-events-none" />
      <div className="absolute inset-0 bg-noise pointer-events-none" />

      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-orange-600 flex items-center justify-center shadow-lg shadow-rose-500/20">
              <Bell className="w-5 h-5 text-white" />
            </div>
            Alert Center
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Every router, billing, operations and security event in one place
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Loading…'}
          </span>
          <button onClick={() => fetchAlerts()} className="btn-ghost flex items-center gap-2 text-xs">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="relative grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Open', value: stats.open, color: 'text-red-400', icon: AlertTriangle },
          { label: 'Critical active', value: stats.critical, color: 'text-rose-400', icon: ShieldAlert },
          { label: 'Acknowledged', value: stats.acknowledged, color: 'text-amber-400', icon: CheckCircle },
          { label: 'Resolved', value: stats.resolved, color: 'text-emerald-400', icon: XCircle },
        ].map((card) => (
          <div key={card.label} className="glass rounded-xl p-4">
            <div className="flex items-center gap-2 text-zinc-400 text-xs">
              <card.icon className={`w-4 h-4 ${card.color}`} /> {card.label}
            </div>
            <div className={`text-2xl font-bold mt-2 ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className="relative glass rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <FilterIcon /> Filters
        </div>
        <select className={selectClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
        </select>
        <select className={selectClass} value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <select className={selectClass} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          {types.map((type) => <option key={type} value={type}>{type === 'all' ? 'All types' : typeLabel(type)}</option>)}
        </select>
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-zinc-500" />
          <input
            className="flex-1 bg-zinc-900/70 border border-zinc-700/60 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/50"
            placeholder="Search alerts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-xs text-zinc-500">{filtered.length} of {alerts.length}</span>
        <button
          onClick={() => deleteAlerts(filteredIds)}
          disabled={filteredIds.length === 0}
          className="btn-ghost text-xs flex items-center gap-2 disabled:opacity-40"
          title="Delete every alert matching the current filters"
        >
          <Trash2 className="w-4 h-4" /> Clear all shown
        </button>
      </div>

      {selectedIds.length > 0 && (
        <div className="relative glass rounded-xl p-3 flex flex-wrap items-center gap-3 border border-emerald-500/30">
          <span className="text-sm text-zinc-200">{selectedIds.length} selected</span>
          <button onClick={toggleAllFiltered} className="btn-ghost text-xs">
            {allFilteredSelected ? 'Deselect all shown' : `Select all shown (${filteredIds.length})`}
          </button>
          <button onClick={() => setSelectedIds([])} className="btn-ghost text-xs">
            Clear selection
          </button>
          <button
            onClick={() => deleteAlerts(selectedIds)}
            className="btn-ghost text-xs flex items-center gap-2 text-rose-400 hover:text-rose-300"
          >
            <Trash2 className="w-4 h-4" /> Delete selected
          </button>
        </div>
      )}

      <div className="relative glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="modern-table w-full">
            <thead>
              <tr>
                <th className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all shown alerts"
                    checked={allFilteredSelected}
                    onChange={toggleAllFiltered}
                    disabled={filteredIds.length === 0}
                    className="h-4 w-4 accent-emerald-500 cursor-pointer"
                  />
                </th>
                <th className="w-10" />
                <th>Event</th>
                <th>Type</th>
                <th>Source</th>
                <th>Severity</th>
                <th>Status</th>
                <th>When</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((alert) => {
                const Icon = typeIcon(alert.alert_type);
                const isOpen = expanded === alert.id;
                return (
                  <React.Fragment key={alert.id}>
                    <tr
                      className="cursor-pointer hover:bg-zinc-800/30 transition-colors"
                      onClick={() => setExpanded(isOpen ? null : alert.id)}
                    >
                      <td onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select alert: ${alert.title}`}
                          checked={selectedIds.includes(alert.id)}
                          onChange={() => toggleAlert(alert.id)}
                          className="h-4 w-4 accent-emerald-500 cursor-pointer"
                        />
                      </td>
                      <td className="text-zinc-500">
                        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </td>
                      <td>
                        <div className="flex items-start gap-2">
                          <Icon className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-sm text-white font-medium">{alert.title}</div>
                            <div className="text-xs text-zinc-500 max-w-xl line-clamp-2">{alert.message}</div>
                          </div>
                        </div>
                      </td>
                      <td className="text-xs text-zinc-400">{typeLabel(alert.alert_type)}</td>
                      <td className="text-xs text-zinc-400">{alert.connection_name || alert.ip_address || 'System'}</td>
                      <td>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] border ${severityStyles[alert.severity] || severityStyles.info}`}>
                          {alert.severity || 'info'}
                        </span>
                      </td>
                      <td>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] ${statusStyles[alert.status] || statusStyles.open}`}>
                          {alert.status}
                        </span>
                      </td>
                      <td className="text-xs text-zinc-500 whitespace-nowrap">{formatWhen(alert.created_at)}</td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                          {alert.status === 'open' && (
                            <button onClick={() => updateAlert(alert.id, 'acknowledge')} className="btn-ghost text-xs px-2 py-1">Acknowledge</button>
                          )}
                          {alert.status !== 'resolved' && (
                            <button onClick={() => updateAlert(alert.id, 'resolve')} className="btn-ghost text-xs px-2 py-1">Resolve</button>
                          )}
                          <button
                            onClick={() => deleteAlerts([alert.id])}
                            className="btn-ghost text-xs px-2 py-1 text-rose-400 hover:text-rose-300"
                            title="Delete this alert"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={9} className="bg-zinc-950/40 px-6 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                            <div>
                              <div className="text-zinc-500 uppercase tracking-wide mb-1">Alert ID</div>
                              <div className="font-mono text-zinc-300">{alert.id}</div>
                            </div>
                            <div>
                              <div className="text-zinc-500 uppercase tracking-wide mb-1">Timeline</div>
                              <div className="text-zinc-300">Created {formatWhen(alert.created_at)}</div>
                              <div className="text-zinc-400">Acknowledged {formatWhen(alert.acknowledged_at)}</div>
                              <div className="text-zinc-400">Resolved {formatWhen(alert.resolved_at)}</div>
                            </div>
                            <div>
                              <div className="text-zinc-500 uppercase tracking-wide mb-1">Details</div>
                              <div className="text-zinc-400">Source: {alert.connection_name || alert.ip_address || 'Billing system'}</div>
                              <div className="text-zinc-400">IP: {alert.ip_address || '—'}</div>
                              <pre className="mt-2 text-zinc-500 whitespace-pre-wrap break-all">{alert.metadata ? JSON.stringify(alert.metadata, null, 2) : ''}</pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-12 text-center text-zinc-500 text-sm">
            No alerts match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}

function FilterIcon() {
  return (
    <svg className="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}
