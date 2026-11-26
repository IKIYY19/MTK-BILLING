import { useState, useEffect } from "react";
import axios from "axios";
import {
  Eye, Save, Download, Upload, RefreshCw, Check, Copy,
  Wifi, Coffee, Zap, ShoppingBag, Hotel, Building2, Plane,
  Smartphone, Monitor, Palette, Settings, Plus, Trash2, X,
  Sun, Moon, Cloud, Sparkles, Waves, Flame, Leaf, Stars,
  Heart, Diamond, Gem, Glasses, Crown, ChevronDown, ChevronUp, Activity,
  Router,
} from "lucide-react";
import { useToastStore } from "../../stores/toastStore";
import HotspotSessionsPanel from "./HotspotSessionsPanel";
import "../../captive-builder.css";

const API = import.meta.env.VITE_API_URL || "/api";

const HOTSPOT_TEMPLATES = [
  { id: "aurora",     name: "Aurora",     icon: Sparkles, desc: "Cyan and violet glass", accent: "#22d3ee", colors: { bg: "#070b16", bg2: "#0f172a", bg3: "#111827", accent: "#22d3ee", card: "rgba(20,29,49,0.86)", text: "#e8eef9", border: "rgba(103,232,249,0.2)", inputBg: "rgba(34,211,238,0.06)", glow: "0 0 40px rgba(34,211,238,0.2)", cardBlur: "26px" } },
  { id: "sunrise",    name: "Sunrise",    icon: Sun,      desc: "Warm orange and coral", accent: "#fb923c", colors: { bg: "#140b08", bg2: "#2a110c", bg3: "#35160f", accent: "#fb923c", card: "rgba(30,15,10,0.86)", text: "#ffedd5", border: "rgba(251,146,60,0.2)", inputBg: "rgba(251,146,60,0.06)", glow: "0 0 40px rgba(251,146,60,0.2)", cardBlur: "26px" } },
  { id: "lagoon",     name: "Lagoon",     icon: Waves,     desc: "Teal and emerald glow", accent: "#2dd4bf", colors: { bg: "#051310", bg2: "#08251d", bg3: "#0b2f25", accent: "#2dd4bf", card: "rgba(8,30,25,0.86)", text: "#ccfbf1", border: "rgba(45,212,191,0.2)", inputBg: "rgba(45,212,191,0.06)", glow: "0 0 40px rgba(45,212,191,0.2)", cardBlur: "26px" } },
  { id: "neon",       name: "Neon",       icon: Zap,       desc: "Purple and pink electric", accent: "#c084fc", colors: { bg: "#0c0620", bg2: "#180a35", bg3: "#220d45", accent: "#c084fc", card: "rgba(24,10,53,0.86)", text: "#f3e8ff", border: "rgba(192,132,252,0.25)", inputBg: "rgba(192,132,252,0.07)", glow: "0 0 45px rgba(192,132,252,0.25)", cardBlur: "28px" } },
  { id: "monochrome", name: "Monochrome", icon: Diamond,   desc: "Clean grayscale", accent: "#e5e5e5", colors: { bg: "#0a0a0b", bg2: "#17171a", bg3: "#202024", accent: "#e5e5e5", card: "rgba(20,20,22,0.86)", text: "#f5f5f5", border: "rgba(255,255,255,0.16)", inputBg: "rgba(255,255,255,0.05)", glow: "0 0 30px rgba(255,255,255,0.08)", cardBlur: "24px" } },
];

function isAllowedPortalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.username || url.password) {return false;}
    if (url.protocol === "https:") {return true;}
    if (url.protocol !== "http:") {return false;}
    const host = url.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" ||
      /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
  } catch {
    return false;
  }
}

