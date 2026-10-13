import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useToastStore } from "../stores/toastStore";
import {
  Router,
  Plus,
  Trash2,
  Copy,
  Download,
  Eye,
  RefreshCw,
  X,
  Code,
  FileText,
  Zap,
  Link2,
  CheckCircle,
  CheckCircle2,
  Clock,
  Wifi,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Settings,
  Radio,
} from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";

const API_URL = import.meta.env.VITE_API_URL || "/api";

const getProvisionServerOrigin = () => {
  if (API_URL && API_URL !== "/api") {
    try {
      const u = new URL(API_URL, window.location.origin);
      return `${u.protocol}//${u.host}`;
    } catch (e) {
      // fall through
    }
  }
  if (window.location.port === "5173") {return "http://localhost:5000";}
  return window.location.origin;
};

// ─── helpers ────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: "",
  identity: "",
  model: "",
  dns_servers: ["8.8.8.8", "8.8.4.4"],
  ntp_servers: ["pool.ntp.org"],
  wan_interface: "ether1",
  lan_interface: "bridge1",
  lan_ports: ["ether2", "ether3", "ether4", "ether5"],
  radius_server: "",
  radius_secret: "",
  hotspot_enabled: false,
  pppoe_enabled: false,
  pppoe_interface: "",
  pppoe_service_name: "",
  ip_address: "",
  mgmt_port: 8728,
  mgmt_username: "",
  mgmt_password: "",
  connection_type: "api",
  notes: "",
  radius_port: 1812,
};

const STATUS_COLORS = {
  provisioned: "bg-green-600/20 text-green-400",
  approved: "bg-blue-600/20 text-blue-400",
  pending: "bg-amber-600/20 text-amber-400",
  discovered: "bg-purple-600/20 text-purple-400",
  default: "bg-zinc-700 text-zinc-300",
};

const statusColor = (s) => STATUS_COLORS[s] || STATUS_COLORS.default;

// ─── main component ──────────────────────────────────────────────────────────

