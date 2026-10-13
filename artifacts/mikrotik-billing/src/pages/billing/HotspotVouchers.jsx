import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import {
  Ticket, Plus, Download, Printer, QrCode, RefreshCw, Copy, Check,
  Settings, Trash2, Eye, FileText, Zap, Package, Clock, Wifi
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

/* ─── Voucher Card (Print Ready) ─── */
function VoucherCard({ voucher, showQR = true }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(`http://hotspot/login?username=${voucher.username}&password=${voucher.password}`)}`;
  
  return (
    <div className="voucher-card border-2 border-dashed border-zinc-700 rounded-xl p-4 bg-gradient-to-br from-zinc-900 to-zinc-800 relative overflow-hidden break-inside-avoid">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-20 h-20 bg-violet-500 rounded-full blur-3xl" />
      </div>

      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <Wifi className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">{voucher.company_name || 'HotSpot WiFi'}</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Internet Access</div>
            </div>
          </div>
          {voucher.plan_name && (
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-full text-[10px] font-semibold">
              {voucher.plan_name}
            </span>
          )}
        </div>

        {/* Credentials */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-zinc-950/60 rounded-lg p-2.5">
            <div className="text-[10px] text-zinc-500 uppercase mb-0.5">Username</div>
            <div className="font-mono text-sm text-white font-semibold">{voucher.username}</div>
          </div>
          <div className="bg-zinc-950/60 rounded-lg p-2.5">
            <div className="text-[10px] text-zinc-500 uppercase mb-0.5">Password</div>
            <div className="font-mono text-sm text-amber-400 font-semibold">{voucher.password}</div>
          </div>
        </div>

        {/* Details */}
        <div className="flex items-center gap-3 mb-3 text-[10px] text-zinc-400">
          {voucher.valid_for && (
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{voucher.valid_for}</span>
          )}
          {voucher.rate_limit && (
            <span className="flex items-center gap-1"><Zap className="w-3 h-3" />{voucher.rate_limit}</span>
          )}
          {voucher.data_limit && (
            <span className="flex items-center gap-1"><Package className="w-3 h-3" />{voucher.data_limit}</span>
          )}
        </div>

        {/* Price */}
        {voucher.price && (
          <div className="text-lg font-bold text-emerald-400 mb-2">KES {voucher.price}</div>
        )}

        {/* Footer with QR */}
        <div className="flex items-center justify-between pt-2 border-t border-zinc-700/50">
          <div className="text-[9px] text-zinc-600">
            Connect to WiFi → Open browser → Login
          </div>
          {showQR && (
            <img src={qrUrl} alt="QR" className="w-12 h-12 rounded" />
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Generated Vouchers Table ─── */
function VoucherTable({ vouchers, onDelete, onPrint }) {
  const [copiedId, setCopiedId] = useState(null);

  const copyVoucher = (v) => {
    navigator.clipboard.writeText(`${v.username} / ${v.password}`);
    setCopiedId(v.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300">Generated Vouchers ({vouchers.length})</h3>
        <div className="flex gap-2">
          <button onClick={onPrint} className="btn-secondary text-xs py-2 px-3">
            <Printer className="w-3.5 h-3.5" /> Print All
          </button>
        </div>
      </div>
      <table className="modern-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Password</th>
            <th>Plan</th>
            <th>Valid For</th>
            <th>Rate Limit</th>
            <th>Price</th>
            <th>QR</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {vouchers.map((v, i) => (
            <tr key={v.id || i}>
              <td className="font-mono text-white text-sm">{v.username}</td>
              <td>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-amber-400 text-sm">{v.password}</span>
                  <button onClick={() => copyVoucher(v)} className="text-zinc-500 hover:text-zinc-300">
                    {copiedId === v.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </td>
              <td><span className="badge badge-violet">{v.plan_name || 'default'}</span></td>
              <td className="text-sm text-zinc-400">{v.valid_for || '—'}</td>
              <td className="text-sm text-zinc-400 font-mono">{v.rate_limit || '—'}</td>
              <td className="text-sm text-emerald-400 font-semibold">KES {v.price || 0}</td>
              <td>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=40x40&data=${encodeURIComponent(`http://hotspot/login?username=${v.username}&password=${v.password}`)}`}
                  alt="QR"
                  className="w-10 h-10 rounded"
                />
              </td>
              <td>
                <div className="flex items-center justify-end gap-1">
                  <button onClick={() => copyVoucher(v)} className="btn-ghost p-2" title="Copy">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button onClick={() => onDelete(v.id)} className="btn-ghost p-2 text-zinc-500 hover:text-rose-400" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Main Page ─── */
export function HotspotVouchers() {
  const [loading, setLoading] = useState(false);
  const [vouchers, setVouchers] = useState([]);
  const [connections, setConnections] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState('');
  const [previewVoucher, setPreviewVoucher] = useState(null);
  const printRef = useRef(null);

  // Form state
  const [form, setForm] = useState({
    prefix: 'VC',
    length: 6,
    quantity: 10,
    profile: '',
    valid_for: '24h',
    rate_limit: '',
    data_limit: '',
    price: 0,
    company_name: 'HotSpot WiFi',
    generate_password: true,
    password_length: 6,
  });

  useEffect(() => {
    fetchData();
    fetchVouchers();
  }, []);

  useEffect(() => {
    if (selectedConnection) {
      fetchData();
    }
  }, [selectedConnection]);

  const fetchData = async () => {
    try {
      const [connRes, profilesRes] = await Promise.all([
        axios.get(`${API}/mikrotik`).catch(() => ({ data: [] })),
        selectedConnection ? axios.get(`${API}/hotspot/profiles?connection_id=${selectedConnection}`).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      ]);
      setConnections(connRes.data);
      setProfiles(profilesRes.data);
    } catch (e) { console.error(e); }
  };

  const fetchVouchers = async () => {
    try {
      console.log('Fetching vouchers from:', `${API}/hotspot/vouchers`);
      const { data } = await axios.get(`${API}/hotspot/vouchers`).catch(() => ({ data: [] }));
      console.log('Fetched vouchers:', data);
      setVouchers(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch vouchers:', e);
      setVouchers([]);
    }
  };

  const generateUsername = () => {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const username = Array.from({ length: form.length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${form.prefix}-${username}`;
  };

  const generatePassword = () => {
    const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
    return Array.from({ length: form.password_length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    setLoading(true);

    const newVouchers = [];
    for (let i = 0; i < form.quantity; i++) {
      const username = generateUsername();
      const password = form.generate_password ? generatePassword() : username;
      newVouchers.push({
        username,
        password,
        profile: form.profile,
        valid_for: form.valid_for,
        rate_limit: form.rate_limit,
        data_limit: form.data_limit,
        price: form.price,
        company_name: form.company_name,
        plan_name: form.profile || 'default',
        connection_id: selectedConnection,
        created_at: new Date().toISOString(),
      });
    }

    try {
      console.log('Generating vouchers:', newVouchers);
      const response = await axios.post(`${API}/hotspot/vouchers`, { vouchers: newVouchers, connection_id: selectedConnection });
      console.log('Voucher generation response:', response.data);
      await fetchVouchers();
    } catch (e) {
      console.error('Failed to generate vouchers:', e);
      alert(`Failed to generate vouchers: ${e.response?.data?.error || e.message}`);
    }
    
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this voucher?')) {return;}
    try {
      await axios.delete(`${API}/hotspot/vouchers/${id}`);
      fetchVouchers();
    } catch (e) { alert('Failed to delete'); }
  };

  const handlePrint = () => {
    if (!vouchers || !Array.isArray(vouchers) || vouchers.length === 0) {return;}
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Hotspot Vouchers</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; background: #fff; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
            .voucher { border: 2px dashed #ccc; border-radius: 12px; padding: 16px; background: #f9f9f9; page-break-inside: avoid; }
            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
            .logo { font-size: 14px; font-weight: bold; color: #333; }
            .badge { background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 99px; font-size: 10px; font-weight: 600; }
            .creds { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
            .cred-box { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; }
            .cred-label { font-size: 9px; color: #9ca3af; text-transform: uppercase; margin-bottom: 2px; }
            .cred-value { font-family: monospace; font-size: 14px; font-weight: 700; color: #111; }
            .details { display: flex; gap: 12px; font-size: 10px; color: #6b7280; margin-bottom: 8px; }
            .price { font-size: 18px; font-weight: bold; color: #059669; margin-bottom: 8px; }
            .footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e5e7eb; padding-top: 8px; }
            .footer-text { font-size: 9px; color: #9ca3af; }
            @media print { .grid { grid-template-columns: repeat(3, 1fr); } }
          </style>
        </head>
        <body>
          <h2 style="text-align:center;margin-bottom:20px;color:#333;">${form.company_name} - WiFi Vouchers</h2>
          <div class="grid">
            ${vouchers.map(v => `
              <div class="voucher">
                <div class="header">
                  <div>
                    <div class="logo">${v.company_name || 'HotSpot WiFi'}</div>
                    <div style="font-size:9px;color:#9ca3af;text-transform:uppercase;">Internet Access</div>
                  </div>
                  ${v.plan_name ? `<span class="badge">${v.plan_name}</span>` : ''}
                </div>
                <div class="creds">
                  <div class="cred-box">
                    <div class="cred-label">Username</div>
                    <div class="cred-value">${v.username}</div>
                  </div>
                  <div class="cred-box">
                    <div class="cred-label">Password</div>
                    <div class="cred-value" style="color:#d97706;">${v.password}</div>
                  </div>
                </div>
                <div class="details">
                  ${v.valid_for ? `<span>⏱ ${v.valid_for}</span>` : ''}
                  ${v.rate_limit ? `<span>⚡ ${v.rate_limit}</span>` : ''}
                  ${v.data_limit ? `<span>📦 ${v.data_limit}</span>` : ''}
                </div>
                ${v.price ? `<div class="price">KES ${v.price}</div>` : ''}
                <div class="footer">
                  <span class="footer-text">Connect → Open browser → Login</span>
                  <img src="https://api.qrserver.com/v1/create-qr-code/?size=50x50&data=${encodeURIComponent(`http://hotspot/login?username=${v.username}&password=${v.password}`)}" width="50" height="50" />
                </div>
              </div>
            `).join('')}
          </div>
          <script>window.onload = () => { window.print(); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="relative min-h-full p-8 animate-fade-in">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-noise" />

      {/* Header */}
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Ticket className="w-4 h-4 text-white" />
            </div>
            Hotspot Voucher Generator
          </h1>
          <p className="text-zinc-400 mt-1">Generate, manage, and print WiFi access vouchers</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={selectedConnection} onChange={e => setSelectedConnection(e.target.value)} className="modern-input text-sm py-2">
            <option value="">All Routers</option>
            {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Generator Form */}
      <div className="relative glass rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-6">
          <Settings className="w-5 h-5 text-amber-400" />
          <h3 className="text-base font-semibold text-white">Voucher Configuration</h3>
        </div>

        <form onSubmit={handleGenerate} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Username Settings */}
          <div className="md:col-span-3">
            <h4 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Username Settings
            </h4>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Prefix</label>
            <input value={form.prefix} onChange={e => setForm({ ...form, prefix: e.target.value })} className="modern-input" placeholder="VC" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Username Length</label>
            <input type="number" value={form.length} onChange={e => setForm({ ...form, length: parseInt(e.target.value) })} className="modern-input" min="4" max="12" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Quantity</label>
            <input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: parseInt(e.target.value) })} className="modern-input" min="1" max="500" />
          </div>

          {/* Plan Settings */}
          <div className="md:col-span-3 mt-2">
            <h4 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
              <Package className="w-4 h-4" /> Plan Settings
            </h4>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Profile</label>
            <select value={form.profile} onChange={e => setForm({ ...form, profile: e.target.value })} className="modern-input">
              <option value="">default</option>
              {profiles.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Valid For</label>
            <select value={form.valid_for} onChange={e => setForm({ ...form, valid_for: e.target.value })} className="modern-input">
              <option value="1h">1 Hour</option>
              <option value="3h">3 Hours</option>
              <option value="6h">6 Hours</option>
              <option value="12h">12 Hours</option>
              <option value="24h">24 Hours</option>
              <option value="7d">7 Days</option>
              <option value="30d">30 Days</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Rate Limit</label>
            <input value={form.rate_limit} onChange={e => setForm({ ...form, rate_limit: e.target.value })} className="modern-input" placeholder="5M/5M" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Data Limit</label>
            <input value={form.data_limit} onChange={e => setForm({ ...form, data_limit: e.target.value })} className="modern-input" placeholder="500M, 1G, etc." />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Price (KES)</label>
            <input type="number" value={form.price} onChange={e => setForm({ ...form, price: parseFloat(e.target.value) })} className="modern-input" placeholder="50" />
          </div>

          {/* Branding */}
          <div className="md:col-span-3 mt-2">
            <h4 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
              <QrCode className="w-4 h-4" /> Branding & Print
            </h4>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Company Name</label>
            <input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} className="modern-input" placeholder="HotSpot WiFi" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.generate_password} onChange={e => setForm({ ...form, generate_password: e.target.checked })} className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-amber-500" />
              <span className="text-sm text-zinc-300">Generate random passwords</span>
            </label>
          </div>
          {form.generate_password && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Password Length</label>
              <input type="number" value={form.password_length} onChange={e => setForm({ ...form, password_length: parseInt(e.target.value) })} className="modern-input" min="4" max="12" />
            </div>
          )}

          {/* Submit */}
          <div className="md:col-span-3 flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? (
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Generating...
                </div>
              ) : (
                <>
                  <Ticket className="w-4 h-4" /> Generate {form.quantity} Voucher{form.quantity !== 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Preview */}
      {vouchers && vouchers.length > 0 && (
        <div className="relative mb-6">
          <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <Eye className="w-5 h-5 text-zinc-400" /> Voucher Preview
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {vouchers.slice(0, 6).map((v, i) => (
              <VoucherCard key={v.id || i} voucher={v} />
            ))}
          </div>
          {vouchers.length > 6 && (
            <div className="text-center mt-4 text-zinc-500 text-sm">+ {vouchers.length - 6} more vouchers (see table below)</div>
          )}
        </div>
      )}

      {/* Vouchers Table */}
      {vouchers && vouchers.length > 0 && (
        <VoucherTable vouchers={vouchers} onDelete={handleDelete} onPrint={handlePrint} />
      )}

      {/* Empty state */}
      {!vouchers || vouchers.length === 0 && (
        <div className="glass rounded-2xl p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/20 flex items-center justify-center mx-auto mb-4">
            <Ticket className="w-8 h-8 text-amber-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">No vouchers generated</h3>
          <p className="text-zinc-500">Configure your settings above and click Generate to create vouchers</p>
        </div>
      )}

      {/* Hidden print div */}
      <div ref={printRef} className="hidden" />
    </div>
  );
}
