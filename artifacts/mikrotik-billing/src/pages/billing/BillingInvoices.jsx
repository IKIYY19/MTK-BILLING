import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Plus, Download, CreditCard, Receipt, FileText,
  X, Send, RefreshCw, CheckSquare, Square, Zap, AlertTriangle
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useToast } from '../../hooks/useToast';

const API = import.meta.env.VITE_API_URL || '/api';

function fmt(n) {
  return 'KES ' + (parseFloat(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 });
}

export function BillingInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({ customer_id: '', subscription_id: '', amount: '', tax: '' });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const toast = useToast();
  const [sendingPrompt, setSendingPrompt] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [inv, cust, pl] = await Promise.all([
        axios.get(`${API}/billing/invoices`),
        axios.get(`${API}/billing/customers`),
        axios.get(`${API}/billing/plans`),
      ]);
      setInvoices(Array.isArray(inv.data) ? inv.data : []);
      setCustomers(Array.isArray(cust.data) ? cust.data : []);
      setPlans(Array.isArray(pl.data) ? pl.data : []);
    } catch (e) {
      toast.error('Failed to load', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/billing/invoices`, {
        ...form, amount: parseFloat(form.amount), tax: parseFloat(form.tax || 0)
      });
      toast.success('Invoice created');
      setShowForm(false);
      setForm({ customer_id: '', subscription_id: '', amount: '', tax: '' });
      fetchAll();
    } catch (e) {
      toast.error('Failed to create invoice', e.response?.data?.error || e.message);
    }
  };

  const generateMonthly = async () => {
    if (!confirm('Generate invoices for all active subscriptions this month?')) return;
    setGenerating(true);
    try {
      const { data } = await axios.post(`${API}/billing/invoices/generate-monthly`);
      toast.success(`Generated ${data.created || 0} invoices`);
      fetchAll();
    } catch (e) {
      toast.error('Failed', e.response?.data?.error || e.message);
    } finally {
      setGenerating(false);
    }
  };

  const generateRecurring = async () => {
    if (!confirm('Run the recurring billing engine now? This will generate invoices for all active subscribers who don\'t have one yet this month.')) return;
    setGenerating(true);
    try {
      const { data } = await axios.post(`${API}/billing/invoices/generate-recurring`);
      toast.success(`Created ${data.total_generated || 0} invoices, skipped ${data.total_skipped || 0}`);
      fetchAll();
    } catch (e) {
      toast.error('Failed', e.response?.data?.error || e.message);
    } finally {
      setGenerating(false);
    }
  };

  const generateBulk = async () => {
    if (selected.size === 0) {
      toast.error('Select at least one customer');
      return;
    }
    setBulkLoading(true);
    try {
      const { data } = await axios.post(`${API}/billing/invoices/bulk-generate`, {
        customer_ids: [...selected],
        use_plan_price: true,
      });
      toast.success(`Created ${data.total_created} invoices, skipped ${data.total_skipped}`);
      setSelected(new Set());
      setShowBulk(false);
      fetchAll();
    } catch (e) {
      toast.error('Bulk generate failed', e.response?.data?.error || e.message);
    } finally {
      setBulkLoading(false);
    }
  };

  const sendPaymentPrompt = async (invoice) => {
    setSendingPrompt(invoice.id);
    try {
      await axios.post(`${API}/billing/customers/${invoice.customer_id}/payment-prompt`, {
        amount: invoice.balance,
        invoice_id: invoice.id
      });
      toast.success('M-Pesa prompt sent');
    } catch (e) {
      toast.error('Failed to send prompt', e.response?.data?.error || e.message);
    } finally {
      setSendingPrompt(false);
    }
  };

  const downloadPdf = (invoice) => {
    window.open(`${API}/billing/invoices/${invoice.id}/pdf`, '_blank');
  };

  const toggleSelect = (id) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const toggleAll = () => {
    if (selected.size === customers.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(customers.map(c => c.id)));
    }
  };

  const filtered = filter === 'all'
    ? invoices
    : filter === 'overdue'
      ? invoices.filter(i => i.status !== 'paid' && new Date(i.due_date) < new Date())
      : invoices.filter(i => i.status === filter);

  const totalOutstanding = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + (i.total - (i.paid_amount || 0)), 0);
  const overdueCount = invoices.filter(i => i.status !== 'paid' && new Date(i.due_date) < new Date()).length;

  const statusStyle = (inv) => {
    const isOverdue = inv.status !== 'paid' && new Date(inv.due_date) < new Date();
    if (isOverdue) return 'bg-red-600/20 text-red-400';
    const map = { paid: 'bg-green-600/20 text-green-400', partial: 'bg-blue-600/20 text-blue-400', pending: 'bg-amber-600/20 text-amber-400', cancelled: 'bg-zinc-600/20 text-zinc-400' };
    return map[inv.status] || 'bg-zinc-600/20 text-zinc-400';
  };

  const statusLabel = (inv) =>
    inv.status !== 'paid' && new Date(inv.due_date) < new Date() ? 'OVERDUE' : inv.status?.toUpperCase();

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white gradient-text">Invoices ({invoices.length})</h2>
          <p className="text-slate-400 mt-1">
            Outstanding: <span className="text-amber-400 font-semibold">{fmt(totalOutstanding)}</span>
            {overdueCount > 0 && (
              <span className="ml-3 text-red-400">
                · <AlertTriangle className="inline w-3 h-3 mb-0.5" /> {overdueCount} overdue
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="outline" size="sm" onClick={() => setShowBulk(true)} className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4" /> Bulk Generate
          </Button>
          <Button variant="outline" size="sm" onClick={generateRecurring} disabled={generating} className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" /> {generating ? 'Running...' : 'Run Recurring'}
          </Button>
          <Button variant="outline" size="sm" onClick={generateMonthly} disabled={generating} className="btn-gradient-success flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Generate Monthly
          </Button>
          <Button size="sm" onClick={() => setShowForm(true)} className="btn-gradient-primary flex items-center gap-2">
            <Receipt className="w-4 h-4" /> New Invoice
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {['all', 'pending', 'overdue', 'partial', 'paid'].map(f => (
          <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f)} className="capitalize">
            {f}
            {f === 'overdue' && overdueCount > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center leading-none">
                {overdueCount}
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* Invoice Grid */}
      {loading ? (
        <div className="p-6 space-y-3">{[1,2,3,4].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <p className="text-slate-500 text-lg">No invoices found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filtered.map(inv => (
            <Card key={inv.id} className="card-gradient overflow-hidden">
              <CardHeader className="border-b border-zinc-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-zinc-800/50 flex items-center justify-center">
                      <FileText className="w-3.5 h-3.5 text-zinc-500" />
                    </div>
                    <div>
                      <CardTitle className="text-sm text-blue-400 font-mono">{inv.invoice_number}</CardTitle>
                      <p className="text-xs text-zinc-500">{inv.customer?.name || inv.customer_name || 'Unknown'}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-bold ${statusStyle(inv)}`}>
                    {statusLabel(inv)}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-4 grid grid-cols-2 gap-3 text-sm border-t border-zinc-800">
                <div className="text-zinc-400">Total: <span className="text-white">{fmt(inv.total)}</span></div>
                <div className="text-zinc-400">Paid: <span className="text-emerald-400">{fmt(inv.paid_amount || 0)}</span></div>
                <div className="text-zinc-400">Balance: <span className={`font-semibold ${(inv.balance || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{fmt(inv.balance || 0)}</span></div>
                <div className="text-zinc-400">Due: <span className={`${inv.status !== 'paid' && new Date(inv.due_date) < new Date() ? 'text-red-400 font-semibold' : 'text-white'}`}>{inv.due_date}</span></div>
                {inv.tax_rate > 0 && (
                  <div className="text-zinc-400 col-span-2">
                    VAT ({inv.tax_rate}%): <span className="text-zinc-300">{fmt(inv.tax)}</span>
                  </div>
                )}
              </CardContent>
              <CardContent className="p-4 border-t border-zinc-800">
                <div className="flex gap-2 flex-wrap">
                  {/* PDF Download — always available */}
                  <Button size="sm" variant="outline" onClick={() => downloadPdf(inv)} className="flex items-center gap-1 text-xs">
                    <Download className="w-3 h-3" /> PDF
                  </Button>
                  {inv.status !== 'paid' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => sendPaymentPrompt(inv)}
                        disabled={sendingPrompt === inv.id}
                        className="flex items-center gap-1 text-xs"
                      >
                        <Send className="w-3 h-3" /> {sendingPrompt === inv.id ? '...' : 'M-Pesa'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/pay/${inv.id}`)}
                        className="flex items-center gap-1 text-xs"
                      >
                        <CreditCard className="w-3 h-3" /> Pay
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Invoice Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <Card className="card-glow w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader className="border-b border-zinc-800">
              <div className="flex items-center justify-between">
                <CardTitle>New Invoice</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}><X className="w-5 h-5" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4 pt-6">
                <div>
                  <Label>Customer *</Label>
                  <select required value={form.customer_id} onChange={e => setForm({...form, customer_id: e.target.value})}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Select customer</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Plan (auto-fills price)</Label>
                  <select onChange={e => {
                    const plan = plans.find(p => p.id === e.target.value);
                    if (plan) setForm({...form, amount: plan.price.toString(), tax: (plan.price * 0.16).toFixed(2)});
                  }} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Select plan</option>
                    {plans.map(p => <option key={p.id} value={p.id}>{p.name} — KES {p.price}/mo</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Amount *</Label>
                    <Input type="number" step="0.01" required value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
                  </div>
                  <div>
                    <Label>VAT (auto)</Label>
                    <Input type="number" step="0.01" value={form.tax} onChange={e => setForm({...form, tax: e.target.value})} placeholder="Auto from tax rate" />
                  </div>
                </div>
                <div className="flex gap-3 pt-4 border-t border-zinc-800">
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1">Cancel</Button>
                  <Button type="submit" className="btn-gradient-primary flex-1">Create Invoice</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bulk Generate Modal */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <Card className="card-glow w-full max-w-2xl max-h-[85vh] flex flex-col">
            <CardHeader className="border-b border-zinc-800 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CheckSquare className="w-5 h-5 text-amber-400" /> Bulk Invoice Generation
                  </CardTitle>
                  <p className="text-sm text-zinc-400 mt-1">Select customers to generate invoices for (uses their active plan price)</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setShowBulk(false); setSelected(new Set()); }}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4">
              <div className="flex items-center gap-3 mb-4 p-3 bg-zinc-800/50 rounded-lg">
                <Button variant="ghost" size="sm" onClick={toggleAll} className="flex items-center gap-2">
                  {selected.size === customers.length ? <CheckSquare className="w-4 h-4 text-amber-400" /> : <Square className="w-4 h-4" />}
                  {selected.size === customers.length ? 'Deselect All' : 'Select All'}
                </Button>
                <span className="text-sm text-zinc-400">{selected.size} of {customers.length} selected</span>
              </div>
              <div className="space-y-2">
                {customers.map(c => (
                  <div
                    key={c.id}
                    onClick={() => toggleSelect(c.id)}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      selected.has(c.id) ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-zinc-800/30 border border-transparent hover:bg-zinc-800/60'
                    }`}
                  >
                    {selected.has(c.id) ? <CheckSquare className="w-5 h-5 text-amber-400 flex-shrink-0" /> : <Square className="w-5 h-5 text-zinc-600 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white text-sm truncate">{c.name}</p>
                      <p className="text-xs text-zinc-400">{c.phone} · Balance: {fmt(c.outstanding_balance || 0)}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${c.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-zinc-600/20 text-zinc-400'}`}>
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
            <div className="p-4 border-t border-zinc-800 flex gap-3 flex-shrink-0">
              <Button variant="outline" onClick={() => { setShowBulk(false); setSelected(new Set()); }} className="flex-1">Cancel</Button>
              <Button
                onClick={generateBulk}
                disabled={bulkLoading || selected.size === 0}
                className="btn-gradient-primary flex-1 flex items-center gap-2"
              >
                <Zap className="w-4 h-4" />
                {bulkLoading ? 'Generating...' : `Generate for ${selected.size} customer${selected.size !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
