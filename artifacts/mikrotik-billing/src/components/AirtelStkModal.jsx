/**
 * AirtelStkModal.jsx
 * Airtel Money STK Push payment modal — mirrors MpesaStkModal pattern
 */
import { useState, useRef, useEffect } from 'react';
import { X, Smartphone, CheckCircle2, XCircle, Loader2, RefreshCw, Phone, DollarSign } from 'lucide-react';
import api from '../lib/api';

const MAX_WAIT_SECS = 120;
const POLL_INTERVAL_MS = 5000;

const COUNTRY_PREFIXES = {
  KE: { code: '+254', placeholder: '07xx xxx xxx', label: 'Kenya' },
  UG: { code: '+256', placeholder: '07xx xxx xxx', label: 'Uganda' },
  TZ: { code: '+255', placeholder: '07xx xxx xxx', label: 'Tanzania' },
  RW: { code: '+250', placeholder: '07xx xxx xxx', label: 'Rwanda' },
  ZM: { code: '+260', placeholder: '09x xxx xxxx', label: 'Zambia' },
};

export default function AirtelStkModal({ open, onClose, onSuccess, customer, invoice, defaultAmount }) {
  const [step, setStep] = useState('form');   // form | waiting | success | failed
  const [phone, setPhone] = useState(customer?.phone || '');
  const [amount, setAmount] = useState(defaultAmount || invoice?.balance || invoice?.total || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [transactionId, setTransactionId] = useState(null);
  const [receiptData, setReceiptData] = useState(null);
  const [failReason, setFailReason] = useState('');

  const pollRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open]);

  function reset() {
    setStep('form');
    setError('');
    setLoading(false);
    setElapsed(0);
    setTransactionId(null);
    setReceiptData(null);
    setFailReason('');
    clearInterval(pollRef.current);
    clearInterval(timerRef.current);
  }

  function startPolling(txId) {
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed(prev => {
        if (prev + 1 >= MAX_WAIT_SECS) {
          stopPolling();
          setStep('failed');
          setFailReason('No response from Airtel Money. Please try again.');
          return prev;
        }
        return prev + 1;
      });
    }, 1000);

    pollRef.current = setInterval(async () => {
      try {
        const res = await api.post('/payments/airtel/stk/check', { transactionId: txId });
        const data = res.data;
        if (data.success && data.status === 'completed') {
          stopPolling();
          setReceiptData(data.payment);
          setStep('success');
          onSuccess?.(data.payment);
        } else if (!data.success && data.status === 'failed') {
          stopPolling();
          setFailReason(data.message || 'Payment was declined or cancelled.');
          setStep('failed');
        }
      } catch {
        // network blip — keep polling
      }
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    clearInterval(pollRef.current);
    clearInterval(timerRef.current);
  }

  async function handleSend() {
    setError('');
    if (!phone.trim()) return setError('Phone number is required');
    if (!amount || parseFloat(amount) <= 0) return setError('Amount must be greater than 0');
    setLoading(true);
    try {
      const res = await api.post('/payments/airtel/stk', {
        phone: phone.trim(),
        amount: parseFloat(amount),
        invoice_id: invoice?.id || null,
        customer_id: customer?.id,
      });
      const data = res.data;
      if (data.success) {
        setTransactionId(data.transactionId);
        setStep('waiting');
        startPolling(data.transactionId);
      } else {
        setError(data.error || data.message || 'Failed to send STK push');
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to send STK push');
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const progress = Math.min((elapsed / MAX_WAIT_SECS) * 100, 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && step !== 'waiting' && onClose()}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div className="relative w-full max-w-md bg-gradient-to-br from-[#1a1c2e] to-[#0f1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-red-900/30 to-red-800/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center text-xl">📲</div>
            <div>
              <h2 className="text-white font-bold text-lg">Airtel Money</h2>
              <p className="text-gray-400 text-xs">STK Push Payment</p>
            </div>
          </div>
          {step !== 'waiting' && (
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Customer + Invoice info */}
        {customer && (
          <div className="px-6 py-3 bg-white/[0.02] border-b border-white/[0.06] flex items-center justify-between text-sm">
            <span className="text-gray-400">Customer: <span className="text-white font-medium">{customer.name}</span></span>
            {invoice && <span className="text-gray-400">Invoice: <span className="text-amber-400 font-medium">{invoice.invoice_number}</span></span>}
          </div>
        )}

        {/* ─── FORM STEP ─── */}
        {step === 'form' && (
          <div className="p-6 space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-red-400" /> Airtel Money Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+254 7xx xxx xxx"
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500">Enter the Airtel Money registered number (Kenya, Uganda, Tanzania, Rwanda)</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-red-400" /> Amount
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">KES</span>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  min="1"
                  max="50000"
                  className="w-full pl-14 pr-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
              </div>
            )}

            <button
              onClick={handleSend}
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-900/30"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : <><Smartphone className="w-4 h-4" /> Send Airtel Money Request</>}
            </button>
            <p className="text-center text-xs text-gray-500">A payment prompt will appear on the customer's Airtel Money app</p>
          </div>
        )}

        {/* ─── WAITING STEP ─── */}
        {step === 'waiting' && (
          <div className="p-6 space-y-6 text-center">
            <div className="flex flex-col items-center gap-4">
              {/* Animated phone icon */}
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center animate-pulse">
                    <Smartphone className="w-8 h-8 text-red-400" />
                  </div>
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center">
                  <span className="text-xs font-bold text-black">!</span>
                </div>
              </div>

              <div>
                <h3 className="text-white font-bold text-lg">Waiting for Approval</h3>
                <p className="text-gray-400 text-sm mt-1">
                  Check <span className="text-red-400 font-medium">{phone}</span> for an Airtel Money pop-up
                </p>
              </div>

              {/* Ping ripple animation */}
              <div className="relative flex items-center justify-center w-16 h-6">
                {[0, 1, 2].map(i => (
                  <div key={i} className="absolute w-16 h-16 rounded-full border border-red-500/30 animate-ping"
                    style={{ animationDelay: `${i * 0.4}s`, animationDuration: '1.8s' }} />
                ))}
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full transition-all duration-1000"
                  style={{ width: `${progress}%` }} />
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Time remaining</span>
                <span className="text-red-400 font-mono">{MAX_WAIT_SECS - elapsed}s</span>
              </div>
            </div>

            <div className="px-4 py-3 bg-white/[0.03] rounded-xl text-sm text-gray-400 text-left space-y-1">
              <p>1. Open your <span className="text-white">Airtel Money app</span></p>
              <p>2. Enter your <span className="text-white">PIN</span> to approve</p>
              <p>3. This screen updates automatically</p>
            </div>

            <button onClick={() => { stopPolling(); setStep('failed'); setFailReason('Payment cancelled.'); }}
              className="text-sm text-gray-500 hover:text-red-400 transition-colors">
              Cancel payment
            </button>
          </div>
        )}

        {/* ─── SUCCESS STEP ─── */}
        {step === 'success' && (
          <div className="p-6 space-y-6 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-xl">Payment Successful!</h3>
                <p className="text-emerald-400 text-sm mt-1">Airtel Money payment confirmed</p>
              </div>
            </div>

            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4 space-y-2 text-left text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Amount</span><span className="text-white font-medium">KES {parseFloat(amount).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Phone</span><span className="text-white">{phone}</span></div>
              {receiptData?.reference && <div className="flex justify-between"><span className="text-gray-400">Reference</span><span className="text-emerald-400 font-mono text-xs">{receiptData.reference}</span></div>}
              <div className="flex justify-between"><span className="text-gray-400">Method</span><span className="text-white">Airtel Money</span></div>
            </div>

            <button onClick={onClose} className="w-full py-3 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors">
              Done
            </button>
          </div>
        )}

        {/* ─── FAILED STEP ─── */}
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
