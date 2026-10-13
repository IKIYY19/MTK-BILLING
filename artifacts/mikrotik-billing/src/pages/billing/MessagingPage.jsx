import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Send, MessageSquare, MessageCircle, Phone, FileText,
  RefreshCw, Trash2, Search, X, Check, Copy, Loader2,
  Users, AlertCircle, Clock, Zap, TrendingUp, Settings,
  Eye, ChevronDown,
} from "lucide-react";
import { useToast } from "../../hooks/useToast";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

const API = import.meta.env.VITE_API_URL || "/api";

const PROVIDERS = [
  { id: "africas_talking", name: "Africa's Talking", icon: MessageSquare },
  { id: "twilio", name: "Twilio", icon: MessageSquare },
  { id: "bulksms_kenya", name: "BulkSMS Kenya", icon: MessageSquare },
  { id: "smsleopard", name: "SMSLeopard", icon: MessageSquare },
  { id: "nexmo", name: "Nexmo", icon: MessageSquare },
  { id: "whatsapp", name: "WhatsApp", icon: MessageCircle },
];

const TABS = [
  { id: "compose", label: "Compose", icon: Send },
  { id: "templates", label: "Templates", icon: FileText },
  { id: "logs", label: "Logs", icon: Clock },
  { id: "settings", label: "Settings", icon: Settings },
];

