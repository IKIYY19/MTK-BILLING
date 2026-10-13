/**
 * PaystackModal.jsx
 * Paystack hosted checkout modal — opens Paystack's secure page,
 * then polls verify endpoint after return.
 */
import { useState, useRef, useEffect } from 'react';
import { X, CreditCard, CheckCircle2, XCircle, Loader2, RefreshCw, ExternalLink, DollarSign } from 'lucide-react';
import api from '../lib/api';

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 40; // 2 minutes

export default function PaystackModal({ open, onClose, onSuccess, customer, invoice, defaultAmount }) {
  const [step, setStep] = useState('form');  // form | redirect | polling | success | failed
  const [amount, setAmount] = useState(defaultAmount || invoice?.balance || invoice?.total || '');
  const [currency, setCurrency] = useState('KES');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reference, setReference] = useState(null);
  const [authUrl, setAuthUrl] = useState(null);
  const [receiptData, setReceiptData] = useState(null);
  const [failReason, setFailReason] = useState('');
  const [pollCount, setPollCount] = useState(0);

  const pollRef = useRef(null);
  const popupRef = useRef(null);
  const popupCheckRef = useRef(null);

  useEffect(() => { if (!open) reset(); }, [open]);

  function reset() {
    setStep('form'); setError(''); setLoading(false);
    setReference(null); setAuthUrl(null); setReceiptData(null);
    setFailReason(''); setPollCount(0);
    clearInterval(pollRef.current);
    clearInterval(popupCheckRef.current);
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
  }

  function stopPolling() {
    clearInterval(pollRef.current);
    clearInterval(popupCheckRef.current);
  }

  async function startPolling(ref) {
    let polls = 0;
    pollRef.current = setInterval(async () => {
      polls++;
      setPollCount(polls);
      if (polls >= MAX_POLLS) {
        stopPolling();
        setFailReason('Payment verification timed out. If you completed the payment, contact support with reference: ' + ref);
        setStep('failed');
        return;
      }
      try {
        const res = await api.post('/payments/paystack/verify', { reference: ref });
        const data = res.data;
        if (data.success && data.status === 'completed') {
          stopPolling();
          setReceiptData(data);
          setStep('success');
          onSuccess?.(data.payment || data);
        } else if (data.status && data.status !== 'pending' && data.status !== 'completed') {
          stopPolling();
          setFailReason(data.message || 'Payment was not successful.');
          setStep('failed');
        }
      } catch { /* keep polling */ }
    }, POLL_INTERVAL_MS);
  }

  async function handleInitialize() {
    setError('');
    if (!amount || parseFloat(amount) <= 0) return setError('Amount must be greater than 0');
    setLoading(true);
    try {
      const res = await api.post('/payments/paystack/initialize', {
        amount: parseFloat(amount),
        currency,
        customer_id: customer?.id,
        invoice_id: invoice?.id || null,
        email: customer?.email,
      });
      const data = res.data;
      if (data.success && data.authorizationUrl) {
        setReference(data.reference);
        setAuthUrl(data.authorizationUrl);
        setStep('redirect');
      } else {
        setError(data.error || 'Failed to initialize payment');
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to initialize payment');
    } finally {
      setLoading(false);
    }
  }

  function openPaystackPopup() {
    setStep('polling');
    const popup = window.open(authUrl, 'Paystack', 'width=500,height=700,scrollbars=yes,resizable=yes');
    popupRef.current = popup;

    // Start polling verify endpoint
    startPolling(reference);

    // Also watch for popup close
    popupCheckRef.current = setInterval(() => {
      if (popup && popup.closed) {
        clearInterval(popupCheckRef.current);
        // Popup closed — do a final check after short delay
        setTimeout(async () => {
          try {
            const res = await api.post('/payments/paystack/verify', { reference });
            const data = res.data;
            if (data.success && data.status === 'completed') {
              stopPolling();
              setReceiptData(data);
              setStep('success');
              onSuccess?.(data.payment || data);
            }
            // If not paid, polling continues until timeout
          } catch { /* keep polling */ }
        }, 1500);
      }
    }, 1000);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && step !== 'polling' && onClose()}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div className="relative w-full max-w-md bg-gradient-to-br from-[#1a1c2e] to-[#0f1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-green-900/30 to-green-800/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center text-xl">💳</div>
            <div>
              <h2 className="text-white font-bold text-lg">Paystack</h2>
              <p className="text-gray-400 text-xs">Card, Bank Transfer, USSD & Mobile Money</p>
            </div>
          </div>
          {step !== 'polling' && (
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {customer && (
          <div className="px-6 py-3 bg-white/[0.02] border-b border-white/[0.06] flex items-center justify-between text-sm">
            <span className="text-gray-400">Customer: <span className="text-white font-medium">{customer.name}</span></span>
            {invoice && <span className="text-gray-400">Invoice: <span className="text-amber-400 font-medium">{invoice.invoice_number}</span></span>}
          </div>
        )}

        {/* FORM */}
        {step === 'form' && (
          <div className="p-6 space-y-5">
            {/* Amount */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-green-400" /> Amount
              </label>
              <div className="flex gap-2">
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  className="px-3 py-3 bg-white/[0.04] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500 cursor-pointer"
                >
                  <option value="KES" className="bg-[#10121a]">KES</option>
                  <option value="NGN" className="bg-[#10121a]">NGN</option>
                  <option value="GHS" className="bg-[#10121a]">GHS</option>
                  <option value="ZAR" className="bg-[#10121a]">ZAR</option>
                  <option value="USD" className="bg-[#10121a]">USD</option>
                </select>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  min="1"
                  className="flex-1 px-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Payment channels info */}
            <div className="grid grid-cols-4 gap-2 py-1">
              {[
                { icon: '💳', label: 'Card' },
                { icon: '🏦', label: 'Bank' },
                { icon: '📱', label: 'USSD' },
                { icon: '💸', label: 'M-Money' },
              ].map(ch => (
                <div key={ch.label} className="flex flex-col items-center gap-1 px-2 py-2.5 bg-white/[0.03] rounded-xl border border-white/[0.06]">
                  <span className="text-lg">{ch.icon}</span>
                  <span className="text-xs text-gray-500">{ch.label}</span>
                </div>
              ))}
            </div>

            {/* Email notice */}
            {!customer?.email && (
              <div className="px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400/80 text-xs">
                ⚠️ Customer has no email address. A placeholder email will be used. For best results, add the customer's email.
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
              </div>
            )}

            <button
              onClick={handleInitialize}
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-900/30"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Initializing...</> : <><CreditCard className="w-4 h-4" /> Continue to Payment</>}
            </button>
            <p className="text-center text-xs text-gray-500">Secured by Paystack · PCI-DSS compliant</p>
          </div>
        )}

        {/* REDIRECT STEP — show checkout link */}
        {step === 'redirect' && (
          <div className="p-6 space-y-5 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <ExternalLink className="w-8 h-8 text-green-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg">Ready to Pay</h3>
                <p className="text-gray-400 text-sm">A secure Paystack checkout page will open</p>
              </div>
            </div>

            <div className="px-4 py-3 bg-white/[0.03] rounded-xl text-sm text-gray-400 text-left space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-500">Amount</span>
                <span className="text-white font-medium">{currency} {parseFloat(amount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Reference</span>
                <span className="text-green-400 font-mono text-xs">{reference}</span>
              </div>
            </div>

            <button
              onClick={openPaystackPopup}
              className="w-full py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-900/30"
            >
              <ExternalLink className="w-4 h-4" /> Open Paystack Checkout
            </button>
            <p className="text-xs text-gray-500">A popup will open. Complete payment there and return here.</p>
          </div>
        )}

        {/* POLLING */}
        {step === 'polling' && (
          <div className="p-6 space-y-5 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-green-400 animate-spin" />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg">Waiting for Payment</h3>
                <p className="text-gray-400 text-sm">Complete payment in the Paystack popup</p>
              </div>
            </div>

            <div className="px-4 py-3 bg-white/[0.03] rounded-xl text-sm text-gray-400 text-left space-y-1">
              <p>1. Select your <span className="text-white">payment method</span> in the popup</p>
              <p>2. Complete the <span className="text-white">payment</span></p>
              <p>3. Return here — this updates automatically</p>
            </div>

            <div className="text-xs text-gray-600">
              Reference: <span className="text-green-400 font-mono">{reference}</span>
            </div>

            <button
              onClick={openPaystackPopup}
              className="w-full py-3 rounded-xl font-medium text-green-400 border border-green-500/30 hover:bg-green-500/10 transition-colors flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" /> Re-open Paystack
            </button>
          </div>
        )}

        {/* SUCCESS */}
        {step === 'success' && (
          <div className="p-6 space-y-6 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-xl">Payment Successful!</h3>
                <p className="text-emerald-400 text-sm mt-1">Paystack payment confirmed</p>
              </div>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4 space-y-2 text-left text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Amount</span><span className="text-white font-medium">{currency} {parseFloat(amount).toLocaleString()}</span></div>
              {receiptData?.reference && <div className="flex justify-between"><span className="text-gray-400">Reference</span><span className="text-emerald-400 font-mono text-xs">{receiptData.reference}</span></div>}
              {receiptData?.channel && <div className="flex justify-between"><span className="text-gray-400">Channel</span><span className="text-white capitalize">{receiptData.channel}</span></div>}
              <div className="flex justify-between"><span className="text-gray-400">Method</span><span className="text-white">Paystack</span></div>
            </div>
            <button onClick={onClose} className="w-full py-3 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors">
              Done
            </button>
          </div>
        )}

        {/* FAILED */}
        {step === 'failed' && (
          <div className="p-6 space-y-5 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
                <XCircle className="w-12 h-12 text-red-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-xl">Payment Failed</h3>
                <p className="text-gray-400 text-sm mt-1">{failReason || 'The payment was not completed.'}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={reset} className="flex-1 py-3 rounded-xl font-semibold text-white bg-white/[0.06] hover:bg-white/[0.1] transition-colors flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" /> Try Again
              </button>
              <button onClick={onClose} className="flex-1 py-3 rounded-xl font-semibold text-gray-400 border border-white/10 hover:text-white transition-colors">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