export function Devices() {
  const addToast = useToastStore((s) => s.addToast);

  // tabs
  const [tab, setTab] = useState("enroll"); // enroll | discovered | managed

  // provision URL
  const [publicUrl, setPublicUrl] = useState(getProvisionServerOrigin());

  // enrollment token flow
  const [enrollToken, setEnrollToken] = useState(null);
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [enrollCopied, setEnrollCopied] = useState(false);
  const [enrollLabel, setEnrollLabel] = useState("");
  const [enrollExpiry, setEnrollExpiry] = useState("24");

  // discovered routers
  const [discovered, setDiscovered] = useState([]);
  const [discoveredLoading, setDiscoveredLoading] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null); // discovered router being approved
  const [approveForm, setApproveForm] = useState({ ...EMPTY_FORM });
  const [approveLoading, setApproveLoading] = useState(false);

  // managed devices
  const [devices, setDevices] = useState([]);
  const [devLoading, setDevLoading] = useState(false);

  // per-device provision command state
  const [showCommand, setShowCommand] = useState(null);
  const [commandLoading, setCommandLoading] = useState({});
  const [cmdCopied, setCmdCopied] = useState(false);
  const [activationLoading, setActivationLoading] = useState({});

  // script/logs modals
  const [showScript, setShowScript] = useState(null);
  const [showLogs, setShowLogs] = useState(null);
  const [logs, setLogs] = useState([]);

  // batch approve
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchApproving, setBatchApproving] = useState(false);
  const [showBatchConfig, setShowBatchConfig] = useState(false);
  const [batchConfig, setBatchConfig] = useState({
    mgmt_username: "",
    mgmt_password: "",
    wan_interface: "ether1",
    lan_interface: "bridge1",
  });

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {next.delete(id);}
      else {next.add(id);}
      return next;
    });
  };

  const submitBatchApprove = async () => {
    setBatchApproving(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/devices/discovered/batch-approve`,
        { ids: [...selectedIds], config: batchConfig },
      );
      addToast(
        "success",
        "Batch Approve",
        `${data.total_succeeded} approved, ${data.total_failed} failed`,
      );
      setSelectedIds(new Set());
      setShowBatchConfig(false);
      fetchDiscovered();
      fetchDevices();
    } catch (e) {
      addToast(
        "error",
        "Batch Approve Error",
        e.response?.data?.error || e.message,
      );
    }
    setBatchApproving(false);
  };

  // manual create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_FORM });
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [createLoading, setCreateLoading] = useState(false);

  // ── fetchers ────────────────────────────────────────────────────────────

  const fetchDiscovered = useCallback(async () => {
    setDiscoveredLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/devices/discovered`);
      setDiscovered(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    }
    setDiscoveredLoading(false);
  }, []);

  const fetchDevices = useCallback(async () => {
    setDevLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/devices`);
      setDevices(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    }
    setDevLoading(false);
  }, []);

  useEffect(() => {
    fetchDiscovered();
    fetchDevices();
  }, [fetchDiscovered, fetchDevices]);

  // Auto-refresh discovered every 15 s so newly enrolled routers appear
  useEffect(() => {
    const id = setInterval(fetchDiscovered, 15000);
    return () => clearInterval(id);
  }, [fetchDiscovered]);

  // ── enrollment token ─────────────────────────────────────────────────────

  const generateEnrollmentToken = async () => {
    setEnrollLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/devices/enrollment-token`, {
        baseUrl: publicUrl.replace(/\/$/, ""),
        expires_hours: Number(enrollExpiry) || 24,
        label: enrollLabel,
      });
      setEnrollToken(data);
      addToast(
        "success",
        "Token Created",
        "Enrollment token generated successfully. Copy the command to your router.",
      );
    } catch (e) {
      addToast("error", "Token Error", e.response?.data?.error || e.message);
    }
    setEnrollLoading(false);
  };

  const copyEnroll = (text) => {
    navigator.clipboard.writeText(text);
    setEnrollCopied(true);
    setTimeout(() => setEnrollCopied(false), 2500);
  };

  // ── approval ─────────────────────────────────────────────────────────────

  const openApproval = (router) => {
    setApproveTarget(router);
    setApproveForm({
      ...EMPTY_FORM,
      name:
        router.identity ||
        `${router.model || "MikroTik"} - ${router.primary_mac || router.source_ip || ""}`.trim(),
      identity: router.identity || "",
      model: router.model || "",
      ip_address: router.source_ip || "",
      wan_interface: router.suggested_wan_interface || "ether1",
      lan_interface: router.suggested_lan_interface || "bridge1",
      lan_ports:
        Array.isArray(router.suggested_lan_ports) &&
        router.suggested_lan_ports.length
          ? router.suggested_lan_ports
          : ["ether2", "ether3", "ether4", "ether5"],
    });
  };

  const closeApproval = () => {
    setApproveTarget(null);
    setApproveForm({ ...EMPTY_FORM });
  };

  const submitApproval = async (e) => {
    e.preventDefault();
    setApproveLoading(true);
    try {
      await axios.post(
        `${API_URL}/devices/discovered/${approveTarget.id}/approve`,
        approveForm,
      );
      closeApproval();
      fetchDiscovered();
      fetchDevices();
      setTab("managed");
    } catch (e) {
      addToast("error", "Approval Error", e.response?.data?.error || e.message);
    }
    setApproveLoading(false);
  };

  const deleteDiscoveredRouter = async (id) => {
    if (
      !window.confirm(
        "Delete this discovered router? This action cannot be undone.",
      )
    )
      {return;}
    try {
      await axios.delete(`${API_URL}/devices/discovered/${id}`);
      fetchDiscovered();
    } catch (e) {
      addToast("error", "Delete Error", e.response?.data?.error || e.message);
    }
  };

  const toggleApproveLanPort = (portName) => {
    setApproveForm((prev) => {
      const current = prev.lan_ports || [];
      return {
        ...prev,
        lan_ports: current.includes(portName)
          ? current.filter((p) => p !== portName)
          : [...current, portName],
      };
    });
  };

  // ── managed device actions ────────────────────────────────────────────────

  const copyCmd = (text) => {
    navigator.clipboard.writeText(text);
    setCmdCopied(true);
    setTimeout(() => setCmdCopied(false), 2500);
  };

  const activateInBilling = async (device) => {
    setActivationLoading((prev) => ({ ...prev, [device.id]: true }));
    try {
      const { data } = await axios.post(
        `${API_URL}/devices/${device.id}/activate-billing`,
      );
      const synced = data.subscriptions_synced || 0;
      addToast(
        "success",
        "Billing Linked",
        `Billing link ${data.connection ? "activated" : "processed"} successfully.${synced ? ` ${synced} subscriptions processed.` : ""}`,
      );
      fetchDevices();
    } catch (e) {
      addToast(
        "error",
        "Billing Error",
        e.response?.data?.error || e.response?.data?.message || e.message,
      );
    } finally {
      setActivationLoading((prev) => ({ ...prev, [device.id]: false }));
    }
  };

  const viewScript = async (device) => {
    try {
      const { data } = await axios.get(
        `${API_URL}/devices/${device.id}/script`,
      );
      setShowScript({ ...device, content: data.script });
    } catch (e) {
      console.error(e);
    }
  };

  const viewLogs = async (device) => {
    try {
      const { data } = await axios.get(`${API_URL}/devices/${device.id}/logs`);
      setLogs(data);
      setShowLogs(device);
    } catch (e) {
      console.error(e);
    }
  };

  const regenerateToken = async (id) => {
    if (
      !window.confirm(
        "Regenerate token? The existing command will stop working.",
      )
    )
      {return;}
    await axios.post(`${API_URL}/devices/${id}/regenerate-token`);
    setShowCommand((c) => (c?.id === id ? null : c));
    fetchDevices();
  };

  const deleteDevice = async (id) => {
    if (!window.confirm("Delete this device?")) {return;}
    await axios.delete(`${API_URL}/devices/${id}`);
    fetchDevices();
  };

  const downloadScript = async (device) => {
    try {
      let content = device.content;
      if (!content) {
        const { data } = await axios.get(
          `${API_URL}/devices/${device.id}/script`,
        );
        content = data.script || "";
      }
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${device.name}-provision.rsc`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      addToast("error", "Download Error", e.response?.data?.error || e.message);
    }
  };

  // ── manual create ────────────────────────────────────────────────────────

  const scanRouter = async () => {
    if (
      !createForm.ip_address ||
      !createForm.mgmt_username ||
      !createForm.mgmt_password
    ) {
      addToast(
        "warning",
        "Missing Fields",
        "Enter router IP, username, and password before scanning.",
      );
      return;
    }
    setScanLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/devices/scan`, {
        ip_address: createForm.ip_address,
        api_port: createForm.mgmt_port,
        username: createForm.mgmt_username,
        password: createForm.mgmt_password,
      });
      setScanResult(data);
      setCreateForm((prev) => ({
        ...prev,
        identity: data.identity || prev.identity,
        model: data.model || prev.model,
        wan_interface: data.suggested?.wan_interface || prev.wan_interface,
        lan_interface: data.suggested?.lan_interface || prev.lan_interface,
        lan_ports: data.suggested?.lan_ports?.length
          ? data.suggested.lan_ports
          : prev.lan_ports,
      }));
    } catch (e) {
      addToast(
        "error",
        "Scan Error",
        e.response?.data?.message ||
          e.response?.data?.error ||
          "Scan failed — server could not reach the router.",
      );
    }
    setScanLoading(false);
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    setCreateLoading(true);
    try {
      await axios.post(`${API_URL}/devices`, createForm);
      setShowCreate(false);
      setCreateForm({ ...EMPTY_FORM });
      setScanResult(null);
      fetchDevices();
      setTab("managed");
    } catch (e) {
      addToast("error", "Create Error", e.response?.data?.error || e.message);
    }
    setCreateLoading(false);
  };

  const toggleCreateLanPort = (portName) => {
    setCreateForm((prev) => {
      const current = prev.lan_ports || [];
      return {
        ...prev,
        lan_ports: current.includes(portName)
          ? current.filter((p) => p !== portName)
          : [...current, portName],
      };
    });
  };

  // ── pending count badge ──────────────────────────────────────────────────

  const pendingCount = discovered.filter(
    (d) => d.status === "discovered",
  ).length;

  // ────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Radio className="w-5 h-5 text-white" />
          </div>
          Zero-Touch Provisioning
        </h1>
        <p className="text-zinc-400 mt-1 ml-12">
          Generate an onboarding script, paste it on any MikroTik — the router
          registers itself. No manual device entry required.
        </p>
      </div>

      {/* ── Public URL bar ───────────────────────────────────────────── */}
      <Card className="mb-5 border-blue-500/20 bg-blue-500/5">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex-1 space-y-1">
            <Label className="text-blue-300 text-xs uppercase tracking-wider">
              Public Provisioning URL
            </Label>
            <Input
              value={publicUrl}
              onChange={(e) => setPublicUrl(e.target.value)}
              placeholder="https://your-domain.com or http://public-ip:5000"
              className="bg-zinc-900 border-blue-500/30 text-white"
            />
          </div>
          <p className="text-xs text-zinc-400 sm:max-w-xs">
            Must be reachable by the MikroTik router. For remote sites use your
            public domain, public IP, VPN, or tunnel address — not localhost.
          </p>
        </CardContent>
      </Card>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-6 bg-zinc-900 rounded-xl p-1 w-fit">
        {[
          { id: "enroll", label: "Onboarding Script", icon: Zap },
          {
            id: "discovered",
            label: "Discovered Routers",
            icon: Radio,
            badge: pendingCount || null,
          },
          { id: "managed", label: "Managed Devices", icon: Settings },
        ].map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === id
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {badge ? (
              <span className="ml-1 bg-amber-500 text-black text-xs px-1.5 py-0.5 rounded-full font-bold">
                {badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          TAB 1 — Onboarding / Enrollment Script
      ══════════════════════════════════════════════════════════════ */}
      {tab === "enroll" && (
        <div className="space-y-6">
          {/* How it works */}
          <Card className="border-zinc-800">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-white text-base">
                How It Works
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <ol className="space-y-3">
                {[
                  {
                    n: "1",
                    text: "Set your Public Provisioning URL above (must be reachable by the MikroTik).",
                  },
                  {
                    n: "2",
                    text: 'Click "Generate Script" and paste the one command into the MikroTik terminal, SSH, or WinBox.',
                  },
                  {
                    n: "3",
                    text: "The router scans all interfaces, prints a port summary, auto-detects WAN/LAN, auto-approves itself, downloads and applies the provision script — fully configured in ONE step. No web UI needed.",
                  },
                  {
                    n: "4",
                    text: "(Optional) Customize WAN/LAN ports: set :global ztpWanPort and :global ztpLanPorts on the router before running the command.",
                  },
                  {
                    n: "5",
                    text: "The router is now fully provisioned with your chosen or auto-detected WAN/LAN ports.",
                  },
                ].map(({ n, text }) => (
                  <li key={n} className="flex gap-3 text-sm text-zinc-300">
                    <span className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0 text-xs font-bold">
                      {n}
                    </span>
                    {text}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {/* Token generation */}
          <Card className="border-zinc-800">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" /> Generate One-Command
                Script
              </CardTitle>
              <CardDescription>
                Creates a single command that scans, auto-approves, and fully
                provisions the router.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Label (optional)</Label>
                  <Input
                    value={enrollLabel}
                    onChange={(e) => setEnrollLabel(e.target.value)}
                    placeholder="e.g. Nairobi Branch 1"
                    className="bg-zinc-900"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Expires in (hours)</Label>
                  <Input
                    type="number"
                    value={enrollExpiry}
                    min="1"
                    max="720"
                    onChange={(e) => setEnrollExpiry(e.target.value)}
                    className="bg-zinc-900"
                  />
                </div>
              </div>

              <Button
                onClick={generateEnrollmentToken}
                disabled={enrollLoading}
                className="w-full sm:w-auto"
              >
                {enrollLoading ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 mr-2" />
                )}
                {enrollLoading ? "Generating…" : "Generate One-Command Script"}
              </Button>

              {enrollToken && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-2 text-green-400 text-sm">
                    <CheckCircle className="w-4 h-4" />
                    Token created — expires{" "}
                    {enrollToken.enrollment?.expires_at
                      ? new Date(
                          enrollToken.enrollment.expires_at,
                        ).toLocaleString()
                      : `in ${enrollExpiry}h`}
                  </div>
                  {enrollToken.mgmt_password && (
                    <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3">
                      <p className="text-xs text-green-400 font-semibold mb-1">Router Admin Password</p>
                      <p className="text-sm font-mono text-green-300 font-bold">{enrollToken.mgmt_password}</p>
                      <p className="text-xs text-green-400/60 mt-1">Auto-generated & embedded in the script.</p>
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label className="text-zinc-300 text-xs uppercase tracking-wider">
                      One-Command Provisioning Script
                    </Label>
                    <p className="text-xs text-zinc-400">
                      Paste this into MikroTik terminal, SSH, or WinBox
                      terminal:
                    </p>
                    <pre className="text-xs text-green-400 bg-zinc-900 p-4 rounded-lg border border-zinc-700 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                      {enrollToken.bootstrap_command || enrollToken.copyText}
                    </pre>
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          copyEnroll(
                            enrollToken.bootstrap_command ||
                              enrollToken.copyText,
                          )
                        }
                        className="flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        {enrollCopied ? "Copied!" : "Copy Command"}
                      </Button>
                      <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 text-xs text-blue-300 space-y-1 mt-3">
                        <p className="font-semibold">Port Customization:</p>
                        <p>
                          To choose specific WAN/LAN ports, set these globals on
                          the router BEFORE running:
                        </p>
                        <pre className="text-xs bg-zinc-900 p-2 rounded mt-1 font-mono text-blue-200">{`:global ztpWanPort "ether1"
:global ztpLanPorts "ether2,ether3,ether4"`}</pre>
                        <p className="mt-1">
                          If not set, the script auto-detects: first ethernet =
                          WAN, rest = LAN.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-300 space-y-1">
                    <p className="font-semibold">Security note:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-amber-300/80">
                      <li>
                        This token can only be used once and expires
                        automatically.
                      </li>
                      <li>
                        Any router that runs this script will be auto-approved
                        and provisioned automatically.
                      </li>
                      <li>
                        The router auto-approves and provisions itself — no
                        manual approval needed.
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB 2 — Discovered Routers
      ══════════════════════════════════════════════════════════════ */}
      {tab === "discovered" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">
              Routers that called home using an enrollment script. Review the
              interface list and approve to create a managed device.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchDiscovered}
              disabled={discoveredLoading}
              className="flex items-center gap-1"
            >
              <RefreshCw
                className={`w-3 h-3 ${discoveredLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>

          {discoveredLoading && discovered.length === 0 && (
            <div className="text-center py-12 text-zinc-500">
              <RefreshCw className="w-8 h-8 mx-auto animate-spin mb-3" />
              Checking for discovered routers…
            </div>
          )}

          {!discoveredLoading && discovered.length === 0 && (
            <Card className="border-zinc-800">
              <CardContent className="py-16 text-center">
                <Radio className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-400">
                  No routers have called home yet.
                </p>
                <p className="text-zinc-500 text-sm mt-1">
                  Generate an onboarding script and run it on a MikroTik router.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => setTab("enroll")}
                >
                  <Zap className="w-3 h-3 mr-2" /> Generate One-Command Script
                </Button>
              </CardContent>
            </Card>
          )}

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-purple-800/40 bg-purple-900/10">
              <span className="text-sm text-zinc-300">
                {selectedIds.size} router{selectedIds.size > 1 ? "s" : ""}{" "}
                selected
              </span>
              <div className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBatchConfig(true)}
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Batch Approve
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </Button>
            </div>
          )}

          {showBatchConfig && (
            <Card className="border-purple-800/40 bg-purple-900/5">
              <CardContent className="p-4">
                <h3 className="text-sm font-medium text-white mb-3">
                  Batch Approve {selectedIds.size} Router
                  {selectedIds.size > 1 ? "s" : ""}
                </h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <Label className="text-xs">Mgmt Username</Label>
                    <Input
                      value={batchConfig.mgmt_username}
                      onChange={(e) =>
                        setBatchConfig((p) => ({
                          ...p,
                          mgmt_username: e.target.value,
                        }))
                      }
                      placeholder="admin"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Mgmt Password</Label>
                    <Input
                      type="password"
                      value={batchConfig.mgmt_password}
                      onChange={(e) =>
                        setBatchConfig((p) => ({
                          ...p,
                          mgmt_password: e.target.value,
                        }))
                      }
                      placeholder="password"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">WAN Interface</Label>
                    <Input
                      value={batchConfig.wan_interface}
                      onChange={(e) =>
                        setBatchConfig((p) => ({
                          ...p,
                          wan_interface: e.target.value,
                        }))
                      }
                      placeholder="ether1"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">LAN Bridge</Label>
                    <Input
                      value={batchConfig.lan_interface}
                      onChange={(e) =>
                        setBatchConfig((p) => ({
                          ...p,
                          lan_interface: e.target.value,
                        }))
                      }
                      placeholder="bridge1"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowBatchConfig(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={submitBatchApprove}
                    disabled={batchApproving}
                  >
                    {batchApproving ? (
                      <>
                        <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                        Approving…
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Approve All
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {discovered.map((dr) => (
            <DiscoveredRouterCard
              key={dr.id}
              router={dr}
              selected={selectedIds.has(dr.id)}
              onToggle={() => toggleSelected(dr.id)}
              onApprove={() => {
                openApproval(dr);
                setSelectedIds(new Set());
              }}
              onDelete={() => deleteDiscoveredRouter(dr.id)}
            />
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB 3 — Managed Devices
      ══════════════════════════════════════════════════════════════ */}
      {tab === "managed" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">
              Approved and provisioned MikroTik routers.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchDevices}
                disabled={devLoading}
              >
                <RefreshCw
                  className={`w-3 h-3 mr-1 ${devLoading ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add Manually
              </Button>
            </div>
          </div>

          {devLoading && devices.length === 0 && (
            <div className="text-center py-12 text-zinc-500">
              <RefreshCw className="w-8 h-8 mx-auto animate-spin mb-3" />
              Loading devices…
            </div>
          )}

          {!devLoading && devices.length === 0 && (
            <Card className="border-zinc-800">
              <CardContent className="py-16 text-center">
                <Router className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-400">No managed devices yet.</p>
                <p className="text-zinc-500 text-sm mt-1">
                  Approve a discovered router or add one manually.
                </p>
                <div className="flex justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTab("discovered")}
                  >
                    <Radio className="w-3 h-3 mr-2" /> Discovered Routers
                  </Button>
                  <Button size="sm" onClick={() => setShowCreate(true)}>
                    <Plus className="w-3 h-3 mr-2" /> Add Manually
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {devices.map((dev) => (
              <ManagedDeviceCard
                key={dev.id}
                device={dev}
                publicUrl={publicUrl}
                commandLoading={commandLoading}
                onCopyCmd={copyCmd}
                onActivate={activateInBilling}
                onViewScript={viewScript}
                onViewLogs={viewLogs}
                onRegenToken={regenerateToken}
                onDownload={downloadScript}
                onDelete={deleteDevice}
                activationLoading={activationLoading}
              />
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          APPROVE MODAL
      ══════════════════════════════════════════════════════════════ */}
      {approveTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <Card className="w-full max-w-2xl my-8">
            <CardHeader className="border-b border-zinc-800">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    Approve Discovered Router
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {approveTarget.identity || "Unknown"} •{" "}
                    {approveTarget.model || "Unknown model"} •{" "}
                    {approveTarget.source_ip}
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={closeApproval}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              <form onSubmit={submitApproval} className="space-y-5">
                {/* Detected info panel */}
                <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4 text-sm space-y-1">
                  <p className="text-zinc-300 font-medium mb-2">
                    Detected Router Info
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-zinc-500">Identity</span>
                    <span className="text-white">
                      {approveTarget.identity || "—"}
                    </span>
                    <span className="text-zinc-500">Model</span>
                    <span className="text-white">
                      {approveTarget.model || "—"}
                    </span>
                    <span className="text-zinc-500">RouterOS</span>
                    <span className="text-white">
                      {approveTarget.version || "—"}
                    </span>
                    <span className="text-zinc-500">Source IP</span>
                    <span className="text-white">
                      {approveTarget.source_ip || "—"}
                    </span>
                    <span className="text-zinc-500">MAC</span>
                    <span className="text-white font-mono">
                      {approveTarget.primary_mac || "—"}
                    </span>
                    <span className="text-zinc-500">First seen</span>
                    <span className="text-white">
                      {approveTarget.first_seen_at
                        ? new Date(approveTarget.first_seen_at).toLocaleString()
                        : "—"}
                    </span>
                  </div>
                </div>

                {/* Interface port selection */}
                {Array.isArray(approveTarget.interfaces) &&
                  approveTarget.interfaces.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-zinc-300 text-xs uppercase tracking-wider">
                        Select WAN and LAN Ports
                      </Label>
                      <p className="text-xs text-zinc-500">
                        Click <strong className="text-blue-400">WAN</strong> to
                        mark the uplink interface. Tick{" "}
                        <strong className="text-green-400">LAN</strong>{" "}
                        checkboxes for bridge member ports.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                        {approveTarget.interfaces.map((iface) => (
                          <div
                            key={iface.name}
                            className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 p-2.5 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="text-white font-medium truncate">
                                {iface.name}
                              </div>
                              <div className="text-zinc-500 truncate">
                                {iface.type || "interface"} •{" "}
                                <span
                                  className={
                                    iface.running
                                      ? "text-green-400"
                                      : "text-zinc-500"
                                  }
                                >
                                  {iface.running ? "running" : "down"}
                                </span>
                                {iface.mac_address && (
                                  <span className="ml-1 font-mono">
                                    {iface.mac_address}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setApproveForm((p) => ({
                                    ...p,
                                    wan_interface: iface.name,
                                  }))
                                }
                                className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  approveForm.wan_interface === iface.name
                                    ? "bg-blue-600 text-white"
                                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                                }`}
                              >
                                WAN
                              </button>
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={(
                                    approveForm.lan_ports || []
                                  ).includes(iface.name)}
                                  onChange={() =>
                                    toggleApproveLanPort(iface.name)
                                  }
                                  className="accent-green-500"
                                />
                                <span className="text-zinc-400">LAN</span>
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="text-xs text-zinc-500">
                        WAN:{" "}
                        <span className="text-blue-400">
                          {approveForm.wan_interface}
                        </span>
                        {" · "}LAN ports:{" "}
                        <span className="text-green-400">
                          {(approveForm.lan_ports || []).join(", ") ||
                            "none selected"}
                        </span>
                      </div>
                    </div>
                  )}

                {/* Name */}
                <div className="space-y-1">
                  <Label>Device Name *</Label>
                  <Input
                    required
                    value={approveForm.name}
                    onChange={(e) =>
                      setApproveForm((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="Branch-Router-01"
                    className="bg-zinc-900"
                  />
                </div>

                {/* WAN / bridge / LAN ports as text */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>WAN Interface</Label>
                    <Input
                      value={approveForm.wan_interface}
                      onChange={(e) =>
                        setApproveForm((p) => ({
                          ...p,
                          wan_interface: e.target.value,
                        }))
                      }
                      placeholder="ether1"
                      className="bg-zinc-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>LAN Bridge Name</Label>
                    <Input
                      value={approveForm.lan_interface}
                      onChange={(e) =>
                        setApproveForm((p) => ({
                          ...p,
                          lan_interface: e.target.value,
                        }))
                      }
                      placeholder="bridge1"
                      className="bg-zinc-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>LAN Ports</Label>
                    <Input
                      value={(approveForm.lan_ports || []).join(", ")}
                      onChange={(e) =>
                        setApproveForm((p) => ({
                          ...p,
                          lan_ports: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        }))
                      }
                      placeholder="ether2, ether3"
                      className="bg-zinc-900"
                    />
                  </div>
                </div>

                {/* DNS / NTP */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>DNS Servers</Label>
                    <Input
                      value={(approveForm.dns_servers || []).join(", ")}
                      onChange={(e) =>
                        setApproveForm((p) => ({
                          ...p,
                          dns_servers: e.target.value
                            .split(",")
                            .map((s) => s.trim()),
                        }))
                      }
                      placeholder="8.8.8.8, 8.8.4.4"
                      className="bg-zinc-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>NTP Servers</Label>
                    <Input
                      value={(approveForm.ntp_servers || []).join(", ")}
                      onChange={(e) =>
                        setApproveForm((p) => ({
                          ...p,
                          ntp_servers: e.target.value
                            .split(",")
                            .map((s) => s.trim()),
                        }))
                      }
                      placeholder="pool.ntp.org"
                      className="bg-zinc-900"
                    />
                  </div>
                </div>

                {/* RADIUS */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>RADIUS Server IP</Label>
                    <Input
                      value={approveForm.radius_server}
                      onChange={(e) =>
                        setApproveForm((p) => ({
                          ...p,
                          radius_server: e.target.value,
                        }))
                      }
                      placeholder="10.0.0.100"
                      className="bg-zinc-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>RADIUS Secret</Label>
                    <Input
                      type="password"
                      value={approveForm.radius_secret}
                      onChange={(e) =>
                        setApproveForm((p) => ({
                          ...p,
                          radius_secret: e.target.value,
                        }))
                      }
                      placeholder="shared-secret"
                      className="bg-zinc-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>RADIUS Port</Label>
                    <Input
                      type="number"
                      value={approveForm.radius_port}
                      onChange={(e) =>
                        setApproveForm((p) => ({
                          ...p,
                          radius_port: Number(e.target.value),
                        }))
                      }
                      className="bg-zinc-900"
                    />
                  </div>
                </div>

                {/* PPPoE / Hotspot toggles */}
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={approveForm.pppoe_enabled}
                      onCheckedChange={(v) =>
                        setApproveForm((p) => ({ ...p, pppoe_enabled: v }))
                      }
                    />
                    <span className="text-zinc-300 text-sm">PPPoE Server</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={approveForm.hotspot_enabled}
                      onCheckedChange={(v) =>
                        setApproveForm((p) => ({ ...p, hotspot_enabled: v }))
                      }
                    />
                    <span className="text-zinc-300 text-sm">Hotspot</span>
                  </label>
                </div>

                {/* Notes */}
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <textarea
                    value={approveForm.notes}
                    onChange={(e) =>
                      setApproveForm((p) => ({ ...p, notes: e.target.value }))
                    }
                    rows={2}
                    placeholder="Location, contact, etc."
                    className="flex w-full rounded-md border border-input bg-zinc-900 px-3 py-2 text-sm text-white ring-offset-background"
                  />
                </div>

                <div className="flex gap-3 pt-2 border-t border-zinc-800">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeApproval}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={approveLoading}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    {approveLoading ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4 mr-2" />
                    )}
                    {approveLoading ? "Approving…" : "Approve & Create Device"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Manual Create Modal ──────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <Card className="w-full max-w-2xl my-8">
            <CardHeader className="border-b border-zinc-800">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white">
                  Add Device Manually
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowCreate(false);
                    setCreateForm({ ...EMPTY_FORM });
                    setScanResult(null);
                  }}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <CardDescription>
                Alternatively you can first scan the router to auto-detect model
                and interfaces.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <form onSubmit={submitCreate} className="space-y-4">
                {/* credentials for scan */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Router IP / Host *</Label>
                    <Input
                      value={createForm.ip_address}
                      onChange={(e) =>
                        setCreateForm((p) => ({
                          ...p,
                          ip_address: e.target.value,
                        }))
                      }
                      placeholder="192.168.88.1"
                      className="bg-zinc-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>API Port</Label>
                    <Input
                      type="number"
                      value={createForm.mgmt_port}
                      onChange={(e) =>
                        setCreateForm((p) => ({
                          ...p,
                          mgmt_port: Number(e.target.value),
                        }))
                      }
                      className="bg-zinc-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Connection</Label>
                    <select
                      value={createForm.connection_type}
                      onChange={(e) =>
                        setCreateForm((p) => ({
                          ...p,
                          connection_type: e.target.value,
                        }))
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-zinc-900 px-3 py-2 text-sm text-white"
                    >
                      <option value="api">API</option>
                      <option value="ssh">SSH</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Username</Label>
                    <Input
                      value={createForm.mgmt_username}
                      onChange={(e) =>
                        setCreateForm((p) => ({
                          ...p,
                          mgmt_username: e.target.value,
                        }))
                      }
                      placeholder="admin"
                      className="bg-zinc-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Password</Label>
                    <Input
                      type="password"
                      value={createForm.mgmt_password}
                      onChange={(e) =>
                        setCreateForm((p) => ({
                          ...p,
                          mgmt_password: e.target.value,
                        }))
                      }
                      className="bg-zinc-900"
                    />
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={scanRouter}
                  disabled={scanLoading}
                >
                  <RefreshCw
                    className={`w-4 h-4 mr-2 ${scanLoading ? "animate-spin" : ""}`}
                  />
                  {scanLoading ? "Scanning…" : "Scan Router (optional)"}
                </Button>

                {scanResult?.interfaces?.length > 0 && (
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
                    <p className="text-sm text-blue-300 font-medium">
                      {scanResult.interfaces.length} interfaces detected on{" "}
                      {scanResult.identity || scanResult.host}
                      {scanResult.model ? ` (${scanResult.model})` : ""}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                      {scanResult.interfaces.map((iface) => (
                        <div
                          key={iface.name}
                          className="flex items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-900/70 p-2 text-xs"
                        >
                          <div>
                            <div className="text-white font-medium">
                              {iface.name}
                            </div>
                            <div className="text-zinc-500">
                              {iface.type} •{" "}
                              <span
                                className={
                                  iface.running
                                    ? "text-green-400"
                                    : "text-zinc-500"
                                }
                              >
                                {iface.running ? "running" : "down"}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setCreateForm((p) => ({
                                  ...p,
                                  wan_interface: iface.name,
                                }))
                              }
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                createForm.wan_interface === iface.name
                                  ? "bg-blue-600 text-white"
                                  : "bg-zinc-800 text-zinc-400"
                              }`}
                            >
                              WAN
                            </button>
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={(createForm.lan_ports || []).includes(
                                  iface.name,
                                )}
                                onChange={() => toggleCreateLanPort(iface.name)}
                                className="accent-green-500"
                              />
                              <span className="text-zinc-400">LAN</span>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <hr className="border-zinc-800" />

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Name *</Label>
                    <Input
                      required
                      value={createForm.name}
                      onChange={(e) =>
                        setCreateForm((p) => ({ ...p, name: e.target.value }))
                      }
                      placeholder="Branch-Router-01"
                      className="bg-zinc-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Identity</Label>
                    <Input
                      value={createForm.identity}
                      onChange={(e) =>
                        setCreateForm((p) => ({
                          ...p,
                          identity: e.target.value,
                        }))
                      }
                      placeholder="MY-ROUTER"
                      className="bg-zinc-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>WAN Interface</Label>
                    <Input
                      value={createForm.wan_interface}
                      onChange={(e) =>
                        setCreateForm((p) => ({
                          ...p,
                          wan_interface: e.target.value,
                        }))
                      }
                      className="bg-zinc-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>LAN Bridge</Label>
                    <Input
                      value={createForm.lan_interface}
                      onChange={(e) =>
                        setCreateForm((p) => ({
                          ...p,
                          lan_interface: e.target.value,
                        }))
                      }
                      className="bg-zinc-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>LAN Ports</Label>
                    <Input
                      value={(createForm.lan_ports || []).join(", ")}
                      onChange={(e) =>
                        setCreateForm((p) => ({
                          ...p,
                          lan_ports: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        }))
                      }
                      placeholder="ether2, ether3"
                      className="bg-zinc-900"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2 border-t border-zinc-800">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCreate(false);
                      setCreateForm({ ...EMPTY_FORM });
                      setScanResult(null);
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createLoading}
                    className="flex-1"
                  >
                    {createLoading ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    {createLoading ? "Creating…" : "Create Device"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Script Preview Modal ──────────────────────────────────────── */}
      {showScript && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-4xl max-h-[85vh] flex flex-col">
            <CardHeader className="border-b border-zinc-800 shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Code className="w-5 h-5 text-green-500" /> Provision Script:{" "}
                  {showScript.name}
                </CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => downloadScript(showScript)}>
                    <Download className="w-4 h-4 mr-1" /> Download
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowScript(null)}
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-5">
              <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap leading-relaxed">
                {showScript.content}
              </pre>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Logs Modal ───────────────────────────────────────────────── */}
      {showLogs && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-3xl max-h-[85vh] flex flex-col">
            <CardHeader className="border-b border-zinc-800 shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle>Provision Logs: {showLogs.name}</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLogs(null)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4">
              {logs.length === 0 ? (
                <p className="text-zinc-500 text-center py-8">
                  No provisioning logs yet.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-400 border-b border-zinc-800">
                      {["Time", "Action", "Status", "IP", "Details"].map(
                        (h) => (
                          <th key={h} className="text-left p-2">
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b border-zinc-800/50">
                        <td className="p-2 text-zinc-400 text-xs">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="p-2 text-white">{log.action}</td>
                        <td className="p-2">
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${
                              log.status === "success"
                                ? "bg-green-600/20 text-green-400"
                                : "bg-red-600/20 text-red-400"
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="p-2 text-zinc-300 font-mono text-xs">
                          {log.ip_address}
                        </td>
                        <td className="p-2 text-zinc-400 text-xs">
                          {log.details}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── DiscoveredRouterCard ────────────────────────────────────────────────────

function DiscoveredRouterCard({
  router,
  onApprove,
  onDelete,
  selected,
  onToggle,
}) {
  const [expanded, setExpanded] = useState(false);
  const interfaces = Array.isArray(router.interfaces) ? router.interfaces : [];
  const addresses = Array.isArray(router.ip_addresses)
    ? router.ip_addresses
    : [];
  const isApproved = router.status === "approved";

  return (
    <Card
      className={`border-zinc-800 ${isApproved ? "opacity-60" : ""} ${selected ? "ring-2 ring-purple-500/50" : ""}`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {!isApproved && onToggle && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle();
                }}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  selected
                    ? "bg-purple-500 border-purple-500"
                    : "border-zinc-600 hover:border-zinc-400"
                }`}
              >
                {selected && <CheckCircle2 className="w-4 h-4 text-white" />}
              </button>
            )}
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isApproved ? "bg-blue-600/20" : "bg-purple-600/20"
              }`}
            >
              <Router
                className={`w-5 h-5 ${isApproved ? "text-blue-400" : "text-purple-400"}`}
              />
            </div>
            <div className="min-w-0">
              <div className="text-white font-semibold truncate">
                {router.identity || "Unknown Router"}
              </div>
              <div className="text-zinc-400 text-xs truncate">
                {router.model || "Unknown model"} • {router.version || "—"} •{" "}
                {router.source_ip || "—"}
              </div>
              {router.primary_mac && (
                <div className="text-zinc-500 text-xs font-mono">
                  {router.primary_mac}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`px-2 py-1 rounded text-xs font-medium ${statusColor(router.status)}`}
            >
              {router.status === "discovered"
                ? "⏳ Awaiting approval"
                : "✓ Approved"}
            </span>
            {!isApproved && (
              <Button
                size="sm"
                onClick={onApprove}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle className="w-3 h-3 mr-1" /> Approve
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={onDelete}
              className="text-red-400 border-red-400/30 hover:bg-red-400/10"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* Meta row */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
          <span>
            <Clock className="w-3 h-3 inline mr-0.5" />
            First seen:{" "}
            {router.first_seen_at
              ? new Date(router.first_seen_at).toLocaleString()
              : "—"}
          </span>
          <span>
            <Wifi className="w-3 h-3 inline mr-0.5" />
            Last seen:{" "}
            {router.last_seen_at
              ? new Date(router.last_seen_at).toLocaleString()
              : "—"}
          </span>
          {router.suggested_wan_interface && (
            <span className="text-blue-400">
              WAN suggestion: {router.suggested_wan_interface}
            </span>
          )}
          {Array.isArray(router.suggested_lan_ports) &&
            router.suggested_lan_ports.length > 0 && (
              <span className="text-green-400">
                LAN suggestion: {router.suggested_lan_ports.join(", ")}
              </span>
            )}
        </div>

        {/* Expand / collapse interfaces */}
        {(interfaces.length > 0 || addresses.length > 0) && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 text-xs text-zinc-400 hover:text-white flex items-center gap-1"
          >
            {expanded ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
            {interfaces.length} interface{interfaces.length !== 1 ? "s" : ""}
            {addresses.length > 0 &&
              `, ${addresses.length} IP address${addresses.length !== 1 ? "es" : ""}`}
          </button>
        )}

        {expanded && (
          <div className="mt-3 space-y-3">
            {interfaces.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {interfaces.map((iface, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/60 p-2 text-xs"
                  >
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        iface.running ? "bg-green-400" : "bg-zinc-600"
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-white font-medium truncate">
                        {iface.name}
                      </div>
                      <div className="text-zinc-500 truncate">
                        {iface.type || "interface"}
                        {iface.mac_address && ` • ${iface.mac_address}`}
                      </div>
                    </div>
                    {iface.disabled && (
                      <span className="ml-auto text-zinc-600 shrink-0">
                        disabled
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {addresses.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-zinc-500 uppercase tracking-wider">
                  IP Addresses
                </p>
                <div className="flex flex-wrap gap-2">
                  {addresses.map((addr, idx) => (
                    <span
                      key={idx}
                      className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded font-mono"
                    >
                      {addr.address}
                      {addr.interface && (
                        <span className="text-zinc-500 ml-1">
                          on {addr.interface}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── ManagedDeviceCard ───────────────────────────────────────────────────────

function ManagedDeviceCard({
  device: dev,
  publicUrl,
  commandLoading,
  onCopyCmd,
  onActivate,
  onViewScript,
  onViewLogs,
  onRegenToken,
  onDownload,
  onDelete,
  activationLoading,
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="overflow-hidden border-zinc-800">
      {/* Header */}
      <CardHeader className="border-b border-zinc-800 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Router className="w-6 h-6 text-blue-400 shrink-0" />
            <div className="min-w-0">
              <CardTitle className="text-base text-white truncate">
                {dev.name}
              </CardTitle>
              <CardDescription className="text-xs truncate">
                {dev.identity || dev.name} • {dev.model || "Unknown"}
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(dev.provision_status)}`}
            >
              {dev.provision_status === "provisioned"
                ? "✓ Provisioned"
                : "⏳ Pending"}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                dev.linked_mikrotik_connection_id
                  ? "bg-blue-600/20 text-blue-400"
                  : "bg-zinc-700 text-zinc-400"
              }`}
            >
              {dev.linked_mikrotik_connection_id
                ? "Linked to Billing"
                : "Not Linked"}
            </span>
          </div>
        </div>
      </CardHeader>

      {/* Zero-Touch Command */}
      <CardContent className="p-4 bg-zinc-900/40 space-y-2">
        <p className="text-xs text-zinc-500 uppercase tracking-wider flex items-center gap-1">
          <Zap className="w-3 h-3" /> Zero-Touch Command
        </p>
        <pre className="text-xs text-green-400 bg-zinc-900 p-3 rounded border border-zinc-700 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
          {commandLoading[dev.id]
            ? "Generating…"
            : `/tool fetch mode=https check-certificate=no url="${publicUrl.replace(/\/$/, "")}/mikrotik/provision/${dev.provision_token}" dst-path=provision.rsc; /import file-name=provision.rsc`}
        </pre>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const cmd = `/tool fetch mode=https check-certificate=no url="${publicUrl.replace(/\/$/, "")}/mikrotik/provision/${dev.provision_token}" dst-path=provision.rsc; /import file-name=provision.rsc`;
              navigator.clipboard.writeText(cmd);
              onCopyCmd(cmd);
            }}
            className="text-xs"
          >
            <Copy className="w-3 h-3 mr-1" /> Copy Command
          </Button>
          {dev.linked_mikrotik_connection_id ? (
            <span className="flex items-center gap-1 text-xs text-blue-400 px-2">
              <CheckCircle className="w-3 h-3" /> Linked
            </span>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onActivate(dev)}
              disabled={activationLoading[dev.id]}
              className="text-xs"
            >
              <Link2 className="w-3 h-3 mr-1" />
              {activationLoading[dev.id] ? "Linking..." : "Link to Billing"}
            </Button>
          )}
        </div>
      </CardContent>

      {/* Settings summary (collapsible) */}
      <CardContent className="p-4 border-t border-zinc-800">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-white"
        >
          <span>Settings</span>
          {expanded ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>

        {expanded && (
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {[
              ["WAN", dev.wan_interface],
              ["LAN Bridge", dev.lan_interface || "bridge1"],
              [
                "LAN Ports",
                dev.lan_ports?.length ? dev.lan_ports.join(", ") : "—",
              ],
              ["DNS", dev.dns_servers?.join(", ") || "—"],
              ["PPPoE", dev.pppoe_enabled ? "Enabled" : "Disabled"],
              ["Hotspot", dev.hotspot_enabled ? "Enabled" : "Disabled"],
              ["RADIUS", dev.radius_server || "Not set"],
              ["Router IP", dev.ip_address || "Not set"],
              ["Mgmt User", dev.mgmt_username || "Not set"],
              [
                "Last Provisioned",
                dev.last_provisioned_at
                  ? new Date(dev.last_provisioned_at).toLocaleString()
                  : "Never",
              ],
            ].map(([label, value]) => (
              <React.Fragment key={label}>
                <span className="text-zinc-500">{label}</span>
                <span className="text-white truncate">{value}</span>
              </React.Fragment>
            ))}
          </div>
        )}

        {dev.billing_activation_error && (
          <div className="mt-3 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300 flex items-start gap-1.5">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            {dev.billing_activation_error}
          </div>
        )}
      </CardContent>

      {/* Actions */}
      <CardContent className="p-3 border-t border-zinc-800 flex flex-wrap gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewScript(dev)}
          className="text-xs"
        >
          <Eye className="w-3 h-3 mr-1" /> Preview
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewLogs(dev)}
          className="text-xs"
        >
          <FileText className="w-3 h-3 mr-1" /> Logs
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDownload(dev)}
          className="text-xs text-green-400"
        >
          <Download className="w-3 h-3 mr-1" /> .rsc
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRegenToken(dev.id)}
          className="text-xs text-amber-400"
        >
          <RefreshCw className="w-3 h-3 mr-1" /> New Token
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDelete(dev.id)}
          className="text-xs text-red-400 ml-auto"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </CardContent>
    </Card>
  );
}
