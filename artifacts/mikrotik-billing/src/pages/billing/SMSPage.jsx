import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Send, Settings, FileText, MessageSquare, CheckCircle, XCircle, Clock, Eye, X } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

const API = import.meta.env.VITE_API_URL || '/api';

export function SMSPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('send');
  const [templates, setTemplates] = useState([]);
  const [logs, setLogs] = useState([]);
  const [settings, setSettings] = useState({});
  const [balance, setBalance] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState('africas_talking');

  // Send form
  const [sendTo, setSendTo] = useState('');
  const [sendTemplate, setSendTemplate] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  // Bulk SMS form
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkFilter, setBulkFilter] = useState('all');
  const [sendingBulk, setSendingBulk] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  // Template editing
  const [editingTemplate, setEditingTemplate] = useState(null);

  const providers = [
    { id: 'africas_talking', name: "Africa's Talking" },
    { id: 'smsleopard', name: 'SMSLeopard' },
    { id: 'bulksms_kenya', name: 'BulkSMS Kenya' },
    { id: 'nexmo', name: 'Nexmo (Vonage)' },
    { id: 'twilio', name: 'Twilio' },
    { id: 'whatsapp', name: 'WhatsApp' },
  ];

  useEffect(() => {
    fetchTemplates();
    fetchLogs();
    fetchSettings();
    fetchBalance();
  }, []);

  const fetchTemplates = async () => {
    try { const { data } = await axios.get(`${API}/sms/templates`); setTemplates(data); } catch (error) { console.error('Failed to fetch SMS templates:', error); toast.error('Failed to load templates', error.response?.data?.error || error.message); }
  };

  const fetchLogs = async () => {
    try { const { data } = await axios.get(`${API}/sms/logs`); setLogs(data.data || []); } catch (error) { console.error('Failed to fetch SMS logs:', error); toast.error('Failed to load logs', error.response?.data?.error || error.message); }
  };

  const fetchSettings = async () => {
    try { const { data } = await axios.get(`${API}/sms/settings`); setSettings(data); } catch (error) { console.error('Failed to fetch SMS settings:', error); toast.error('Failed to load settings', error.response?.data?.error || error.message); }
  };

  const fetchBalance = async () => {
    try { const { data } = await axios.get(`${API}/sms/balance`); setBalance(data); } catch (error) { console.error('Failed to fetch SMS balance:', error); toast.error('Failed to load balance', error.response?.data?.error || error.message); }
  };

  const handleSend = async () => {
    if (!sendTo) {return;}
    setSending(true);
    setSendResult(null);

    try {
      let result;
      if (sendTemplate) {
        // Extract phone from variables or use sendTo
        const customer = templates.find(t => t.id === sendTemplate);
        result = await axios.post(`${API}/sms/send-template`, {
          template_id: sendTemplate,
          to: sendTo,
          variables: { customer_name: 'Test', invoice_number: 'INV-TEST', amount: '100', due_date: '2026-05-01' },
          provider: selectedProvider,
        });
      } else {
        result = await axios.post(`${API}/sms/send`, { to: sendTo, message: customMessage, provider: selectedProvider });
      }
      setSendResult(result.data);
      fetchLogs();
      if (result.data.balance) {fetchBalance();}
    } catch (e) {
      setSendResult({ success: false, message: e.response?.data?.error || e.message });
    }
    setSending(false);
  };

  const handleSendBulk = async () => {
    if (!bulkMessage) {return;}
    setSendingBulk(true);
    setBulkResult(null);

    try {
      const result = await axios.post(`${API}/sms/send-bulk`, {
        message: bulkMessage,
        provider: selectedProvider,
        filter: bulkFilter,
      });
      setBulkResult(result.data);
      fetchLogs();
      toast.success(`Bulk SMS sent: ${result.data.successCount} successful, ${result.data.failCount} failed`);
    } catch (e) {
      setBulkResult({ success: false, message: e.response?.data?.error || e.message });
    }
    setSendingBulk(false);
  };

  const handleDeleteLog = async (id) => {
    try {
      await axios.delete(`${API}/sms/logs/${id}`);
      toast.success('Log deleted');
      fetchLogs();
    } catch (e) {
      toast.error('Failed to delete log', e.response?.data?.error || e.message);
    }
  };

  const handleClearAllLogs = async () => {
    if (!confirm('Are you sure you want to delete all SMS logs? This cannot be undone.')) {return;}
    try {
      await axios.delete(`${API}/sms/logs`);
      toast.success('All logs cleared');
      fetchLogs();
    } catch (e) {
      toast.error('Failed to clear logs', e.response?.data?.error || e.message);
    }
  };

  const handleSaveTemplate = async (template) => {
    try {
      await axios.put(`${API}/sms/templates/${template.id}`, template);
      setEditingTemplate(null);
      fetchTemplates();
      toast.success('Template saved', 'SMS template updated successfully');
    } catch (error) { console.error('Failed to save template:', error); toast.error('Failed to save template', error.response?.data?.error || error.message); }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white gradient-text">SMS Notifications</h2>
          <p className="text-sm text-slate-400">Multiple SMS Providers Supported</p>
        </div>
        <div className="flex items-center gap-4">
          {balance && (
            <Card className="card-gradient px-4 py-2">
              <span className="text-sm text-slate-400">Balance: </span>
              <span className="text-white font-semibold">{balance.balance} {balance.unit}</span>
              {balance.isSandbox && <span className="text-xs text-amber-400 ml-2">(Sandbox)</span>}
            </Card>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'send', label: 'Send SMS', icon: Send },
          { id: 'bulk', label: 'Bulk SMS', icon: MessageSquare },
          { id: 'templates', label: 'Templates', icon: FileText },
          { id: 'logs', label: 'SMS Logs', icon: MessageSquare },
          { id: 'settings', label: 'Settings', icon: Settings },
        ].map(tab => (
          <Button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            variant={activeTab === tab.id ? 'default' : 'outline'}
            className={activeTab === tab.id ? 'btn-gradient-primary' : ''}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </Button>
        ))}
      </div>

      {/* Send SMS Tab */}
      {activeTab === 'send' && (
        <Card className="card-gradient p-6 space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">SMS Provider</label>
            <select
              value={selectedProvider}
              onChange={e => setSelectedProvider(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            >
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Phone Number</label>
            <input
              value={sendTo}
              onChange={e => setSendTo(e.target.value)}
              placeholder="+254712345678"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Or Use Template</label>
            <select
              value={sendTemplate}
              onChange={e => setSendTemplate(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            >
              <option value="">Custom message</option>
              {templates.filter(t => t.is_active).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          {!sendTemplate && (
            <div>
              <label className="block text-sm text-slate-400 mb-1">Message</label>
              <textarea
                value={customMessage}
                onChange={e => setCustomMessage(e.target.value)}
                rows="3"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                placeholder="Type your message..."
              />
              <div className="text-xs text-slate-500 mt-1">{customMessage.length}/160 characters</div>
            </div>
          )}
          <Button
            onClick={handleSend}
            disabled={sending || (!sendTo) || (!sendTemplate && !customMessage)}
            className="btn-gradient-success flex items-center gap-2"
          >
            <Send className="w-4 h-4" /> {sending ? 'Sending...' : 'Send SMS'}
          </Button>

          {sendResult && (
            <div className={`mt-4 p-4 rounded ${sendResult.success ? 'bg-green-600/20 border border-green-600/50' : 'bg-red-600/20 border border-red-600/50'}`}>
              <div className="flex items-center gap-2">
                {sendResult.success ? <CheckCircle className="w-5 h-5 text-green-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
                <span className={sendResult.success ? 'text-green-400' : 'text-red-400'}>{sendResult.message}</span>
              </div>
              {sendResult.isSandbox && (
                <p className="text-xs text-amber-300 mt-1">Sandbox mode — SMS was logged but not actually sent</p>
              )}
              {sendResult.results?.[0] && (
                <div className="mt-2 text-xs text-slate-300">
                  <div>To: {sendResult.results[0].phoneNumber}</div>
                  <div>Status: {sendResult.results[0].status}</div>
                  {sendResult.results[0].messageId && <div>Message ID: {sendResult.results[0].messageId}</div>}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Bulk SMS Tab */}
      {activeTab === 'bulk' && (
        <Card className="card-gradient p-6 space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">SMS Provider</label>
            <select
              value={selectedProvider}
              onChange={e => setSelectedProvider(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            >
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Send To</label>
            <select
              value={bulkFilter}
              onChange={e => setBulkFilter(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            >
              <option value="all">All Customers</option>
              <option value="active">Active Customers Only</option>
              <option value="overdue">Overdue Customers Only</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Message</label>
            <textarea
              value={bulkMessage}
              onChange={e => setBulkMessage(e.target.value)}
              rows="4"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              placeholder="Enter your message to send to all customers..."
            />
            <div className="text-xs text-slate-500 mt-1">{bulkMessage.length}/160 characters</div>
          </div>
          <Button
            onClick={handleSendBulk}
            disabled={sendingBulk || !bulkMessage}
            className="btn-gradient-success flex items-center gap-2"
          >
            <Send className="w-4 h-4" /> {sendingBulk ? 'Sending...' : 'Send Bulk SMS'}
          </Button>

          {bulkResult && (
            <div className={`mt-4 p-4 rounded ${bulkResult.success ? 'bg-green-600/20 border border-green-600/50' : 'bg-red-600/20 border border-red-600/50'}`}>
              <div className="flex items-center gap-2">
                {bulkResult.success ? <CheckCircle className="w-5 h-5 text-green-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
                <span className={bulkResult.success ? 'text-green-400' : 'text-red-400'}>
                  {bulkResult.success 
                    ? `Sent to ${bulkResult.total} customers: ${bulkResult.successCount} successful, ${bulkResult.failCount} failed` 
                    : bulkResult.message}
                </span>
              </div>
              {bulkResult.results && (
                <details className="mt-3">
                  <summary className="text-xs text-slate-400 cursor-pointer">View Details</summary>
                  <div className="mt-2 max-h-40 overflow-y-auto text-xs space-y-1">
                    {bulkResult.results.map((r, i) => (
                      <div key={i} className={`flex justify-between ${r.success ? 'text-green-300' : 'text-red-300'}`}>
                        <span>{r.customer} ({r.phone})</span>
                        <span>{r.success ? '✓' : `✗ ${r.error}`}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          {templates.map(tmpl => (
            <Card key={tmpl.id} className="card-gradient p-4">
              {editingTemplate === tmpl.id ? (
                <div className="space-y-3">
                  <textarea
                    value={tmpl.body}
                    onChange={e => setEditingTemplate({ ...tmpl, body: e.target.value })}
                    rows="3"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm font-mono"
                  />
                  <div className="flex gap-2">
                    <Button onClick={() => handleSaveTemplate(editingTemplate)} className="btn-gradient-success text-sm">Save</Button>
                    <Button onClick={() => setEditingTemplate(null)} variant="outline" className="text-sm">Cancel</Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-white font-semibold">{tmpl.name}</h4>
                      <span className={`px-2 py-0.5 rounded text-xs ${tmpl.is_active ? 'bg-green-600/20 text-green-400' : 'bg-slate-600/20 text-slate-400'}`}>
                        {tmpl.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <Button onClick={() => setEditingTemplate(tmpl)} variant="ghost" className="text-blue-400 text-sm">Edit</Button>
                  </div>
                  <pre className="text-sm text-slate-300 font-mono whitespace-pre-wrap bg-slate-900 p-3 rounded">{tmpl.body}</pre>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === 'logs' && (
        <Card className="card-gradient overflow-hidden">
          <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
            <h3 className="text-white font-semibold">SMS Logs</h3>
            {logs.length > 0 && (
              <Button
                onClick={handleClearAllLogs}
                variant="outline"
                className="text-red-400 border-red-400/30 hover:bg-red-400/10 text-sm"
              >
                Clear All Logs
              </Button>
            )}
          </div>
          {logs.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No SMS sent yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-900/50 text-slate-400">
                <tr>
                  <th className="text-left p-3">Time</th>
                  <th className="text-left p-3">To</th>
                  <th className="text-left p-3">Message</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Cost</th>
                  <th className="text-left p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} className="border-t border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                    <td className="p-3 text-slate-400 text-xs">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="p-3 text-white text-xs">{log.to?.[0]}</td>
                    <td className="p-3 text-slate-300 text-xs max-w-xs truncate">{log.message}</td>
                    <td className="p-3">
                      <span className={`flex items-center gap-1 text-xs ${log.status === 'sent' ? 'text-green-400' : log.status === 'failed' ? 'text-red-400' : 'text-amber-400'}`}>
                        {log.status === 'sent' ? <CheckCircle className="w-3 h-3" /> : log.status === 'failed' ? <XCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {log.status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400 text-xs">{log.cost || '-'}</td>
                    <td className="p-3">
                      <button
                        onClick={() => handleDeleteLog(log.id)}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <Card className="card-gradient p-6 space-y-4">
          <CardHeader className="p-0 mb-4">
            <CardTitle>Africa's Talking Configuration</CardTitle>
          </CardHeader>
          <div className="bg-slate-900 rounded p-4 space-y-2 text-sm">
            <p className="text-slate-300">To enable real SMS (not sandbox), set these environment variables:</p>
            <div className="font-mono text-xs space-y-1">
              <div><span className="text-green-400">AT_API_KEY</span>=your_api_key_from_at_dashboard</div>
              <div><span className="text-green-400">AT_USERNAME</span>=your_at_username</div>
              <div><span className="text-green-400">AT_SENDER_ID</span>=YourSenderID</div>
              <div><span className="text-green-400">COMPANY_NAME</span>=your registered company name</div>
              <div><span className="text-green-400">MPESA_PAYBILL</span>=your assigned paybill</div>
              <div><span className="text-green-400">SUPPORT_PHONE</span>=+254700000000</div>
            </div>
            <p className="text-slate-500 text-xs mt-3">
              Get your API key from <a href="https://account.africastalking.com" target="_blank" rel="noreferrer" className="text-blue-400 underline">account.africastalking.com</a>
            </p>
          </div>
          <div className="bg-slate-900 rounded p-4">
            <h4 className="text-white font-medium mb-2">Current Settings</h4>
            <div className="text-sm space-y-1">
              <div className="flex justify-between"><span className="text-slate-400">Username</span><span className="text-white">{settings.username || 'Not configured'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Sender ID</span><span className="text-white">{settings.sender_id || 'Not configured'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Configured</span><span className={settings.is_configured ? 'text-green-400' : 'text-amber-400'}>{settings.is_configured ? 'Yes' : 'No'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Company</span><span className="text-white">{settings.company?.company_name || 'Not configured'}</span></div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
