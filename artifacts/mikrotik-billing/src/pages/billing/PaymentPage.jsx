import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Smartphone, Building2, CreditCard, Banknote, CheckCircle, Clock, AlertTriangle, ArrowLeft, Copy, ExternalLink } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

export function PaymentPage() {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [methods, setMethods] = useState([]);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [stkStatus, setStkStatus] = useState(null);
  const [polling, setPolling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [methodsError, setMethodsError] = useState("");

  useEffect(() => {
    fetchInvoice();
    fetchMethods();
  }, [invoiceId]);

  const fetchInvoice = async () => {
    try {
      const { data } = await axios.get(`${API}/billing/invoices`);
      const inv = data.data?.find(i => i.id === invoiceId) || data.find(i => i.id === invoiceId);
      if (inv) {
        setInvoice(inv);
        setAmount(inv.balance?.toString() || inv.total.toString());
      }
    } catch (e) { console.error(e); }
  };

  const fetchMethods = async () => {
    try {
      const { data } = await axios.get(`${API}/payments/methods`);
      const configuredMethods = Array.isArray(data.methods)
        ? data.methods.filter((method) => method.enabled)
        : [];
      setMethods(configuredMethods);
      setSelectedMethod(configuredMethods[0]?.id || null);
      setMethodsError(
        configuredMethods.length
          ? ""
          : "No payment methods are configured. Ask an administrator to configure a provider.",
      );
    } catch (e) {
      setMethods([]);
      setSelectedMethod(null);
      setMethodsError(
        e.response?.data?.error || "Could not load configured payment methods.",
      );
    }
  };

  const initiateMpesa = async () => {
    if (!phone || !amount) {return;}
    setProcessing(true);
    setStkStatus(null);

    try {
      const { data } = await axios.post(`${API}/payments/mpesa/stk`, {
        phone,
        amount: parseFloat(amount),
        invoice_id: invoiceId,
        customer_id: invoice?.customer_id,
      });

      if (data.success) {
        setStkStatus({ pending: true, checkoutRequestId: data.checkoutRequestId, message: data.message || 'STK Push sent' });
        if (data.instructions) {setStkStatus(prev => ({ ...prev, instructions: data.instructions }));}

        // Start polling for status
        setPolling(true);
        pollStkStatus(data.checkoutRequestId);
      } else {
        setStkStatus({ error: data.message || 'Failed to send STK Push' });
      }
    } catch (e) {
      setStkStatus({ error: e.response?.data?.error || e.message });
    }
    setProcessing(false);
  };

  const pollStkStatus = async (checkoutRequestId) => {
    let attempts = 0;
    const maxAttempts = 30; // 2.5 minutes at 5s intervals

    const interval = setInterval(async () => {
      attempts++;
      try {
        const { data } = await axios.post(`${API}/payments/mpesa/stk/check`, { checkoutRequestId });

        if (data.success && data.status === 'completed') {
          setStkStatus({ completed: true, mpesaReceipt: data.mpesaReceipt, payment: data.payment });
          setPolling(false);
          clearInterval(interval);
          // Refresh invoice
          fetchInvoice();
        } else if (attempts >= maxAttempts) {
          setStkStatus({ timeout: true, message: 'Payment timed out. Please try again.' });
          setPolling(false);
          clearInterval(interval);
        }
      } catch (e) {
        if (attempts >= maxAttempts) {
          setStkStatus({ timeout: true });
          setPolling(false);
          clearInterval(interval);
        }
      }
    }, 5000);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const selected = methods.find(m => m.id === selectedMethod);

  return (
    <div className="bg-slate-900 min-h-screen">
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <button onClick={() => navigate('/billing-invoices')} className="text-slate-400 hover:text-white mb-6 flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Invoices
        </button>

        {invoice && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-6">
            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">{invoice.invoice_number}</h2>
                <p className="text-slate-400">{invoice.customer?.name}</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-white">KES {invoice.balance?.toFixed(2) || invoice.total.toFixed(2)}</div>
                <span className={`px-2 py-0.5 rounded text-xs ${
                  invoice.status === 'paid' ? 'bg-green-600/20 text-green-400' :
                  invoice.status === 'partial' ? 'bg-blue-600/20 text-blue-400' :
                  'bg-amber-600/20 text-amber-400'
                }`}>{invoice.status}</span>
              </div>
            </div>
            {invoice.due_date && (
              <p className="text-sm text-slate-400 mt-2">Due: {invoice.due_date}</p>
            )}
          </div>
        )}

      {/* Payment Methods */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">Select Payment Method</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          {methods.map(method => (
            <button
              key={method.id}
              onClick={() => setSelectedMethod(method.id)}
              className={`flex items-center gap-4 p-4 rounded-lg border-2 text-left transition-all ${
                selectedMethod === method.id ? 'border-green-500 bg-green-600/10' : 'border-slate-700 hover:border-slate-600'
              }`}
            >
              <span className="text-2xl">{method.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-white font-medium truncate">{method.name}</div>
                <div className="text-sm text-slate-400 truncate">{method.description}</div>
                <div className="text-xs text-slate-500 mt-1">
                  Min: KES {method.min} • Max: KES {method.max.toLocaleString()}
                  {method.fee > 0 && ` • Fee: ${method.fee}%`}
                </div>
              </div>
              {selectedMethod === method.id && <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />}
            </button>
          ))}
        </div>
        {methodsError && (
          <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
            {methodsError}
          </div>
        )}

        {/* M-Pesa STK Push */}
        {selectedMethod === 'mpesa_stk' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">M-Pesa Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0712345678 or 254712345678"
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white text-lg"
              />
              <p className="text-xs text-slate-500 mt-1">Format: 07XX XXX XXX or 2547XX XXX XXX</p>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">Amount (KES)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white text-lg"
              />
            </div>
            <button
              onClick={initiateMpesa}
              disabled={processing || !phone || !amount}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2"
            >
              <Smartphone className="w-5 h-5" />
              {processing ? 'Sending STK Push...' : 'Pay with M-Pesa'}
            </button>

            {/* STK Status */}
            {stkStatus && (
              <div className={`mt-4 p-4 rounded-lg ${
                stkStatus.completed ? 'bg-green-600/20 border border-green-600/50' :
                stkStatus.error ? 'bg-red-600/20 border border-red-600/50' :
                stkStatus.timeout ? 'bg-amber-600/20 border border-amber-600/50' :
                'bg-blue-600/20 border border-blue-600/50'
              }`}>
                {stkStatus.completed && (
                  <div className="text-center">
                    <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                    <div className="text-green-400 font-semibold">Payment Successful!</div>
                    <div className="text-sm text-green-300">Receipt: {stkStatus.mpesaReceipt}</div>
                  </div>
                )}
                {stkStatus.pending && (
                  <div className="text-center">
                    <Clock className="w-8 h-8 text-blue-400 mx-auto mb-2 animate-pulse" />
                    <div className="text-blue-400 font-semibold">Check your phone</div>
                    <div className="text-sm text-blue-300">Enter M-Pesa PIN to complete payment</div>
                    {stkStatus.instructions && (
                      <div className="text-xs text-blue-300 mt-2">{stkStatus.instructions}</div>
                    )}
                    {polling && <div className="text-xs text-blue-400 mt-2">Checking payment status...</div>}
                  </div>
                )}
                {stkStatus.error && (
                  <div className="text-center">
                    <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                    <div className="text-red-400 font-semibold">Payment Failed</div>
                    <div className="text-sm text-red-300">{stkStatus.error}</div>
                  </div>
                )}
                {stkStatus.timeout && (
                  <div className="text-center">
                    <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                    <div className="text-amber-400 font-semibold">Payment Timed Out</div>
                    <div className="text-sm text-amber-300">{stkStatus.message}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* M-Pesa Paybill */}
        {selectedMethod === 'mpesa_paybill' && (
          <div className="space-y-4">
            <div className="bg-green-600/10 border border-green-600/30 rounded-lg p-4">
              <h4 className="text-green-400 font-semibold mb-3">How to Pay via M-Pesa Paybill</h4>
              <ol className="text-sm text-slate-300 space-y-2 list-decimal list-inside">
                <li>Go to M-Pesa on your phone</li>
                <li>Select <strong>Lipa Na M-Pesa</strong></li>
                <li>Select <strong>Paybill</strong></li>
                <li>Enter Business Number: <strong className="text-white">{selected?.paybill || 'Not configured'}</strong>
                  {selected?.paybill && <button onClick={() => copyToClipboard(selected.paybill)} className="ml-2 text-xs text-blue-400 hover:text-blue-300">
                    {copied ? 'Copied!' : 'Copy'}
                  </button>}
                </li>
                <li>Enter Account No: <strong className="text-white">{invoice?.invoice_number || 'Your invoice number'}</strong></li>
                <li>Enter Amount: <strong className="text-white">KES {amount}</strong></li>
                <li>Enter M-Pesa PIN and confirm</li>
              </ol>
            </div>
            <p className="text-xs text-slate-500">After payment, your invoice will be updated automatically within 2-5 minutes.</p>
          </div>
        )}

        {/* Bank Transfer */}
        {selectedMethod === 'bank_transfer' && (
          <div className="space-y-4">
            <div className="bg-blue-600/10 border border-blue-600/30 rounded-lg p-4">
              <h4 className="text-blue-400 font-semibold mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Bank Transfer Details
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Bank</span>
                  <span className="text-white">{selected?.bank_details?.bank_name || 'Not configured'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Account Name</span>
                  <span className="text-white">{selected?.bank_details?.account_name || 'Not configured'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Account Number</span>
                  <span className="text-white">{selected?.bank_details?.account_number || 'Not configured'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Branch</span>
                  <span className="text-white">{selected?.bank_details?.branch || 'Not configured'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Swift Code</span>
                  <span className="text-white">{selected?.bank_details?.swift_code || 'Not configured'}</span>
                </div>
              </div>
            </div>
            <div className="bg-amber-600/10 border border-amber-600/30 rounded-lg p-3">
              <p className="text-xs text-amber-300">
                ⚠️ Use <strong>{invoice?.invoice_number}</strong> as payment reference. 
                Payment will be confirmed within 2-4 hours during business hours.
              </p>
            </div>
          </div>
        )}

        {/* Cash */}
        {selectedMethod === 'cash' && (
          <div className="bg-green-600/10 border border-green-600/30 rounded-lg p-4">
            <h4 className="text-green-400 font-semibold mb-3 flex items-center gap-2">
              <Banknote className="w-4 h-4" /> Cash Payment
            </h4>
            <p className="text-sm text-slate-300">Visit our office to pay cash:</p>
            <ul className="text-sm text-slate-300 mt-2 space-y-1">
              <li>📍 Location: Moi Avenue, Nairobi</li>
              <li>🕐 Hours: Mon-Fri 8:00 AM - 5:00 PM</li>
              <li>📞 Call: +254 700 000 000 to confirm</li>
            </ul>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