function generatePortalHTML({ companyName, routerId, portalUrl, theme, welcomeText, phoneNumber, font, termsEnabled, termsText, logoUrl = "" }) {
  const company = String(companyName || "Giraffe Hotspot").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
  let hostedPortal;
  try {
    hostedPortal = new URL(portalUrl || "");
  } catch {
    hostedPortal = null;
  }
  if (hostedPortal) {
    if (theme) {hostedPortal.searchParams.set("theme", theme);}
    if (logoUrl) {hostedPortal.searchParams.set("logo_url", logoUrl);}
    if (welcomeText) {hostedPortal.searchParams.set("welcome", welcomeText);}
    if (phoneNumber) {hostedPortal.searchParams.set("support", phoneNumber);}
    if (font) {hostedPortal.searchParams.set("font", font);}
    if (String(termsEnabled) === "true" && termsText) {hostedPortal.searchParams.set("terms", termsText);}
  }
  const hostname = (hostedPortal?.hostname || "").toLowerCase();
  const privateHost =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" ||
    /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname);
  const localHttp = hostedPortal?.protocol === "http:" && privateHost;
  if (!routerId || !hostedPortal || !["https:", "http:"].includes(hostedPortal.protocol) ||
      hostedPortal.username || hostedPortal.password ||
      hostedPortal.protocol === "http:" && !localHttp) {
    return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${company} Wi-Fi</title><body style="font:16px system-ui;background:#09090b;color:#f4f4f5;min-height:100vh;display:grid;place-items:center;margin:0;padding:24px"><main style="max-width:420px"><h1>Portal setup required</h1><p>Select a router and provide the public HTTPS URL for the hosted hotspot page in Captive Portal Builder.</p></main></body></html>`;
  }
  const escapeAttribute = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
  const directPortal = new URL(hostedPortal.toString());
  directPortal.searchParams.set("router_id", routerId);
  directPortal.searchParams.set("brand", companyName || "Giraffe Hotspot");
  directPortal.searchParams.set("welcome", welcomeText || `Welcome to ${companyName || "Giraffe Hotspot"}`);
  if (logoUrl) {directPortal.searchParams.set("logo_url", logoUrl);}
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta http-equiv="refresh" content="3;url=${escapeAttribute(directPortal.toString())}">
  <title>${company} Wi-Fi</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#09090b;color:#f4f4f5;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
    main{width:min(100%,420px);padding:28px;border:1px solid #3f3f46;background:#18181b}
    h1{margin:0 0 8px;font-size:24px;line-height:1.2}p{margin:0;color:#d4d4d8}
  </style>
</head>
<body>
  <main role="status" aria-live="polite">
    <h1>${company}</h1>
    <p>Opening the secure Wi-Fi access page&hellip;</p>
    <a href="${escapeAttribute(directPortal.toString())}" style="display:block;margin:14px 0;padding:13px;border-radius:10px;background:#6366f1;color:#fff;font-weight:600;text-decoration:none">Open packages now</a>
    <form id="portal-handoff" action="${escapeAttribute(hostedPortal.toString())}" method="get">
      <input type="hidden" name="router_id" value="${escapeAttribute(routerId)}">
      <input type="hidden" name="brand" value="${escapeAttribute(companyName || "Giraffe Hotspot")}">
      <input type="hidden" name="welcome" value="${escapeAttribute(welcomeText || `Welcome to ${companyName || "Giraffe Hotspot"}`)}">
      <input type="hidden" name="mac" value="$(mac)">
      <input type="hidden" name="ip" value="$(ip)">
      <input type="hidden" name="link_login_only" value="$(link-login-only)">
      <input type="hidden" name="original_url" value="$(link-orig)">
      <button type="submit" style="width:100%;margin-top:12px;padding:13px;border:0;border-radius:10px;background:#3f3f46;color:#fff;font-weight:600">Continue with this device</button>
    </form>
  </main>
  <script>
    (function () {
      var params = new URLSearchParams(window.location.search);
      var fields = ["router_id", "brand", "welcome", "mac", "ip", "link_login_only", "original_url"];
      fields.forEach(function (key) {
        var value = params.get(key) || params.get(key.replace(/_/g, "-"));
        var input = document.querySelector('input[name="' + key + '"]');
        if (value && input && (!input.value || input.value.indexOf("$(") === 0)) {
          input.value = value;
        }
      });
      setTimeout(function () {
        var form = document.getElementById("portal-handoff");
        if (form) { form.submit(); }
      }, 1500);
    })();
  </script>
</body>
</html>`;

}

