import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, CheckCircle, XCircle, Clock, RefreshCw, Filter } from 'lucide-react';
import { useToast } from '../../hooks/useToast';

const API = import.meta.env.VITE_API_URL || '/api';

export function Alerts() {
  const { info } = useToast();
  const [alerts, setAlerts] = useState([]);
  const [filter, setFilter] = useState('open'); // open, acknowledged, resolved, all
  const [loading, setLoading] = useState(false);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = filter !== 'all' ? { status: filter } : {};
      const { data } = await axios.get(`${API}/mikrotik/alerts/all`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      });
      setAlerts(data);
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    }
    setLoading(false);
  };

  const acknowledgeAlert = async (alertId) => {
    try {
      const token = localStorage.getItem('token');
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      await axios.post(`${API}/mikrotik/alerts/${alertId}/acknowledge`, 
        { userId: user.id },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      info('Success', 'Alert acknowledged');
      fetchAlerts();
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    }
  };

  const resolveAlert = async (alertId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/mikrotik/alerts/${alertId}/resolve`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      info('Success', 'Alert resolved');
      fetchAlerts();
    } catch (error) {
      console.error('Failed to resolve alert:', error);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [filter]);

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'text-red-400 bg-red-500/20 border-red-500/50';
      case 'warning': return 'text-amber-400 bg-amber-500/20 border-amber-500/50';
      case 'info': return 'text-blue-400 bg-blue-500/20 border-blue-500/50';
      default: return 'text-slate-400 bg-slate-500/20 border-slate-500/50';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'open': return <AlertTriangle className="w-4 h-4" />;
      case 'acknowledged': return <CheckCircle className="w-4 h-4" />;
      case 'resolved': return <XCircle className="w-4 h-4" />;
      default: return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return 'text-red-400';
      case 'acknowledged': return 'text-amber-400';
      case 'resolved': return 'text-emerald-400';
      default: return 'text-slate-400';
    }
  };

  const formatTime = (date) => {
    if (!date) {return 'Never';}
    const now = new Date();
    const then = new Date(date);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) {return 'Just now';}
    if (diffMins < 60) {return `${diffMins}m ago`;}
    if (diffHours < 24) {return `${diffHours}h ago`;}
    return `${diffDays}d ago`;
  };

  const openCount = alerts.filter(a => a.status === 'open').length;
  const criticalCount = alerts.filter(a => a.severity === 'critical' && a.status === 'open').length;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Router Alerts</h2>
          <p className="text-slate-400">Monitor and manage router connectivity alerts</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2">
            <div className="text-xs text-slate-400">Open Alerts</div>
            <div className="text-xl font-bold text-red-400">{openCount}</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2">
            <div className="text-xs text-slate-400">Critical</div>
            <div className="text-xl font-bold text-red-500">{criticalCount}</div>
          </div>
          <button
            onClick={fetchAlerts}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-400">Filter:</span>
          <div className="flex gap-2">
            {['open', 'acknowledged', 'resolved', 'all'].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-3 py-1 rounded text-sm capitalize ${
                  filter === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg">
        {alerts.length === 0 ? (
          <div className="text-center py-12">
            <AlertTriangle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No alerts found</p>
            <p className="text-sm text-slate-500 mt-1">
              {filter === 'open' ? 'No open alerts - all systems operational!' : 'No alerts with this status'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700">
            {alerts.map((alert) => (
              <div key={alert.id} className="p-4 hover:bg-slate-700/50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${getSeverityColor(alert.severity)}`}>
                        {alert.severity.toUpperCase()}
                      </span>
                      <span className={`flex items-center gap-1 text-xs ${getStatusColor(alert.status)}`}>
                        {getStatusIcon(alert.status)}
                        {alert.status}
                      </span>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(alert.created_at)}
                      </span>
                    </div>
                    <h4 className="font-semibold text-white mb-1">{alert.title}</h4>
                    <p className="text-sm text-slate-400 mb-2">{alert.message}</p>
                    <div className="text-xs text-slate-500">
                      Router: {alert.connection_name} ({alert.ip_address})
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {alert.status === 'open' && (
                      <button
                        onClick={() => acknowledgeAlert(alert.id)}
                        className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 px-3 py-1.5 rounded text-sm flex items-center gap-1"
                      >
                        <CheckCircle className="w-3 h-3" />
                        Acknowledge
                      </button>
                    )}
                    {(alert.status === 'open' || alert.status === 'acknowledged') && (
                      <button
                        onClick={() => resolveAlert(alert.id)}
                        className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 px-3 py-1.5 rounded text-sm flex items-center gap-1"
                      >
                        <XCircle className="w-3 h-3" />
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
