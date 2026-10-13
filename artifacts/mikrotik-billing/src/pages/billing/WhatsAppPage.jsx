import { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  MessageCircle, Send, Settings, RefreshCw, Search, Trash2,
  ArrowLeft, Phone, Clock, CheckCircle2, XCircle, AlertTriangle,
  Users, Inbox, FileText, Zap, ChevronDown, ChevronRight,
  Copy, ExternalLink, Loader2, Wifi, WifiOff, Activity,
} from "lucide-react";
import { useToast } from "../../hooks/useToast";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

const API = import.meta.env.VITE_API_URL || "/api";

export function WhatsAppPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState("compose");
  const [loading, setLoading] = useState(true);

  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState("");
  const [settings, setSettings] = useState({});
  const [templates, setTemplates] = useState([]);
  const [inbound, setInbound] = useState([]);
  const [expandedInbound, setExpandedInbound] = useState(null);

  const [sendTo, setSendTo] = useState("");
  const [sendTemplate, setSendTemplate] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [charCount, setCharCount] = useState(0);

  const [replyTo, setReplyTo] = useState(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [replying, setReplying] = useState(false);

  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateName, setTemplateName] = useState("");
  const [templateBody, setTemplateBody] = useState("");

  const logsEndRef = useRef(null);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [settingRes] = await Promise.allSettled([
        axios.get(`${API}/sms/whatsapp/settings`),
      ]);
      if (settingRes.status === "fulfilled") {setSettings(settingRes.value.data);}
    } catch (e) {
      console.warn("Failed to fetch settings:", e);
    }
    fetchLogs();
    fetchTemplates();
    setLoading(false);
  };

  const fetchLogs = async () => {
    try {
      const { data } = await axios.get(`${API}/sms/logs?limit=200`);
      const all = data?.data || data || [];
      setLogs(all.filter(l => l.channel === "whatsapp" || l.channel === "whatsapp_inbound"));
      setInbound(all.filter(l => l.channel === "whatsapp_inbound"));
    } catch (e) {
      console.warn("Failed to fetch logs:", e);
    }
  };

  const fetchTemplates = async () => {
    try {
      const { data } = await axios.get(`${API}/sms/templates`);
      setTemplates((data || []).filter(t => t.is_active));
    } catch (e) {
      console.warn("Failed to fetch templates:", e);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!sendTo) {return;}
    setSending(true);
    setSendResult(null);
    try {
      if (sendTemplate) {
        const tpl = templates.find(t => t.id === sendTemplate);
        const { data } = await axios.post(`${API}/sms/whatsapp/send-template`, {
          to: sendTo, template_id: sendTemplate,
          variables: { name: "Customer", plan: "Active", invoice: "Pending" },
        });
        setSendResult(data);
      } else {
        const { data } = await axios.post(`${API}/sms/whatsapp/send`, {
          to: sendTo, message: customMessage,
        });
        setSendResult(data);
      }
      fetchLogs();
    } catch (e) {
      setSendResult({ success: false, message: e.response?.data?.error || "Send failed" });
    } finally { setSending(false); }
  };

  const handleReply = async () => {
    if (!replyTo || !replyMessage) {return;}
    setReplying(true);
    try {
      await axios.post(`${API}/sms/whatsapp/send`, {
        to: replyTo.from,
        message: replyMessage,
      });
      toast.success("Reply sent");
      setReplyTo(null);
      setReplyMessage("");
      fetchLogs();
    } catch (e) {
      toast.error(e.response?.data?.error || "Reply failed");
    } finally { setReplying(false); }
  };

  const handleSaveTemplate = async () => {
    if (!templateName || !templateBody) {return;}
    try {
      await axios.put(`${API}/sms/templates/${editingTemplate}`, {
        name: templateName,
        body: templateBody,
      });
      toast.success("Template saved");
      setEditingTemplate(null);
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

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  const filteredLogs = logs.filter(l => {
    const f = logFilter.toLowerCase();
    if (!f) {return true;}
    const phone = Array.isArray(l.to) ? l.to.join(" ") : (l.to || l.from || "");
    return phone.toLowerCase().includes(f) || (l.message || "").toLowerCase().includes(f);
  });

  const isConfigured = settings.is_configured || settings.configured;
  const phoneId = settings.phone_number_id || "—";
  const mode = settings.mode || (isConfigured ? "production" : "Not configured");

  const tabs = [
    { id: "compose", label: "Compose", icon: Send },
    { id: "inbox", label: `Inbox${inbound.length ? ` (${inbound.length})` : ""}`, icon: Inbox },
    { id: "templates", label: "Templates", icon: FileText },
    { id: "logs", label: "History", icon: Clock },
  ];

  if (loading) {return <div className="p-8 text-zinc-400">Loading...</div>;}

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#25D366] to-[#128C7E] flex items-center justify-center shadow-lg shadow-green-500/20">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            WhatsApp Business
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Meta Cloud API — send, receive, and manage conversations</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={fetchAll} className="gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Connection Status Bar */}
      <div className={`rounded-xl p-4 mb-6 border flex items-center justify-between ${isConfigured ? "bg-green-500/5 border-green-500/20" : "bg-amber-500/5 border-amber-500/20"}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isConfigured ? "bg-green-500/10" : "bg-amber-500/10"}`}>
            {isConfigured ? <Wifi className="w-5 h-5 text-green-400" /> : <WifiOff className="w-5 h-5 text-amber-400" />}
          </div>
          <div>
            <div className="text-white font-medium text-sm">
              {isConfigured ? "Connected to Meta Cloud API" : "API Not Configured"}
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              {isConfigured
                ? `Phone ID: ${phoneId} • ${mode === "production" ? "Production" : "Sandbox"}`
                : "Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID to activate"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full font-medium ${isConfigured ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isConfigured ? "bg-green-400 animate-pulse" : "bg-amber-400"}`} />
            {isConfigured ? "Active" : "Setup Required"}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab.id
                ? "text-[#25D366] border-[#25D366]"
                : "text-zinc-500 border-transparent hover:text-zinc-300"
            }`}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* COMPOSE TAB */}
      {activeTab === "compose" && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <Card className="surface-card">
              <CardHeader>
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <Send className="w-4 h-4 text-[#25D366]" /> Send WhatsApp Message
                </CardTitle>
                <CardDescription>Messages arrive in the recipient's WhatsApp with your business name</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSend} className="space-y-4">
                  <div className="flex gap-3">
                    <div className="flex-[2]">
                      <Label>Recipient Phone</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm text-zinc-500 shrink-0">+</span>
                        <Input
                          type="tel"
                          value={sendTo}
                          onChange={e => setSendTo(e.target.value)}
                          placeholder="254712345678"
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div className="flex-[3]">
                      <Label>Template (optional)</Label>
                      <select
                        value={sendTemplate}
                        onChange={e => setSendTemplate(e.target.value)}
                        className="w-full mt-1 bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/50"
                      >
                        <option value="">Custom message</option>
                        {templates.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {!sendTemplate && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label>Message</Label>
                        <span className="text-xs text-zinc-500">{charCount} chars</span>
                      </div>
                      <textarea
                        rows={3}
                        value={customMessage}
                        onChange={e => { setCustomMessage(e.target.value); setCharCount(e.target.value.length); }}
                        placeholder="Type your WhatsApp message..."
                        className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#25D366]/50 resize-none"
                      />
                    </div>
                  )}

                  {sendTemplate && (
                    <div className="bg-zinc-800/30 rounded-lg p-3 text-xs text-zinc-500">
                      <span className="text-zinc-400 font-medium">Using template:</span>{" "}
                      {templates.find(t => t.id === sendTemplate)?.name || "Unknown"} —
                      variables (name, plan, invoice) will be injected automatically.
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={sending || !sendTo || (!sendTemplate && !customMessage)}
                    className="w-full gap-2 bg-[#25D366] hover:bg-[#1fa855] text-black font-semibold"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {sending ? "Sending..." : "Send WhatsApp"}
                  </Button>
                </form>

                {sendResult && (
                  <div className={`mt-4 p-3 rounded-lg flex items-start gap-2 text-sm ${sendResult.success ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-red-500/10 border border-red-500/20 text-red-400"}`}>
                    {sendResult.success ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                    <div>
                      <p className="font-medium">{sendResult.success ? "Message sent" : "Send failed"}</p>
                      <p className="text-xs opacity-80 mt-0.5">{sendResult.message}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {/* Quick Actions */}
            <Card className="surface-card">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Messages sent</span>
                  <span className="text-lg font-bold text-white">{logs.filter(l => l.channel === "whatsapp").length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Inbound messages</span>
                  <span className="text-lg font-bold text-white">{inbound.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Active templates</span>
                  <span className="text-lg font-bold text-white">{templates.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">API status</span>
                  <span className={`text-sm font-medium ${isConfigured ? "text-green-400" : "text-amber-400"}`}>
                    {isConfigured ? "Connected" : "Not configured"}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="surface-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#25D366]" /> Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 max-h-64 overflow-y-auto">
                {logs.slice(0, 5).map(log => (
                  <div key={log.id} className="px-4 py-2.5 border-b border-zinc-800/30 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white font-mono">
                        {Array.isArray(log.to) ? log.to[0] : log.from || log.to}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        log.status === "sent" ? "bg-blue-500/10 text-blue-400" : "bg-green-500/10 text-green-400"
                      }`}>{log.status}</span>
                    </div>
                    <p className="text-xs text-zinc-500 truncate mt-0.5">{log.message}</p>
                  </div>
                ))}
                {logs.length === 0 && (
                  <div className="p-4 text-center text-xs text-zinc-600">No messages yet</div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* INBOX TAB */}
      {activeTab === "inbox" && (
        <div className="space-y-4">
          {inbound.length === 0 ? (
            <Card className="surface-card">
              <CardContent className="p-12 text-center">
                <Inbox className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400 font-medium">No inbound messages yet</p>
                <p className="text-zinc-600 text-sm mt-1">Incoming WhatsApp messages will appear here</p>
              </CardContent>
            </Card>
          ) : (
            inbound.map((msg) => {
              const isOpen = expandedInbound === msg.id;
              return (
                <Card key={msg.id} className="surface-card">
                  <button
                    className="w-full p-4 text-left flex items-center justify-between"
                    onClick={() => setExpandedInbound(isOpen ? null : msg.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#25D366]/10 flex items-center justify-center">
                        <MessageCircle className="w-4 h-4 text-[#25D366]" />
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">{msg.from || "Unknown"}</p>
                        <p className="text-xs text-zinc-500">{new Date(msg.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                        {msg.status}
                      </span>
                      {isOpen ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-zinc-800/50 pt-3 space-y-3">
                      <div className="bg-zinc-800/30 rounded-lg p-3">
                        <p className="text-zinc-300 text-sm">{msg.message}</p>
                      </div>
                      {replyTo?.id === msg.id ? (
                        <div className="space-y-2">
                          <textarea
                            rows={2}
                            value={replyMessage}
                            onChange={e => setReplyMessage(e.target.value)}
                            placeholder="Type your reply..."
                            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#25D366]/50 resize-none"
                          />
                          <div className="flex gap-2">
                            <Button onClick={handleReply} disabled={replying} size="sm" className="gap-1 bg-[#25D366] hover:bg-[#1fa855] text-black font-semibold">
                              {replying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                              {replying ? "Sending..." : "Send Reply"}
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => { setReplyTo(null); setReplyMessage(""); }}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => { setReplyTo(msg); setReplyMessage(""); }} className="gap-1">
                          <Send className="w-3 h-3" /> Reply
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* TEMPLATES TAB */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          {templates.length === 0 ? (
            <Card className="surface-card">
              <CardContent className="p-12 text-center">
                <FileText className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400 font-medium">No templates saved</p>
                <p className="text-zinc-600 text-sm mt-1">Create templates in the SMS Templates section</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map(t => (
                <Card key={t.id} className="surface-card cursor-pointer hover:shadow-lg transition-all" onClick={() => {
                  setEditingTemplate(t.id); setTemplateName(t.name); setTemplateBody(t.body);
                }}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white text-sm">{t.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Active</span>
                    </div>
                    <p className="text-zinc-400 text-xs line-clamp-2">{t.body}</p>
                    {t.variables && (
                      <p className="text-zinc-600 text-[10px]">Variables: {t.variables}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {editingTemplate && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
              <Card className="w-full max-w-lg surface-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white text-base">Edit Template</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setEditingTemplate(null)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Template Name</Label>
                    <Input value={templateName} onChange={e => setTemplateName(e.target.value)} />
                  </div>
                  <div>
                    <Label>Message Body</Label>
                    <textarea
                      rows={4}
                      value={templateBody}
                      onChange={e => setTemplateBody(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/50 resize-none"
                    />
                  </div>
                  <Button onClick={handleSaveTemplate} className="w-full gap-2 bg-[#25D366] hover:bg-[#1fa855] text-black font-semibold">
                    Save Template
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* LOGS / HISTORY TAB */}
      {activeTab === "logs" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Search className="w-4 h-4 text-zinc-500" />
            <input
              value={logFilter}
              onChange={e => setLogFilter(e.target.value)}
              placeholder="Filter by phone or message..."
              className="flex-1 max-w-md bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#25D366]/50"
            />
            <span className="text-xs text-zinc-600">{filteredLogs.length} entries</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                  <th className="p-3 font-medium text-xs">Phone</th>
                  <th className="p-3 font-medium text-xs">Message</th>
                  <th className="p-3 font-medium text-xs">Status</th>
                  <th className="p-3 font-medium text-xs">Time</th>
                  <th className="p-3 font-medium text-xs w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map(log => (
                  <tr key={log.id} className="border-b border-zinc-800/30 hover:bg-zinc-800/20">
                    <td className="p-3 text-xs text-white font-mono">
                      {log.from ? (
                        <span className="flex items-center gap-1">
                          <ArrowLeft className="w-3 h-3 text-green-400" />
                          {log.from}
                        </span>
                      ) : (
                        Array.isArray(log.to) ? log.to[0] : log.to
                      )}
                    </td>
                    <td className="p-3 text-xs text-zinc-400 max-w-xs truncate">{log.message}</td>
                    <td className="p-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                        log.status === "sent" ? "bg-blue-500/10 text-blue-400" :
                        log.status === "delivered" ? "bg-green-500/10 text-green-400" :
                        log.status === "received" ? "bg-violet-500/10 text-violet-400" :
                        "bg-red-500/10 text-red-400"
                      }`}>{log.status}</span>
                    </td>
                    <td className="p-3 text-xs text-zinc-500">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="p-3">
                      <button onClick={() => handleDeleteLog(log.id)} className="text-zinc-600 hover:text-red-400">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredLogs.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-zinc-600 text-sm">No messages found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