/* ── small helpers ── */
function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function DarkInput({ value, onChange, placeholder, type = "text", className = "" }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full bg-zinc-800/60 border border-zinc-700/50 hover:border-zinc-600/50 focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none transition-all ${className}`}
    />
  );
}

export default function CaptivePortalBuilder() {
  const addToast = useToastStore((state) => state.addToast);
  const toast = {
    success: (msg) => addToast("success", msg, "", 3000),
    error:   (msg) => addToast("error",   msg, "", 4000),
  };

  const [selectedTemplate, setSelectedTemplate] = useState(() => localStorage.getItem("portal_theme") || "aurora");
  const [companyName,   setCompanyName]   = useState(() => localStorage.getItem("portal_company")  || "");
  const [welcomeText,   setWelcomeText]   = useState(() => localStorage.getItem("portal_welcome")  || "");
  const [logoUrl,       setLogoUrl]       = useState(() => localStorage.getItem("portal_logo")     || "");
  const [primaryColor,  setPrimaryColor]  = useState(() => localStorage.getItem("portal_color")    || "");
  const [phoneNumber,   setPhoneNumber]   = useState(() => localStorage.getItem("portal_phone")    || "");
  const [showTerms,     setShowTerms]     = useState(true);
  const [previewMode,   setPreviewMode]   = useState("desktop");
  const [previewTarget, setPreviewTarget] = useState("portal");
  const [connections,   setConnections]   = useState([]);
  const [selectedConn,  setSelectedConn]  = useState("");
  const [pushing,       setPushing]       = useState(false);
  const [copied,        setCopied]        = useState(false);
  const [savedPortals,  setSavedPortals]  = useState([]);
  const [portalUrl, setPortalUrl] = useState(() => localStorage.getItem("portal_hosted_url") || `${import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin}/hotspot`);
  const [activeView, setActiveView] = useState("builder");
  const [policySettings, setPolicySettings] = useState({});

  useEffect(() => {
    axios.get(`${API}/mikrotik`).then(r => setConnections(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    axios.get(`${API}/resellers/captive-portals`).then(r => setSavedPortals(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    axios.get(`${API}/settings`).then(r => setPolicySettings(r.data || {})).catch(() => {});
  }, []);

  const save = (key, val) => localStorage.setItem(key, val);
  const getHtml = () => generatePortalHTML({ templateId: selectedTemplate, companyName, welcomeText: welcomeText || policySettings.portal_welcome, logoUrl, primaryColor, phoneNumber: phoneNumber || policySettings.support_number, showTerms, packages: [], routerId: selectedConn, portalUrl, theme: selectedTemplate, font: policySettings.portal_font, termsEnabled: policySettings.portal_terms_enabled, termsText: policySettings.portal_terms_text });

  const getHostedPreviewUrl = () => {
    try {
      const configured = new URL(portalUrl || `${window.location.origin}/hotspot`);
      const url = configured.host === window.location.host
        ? configured
        : new URL("/hotspot", window.location.origin);
      url.searchParams.set("router_id", selectedConn || connections[0]?.id || "");
      url.searchParams.set("mac", "00:11:22:33:44:55");
      url.searchParams.set("ip", "172.31.0.2");
      url.searchParams.set("gateway_ip", "172.31.0.1");
      url.searchParams.set("link_login_only", "http://172.31.0.1/login");
      url.searchParams.set("original_url", "http://example.com");
      url.searchParams.set("theme", selectedTemplate);
      if (welcomeText) {url.searchParams.set("welcome", welcomeText);}
      if (phoneNumber) {url.searchParams.set("support", phoneNumber);}
      if (policySettings.portal_font) {url.searchParams.set("font", policySettings.portal_font);}
      if (String(policySettings.portal_terms_enabled) === "true" && policySettings.portal_terms_text) {
        url.searchParams.set("terms", policySettings.portal_terms_text);
      }
      return url.toString();
    } catch {
      return `${window.location.origin}/hotspot?theme=${selectedTemplate}&router_id=${selectedConn || connections[0]?.id || ""}&mac=00:11:22:33:44:55&gateway_ip=172.31.0.1&link_login_only=${encodeURIComponent("http://172.31.0.1/login")}`;
    }
  };

  const handlePush = async () => {
    if (!selectedConn) { toast.error("Select a router first"); return; }
    if (!isAllowedPortalUrl(portalUrl)) { toast.error("Enter a valid HTTPS URL, or a local http:// address for this network"); return; }
    setPushing(true);
    try {
      const { data } = await axios.post(`${API}/resellers/captive-portals/push`, { connection_id: selectedConn, html: getHtml(), portal_url: portalUrl, profile: "default", portal_name: companyName || "hotspot-portal" });
      toast.success("Portal pushed", data.walledGarden?.length ? `Walled garden allows ${data.walledGarden.join(", ")}` : data.message);
    } catch (e) { toast.error("Push failed", e.response?.data?.error || e.message); }
    finally { setPushing(false); }
  };

  const handleCopy = () => {
    if (!selectedConn) { toast.error("Select a router to generate its portal handoff"); return; }
    if (!isAllowedPortalUrl(portalUrl)) { toast.error("Enter a valid HTTPS URL, or a local http:// address for this network"); return; }
    navigator.clipboard.writeText(getHtml());
    setCopied(true); setTimeout(() => setCopied(false), 2000);
    toast.success("HTML copied to clipboard");
  };

  const handleDownload = () => {
    if (!selectedConn) { toast.error("Select a router to generate its portal handoff"); return; }
    if (!isAllowedPortalUrl(portalUrl)) { toast.error("Enter a valid HTTPS URL, or a local http:// address for this network"); return; }
    const blob = new Blob([getHtml()], { type: "text/html" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `${(companyName || "hotspot-portal").replace(/\s+/g, "-").toLowerCase()}.html`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  const handleSave = async () => {
    try {
      await axios.post(`${API}/resellers/captive-portals`, { name: companyName || "Untitled", elements: [], styles: {}, html: getHtml() });
      toast.success("Portal saved");
      const { data } = await axios.get(`${API}/resellers/captive-portals`);
      setSavedPortals(Array.isArray(data) ? data : []);
    } catch (e) { toast.error("Save failed"); }
  };

  const activeTpl = HOTSPOT_TEMPLATES.find(t => t.id === selectedTemplate) || HOTSPOT_TEMPLATES[0];

  return (
    <div className="cpb relative min-h-full animate-fade-in">
      <div className="absolute inset-0 bg-mesh pointer-events-none" />
      <div className="absolute inset-0 bg-noise pointer-events-none" />

      {/* ── Top bar ── */}
      <div className="relative border-b border-zinc-800/60 bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-20 px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Wifi className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">
                {activeView === "sessions" ? "Hotspot Sessions" : "Captive Portal Builder"}
              </h1>
              {activeView === "builder" && (
                <p className="text-[11px] text-zinc-500">
                  {activeTpl.name} &middot; {HOTSPOT_TEMPLATES.length} themes &middot; live preview
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/60 p-1" role="group" aria-label="Captive portal views">
            <button
              type="button"
              onClick={() => setActiveView("builder")}
              aria-pressed={activeView === "builder"}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 ${
                activeView === "builder"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              <Palette className="h-3.5 w-3.5" />
              Portal builder
            </button>
            <button
              type="button"
              onClick={() => setActiveView("sessions")}
              aria-pressed={activeView === "sessions"}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 ${
                activeView === "sessions"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              Sessions
            </button>
          </div>
          {activeView === "builder" && <div className="flex flex-wrap items-center gap-2">
            <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700/40 transition-all">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy HTML"}
            </button>
            <button onClick={handleDownload} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700/40 transition-all">
              <Download className="w-3.5 h-3.5" /> Download
            </button>
            <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700/40 transition-all">
              <Save className="w-3.5 h-3.5" /> Save
            </button>
            <button
              onClick={handlePush}
              disabled={pushing || !selectedConn}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-white transition-all shadow-lg shadow-amber-600/20"
            >
              {pushing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Push to Router
            </button>
          </div>}
        </div>
      </div>

      {activeView === "sessions" ? (
        <div className="relative max-w-7xl mx-auto p-4 sm:p-6">
          <HotspotSessionsPanel />
        </div>
      ) : <div className="relative max-w-7xl mx-auto p-4 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* ── Left panel ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Template picker */}
            <div className="glass rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center gap-2">
                <Palette className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">Theme</h3>
                <span className="ml-auto text-[11px] text-zinc-500">{activeTpl.name}</span>
              </div>
              <div className="p-3 grid grid-cols-4 gap-2">
                {HOTSPOT_TEMPLATES.map(tpl => (
                  <button
                    key={tpl.id}
                    onClick={() => { setSelectedTemplate(tpl.id); save("portal_theme", tpl.id); }}
                    title={tpl.name}
                    className={`relative flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all group ${
                      selectedTemplate === tpl.id
                        ? "border-amber-500/60 bg-amber-500/8"
                        : "border-zinc-800/50 hover:border-zinc-700/50 hover:bg-zinc-800/30"
                    }`}
                  >
                    {/* colour swatch */}
                    <div className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${tpl.accent}44, ${tpl.accent}11)` }}>
                      <tpl.icon className="w-4 h-4" style={{ color: tpl.accent }} />
                    </div>
                    <span className="text-[10px] text-zinc-400 group-hover:text-zinc-200 leading-tight text-center line-clamp-1">{tpl.name}</span>
                    {tpl.type === "premium" && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center">
                        <span className="text-[7px] font-black text-black">✦</span>
                      </span>
                    )}
                    {selectedTemplate === tpl.id && (
                      <span className="absolute bottom-1 right-1 w-2 h-2 bg-amber-400 rounded-full" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Customise */}
            <div className="glass rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center gap-2">
                <Settings className="w-4 h-4 text-zinc-400" />
                <h3 className="text-sm font-semibold text-white">Customise</h3>
              </div>
              <div className="p-4 space-y-3">
                <Field label="Company Name">
                  <DarkInput value={companyName} onChange={e => { setCompanyName(e.target.value); save("portal_company", e.target.value); }} placeholder="My WiFi" />
                </Field>
                <Field label="Hosted Payment Portal URL (HTTPS)">
                  <DarkInput
                    value={portalUrl}
                    onChange={e => { setPortalUrl(e.target.value); save("portal_hosted_url", e.target.value); }}
                    placeholder="https://billing.example.com/hotspot"
                  />
                </Field>
                <Field label="Welcome Message">
                  <DarkInput value={welcomeText} onChange={e => { setWelcomeText(e.target.value); save("portal_welcome", e.target.value); }} placeholder="Welcome to our free WiFi" />
                </Field>
                <Field label="Logo URL">
                  <DarkInput value={logoUrl} onChange={e => { setLogoUrl(e.target.value); save("portal_logo", e.target.value); }} placeholder="https://…/logo.png" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Accent Colour">
                    <input
                      type="color"
                      value={primaryColor || activeTpl.accent}
                      onChange={e => { setPrimaryColor(e.target.value); save("portal_color", e.target.value); }}
                      className="w-full h-9 rounded-lg border border-zinc-700/50 cursor-pointer bg-transparent"
                    />
                  </Field>
                  <Field label="Support Phone">
                    <DarkInput value={phoneNumber} onChange={e => { setPhoneNumber(e.target.value); save("portal_phone", e.target.value); }} placeholder="0712 345 678" />
                  </Field>
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer group">
                  <div className={`w-8 h-4.5 rounded-full transition-colors relative ${showTerms ? "bg-amber-500" : "bg-zinc-700"}`} onClick={() => setShowTerms(!showTerms)}>
                    <span className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-all ${showTerms ? "left-4" : "left-0.5"}`} />
                  </div>
                  <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors select-none" onClick={() => setShowTerms(!showTerms)}>Show "Accept Terms" checkbox</span>
                </label>
              </div>
            </div>

            <div className="glass rounded-2xl overflow-hidden">
              <div className="p-4">
                <h3 className="text-sm font-semibold text-white">Live packages</h3>
                <p className="mt-2 text-xs leading-5 text-zinc-400">
                  The hosted sign-in page loads active hotspot packages from Billing Plans. Create or edit packages there; no sample prices are embedded in the router portal.
                </p>
              </div>
            </div>

            {/* Push to router */}
            {connections.length > 0 && (
              <div className="glass rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center gap-2">
                  <Router className="w-4 h-4 text-zinc-400" />
                  <h3 className="text-sm font-semibold text-white">Push to Router</h3>
                </div>
                <div className="p-4">
                  <select
                    value={selectedConn}
                    onChange={e => setSelectedConn(e.target.value)}
                    className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/60 transition-all"
                  >
                    <option value="">Select router…</option>
                    {connections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.ip_address})</option>)}
                  </select>
                  <p className="mt-3 text-xs leading-5 text-zinc-400">
                    Allow the hosted portal and API domains in the router Hotspot Walled Garden so guests can load packages and start payment before login.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Preview ── */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="preview-note px-4 py-3">
              This preview shows the hosted sign-in page with your selected theme. The handoff page is only the small bridge that RouterOS serves at login.
            </div>
            <div className="glass rounded-2xl overflow-hidden flex flex-col">
              {/* preview toolbar */}
              <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">Live Preview</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400">live</span>
                </div>
                <div className="flex gap-1 bg-zinc-800/60 rounded-lg p-0.5">
                  <button
                    onClick={() => setPreviewTarget("portal")}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${previewTarget === "portal" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                  >Hosted portal</button>
                  <button
                    onClick={() => setPreviewTarget("handoff")}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${previewTarget === "handoff" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                  >Handoff page</button>
                </div>
                <div className="flex gap-1 bg-zinc-800/60 rounded-lg p-0.5">
                  <button
                    onClick={() => setPreviewMode("mobile")}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${previewMode === "mobile" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                  >
                    <Smartphone className="w-3.5 h-3.5" /> Mobile
                  </button>
                  <button
                    onClick={() => setPreviewMode("desktop")}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${previewMode === "desktop" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                  >
                    <Monitor className="w-3.5 h-3.5" /> Desktop
                  </button>
                </div>
              </div>

              {/* device chrome */}
              <div className="bg-zinc-950/80 p-4 flex justify-center items-start min-h-[600px]">
                {previewMode === "mobile" ? (
                  <div className="relative w-[320px]">
                    {/* phone frame */}
                    <div className="relative bg-zinc-900 rounded-[36px] border-2 border-zinc-700 shadow-2xl overflow-hidden" style={{ height: "640px" }}>
                      {/* notch */}
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-zinc-900 rounded-b-2xl z-10 flex items-center justify-center">
                        <div className="w-8 h-1.5 bg-zinc-700 rounded-full" />
                      </div>
                      <iframe
                        src={previewTarget === "portal" ? getHostedPreviewUrl() : undefined}
                        srcDoc={previewTarget === "handoff" ? getHtml() : undefined}
                        className="w-full h-full border-0"
                        title="Portal Preview Mobile"
                        sandbox="allow-scripts allow-forms allow-same-origin"
                        style={{ marginTop: "20px", height: "calc(100% - 20px)" }}
                      />
                    </div>
                    {/* home bar */}
                    <div className="mt-3 flex justify-center">
                      <div className="w-20 h-1 bg-zinc-600 rounded-full" />
                    </div>
                  </div>
                ) : (
                  <div className="w-full">
                    {/* browser chrome */}
                    <div className="bg-zinc-800 rounded-t-xl border border-zinc-700/50 px-3 py-2 flex items-center gap-2">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-rose-500/60" />
                        <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                        <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
                      </div>
                      <div className="flex-1 bg-zinc-700/50 rounded-md px-3 py-1 text-[11px] text-zinc-500 truncate">
                        {previewTarget === "portal" ? getHostedPreviewUrl() : "192.168.1.1/login"}
                      </div>
                    </div>
                    <div className="border border-t-0 border-zinc-700/50 rounded-b-xl overflow-hidden" style={{ height: "560px" }}>
                      <iframe
                        src={previewTarget === "portal" ? getHostedPreviewUrl() : undefined}
                        srcDoc={previewTarget === "handoff" ? getHtml() : undefined}
                        className="w-full h-full border-0"
                        title="Portal Preview Desktop"
                        sandbox="allow-scripts allow-forms allow-same-origin"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Saved portals */}
            {savedPortals.length > 0 && (
              <div className="glass rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800/50">
                  <h3 className="text-sm font-semibold text-white">Saved Portals ({savedPortals.length})</h3>
                </div>
                <div className="p-4 flex gap-2 overflow-x-auto pb-2">
                  {savedPortals.map(p => (
                    <div key={p.id} className="shrink-0 w-44 p-3 rounded-xl bg-zinc-800/30 border border-zinc-800/50 hover:border-zinc-700/50 transition-all cursor-pointer">
                      <p className="text-sm font-medium text-white truncate">{p.name}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{new Date(p.created_at).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>}
    </div>
  );
}
