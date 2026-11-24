import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Router,
  Copy,
  Check,
  Key,
  Terminal,
  Loader2,
  Shield,
  User,
  Lock,
  Wifi,
  ArrowRight,
  AlertCircle,
  Link2,
  Plug,
  Upload,
} from "lucide-react";
import { useToastStore } from "../stores/toastStore";
import { getToken } from "../lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Button } from "../components/ui/button";

const API = import.meta.env.VITE_API_URL || "/api";

export default function RouterLink() {
  const addToast = useToastStore((state) => state.addToast);
  const toast = {
    success: (msg) => addToast("success", msg, "", 3000),
    error:   (msg) => addToast("error",   msg, "", 4000),
  };
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem("router_link_api_key") || ""
  );
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tenantId, setTenantId] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [appUrl, setAppUrl] = useState(
    () => import.meta.env.VITE_PUBLIC_APP_URL || localStorage.getItem("router_link_app_url") || window.location.origin
  );
  const [mgmtUser, setMgmtUser] = useState(
    () => localStorage.getItem("router_link_mgmt_user") || "admin"
  );
  const [mgmtPass, setMgmtPass] = useState("");
  const [mgmtPort, setMgmtPort] = useState("8728");
  const [showCredentials, setShowCredentials] = useState(false);
  const [linkMode, setLinkMode] = useState("direct");
  const [routerName, setRouterName] = useState("");
  const [wgScript, setWgScript] = useState("");
  const [wgGenerating, setWgGenerating] = useState(false);
  const [wgError, setWgError] = useState("");
  const [tunnelStatus, setTunnelStatus] = useState(null);

  const validateAppUrl = (value) => {
    try {
      const parsed = new URL(value);
      const hostname = parsed.hostname.toLowerCase();
      if (!['http:', 'https:'].includes(parsed.protocol)) return 'Use an HTTP or HTTPS URL.';
      if (['localhost', '127.0.0.1', '::1'].includes(hostname)) return 'Use your computer LAN IP or public domain, not localhost.';
      if (linkMode === 'remote' && parsed.protocol !== 'https:') return 'Remote routers need a public HTTPS server URL.';
      if (parsed.protocol === 'http:' && !/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return 'Use HTTPS for remote routers.';
      return '';
    } catch { return 'Enter a valid server URL.'; }
  };
  const handleAppUrlChange = (e) => {
    const val = e.target.value;
    setAppUrl(val);
    localStorage.setItem("router_link_app_url", val);
  };

  const appUrlError = validateAppUrl(appUrl);

  const [connectionStatus, setConnectionStatus] = useState(null);
  const [polling, setPolling] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [checkCount, setCheckCount] = useState(0);
  const [manualKey, setManualKey] = useState("");
  const [debugInfo, setDebugInfo] = useState(null);
  const [watchAttempts, setWatchAttempts] = useState(0);
  const [watchRemaining, setWatchRemaining] = useState(0);
  const [diagnostics, setDiagnostics] = useState(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [applyingFix, setApplyingFix] = useState(null);
  const watchIntervalRef = React.useRef(null);

  const startWatching = async () => {
    if (!tenantSlug) {return;}
    stopWatching();

    try {
      const { data } = await axios.post(`${API}/router/v1/${tenantSlug}/watch/start`);
      const { sessionId } = data;
      setConnectionStatus({ connected: false, status: "watching", message: "Watch session started" });
      setWatchAttempts(0);
      setLastError(null);

      const poll = async () => {
        try {
          const { data } = await axios.get(`${API}/router/v1/${tenantSlug}/watch/${sessionId}`);
          setWatchAttempts((c) => c + 1);

          if (data.found) {
            stopWatching();
            setConnectionStatus({ connected: true, status: "online", router: data.router, message: data.message });
            fetchDiagnostics(data.router?.id);
            toast.success(data.message);
          } else if (data.expired) {
            stopWatching();
            setConnectionStatus({ connected: false, status: "timeout", message: data.message });
          } else {
            setWatchRemaining(Math.max(0, 600 - (data.elapsed || 0)));
          }
        } catch (e) {
          // silent retry
        }
      };

      poll();
      watchIntervalRef.current = setInterval(poll, 3000);
    } catch (e) {
      setLastError("Failed to start watch session: " + (e.response?.data?.error || e.message));
    }
  };

  const stopWatching = () => {
    if (watchIntervalRef.current) {
      clearInterval(watchIntervalRef.current);
      watchIntervalRef.current = null;
    }
  };

  useEffect(() => {
    fetchTenant();
    axios.get(`${API}/cgnat-tunnel/status`).then(({ data }) => setTunnelStatus(data)).catch(() => {});
    return () => stopWatching();
  }, []);

  useEffect(() => {
    if (apiKey) { setPolling(true); }
  }, [apiKey]);

  const fetchTenant = async () => {
    try {
      const token = getToken();
      const { data } = await axios.get(`${API}/tenants/current`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTenantId(data.id);
      setTenantSlug(data.slug || data.name?.toLowerCase().replace(/\s+/g, "-") || "");
      const storedKey = localStorage.getItem("router_link_api_key");
      const tenantKey = data.settings?.api_key;
      // Prefer tenant key, fall back to localStorage, fall back to empty
      const activeKey = tenantKey || storedKey || "";
      if (activeKey && activeKey !== apiKey) {
        setApiKey(activeKey);
        localStorage.setItem("router_link_api_key", activeKey);
      }
    } catch (e) {
      // If tenant fetch fails, try stored key
      const storedKey = localStorage.getItem("router_link_api_key");
      if (storedKey && !apiKey) {
        setApiKey(storedKey);
      }
      toast.error("Failed to load tenant");
    } finally {
      setLoading(false);
    }
  };

  const generateKey = async () => {
    setGenerating(true);
    try {
      const token = getToken();
      const { data } = await axios.put(
        `${API}/tenants/${tenantId}/api-key`,
        { api_key: "generate" },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setApiKey(data.api_key);
      localStorage.setItem("router_link_api_key", data.api_key);
      setPolling(true);
      toast.success("API key generated");
    } catch (e) {
      toast.error("Failed to generate key");
    } finally {
      setGenerating(false);
    }
  };

  const fetchDiagnostics = async (routerId = connectionStatus?.router?.id) => {
    if (!tenantSlug || !routerId) {return;}
    setDiagnosticsLoading(true);
    try {
      const { data } = await axios.get(
        `${API}/router/v1/${tenantSlug}/routers/${routerId}/diagnostics`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      setDiagnostics(data);
    } catch (e) {
      setDiagnostics({
        status: "error",
        steps: [
          {
            id: "diagnostics",
            label: "Diagnostics",
            status: "error",
            message: e.response?.data?.error || e.message,
          },
        ],
      });
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  const applyDiagnosticFix = async (stepId) => {
    const routerId = connectionStatus?.router?.id;
    if (!tenantSlug || !routerId || !stepId) {return;}

    setApplyingFix(stepId);
    try {
      const { data } = await axios.post(
        `${API}/router/v1/${tenantSlug}/routers/${routerId}/diagnostics/${stepId}/apply`,
        {},
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      if (data.diagnostics) {
        setDiagnostics(data.diagnostics);
      } else {
        fetchDiagnostics(routerId);
      }
      toast.success(data.message || "Fix applied");
    } catch (e) {
      toast.error(e.response?.data?.error || "Failed to apply fix");
    } finally {
      setApplyingFix(null);
    }
  };

  const buildCommand = () => {
    const mode = appUrl.startsWith("https") ? "https" : "http";
    const certFlag = appUrl.startsWith("https") ? " check-certificate=no" : "";
    const slugPath = tenantSlug ? `/v1/${tenantSlug}/install` : "/v1/scripts/install";
    let prefix = "";

    if (mgmtUser && mgmtPass) {
      prefix = `:global ztpMgmtUser "${mgmtUser}"; :global ztpMgmtPass "${mgmtPass}"; `;
    }

    return `${prefix}/tool fetch url="${appUrl}/api/router${slugPath}" http-header-field="Authorization: Bearer ${apiKey}" dst-path=install.rsc mode=${mode}${certFlag}; :delay 4s; /import file-name=install.rsc; :delay 1s; /file remove install.rsc`;
  };

  const copyCommand = () => {
    if (appUrlError) {
      toast.error(appUrlError);
      return;
    }
    localStorage.setItem("router_link_mgmt_user", mgmtUser);
    navigator.clipboard.writeText(buildCommand());
    setCopied(true);
    setPolling(true);
    startWatching();
    toast.success("Command copied — watching for your router");
    setTimeout(() => setCopied(false), 3000);
  };

  const generateRemoteScript = async () => {
    if (!routerName.trim()) { setWgError("Enter a name for the router"); return; }
    if (!mgmtPass) { setWgError("Add the router admin password first"); return; }
    if (appUrlError) { setWgError(appUrlError); return; }
    setWgGenerating(true);
    setWgError("");
    setWgScript("");
    try {
      const token = getToken();
      const { data } = await axios.post(
        `${API}/cgnat-tunnel/new-router-script`,
        {
          routerName: routerName.trim(),
          apiPassword: mgmtPass,
          apiPort: parseInt(mgmtPort, 10) || 8728,
          serverUrl: appUrl.replace(/\/$/, ""),
          tenantSlug,
          enrollApiKey: apiKey,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setWgScript(data.script);
      setTunnelStatus((previous) => ({
        ...previous,
        activeTunnels: (previous?.activeTunnels || 0) + 1,
      }));
      setPolling(true);
      startWatching();
      toast.success("One-command remote link script ready", data.tunnelIp || "");
    } catch (e) {
      setWgError(e.response?.data?.error || e.message || "Could not generate the remote link script");
    } finally {
      setWgGenerating(false);
    }
  };

  const downloadServerSetup = async () => {
    try {
      const token = getToken();
      const { data } = await axios.get(`${API}/cgnat-tunnel/scripts/server-setup`, {
        responseType: "text",
        headers: { Authorization: `Bearer ${token}` },
      });
      const url = URL.createObjectURL(new Blob([data], { type: "text/x-shellscript" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "wg-server-setup.sh";
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Server setup script downloaded", "Run it as root on your WireGuard VPS");
    } catch (e) {
      toast.error("Could not download server setup script", e.response?.data?.error || e.message);
    }
  };

  const copyRemoteScript = () => {
    if (!wgScript) {return;}
    navigator.clipboard.writeText(wgScript);
    setCopied(true);
    setPolling(true);
    startWatching();
    toast.success("Remote link script copied — paste it once on the router");
    setTimeout(() => setCopied(false), 3000);
  };

  const handleUpgrade = async () => {
    if (!mgmtUser || !mgmtPass) {
      toast.error("Enter management username and password first");
      return;
    }
    if (!connectionStatus?.router?.id && !connectionStatus?.router?.mac) {
      toast.error("Router details not available. Wait for the router to connect first.");
      return;
    }

    setIsUpgrading(true);
    try {
      const payload = {
        username: mgmtUser,
        password: mgmtPass,
        port: mgmtPort,
        connection_type: "api",
      };

      const headers = { Authorization: `Bearer ${apiKey}` };

      const { data } = connectionStatus.router.id
        ? await axios.post(
            `${API}/router/v1/${tenantSlug}/routers/${connectionStatus.router.id}/link-billing`,
            {
              ...payload,
              test_ip: connectionStatus.router.ip || undefined,
            },
            { headers },
          )
        : await axios.put(
            `${API}/router/v1/upgrade`,
            {
              ...payload,
              mac: connectionStatus.router.mac,
            },
            { headers },
          );

      toast.success(
        data.subscriptions_synced
          ? `Router upgraded. Synced ${data.subscriptions_synced} subscription(s).`
          : "Router upgraded to full management",
      );
      localStorage.setItem("router_link_mgmt_user", mgmtUser);
      manualCheck();
      fetchDiagnostics(data.router?.id || connectionStatus.router.id);
    } catch (e) {
      const detail = e.response?.data?.raw_error;
      const message = e.response?.data?.error || "Upgrade failed";
      toast.error(detail ? `${message} (${detail})` : message);
    } finally {
      setIsUpgrading(false);
    }
  };

  const pushBillingConfig = async () => {
    const routerId = connectionStatus?.router?.id;
    if (!tenantSlug || !apiKey || !routerId) {
      toast.error("Wait for the router to be discovered before pushing configuration");
      return;
    }
    if (!connectionStatus?.router?.has_connection) {
      toast.error("Upgrade the router to Full Management first");
      return;
    }

    setIsPushing(true);
    try {
      const { data } = await axios.post(
        `${API}/router/v1/${tenantSlug}/routers/${routerId}/push`,
        {},
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      toast.success(data.message || "Billing configuration pushed successfully");
      setConnectionStatus((current) => current ? {
        ...current,
        connected: true,
        router: { ...current.router, has_connection: true },
      } : current);
      fetchDiagnostics(routerId);
    } catch (e) {
      const message = e.response?.data?.error || e.response?.data?.message || e.message;
      toast.error(`Remote push failed: ${message}`);
    } finally {
      setIsPushing(false);
    }
  };

  // Manual check (in addition to SSE watch)
  const manualCheck = async () => {
    setLastError(null);
    if (!tenantSlug || !apiKey) {
      toast.error("No API key configured");
      return;
    }
    try {
      const url = `${API}/router/v1/${tenantSlug}/status?t=${Date.now()}`;
      const { data } = await axios.get(url, { headers: { Authorization: "Bearer " + apiKey } });
      setConnectionStatus(data);
      setDebugInfo({ url, response: data });
      setCheckCount((c) => c + 1);
      if (data.router?.id) {
        fetchDiagnostics(data.router.id);
      } else {
        setDiagnostics(null);
      }
      if (data.connected) {
        toast.success("Router found!");
      } else {
        toast.info("Still waiting...");
      }
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setLastError(`${msg} (HTTP ${e.response?.status || "network error"})`);
    }
  };

  // SSE watch handles polling now
  // Manual check available via the Check Now button

  const copyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    toast.success("API key copied");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  const isLinked = connectionStatus?.connected && connectionStatus?.router?.has_connection;
  const diagnosticSummary = diagnostics?.steps?.reduce(
    (summary, step) => {
      summary[step.status] = (summary[step.status] || 0) + 1;
      return summary;
    },
    { ok: 0, warning: 0, error: 0, pending: 0 },
  );
  const getDiagnosticClasses = (status) => {
    if (status === "ok") {
      return {
        icon: "text-green-400",
        bg: "bg-green-500/10",
        border: "border-green-500/30",
        label: "text-green-300",
      };
    }
    if (status === "error") {
      return {
        icon: "text-red-400",
        bg: "bg-red-500/10",
        border: "border-red-500/30",
        label: "text-red-300",
      };
    }
    if (status === "pending") {
      return {
        icon: "text-zinc-400",
        bg: "bg-zinc-800/50",
        border: "border-zinc-700/50",
        label: "text-zinc-300",
      };
    }
    return {
      icon: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      label: "text-amber-300",
    };
  };
  const autoFixableDiagnosticSteps = new Set([
    "api_service",
    "radius_client",
    "pppoe_server",
    "billing_sync",
  ]);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Router className="w-6 h-6 text-blue-400" />
          Link MikroTik Router
        </h1>
        <p className="text-zinc-400 text-sm mt-1">
          One command to connect your MikroTik router to your billing system
        </p>
      </div>

      {/* Step 1: API Key */}
      <Card className="bg-zinc-900/60 border-zinc-800/50">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">1</span>
            Your API Key
          </CardTitle>
          <CardDescription>
            This key authenticates your router with the billing server
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {apiKey ? (
            <div className="flex items-center gap-3">
              <code className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-4 py-3 text-sm text-amber-400 font-mono break-all">
                {apiKey}
              </code>
              <Button
                variant="outline"
                onClick={copyApiKey}
                className="gap-2 border-zinc-700/50 text-zinc-300 shrink-0"
              >
                <Copy className="w-4 h-4" /> Copy
              </Button>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm">
              No API key yet. Generate one to get started.
            </p>
          )}
          <Button onClick={generateKey} disabled={generating} className="gap-2">
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Key className="w-4 h-4" />
            )}
            {apiKey ? "Regenerate API Key" : "Generate API Key"}
          </Button>
        </CardContent>
      </Card>

      {/* Step 2: Management Credentials */}
      {apiKey && (
        <Card className={`bg-zinc-900/60 border-zinc-800/50 ${showCredentials ? "" : "opacity-70"}`}>
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold">2</span>
              Management Credentials
              {!showCredentials && (
                <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full ml-2">Recommended</span>
              )}
            </CardTitle>
            <CardDescription>
              {showCredentials
                ? "So the billing system can manage your router (sync PPPoE, push scripts, monitor)"
                : "Add credentials for full router management. The router will still link without them."}
            </CardDescription>
          </CardHeader>
          {showCredentials && (
            <CardContent className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1 font-medium">Router Username</label>
                <input
                  type="text"
                  value={mgmtUser}
                  onChange={(e) => setMgmtUser(e.target.value)}
                  placeholder="admin"
                  className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1 font-medium">Router Password</label>
                <input
                  type="password"
                  value={mgmtPass}
                  onChange={(e) => setMgmtPass(e.target.value)}
                  placeholder="Enter router admin password"
                  className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1 font-medium">API Port</label>
                <input
                  type="text"
                  value={mgmtPort}
                  onChange={(e) => setMgmtPort(e.target.value)}
                  placeholder="8728"
                  className="w-24 bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
                <p className="text-xs text-zinc-500 mt-1">Default MikroTik API port is 8728</p>
              </div>
            </CardContent>
          )}
          {!showCredentials && (
            <CardContent>
              <Button
                variant="outline"
                onClick={() => setShowCredentials(true)}
                className="gap-2 border-zinc-700/50 text-zinc-300"
              >
                <Shield className="w-4 h-4" />
                Add Credentials (For Full Management)
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      {/* Step 3: Installation Command */}
      {apiKey && (
        <Card className="bg-zinc-900/60 border-zinc-800/50">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-xs font-bold">3</span>
              Run on Your MikroTik
            </CardTitle>
            <CardDescription>
              Paste this single command into your MikroTik terminal (SSH or Winbox). It runs immediately.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 p-1 rounded-xl bg-zinc-800/60 border border-zinc-700/50">
              <button
                type="button"
                onClick={() => setLinkMode("direct")}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${linkMode === "direct" ? "bg-blue-500/20 text-blue-300" : "text-zinc-400 hover:text-zinc-200"}`}
              >
                Direct / LAN
              </button>
              <button
                type="button"
                onClick={() => setLinkMode("remote")}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${linkMode === "remote" ? "bg-violet-500/20 text-violet-300" : "text-zinc-400 hover:text-zinc-200"}`}
              >
                Remote / CGNAT (one command)
              </button>
            </div>

            {linkMode === "remote" && (
              <div className="space-y-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1 font-medium">Router name</label>
                  <input
                    type="text"
                    value={routerName}
                    onChange={(e) => setRouterName(e.target.value)}
                    placeholder="e.g. Branch-01"
                    className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  />
                </div>
                {tunnelStatus?.readiness && !tunnelStatus.readiness.canGenerateScripts && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                    <p className="text-xs font-medium text-amber-300">Remote tunnel not ready yet</p>
                    <ul className="mt-1 list-disc list-inside text-[11px] text-amber-200/80">
                      {(tunnelStatus.readiness.blockers || []).map((blocker) => <li key={blocker}>{blocker}</li>)}
                    </ul>
                    <Button variant="outline" size="sm" onClick={downloadServerSetup} className="mt-2 gap-2 border-amber-500/40 text-amber-200">
                      <Upload className="w-3.5 h-3.5" /> Download server setup script
                    </Button>
                  </div>
                )}
                {!mgmtPass && (
                  <p className="text-xs text-amber-300">
                    Add the router admin password above — the one-command script needs it to enable the API user.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5 font-medium">
                Server URL
              </label>
              <input
                type="text"
                value={appUrl}
                onChange={handleAppUrlChange}
                placeholder="https://your-server.com"
                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors"
              />
              <p className={`text-xs mt-1 ${appUrlError ? "text-red-400" : "text-zinc-500"}`}>
                {appUrlError || "Your server URL. The MikroTik router must be able to reach this address."}
              </p>
            </div>

            {mgmtUser && mgmtPass && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-start gap-2">
                <Shield className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-300">
                  Management credentials included. The router will automatically be linked for full management when it reports in.
                </p>
              </div>
            )}

            {!mgmtPass && (
              <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                <p className="text-xs text-zinc-400">
                  No management credentials set. The router will link but you won't be able to sync PPPoE or push scripts until you{" "}
                  <button onClick={() => setShowCredentials(true)} className="text-blue-400 hover:underline">add credentials</button>.
                </p>
              </div>
            )}

            {linkMode === "remote" ? (
              <>
                <Button
                  onClick={generateRemoteScript}
                  disabled={wgGenerating || Boolean(appUrlError) || !apiKey || !mgmtPass || tunnelStatus?.readiness?.canGenerateScripts === false}
                  className="gap-2 w-full"
                >
                  {wgGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                  Generate one-command remote link script
                </Button>
                {wgError && <p className="text-xs text-red-400">{wgError}</p>}
                {wgScript && (
                  <>
                    <pre className="bg-zinc-950 border border-violet-500/30 rounded-lg p-4 text-sm text-green-400 font-mono overflow-x-auto whitespace-pre-wrap">
                      {wgScript}
                    </pre>
                    <p className="text-xs text-zinc-500">
                      Paste this once in the router terminal. It creates the WireGuard tunnel, enables the API and enrolls the router — no public IP needed.
                    </p>
                    <Button onClick={copyRemoteScript} className="gap-2 w-full">
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied ? "Copied!" : "Copy script & watch for router"}
                    </Button>
                  </>
                )}
              </>
            ) : (
              <>
                <pre className="bg-zinc-950 border border-zinc-700/50 rounded-lg p-4 text-sm text-green-400 font-mono overflow-x-auto whitespace-pre-wrap">
                  {buildCommand()}
                </pre>
                <p className="text-xs text-zinc-500">
                  Run Step 0 first if you set credentials above. Then run Steps 1-3 in order.
                </p>
                <Button onClick={copyCommand} disabled={Boolean(appUrlError)} className="gap-2 w-full">
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied!" : "Copy command & watch for router"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Connection Status */}
      {apiKey && (
        <Card className="bg-zinc-900/60 border-zinc-800/50">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold">4</span>
              Connection Status
            </CardTitle>
            <CardDescription>
              {isLinked
                ? "Router is fully linked and manageable"
                : connectionStatus?.connected
                  ? "Router is connected. Add credentials for full management."
                  : "Waiting for your router to report in..."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status indicator */}
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  isLinked && connectionStatus?.router?.is_online !== false
                    ? "bg-green-500 shadow-lg shadow-green-500/30"
                    : connectionStatus?.connected && connectionStatus?.router?.is_online !== false
                      ? "bg-green-500 animate-pulse"
                      : connectionStatus?.connected && connectionStatus?.router?.is_online === false
                        ? "bg-red-500"
                        : polling
                          ? "bg-amber-500 animate-pulse"
                          : "bg-zinc-600"
                }`}
              />
              <span className="text-sm text-zinc-300">
                {isLinked && connectionStatus?.router?.is_online !== false
                  ? "Online & Managed"
                  : connectionStatus?.connected && connectionStatus?.router?.is_online !== false
                    ? "Router Connected"
                    : connectionStatus?.connected && connectionStatus?.router?.is_online === false
                      ? "Router Offline"
                      : polling
                        ? "Listening..."
                        : "Not Monitoring"}
              </span>
            </div>

            {/* Connection details */}
            {connectionStatus?.router && (
              <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Router className="w-4 h-4 text-blue-400" />
                  <span className="text-white font-medium">{connectionStatus.router.name}</span>
                  <span className="text-zinc-500">({connectionStatus.router.model || "Unknown"})</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-400">
                  <span>MAC: {connectionStatus.router.mac}</span>
                  <span>IP: {connectionStatus.router.ip}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {connectionStatus.router.has_connection ? (
                    <span className="flex items-center gap-1 text-green-400">
                      <Check className="w-3 h-3" /> Fully managed (API connection active)
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-400">
                      <AlertCircle className="w-3 h-3" /> Not yet manageable — credentials needed
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Diagnostics */}
            {connectionStatus?.router?.id && (
              <div className="border border-zinc-800/70 rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-white font-medium">Router Link Diagnostics</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      {diagnostics
                        ? `${diagnosticSummary?.ok || 0} ok, ${diagnosticSummary?.warning || 0} warnings, ${diagnosticSummary?.error || 0} errors`
                        : "Run a read-only setup check against this router."}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => fetchDiagnostics()}
                    disabled={diagnosticsLoading}
                    className="gap-2 border-zinc-700/50 text-zinc-300 shrink-0"
                  >
                    {diagnosticsLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Shield className="w-4 h-4" />
                    )}
                    Check Setup
                  </Button>
                </div>

                {diagnostics?.steps?.length > 0 && (
                  <div className="space-y-2">
                    {diagnostics.steps.map((step) => {
                      const classes = getDiagnosticClasses(step.status);
                      const fixText = String(step.fix || "");
                      const fixIsCommand = fixText.trim().startsWith("/") || fixText.trim().startsWith(":");
                      const canApplyFix =
                        fixIsCommand &&
                        step.status !== "ok" &&
                        autoFixableDiagnosticSteps.has(step.id);
                      return (
                        <div
                          key={step.id}
                          className={`${classes.bg} ${classes.border} border rounded-lg p-3`}
                        >
                          <div className="flex items-start gap-3">
                            {step.status === "ok" ? (
                              <Check className={`w-4 h-4 mt-0.5 shrink-0 ${classes.icon}`} />
                            ) : step.status === "pending" ? (
                              <Loader2 className={`w-4 h-4 mt-0.5 shrink-0 ${classes.icon}`} />
                            ) : (
                              <AlertCircle className={`w-4 h-4 mt-0.5 shrink-0 ${classes.icon}`} />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-3">
                                <p className={`text-sm font-medium ${classes.label}`}>{step.label}</p>
                                <span className="text-[10px] uppercase text-zinc-500">
                                  {step.status}
                                </span>
                              </div>
                              <p className="text-xs text-zinc-400 mt-1">{step.message}</p>
                              {step.fix && (
                                <div className="mt-2 space-y-2">
                                  {fixIsCommand ? (
                                    <pre className="bg-zinc-950/80 border border-zinc-800 rounded-md p-2 text-xs text-green-300 font-mono overflow-x-auto whitespace-pre-wrap">
                                      {step.fix}
                                    </pre>
                                  ) : (
                                    <p className="text-xs text-zinc-300 bg-zinc-950/60 border border-zinc-800 rounded-md p-2">
                                      {step.fix}
                                    </p>
                                  )}
                                  <div className="flex flex-wrap gap-2">
                                    {canApplyFix && (
                                      <Button
                                        onClick={() => applyDiagnosticFix(step.id)}
                                        disabled={applyingFix === step.id}
                                        className="h-8 gap-2"
                                      >
                                        {applyingFix === step.id ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <Shield className="w-3 h-3" />
                                        )}
                                        {applyingFix === step.id ? "Applying..." : "Apply Fix"}
                                      </Button>
                                    )}
                                    <Button
                                      variant="outline"
                                      onClick={() => {
                                        navigator.clipboard.writeText(step.fix);
                                        toast.success(fixIsCommand ? "Command copied" : "Fix copied");
                                      }}
                                      className="h-8 gap-2 border-zinc-700/50 text-zinc-300"
                                    >
                                      <Copy className="w-3 h-3" />
                                      {fixIsCommand ? "Copy Command" : "Copy Fix"}
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Remote billing configuration */}
            {isLinked && connectionStatus?.router?.id && (
              <Card className="bg-blue-500/5 border-blue-500/30">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <Upload className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm text-blue-300 font-medium">Push Billing Configuration Remotely</p>
                      <p className="text-xs text-blue-400/70 mt-1">
                        Run the standard billing setup directly through the saved MikroTik API connection. No terminal copy-and-paste is required.
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={pushBillingConfig}
                    disabled={isPushing}
                    className="gap-2 w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {isPushing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    {isPushing ? "Pushing configuration..." : "Push Configuration to Router"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Last seen */}
            {connectionStatus?.lastSeen && (
              <p className="text-xs text-zinc-500">
                Last seen: {new Date(connectionStatus.lastSeen).toLocaleString()}
                {connectionStatus.ip ? ` from ${connectionStatus.ip}` : ""}
              </p>
            )}

            {/* Upgrade button for linked-but-not-managed routers */}
            {connectionStatus?.connected && !connectionStatus?.router?.has_connection && (
              <Card className="bg-amber-500/5 border-amber-500/30">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <Plug className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm text-amber-300 font-medium">Upgrade to Full Management</p>
                      <p className="text-xs text-amber-400/70 mt-1">
                        Your router is linked but not yet manageable. Add credentials to unlock PPPoE sync, script push, and monitoring.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <input
                      type="text"
                      value={mgmtUser}
                      onChange={(e) => setMgmtUser(e.target.value)}
                      placeholder="Router username (usually admin)"
                      className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    />
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={mgmtPass}
                        onChange={(e) => setMgmtPass(e.target.value)}
                        placeholder="Router admin password"
                        className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      />
                      <input
                        type="text"
                        value={mgmtPort}
                        onChange={(e) => setMgmtPort(e.target.value)}
                        placeholder="8728"
                        className="w-20 bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      />
                    </div>
                    <Button
                      onClick={handleUpgrade}
                      disabled={isUpgrading || !mgmtUser || !mgmtPass}
                      className="gap-2 w-full bg-amber-500 hover:bg-amber-600 text-black"
                    >
                      {isUpgrading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Link2 className="w-4 h-4" />
                      )}
                      {isUpgrading ? "Upgrading..." : "Upgrade to Full Management"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Waiting / Watching state */}
            {polling && !connectionStatus?.connected && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-amber-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">
                    {connectionStatus?.status === "watching"
                      ? `Watching for router... (${watchAttempts} checks, ${Math.ceil((watchRemaining * 5) / 60)}m remaining)`
                      : `Listening... (${checkCount} checks)`}
                  </span>
                </div>
                <Button
                  variant="outline"
                  onClick={manualCheck}
                  className="gap-2 w-full border-zinc-700/50 text-zinc-300"
                >
                  Check Now
                </Button>
                {lastError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-400">{lastError}</p>
                  </div>
                )}
                {checkCount > 3 && (
                  <Card className="bg-amber-500/5 border-amber-500/30">
                    <CardContent className="p-3 space-y-2">
                      <p className="text-xs text-amber-300 font-medium">Still waiting?</p>
                      <p className="text-xs text-zinc-400">
                        Generate a fresh key and re-run the command on your MikroTik.
                      </p>
                      <Button onClick={generateKey} disabled={generating} className="gap-2 w-full">
                        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                        Generate New Key & Re-run
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* SSE Timeout state */}
            {connectionStatus?.status === "timeout" && (
              <Card className="bg-red-500/5 border-red-500/30">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm text-red-300 font-medium">Watch Session Ended</p>
                      <p className="text-xs text-red-400/70 mt-1">{connectionStatus.message}</p>
                    </div>
                  </div>
                  <Button onClick={() => { setPolling(true); startWatching(); }} className="gap-2 w-full">
                    Start New Watch Session
                  </Button>
                </CardContent>
              </Card>
            )}

            {connectionStatus?.connected && isLinked && (
              <div className="flex items-center gap-3 text-green-400">
                <Check className="w-5 h-5" />
                <span className="text-sm font-medium">
                  Router fully linked and managed! You can now sync PPPoE, push scripts, and monitor this router.
                </span>
              </div>
            )}

            {/* Debug info */}
            {debugInfo && (
              <details className="mt-3">
                <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-400">Debug</summary>
                <pre className="mt-2 bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-400 font-mono overflow-x-auto">
                  {JSON.stringify(debugInfo, null, 2)}
                </pre>
              </details>
            )}

          </CardContent>
        </Card>
      )}

      {/* What This Does */}
      {apiKey && (
        <Card className="bg-zinc-900/60 border-zinc-800/50">
          <CardHeader>
            <CardTitle className="text-white">
              What this configures on your router
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-zinc-300">
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">&#10003;</span>
                RADIUS client pointing to your billing server for PPPoE/Hotspot auth
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">&#10003;</span>
                PPPoE server on bridge1 with RADIUS authentication
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">&#10003;</span>
                Hotspot server with RADIUS profile
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">&#10003;</span>
                Firewall rule allowing billing API access
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">&#10003;</span>
                Auto-sync scheduler every 5 minutes
              </li>
              {mgmtUser && mgmtPass && (
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">&#10003;</span>
                  API connection created automatically for full management (PPPoE sync, script push, monitoring)
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
