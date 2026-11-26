import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import {
  Ticket, Download, Printer, QrCode, RefreshCw, Copy, Check,
  Settings, Trash2, Eye, FileText, Clock, Wifi
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';
const COMPANY = 'Giraffe Hotspot';

function voucherCode(v) {
  return v.code || v.username || '';
}

function portalUrl(v) {
  const params = new URLSearchParams({
    brand: COMPANY,
    welcome: 'Welcome to Giraffe Hotspot. Enter your voucher code below.',
  });
  if (v.connection_id) {params.set('router_id', v.connection_id);}
  params.set('code', voucherCode(v));
  return `http://192.168.100.8/hotspot?${params.toString()}`;
}

function qrUrl(v) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(portalUrl(v))}`;
}

/* ─── Voucher Card (print ready) ─── */
function VoucherCard({ voucher }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(voucherCode(voucher));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="voucher-card border-2 border-dashed border-yellow-500/40 rounded-xl p-4 bg-gradient-to-br from-zinc-900 to-zinc-800 relative overflow-hidden break-inside-avoid">
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-400 rounded-full blur-3xl" />
      </div>
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-yellow-400 flex items-center justify-center text-zinc-950 font-black text-sm">G</div>
            <div>
              <div className="text-sm font-bold text-white">{voucher.company_name || COMPANY}</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Internet Access</div>
            </div>
          </div>
          <span className="px-2 py-0.5 bg-yellow-400/15 text-yellow-300 rounded-full text-[10px] font-semibold">
            {voucher.plan_name || 'default'}
          </span>
        </div>

        <div className="bg-zinc-950/60 rounded-lg p-3 mb-3 text-center">
          <div className="text-[10px] text-zinc-500 uppercase mb-1">Voucher code</div>
          <div className="font-mono text-xl text-yellow-300 font-bold tracking-wider">{voucherCode(voucher)}</div>
          <button onClick={copy} className="text-[10px] text-zinc-400 hover:text-yellow-300 mt-1 inline-flex items-center gap-1">
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy code'}
          </button>
        </div>

        <div className="flex items-center gap-3 mb-3 text-[10px] text-zinc-400">
          {voucher.valid_for && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{voucher.valid_for}</span>}
          {voucher.rate_limit && <span className="flex items-center gap-1">⚡ {voucher.rate_limit}</span>}
          {voucher.status === 'redeemed' && <span className="text-rose-400">Used</span>}
        </div>

        {voucher.price > 0 && <div className="text-lg font-bold text-emerald-400 mb-2">KES {voucher.price}</div>}

        <div className="flex items-center justify-between pt-2 border-t border-zinc-700/50">
          <div className="text-[9px] text-zinc-600">Connect to WiFi → Enter this code → You're online</div>
          <img src={qrUrl(voucher)} alt="QR" className="w-12 h-12 rounded" />
        </div>
      </div>
    </div>
  );
}

/* ─── Generated Vouchers Table ─── */
function VoucherTable({ vouchers, onDelete, onPrint, onDownload }) {
  const [copiedId, setCopiedId] = useState(null);
  const copyVoucher = (v) => {
    navigator.clipboard.writeText(voucherCode(v));
    setCopiedId(v.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300">Voucher Codes ({vouchers.length})</h3>
        <div className="flex gap-2">
          <button onClick={onDownload} className="btn-secondary text-xs py-2 px-3">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button onClick={onPrint} className="btn-secondary text-xs py-2 px-3">
            <Printer className="w-3.5 h-3.5" /> Print All
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="modern-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Plan</th>
              <th>Valid For</th>
              <th>Rate Limit</th>
              <th>Price</th>
              <th>Status</th>
              <th>QR</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((v, i) => (
              <tr key={v.id || i}>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-yellow-300 text-sm font-semibold">{voucherCode(v)}</span>
                    <button onClick={() => copyVoucher(v)} className="text-zinc-500 hover:text-yellow-300">
                      {copiedId === v.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </td>
                <td><span className="badge badge-violet">{v.plan_name || 'default'}</span></td>
                <td className="text-sm text-zinc-400">{v.valid_for || '—'}</td>
                <td className="text-sm text-zinc-400 font-mono">{v.rate_limit || '—'}</td>
                <td className="text-sm text-emerald-400 font-semibold">KES {v.price || 0}</td>
                <td className="text-sm">
                  <span className={v.status === 'redeemed' ? 'text-rose-400' : 'text-emerald-400'}>
                    {v.status === 'redeemed' ? 'Used' : 'Unused'}
                  </span>
                </td>
                <td><img src={qrUrl(v)} alt="QR" className="w-10 h-10 rounded" /></td>
                <td>
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => copyVoucher(v)} className="btn-ghost p-2" title="Copy code"><Copy className="w-4 h-4" /></button>
                    <button onClick={() => onDelete(v.id)} className="btn-ghost p-2 text-zinc-500 hover:text-rose-400" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export function HotspotVouchers() {
  const [loading, setLoading] = useState(false);
  const [vouchers, setVouchers] = useState([]);
  const [connections, setConnections] = useState([]);
  const [plans, setPlans] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState('');
  const printRef = useRef(null);

  const [form, setForm] = useState({
    prefix: 'GH',
    code_length: 8,
    quantity: 10,
    plan_id: '',
    company_name: COMPANY,
  });

  useEffect(() => { fetchConnections(); }, []);
  useEffect(() => { fetchVouchers(); fetchPlans(); }, [selectedConnection]);

  const fetchConnections = async () => {
    try {
      const { data } = await axios.get(`${API}/mikrotik`).catch(() => ({ data: [] }));
      setConnections(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
  };

  const fetchPlans = async () => {
    try {
      const params = selectedConnection ? { router_id: selectedConnection } : {};
      const { data } = await axios.get(`${API}/public/hotspot-plans`, { params }).catch(() => ({ data: { plans: [] } }));
      setPlans(Array.isArray(data.plans) ? data.plans : []);
    } catch (e) { console.error(e); }
  };

  const fetchVouchers = async () => {
    try {
      const { data } = await axios.get(`${API}/network/vouchers`).catch(() => ({ data: [] }));
      setVouchers(Array.isArray(data) ? data : []);
    } catch (e) { setVouchers([]); }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!form.plan_id) { alert('Choose a hotspot package first.'); return; }
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/network/vouchers`, {
        prefix: form.prefix,
        code_length: Number(form.code_length),
        quantity: Number(form.quantity),
        plan_id: form.plan_id,
        company_name: form.company_name,
        connection_id: selectedConnection || null,
      });
      if (Array.isArray(data.codes) && data.codes.length) {
        setVouchers((current) => [...data.codes, ...current]);
      }
      await fetchVouchers();
      if (!data.success) { alert(data.message || 'No vouchers were generated.'); }
    } catch (err) {
      alert(`Failed to generate vouchers: ${err.response?.data?.error || err.message}`);
    } finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this voucher code?')) {return;}
    try {
      await axios.delete(`${API}/network/vouchers/${id}`);
      setVouchers((current) => current.filter((v) => v.id !== id));
    } catch (e) { alert('Failed to delete voucher'); }
  };

  const handleDownload = () => {
    const rows = [['code', 'plan', 'valid_for', 'rate_limit', 'price', 'status']];
    vouchers.forEach((v) => rows.push([
      voucherCode(v), v.plan_name || '', v.valid_for || '', v.rate_limit || '',
      String(v.price || 0), v.status || 'unused',
    ]));
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'giraffe-hotspot-vouchers.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (!vouchers.length) {return;}
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>Giraffe Hotspot Vouchers</title>
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family:'Segoe UI',Arial,sans-serif; padding:20px; background:#fff; }
          h2 { text-align:center; margin-bottom:20px; color:#111; }
          .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
          .voucher { border:2px dashed #f59e0b; border-radius:12px; padding:16px; background:#fffbeb; page-break-inside:avoid; }
          .brand { font-size:14px; font-weight:bold; color:#111; }
          .badge { background:#fde68a; color:#92400e; padding:2px 8px; border-radius:99px; font-size:10px; font-weight:600; }
          .label { font-size:9px; color:#9ca3af; text-transform:uppercase; }
          .code { font-family:monospace; font-size:20px; font-weight:800; color:#92400e; margin:8px 0; letter-spacing:1px; }
          .details { font-size:10px; color:#6b7280; }
          .price { font-size:16px; font-weight:bold; color:#059669; margin-top:8px; }
          .footer { font-size:9px; color:#9ca3af; margin-top:10px; border-top:1px solid #e5e7eb; padding-top:8px; }
          @media print { .grid { grid-template-columns:repeat(3,1fr); } }
        </style>
      </head><body>
        <h2>Giraffe Hotspot — Voucher Codes</h2>
        <div class="grid">
          ${vouchers.map((v) => `
            <div class="voucher">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div class="brand">${v.company_name || COMPANY}</div>
                <span class="badge">${v.plan_name || 'default'}</span>
              </div>
              <div class="label">Voucher code</div>
              <div class="code">${voucherCode(v)}</div>
              <div class="details">${v.valid_for || ''} ${v.rate_limit ? '· ' + v.rate_limit : ''}</div>
              ${v.price > 0 ? `<div class="price">KES ${v.price}</div>` : ''}
              <div class="footer">Connect to WiFi → Enter this code → You're online</div>
            </div>
          `).join('')}
        </div>
        <script>window.onload = () => { window.print(); }</script>
      </body></html>
    `);
    win.document.close();
  };

  return (
    <div className="relative min-h-full p-8 animate-fade-in">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-noise" />

      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-yellow-400 flex items-center justify-center shadow-lg shadow-yellow-500/20 text-zinc-950 font-black">G</div>
            Giraffe Hotspot Vouchers
          </h1>
          <p className="text-zinc-400 mt-1">Generate single-code vouchers — customers enter only the code</p>
        </div>
        <select value={selectedConnection} onChange={(e) => setSelectedConnection(e.target.value)} className="modern-input text-sm py-2">
          <option value="">All Routers</option>
          {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="relative glass rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-6">
          <Settings className="w-5 h-5 text-yellow-400" />
          <h3 className="text-base font-semibold text-white">Generate Voucher Codes</h3>
        </div>

        <form onSubmit={handleGenerate} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-3">
            <h4 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Code Settings
            </h4>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Prefix</label>
            <input value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value })} className="modern-input" placeholder="GH" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Code Length</label>
            <input type="number" value={form.code_length} onChange={(e) => setForm({ ...form, code_length: parseInt(e.target.value) })} className="modern-input" min="4" max="16" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Quantity</label>
            <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) })} className="modern-input" min="1" max="200" />
          </div>

          <div className="md:col-span-3 mt-2">
            <h4 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
              <Wifi className="w-4 h-4" /> Package & Branding
            </h4>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Hotspot Package</label>
            <select value={form.plan_id} onChange={(e) => setForm({ ...form, plan_id: e.target.value })} className="modern-input" required>
              <option value="">Select a package</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — KES {p.price} / {p.validity_days} days</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Company Name</label>
            <input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} className="modern-input" placeholder={COMPANY} />
          </div>

          <div className="md:col-span-3 flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? (
                <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Generating...</span>
              ) : (
                <span className="flex items-center gap-2"><Ticket className="w-4 h-4" /> Generate {form.quantity} Code{form.quantity !== 1 ? 's' : ''}</span>
              )}
            </button>
          </div>
        </form>
      </div>

      {vouchers.length > 0 && (
        <div className="relative mb-6">
          <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <Eye className="w-5 h-5 text-zinc-400" /> Voucher Preview
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {vouchers.slice(0, 6).map((v, i) => <VoucherCard key={v.id || i} voucher={v} />)}
          </div>
          {vouchers.length > 6 && <div className="text-center mt-4 text-zinc-500 text-sm">+ {vouchers.length - 6} more (see table)</div>}
        </div>
      )}

      {vouchers.length > 0 && (
        <VoucherTable vouchers={vouchers} onDelete={handleDelete} onPrint={handlePrint} onDownload={handleDownload} />
      )}

      {vouchers.length === 0 && (
        <div className="glass rounded-2xl p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-yellow-400/10 ring-1 ring-yellow-400/20 flex items-center justify-center mx-auto mb-4">
            <QrCode className="w-8 h-8 text-yellow-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">No vouchers yet</h3>
          <p className="text-zinc-500">Choose a package and generate codes above.</p>
        </div>
      )}

      <div ref={printRef} className="hidden" />
    </div>
  );
}
