import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  Building2,
  Upload,
  Save,
  Check,
  Palette,
  Globe,
  Image,
  Shield,
  Loader2,
  ExternalLink,
  Copy,
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
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

const API = import.meta.env.VITE_API_URL || "/api";

const PRESET_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#6366f1",
  "#14b8a6",
  "#a855f7",
];

export default function TenantSettingsPage() {
  const addToast = useToastStore((state) => state.addToast);
  const toast = {
    success: (msg) => addToast("success", msg, "", 3000),
    error:   (msg) => addToast("error",   msg, "", 4000),
  };
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [tenant, setTenant] = useState({
    id: "",
    slug: "",
    company_name: "",
    logo_url: "",
    primary_color: "#3b82f6",
    secondary_color: "#1e293b",
    accent_color: "#f59e0b",
    domain: "",
    email: "",
    phone: "",
    address: "",
  });

  const [previewLogo, setPreviewLogo] = useState(null);

  useEffect(() => {
    fetchTenant();
  }, []);

  const fetchTenant = async () => {
    try {
      const token = getToken();
      const { data } = await axios.get(`${API}/tenants/current`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTenant({
        id: data.id || "",
        slug: data.slug || "",
        company_name: data.company_name || "",
        logo_url: data.logo_url || "",
        primary_color: data.primary_color || "#3b82f6",
        secondary_color: data.secondary_color || "#1e293b",
        accent_color: data.accent_color || "#f59e0b",
        domain: data.domain || "",
        email: data.email || "",
        phone: data.phone || "",
        address: data.address || "",
      });
    } catch (e) {
      toast.error("Failed to load tenant settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = getToken();
      console.log(
        "[TenantBranding] Saving tenant:",
        tenant.id,
        tenant.company_name,
        tenant.primary_color,
      );
      const { data } = await axios.put(
        `${API}/tenants/${tenant.id}`,
        {
          company_name: tenant.company_name,
          primary_color: tenant.primary_color,
          secondary_color: tenant.secondary_color,
          accent_color: tenant.accent_color,
          domain: tenant.domain,
          email: tenant.email,
          phone: tenant.phone,
          address: tenant.address,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      console.log("[TenantBranding] Saved:", data);
      toast.success("Branding saved");
    } catch (e) {
      console.error(
        "[TenantBranding] Save failed:",
        e.response?.status,
        e.response?.data,
      );
      toast.error("Failed to save: " + (e.response?.data?.error || e.message));
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) {return;}

    // Preview
    const reader = new FileReader();
    reader.onload = (ev) => setPreviewLogo(ev.target.result);
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const token = getToken();
      const form = new FormData();
      form.append("logo", file);

      const { data } = await axios.post(
        `${API}/tenants/${tenant.id}/logo`,
        form,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
        },
      );
      setTenant({ ...tenant, logo_url: data.logo_url });
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error("Logo upload failed", e.response?.data?.error);
    } finally {
      setUploading(false);
    }
  };

  // Build the live preview URL
  const previewUrl = tenant.domain
    ? `https://${tenant.domain}/login`
    : `${window.location.origin}/login`;

  const fullLogoUrl = tenant.logo_url
    ? tenant.logo_url.startsWith("http")
      ? tenant.logo_url
      : `${window.location.origin}${tenant.logo_url}`
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tenant Branding</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Customize how your ISP appears on the login page
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Changes
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - settings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Company Info */}
          <Card className="bg-zinc-900/60 border-zinc-800/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Building2 className="w-5 h-5 text-zinc-400" />
                Company Info
              </CardTitle>
              <CardDescription>
                Your company name and contact details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Company Name</Label>
                <Input
                  value={tenant.company_name}
                  onChange={(e) =>
                    setTenant({ ...tenant, company_name: e.target.value })
                  }
                  placeholder="My ISP Ltd"
                  className="bg-zinc-800/50 border-zinc-700/50 text-white mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Email</Label>
                  <Input
                    value={tenant.email}
                    onChange={(e) =>
                      setTenant({ ...tenant, email: e.target.value })
                    }
                    placeholder="info@myisp.com"
                    className="bg-zinc-800/50 border-zinc-700/50 text-white mt-1"
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={tenant.phone}
                    onChange={(e) =>
                      setTenant({ ...tenant, phone: e.target.value })
                    }
                    placeholder="+254700000000"
                    className="bg-zinc-800/50 border-zinc-700/50 text-white mt-1"
                  />
                </div>
              </div>
              <div>
                <Label>Address</Label>
                <Input
                  value={tenant.address}
                  onChange={(e) =>
                    setTenant({ ...tenant, address: e.target.value })
                  }
                  placeholder="Nairobi, Kenya"
                  className="bg-zinc-800/50 border-zinc-700/50 text-white mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Logo */}
          <Card className="bg-zinc-900/60 border-zinc-800/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Image className="w-5 h-5 text-zinc-400" />
                Logo
              </CardTitle>
              <CardDescription>
                Upload your company logo (PNG, JPG, WebP, SVG — max 5MB)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-xl bg-zinc-800/50 border-2 border-dashed border-zinc-700/50 flex items-center justify-center overflow-hidden">
                  {previewLogo || fullLogoUrl ? (
                    <img
                      src={previewLogo || fullLogoUrl}
                      alt="Logo preview"
                      className="w-full h-full object-contain p-2"
                    />
                  ) : (
                    <Shield className="w-10 h-10 text-zinc-600" />
                  )}
                </div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="gap-2 border-zinc-700/50 text-zinc-300"
                  >
                    {uploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    {uploading ? "Uploading..." : "Upload Logo"}
                  </Button>
                  <p className="text-xs text-zinc-500 mt-2">
                    {fullLogoUrl
                      ? `Current: ${fullLogoUrl}`
                      : "No logo uploaded yet"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Colors */}
          <Card className="bg-zinc-900/60 border-zinc-800/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Palette className="w-5 h-5 text-zinc-400" />
                Brand Colors
              </CardTitle>
              <CardDescription>
                These colors appear on the login page and throughout the app
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {[
                {
                  key: "primary_color",
                  label: "Primary Color",
                  desc: "Buttons, headings, accent elements",
                },
                {
                  key: "secondary_color",
                  label: "Secondary Color",
                  desc: "Background gradients, cards",
                },
                {
                  key: "accent_color",
                  label: "Accent Color",
                  desc: "Highlights, badges, icons",
                },
              ].map(({ key, label, desc }) => (
                <div key={key} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{label}</Label>
                      <p className="text-xs text-zinc-500">{desc}</p>
                    </div>
                    <div
                      className="w-10 h-10 rounded-lg border-2 border-zinc-700/50 shadow-lg"
                      style={{ backgroundColor: tenant[key] }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={tenant[key]}
                      onChange={(e) =>
                        setTenant({ ...tenant, [key]: e.target.value })
                      }
                      className="bg-zinc-800/50 border-zinc-700/50 text-white font-mono w-32"
                    />
                    <div className="flex gap-1.5 flex-wrap">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() => setTenant({ ...tenant, [key]: color })}
                          className={`w-7 h-7 rounded-md border-2 transition-all hover:scale-110 ${
                            tenant[key] === color
                              ? "border-white ring-2 ring-white/20"
                              : "border-transparent"
                          }`}
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Domain */}
          <Card className="bg-zinc-900/60 border-zinc-800/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Globe className="w-5 h-5 text-zinc-400" />
                Custom Domain
              </CardTitle>
              <CardDescription>
                Set a custom domain for your tenant. Point the domain to this
                server and your login page will show your branding
                automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                value={tenant.domain}
                onChange={(e) =>
                  setTenant({ ...tenant, domain: e.target.value })
                }
                placeholder="portal.myisp.com"
                className="bg-zinc-800/50 border-zinc-700/50 text-white"
              />
            </CardContent>
          </Card>
        </div>

        {/* Right column - preview */}
        <div className="space-y-6">
          <Card className="bg-zinc-900/60 border-zinc-800/50 sticky top-6">
            <CardHeader>
              <CardTitle className="text-white text-sm">Live Preview</CardTitle>
              <CardDescription>How your login page will look</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Preview card */}
              <div
                className="rounded-xl p-6 space-y-4"
                style={{
                  background: `radial-gradient(ellipse at top, ${tenant.secondary_color} 0%, #0f1117 60%, #0a0a0f 100%)`,
                }}
              >
                <div className="text-center space-y-3">
                  {fullLogoUrl || previewLogo ? (
                    <img
                      src={previewLogo || fullLogoUrl}
                      alt="Logo"
                      className="h-10 mx-auto object-contain"
                    />
                  ) : (
                    <div
                      className="inline-flex items-center justify-center w-12 h-12 rounded-xl mx-auto"
                      style={{
                        background: `linear-gradient(135deg, ${tenant.primary_color}, ${tenant.accent_color})`,
                        boxShadow: `0 0 20px ${tenant.primary_color}30`,
                      }}
                    >
                      <Shield className="w-6 h-6 text-white" />
                    </div>
                  )}
                  <div>
                    <h3
                      className="text-lg font-bold bg-clip-text text-transparent"
                      style={{
                        backgroundImage: `linear-gradient(135deg, ${tenant.primary_color}, ${tenant.accent_color})`,
                      }}
                    >
                      {tenant.company_name || "My ISP"}
                    </h3>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      Sign in to manage your network
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="h-8 rounded-lg bg-white/10" />
                    <div className="h-8 rounded-lg bg-white/5" />
                    <div
                      className="h-9 rounded-lg flex items-center justify-center text-xs font-semibold text-white"
                      style={{
                        background: `linear-gradient(135deg, ${tenant.primary_color}, ${tenant.accent_color})`,
                      }}
                    >
                      Sign In
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-zinc-800/50">
                <Label className="text-xs text-zinc-400">Preview URL</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-zinc-800/50 rounded px-2 py-1.5 text-zinc-300 truncate">
                    {previewUrl}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(previewUrl);
                      toast.success("URL copied");
                    }}
                    className="text-zinc-500 hover:text-zinc-300"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-zinc-500 hover:text-zinc-300"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
