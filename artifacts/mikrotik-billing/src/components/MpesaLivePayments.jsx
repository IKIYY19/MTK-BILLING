/**
 * MpesaLivePayments — Real-time payment feed + Daraja C2B configuration panel
 * Shows the last 50 M-Pesa payments with auto-refresh every 15s.
 * Also provides the webhook URLs + one-click registration with Safaricom.
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Smartphone, CheckCircle, Clock, RefreshCw, Copy, ExternalLink,
  Zap, AlertTriangle, Loader2, Globe, Settings, ChevronDown, ChevronUp,
  Wifi,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

function fmt(amount) {
  return 'KES ' + parseFloat(amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function MpesaLivePayments({ serverUrl: propServerUrl }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [serverUrl, setServerUrl] = useState(propServerUrl || window.location.origin);
  const [showSetup, setShowSetup] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registerResult, setRegisterResult] = useState(null);
  const [copied, setCopied] = useState('');

  const validationUrl   = `${serverUrl}/api/payments/mpesa/c2b/validate`;
  const confirmationUrl = `${serverUrl}/api/payments/mpesa/c2b/confirm`;
  const stkCallbackUrl  = `${serverUrl}/api/payments/mpesa/callback`;

  const fetchPayments = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/mpesa/recent`);
      setPayments(Array.isArray(data) ? data : []);
      setLastRefresh(new Date());
    } catch {
      // silent — keep showing last data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPayments();
    const interval = setInterval(fetchPayments, 15000);
    return () => clearInterval(interval);
  }, [fetchPayments]);

  async function registerUrls() {
    setRegistering(true);
    setRegisterResult(null);
    try {
      const { data } = await axios.post(`${API}/payments/mpesa/c2b/register`, { baseUrl: serverUrl });
      setRegisterResult({ success: true, message: data.message || 'Registered successfully' });
    } catch (e) {
      setRegisterResult({ success: false, message: e.response?.data?.error || e.message });
    } finally {
      setRegistering(false);
    }
  }

  function copyUrl(text, key) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  }

  const methodColor = (method) => {
    if (!method) return '#6ee7b7';
    if (method.includes('stk')) return '#34d399';
    if (method.includes('paybill')) return '#60a5fa';
    return '#a78bfa';
  };

  const methodLabel = (method) => {
    if (!method) return 'M-Pesa';
    if (method.includes('stk')) return 'STK Push';
    if (method.includes('paybill')) return 'Paybill';
    return method.replace('_', ' ').replace('mpesa', 'M-Pesa');
  };

  return (
    <div className="space-y-4">

      {/* Live feed header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-green-400 animate-ping opacity-60" />
          </div>
          <span className="font-semibold text-white text-sm">Live M-Pesa Payments</span>
          {lastRefresh && (
            <span className="text-xs" style={{ color: '#475569' }}>
              · refreshes every 15s
            </span>
          )}
        </div>
        <button
          onClick={fetchPayments}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Payments list */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-3" style={{ color: '#475569' }}>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading payments...</span>
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                 style={{ background: 'rgba(255,255,255,0.04)' }}>
              <Smartphone className="w-6 h-6" style={{ color: '#475569' }} />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: '#94a3b8' }}>No M-Pesa payments yet</p>
              <p className="text-xs mt-1" style={{ color: '#475569' }}>
                Payments will appear here in real-time once Daraja is configured
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            {payments.map((p) => (
              <div key={p.id} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-white/[0.02]">
                {/* Icon */}
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                     style={{ background: 'rgba(0,179,0,0.12)' }}>
                  <Smartphone className="w-4 h-4" style={{ color: '#22c55e' }} />
                </div>

                {/* Customer + receipt */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white truncate">
                      {p.customer_name || 'Unknown customer'}
                    </p>
                    <span className="px-1.5 py-0.5 rounded text-xs font-medium shrink-0"
                          style={{ background: 'rgba(0,179,0,0.12)', color: methodColor(p.method) }}>
                      {methodLabel(p.method)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {p.invoice_number && (
                      <span className="text-xs" style={{ color: '#475569' }}>
                        {p.invoice_number}
                      </span>
                    )}
                    {p.reference && (
                      <span className="text-xs font-mono" style={{ color: '#334155' }}>
                        · {p.reference}
                      </span>
                    )}
                  </div>
                </div>

                {/* Amount + time */}
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold" style={{ color: '#22c55e' }}>
                    {fmt(p.amount)}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#475569' }}>
                    {timeAgo(p.received_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Daraja C2B Setup Panel */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
        <button
          className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-white/[0.02]"
          onClick={() => setShowSetup(s => !s)}
        >
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4" style={{ color: '#60a5fa' }} />
            <span className="text-sm font-medium text-white">Daraja C2B Setup</span>
            <span className="px-1.5 py-0.5 rounded text-xs"
                  style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa' }}>
              Required for real-time Paybill
            </span>
          </div>
          {showSetup
            ? <ChevronUp className="w-4 h-4" style={{ color: '#475569' }} />
            : <ChevronDown className="w-4 h-4" style={{ color: '#475569' }} />}
        </button>

        {showSetup && (
          <div className="px-4 pb-4 space-y-4"
               style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-xs pt-4" style={{ color: '#64748b' }}>
              Register these URLs in your Safaricom Daraja portal (Apps → your app → C2B API) so Safaricom can notify
              your billing server in real-time when a customer pays via Paybill.
            </p>

            {/* Server URL input */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>
                Your Billing Server URL
              </label>
              <input
                value={serverUrl}
                onChange={e => setServerUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm font-mono text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                placeholder="https://billing.yourisp.com"
              />
            </div>

            {/* URL cards */}
            {[
              { label: 'Validation URL', url: validationUrl, key: 'v', desc: 'Safaricom calls this before charging — must respond in <8s' },
              { label: 'Confirmation URL', url: confirmationUrl, key: 'c', desc: 'Safaricom calls this when payment is complete — triggers auto-provision' },
              { label: 'STK Push Callback', url: stkCallbackUrl, key: 's', desc: 'Callback for STK Push (Lipa Na M-Pesa Online)' },
            ].map(({ label, url, key, desc }) => (
              <div key={key} className="rounded-lg p-3 space-y-1.5"
                   style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: '#94a3b8' }}>{label}</span>
                  <button
                    onClick={() => copyUrl(url, key)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors"
                    style={{ color: copied === key ? '#22c55e' : '#60a5fa', background: 'rgba(96,165,250,0.08)' }}
                  >
                    <Copy className="w-3 h-3" />
                    {copied === key ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs font-mono break-all" style={{ color: '#e2e8f0' }}>{url}</p>
                <p className="text-xs" style={{ color: '#475569' }}>{desc}</p>
              </div>
            ))}

            {/* One-click register button */}
            <div className="space-y-2">
              <button
                onClick={registerUrls}
                disabled={registering}
                className="w-full py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                style={{
                  background: registering ? 'rgba(96,165,250,0.15)' : 'linear-gradient(135deg,#3b82f6,#1d4ed8)',
                  color: registering ? '#60a5fa' : 'white',
                  boxShadow: registering ? 'none' : '0 4px 16px rgba(59,130,246,0.3)',
                  cursor: registering ? 'not-allowed' : 'pointer',
                }}
              >
                {registering
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Registering with Safaricom...</>
                  : <><Globe className="w-4 h-4" />Register URLs with Safaricom</>}
              </button>

              {registerResult && (
                <div className="flex items-start gap-2 rounded-lg p-3"
                     style={{
                       background: registerResult.success ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                       border: `1px solid ${registerResult.success ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                     }}>
                  {registerResult.success
                    ? <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                    : <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
                  <p className="text-xs" style={{ color: registerResult.success ? '#86efac' : '#fca5a5' }}>
                    {registerResult.message}
                  </p>
                </div>
              )}

              <p className="text-xs text-center" style={{ color: '#334155' }}>
                This calls the Daraja C2B Register URL API. Only works with production Safaricom credentials.
              </p>
            </div>

            {/* Instructions */}
            <div className="rounded-lg p-3 space-y-2"
                 style={{ background: 'rgba(250,204,21,0.04)', border: '1px solid rgba(250,204,21,0.1)' }}>
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" style={{ color: '#facc15' }} />
                <span className="text-xs font-semibold" style={{ color: '#fde68a' }}>How it works end-to-end</span>
              </div>
              <ol className="space-y-1">
                {[
                  'Customer sends money to your Paybill shortcode',
                  'Safaricom calls Confirmation URL instantly',
                  'Billing server matches payment to customer by invoice # or phone',
                  'Invoice marked paid → PPPoE reactivated → SMS sent to customer',
                  'Payment appears in this feed in real-time',
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#94a3b8' }}>
                    <span className="shrink-0 font-bold" style={{ color: '#facc15' }}>{i + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
