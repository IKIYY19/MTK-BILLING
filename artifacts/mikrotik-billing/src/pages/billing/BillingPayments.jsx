import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, DollarSign, X } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

const API = import.meta.env.VITE_API_URL || '/api';

export function BillingPayments() {
  const toast = useToast();
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ invoice_id: '', customer_id: '', amount: '', method: 'cash', reference: '', notes: '' });

  useEffect(() => {
    fetchPayments();
    axios.get(`${API}/billing/invoices`).then(r => {
      if (Array.isArray(r.data)) {
        setInvoices(r.data.filter(i => i.status !== 'paid'));
      }
    }).catch(err => console.error('Failed to load invoices:', err));
    axios.get(`${API}/billing/customers`).then(r => {
      if (Array.isArray(r.data)) {
        setCustomers(r.data);
      }
    }).catch(err => console.error('Failed to load customers:', err));
  }, []);

  const fetchPayments = async () => {
    try { const { data } = await axios.get(`${API}/billing/payments`); setPayments(data); } catch (error) { console.error('Failed to fetch payments:', error); toast.error('Failed to load payments', error.response?.data?.error || error.message); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const inv = invoices.find(i => i.id === form.invoice_id);
    await axios.post(`${API}/billing/payments`, {
      invoice_id: form.invoice_id,
      customer_id: inv?.customer_id || form.customer_id,
      amount: parseFloat(form.amount),
      method: form.method,
      reference: form.reference,
      notes: form.notes,
    });
    setShowForm(false);
    setForm({ invoice_id: '', customer_id: '', amount: '', method: 'cash', reference: '', notes: '' });
    fetchPayments();
  };

  const totalReceived = payments.reduce((s, p) => s + p.amount, 0);

  const methodColors = { cash: 'text-green-400', bank: 'text-blue-400', mobile_money: 'text-purple-400', card: 'text-amber-400', other: 'text-slate-400' };

  return (
    <div className="billing-page">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white gradient-text">Payments ({payments.length})</h2>
          <p className="text-slate-400 mt-1">Total received: <span className="text-green-400 font-semibold">KES {totalReceived.toFixed(2)}</span></p>
        </div>
        <Button onClick={() => setShowForm(true)} className="btn-gradient-primary flex items-center gap-2">
          <Plus className="w-5 h-5" /> Record Payment
        </Button>
      </div>

      {payments.length === 0 ? (
        <div className="billing-list-empty">No payments recorded yet.</div>
      ) : (
        <div className="billing-table-wrap">
          <table className="billing-data-table">
            <thead><tr><th>Receipt</th><th>Customer</th><th>Invoice</th><th>Method</th><th>Reference</th><th>Received</th><th className="numeric-cell">Amount</th></tr></thead>
            <tbody>{payments.map((pay) => (
              <tr key={pay.id}>
                <td className="billing-primary-cell">{pay.receipt_number || "—"}</td>
                <td>{pay.customer?.name || "Unknown"}</td>
                <td>{pay.invoice?.invoice_number || "—"}</td>
                <td><span className={`billing-method ${methodColors[pay.method] || ""}`}>{(pay.method || "other").replaceAll("_", " ")}</span></td>
                <td className="billing-mono-cell">{pay.reference || "—"}</td>
                <td>{pay.received_at ? new Date(pay.received_at).toLocaleString() : "—"}</td>
                <td className="numeric-cell billing-amount-cell">KES {(Number(pay.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <Card className="card-glow w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader className="border-b border-zinc-800">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5 text-green-400" /> Record Payment</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}><X className="w-5 h-5" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4 pt-6">
                <div>
                  <Label htmlFor="invoice">Invoice *</Label>
                  <select id="invoice" required value={form.invoice_id} onChange={e => {
                    const inv = invoices.find(i => i.id === e.target.value);
                    setForm({...form, invoice_id: e.target.value, amount: inv ? (inv.total - (inv.paid_amount || 0)).toFixed(2) : ''});
                  }} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background">
                    <option value="">Select outstanding invoice</option>
                    {invoices.map(inv => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoice_number} — {inv.customer?.name} — Balance: KES {(inv.total - (inv.paid_amount || 0)).toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="amount">Amount *</Label>
                  <Input id="amount" type="number" step="0.01" required value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
                </div>
                <div>
                  <Label htmlFor="method">Payment Method</Label>
                  <select id="method" value={form.method} onChange={e => setForm({...form, method: e.target.value})}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background">
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="mobile_money">Mobile Money</option>
                    <option value="card">Card</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="reference">Reference / Transaction ID</Label>
                  <Input id="reference" value={form.reference} onChange={e => setForm({...form, reference: e.target.value})} placeholder="Optional" />
                </div>
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <textarea id="notes" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows="2"
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background resize-none" />
                </div>
                <div className="flex gap-3 pt-4 border-t border-zinc-800">
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1">Cancel</Button>
                  <Button type="submit" className="btn-gradient-primary flex-1">Record Payment</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
