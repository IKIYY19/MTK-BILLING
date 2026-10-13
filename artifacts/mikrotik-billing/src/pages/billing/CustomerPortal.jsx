import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Smartphone, Wifi, Download, Upload, FileText, CreditCard, Clock, AlertTriangle, CheckCircle, DollarSign, MessageSquare } from 'lucide-react';
import { useToast } from '../../hooks/useToast';

const API = import.meta.env.VITE_API_URL || '/api';

export function CustomerPortal() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPay, setShowPay] = useState(false);
  const [payPhone, setPayPhone] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const [payResult, setPayResult] = useState(null);
  const [showTicket, setShowTicket] = useState(false);
  const [ticketForm, setTicketForm] = useState({ subject: '', description: '', category: 'general' });

  useEffect(() => { fetchData(); }, [customerId]);

  const fetchData = async () => {
    try {
      const { data } = await axios.get(`${API}/portal/${customerId}/dashboard`);
      setData(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handlePay = async () => {
    if (!payPhone || !payAmount) {return;}
    setPaying(true);
    setPayResult(null);

    try {
      const { data } = await axios.post(`${API}/portal/${customerId}/pay`, {
        phone: payPhone,
        amount: parseFloat(payAmount),
      });
      setPayResult(data);
      if (data.success) {
        // Poll for payment status
        setTimeout(() => fetchData(), 10000);
      }
    } catch (e) {
      setPayResult({ success: false, message: e.response?.data?.error || e.message });
    }
    setPaying(false);
  };

  const handleTicket = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/portal/${customerId}/tickets`, ticketForm);
      setShowTicket(false);
      setTicketForm({ subject: '', description: '', category: 'general' });
      toast.success('Ticket created', 'Your support ticket has been submitted');
    } catch (error) { console.error('Failed to create ticket:', error); toast.error('Failed to create ticket', error.response?.data?.error || error.message); }
  };

  if (loading) {return <div className="p-8 text-white">Loading...</div>;}
  if (!data) {return <div className="p-8 text-white">Customer not found</div>;}

  const quotaPercent = data.usage?.quota_used_percent ? parseInt(data.usage.quota_used_percent) : 0;
  const isThrottled = data.subscription?.throttled;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">{data.customer.name}</h2>
          <p className="text-slate-400">{data.customer.phone} • {data.customer.email}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowTicket(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Open Ticket
          </button>
          <button onClick={() => setShowPay(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2">
            <Smartphone className="w-4 h-4" /> Pay via M-Pesa
          </button>
        </div>
      </div>

      {/* Status Banner */}
      {isThrottled && (
        <div className="bg-amber-600/20 border border-amber-600/50 rounded-lg p-4 mb-6 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <div>
            <span className="text-amber-400 font-semibold">Service Throttled</span>
            <span className="text-amber-300 text-sm ml-2">Your speed has been reduced to 1M/1M</span>
          </div>
        </div>
      )}
      {data.outstanding_balance > 0 && (
        <div className="bg-red-600/20 border border-red-600/50 rounded-lg p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <div>
              <span className="text-red-400 font-semibold">Outstanding Balance</span>
              <span className="text-red-300 text-sm ml-2">KES {data.outstanding_balance.toFixed(2)}</span>
            </div>
          </div>
          <button onClick={() => setShowPay(true)} className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded text-sm">Pay Now</button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2 text-slate-400 text-sm">
            <Wifi className="w-4 h-4" /> Plan
          </div>
          <div className="text-white font-bold">{data.subscription?.plan_name || 'No plan'}</div>
          <div className="text-xs text-slate-500">{data.subscription?.speed}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2 text-slate-400 text-sm">
            <DollarSign className="w-4 h-4" /> Price
          </div>
          <div className="text-white font-bold">KES {data.subscription?.plan?.price || 0}</div>
          <div className="text-xs text-slate-500">per month</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2 text-slate-400 text-sm">
            <Download className="w-4 h-4" /> Usage
          </div>
          <div className="text-white font-bold">{data.usage?.total_gb || 0} GB</div>
          {data.usage?.quota_gb && <div className="text-xs text-slate-500">of {data.usage.quota_gb} GB</div>}
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2 text-slate-400 text-sm">
            <Clock className="w-4 h-4" /> Sessions
          </div>
          <div className="text-white font-bold">{data.usage?.session_count || 0}</div>
          <div className="text-xs text-slate-500">Avg: {data.usage?.avg_session_time}</div>
        </div>
      </div>

      {/* Quota Progress */}
      {data.usage?.quota_gb && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-slate-400">Monthly Quota Usage</span>
            <span className={`text-sm font-semibold ${quotaPercent >= 100 ? 'text-red-400' : quotaPercent >= 80 ? 'text-amber-400' : 'text-green-400'}`}>
              {quotaPercent}%
            </span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-3">
            <div className={`h-3 rounded-full ${quotaPercent >= 100 ? 'bg-red-500' : quotaPercent >= 80 ? 'bg-amber-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(100, quotaPercent)}%` }} />
          </div>
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>{data.usage.total_gb} GB used</span>
            <span>{data.usage.quota_gb} GB total</span>
          </div>
        </div>
      )}

      {/* Invoices */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-white font-semibold flex items-center gap-2"><FileText className="w-4 h-4" /> Invoices</h3>
        </div>
        {data.recent_invoices?.length === 0 ? (
          <div className="p-4 text-slate-500 text-sm">No invoices</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="text-left p-3">Invoice</th>
                <th className="text-left p-3">Amount</th>
                <th className="text-left p-3">Paid</th>
                <th className="text-left p-3">Balance</th>
                <th className="text-left p-3">Due Date</th>
                <th className="text-left p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_invoices?.map(inv => (
                <tr key={inv.id} className="border-t border-slate-700 hover:bg-slate-700/50">
                  <td className="p-3 text-blue-400 font-mono text-xs">{inv.invoice_number}</td>
                  <td className="p-3 text-white">KES {parseFloat(inv.amount || 0).toFixed(2)}</td>
                  <td className="p-3 text-green-400">KES {parseFloat(inv.paid_amount || 0).toFixed(2)}</td>
                  <td className={`p-3 font-semibold ${inv.balance > 0 ? 'text-red-400' : 'text-green-400'}`}>KES {parseFloat(inv.balance || 0).toFixed(2)}</td>
                  <td className="p-3 text-slate-400">{inv.due_date}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      inv.status === 'paid' ? 'bg-green-600/20 text-green-400' :
                      inv.status === 'partial' ? 'bg-blue-600/20 text-blue-400' :
                      'bg-amber-600/20 text-amber-400'
                    }`}>{inv.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent Payments */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-700">
          <h3 className="text-white font-semibold flex items-center gap-2"><CreditCard className="w-4 h-4" /> Recent Payments</h3>
        </div>
        {data.recent_payments?.length === 0 ? (
          <div className="p-4 text-slate-500 text-sm">No payments yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="text-left p-3">Receipt</th>
                <th className="text-left p-3">Amount</th>
                <th className="text-left p-3">Method</th>
                <th className="text-left p-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_payments?.map(pay => (
                <tr key={pay.id} className="border-t border-slate-700">
                  <td className="p-3 text-blue-400 font-mono text-xs">{pay.receipt_number}</td>
                  <td className="p-3 text-green-400 font-semibold">KES {parseFloat(pay.amount || 0).toFixed(2)}</td>
                  <td className="p-3 text-slate-300 capitalize">{pay.method.replace('_', ' ')}</td>
                  <td className="p-3 text-slate-400 text-xs">{new Date(pay.received_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Payment Modal */}
      {showPay && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-green-400" /> Pay via M-Pesa
              </h3>
              <button onClick={() => setShowPay(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Phone Number</label>
                <input value={payPhone} onChange={e => setPayPhone(e.target.value)} placeholder="0712345678"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Amount (KES)</label>
                <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  placeholder={data.outstanding_balance > 0 ? data.outstanding_balance.toFixed(2) : ''}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white" />
                {data.outstanding_balance > 0 && (
                  <button onClick={() => setPayAmount(data.outstanding_balance.toFixed(2))}
                    className="text-xs text-blue-400 hover:text-blue-300 mt-1">
                    Pay full balance: KES {data.outstanding_balance.toFixed(2)}
                  </button>
                )}
              </div>
              <button onClick={handlePay} disabled={paying || !payPhone || !payAmount}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2 rounded-lg">
                {paying ? 'Sending STK Push...' : 'Pay with M-Pesa'}
              </button>
              {payResult && (
                <div className={`p-3 rounded text-sm ${payResult.success ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'}`}>
                  {payResult.message || (payResult.success ? 'STK Push sent! Check your phone.' : 'Payment failed')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ticket Modal */}
      {showTicket && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg w-full max-w-md p-6">
            <h3 className="text-white font-semibold mb-4">Open Support Ticket</h3>
            <form onSubmit={handleTicket} className="space-y-4">
              <select value={ticketForm.category} onChange={e => setTicketForm({...ticketForm, category: e.target.value})}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white">
                <option value="general">General</option>
                <option value="no_internet">No Internet</option>
                <option value="slow">Slow Connection</option>
                <option value="billing">Billing Issue</option>
              </select>
              <input required value={ticketForm.subject} onChange={e => setTicketForm({...ticketForm, subject: e.target.value})}
                placeholder="Subject" className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white" />
              <textarea required value={ticketForm.description} onChange={e => setTicketForm({...ticketForm, description: e.target.value})}
                placeholder="Describe your issue..." rows="3" className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white" />
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowTicket(false)} className="flex-1 px-4 py-2 bg-slate-700 text-white rounded">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded">Submit</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
