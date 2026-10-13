import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  Clock,
  Shield,
  AlertTriangle,
  Settings,
  Play,
  CheckCircle,
  Save,
  Zap,
  Bell,
  Gauge,
  Ban,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { useToast } from "../../hooks/useToast";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

const API = import.meta.env.VITE_API_URL || "/api";

const DEFAULTS = {
  warn_days: 7,
  throttle_days: 14,
  suspend_days: 30,
  throttle_speed_up: "1M",
  throttle_speed_down: "1M",
};

export function AutoSuspendPage() {
  const toast = useToast();
  const [config, setConfig] = useState(DEFAULTS);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const { data } = await axios.get(`${API}/features/auto-suspend/config`);
      setConfig(data);
    } catch (error) {
      console.error("Failed to fetch auto-suspend config:", error);
      toast.error(
        "Failed to load config",
        error.response?.data?.error || error.message,
      );
    }
  };

  const handleSave = async () => {
    try {
      await axios.put(`${API}/features/auto-suspend/config`, config);
      toast.success("Config saved", "Auto-suspend configuration updated");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      console.error("Failed to save auto-suspend config:", error);
      toast.error(
        "Failed to save config",
        error.response?.data?.error || error.message,
      );
    }
  };

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    try {
      const { data } = await axios.post(`${API}/features/auto-suspend/run`);
      setResult(data);
    } catch (e) {
      setResult({ success: false, error: e.message });
    }
    setRunning(false);
  };

  const timelinePercent = (days) =>
    Math.min(
      100,
      Math.max(0, ((days || 1) / Math.max(config.suspend_days || 1, 1)) * 100),
    );

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-blue-400" />
          </div>
          Auto-Suspend with Grace Period
        </h1>
        <p className="text-zinc-400 mt-2 ml-13">
          Automatically warn, throttle, and suspend customers with overdue
          invoices
        </p>
      </div>

      {/* Grace Period Configuration */}
      <Card className="border-zinc-800">
        <CardHeader className="pb-4">
          <CardTitle className="text-base text-white flex items-center gap-2">
            <Settings className="w-4 h-4 text-zinc-400" />
            Grace Period Stages
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Three stage cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Warn */}
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Bell className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-blue-400 font-semibold text-sm">Warning</p>
                  <p className="text-xs text-zinc-500">SMS notification</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={config.warn_days}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      warn_days: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-16 text-center"
                />
                <span className="text-sm text-zinc-400">days overdue</span>
              </div>
            </div>

            {/* Throttle */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Gauge className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-amber-400 font-semibold text-sm">
                    Throttle
                  </p>
                  <p className="text-xs text-zinc-500">Reduce speed</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={config.throttle_days}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      throttle_days: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-16 text-center"
                />
                <span className="text-sm text-zinc-400">days overdue</span>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <Input
                  value={config.throttle_speed_up}
                  onChange={(e) =>
                    setConfig({ ...config, throttle_speed_up: e.target.value })
                  }
                  className="w-16 text-center text-xs h-8"
                  placeholder="1M"
                />
                <span className="text-zinc-600 text-xs">/</span>
                <Input
                  value={config.throttle_speed_down}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      throttle_speed_down: e.target.value,
                    })
                  }
                  className="w-16 text-center text-xs h-8"
                  placeholder="1M"
                />
                <span className="text-xs text-zinc-500 ml-1">up/down</span>
              </div>
            </div>

            {/* Suspend */}
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <Ban className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <p className="text-red-400 font-semibold text-sm">Suspend</p>
                  <p className="text-xs text-zinc-500">Full cutoff</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={config.suspend_days}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      suspend_days: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-16 text-center"
                />
                <span className="text-sm text-zinc-400">days overdue</span>
              </div>
            </div>
          </div>

          {/* Timeline bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>Day 0</span>
              <span className="text-blue-400">
                Warn: Day {config.warn_days}
              </span>
              <span className="text-amber-400">
                Throttle: Day {config.throttle_days}
              </span>
              <span className="text-red-400">
                Suspend: Day {config.suspend_days}
              </span>
            </div>
            <div className="relative h-3 bg-zinc-800 rounded-full overflow-hidden">
              {/* Warn zone */}
              <div
                className="absolute inset-y-0 left-0 bg-blue-500/60 rounded-l-full transition-all duration-500"
                style={{ width: `${timelinePercent(config.warn_days)}%` }}
              />
              {/* Throttle zone */}
              <div
                className="absolute inset-y-0 bg-amber-500/60 transition-all duration-500"
                style={{
                  left: `${timelinePercent(config.warn_days)}%`,
                  width: `${timelinePercent(config.throttle_days - config.warn_days)}%`,
                }}
              />
              {/* Suspend zone */}
              <div
                className="absolute inset-y-0 right-0 bg-red-500/60 rounded-r-full transition-all duration-500"
                style={{
                  left: `${timelinePercent(config.throttle_days)}%`,
                  width: `${timelinePercent(config.suspend_days - config.throttle_days)}%`,
                }}
              />
            </div>
          </div>

          {/* Save button */}
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} className="gap-2">
              {saved ? (
                <>
                  <CheckCircle className="w-4 h-4" /> Saved
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Save Configuration
                </>
              )}
            </Button>
            <p className="text-xs text-zinc-500">
              Changes take effect on the next auto-suspend run
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Manual Run */}
      <Card className="border-zinc-800">
        <CardHeader className="pb-4">
          <CardTitle className="text-base text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            Run Auto-Suspend
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-zinc-400">
            Process all overdue invoices now. Customers will be warned,
            throttled, or suspended based on the grace period configuration
            above.
          </p>

          <Button
            onClick={handleRun}
            disabled={running}
            variant="secondary"
            className="gap-2 bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
          >
            {running ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Running...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" /> Run Auto-Suspend Now
              </>
            )}
          </Button>

          {/* Results */}
          {result && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
              {/* Summary */}
              <div
                className={`rounded-xl p-4 border ${
                  result.success
                    ? "bg-emerald-500/10 border-emerald-500/20"
                    : "bg-red-500/10 border-red-500/20"
                }`}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle
                    className={`w-5 h-5 ${result.success ? "text-emerald-400" : "text-red-400"}`}
                  />
                  <span
                    className={`font-semibold ${result.success ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {result.success
                      ? "Auto-suspend completed"
                      : "Auto-suspend failed"}
                  </span>
                </div>
                {result.error && (
                  <p className="text-sm text-red-300 mt-1">{result.error}</p>
                )}
              </div>

              {/* Warned */}
              {result.results?.warned?.length > 0 && (
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                  <h4 className="text-blue-400 font-semibold text-sm mb-3 flex items-center gap-2">
                    <Bell className="w-4 h-4" />
                    Warned ({result.results.warned.length})
                  </h4>
                  <div className="space-y-1.5">
                    {result.results.warned.map((w, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-zinc-300">{w.customer}</span>
                        <span className="text-zinc-500 text-xs">
                          {w.days_overdue} days overdue
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Throttled */}
              {result.results?.throttled?.length > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <h4 className="text-amber-400 font-semibold text-sm mb-3 flex items-center gap-2">
                    <Gauge className="w-4 h-4" />
                    Throttled ({result.results.throttled.length})
                  </h4>
                  <div className="space-y-1.5">
                    {result.results.throttled.map((t, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-zinc-300">{t.customer}</span>
                        <span className="text-zinc-500 text-xs">
                          {t.days_overdue}d → {t.throttle_speed}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suspended */}
              {result.results?.suspended?.length > 0 && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                  <h4 className="text-red-400 font-semibold text-sm mb-3 flex items-center gap-2">
                    <Ban className="w-4 h-4" />
                    Suspended ({result.results.suspended.length})
                  </h4>
                  <div className="space-y-1.5">
                    {result.results.suspended.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-zinc-300">{s.customer}</span>
                        <span className="text-zinc-500 text-xs">
                          {s.days_overdue} days overdue
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All clear */}
              {!result.results?.warned?.length &&
                !result.results?.throttled?.length &&
                !result.results?.suspended?.length && (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
                    <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                    <p className="text-emerald-400 font-semibold">
                      All accounts in good standing
                    </p>
                    <p className="text-sm text-zinc-500 mt-1">
                      No overdue accounts found
                    </p>
                  </div>
                )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
