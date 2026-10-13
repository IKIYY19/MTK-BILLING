import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Router, Copy, Check, Key, Terminal, Loader2, Shield, AlertCircle,
  Link2, Plug, Wifi, WifiOff, Activity, Server, Trash2, X,
  Globe, RefreshCw, Lock
} from "lucide-react";
import { useToastStore } from "../stores/toastStore";
import { getToken } from "../lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";

const API = import.meta.env.VITE_API_URL || "/api";

const TABS = [
  { id: "link", label: "Link Router", icon: Link2 },
  { id: "routers", label: "All Routers", icon: Server },
];

export default function RoutersPage() {
  const addToast = useToastStore((state) => state.addToast);
  const toast = {
    error: (msg) => addToast('error', msg, '', 4000),
    success: (msg) => addToast('success', msg, '', 4000),
    warning: (msg) => addToast('warning', msg, '', 4000),
    info: (msg) => addToast('info', msg, '', 4000),
  };
  const [activeTab, setActiveTab] = useState("routers");
  const [loading, setLoading] = useState(true);

  // Router list state
  const [routers, setRouters] = useState([]);
  const [routersLoading, setRoutersLoading] = useState(false);

  // Link wizard state
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("router_link_api_key") || "");
  const [tenantSlug, setTenantSlug] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [appUrl, setAppUrl] = useState(() => localStorage.getItem("router_link_app_url") || window.location.origin);
  const [mgmtUser, setMgmtUser] = useState(() => localStorage.getItem("router_link_mgmt_user") || "admin");
  const [mgmtPass, setMgmtPass] = useState("");
  const [mgmtPort, setMgmtPort] = useState("8728");
  const [showCredentials, setShowCredentials] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [watchAttempts, setWatchAttempts] = useState(0);
  const [watchRemaining, setWatchRemaining] = useState(0);
  const watchIntervalRef = React.useRef(null);
  const [vpnModal, setVpnModal] = useState(null);
  const [vpnCopied, setVpnCopied] = useState(false);
  const [vpnLoading, setVpnLoading] = useState(false);

  // ── Link to Billing modal state ──────────────────────────────────────────
  const [linkModal, setLinkModal] = useState(null); // { router }
  const [linkForm, setLinkForm] = useState({ username: "admin", password: "", port: "8728", connection_type: "api", test_ip: "" });
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState(null); // { message, rawError, testIp, testPort, code }
  const [linkSuccess, setLinkSuccess] = useState(null);
  const [linkPhase, setLinkPhase] = useState(""); // "testing" | "saving" | ""
  // ─────────────────────────────────────────────────────────────────────────

  // ── WireGuard link-wizard state ───────────────────────────────────────────
  const [linkMode, setLinkMode] = useState("direct"); // "direct" | "wireguard"
  const [wgForm, setWgForm] = useState({ routerName: "", apiPassword: "", apiPort: "8728" });
  const [wgGenerating, setWgGenerating] = useState(false);
  const [wgResult, setWgResult] = useState(null); // { script, tunnelIp, connectionId }
  const [wgCopied, setWgCopied] = useState(false);
  const [wgError, setWgError] = useState(null);
  // ─────────────────────────────────────────────────────────────────────────

  // ── CGNAT WireGuard tunnel state ───────────────────────────────────────────
  const [tunnelServer, setTunnelServer] = useState(null); // /status payload
  const [tunnels, setTunnels] = useState([]);             // list of active tunnels
  const [tunnelsLoading, setTunnelsLoading] = useState(false);
  const [tunnelBusy, setTunnelBusy] = useState(null);     // connectionId being created/removed
  const [syncingHealth, setSyncingHealth] = useState(false);
  const [scriptModal, setScriptModal] = useState(null);   // { title, script }
  const [scriptCopied, setScriptCopied] = useState(false);
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => { fetchTenant(); return () => stopWatching(); }, []);

  // Load tunnel data when WireGuard mode is selected
  useEffect(() => {
    if (linkMode === "wireguard") { fetchTunnels(); }
  }, [linkMode]);

  const fetchTunnels = async () => {
    setTunnelsLoading(true);
    try {
      const { data } = await axios.get(`${API}/cgnat-tunnel/status`);
      setTunnelServer(data);
      setTunnels(data.tunnels || []);
    } catch (e) {
      toast.error(e.response?.data?.error || "Could not load tunnel status");
    } finally { setTunnelsLoading(false); }
  };

  const createTunnel = async (connectionId, routerName) => {
    if (!connectionId) { toast.error("Link this router to billing first"); return; }
    setTunnelBusy(connectionId);
    try {
      const { data } = await axios.post(`${API}/cgnat-tunnel/create`, { connectionId });
      if (data.success === false) { throw new Error(data.error || "Create failed"); }
      toast.success(`Tunnel created for ${routerName || "router"}`);
      setScriptModal({
        title: `Apply on ${routerName || "router"} (RouterOS terminal)`,
        script: data.mikrotikScript || "",
        hint: data.hint,
      });
      fetchTunnels();
    } catch (e) {
      toast.error(e.response?.data?.error || e.message || "Tunnel create failed");
    } finally { setTunnelBusy(null); }
  };

  const removeTunnel = async (connectionId, routerName) => {
    if (!confirm(`Remove the WireGuard tunnel for "${routerName || "this router"}"? The router will be unreachable until reconfigured.`)) { return; }
    setTunnelBusy(connectionId);
    try {
      await axios.delete(`${API}/cgnat-tunnel/${connectionId}`);
      toast.success("Tunnel removed");
      fetchTunnels();
    } catch (e) {
      toast.error(e.response?.data?.error || "Remove failed");
    } finally { setTunnelBusy(null); }
  };

  const viewTunnelScript = async (connectionId, routerName) => {
    setTunnelBusy(connectionId);
    try {
      const { data } = await axios.get(`${API}/cgnat-tunnel/${connectionId}/mikrotik-script`);
      setScriptModal({ title: `Tunnel script — ${routerName || "router"}`, script: data.script || "" });
    } catch (e) {
      toast.error(e.response?.data?.error || "Could not load script");
    } finally { setTunnelBusy(null); }
  };

  const viewServerSetupScript = async () => {
    try {
      const { data } = await axios.get(`${API}/cgnat-tunnel/scripts/server-setup`, { responseType: "text" });
      setScriptModal({ title: "Billing server WireGuard setup (run on your VPS)", script: typeof data === "string" ? data : "" });
    } catch (e) {
      toast.error("Could not load server setup script");
    }
  };

  const syncTunnelHealth = async () => {
    setSyncingHealth(true);
    try {
      const { data } = await axios.post(`${API}/cgnat-tunnel/health/sync`);
      if (!data.wgAvailable) {
        toast.error("WireGuard not detected on the server. Run the server setup script first.");
      } else {
        toast.success(`Synced ${data.checked} tunnel(s) — ${data.onlineCount} online`);
      }
      fetchTunnels();
    } catch (e) {
      toast.error(e.response?.data?.error || "Health sync failed");
    } finally { setSyncingHealth(false); }
  };

  const copyScript = async () => {
    if (!scriptModal?.script) { return; }
    try { await navigator.clipboard.writeText(scriptModal.script); setScriptCopied(true); setTimeout(() => setScriptCopied(false), 2000); } catch { /* ignore */ }
  };

  const fetchTenant = async () => {
    try {
      const token = getToken();
      const { data } = await axios.get(`${API}/tenants/current`, { headers: { Authorization: `Bearer ${token}` } });
      setTenantId(data.id);
      setTenantSlug(data.slug || data.name?.toLowerCase().replace(/\s+/g, "-") || "");
      const storedKey = localStorage.getItem("router_link_api_key");
      const tenantKey = data.settings?.api_key;
      const activeKey = tenantKey || storedKey || "";
      if (activeKey && activeKey !== apiKey) {
        setApiKey(activeKey);
        localStorage.setItem("router_link_api_key", activeKey);
      }
    } catch (e) {
      const storedKey = localStorage.getItem("router_link_api_key");
      if (storedKey && !apiKey) { setApiKey(storedKey); }
    } finally { setLoading(false); }
  };

  const fetchRouters = async () => {
    if (!tenantSlug) { return; }
    setRoutersLoading(true);
    try {
      const { data } = await axios.get(`${API}/router/v1/${tenantSlug}/routers`);
      setRouters(data.routers || []);
    } catch (e) { /* silent */ } finally { setRoutersLoading(false); }
  };

  useEffect(() => { if (tenantSlug) { fetchRouters(); const i = setInterval(fetchRouters, 15000); return () => clearInterval(i); } }, [tenantSlug]);

  const deleteRouter = async (routerId, routerName) => {
    if (!confirm(`Delete "${routerName}"? This removes the router and its API connection permanently.`)) { return; }
    setDeleting(routerId);
    try {
      await axios.delete(`${API}/router/v1/${tenantSlug}/routers/${routerId}`);
      toast.success("Router deleted");
      fetchRouters();
    } catch (e) {
      toast.error(e.response?.data?.error || "Delete failed");
    } finally { setDeleting(null); }
  };

  const openVpnModal = async (router, slug) => {
    setVpnModal({ router, slug });
    setVpnCopied(false);
    setVpnLoading(true);
    try {
      await axios.get(`${API}/settings`);
    } catch (e) {
      setVpnModal({ router, slug, noServer: true });
    } finally { setVpnLoading(false); }
  };

  const getVpnCommand = () => {
    if (!vpnModal) { return ""; }
    const { slug } = vpnModal;
    const origin = window.location.origin;
    const token = getToken();
    return `/tool fetch url="${origin}/api/router/v1/${slug}/scripts/vpn" http-header-field="Authorization: Bearer ${token || 'YOUR_API_KEY'}" dst-path="vpn.rsc" mode=https check-certificate=no; :delay 2s; /import file-name="vpn.rsc"; :delay 1s; /file remove "vpn.rsc"`;
  };

  const copyVpnCmd = () => {
    navigator.clipboard.writeText(getVpnCommand());
    setVpnCopied(true);
    setTimeout(() => setVpnCopied(false), 3000);
  };

  // Watch session
  const startWatching = async () => {
    if (!tenantSlug) { return; }
    stopWatching();
    try {
      const { data } = await axios.post(`${API}/router/v1/${tenantSlug}/watch/start`);
      setConnectionStatus({ connected: false, status: "watching", message: "Watch session started" });
      setWatchAttempts(0); setLastError(null);
      const poll = async () => {
        try {
          const { data: pollData } = await axios.get(`${API}/router/v1/${tenantSlug}/watch/${data.sessionId}`);
          setWatchAttempts((c) => c + 1);
          if (pollData.found) {
            stopWatching();
            setConnectionStatus({ connected: true, status: "online", router: pollData.router, message: pollData.message });
            fetchRouters();
            toast.success(pollData.message);
          } else if (pollData.expired) {
            stopWatching();
            setConnectionStatus({ connected: false, status: "timeout", message: pollData.message });
          } else { setWatchRemaining(Math.max(0, 600 - (pollData.elapsed || 0))); }
        } catch (e) {
          console.warn("Poll status failed:", e);
        }
      };
      poll();
      watchIntervalRef.current = setInterval(poll, 3000);
    } catch (e) { setLastError("Failed to start watch: " + (e.response?.data?.error || e.message)); }
  };
  const stopWatching = () => { if (watchIntervalRef.current) { clearInterval(watchIntervalRef.current); watchIntervalRef.current = null; } };

  useEffect(() => { if (tenantSlug && apiKey) { startWatching(); } }, [tenantSlug, apiKey]);

  const generateKey = async () => {
    setGenerating(true);
    try {
      const token = getToken();
      const key = "mtk-" + Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join("");
      await axios.put(`${API}/tenants/${tenantId}/api-key`, { api_key: key }, { headers: { Authorization: `Bearer ${token}` } });
      setApiKey(key);
      localStorage.setItem("router_link_api_key", key);
      toast.success("API key generated");
    } catch (e) { toast.error("Failed to generate key"); } finally { setGenerating(false); }
  };

  const buildCommand = () => {
    const mode = appUrl.startsWith("https") ? "https" : "http";
    const certFlag = appUrl.startsWith("https") ? " check-certificate=no" : "";
    const slugPath = tenantSlug ? `/v1/${tenantSlug}/install` : "/v1/scripts/install";
    let prefix = "";
    if (mgmtUser && mgmtPass) { prefix = `:global ztpMgmtUser "${mgmtUser}"; :global ztpMgmtPass "${mgmtPass}"; `; }
    return `${prefix}/tool fetch url="${appUrl}/api/router${slugPath}" http-header-field="Authorization: Bearer ${apiKey}" dst-path=install.rsc mode=${mode}${certFlag}; :delay 4s; /import file-name=install.rsc; :delay 1s; /file remove install.rsc`;
  };

  const generateWgScript = async () => {
    if (!wgForm.routerName.trim()) { setWgError("Enter a router name"); return; }
    if (!wgForm.apiPassword.trim()) { setWgError("Enter an API password"); return; }
    if (!apiKey) { setWgError("Generate an API key first (above)"); return; }
    setWgGenerating(true);
    setWgError(null);
    setWgResult(null);
    try {
      const token = getToken();
      const { data } = await axios.post(
        `${API}/cgnat-tunnel/new-router-script`,
        {
          routerName: wgForm.routerName.trim(),
          apiPassword: wgForm.apiPassword,
          apiPort: parseInt(wgForm.apiPort, 10) || 8728,
          serverUrl: appUrl,
          tenantSlug,
          enrollApiKey: apiKey,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setWgResult({ script: data.script, tunnelIp: data.tunnelIp, connectionId: data.connectionId });
    } catch (e) {
      setWgError(e.response?.data?.error || e.message || "Failed to generate script");
    } finally { setWgGenerating(false); }
  };

  // ── Link to Billing handlers ─────────────────────────────────────────────
  const openLinkModal = (router) => {
    setLinkModal({ router });
    setLinkForm({
      username: router.mgmt_username || "admin",
      password: "",
      port: String(router.mgmt_port || 8728),
      connection_type: "api",
      test_ip: router.ip_address || "",
    });
    setLinkError("");
    setLinkSuccess(null);
  };

  const closeLinkModal = () => {
    setLinkModal(null);
    setLinkError(null);
    setLinkSuccess(null);
    setLinkPhase("");
  };

  const handleLinkToBilling = async (e) => {
    e.preventDefault();
    if (!linkModal) { return; }
    setLinking(true);
    setLinkError(null);
    setLinkSuccess(null);
    setLinkPhase("testing");

    try {
      const token = getToken();
      // Phase indication: the backend tests the real connection first
      const { data } = await axios.post(
        `${API}/router/v1/${tenantSlug}/routers/${linkModal.router.id}/link-billing`,
        {
          username: linkForm.username,
          password: linkForm.password,
          port: parseInt(linkForm.port, 10) || 8728,
          connection_type: linkForm.connection_type,
          test_ip: linkForm.test_ip?.trim() || undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setLinkPhase("");
      setLinkSuccess({
        connection_id: data.connection_id,
        subscriptions_synced: data.subscriptions_synced || 0,
        test_ip: data.test_ip,
      });

      toast.success(
        `Router "${data.name}" linked to billing`,
        data.subscriptions_synced > 0
          ? `${data.subscriptions_synced} subscription(s) synced to MikroTik`
          : "Connection verified and router linked",
      );

      await fetchRouters();
    } catch (err) {
      setLinkPhase("");
      const resp = err.response?.data || {};
      setLinkError({
        message: resp.error || err.message || "Link failed",
        rawError: resp.raw_error || null,
        testIp: resp.test_ip || linkModal.router.ip_address,
        testPort: resp.test_port || linkForm.port,
        code: resp.code || null,
      });
    } finally {
      setLinking(false);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) { return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-zinc-400" /></div>; }

  const isLinked = connectionStatus?.connected && connectionStatus?.router?.has_connection;
  const isOnline = connectionStatus?.router?.is_online !== false;

  const getRouterStatus = (r) => {
    if (r.is_online) { return { color: 'green', label: 'ONLINE', Icon: Wifi, dotClass: 'bg-green-500 shadow-lg shadow-green-500/30', badgeClass: 'bg-green-500/10 text-green-400' }; }
    if (r.is_reporting && r.linked_mikrotik_connection_id) { return { color: 'amber', label: 'RADIUS', Icon: Shield, dotClass: 'bg-amber-500 shadow-lg shadow-amber-500/30', badgeClass: 'bg-amber-500/10 text-amber-400' }; }
    if (r.is_reporting) { return { color: 'slate', label: 'HEARTBEAT', Icon: Activity, dotClass: 'bg-slate-500', badgeClass: 'bg-slate-500/10 text-slate-400' }; }
    return { color: 'red', label: 'OFFLINE', Icon: WifiOff, dotClass: 'bg-red-500', badgeClass: 'bg-red-500/10 text-red-400' };
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Router className="w-6 h-6 text-blue-400" /> Routers
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Link, manage, and monitor your MikroTik routers</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-1">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${activeTab === tab.id ? "bg-blue-500/10 text-blue-400" : "text-zinc-500 hover:text-zinc-300"}`}>
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* ALL ROUTERS TAB */}
      {activeTab === "routers" && (
        <div className="space-y-4">
          {/* Stats bar */}
          <div className="grid grid-cols-4 gap-3">
            <Card className="bg-zinc-900/60 border-zinc-800/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <div><p className="text-2xl font-bold text-white">{routers.filter(r => r.is_online).length}</p><p className="text-xs text-zinc-500">Online</p></div>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900/60 border-zinc-800/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <div><p className="text-2xl font-bold text-white">{routers.filter(r => r.is_reporting && !r.is_online).length}</p><p className="text-xs text-zinc-500">Reporting</p></div>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900/60 border-zinc-800/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <div><p className="text-2xl font-bold text-white">{routers.filter(r => !r.is_online && !r.is_reporting).length}</p><p className="text-xs text-zinc-500">Offline</p></div>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900/60 border-zinc-800/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-slate-500" />
                <div><p className="text-2xl font-bold text-white">{routers.filter(r => !r.linked_mikrotik_connection_id).length}</p><p className="text-xs text-zinc-500">Unmanaged</p></div>
              </CardContent>
            </Card>
          </div>

          {routers.length === 0 ? (
            <Card className="bg-zinc-900/60 border-zinc-800/50">
              <CardContent className="p-8 text-center">
                <Router className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400 font-medium">No routers yet</p>
                <p className="text-zinc-600 text-sm mt-1 mb-4">Link your first MikroTik router to get started</p>
                <Button onClick={() => setActiveTab("link")} className="gap-2"><Link2 className="w-4 h-4" /> Link a Router</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {routers.map((r) => {
                const status = getRouterStatus(r);
                const isManaged = !!r.linked_mikrotik_connection_id;
                return (
                  <Card key={r.id} className={`bg-zinc-900/60 overflow-hidden transition-all ${!isManaged ? 'border-amber-500/25' : 'border-zinc-800/50'}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        {/* Status dot + name + badges */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={`w-3 h-3 rounded-full shrink-0 ${status.dotClass}`} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-white truncate">{r.name || r.identity || 'Unknown'}</p>
                              <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${status.badgeClass}`}>
                                <status.Icon className="w-3 h-3 inline mr-1" />{status.label}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${isManaged ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                {isManaged ? '✓ managed' : '⚠ unmanaged'}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-zinc-500">
                              {r.model && <span>{r.model}</span>}
                              {r.ip_address && <span>IP: {r.ip_address}</span>}
                              {r.mac_address && <span>MAC: {r.mac_address}</span>}
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Link to Billing button — prominent for unmanaged routers */}
                          {!isManaged ? (
                            <button
                              onClick={() => openLinkModal(r)}
                              title="Link this router to the billing engine"
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-xs font-medium transition-colors border border-amber-500/30"
                            >
                              <Link2 className="w-3.5 h-3.5" /> Link to Billing
                            </button>
                          ) : (
                            <button
                              onClick={() => openLinkModal(r)}
                              title="Update management credentials"
                              className="p-1.5 rounded-lg text-zinc-600 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                            >
                              <Link2 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => openVpnModal(r, tenantSlug)}
                            className="p-1.5 rounded-lg text-zinc-600 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                            title="Remote Winbox"
                          >
                            <Plug className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteRouter(r.id, r.name)}
                            disabled={deleting === r.id}
                            className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Delete router"
                          >
                            {deleting === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Unmanaged call-to-action strip */}
                      {!isManaged && (
                        <div className="mt-3 pt-3 border-t border-amber-500/20 flex items-center gap-2 text-xs text-amber-400/80">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>This router is not linked to billing. Click <strong>Link to Billing</strong> to enable auto-provisioning of PPPoE secrets.</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          <div className="text-center">
            <Button variant="outline" onClick={() => setActiveTab("link")} className="gap-2 border-zinc-700/50 text-zinc-300">
              <Link2 className="w-4 h-4" /> Link New Router
            </Button>
          </div>
        </div>
      )}

      {/* LINK ROUTER TAB */}
      {activeTab === "link" && (
        <div className="space-y-5">

          {/* API Key */}
          <Card className="bg-zinc-900/60 border-zinc-800/50">
            <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-xs text-zinc-500 mb-1 font-medium uppercase tracking-wide">Enrollment API Key</p>
                {apiKey
                  ? <code className="text-sm text-amber-400 font-mono break-all">{apiKey}</code>
                  : <p className="text-zinc-500 text-sm">No API key yet — generate one to start.</p>}
              </div>
              <Button onClick={generateKey} disabled={generating} size="sm" className="gap-2 shrink-0">
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                {apiKey ? "Regenerate" : "Generate Key"}
              </Button>
            </CardContent>
          </Card>

          {apiKey && (
            <>
              {/* Billing server URL — shared by both modes */}
              <div className="flex items-center gap-3">
                <Globe className="w-4 h-4 text-zinc-500 shrink-0" />
                <input
                  type="text"
                  value={appUrl}
                  onChange={(e) => { setAppUrl(e.target.value); localStorage.setItem("router_link_app_url", e.target.value); }}
                  placeholder="https://your-billing-server.com"
                  className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>

              {/* Mode picker */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setLinkMode("direct"); setWgResult(null); setWgError(null); }}
                  className={`rounded-xl border p-4 text-left transition-all ${linkMode === "direct" ? "border-blue-500/60 bg-blue-500/10" : "border-zinc-700/50 bg-zinc-900/40 hover:border-zinc-600/50"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Globe className={`w-4 h-4 ${linkMode === "direct" ? "text-blue-400" : "text-zinc-500"}`} />
                    <span className={`text-sm font-semibold ${linkMode === "direct" ? "text-blue-300" : "text-zinc-300"}`}>Direct Connection</span>
                  </div>
                  <p className="text-xs text-zinc-500">Router has a public IP reachable from this server.</p>
                </button>
                <button
                  onClick={() => setLinkMode("wireguard")}
                  className={`rounded-xl border p-4 text-left transition-all ${linkMode === "wireguard" ? "border-violet-500/60 bg-violet-500/10" : "border-zinc-700/50 bg-zinc-900/40 hover:border-zinc-600/50"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Lock className={`w-4 h-4 ${linkMode === "wireguard" ? "text-violet-400" : "text-zinc-500"}`} />
                    <span className={`text-sm font-semibold ${linkMode === "wireguard" ? "text-violet-300" : "text-zinc-300"}`}>WireGuard / NAT</span>
                  </div>
                  <p className="text-xs text-zinc-500">Router is behind NAT — dials home over an encrypted tunnel.</p>
                </button>
              </div>

              {/* ── DIRECT MODE ─────────────────────────────────────────── */}
              {linkMode === "direct" && (
                <div className="space-y-4">
                  <Card className="bg-zinc-900/60 border-zinc-800/50">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-white text-sm flex items-center gap-2">
                        <Shield className="w-4 h-4 text-amber-400" /> Router API Credentials
                        <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">Recommended</span>
                      </CardTitle>
                      <CardDescription className="text-xs">Include these so the router auto-links on first contact. Without them you link manually from the Routers tab.</CardDescription>
                    </CardHeader>
                    {showCredentials ? (
                      <CardContent className="space-y-2 pt-0">
                        <input type="text" value={mgmtUser} onChange={(e) => setMgmtUser(e.target.value)} placeholder="Username (usually admin)" className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                        <div className="flex gap-2">
                          <input type="password" value={mgmtPass} onChange={(e) => setMgmtPass(e.target.value)} placeholder="Password" className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                          <input type="text" value={mgmtPort} onChange={(e) => setMgmtPort(e.target.value)} placeholder="8728" className="w-20 bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                        </div>
                      </CardContent>
                    ) : (
                      <CardContent className="pt-0"><Button variant="outline" onClick={() => setShowCredentials(true)} size="sm" className="gap-2 border-zinc-700/50 text-zinc-300"><Shield className="w-3.5 h-3.5" /> Add Credentials</Button></CardContent>
                    )}
                  </Card>

                  <Card className="bg-zinc-900/60 border-zinc-800/50">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-white text-sm flex items-center gap-2"><Terminal className="w-4 h-4 text-green-400" /> Paste in MikroTik Terminal</CardTitle>
                      <CardDescription className="text-xs">One command — downloads &amp; runs the enrollment script</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      {mgmtUser && mgmtPass ? (
                        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2.5 flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
                          <p className="text-xs text-green-300">Credentials included — router auto-links on first contact</p>
                        </div>
                      ) : (
                        <div className="bg-zinc-800/30 border border-zinc-700/30 rounded-lg p-2.5 flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                          <p className="text-xs text-zinc-500">No credentials — router enrolls, then link it manually from the Routers tab</p>
                        </div>
                      )}
                      <pre className="bg-zinc-950 border border-zinc-700/50 rounded-lg p-3 text-xs text-green-400 font-mono overflow-x-auto whitespace-pre-wrap">{buildCommand()}</pre>
                      <Button onClick={() => { navigator.clipboard.writeText(buildCommand()); setCopied(true); toast.success("Copied!"); setTimeout(() => setCopied(false), 3000); }} className="gap-2 w-full">
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? "Copied!" : "Copy Command"}
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="bg-zinc-900/60 border-zinc-800/50">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${connectionStatus?.connected && isOnline ? "bg-green-500 shadow-lg shadow-green-500/30" : connectionStatus?.status === "watching" ? "bg-amber-500 animate-pulse" : "bg-zinc-600"}`} />
                        <span className="text-sm text-zinc-300">
                          {connectionStatus?.connected && isOnline ? "Router detected & online"
                            : connectionStatus?.status === "watching" ? `Listening for router... (${watchAttempts} checks)`
                            : "Waiting for router to check in"}
                        </span>
                      </div>
                      {connectionStatus?.router && (
                        <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-3 space-y-0.5">
                          <p className="text-sm text-white font-medium">{connectionStatus.router.name} <span className="text-zinc-500 font-normal">({connectionStatus.router.model || "Unknown"})</span></p>
                          <p className="text-xs text-zinc-500 font-mono">{connectionStatus.router.ip}</p>
                          <p className="text-xs mt-1">{connectionStatus.router.has_connection ? <span className="text-green-400">✓ Fully managed</span> : <span className="text-amber-400">Go to All Routers → Link to Billing to finish setup</span>}</p>
                        </div>
                      )}
                      {lastError && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{lastError}</p>}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* ── WIREGUARD MODE ──────────────────────────────────────── */}
              {linkMode === "wireguard" && (
                <div className="space-y-4">

                  {/* Tunnel server status bar */}
                  <Card className="bg-zinc-900/60 border-zinc-800/50">
                    <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-4 text-xs flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${tunnelServer?.readiness?.ready ? "bg-green-500" : "bg-amber-500"}`} />
                          <span className="text-zinc-400">{tunnelServer?.readiness?.ready ? "WireGuard ready" : "Tunnel server setup required"}</span>
                        </div>
                        {tunnelServer?.serverEndpoint && (
                          <span className="text-zinc-500 font-mono">{tunnelServer.serverEndpoint}:{tunnelServer.serverPort}</span>
                        )}
                        <span className="text-zinc-600">{tunnels.length} active tunnel{tunnels.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={syncTunnelHealth} disabled={syncingHealth} className="gap-1.5 border-zinc-700/50 text-zinc-400 h-7 text-xs">
                          {syncingHealth ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Sync
                        </Button>
                        <Button variant="outline" size="sm" onClick={viewServerSetupScript} className="gap-1.5 border-zinc-700/50 text-zinc-400 h-7 text-xs">
                          <Terminal className="w-3 h-3" /> Server Setup
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {tunnelServer?.readiness && !tunnelServer.readiness.ready && (
                    <Card className="border-amber-500/20 bg-amber-500/5">
                      <CardContent className="p-4 space-y-2">
                        <p className="text-sm font-medium text-amber-300">CGNAT linking needs a reachable tunnel server</p>
                        <p className="text-xs text-amber-200/80">
                          Run the billing API on a Linux VPS with a public IP or DNS name, allow inbound UDP {tunnelServer.serverPort || 51820}, and set WG_SERVER_ENDPOINT to that public address before restarting the API. Routers behind CGNAT initiate the encrypted tunnel outbound; no public IP or inbound port is needed on each router.
                        </p>
                        {tunnelServer.readiness.blockers?.map((blocker) => (
                          <p key={blocker} className="text-xs text-amber-100/70">• {blocker}</p>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {/* New router form / generated script */}
                  {!wgResult ? (
                    <Card className="bg-zinc-900/60 border-zinc-800/50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-white text-sm flex items-center gap-2"><Lock className="w-4 h-4 text-violet-400" /> New Router Details</CardTitle>
                        <CardDescription className="text-xs">Generates a single script — paste it once on the MikroTik terminal to set everything up automatically.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-0">
                        <div>
                          <label className="block text-xs text-zinc-400 mb-1">Router name</label>
                          <input type="text" value={wgForm.routerName} onChange={(e) => setWgForm({ ...wgForm, routerName: e.target.value })} placeholder="e.g. Branch-Nairobi" className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-400 mb-1">API password <span className="text-zinc-600">(will be set on the router)</span></label>
                          <input type="password" value={wgForm.apiPassword} onChange={(e) => setWgForm({ ...wgForm, apiPassword: e.target.value })} placeholder="Choose a strong password" className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
                          <p className="text-xs text-zinc-600 mt-1">Script creates a <strong className="text-zinc-400">billing</strong> user on the router with this password.</p>
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-400 mb-1">API port</label>
                          <input type="number" value={wgForm.apiPort} onChange={(e) => setWgForm({ ...wgForm, apiPort: e.target.value })} className="w-28 bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
                        </div>
                        {wgError && (
                          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                            <p className="text-xs text-red-400">{wgError}</p>
                          </div>
                        )}
                        <Button onClick={generateWgScript} disabled={wgGenerating || !tunnelServer?.readiness?.ready} className="gap-2 w-full bg-violet-600 hover:bg-violet-700">
                          {wgGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                          {wgGenerating ? "Generating…" : "Generate Link Script"}
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card className="bg-zinc-900/60 border-violet-500/30">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <CardTitle className="text-white text-sm flex items-center gap-2">
                              <Check className="w-4 h-4 text-green-400" /> Script Ready — Paste in MikroTik Terminal
                            </CardTitle>
                            <p className="text-xs text-zinc-500 mt-1">Tunnel IP: <span className="font-mono text-violet-300">{wgResult.tunnelIp?.split("/")[0]}</span></p>
                          </div>
                          <button onClick={() => { setWgResult(null); setWgError(null); }} className="text-zinc-500 hover:text-zinc-300 text-xs shrink-0">Change</button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-0">
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-2.5 flex items-start gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                          <p className="text-xs text-amber-300/90">Contains private keys — paste once on the router and keep it private.</p>
                        </div>
                        <pre className="bg-zinc-950 border border-zinc-700/50 rounded-lg p-3 text-xs text-green-400 font-mono overflow-x-auto whitespace-pre max-h-64 overflow-y-auto">{wgResult.script}</pre>
                        <Button onClick={() => { navigator.clipboard.writeText(wgResult.script); setWgCopied(true); toast.success("Script copied!"); setTimeout(() => setWgCopied(false), 3000); }} className="gap-2 w-full bg-violet-600 hover:bg-violet-700">
                          {wgCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          {wgCopied ? "Copied!" : "Copy Script"}
                        </Button>
                        <div className="bg-zinc-800/30 rounded-lg p-3 text-xs text-zinc-400 space-y-1">
                          <p className="font-medium text-zinc-300">The script does 4 things automatically:</p>
                          <p>① Sets up WireGuard &amp; connects to billing server</p>
                          <p>② Enables MikroTik API on port {wgForm.apiPort}</p>
                          <p>③ Creates <strong className="text-zinc-300">billing</strong> API user with your password</p>
                          <p>④ Enrolls router — appears in All Routers as managed</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Active tunnels (inline, collapsible) */}
                  {tunnels.length > 0 && (
                    <div>
                      <p className="text-xs text-zinc-500 font-medium mb-2 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-violet-400" /> Active Tunnels ({tunnels.length})
                      </p>
                      <div className="space-y-2">
                        {tunnels.map((t) => (
                          <Card key={t.connectionId} className="bg-zinc-900/40 border-zinc-800/40">
                            <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${t.tunnelActive ? "bg-green-500 shadow-sm shadow-green-500/40" : "bg-red-500"}`} />
                                <div className="min-w-0">
                                  <p className="text-white text-sm font-medium truncate">{t.routerName || "Router"}</p>
                                  <p className="text-zinc-500 text-xs font-mono">{t.tunnelIp?.split("/")[0] || "—"} · {t.tunnelActive ? "handshake OK" : "no handshake"}</p>
                                </div>
                              </div>
                              <div className="flex gap-1.5">
                                <Button variant="outline" size="sm" onClick={() => viewTunnelScript(t.connectionId, t.routerName)} disabled={tunnelBusy === t.connectionId} className="gap-1 border-zinc-700/50 text-zinc-400 h-7 text-xs">
                                  <Terminal className="w-3 h-3" /> Script
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => removeTunnel(t.connectionId, t.routerName)} disabled={tunnelBusy === t.connectionId} className="gap-1 border-red-500/20 text-red-400 hover:bg-red-500/10 h-7 text-xs">
                                  {tunnelBusy === t.connectionId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Link to Billing Modal ───────────────────────────────────────────── */}
      {linkModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700/60 rounded-2xl w-full max-w-md shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-zinc-800">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-amber-400" />
                  {linkModal.router.linked_mikrotik_connection_id ? 'Update Credentials' : 'Link to Billing'}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">{linkModal.router.name || linkModal.router.identity}</p>
              </div>
              <button onClick={closeLinkModal} className="text-zinc-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5">
              {linkSuccess ? (
                /* Success state */
                <div className="text-center space-y-4">
                  <div className="w-14 h-14 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                    <Check className="w-7 h-7 text-green-400" />
                  </div>
                  <div>
                    <p className="text-white font-semibold">Real Connection Verified & Linked!</p>
                    <p className="text-zinc-400 text-sm mt-1">
                      {linkSuccess.subscriptions_synced > 0
                        ? `${linkSuccess.subscriptions_synced} existing subscription(s) were synced to this router.`
                        : 'No existing subscriptions to sync. New subscriptions will provision automatically.'}
                    </p>
                  </div>
                  <div className="bg-zinc-800/60 rounded-lg p-3 text-left text-xs text-zinc-400 space-y-1">
                    <p>✅ Live connection test passed{linkSuccess.test_ip ? ` (${linkSuccess.test_ip})` : ""}</p>
                    <p>✅ MikroTik connection saved</p>
                    <p>✅ Router marked as managed</p>
                    {linkSuccess.subscriptions_synced > 0 && <p>✅ {linkSuccess.subscriptions_synced} PPPoE secret(s) synced</p>}
                    <p className="text-zinc-500 pt-1">New subscriptions linked to this router will auto-provision their PPPoE secrets.</p>
                  </div>
                  <button
                    onClick={closeLinkModal}
                    className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                /* Form state */
                <form onSubmit={handleLinkToBilling} className="space-y-4">
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-300">
                    <p className="font-medium mb-1">What happens when you link?</p>
                    <ul className="space-y-0.5 text-amber-400/80">
                      <li>• A MikroTik connection is created with these credentials</li>
                      <li>• Subscriptions on this router auto-provision PPPoE secrets</li>
                      <li>• Status/suspend/reactivate events sync automatically</li>
                    </ul>
                  </div>

                  <div>
                    <label className="block text-sm text-zinc-300 mb-1.5">Router API Username</label>
                    <input
                      type="text"
                      required
                      value={linkForm.username}
                      onChange={(e) => setLinkForm({ ...linkForm, username: e.target.value })}
                      placeholder="admin"
                      className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-zinc-300 mb-1.5">Router API Password</label>
                    <input
                      type="password"
                      required
                      value={linkForm.password}
                      onChange={(e) => setLinkForm({ ...linkForm, password: e.target.value })}
                      placeholder="Router password"
                      className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-zinc-300 mb-1.5">API Port</label>
                      <input
                        type="number"
                        required
                        value={linkForm.port}
                        onChange={(e) => setLinkForm({ ...linkForm, port: e.target.value })}
                        placeholder="8728"
                        className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-zinc-300 mb-1.5">Connection Type</label>
                      <select
                        value={linkForm.connection_type}
                        onChange={(e) => setLinkForm({ ...linkForm, connection_type: e.target.value, port: e.target.value === 'ssh' ? '22' : '8728' })}
                        className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      >
                        <option value="api">API (port 8728)</option>
                        <option value="api-ssl">API-SSL (port 8729)</option>
                        <option value="ssh">SSH (port 22)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-zinc-300 mb-1.5">Connection IP</label>
                    <input
                      type="text"
                      value={linkForm.test_ip}
                      onChange={(e) => setLinkForm({ ...linkForm, test_ip: e.target.value })}
                      placeholder="IP your billing server can reach (VPN/LAN)"
                      className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    />
                    <p className="text-xs text-zinc-500 mt-1">
                      Use the router&apos;s VPN or LAN address if the reported IP is behind NAT.
                    </p>
                  </div>

                  <div className="bg-zinc-800/40 rounded-lg px-3 py-2.5 text-xs text-zinc-500 space-y-0.5">
                    {linkModal.router.ip_address && <p>Reported IP: <span className="text-zinc-300 font-mono">{linkModal.router.ip_address}</span></p>}
                    {linkModal.router.mac_address && <p>MAC: <span className="text-zinc-300 font-mono">{linkModal.router.mac_address}</span></p>}
                    {linkModal.router.model && <p>Model: <span className="text-zinc-300">{linkModal.router.model}</span></p>}
                  </div>

                  {linkError && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                        <p className="text-sm text-red-400 font-medium">{linkError.message}</p>
                      </div>
                      {(linkError.testIp || linkError.testPort) && (
                        <div className="text-xs text-red-400/70 pl-6 space-y-0.5">
                          {linkError.testIp && <p>Tested IP: <span className="font-mono text-red-300">{linkError.testIp}</span></p>}
                          {linkError.testPort && <p>Tested port: <span className="font-mono text-red-300">{linkError.testPort}</span></p>}
                        </div>
                      )}
                      {linkError.rawError && linkError.rawError !== linkError.message && (
                        <details className="pl-6">
                          <summary className="text-xs text-red-400/60 cursor-pointer hover:text-red-400">Technical detail</summary>
                          <code className="block mt-1 text-xs text-red-300/70 font-mono bg-red-950/30 rounded px-2 py-1 break-all">{linkError.rawError}</code>
                        </details>
                      )}
                      {linkError.code === "NO_ROUTER_IP" && (
                        <p className="text-xs text-amber-300/90 pl-6">
                          Run the install script from <strong>Router Link</strong> or <strong>Link New Router</strong> first so the router reports in.
                        </p>
                      )}
                      {linkError.code === "CONNECTION_TEST_FAILED" && (
                        <p className="text-xs text-amber-300/90 pl-6">
                          Your server must reach the MikroTik API on this IP. If the router is behind NAT, set up VPN (Remote Winbox on this page) and use the VPN IP above. Enable API on the router: IP → Services → api (port 8728).
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={closeLinkModal}
                      className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={linking}
                      className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-zinc-900 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                      {linking && linkPhase === "testing" && <><Loader2 className="w-4 h-4 animate-spin" /> Testing connection...</>}
                      {linking && linkPhase !== "testing" && <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>}
                      {!linking && <><Link2 className="w-4 h-4" /> Link to Billing</>}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}


      {/* WireGuard Script Modal */}
      {scriptModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700/50 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <h3 className="text-base font-semibold text-white flex items-center gap-2 min-w-0">
                <Terminal className="w-5 h-5 text-blue-400 shrink-0" />
                <span className="truncate">{scriptModal.title}</span>
              </h3>
              <button onClick={() => setScriptModal(null)} className="text-zinc-400 hover:text-white shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              {scriptModal.hint && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-blue-300 text-xs">{scriptModal.hint}</div>
              )}
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-amber-300/90 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>This script contains the router&apos;s private key. Apply it once on the router, then keep it secret.</span>
              </div>
              <pre className="bg-zinc-950 border border-zinc-700/50 rounded-lg p-4 text-xs text-green-400 font-mono overflow-x-auto whitespace-pre-wrap">
                {scriptModal.script}
              </pre>
              <Button onClick={copyScript} className="gap-2 w-full">
                {scriptCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {scriptCopied ? "Copied!" : "Copy Script"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Remote Winbox VPN Modal */}
      {vpnModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700/50 rounded-2xl w-full max-w-lg">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Plug className="w-5 h-5 text-blue-400" />
                Remote Winbox — {vpnModal.router?.name || "Router"}
              </h3>
              <button onClick={() => setVpnModal(null)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {vpnLoading ? (
                <p className="text-zinc-400">Loading...</p>
              ) : vpnModal.noServer ? (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                  <p className="text-amber-300 text-sm font-medium mb-2">VPN server not configured</p>
                  <p className="text-amber-400/80 text-xs">
                    Configure the SSTP VPN server address in Settings &gt; General &gt; Remote Access VPN.
                  </p>
                </div>
              ) : (
                <>
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <p className="text-blue-300 text-sm font-medium mb-1">SSTP VPN Client</p>
                    <p className="text-blue-400/80 text-xs">
                      Establishes a secure tunnel from the router to your VPN server, enabling remote Winbox access even through NAT and firewalls.
                    </p>
                  </div>

                  <div className="bg-zinc-800/50 rounded-lg p-4">
                    <p className="text-zinc-400 text-xs mb-2 font-medium">INSTRUCTIONS</p>
                    <ol className="text-zinc-300 text-sm space-y-1 list-decimal pl-4">
                      <li>Copy the command</li>
                      <li>Paste it into your router&apos;s terminal</li>
                      <li>Press Enter</li>
                    </ol>
                  </div>

                  <pre className="bg-zinc-950 border border-zinc-700/50 rounded-lg p-4 text-sm text-green-400 font-mono overflow-x-auto whitespace-pre-wrap">
                    {getVpnCommand()}
                  </pre>

                  <Button onClick={copyVpnCmd} className="gap-2 w-full">
                    {vpnCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {vpnCopied ? "Copied!" : "Copy Command"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