function StatusBadge({ status }) {
  const map = {
    sent: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    delivered: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
    read: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${map[status] || "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"}`}>
      {status}
    </span>
  );
}

export default function MessagingPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState("compose");
  const [loading, setLoading] = useState(false);

  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [provider, setProvider] = useState("africas_talking");
  const [channel, setChannel] = useState("sms");
  const [sending, setSending] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [bulkFilter, setBulkFilter] = useState("all");

  const [templates, setTemplates] = useState([]);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateName, setTemplateName] = useState("");
  const [templateBody, setTemplateBody] = useState("");

  const [logs, setLogs] = useState([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logFilter, setLogFilter] = useState("");

  const [providerSettings, setProviderSettings] = useState({});
  const [selectedProviderSettings, setSelectedProviderSettings] = useState("africas_talking");
  const [expandedProvider, setExpandedProvider] = useState(null);

  useEffect(() => { fetchTemplates(); fetchLogs(); fetchSettings(); }, []);

  const fetchTemplates = async () => {
    try {
      const { data } = await axios.get(`${API}/sms/templates`);
      setTemplates(data || []);
    } catch (e) {
      console.warn("Failed to fetch templates:", e);
    }
  };

  const fetchLogs = async () => {
    try {
      const { data } = await axios.get(`${API}/sms/logs?page=${logsPage}&limit=100`);
      setLogs(data?.data || data || []);
    } catch (e) {
      console.warn("Failed to fetch logs:", e);
    }
  };

  const fetchSettings = async () => {
    try {
      const { data } = await axios.get(`${API}/sms/settings`);
      setProviderSettings(data || {});
    } catch (e) {
      console.warn("Failed to fetch settings:", e);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!phone || !message) {return toast.error("Phone and message required");}
    setSending(true);
    try {
      const endpoint = channel === "whatsapp"
        ? `${API}/sms/whatsapp/send`
        : `${API}/sms/send`;
      const { data } = await axios.post(endpoint, { to: phone, message, provider });
      if (data.success) {
        toast.success(`Message sent via ${PROVIDERS.find(p => p.id === provider)?.name}`);
        fetchLogs();
      } else {
        toast.error(data.message || "Send failed");
      }
    } catch (e) {
      toast.error(e.response?.data?.error || "Send failed");
    } finally { setSending(false); }
  };

  const handleBulkSend = async () => {
    if (!message) {return toast.error("Message required");}
    setSending(true);
    try {
      const { data } = await axios.post(`${API}/sms/send-bulk`, { message, filter: bulkFilter, provider });
      toast.success(`Bulk sent: ${data.successCount} success, ${data.failCount} failed`);
      fetchLogs();
    } catch (e) {
      toast.error(e.response?.data?.error || "Bulk send failed");
    } finally { setSending(false); }
  };

  const handleSaveTemplate = async () => {
    if (!templateName || !templateBody) {return;}
    try {
      if (editingTemplate) {
        await axios.put(`${API}/sms/templates/${editingTemplate}`, { name: templateName, body: templateBody });
        toast.success("Template updated");
      }
      setEditingTemplate(null); setTemplateName(""); setTemplateBody("");
      fetchTemplates();
    } catch (e) { toast.error("Save failed"); }
  };

  const handleDeleteLog = async (id) => {
    try {
      await axios.delete(`${API}/sms/logs/${id}`);
      fetchLogs();
    } catch (e) {
      console.warn("Failed to delete log:", e);
    }
  };

  const clearLogs = async () => {
    if (!confirm("Delete ALL message logs?")) {return;}
    try {
      await axios.delete(`${API}/sms/logs`);
      fetchLogs();
      toast.success("Logs cleared");
    } catch (e) {
      console.warn("Failed to clear logs:", e);
    }
  };

  const filterLogs = (log) => {
    if (channel === "whatsapp" && log.channel !== "whatsapp" && log.channel !== "whatsapp_inbound") {return false;}
    if (channel === "sms" && log.channel === "whatsapp") {return false;}
    if (!logFilter) {return true;}
    const f = logFilter.toLowerCase();
    return (log.to?.toLowerCase() || "").includes(f) || (log.message?.toLowerCase() || "").includes(f);
  };

  const providerOptions = channel === "whatsapp"
    ? PROVIDERS.filter(p => p.id === "whatsapp")
    : PROVIDERS.filter(p => p.id !== "whatsapp");

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Messaging</h1>
          <p className="text-sm text-zinc-500 mt-1">SMS & WhatsApp — send, track, manage</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-zinc-900/60 border border-zinc-800/50 rounded-lg p-0.5">
            <button
              onClick={() => setChannel("sms")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${channel === "sms" ? "bg-blue-500/20 text-blue-400" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              <MessageSquare className="w-3.5 h-3.5" /> SMS
            </button>
            <button
              onClick={() => setChannel("whatsapp")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${channel === "whatsapp" ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab.id ? "text-blue-400 border-blue-500" : "text-zinc-500 border-transparent hover:text-zinc-300"
            }`}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* COMPOSE TAB */}
      {activeTab === "compose" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="surface-card">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Send className="w-4 h-4 text-blue-400" />
                  {channel === "whatsapp" ? "Send WhatsApp" : "Send SMS"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSend} className="space-y-4">
                  <div>
                    <Label htmlFor="phone">Recipient Phone</Label>
                    <Input id="phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+254712345678" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label htmlFor="message">Message</Label>
                      <span className={`text-xs ${charCount > 160 ? "text-amber-400" : "text-zinc-500"}`}>
                        {charCount} / {channel === "whatsapp" ? "1000" : "160"}
                        {charCount > 160 && channel === "sms" && ` (${Math.ceil(charCount / 153)} SMS)`}
                      </span>
                    </div>
                    <textarea
                      id="message"
                      rows={4}
                      value={message}
                      onChange={e => { setMessage(e.target.value); setCharCount(e.target.value.length); }}
                      placeholder={channel === "whatsapp" ? "Type your WhatsApp message..." : "Type your SMS message..."}
                      className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                    />
                  </div>
                  <div>
                    <Label htmlFor="provider">Provider</Label>
                    <select
                      id="provider"
                      value={provider}
                      onChange={e => setProvider(e.target.value)}
                      className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      {providerOptions.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <Button type="submit" disabled={sending} className="w-full gap-2">
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {sending ? "Sending..." : `Send ${channel === "whatsapp" ? "WhatsApp" : "SMS"}`}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {/* Bulk Send */}
            <Card className="surface-card">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-400" /> Bulk Send
                </CardTitle>
                <CardDescription>Send to multiple customers at once</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Recipients</Label>
                  <select
                    value={bulkFilter}
                    onChange={e => setBulkFilter(e.target.value)}
                    className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="all">All customers</option>
                    <option value="active">Active only</option>
                    <option value="overdue">Overdue only</option>
                  </select>
                </div>
                <Button onClick={handleBulkSend} disabled={sending || !message} variant="outline" className="w-full gap-2">
                  <Zap className="w-4 h-4" />
                  {sending ? "Sending..." : "Send Bulk"}
                </Button>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card className="surface-card">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Total logs</span>
                  <span className="text-lg font-bold text-white">{logs.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Providers</span>
                  <span className="text-sm text-white">{providerOptions.length} available</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Templates</span>
                  <span className="text-sm text-white">{templates.length} saved</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* TEMPLATES TAB */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">
              {templates.length} template{templates.length !== 1 ? "s" : ""} — click to edit
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((t) => (
              <Card key={t.id} className="surface-card cursor-pointer hover:shadow-lg transition-all" onClick={() => {
                setEditingTemplate(t.id);
                setTemplateName(t.name);
                setTemplateBody(t.body);
              }}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{t.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${t.is_active ? "bg-green-500/10 text-green-400" : "bg-zinc-500/10 text-zinc-400"}`}>
                      {t.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-400 line-clamp-2">{t.body}</p>
                  <p className="text-xs text-zinc-600">Variables: {t.variables || "none"}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {editingTemplate && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
              <Card className="w-full max-w-lg surface-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white">Edit Template</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setEditingTemplate(null)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Name</Label>
                    <Input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Payment Reminder" />
                  </div>
                  <div>
                    <Label>Body</Label>
                    <textarea
                      rows={4}
                      value={templateBody}
                      onChange={e => setTemplateBody(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                    />
                  </div>
                  <Button onClick={handleSaveTemplate} className="w-full gap-2">
                    <Check className="w-4 h-4" /> Save Template
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* LOGS TAB */}
      {activeTab === "logs" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Search className="w-4 h-4 text-zinc-500" />
            <input
              value={logFilter}
              onChange={e => setLogFilter(e.target.value)}
              placeholder="Filter by phone or message..."
              className="flex-1 max-w-md bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            <Button variant="outline" size="sm" onClick={fetchLogs} className="gap-1">
              <RefreshCw className="w-3 h-3" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={clearLogs} className="gap-1 text-red-400">
              <Trash2 className="w-3 h-3" /> Clear All
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                  <th className="p-3 font-medium">Phone</th>
                  <th className="p-3 font-medium">Message</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Provider</th>
                  <th className="p-3 font-medium">Time</th>
                  <th className="p-3 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {logs.filter(filterLogs).map((log) => (
                  <tr key={log.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                    <td className="p-3 text-white font-mono text-xs">
                      {Array.isArray(log.to) ? log.to.join(", ") : log.to}
                    </td>
                    <td className="p-3 text-zinc-400 max-w-xs truncate">{log.message}</td>
                    <td className="p-3"><StatusBadge status={log.status} /></td>
                    <td className="p-3 text-zinc-500 text-xs capitalize">{log.provider || log.channel}</td>
                    <td className="p-3 text-zinc-500 text-xs">{new Date(log.created_at || log.timestamp).toLocaleString()}</td>
                    <td className="p-3">
                      <button onClick={() => handleDeleteLog(log.id)} className="text-zinc-600 hover:text-red-400">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
                {logs.filter(filterLogs).length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-zinc-600">No logs found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SETTINGS TAB */}
      {activeTab === "settings" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4">
            {PROVIDERS.map((prov) => {
              const isExpanded = expandedProvider === prov.id;
              const config = providerSettings[prov.id] || {};
              const isConfigured = config.configured || config.connected;
              return (
                <Card key={prov.id} className="surface-card">
                  <button
                    className="w-full p-4 flex items-center justify-between text-left"
                    onClick={() => setExpandedProvider(isExpanded ? null : prov.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isConfigured ? "bg-green-500/10" : "bg-zinc-500/10"}`}>
                        <prov.icon className={`w-4 h-4 ${isConfigured ? "text-green-400" : "text-zinc-400"}`} />
                      </div>
                      <div>
                        <span className="font-medium text-white">{prov.name}</span>
                        <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${isConfigured ? "bg-green-500/10 text-green-400" : "bg-zinc-500/10 text-zinc-400"}`}>
                          {isConfigured ? "Configured" : "Not configured"}
                        </span>
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-zinc-800/50 pt-3 space-y-2">
                      {Object.entries(config).map(([key, val]) => (
                        <div key={key} className="flex items-center justify-between text-sm">
                          <span className="text-zinc-400 capitalize">{key.replace(/_/g, " ")}</span>
                          <span className="text-zinc-300 font-mono text-xs">{typeof val === "boolean" ? (val ? "Yes" : "No") : String(val)}</span>
                        </div>
                      ))}
                      {Object.keys(config).length === 0 && (
                        <p className="text-zinc-500 text-sm">No configuration data available. Set API keys in Integration Settings.</p>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
