import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  FileText,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  HardDrive,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Button } from "../components/ui/button";

const API = import.meta.env.VITE_API_URL || "/api";

const ACTION_ICONS = {
  script_fetch: HardDrive,
  callback: CheckCircle2,
  billing_activation: AlertTriangle,
  script_generated: FileText,
};

const ACTION_COLORS = {
  script_fetch: { dot: "bg-blue-500", label: "Script Fetched" },
  callback: { dot: "bg-green-500", label: "Provision Callback" },
  billing_activation: { dot: "bg-purple-500", label: "Billing Link" },
  script_generated: { dot: "bg-amber-500", label: "Script Generated" },
};

export function ProvisionLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/devices/logs`);
      setLogs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="w-6 h-6 text-purple-400" />
            Provisioning Audit Log
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Timeline of all enrollment, provisioning, and billing activation events
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchLogs}
          disabled={loading}
        >
          <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading && logs.length === 0 && (
        <div className="text-center py-16 text-zinc-500">
          <RefreshCw className="w-8 h-8 mx-auto animate-spin mb-3" />
          Loading logs…
        </div>
      )}

      {!loading && logs.length === 0 && (
        <Card className="border-zinc-800">
          <CardContent className="py-16 text-center">
            <FileText className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-400">No provisioning events yet.</p>
            <p className="text-zinc-500 text-sm mt-1">
              Events will appear here when routers fetch scripts, call back, or link to billing.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {logs.map((log, i) => {
          const actionConfig = ACTION_COLORS[log.action] || {
            dot: "bg-zinc-500",
            label: log.action,
          };
          const Icon = ACTION_ICONS[log.action] || Clock;
          const isError = log.status === "failed" || log.status === "error";

          return (
            <div
              key={log.id || i}
              className="flex items-start gap-3 p-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 hover:bg-zinc-900/80 transition-colors"
            >
              <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${actionConfig.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded">
                    {actionConfig.label}
                  </span>
                  {isError && (
                    <span className="text-xs text-rose-400 flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> Failed
                    </span>
                  )}
                  {log.status === "success" && (
                    <span className="text-xs text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Success
                    </span>
                  )}
                  {log.router_name && (
                    <span className="text-xs text-zinc-500">
                      Router: {log.router_name}
                    </span>
                  )}
                </div>
                {log.details && (
                  <p className="text-xs text-zinc-400 mt-1">{log.details}</p>
                )}
                {log.created_at && (
                  <p className="text-[11px] text-zinc-600 mt-1">
                    {new Date(log.created_at).toLocaleString()}
                  </p>
                )}
              </div>
              <Icon className="w-4 h-4 text-zinc-600 flex-shrink-0 mt-1" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
