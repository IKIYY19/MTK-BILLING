import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Webhook,
  Plus,
  Trash2,
  Play,
  Edit3,
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  Globe,
  Key,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "../hooks/useToast";

const API = import.meta.env.VITE_API_URL || "/api";

const AVAILABLE_EVENTS = [
  { value: "payment.received", label: "Payment Received" },
  { value: "customer.suspended", label: "Customer Suspended" },
  { value: "customer.activated", label: "Customer Activated" },
  { value: "invoice.created", label: "Invoice Created" },
  { value: "router.provisioned", label: "Router Provisioned" },
  { value: "*", label: "All Events (Wildcard)" },
];

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [testing, setTesting] = useState({});
  const toast = useToast();

  // Form state
  const [form, setForm] = useState({
    name: "",
    url: "",
    events: [],
    secret: "",
    enabled: true,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const fetchWebhooks = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/webhooks`);
      setWebhooks(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (e) {
      toast.error("Failed to load webhooks", e.message);
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  // ─── Form handlers ───────────────────────

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", url: "", events: [], secret: "", enabled: true });
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (webhook) => {
    setEditing(webhook);
    let events = webhook.events;
    if (typeof events === "string") {
      try { events = JSON.parse(events); } catch { events = []; }
    }
    setForm({
      name: webhook.name || "",
      url: webhook.url || "",
      events: events || [],
      secret: webhook.secret || "",
      enabled: webhook.enabled !== false,
    });
    setFormError("");
    setModalOpen(true);
  };

  const handleEventToggle = (eventValue) => {
    setForm((prev) => {
      const current = prev.events;
      if (current.includes(eventValue)) {
        return { ...prev, events: current.filter((e) => e !== eventValue) };
      }
      return { ...prev, events: [...current, eventValue] };
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!form.url.trim()) {
      setFormError("URL is required");
      return;
    }
    if (form.events.length === 0) {
      setFormError("Select at least one event");
      return;
    }

    // Basic URL validation
    try {
      new URL(form.url.trim());
    } catch {
      setFormError("Please enter a valid URL (e.g. https://example.com/webhook)");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const { data } = await axios.put(`${API}/webhooks/${editing.id}`, {
          name: form.name,
          url: form.url.trim(),
          events: form.events,
          secret: form.secret,
          enabled: form.enabled,
        });
        setWebhooks((prev) =>
          prev.map((w) => (w.id === editing.id ? data : w))
        );
        toast.success("Webhook updated");
      } else {
        const { data } = await axios.post(`${API}/webhooks`, {
          name: form.name,
          url: form.url.trim(),
          events: form.events,
          secret: form.secret,
          enabled: form.enabled,
        });
        setWebhooks((prev) => [data, ...prev]);
        toast.success("Webhook created");
      }
      setModalOpen(false);
    } catch (e) {
      toast.error("Save failed", e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (webhook) => {
    if (!confirm(`Delete webhook "${webhook.name || webhook.url}"?`)) {return;}
    try {
      await axios.delete(`${API}/webhooks/${webhook.id}`);
      setWebhooks((prev) => prev.filter((w) => w.id !== webhook.id));
      toast.success("Webhook deleted");
    } catch (e) {
      toast.error("Delete failed", e.message);
    }
  };

  const handleToggle = async (webhook) => {
    try {
      const { data } = await axios.put(`${API}/webhooks/${webhook.id}`, {
        enabled: !webhook.enabled,
      });
      setWebhooks((prev) =>
        prev.map((w) => (w.id === webhook.id ? data : w))
      );
    } catch (e) {
      toast.error("Toggle failed", e.message);
    }
  };

  const handleTest = async (webhook) => {
    setTesting((prev) => ({ ...prev, [webhook.id]: true }));
    try {
      const { data } = await axios.post(`${API}/webhooks/${webhook.id}/test`);
      if (data.success) {
        toast.success("Test sent successfully", `Status: ${data.status}`);
      } else {
        toast.error("Test failed", data.error);
      }
    } catch (e) {
      toast.error("Test request failed", e.message);
    } finally {
      setTesting((prev) => ({ ...prev, [webhook.id]: false }));
    }
  };

  // ─── Helpers ─────────────────────────────

  const formatEvents = (webhook) => {
    let events = webhook.events;
    if (typeof events === "string") {
      try { events = JSON.parse(events); } catch { events = []; }
    }
    if (!Array.isArray(events)) {return [];}
    return events;
  };

  const formatDate = (ts) => {
    if (!ts) {return "—";}
    return new Date(ts).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ─── Render ──────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <Webhook className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Webhooks</h1>
            <p className="text-sm text-zinc-400">
              Send HTTP callbacks to external services on platform events
            </p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Webhook
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
        </div>
      ) : webhooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
          <Webhook className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-sm">No webhooks configured</p>
          <p className="text-xs mt-1">
            Create one to start receiving event callbacks
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((webhook) => {
            const events = formatEvents(webhook);
            const isTesting = testing[webhook.id];
            return (
              <div
                key={webhook.id}
                className={`group rounded-xl border bg-zinc-900/60 p-5 transition-all ${
                  webhook.enabled
                    ? "border-zinc-800/60 hover:border-zinc-700/60"
                    : "border-zinc-800/30 opacity-50"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-white truncate">
                        {webhook.name || "Unnamed Webhook"}
                      </h3>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          webhook.enabled
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-zinc-500/10 text-zinc-500 border border-zinc-500/20"
                        }`}
                      >
                        {webhook.enabled ? "Active" : "Disabled"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mb-2 text-xs text-zinc-500">
                      <Globe className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{webhook.url}</span>
                      {webhook.secret && (
                        <>
                          <span className="text-zinc-700">•</span>
                          <Key className="w-3 h-3 flex-shrink-0 text-amber-500" />
                          <span className="text-amber-500/70 text-[10px]">
                            Signed
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {events.map((ev) => (
                        <span
                          key={ev}
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                            ev === "*"
                              ? "bg-violet-500/10 text-violet-400 border-violet-500/20"
                              : "bg-zinc-800 text-zinc-400 border-zinc-700/40"
                          }`}
                        >
                          {ev}
                        </span>
                      ))}
                    </div>

                    <p className="text-[11px] text-zinc-600 mt-2">
                      Created {formatDate(webhook.created_at)}
                      {webhook.updated_at !== webhook.created_at &&
                        ` · Updated ${formatDate(webhook.updated_at)}`}
                    </p>
                  </div>

                  {/* Right — Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleTest(webhook)}
                      disabled={isTesting}
                      className="p-2 rounded-lg text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all disabled:opacity-50"
                      title="Test webhook"
                    >
                      {isTesting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => openEdit(webhook)}
                      className="p-2 rounded-lg text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                      title="Edit"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggle(webhook)}
                      className={`p-2 rounded-lg transition-all ${
                        webhook.enabled
                          ? "text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                          : "text-zinc-600 hover:text-zinc-400 hover:bg-zinc-700/40"
                      }`}
                      title={webhook.enabled ? "Disable" : "Enable"}
                    >
                      {webhook.enabled ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <XCircle className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(webhook)}
                      className="p-2 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Modal ──────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          />

          {/* Dialog */}
          <div className="relative w-full max-w-lg mx-4 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-white">
                {editing ? "Edit Webhook" : "Create Webhook"}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5">
              {formError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {formError}
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g. Slack notifications"
                  className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors"
                />
              </div>

              {/* URL */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                  URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, url: e.target.value }))
                  }
                  placeholder="https://your-service.com/webhook"
                  className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors"
                  required
                />
              </div>

              {/* Secret */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                  Secret (optional)
                </label>
                <input
                  type="text"
                  value={form.secret}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, secret: e.target.value }))
                  }
                  placeholder="Shared secret for X-Webhook-Secret header"
                  className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors"
                />
              </div>

              {/* Events */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Events <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_EVENTS.map((ev) => {
                    const checked = form.events.includes(ev.value);
                    const isWildcard = ev.value === "*";
                    return (
                      <label
                        key={ev.value}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-all text-sm ${
                          checked
                            ? isWildcard
                              ? "bg-violet-500/10 border-violet-500/30 text-violet-300"
                              : "bg-blue-500/10 border-blue-500/30 text-blue-300"
                            : "bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600/50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleEventToggle(ev.value)}
                          className="sr-only"
                        />
                        <div
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                            checked
                              ? isWildcard
                                ? "bg-violet-500 border-violet-500"
                                : "bg-blue-500 border-blue-500"
                              : "border-zinc-600 bg-transparent"
                          }`}
                        >
                          {checked && (
                            <CheckCircle2 className="w-3 h-3 text-white" />
                          )}
                        </div>
                        <span className="text-xs font-medium">
                          {ev.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Enabled toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() =>
                    setForm((prev) => ({ ...prev, enabled: !prev.enabled }))
                  }
                  className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                    form.enabled ? "bg-blue-600" : "bg-zinc-700"
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      form.enabled ? "translate-x-5.5" : "translate-x-0.5"
                    }`}
                    style={{
                      transform: form.enabled
                        ? "translateX(22px)"
                        : "translateX(2px)",
                    }}
                  />
                </div>
                <span className="text-sm text-zinc-400">
                  {form.enabled ? "Enabled" : "Disabled"}
                </span>
              </label>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl disabled:opacity-50 transition-colors"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editing ? "Save Changes" : "Create Webhook"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
