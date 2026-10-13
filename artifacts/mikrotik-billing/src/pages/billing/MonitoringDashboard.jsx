import React, { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import {
  Activity,
  Network,
  Download,
  Upload,
  Cpu,
  MemoryStick,
  Users,
  RefreshCw,
  Server,
  Wifi,
  AlertTriangle,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";

const API = import.meta.env.VITE_API_URL || "/api";

const getRealtimeMonitoringOrigin = () => {
  const apiUrl = new URL(API, window.location.origin);
  const isLocalViteApiProxy = API === "/api" && window.location.port === "5173";
  const protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
  const host = isLocalViteApiProxy ? "localhost:5000" : apiUrl.host;
  return `${protocol}//${host}`;
};

export function MonitoringDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [realTimeData, setRealTimeData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [monitoringStatus, setMonitoringStatus] = useState("connecting");
  const [monitoringMessage, setMonitoringMessage] = useState("");
  const [bandwidthHistory, setBandwidthHistory] = useState([]);
  const intervalRef = useRef(null);
  const wsRef = useRef(null);
  const dashboard = data || {};
  const sessions = Array.isArray(dashboard.sessions) ? dashboard.sessions : [];
  const branchMetrics = Array.isArray(dashboard.branch_metrics)
    ? dashboard.branch_metrics
    : [];

  // Initialize WebSocket connection
  const connectWebSocket = useCallback(() => {
    try {
      const wsUrl = `${getRealtimeMonitoringOrigin()}/ws-bandwidth`;

      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setConnectionStatus("connected");
        console.log("WebSocket connected for real-time monitoring");

        // Subscribe to real-time channels
        wsRef.current.send(
          JSON.stringify({
            type: "subscribe",
            channels: ["bandwidth", "alerts"],
          }),
        );
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          switch (message.type) {
            case "initial_data":
              setMonitoringStatus(message.status || "unknown");
              setMonitoringMessage(message.message || "");
              setRealTimeData(message.data);
              break;
            case "bandwidth_update":
              setMonitoringStatus(message.status || "unknown");
              setMonitoringMessage(message.message || "");
              setRealTimeData((prev) => ({
                ...prev,
                currentBandwidth: message.data,
                systemStatus: message.data.systemStatus || prev?.systemStatus,
              }));

              // Update bandwidth history for charts
              setBandwidthHistory((prev) => {
                const newHistory = [
                  ...prev,
                  {
                    timestamp: message.timestamp,
                    download: message.data.downloadSpeed,
                    upload: message.data.uploadSpeed,
                    total: message.data.usedBandwidth,
                  },
                ];
                // Keep last 50 data points
                return newHistory.slice(-50);
              });
              break;
            case "alert":
              setAlerts((prev) => [message, ...prev].slice(0, 10)); // Keep last 10 alerts
              break;
            case "historical_data":
              // Process historical data if needed
              break;
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      wsRef.current.onclose = () => {
        setConnectionStatus("closed");
        console.log("WebSocket disconnected, falling back to REST polling");
        setAutoRefresh(true);
      };

      wsRef.current.onerror = () => {
        setConnectionStatus("closed");
        setMonitoringStatus("polling");
        setMonitoringMessage("Real-time WebSocket unavailable — using REST polling");
        console.warn("WebSocket connection failed, will use REST API fallback");
        setAutoRefresh(true);
      };
    } catch (error) {
      console.error("Failed to connect WebSocket:", error);
      setConnectionStatus("error");
    }
  }, []);

  useEffect(() => {
    fetchData();
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [connectWebSocket]);

  useEffect(() => {
    if (autoRefresh) {
      const intervalMs = connectionStatus === "connected" ? 60000 : 10000;
      intervalRef.current = setInterval(fetchData, intervalMs);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh, connectionStatus]);

  const fetchData = async () => {
    try {
      const { data } = await axios.get(`${API}/features/monitoring/dashboard`);
      setData({
        ...data,
        sessions: Array.isArray(data?.sessions) ? data.sessions : [],
        branch_metrics: Array.isArray(data?.branch_metrics)
          ? data.branch_metrics
          : [],
      });
      setLastUpdated(new Date());
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const formatBytes = (bytes) => {
    if (!bytes) {return "0 B";}
    const num = parseFloat(bytes);
    if (num >= 1099511627776) {return `${(num / 1099511627776).toFixed(1)} TB`;}
    if (num >= 1073741824) {return `${(num / 1073741824).toFixed(1)} GB`;}
    if (num >= 1048576) {return `${(num / 1048576).toFixed(1)} MB`;}
    if (num >= 1024) {return `${(num / 1024).toFixed(1)} KB`;}
    return `${num.toFixed(0)} B`;
  };

  const formatSpeed = (bps) => {
    if (!bps) {return "0 Mbps";}
    const mbps = bps / 1048576;
    if (mbps >= 1000) {return `${(mbps / 1000).toFixed(1)} Gbps`;}
    return `${mbps.toFixed(1)} Mbps`;
  };

  const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) {return `${days}d ${hours}h ${minutes}m`;}
    if (hours > 0) {return `${hours}h ${minutes}m`;}
    return `${minutes}m`;
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case "connected":
        return "text-green-400";
      case "connecting":
        return "text-yellow-400";
      case "closed":
        return "text-amber-400";
      default:
        return "text-gray-400";
    }
  };

  const getUsagePercentage = (used, total) => {
    if (!total || total === 0) {return 0;}
    return Math.min((used / total) * 100, 100);
  };

  if (loading)
    {return (
      <div className="p-8 text-white">
        Loading real MikroTik monitoring data...
      </div>
    );}
  if (!data)
    {return (
      <div className="p-8 text-white">
        No real MikroTik monitoring data available. Add a MikroTik API
        connection to begin monitoring.
      </div>
    );}

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white gradient-text flex items-center gap-2">
            <Activity className="w-6 h-6 text-green-400" />
            Real-time Network Monitoring
            <div
              className={`w-2 h-2 rounded-full ${connectionStatus === "connected" ? "bg-green-400 animate-pulse" : connectionStatus === "connecting" ? "bg-yellow-400" : "bg-amber-400"}`}
            />
          </h2>
          <p className="text-sm text-slate-400">
            Live RouterOS API metrics from configured MikroTik connections — no
            dummy data
            {lastUpdated && (
              <span className="ml-2 text-xs text-slate-500">
                (Updated: {lastUpdated.toLocaleTimeString()})
              </span>
            )}
            <span className={`ml-2 text-xs ${getConnectionStatusColor()}`}>
              ({connectionStatus} / {monitoringStatus})
            </span>
            {monitoringMessage && (
              <span className="ml-2 text-xs text-amber-400">
                {monitoringMessage}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
              autoRefresh
                ? "btn-gradient-success"
                : "bg-slate-700 text-slate-400"
            }`}
          >
            <RefreshCw
              className={`w-4 h-4 ${autoRefresh ? "animate-spin" : ""}`}
            />
            Auto
          </Button>
          <Button
            onClick={fetchData}
            className="bg-slate-700 hover:bg-slate-600 text-white flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <Card className="card-glow mb-6">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Recent Alerts ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="space-y-2">
              {alerts.slice(0, 3).map((alert, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border ${
                    alert.level === "warning"
                      ? "bg-amber-600/10 border-amber-600/30 text-amber-300"
                      : alert.level === "error"
                        ? "bg-red-600/10 border-red-600/30 text-red-300"
                        : "bg-blue-600/10 border-blue-600/30 text-blue-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm">{alert.message}</span>
                    <span className="text-xs opacity-70 ml-auto">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Real-time Bandwidth Metrics */}
      {realTimeData?.currentBandwidth && (
        <Card className="card-glow mb-6">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              Live Bandwidth
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="card-gradient p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-slate-400">Download</span>
                </div>
                <div className="text-2xl font-bold text-blue-400">
                  {formatSpeed(realTimeData.currentBandwidth.downloadSpeed)}
                </div>
              </Card>
              <Card className="card-gradient p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Upload className="w-4 h-4 text-purple-400" />
                  <span className="text-sm text-slate-400">Upload</span>
                </div>
                <div className="text-2xl font-bold text-purple-400">
                  {formatSpeed(realTimeData.currentBandwidth.uploadSpeed)}
                </div>
              </Card>
              <Card className="card-gradient p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-slate-400">Total Usage</span>
                </div>
                <div className="text-2xl font-bold text-green-400">
                  {getUsagePercentage(
                    realTimeData.currentBandwidth.usedBandwidth,
                    realTimeData.currentBandwidth.totalBandwidth,
                  ).toFixed(1)}
                  %
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {formatBytes(realTimeData.currentBandwidth.usedBandwidth)} /{" "}
                  {formatBytes(realTimeData.currentBandwidth.totalBandwidth)}
                </div>
              </Card>
              <Card className="card-gradient p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-amber-400" />
                  <span className="text-sm text-slate-400">Connections</span>
                </div>
                <div className="text-2xl font-bold text-amber-400">
                  {realTimeData.currentBandwidth.activeConnections}
                </div>
                <div className="text-xs text-slate-500 mt-1">active users</div>
              </Card>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bandwidth Usage Chart */}
      {bandwidthHistory.length > 0 && (
        <Card className="card-glow mb-6">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-400" />
              Bandwidth Trend (Last 50 Updates)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="bg-slate-900 rounded p-4">
              <div className="h-32 flex items-end justify-between gap-1">
                {bandwidthHistory.map((point, index) => {
                  const maxValue = Math.max(
                    ...bandwidthHistory.map((p) => p.download),
                  );
                  const height = (point.download / maxValue) * 100;
                  return (
                    <div
                      key={index}
                      className="flex-1 bg-blue-500 rounded-t"
                      style={{ height: `${height}%` }}
                      title={`${formatSpeed(point.download)} at ${new Date(point.timestamp).toLocaleTimeString()}`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-slate-500 mt-2">
                <span>Older</span>
                <span>Current</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="card-gradient p-5">
          <div className="flex items-center gap-2 mb-2">
            <Wifi className="w-5 h-5 text-green-400" />
            <span className="text-sm text-slate-400">Active PPPoE</span>
          </div>
          <div className="text-3xl font-bold text-white">
            {data?.total_sessions || 0}
          </div>
          <div className="text-xs text-green-400 mt-1">sessions online</div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="flex items-center gap-2 mb-2">
            <Download className="w-5 h-5 text-blue-400" />
            <span className="text-sm text-slate-400">Total Upload</span>
          </div>
          <div className="text-3xl font-bold text-white">
            {formatBytes((data?.total_bandwidth_in_gb || 0) * 1073741824)}
          </div>
          <div className="text-xs text-blue-400 mt-1">from customers</div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="flex items-center gap-2 mb-2">
            <Upload className="w-5 h-5 text-purple-400" />
            <span className="text-sm text-slate-400">Total Download</span>
          </div>
          <div className="text-3xl font-bold text-white">
            {formatBytes((data?.total_bandwidth_out_gb || 0) * 1073741824)}
          </div>
          <div className="text-xs text-purple-400 mt-1">to customers</div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="flex items-center gap-2 mb-2">
            <Server className="w-5 h-5 text-amber-400" />
            <span className="text-sm text-slate-400">Branches</span>
          </div>
          <div className="text-3xl font-bold text-white">
            {branchMetrics.length}
          </div>
          <div className="text-xs text-amber-400 mt-1">POP locations</div>
        </Card>
      </div>

      {/* Customer Usage Alerts */}
      {realTimeData?.currentBandwidth?.customerUsage && (
        <Card className="card-glow mb-6">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-400" />
              Customer Usage Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(Array.isArray(realTimeData.currentBandwidth.customerUsage)
                ? realTimeData.currentBandwidth.customerUsage
                : []
              )
                .filter((customer) => customer.percentage > 80)
                .map((customer, index) => (
                  <Card key={index} className="card-gradient p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-medium">
                        {customer.name}
                      </span>
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          customer.percentage > 95
                            ? "bg-red-600/20 text-red-400"
                            : "bg-amber-600/20 text-amber-400"
                        }`}
                      >
                        {customer.percentage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-sm text-slate-400 mb-2">
                      {formatBytes(customer.usage)} /{" "}
                      {formatBytes(customer.limit)}
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          customer.percentage > 95
                            ? "bg-red-500"
                            : "bg-amber-500"
                        }`}
                        style={{ width: `${customer.percentage}%` }}
                      />
                    </div>
                  </Card>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Branch Metrics */}
      <Card className="card-glow mb-8">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Network className="w-5 h-5" /> Branch Status
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {branchMetrics.map((bm, i) => (
              <Card key={i} className="card-gradient p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-white font-semibold">{bm.branch.name}</h4>
                  <span
                    className={`px-2 py-0.5 rounded text-xs ${
                      bm.online_routers === bm.total_routers
                        ? "bg-green-600/20 text-green-400"
                        : bm.online_routers > 0
                          ? "bg-amber-600/20 text-amber-400"
                          : "bg-red-600/20 text-red-400"
                    }`}
                  >
                    {bm.online_routers}/{bm.total_routers} online
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-green-400" />
                    <span className="text-slate-400">PPPoE:</span>
                    <span className="text-white">{bm.active_pppoe}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Download className="w-4 h-4 text-blue-400" />
                    <span className="text-slate-400">↑:</span>
                    <span className="text-white">{bm.bandwidth_in} Mbps</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Upload className="w-4 h-4 text-purple-400" />
                    <span className="text-slate-400">↓:</span>
                    <span className="text-white">{bm.bandwidth_out} Mbps</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-amber-400" />
                    <span className="text-slate-400">CPU:</span>
                    <span className="text-white">{bm.cpu}%</span>
                  </div>
                </div>
                {/* Progress bars */}
                <div className="mt-3 space-y-2">
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>CPU</span>
                      <span>{bm.cpu}%</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${bm.cpu > 80 ? "bg-red-500" : bm.cpu > 50 ? "bg-amber-500" : "bg-green-500"}`}
                        style={{ width: `${bm.cpu}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Memory</span>
                      <span>{bm.memory}%</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${bm.memory > 80 ? "bg-red-500" : bm.memory > 50 ? "bg-amber-500" : "bg-green-500"}`}
                        style={{ width: `${bm.memory}%` }}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* PPPoE Sessions */}
      <Card className="card-gradient overflow-hidden">
        <CardHeader className="border-b border-zinc-800">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-5 h-5" /> Active PPPoE Sessions (
            {sessions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sessions.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              No active sessions
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/50 text-slate-400">
                  <tr>
                    <th className="text-left p-3">Username</th>
                    <th className="text-left p-3">Customer</th>
                    <th className="text-left p-3">Router</th>
                    <th className="text-left p-3">IP Address</th>
                    <th className="text-left p-3">Upload</th>
                    <th className="text-left p-3">Download</th>
                    <th className="text-left p-3">Uptime</th>
                    <th className="text-left p-3">Connected</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr
                      key={session.id}
                      className="border-t border-zinc-800 hover:bg-zinc-800/50 transition-colors"
                    >
                      <td className="p-3 text-blue-400 font-mono text-xs">
                        {session.username}
                      </td>
                      <td className="p-3 text-white">
                        {session.customer_name}
                      </td>
                      <td className="p-3 text-slate-400 text-xs">
                        {session.router_name || "—"}
                      </td>
                      <td className="p-3 text-slate-300 font-mono text-xs">
                        {session.ip_address}
                      </td>
                      <td className="p-3 text-blue-300">
                        {(session.bytes_in / (1024 * 1024)).toFixed(0)} MB
                      </td>
                      <td className="p-3 text-purple-300">
                        {(session.bytes_out / (1024 * 1024)).toFixed(0)} MB
                      </td>
                      <td className="p-3 text-slate-300">
                        {formatUptime(session.uptime_seconds)}
                      </td>
                      <td className="p-3 text-slate-400 text-xs">
                        {new Date(session.connected_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
