import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Activity, AlertTriangle, CheckCircle, XCircle, Bell, Settings,
  Clock,   RefreshCw,
  Network,
  Plus, Trash2, Eye, EyeOff, TrendingUp,
  Cpu, HardDrive, Wifi, Zap, Mail, MessageSquare, Phone
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

const formatMetric = (value, suffix) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? `${numeric.toFixed(1)}${suffix}` : '-';
};

export function Monitoring() {
  const [connections, setConnections] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [healthChecks, setHealthChecks] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState('');
  const [loading, setLoading] = useState(true);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [rules, setRules] = useState([]);
  const [snmpData, setSnmpData] = useState(null);
  const [channels, setChannels] = useState([]);

  useEffect(() => {
    fetchConnections();
    fetchAlerts();
  }, []);

  useEffect(() => {
    if (selectedConnection) {
      fetchHealthChecks(selectedConnection);
      fetchRules(selectedConnection);
    }
  }, [selectedConnection]);

  const fetchConnections = async () => {
    try {
      const { data } = await axios.get(`${API}/mikrotik`).catch(() => ({ data: [] }));
      setConnections(data);
    } catch (e) {
      console.error('Failed to fetch connections:', e);
    }
  };

  const fetchAlerts = async () => {
    try {
      const { data } = await axios.get(`${API}/monitoring/alerts?limit=50`).catch(() => ({ data: [] }));
      setAlerts(data);
    } catch (e) {
      console.error('Failed to fetch alerts:', e);
    }
  };

  const fetchChannels = async () => {
    try {
      // Channels are per admin user; fetch for the current user id from localStorage
      let userId = '';
      try { userId = JSON.parse(localStorage.getItem('auth_user') || '{}').id || ''; } catch {}
      const { data } = await axios.get(`${API}/monitoring/notification-channels/${userId}`).catch(() => ({ data: [] }));
      setChannels(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch notification channels:', e);
    }
  };

  const openChannels = () => {
    fetchChannels();
    setShowChannelModal(true);
  };

  const [channelForm, setChannelForm] = useState({ channel_type: 'sms', phone: '', chat_id: '', is_enabled: true, severities: ['critical', 'warning', 'info'] });
  const [ruleForm, setRuleForm] = useState({ rule_type: 'high_cpu', threshold_value: '85', comparison_operator: '>', alert_severity: 'warning' });

  const addRule = async () => {
    if (!selectedConnection) return;
    try {
      await axios.post(`${API}/monitoring/rules`, {
        ...ruleForm,
        connection_id: selectedConnection,
        threshold_value: Number(ruleForm.threshold_value),
        is_enabled: true,
      });
      fetchRules(selectedConnection);
    } catch (e) {
      console.error('Failed to add rule:', e);
    }
  };

  const deleteRule = async (id) => {
    try {
      await axios.delete(`${API}/monitoring/rules/${id}`);
      fetchRules(selectedConnection);
    } catch (e) {
      console.error('Failed to delete rule:', e);
    }
  };

  const addChannel = async () => {
    try {
      let userId = '';
      try { userId = JSON.parse(localStorage.getItem('auth_user') || '{}').id || ''; } catch {}
      const config = {};
      if (channelForm.phone) config.phone = channelForm.phone;
      if (channelForm.chat_id) config.chat_id = channelForm.chat_id;
      config.severities = channelForm.severities;
      await axios.post(`${API}/monitoring/notification-channels`, {
        user_id: userId,
        channel_type: channelForm.channel_type,
        is_enabled: channelForm.is_enabled,
        config,
      });
      setChannelForm({ channel_type: 'sms', phone: '', chat_id: '', is_enabled: true, severities: ['critical', 'warning', 'info'] });
      fetchChannels();
    } catch (e) {
      console.error('Failed to add channel:', e);
    }
  };

  const deleteChannel = async (id) => {
    try {
      await axios.delete(`${API}/monitoring/notification-channels/${id}`);
      fetchChannels();
    } catch (e) {
      console.error('Failed to delete channel:', e);
    }
  };

  const fetchHealthChecks = async (connectionId) => {
    try {
      const { data } = await axios.get(`${API}/monitoring/health-checks/${connectionId}?limit=20`).catch(() => ({ data: [] }));
      setHealthChecks(data);
    } catch (e) {
      console.error('Failed to fetch health checks:', e);
    }
  };

  const pollSnmp = async () => {
    if (!selectedConnection) return;
    try {
      const { data } = await axios.get(`${API}/monitoring/snmp/${selectedConnection}`);
      setSnmpData(data);
    } catch (e) {
      console.error('SNMP poll failed:', e);
    }
  };

  const fetchRules = async (connectionId) => {
    try {
      const { data } = await axios.get(`${API}/monitoring/rules/${connectionId}`).catch(() => ({ data: [] }));
      setRules(data);
    } catch (e) {
      console.error('Failed to fetch rules:', e);
    }
  };

  const acknowledgeAlert = async (alertId) => {
    try {
      await axios.post(`${API}/monitoring/alerts/${alertId}/acknowledge`, { user_id: 'current' });
      fetchAlerts();
    } catch (e) {
      console.error('Failed to acknowledge alert:', e);
    }
  };

  const resolveAlert = async (alertId) => {
    try {
      await axios.post(`${API}/monitoring/alerts/${alertId}/resolve`);
      fetchAlerts();
    } catch (e) {
      console.error('Failed to resolve alert:', e);
    }
  };

  const deleteAlert = async (alertId) => {
    try {
      await axios.delete(`${API}/monitoring/alerts/${alertId}`);
      fetchAlerts();
    } catch (e) {
      console.error('Failed to delete alert:', e);
    }
  };

  const startHealthChecks = async (connectionId) => {
    try {
      await axios.post(`${API}/monitoring/health-checks/${connectionId}/start`);
      alert('Health checks started');
    } catch (e) {
      alert('Failed to start health checks');
    }
  };

  const stopHealthChecks = async (connectionId) => {
    try {
      await axios.post(`${API}/monitoring/health-checks/${connectionId}/stop`);
      alert('Health checks stopped');
    } catch (e) {
      alert('Failed to stop health checks');
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'warning': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'info': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return 'bg-red-500/20 text-red-400';
      case 'acknowledged': return 'bg-amber-500/20 text-amber-400';
      case 'resolved': return 'bg-emerald-500/20 text-emerald-400';
      default: return 'bg-zinc-500/20 text-zinc-400';
    }
  };

  const getCheckTypeIcon = (type) => {
    switch (type) {
      case 'connectivity': return Wifi;
      case 'resources': return Cpu;
      case 'bandwidth': return TrendingUp;
      default: return Activity;
    }
  };

  const getChannelIcon = (type) => {
    switch (type) {
      case 'email': return Mail;
      case 'sms': return MessageSquare;
      case 'whatsapp': return Phone;
      default: return Bell;
    }
  };

  const getAlertTypeLabel = (type) => {
    switch (type) {
      case 'customer_outage':
        return 'Customer outage';
      case 'router_offline':
        return 'Router offline';
      case 'router_online':
        return 'Router online';
      default:
        return type || 'General';
    }
  };

  const parseAlertMetadata = (metadata) => {
    if (!metadata) {
      return null;
    }

    if (typeof metadata === 'object') {
      return metadata;
    }

    try {
      return JSON.parse(metadata);
    } catch (error) {
      return null;
    }
  };

  const getOutageSummary = (alert) => {
    if (alert.alert_type !== 'customer_outage') {
      return null;
    }

    const metadata = parseAlertMetadata(alert.metadata);
    if (!metadata) {
      return null;
    }

    const total = metadata.totalCustomers ?? metadata.total_customers;
    const offline = metadata.offlineCount ?? metadata.offline_count;
    const online = metadata.onlineCount ?? metadata.online_count;

    if (total == null || offline == null) {
      return null;
    }

    return `${offline}/${total} customers offline${online != null ? `, ${online} online` : ''}`;
  };

  return (
    <div className="relative min-h-full p-8 animate-fade-in">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-noise" />

      {/* Header */}
      <div className="relative flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Activity className="w-4 h-4 text-white" />
            </div>
            Network Monitoring
          </h1>
          <p className="text-zinc-400 mt-1">Self-diagnosis and alerting for MikroTik routers</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openChannels} className="btn-ghost flex items-center gap-2" title="Configure alert notifications">
            <Bell className="w-5 h-5" /> Alerts
          </button>
          <button onClick={fetchAlerts} className="btn-ghost p-2" title="Refresh">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Connection Selector */}
      <div className="relative glass rounded-2xl p-6 mb-6">
        <h3 className="text-base font-semibold text-white mb-4">Select Router</h3>
        <div className="flex gap-4">
          <select
            value={selectedConnection}
            onChange={e => setSelectedConnection(e.target.value)}
            className="modern-input flex-1"
          >
            <option value="">Select a connection to monitor</option>
            {connections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.ip_address})</option>)}
          </select>
          {selectedConnection && (
            <div className="flex gap-2">
              <button onClick={() => startHealthChecks(selectedConnection)} className="btn-primary flex items-center gap-2">
                <Eye className="w-4 h-4" /> Start Monitoring
              </button>
              <button onClick={() => stopHealthChecks(selectedConnection)} className="btn-ghost flex items-center gap-2">
                <EyeOff className="w-4 h-4" /> Stop
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Alert Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Open Alerts</p>
              <p className="text-2xl font-bold text-red-400 mt-1">{alerts.filter(a => a.status === 'open').length}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-400/50" />
          </div>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Acknowledged</p>
              <p className="text-2xl font-bold text-amber-400 mt-1">{alerts.filter(a => a.status === 'acknowledged').length}</p>
            </div>
            <Bell className="w-8 h-8 text-amber-400/50" />
          </div>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Resolved</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">{alerts.filter(a => a.status === 'resolved').length}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-emerald-400/50" />
          </div>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Critical</p>
              <p className="text-2xl font-bold text-rose-400 mt-1">{alerts.filter(a => a.severity === 'critical').length}</p>
            </div>
            <Zap className="w-8 h-8 text-rose-400/50" />
          </div>
        </div>
      </div>

      {/* Alerts Table */}
      <div className="relative glass rounded-2xl overflow-hidden mb-6">
        <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Recent Alerts ({alerts.length})
          </h3>
        </div>
        <table className="modern-table">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Type</th>
              <th>Title</th>
              <th>Status</th>
              <th>Time</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <tr key={alert.id}>
                <td>
                  <div className="flex flex-col gap-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getSeverityColor(alert.severity)}`}>
                      {alert.severity}
                    </span>
                    {alert.alert_type === 'customer_outage' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-500/20 text-violet-300 border border-violet-500/30">
                        Outage
                      </span>
                    )}
                  </div>
                </td>
                <td className="text-sm text-zinc-400">
                  <div className="flex flex-col">
                    <span>{getAlertTypeLabel(alert.alert_type)}</span>
                    {alert.alert_type === 'customer_outage' && (
                      <span className="text-xs text-violet-300/80">{getOutageSummary(alert) || 'Customer sessions dropped below threshold'}</span>
                    )}
                  </div>
                </td>
                <td>
                  <div>
                    <p className="text-sm font-medium text-white">{alert.title}</p>
                    <p className="text-xs text-zinc-500">{alert.message}</p>
                  </div>
                </td>
                <td>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(alert.status)}`}>
                    {alert.status}
                  </span>
                </td>
                <td className="text-sm text-zinc-400">{new Date(alert.created_at).toLocaleString()}</td>
                <td>
                  <div className="flex items-center justify-end gap-1">
                    {alert.status === 'open' && (
                      <button onClick={() => acknowledgeAlert(alert.id)} className="btn-ghost p-1.5 text-amber-400" title="Acknowledge">
                        <Bell className="w-4 h-4" />
                      </button>
                    )}
                    {alert.status !== 'resolved' && (
                      <button onClick={() => resolveAlert(alert.id)} className="btn-ghost p-1.5 text-emerald-400" title="Resolve">
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => deleteAlert(alert.id)} className="btn-ghost p-1.5 text-zinc-500 hover:text-rose-400" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {alerts.length === 0 && (
          <div className="p-16 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-1">No alerts</h3>
            <p className="text-zinc-500">All systems are operating normally</p>
          </div>
        )}
      </div>

      {/* Health Checks History */}
      {selectedConnection && (
        <div className="relative glass rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Health Check History ({healthChecks.length})
            </h3>
            <button onClick={() => fetchHealthChecks(selectedConnection)} className="btn-ghost p-2">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <table className="modern-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>CPU</th>
                <th>Memory</th>
                <th>Latency</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {healthChecks.map((check) => {
                const Icon = getCheckTypeIcon(check.check_type);
                return (
                  <tr key={check.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-zinc-400" />
                        <span className="text-sm">{check.check_type}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${check.status === 'healthy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                        {check.status === 'healthy' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {check.status}
                      </span>
                    </td>
                    <td className="text-sm text-zinc-400">{formatMetric(check.cpu_usage, '%')}</td>
                    <td className="text-sm text-zinc-400">{formatMetric(check.memory_usage, '%')}</td>
                    <td className="text-sm text-zinc-400">{formatMetric(check.latency_ms, 'ms')}</td>
                    <td className="text-sm text-zinc-400">{new Date(check.checked_at).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {healthChecks.length === 0 && (
            <div className="p-16 text-center">
              <Activity className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-1">No health checks</h3>
              <p className="text-zinc-500">Start monitoring to see health check history</p>
            </div>
          )}
        </div>
      )}

      {/* SNMP */}
      {selectedConnection && (
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Network className="w-4 h-4" /> SNMP
            </h3>
            <button onClick={pollSnmp} className="btn-ghost flex items-center gap-2 text-xs">
              <RefreshCw className="w-3.5 h-3.5" /> Poll
            </button>
          </div>
          {snmpData ? (
            <div className="space-y-1">
              {snmpData.values.filter(v => !v.error).map(v => (
                <div key={v.oid} className="flex justify-between gap-4 text-xs">
                  <span className="text-zinc-500 font-mono truncate">{v.oid}</span>
                  <span className="text-zinc-300 truncate">{v.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-zinc-500 text-sm">Poll the router for SNMP system and interface data.</p>
          )}
        </div>
      )}

      {/* Thresholds */}
      {selectedConnection && (
        <div className="glass rounded-2xl p-5">
          <h3 className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Alert Thresholds ({rules.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <select
              className="modern-input"
              value={ruleForm.rule_type}
              onChange={e => setRuleForm({ ...ruleForm, rule_type: e.target.value })}
            >
              <option value="high_cpu">High CPU</option>
              <option value="high_memory">High Memory</option>
              <option value="bandwidth_exceeded">Bandwidth Exceeded</option>
            </select>
            <select
              className="modern-input"
              value={ruleForm.comparison_operator}
              onChange={e => setRuleForm({ ...ruleForm, comparison_operator: e.target.value })}
            >
              <option value=">">&gt;</option>
              <option value=">=">&gt;=</option>
              <option value="<">&lt;</option>
            </select>
            <input
              className="modern-input"
              type="number"
              placeholder="Threshold %"
              value={ruleForm.threshold_value}
              onChange={e => setRuleForm({ ...ruleForm, threshold_value: e.target.value })}
            />
            <select
              className="modern-input"
              value={ruleForm.alert_severity}
              onChange={e => setRuleForm({ ...ruleForm, alert_severity: e.target.value })}
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <button onClick={addRule} className="btn-primary flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> Add Threshold
          </button>
          <div className="mt-4 space-y-2">
            {rules.map(rule => (
              <div key={rule.id} className="flex items-center gap-3 rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
                <span className="flex-1 text-sm text-white capitalize">{(rule.rule_type || '').replace(/_/g, ' ')}</span>
                <span className="text-sm text-zinc-400">{rule.comparison_operator} {rule.threshold_value}%</span>
                <span className="text-xs text-zinc-500 capitalize">{rule.alert_severity}</span>
                <button onClick={() => deleteRule(rule.id)} className="text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            {rules.length === 0 && <p className="text-zinc-500 text-sm">No thresholds configured for this router.</p>}
          </div>
        </div>
      )}

      {/* Notification Channels Modal */}
      {showChannelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowChannelModal(false)}>
          <div className="glass rounded-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2"><Bell className="w-5 h-5" /> Alert Notifications</h2>
                <p className="text-zinc-400 text-sm mt-1">Get notified when a router goes offline or comes back online.</p>
              </div>
              <button onClick={() => setShowChannelModal(false)} className="text-zinc-400 hover:text-white"><XCircle className="w-5 h-5" /></button>
            </div>

            <div className="space-y-3 mb-6">
              {channels.length === 0 && (
                <div className="text-center py-6 text-zinc-500 text-sm">No notification channels configured yet.</div>
              )}
              {channels.map(ch => {
                const Icon = getChannelIcon(ch.channel_type);
                return (
                  <div key={ch.id} className="flex items-center gap-3 rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
                    <Icon className="w-4 h-4 text-violet-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white capitalize">{ch.channel_type}</p>
                      <p className="text-xs text-zinc-500 truncate">{ch.config?.phone || ch.config?.chat_id || ch.email || '—'}</p>
                    </div>
                    <span className={`text-xs ${ch.is_enabled ? 'text-emerald-400' : 'text-zinc-500'}`}>{ch.is_enabled ? 'Enabled' : 'Disabled'}</span>
                    <button onClick={() => deleteChannel(ch.id)} className="text-zinc-500 hover:text-red-400" title="Remove"><Trash2 className="w-4 h-4" /></button>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-zinc-700/50 pt-5">
              <h3 className="text-sm font-semibold text-white mb-3">Add a channel</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <select
                  value={channelForm.channel_type}
                  onChange={e => setChannelForm({ ...channelForm, channel_type: e.target.value })}
                  className="modern-input"
                >
                  <option value="sms">SMS</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="telegram">Telegram</option>
                  <option value="email">Email</option>
                </select>
                <input
                  className="modern-input"
                  placeholder={channelForm.channel_type === 'telegram' ? 'Chat ID' : channelForm.channel_type === 'email' ? 'Email' : 'Phone (+254...)'}
                  value={channelForm.channel_type === 'telegram' ? (channelForm.chat_id || '') : (channelForm.phone || '')}
                  onChange={e => setChannelForm(channelForm.channel_type === 'telegram'
                    ? { ...channelForm, chat_id: e.target.value }
                    : { ...channelForm, phone: e.target.value })}
                />
              </div>
              <div className="mb-3">
                <p className="text-xs text-zinc-400 mb-2">Alert severities for this channel</p>
                <div className="flex gap-4">
                  {['critical', 'warning', 'info'].map(level => (
                    <label key={level} className="flex items-center gap-2 text-xs text-zinc-300 capitalize">
                      <input
                        type="checkbox"
                        checked={channelForm.severities.includes(level)}
                        onChange={e => setChannelForm({
                          ...channelForm,
                          severities: e.target.checked
                            ? [...channelForm.severities, level]
                            : channelForm.severities.filter(s => s !== level),
                        })}
                      />
                      {level}
                    </label>
                  ))}
                </div>
              </div>
              <button onClick={addChannel} className="btn-primary w-full flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> Add Channel
              </button>
              <p className="text-xs text-zinc-500 mt-3">
                SMS/WhatsApp need a provider configured in Integrations. Telegram needs the bot configured.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
