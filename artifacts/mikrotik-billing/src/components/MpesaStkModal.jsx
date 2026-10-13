/**
 * MpesaStkModal — Production M-Pesa STK Push component
 * Calls POST /api/payments/mpesa/stk then polls /mpesa/stk/check every 5s
 * Production only: shows error if M-Pesa credentials are not configured.
 */
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Smartphone, CheckCircle, XCircle, Clock, Loader2, X, AlertTriangle,
  RefreshCw, BadgeCheck,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

/**
 * Props:
 *  open          boolean            — controls visibility
 *  onClose       () => void         — called when modal should close
 *  onSuccess     (payment) => void  — called after payment confirmed
 *  customer      { id, name, phone } — pre-fills phone
 *  invoice       { id, invoice_number, balance, total } | null — pre-fills amount
 *  defaultAmount number | null      — fallback if no invoice
 */
export function MpesaStkModal({ open, onClose, onSuccess, customer, invoice, defaultAmount }) {
  const [phone, setPhone]           = useState('');
  const [amount, setAmount]         = useState('');
  const [step, setStep]             = useState('form');   // 'form' | 'waiting' | 'success' | 'failed'
  const [errorMsg, setErrorMsg]     = useState('');
  const [receipt, setReceipt]       = useState('');
  const [payment, setPayment]       = useState(null);
  const [sending, setSending]       = useState(false);
  const [elapsed, setElapsed]       = useState(0);
  const pollRef                     = useRef(null);
  const timerRef                    = useRef(null);
  const checkoutRef                 = useRef('');
  const MAX_WAIT_SECS               = 150; // 2.5 minutes

  /* ── Pre-fill from props ── */
  useEffect(() => {
    if (!open) return;
    setPhone(customer?.phone || '');
    const amt = invoice?.balance ?? invoice?.total ?? defaultAmount ?? '';
    setAmount(amt ? String(Math.round(amt)) : '');
    setStep('form');
    setErrorMsg('');
    setReceipt('');
    setPayment(null);
    setElapsed(0);
  }, [open, customer, invoice, defaultAmount]);

  /* ── Cleanup on unmount ── */
  useEffect(() => () => { clearPolling(); }, []);

  function clearPolling() {
    if (pollRef.current)  clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  /* ── Send STK Push ── */
  async function sendPush() {
    if (!phone || !amount) return;
    setSending(true);
    setErrorMsg('');
    try {
      const { data } = await axios.post(`${API}/payments/mpesa/stk`, {
        phone,
        amount: parseFloat(amount),
        invoice_id:  invoice?.id   || null,
        customer_id: customer?.id  || null,
      });

      if (!data.success) {
        setErrorMsg(data.message || 'Failed to initiate M-Pesa push. Check your Daraja credentials.');
        setSending(false);
        return;
      }

      checkoutRef.current = data.checkoutRequestId;
      setStep('waiting');
      setElapsed(0);
      startPolling(data.checkoutRequestId);
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setErrorMsg(msg.includes('not configured')
        ? 'M-Pesa is not configured. Add your Daraja credentials in Integrations → M-Pesa.'
        : msg);
    }
    setSending(false);
  }

  /* ── Poll status ── */
  function startPolling(checkoutRequestId) {
    // Elapsed seconds counter
    timerRef.current = setInterval(() => {
      setElapsed(prev => {
        if (prev >= MAX_WAIT_SECS) {
          clearPolling();
          setStep('failed');
          setErrorMsg('Payment timed out. The M-Pesa prompt may have expired. Please try again.');
        }
        return prev + 1;
      });
    }, 1000);

    // Poll every 5 seconds
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await axios.post(`${API}/payments/mpesa/stk/check`, { checkoutRequestId });

        if (data.success && data.status === 'completed') {
          clearPolling();
          setReceipt(data.mpesaReceipt || '');
          setPayment(data.payment || null);
          setStep('success');
          onSuccess?.(data.payment);
        } else if (data.status === 'failed') {
          clearPolling();
          setStep('failed');
          setErrorMsg(data.message || 'Payment was cancelled or failed.');
        }
      } catch { /* silent — keep polling */ }
    }, 5000);
  }

  function handleRetry() {
    clearPolling();
    setStep('form');
    setErrorMsg('');
    setElapsed(0);
  }

  function handleClose() {
    clearPolling();
    onClose?.();
  }

  if (!open) return null;

  const progressPct = Math.min((elapsed / MAX_WAIT_SECS) * 100, 100);
  const displayPhone = phone.startsWith('0') ? '254' + phone.slice(1) : phone;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
      <div className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
           style={{ background: 'linear-gradient(135deg,#0a2540 0%,#0d3b2e 100%)', border: '1px solid rgba(255,255,255,0.08)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4"
             style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg,#00b300,#007a00)' }}>
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg leading-none">M-Pesa Payment</h2>
              <p className="text-xs mt-0.5" style={{ color: '#6ee7b7' }}>Lipa Na M-Pesa · STK Push</p>
            </div>
          </div>
          <button onClick={handleClose}
                  className="rounded-full p-1.5 transition-colors hover:bg-white/10"
                  style={{ color: '#94a3b8' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pb-6 pt-5">

          {/* ── STEP: FORM ── */}
          {step === 'form' && (
            <div className="space-y-4">
              {/* Customer info */}
              {customer && (
                <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-xs mb-1" style={{ color: '#94a3b8' }}>Sending to</p>
                  <p className="text-white font-semibold">{customer.name}</p>
                  {invoice && (
                    <p className="text-xs mt-0.5" style={{ color: '#6ee7b7' }}>
                      Invoice {invoice.invoice_number}
                    </p>
                  )}
                </div>
              )}

              {/* Phone */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>
                  M-Pesa Phone Number
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono"
                        style={{ color: '#6ee7b7' }}>+254</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="7XX XXX XXX"
                    className="w-full pl-14 pr-4 py-3 rounded-xl text-white font-mono text-base outline-none transition-all"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
                    onFocus={e => e.target.style.borderColor = '#00b300'}
                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
                  />
                </div>
                <p className="text-xs mt-1" style={{ color: '#475569' }}>Format: 07XX or 2547XX</p>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>
                  Amount (KES)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold"
                        style={{ color: '#6ee7b7' }}>KES</span>
                  <input
                    type="number"
                    min="1"
                    max="150000"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0"
                    className="w-full pl-14 pr-4 py-3 rounded-xl text-white font-mono text-xl font-bold outline-none transition-all"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
                    onFocus={e => e.target.style.borderColor = '#00b300'}
                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
                  />
                </div>
              </div>

              {/* Error */}
              {errorMsg && (
                <div className="flex items-start gap-3 rounded-xl p-3"
                     style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
                  <p className="text-xs text-red-300">{errorMsg}</p>
                </div>
              )}

              {/* Send button */}
              <button
                onClick={sendPush}
                disabled={sending || !phone || !amount}
                className="w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all"
                style={{
                  background: (!phone || !amount || sending) ? 'rgba(0,179,0,0.3)' : 'linear-gradient(135deg,#00b300,#007a00)',
                  cursor: (!phone || !amount || sending) ? 'not-allowed' : 'pointer',
                  boxShadow: (!phone || !amount || sending) ? 'none' : '0 4px 20px rgba(0,179,0,0.35)',
                }}>
                {sending
                  ? <><Loader2 className="w-5 h-5 animate-spin" />Sending push...</>
                  : <><Smartphone className="w-5 h-5" />Send M-Pesa Push</>}
              </button>

              <p className="text-xs text-center" style={{ color: '#475569' }}>
                The customer will receive a prompt on their Safaricom line to enter their M-Pesa PIN
              </p>
            </div>
          )}

          {/* ── STEP: WAITING ── */}
          {step === 'waiting' && (
            <div className="text-center py-4 space-y-5">
              {/* Animated phone icon */}
              <div className="relative mx-auto w-20 h-20">
                <div className="absolute inset-0 rounded-full animate-ping"
                     style={{ background: 'rgba(0,179,0,0.2)' }} />
                <div className="absolute inset-2 rounded-full animate-ping"
                     style={{ background: 'rgba(0,179,0,0.15)', animationDelay: '0.3s' }} />
                <div className="relative w-20 h-20 rounded-full flex items-center justify-center"
                     style={{ background: 'linear-gradient(135deg,#00b300,#007a00)' }}>
                  <Smartphone className="w-9 h-9 text-white" />
                </div>
              </div>

              <div>
                <h3 className="text-white text-xl font-bold">Check Your Phone</h3>
                <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>
                  An M-Pesa prompt was sent to
                </p>
                <p className="font-mono font-bold mt-1" style={{ color: '#6ee7b7' }}>
                  +{displayPhone.startsWith('254') ? displayPhone : '254' + displayPhone}
                </p>
              </div>

              {/* Instruction steps */}
              <div className="rounded-xl p-4 text-left space-y-2"
                   style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                {[
                  ['1', 'Your phone is ringing with an M-Pesa prompt'],
                  ['2', `Confirm KES ${parseFloat(amount).toLocaleString()}`],
                  ['3', 'Enter your M-Pesa PIN to complete'],
                ].map(([n, txt]) => (
                  <div key={n} className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                          style={{ background: 'rgba(0,179,0,0.25)', color: '#6ee7b7' }}>{n}</span>
                    <span className="text-sm" style={{ color: '#cbd5e1' }}>{txt}</span>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: '#475569' }}>
                  <span className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Waiting for confirmation...
                  </span>
                  <span>{MAX_WAIT_SECS - elapsed}s left</span>
                </div>
                <div className="w-full rounded-full h-1.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-1.5 rounded-full transition-all duration-1000"
                       style={{
                         width: `${progressPct}%`,
                         background: progressPct > 80 ? '#ef4444' : '#00b300',
                       }} />
                </div>
              </div>

              <button onClick={handleClose}
                      className="text-xs transition-colors"
                      style={{ color: '#475569' }}>
                Cancel and close
              </button>
            </div>
          )}

          {/* ── STEP: SUCCESS ── */}
          {step === 'success' && (
            <div className="text-center py-4 space-y-5">
              <div className="relative mx-auto w-20 h-20">
                <div className="absolute inset-0 rounded-full"
                     style={{ background: 'rgba(0,179,0,0.15)', animation: 'none' }} />
                <div className="relative w-20 h-20 rounded-full flex items-center justify-center"
                     style={{ background: 'linear-gradient(135deg,#00b300,#007a00)' }}>
                  <CheckCircle className="w-10 h-10 text-white" />
                </div>
              </div>

              <div>
                <h3 className="text-white text-xl font-bold">Payment Confirmed!</h3>
                <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>
                  KES {parseFloat(amount).toLocaleString()} received successfully
                </p>
              </div>

              {/* Receipt */}
              {receipt && (
                <div className="rounded-xl p-4"
                     style={{ background: 'rgba(0,179,0,0.08)', border: '1px solid rgba(0,179,0,0.25)' }}>
                  <p className="text-xs mb-1" style={{ color: '#6ee7b7' }}>M-Pesa Receipt Number</p>
                  <div className="flex items-center justify-center gap-2">
                    <BadgeCheck className="w-4 h-4" style={{ color: '#00b300' }} />
                    <span className="font-mono font-bold text-lg text-white tracking-wider">{receipt}</span>
                  </div>
                </div>
              )}

              {/* Payment details */}
              {payment && (
                <div className="grid grid-cols-2 gap-3 text-left text-sm">
                  {payment.received_at && (
                    <div className="rounded-xl p-3"
                         style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <p className="text-xs mb-1" style={{ color: '#475569' }}>Date</p>
                      <p className="text-white text-xs">{new Date(payment.received_at).toLocaleString()}</p>
                    </div>
                  )}
                  {payment.method && (
                    <div className="rounded-xl p-3"
                         style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <p className="text-xs mb-1" style={{ color: '#475569' }}>Method</p>
                      <p className="text-white text-xs capitalize">{payment.method.replace('_', ' ')}</p>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handleClose}
                className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg,#00b300,#007a00)', boxShadow: '0 4px 20px rgba(0,179,0,0.35)' }}>
                <CheckCircle className="w-5 h-5" /> Done
              </button>
            </div>
          )}

          {/* ── STEP: FAILED ── */}
          {step === 'failed' && (
            <div className="text-center py-4 space-y-5">
              <div className="relative mx-auto w-20 h-20">
                <div className="relative w-20 h-20 rounded-full flex items-center justify-center"
                     style={{ background: 'rgba(239,68,68,0.15)', border: '2px solid rgba(239,68,68,0.4)' }}>
                  <XCircle className="w-10 h-10 text-red-400" />
                </div>
              </div>

              <div>
                <h3 className="text-white text-xl font-bold">Payment Failed</h3>
                <p className="text-sm mt-1 max-w-xs mx-auto" style={{ color: '#94a3b8' }}>
                  {errorMsg || 'The payment was not completed.'}
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleRetry}
                  className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg,#00b300,#007a00)', boxShadow: '0 4px 20px rgba(0,179,0,0.35)' }}>
                  <RefreshCw className="w-5 h-5" /> Try Again
                </button>
                <button onClick={handleClose}
                        className="w-full py-3 rounded-xl font-semibold transition-colors"
                        style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>
                  Close
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
