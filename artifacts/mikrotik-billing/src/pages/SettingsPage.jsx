import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  Clock,
  DollarSign,
  FileText,
  Save,
  Upload,
  X,
  Shield,
  Check,
  X as XIcon,
  CreditCard,
  Globe,
  Lock,
  Palette,
  RotateCcw,
  Sun,
  Moon,
  Wifi,
  Plus,
  Download,
  Trash2,
  Bell,
  Webhook,
  MessageCircle,
  Copy,
  ExternalLink,
  Loader2,
} from "lucide-react";
import {
  ROLES,
  FEATURE_ACCESS as DEFAULT_FEATURE_ACCESS,
} from "../lib/permissions";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { useTheme } from "../contexts/ThemeContext";
import { useToastStore } from "../stores/toastStore";

const API = import.meta.env.VITE_API_URL || "/api";

function TwoFactorSetup() {
  const [status, setStatus] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    axios
      .get(`${API}/auth/2fa/status`)
      .then((r) => setStatus(r.data))
      .catch(() => {});
  }, []);

  const handleSetup = async () => {
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/auth/2fa/setup`);
      setQrCode(data.qrCode);
      setMsg({
        type: "info",
        text: "Scan this QR code with Google Authenticator",
      });
    } catch (e) {
      setMsg({ type: "error", text: "Setup failed" });
    }
    setLoading(false);
  };

  const handleEnable = async () => {
    if (code.length !== 6) {return;}
    setLoading(true);
    try {
      await axios.post(`${API}/auth/2fa/enable`, { code });
      setStatus({ enabled: true });
      setQrCode(null);
      setCode("");
      setMsg({ type: "success", text: "2FA enabled successfully!" });
    } catch (e) {
      setMsg({ type: "error", text: "Invalid code" });
    }
    setLoading(false);
  };

  const handleDisable = async () => {
    if (code.length !== 6) {return;}
    setLoading(true);
    try {
      await axios.post(`${API}/auth/2fa/disable`, { code });
      setStatus({ enabled: false });
      setCode("");
      setMsg({ type: "success", text: "2FA disabled" });
    } catch (e) {
      setMsg({ type: "error", text: "Invalid code" });
    }
    setLoading(false);
  };

  if (!status) {return <div className="text-zinc-500 text-sm">Loading...</div>;}

  if (status.enabled) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-emerald-400">
          <Check className="w-5 h-5" />
          <span className="font-semibold">
            Two-factor authentication is enabled
          </span>
        </div>
        <div>
          <Label>Enter code to disable</Label>
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\\D/g, ""))}
              maxLength={6}
              placeholder="000000"
              className="w-32 text-center text-lg tracking-widest"
            />
            <Button
              onClick={handleDisable}
              disabled={code.length !== 6 || loading}
              variant="outline"
              className="text-red-400"
            >
              Disable 2FA
            </Button>
          </div>
        </div>
        {msg && (
          <div
            className={`text-sm ${msg.type === "success" ? "text-emerald-400" : msg.type === "error" ? "text-red-400" : "text-blue-400"}`}
          >
            {msg.text}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!qrCode ? (
        <Button onClick={handleSetup} disabled={loading} className="gap-2">
          <Shield className="w-4 h-4" /> Setup Two-Factor Authentication
        </Button>
      ) : (
        <>
          <div className="bg-white p-4 rounded-lg inline-block">
            <img src={qrCode} alt="QR Code" className="w-48 h-48" />
          </div>
          <p className="text-sm text-zinc-400">
            Scan this QR code with Google Authenticator or Microsoft
            Authenticator
          </p>
          <div>
            <Label>Enter 6-digit code to confirm</Label>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\\D/g, ""))}
                maxLength={6}
                placeholder="000000"
                className="w-32 text-center text-lg tracking-widest"
              />
              <Button
                onClick={handleEnable}
                disabled={code.length !== 6 || loading}
              >
                Enable 2FA
              </Button>
            </div>
          </div>
        </>
      )}
      {msg && (
        <div
          className={`text-sm ${msg.type === "success" ? "text-emerald-400" : msg.type === "error" ? "text-red-400" : "text-blue-400"}`}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}

export function SettingsPage() {
  const { theme, setTheme, mode, setMode, eyeFilter, setEyeFilter, eyeIntensity, setEyeIntensity, themes } = useTheme();
  const [activeTab, setActiveTab] = useState("general");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [testingLdap, setTestingLdap] = useState(false);
  const [ldapTestResult, setLdapTestResult] = useState(null);
  const [settings, setSettings] = useState({
    // General
    company_name: "",
    company_abbreviation: "",
    company_logo: "",
    contact_email: "",
    contact_phone: "",
    address: "",
    city: "",
    country: "",
    // Formatting
    timezone: "Africa/Nairobi",
    currency: "KES",
    currency_symbol: "KES",
    date_format: "DD/MM/YYYY",
    // Invoice
    invoice_prefix: "INV-",
    invoice_start_number: "1001",
    payment_terms: "14",
    tax_rate: "16",
    primary_color: "#3b82f6",
    secondary_color: "#1e293b",
    branding_title: "",
    slack_webhook_url: "",
  });

  const [logoPreview, setLogoPreview] = useState(null);

  // Permissions state
  const [permissions, setPermissions] = useState(DEFAULT_FEATURE_ACCESS);
  const [selectedRole, setSelectedRole] = useState(ROLES.ADMIN);

  // WireGuard state
  const [wireguard, setWireguard] = useState({
    enabled: false,
    server_port: "51820",
    server_private_key: "",
    server_public_key: "",
    server_address: "10.0.0.1",
    server_dns: "1.1.1.1",
    peers: [],
  });

  // Notification settings state
  const [notificationSettings, setNotificationSettings] = useState([]);
  const [notificationSaving, setNotificationSaving] = useState(false);

  const allFeatures = [
    "dashboard",
    "integrations",
    "settings",
    "billing",
    "customers",
    "plans",
    "subscriptions",
    "invoices",
    "payments",
    "wallet",
    "sms",
    "whatsapp",
    "network-map",
    "monitoring",
    "agents",
    "auto-suspend",
    "reports",
    "analytics",
    "pppoe",
    "hotspot",
    "vouchers",
    "network-services",
    "olt",
    "fup",
    "tr069",
    "speedtest",
    "alerts",
    "radius",
    "tickets",
    "captive-portal",
    "bandwidth",
    "resellers",
    "backups",
    "inventory",
    "users",
  ];

  useEffect(() => {
    fetchSettings();
    fetchPermissions();
    fetchWireguard();
    fetchNotificationSettings();
  }, []);

  const fetchPermissions = async () => {
    try {
      const { data } = await axios.get(`${API}/settings/permissions`);
      if (data) {
        setPermissions(data);
      }
    } catch (error) {
      console.error("Failed to fetch permissions:", error);
    }
  };

  const fetchWireguard = async () => {
    try {
      const { data } = await axios.get(`${API}/settings/wireguard`);
      if (data) {
        setWireguard(data);
      }
    } catch (error) {
      console.error("Failed to fetch WireGuard settings:", error);
    }
  };

  const fetchNotificationSettings = async () => {
    try {
      const { data } = await axios.get(`${API}/settings/notifications`);
      if (data) {
        setNotificationSettings(data);
      }
    } catch (error) {
      console.error("Failed to fetch notification settings:", error);
    }
  };

  const testLdap = async () => {
    setTestingLdap(true);
    setLdapTestResult(null);
    try {
      const { data } = await axios.post(`${API}/settings/ldap/test`);
      setLdapTestResult(data);
    } catch (e) {
      setLdapTestResult({ success: false, message: e.response?.data?.error || "Connection test failed" });
    } finally {
      setTestingLdap(false);
    }
  };

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/settings`);
      if (data) {
        setSettings((prev) => ({ ...prev, ...data }));
        if (data.company_logo) {
          setLogoPreview(data.company_logo);
        }
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    }
    setLoading(false);
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result);
        setSettings((prev) => ({ ...prev, company_logo: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setSettings((prev) => ({ ...prev, company_logo: "" }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      await axios.put(`${API}/settings`, settings);
      setMessage({ type: "success", text: "Settings saved successfully" });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Failed to save settings:", error);
      setMessage({ type: "error", text: "Failed to save settings" });
    }

    setSaving(false);
  };

  const handleSavePermissions = async () => {
    setSaving(true);
    setMessage(null);

    try {
      await axios.put(`${API}/settings/permissions`, permissions);
      setMessage({
        type: "success",
        text: "Permissions saved successfully. Reloading page...",
      });
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      console.error("Failed to save permissions:", error);
      setMessage({ type: "error", text: "Failed to save permissions" });
      setSaving(false);
    }
  };

  const toggleFeature = (role, feature) => {
    setPermissions((prev) => ({
      ...prev,
      [role]: prev[role].includes(feature)
        ? prev[role].filter((f) => f !== feature)
        : [...prev[role], feature],
    }));
  };

  const handleSaveWireguard = async () => {
    setSaving(true);
    setMessage(null);

    try {
      await axios.put(`${API}/settings/wireguard`, wireguard);
      setMessage({
        type: "success",
        text: "WireGuard settings saved successfully",
      });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Failed to save WireGuard settings:", error);
      setMessage({ type: "error", text: "Failed to save WireGuard settings" });
    }

    setSaving(false);
  };

  const updateWireguard = (field, value) => {
    setWireguard((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddPeer = async () => {
    const newPeer = {
      name: `Peer ${wireguard.peers.length + 1}`,
      public_key: "",
      allowed_ips: `10.0.0.${wireguard.peers.length + 2}/32`,
      preshared_key: "",
    };

    try {
      const { data } = await axios.post(
        `${API}/settings/wireguard/peers`,
        newPeer,
      );
      setWireguard((prev) => ({ ...prev, peers: [...prev.peers, data] }));
      setMessage({ type: "success", text: "Peer added successfully" });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Failed to add peer:", error);
      setMessage({ type: "error", text: "Failed to add peer" });
    }
  };

  const handleDeletePeer = async (peerId) => {
    try {
      await axios.delete(`${API}/settings/wireguard/peers/${peerId}`);
      setWireguard((prev) => ({
        ...prev,
        peers: prev.peers.filter((p) => p.id !== peerId),
      }));
      setMessage({ type: "success", text: "Peer deleted successfully" });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Failed to delete peer:", error);
      setMessage({ type: "error", text: "Failed to delete peer" });
    }
  };

  const handleGenerateConfig = async (peerId, endpoint) => {
    try {
      const { data } = await axios.post(
        `${API}/settings/wireguard/config/${peerId}`,
        { endpoint },
      );
      const blob = new Blob([data.config], { type: "text/plain" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wireguard-${peerId}.conf`;
      a.click();
      window.URL.revokeObjectURL(url);
      setMessage({ type: "success", text: "Config file downloaded" });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Failed to generate config:", error);
      setMessage({ type: "error", text: "Failed to generate config" });
    }
  };

  const handleSaveNotificationSettings = async () => {
    setNotificationSaving(true);
    setMessage(null);

    try {
      await axios.put(`${API}/settings/notifications`, notificationSettings);
      setMessage({
        type: "success",
        text: "Notification settings saved successfully",
      });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Failed to save notification settings:", error);
      setMessage({
        type: "error",
        text: "Failed to save notification settings",
      });
    }

    setNotificationSaving(false);
  };

  const updateNotificationSetting = (index, field, value) => {
    setNotificationSettings((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const timezones = [
    "Africa/Nairobi",
    "Africa/Cairo",
    "Africa/Johannesburg",
    "Africa/Lagos",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/Moscow",
    "America/New_York",
    "America/Los_Angeles",
    "America/Chicago",
    "Asia/Dubai",
    "Asia/Tokyo",
    "Asia/Singapore",
    "Asia/Shanghai",
    "Australia/Sydney",
    "Pacific/Auckland",
  ];

  const currencies = [
    { code: "KES", symbol: "KES", name: "Kenyan Shilling" },
    { code: "USD", symbol: "$", name: "US Dollar" },
    { code: "EUR", symbol: "€", name: "Euro" },
    { code: "GBP", symbol: "£", name: "British Pound" },
    { code: "UGX", symbol: "UGX", name: "Ugandan Shilling" },
    { code: "TZS", symbol: "TZS", name: "Tanzanian Shilling" },
    { code: "RWF", symbol: "RWF", name: "Rwandan Franc" },
    { code: "ZAR", symbol: "R", name: "South African Rand" },
  ];

  const dateFormats = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "DD-MM-YYYY"];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-zinc-400 mt-1">
          Configure your application settings
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800 mb-6">
        {[
          "general",
          "appearance",
          "permissions",
          "wireguard",
          "security",
          "notifications",
        ].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-medium capitalize transition-colors border-b-2 ${
              activeTab === tab
                ? "text-blue-400 border-blue-500"
                : "text-zinc-500 border-transparent hover:text-zinc-300"
            }`}
          >
            {tab.replace("-", " ")}
          </button>
        ))}
      </div>

      {/* Message */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            message.type === "success"
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-rose-500/10 text-rose-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* General Settings */}
      {activeTab === "general" && (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Company Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" /> Company Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="company-name">Company Name *</Label>
                  <Input
                    id="company-name"
                    type="text"
                    value={settings.company_name}
                    onChange={(e) =>
                      setSettings({ ...settings, company_name: e.target.value })
                    }
                    placeholder="Your ISP Name"
                    required
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    Used for invoice headers and portal branding
                  </p>
                </div>
                <div>
                  <Label htmlFor="company-abbreviation">
                    Account Number Prefix
                  </Label>
                  <Input
                    id="company-abbreviation"
                    type="text"
                    value={settings.company_abbreviation}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        company_abbreviation: e.target.value,
                      })
                    }
                    placeholder="e.g. GFN (Giraffe Networks)"
                    maxLength={6}
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    Used for account numbers: GFN-00001. Leave empty to derive
                    from company name
                  </p>
                </div>
                <div className="md:col-span-2">
                  <Label>Company Logo</Label>
                  <div className="flex items-center gap-4">
                    {logoPreview ? (
                      <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-zinc-800">
                        <img
                          src={logoPreview}
                          alt="Logo"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          className="absolute top-1 right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-lg bg-zinc-800 flex items-center justify-center border-2 border-dashed border-zinc-700">
                        <Building2 className="w-8 h-8 text-zinc-600" />
                      </div>
                    )}
                    <div className="flex-1">
                      <input
                        type="file"
                        id="logo-upload"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                      <label
                        htmlFor="logo-upload"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg cursor-pointer transition-colors"
                      >
                        <Upload className="w-4 h-4" />
                        Upload Logo
                      </label>
                      <p className="text-xs text-zinc-500 mt-1">
                        Recommended: 200x200px, PNG or JPG
                      </p>
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="contact-email">Contact Email</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    value={settings.contact_email}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        contact_email: e.target.value,
                      })
                    }
                    placeholder="support@yourisp.com"
                  />
                </div>
                <div>
                  <Label htmlFor="contact-phone">Contact Phone</Label>
                  <Input
                    id="contact-phone"
                    type="tel"
                    value={settings.contact_phone}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        contact_phone: e.target.value,
                      })
                    }
                    placeholder="+254 700 000 000"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    type="text"
                    value={settings.address}
                    onChange={(e) =>
                      setSettings({ ...settings, address: e.target.value })
                    }
                    placeholder="Street address"
                  />
                </div>
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    type="text"
                    value={settings.city}
                    onChange={(e) =>
                      setSettings({ ...settings, city: e.target.value })
                    }
                    placeholder="Nairobi"
                  />
                </div>
                <div>
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    type="text"
                    value={settings.country}
                    onChange={(e) =>
                      setSettings({ ...settings, country: e.target.value })
                    }
                    placeholder="Kenya"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* LDAP / Active Directory */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" /> LDAP / Active Directory
              </CardTitle>
              <CardDescription>
                Staff login via Windows Active Directory or OpenLDAP server. Configure to enable domain authentication.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="ldap-enabled" className="cursor-pointer">Enable LDAP Authentication</Label>
                <Switch id="ldap-enabled" checked={settings.ldap_enabled === "true"} onCheckedChange={(v) => setSettings({...settings, ldap_enabled: String(v)})} />
              </div>
              {settings.ldap_enabled === "true" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div>
                    <Label>LDAP Server URL</Label>
                    <Input value={settings.ldap_url || ""} onChange={e => setSettings({...settings, ldap_url: e.target.value})} placeholder="ldap://dc.company.local:389" />
                  </div>
                  <div>
                    <Label>Base DN</Label>
                    <Input value={settings.ldap_base_dn || ""} onChange={e => setSettings({...settings, ldap_base_dn: e.target.value})} placeholder="DC=company,DC=local" />
                  </div>
                  <div>
                    <Label>Bind DN (optional)</Label>
                    <Input value={settings.ldap_bind_dn || ""} onChange={e => setSettings({...settings, ldap_bind_dn: e.target.value})} placeholder="CN=svc-ldap,CN=Users,DC=company,DC=local" />
                  </div>
                  <div>
                    <Label>Bind Password</Label>
                    <Input type="password" value={settings.ldap_bind_password || ""} onChange={e => setSettings({...settings, ldap_bind_password: e.target.value})} placeholder="Service account password" />
                  </div>
                  <div>
                    <Label>User Filter</Label>
                    <Input value={settings.ldap_filter || ""} onChange={e => setSettings({...settings, ldap_filter: e.target.value})} placeholder="(sAMAccountName={{username}})" />
                  </div>
                  <div>
                    <Label>Default Role</Label>
                    <select value={settings.ldap_default_role || "staff"} onChange={e => setSettings({...settings, ldap_default_role: e.target.value})} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="admin">Admin</option>
                      <option value="staff">Staff</option>
                      <option value="technician">Technician</option>
                    </select>
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={testLdap} disabled={testingLdap} className="gap-1 text-sm">
                  {testingLdap ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {testingLdap ? "Testing..." : "Test Connection"}
                </Button>
                {ldapTestResult && (
                  <span className={`text-xs self-center ${ldapTestResult.success ? "text-green-400" : "text-red-400"}`}>
                    {ldapTestResult.message}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </form>
      )}

      {/* Appearance Settings */}
      {activeTab === "appearance" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Theme Mode Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-blue-400" /> Theme Mode
              </CardTitle>
              <CardDescription>
                Select your preferred interface mode.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setMode("dark")}
                  aria-pressed={mode === "dark"}
                  className="color-theme-option flex items-center gap-4 p-5 rounded-xl border text-left transition-all"
                >
                  <div className="p-3 rounded-lg" style={mode === "dark"
                    ? { background: "color-mix(in srgb, var(--accent-blue) 16%, var(--bg-card))", color: "var(--accent-blue)" }
                    : { background: "var(--bg-surface)", color: "var(--text-muted)" }}>
                    <Moon className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Dark Mode</h4>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Sleek dark theme, easy on the eyes</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMode("light")}
                  aria-pressed={mode === "light"}
                  className="color-theme-option flex items-center gap-4 p-5 rounded-xl border text-left transition-all"
                >
                  <div className="p-3 rounded-lg" style={mode === "light"
                    ? { background: "color-mix(in srgb, var(--accent-blue) 16%, var(--bg-card))", color: "var(--accent-blue)" }
                    : { background: "var(--bg-surface)", color: "var(--text-muted)" }}>
                    <Sun className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Light Mode</h4>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Clean and bright layout</p>
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Color Schemes Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-blue-400" /> Color Accent Themes
              </CardTitle>
              <CardDescription>
                Choose an accent theme to personalize your workspace highlight colors.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {themes.map((t) => {
                  let gradient = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
                  if (t.id === "emerald") gradient = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
                  if (t.id === "sunset") gradient = "linear-gradient(135deg, #f97316 0%, #ea580c 100%)";
                  if (t.id === "purple") gradient = "linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)";
                  if (t.id === "ocean") gradient = "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)";
                  if (t.id === "midnight") gradient = "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)";
                  if (t.id === "slate") gradient = "linear-gradient(135deg, #64748b 0%, #475569 100%)";
                  if (t.id === "rose") gradient = "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)";
                  if (t.id === "techy") gradient = "linear-gradient(135deg, #00ff41 0%, #00cc33 100%)";

                  const isActive = theme === t.id;

                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTheme(t.id)}
                      aria-pressed={isActive}
                      className="color-theme-option flex flex-col p-4 rounded-xl border text-left transition-all"
                    >
                      <div className="flex items-center justify-between w-full mb-3">
                        <span className="font-semibold text-sm">{t.name}</span>
                        {isActive && (
                          <div className="w-5 h-5 rounded-full border flex items-center justify-center" style={{ borderColor: "var(--accent-blue)", color: "var(--accent-blue)" }}>
                            <Check aria-hidden="true" className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                      
                      {/* Gradient preview bar */}
                      <div className="w-full h-8 rounded-lg mb-2" style={{ background: gradient }} />
                      
                      <span className="text-xs line-clamp-2" style={{ color: "var(--text-muted)" }}>{t.description}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Eye Strain Filter Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" /> Eye Strain Filter
              </CardTitle>
              <CardDescription>
                Reduce blue light emissions to protect your eyes during late hours.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-white">Enable Warm Filter</h4>
                  <p className="text-xs text-zinc-400 mt-0.5">Applies a gentle amber overlay across the dashboard</p>
                </div>
                <Switch
                  checked={eyeFilter}
                  onCheckedChange={setEyeFilter}
                />
              </div>

              {eyeFilter && (
                <div className="space-y-2 pt-2 border-t border-zinc-800">
                  <div className="flex justify-between text-xs font-semibold text-zinc-400">
                    <span>Filter Intensity</span>
                    <span>{eyeIntensity}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={eyeIntensity}
                    onChange={(e) => setEyeIntensity(parseInt(e.target.value))}
                    className="w-full h-2 rounded-lg bg-zinc-800 appearance-none cursor-pointer accent-amber-500"
                    style={{
                      background: `linear-gradient(to right, #fbbf24 0%, #fbbf24 ${eyeIntensity}%, #27272a ${eyeIntensity}%, #27272a 100%)`,
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Permissions Settings */}
      {activeTab === "permissions" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" /> Role-Based Permissions
              </CardTitle>
              <CardDescription>
                Configure which features each user role can access.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Role Selector */}
              <div className="flex gap-2 mb-6">
                {Object.values(ROLES).map((role) => (
                  <Button
                    key={role}
                    variant={selectedRole === role ? "default" : "outline"}
                    onClick={() => setSelectedRole(role)}
                    className="capitalize"
                  >
                    {role}
                  </Button>
                ))}
              </div>

              {/* Features Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {allFeatures.map((feature) => {
                  const hasAccess =
                    permissions[selectedRole]?.includes(feature);
                  return (
                    <Button
                      key={feature}
                      variant={hasAccess ? "secondary" : "outline"}
                      onClick={() => toggleFeature(selectedRole, feature)}
                      className="justify-start"
                    >
                      {hasAccess ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <XIcon className="w-4 h-4" />
                      )}
                      <span className="capitalize ml-2">
                        {feature.replace(/-/g, " ")}
                      </span>
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSavePermissions}
              disabled={saving}
              className="flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save Permissions"}
            </Button>
          </div>
        </div>
      )}


      {/* WireGuard Settings */}
      {activeTab === "wireguard" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Wifi className="w-5 h-5" /> WireGuard VPN
                </CardTitle>
                <Switch
                  checked={wireguard.enabled}
                  onCheckedChange={(checked) =>
                    updateWireguard("enabled", checked)
                  }
                />
              </div>
              <CardDescription>
                Configure WireGuard VPN for secure remote access to your
                Mikrotik router.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="wg-port">Server Port</Label>
                  <Input
                    id="wg-port"
                    type="number"
                    value={wireguard.server_port}
                    onChange={(e) =>
                      updateWireguard("server_port", e.target.value)
                    }
                    placeholder="51820"
                  />
                </div>
                <div>
                  <Label htmlFor="wg-address">Server Address</Label>
                  <Input
                    id="wg-address"
                    type="text"
                    value={wireguard.server_address}
                    onChange={(e) =>
                      updateWireguard("server_address", e.target.value)
                    }
                    placeholder="10.0.0.1"
                  />
                </div>
                <div>
                  <Label htmlFor="wg-dns">DNS Server</Label>
                  <Input
                    id="wg-dns"
                    type="text"
                    value={wireguard.server_dns}
                    onChange={(e) =>
                      updateWireguard("server_dns", e.target.value)
                    }
                    placeholder="1.1.1.1"
                  />
                </div>
                <div>
                  <Label htmlFor="wg-private-key">Server Private Key</Label>
                  <Input
                    id="wg-private-key"
                    type="password"
                    value={wireguard.server_private_key}
                    onChange={(e) =>
                      updateWireguard("server_private_key", e.target.value)
                    }
                    placeholder="Private key (keep secret)"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="wg-public-key">Server Public Key</Label>
                  <Input
                    id="wg-public-key"
                    type="text"
                    value={wireguard.server_public_key}
                    onChange={(e) =>
                      updateWireguard("server_public_key", e.target.value)
                    }
                    placeholder="Public key (share with peers)"
                  />
                </div>
              </div>

              {/* Peers Section */}
              <div className="border-t border-zinc-700 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-md font-semibold text-white">
                    VPN Peers
                  </h3>
                  <Button
                    onClick={handleAddPeer}
                    className="flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Peer
                  </Button>
                </div>

                {wireguard.peers.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500">
                    <Wifi className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No peers configured yet</p>
                    <p className="text-sm">
                      Add a peer to start using WireGuard VPN
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {wireguard.peers.map((peer) => (
                      <div
                        key={peer.id}
                        className="p-4 bg-zinc-800/50 rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h4 className="font-medium text-white">
                              {peer.name}
                            </h4>
                            <p className="text-sm text-zinc-400">
                              {peer.allowed_ips}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleGenerateConfig(
                                  peer.id,
                                  window.location.hostname,
                                )
                              }
                              className="flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" />
                              Config
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeletePeer(peer.id)}
                              className="flex items-center gap-1 text-red-400 hover:text-red-300"
                            >
                              <Trash2 className="w-3 h-3" />
                              Delete
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <Label
                              htmlFor={`peer-key-${peer.id}`}
                              className="text-xs"
                            >
                              Public Key
                            </Label>
                            <Input
                              id={`peer-key-${peer.id}`}
                              type="text"
                              value={peer.public_key}
                              onChange={(e) => {
                                const updatedPeers = wireguard.peers.map((p) =>
                                  p.id === peer.id
                                    ? { ...p, public_key: e.target.value }
                                    : p,
                                );
                                setWireguard((prev) => ({
                                  ...prev,
                                  peers: updatedPeers,
                                }));
                              }}
                              placeholder="Peer public key"
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <Label
                              htmlFor={`peer-psk-${peer.id}`}
                              className="text-xs"
                            >
                              Preshared Key (optional)
                            </Label>
                            <Input
                              id={`peer-psk-${peer.id}`}
                              type="password"
                              value={peer.preshared_key}
                              onChange={(e) => {
                                const updatedPeers = wireguard.peers.map((p) =>
                                  p.id === peer.id
                                    ? { ...p, preshared_key: e.target.value }
                                    : p,
                                );
                                setWireguard((prev) => ({
                                  ...prev,
                                  peers: updatedPeers,
                                }));
                              }}
                              placeholder="Preshared key for extra security"
                              className="text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSaveWireguard}
              disabled={saving}
              className="flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save WireGuard Settings"}
            </Button>
          </div>
        </div>
      )}

      {/* Security Settings */}
      {activeTab === "security" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" /> Two-Factor Authentication
            </CardTitle>
            <CardDescription>
              Add an extra layer of security to your account using an
              authenticator app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <TwoFactorSetup />
          </CardContent>
        </Card>
      )}
      {/* Notifications Settings */}
      {activeTab === "notifications" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" /> Notification Settings
              </CardTitle>
              <CardDescription>
                Configure how and when you receive notifications for various
                events.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {notificationSettings.map((setting, index) => (
                <div
                  key={setting.notification_type}
                  className="p-4 bg-zinc-800/50 rounded-xl space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-md font-semibold text-white capitalize">
                      {setting.notification_type.replace(/_/g, " ")}
                    </h3>
                    <Switch
                      checked={setting.enabled}
                      onCheckedChange={(checked) =>
                        updateNotificationSetting(index, "enabled", checked)
                      }
                    />
                  </div>

                  {setting.enabled && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Email */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-zinc-400" />
                          <Label className="text-sm">Email</Label>
                          <Switch
                            checked={setting.email_enabled}
                            onCheckedChange={(checked) =>
                              updateNotificationSetting(
                                index,
                                "email_enabled",
                                checked,
                              )
                            }
                            size="sm"
                          />
                        </div>
                        {setting.email_enabled && (
                          <Input
                            type="text"
                            value={setting.email_recipients}
                            onChange={(e) =>
                              updateNotificationSetting(
                                index,
                                "email_recipients",
                                e.target.value,
                              )
                            }
                            placeholder="email1@example.com, email2@example.com"
                            className="text-sm"
                          />
                        )}
                      </div>

                      {/* SMS */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <MessageCircle className="w-4 h-4 text-zinc-400" />
                          <Label className="text-sm">SMS</Label>
                          <Switch
                            checked={setting.sms_enabled}
                            onCheckedChange={(checked) =>
                              updateNotificationSetting(
                                index,
                                "sms_enabled",
                                checked,
                              )
                            }
                            size="sm"
                          />
                        </div>
                        {setting.sms_enabled && (
                          <Input
                            type="text"
                            value={setting.sms_recipients}
                            onChange={(e) =>
                              updateNotificationSetting(
                                index,
                                "sms_recipients",
                                e.target.value,
                              )
                            }
                            placeholder="+254700000000, +254711000000"
                            className="text-sm"
                          />
                        )}
                      </div>

                      {/* Webhook */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Webhook className="w-4 h-4 text-zinc-400" />
                          <Label className="text-sm">Webhook</Label>
                          <Switch
                            checked={setting.webhook_enabled}
                            onCheckedChange={(checked) =>
                              updateNotificationSetting(
                                index,
                                "webhook_enabled",
                                checked,
                              )
                            }
                            size="sm"
                          />
                        </div>
                        {setting.webhook_enabled && (
                          <Input
                            type="text"
                            value={setting.webhook_url}
                            onChange={(e) =>
                              updateNotificationSetting(
                                index,
                                "webhook_url",
                                e.target.value,
                              )
                            }
                            placeholder="https://your-domain.com/webhook"
                            className="text-sm"
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSaveNotificationSettings}
              disabled={notificationSaving}
              className="flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {notificationSaving ? "Saving..." : "Save Notification Settings"}
            </Button>
          </div>
        </div>
      )}

      {/* Other tabs - placeholder */}
      {activeTab !== "general" &&
        activeTab !== "permissions" &&
        activeTab !== "wireguard" &&
        activeTab !== "security" &&
        activeTab !== "notifications" && (
          <div className="glass rounded-2xl p-12 text-center">
            <div className="text-zinc-500">
              <p className="text-lg font-medium mb-2">
                {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}{" "}
                Settings
              </p>
              <p className="text-sm">Coming soon</p>
            </div>
          </div>
        )}
    </div>
  );
}
