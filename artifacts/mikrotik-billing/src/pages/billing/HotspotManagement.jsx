import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Wifi, Users, Activity, Plus, Search, Trash2, Pencil, RefreshCw,
  Eye, EyeOff, Copy, Check, Settings, Server, Zap, AlertCircle,
  Clock, Download, QrCode, Ticket, Package, Globe, Shield,
  ArrowUpRight, ArrowDownRight, WifiOff, UserCheck, UserX
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

/* ─── Animated Number ─── */
function AnimatedNumber({ value, prefix = '', suffix = '' }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const duration = 600;
    const steps = 25;
    const stepTime = duration / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += (value - 0) / steps;
      setDisplay(Math.round(current * 100) / 100);
      if (current >= value) { clearInterval(timer); setDisplay(value); }
    }, stepTime);
    return () => clearInterval(timer);
  }, [value]);
  return <span>{prefix}{typeof value === 'number' && value % 1 !== 0 ? display.toFixed(1) : Math.round(display)}{suffix}</span>;
}

/* ─── Stat Card ─── */
function StatCard({ title, value, icon: Icon, bg, ring, textColor, sub }) {
  return (
    <div className="glass rounded-2xl p-5 card-hover group">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${bg} ring-1 ${ring} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
          <Icon className={`w-5 h-5 ${textColor}`} />
        </div>
      </div>
      <div className={`stat-value ${textColor}`}>
        {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
      </div>
      <div className="text-sm text-zinc-400 mt-1">{title}</div>
      {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

/* ─── Password Toggle ─── */
function PasswordField({ value }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-sm text-zinc-300 truncate max-w-[120px]">{show ? value : '••••••••'}</span>
      <button onClick={() => setShow(!show)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
        {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
      <button onClick={copy} className="text-zinc-500 hover:text-zinc-300 transition-colors">
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

/* ─── User Form Modal ─── */
function UserForm({ show, onClose, editing, profiles, connections, onSubmit }) {
  const [form, setForm] = useState({
    name: '', password: '', profile: '', disabled: 'no', comment: '',
    email: '', phone: '', limit_bytes_total: '', rate_limit: '', connection_id: '',
  });
  useEffect(() => {
    if (editing) {setForm({ ...editing });}
    else {setForm({ name: '', password: '', profile: '', disabled: 'no', comment: '', email: '', phone: '', limit_bytes_total: '', rate_limit: '', connection_id: '' });}
  }, [editing, show]);
  if (!show) {return null;}
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="glass-strong rounded-2xl w-full max-w-lg animate-fade-in-scale" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-zinc-800/50">
          <h3 className="text-lg font-semibold text-white">{editing ? 'Edit Hotspot User' : 'New Hotspot User'}</h3>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Username *</label>
              <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="modern-input" placeholder="voucher001" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Password *</label>
              <input required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="modern-input" placeholder="pass123" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Profile</label>
              <select value={form.profile} onChange={e => setForm({ ...form, profile: e.target.value })} className="modern-input">
                <option value="">default</option>
                {profiles.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Rate Limit</label>
              <input value={form.rate_limit} onChange={e => setForm({ ...form, rate_limit: e.target.value })} className="modern-input" placeholder="5M/5M" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Data Limit (bytes)</label>
              <input value={form.limit_bytes_total} onChange={e => setForm({ ...form, limit_bytes_total: e.target.value })} className="modern-input" placeholder="1073741824" />
              <span className="text-xs text-zinc-500 mt-1 block">1GB = 1073741824</span>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Connection</label>
              <select value={form.connection_id} onChange={e => setForm({ ...form, connection_id: e.target.value })} className="modern-input">
                <option value="">Select router...</option>
                {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Email</label>
              <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="modern-input" placeholder="user@email.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Phone</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="modern-input" placeholder="+254..." />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Comment</label>
              <input value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} className="modern-input" placeholder="Notes..." />
            </div>
          </div>
          <div className="flex gap-3 pt-2 border-t border-zinc-800/50">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1">{editing ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Profile Form Modal ─── */
function ProfileForm({ show, onClose, editing, connections, onSubmit }) {
  const [form, setForm] = useState({
    name: '', rate_limit: '', shared_users: '1', session_timeout: '',
    idle_timeout: '', keepalive_timeout: '', open_status_page: '',
    login_by: 'mac,http-chap,http-pap', logout_redirect: '',
    transparent_proxy: 'no', advertising: '', dns_name: '',
  });
  useEffect(() => {
    if (editing) {setForm({ ...editing });}
    else {setForm({ name: '', rate_limit: '', shared_users: '1', session_timeout: '', idle_timeout: '', keepalive_timeout: '', open_status_page: '', login_by: 'mac,http-chap,http-pap', logout_redirect: '', transparent_proxy: 'no', advertising: '', dns_name: '' });}
  }, [editing, show]);
  if (!show) {return null;}
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="glass-strong rounded-2xl w-full max-w-lg animate-fade-in-scale" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-zinc-800/50">
          <h3 className="text-lg font-semibold text-white">{editing ? 'Edit Profile' : 'New Hotspot Profile'}</h3>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Profile Name *</label>
              <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="modern-input" placeholder="1hour_unlimited" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Rate Limit</label>
              <input value={form.rate_limit} onChange={e => setForm({ ...form, rate_limit: e.target.value })} className="modern-input" placeholder="5M/5M" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Shared Users</label>
              <input value={form.shared_users} onChange={e => setForm({ ...form, shared_users: e.target.value })} className="modern-input" placeholder="1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Session Timeout</label>
              <input value={form.session_timeout} onChange={e => setForm({ ...form, session_timeout: e.target.value })} className="modern-input" placeholder="01:00:00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Idle Timeout</label>
              <input value={form.idle_timeout} onChange={e => setForm({ ...form, idle_timeout: e.target.value })} className="modern-input" placeholder="00:30:00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Login By</label>
              <input value={form.login_by} onChange={e => setForm({ ...form, login_by: e.target.value })} className="modern-input" placeholder="mac,http-chap" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Advertise URL</label>
              <input value={form.advertising} onChange={e => setForm({ ...form, advertising: e.target.value })} className="modern-input" placeholder="http://myisp.com/promo" />
            </div>
          </div>
          <div className="flex gap-3 pt-2 border-t border-zinc-800/50">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1">{editing ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Uptime formatter ─── */
function formatUptime(seconds) {
  if (!seconds) {return '0s';}
  const s = parseInt(seconds);
  if (s < 60) {return `${s}s`;}
  if (s < 3600) {return `${Math.floor(s / 60)}m ${s % 60}s`;}
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

/* ─── Bytes formatter ─── */
function formatBytes(bytes) {
  if (!bytes) {return '0 B';}
  const b = parseInt(bytes);
  if (b < 1024) {return `${b} B`;}
  if (b < 1048576) {return `${(b / 1024).toFixed(1)} KB`;}
  if (b < 1073741824) {return `${(b / 1048576).toFixed(1)} MB`;}
  return `${(b / 1073741824).toFixed(2)} GB`;
}

/* ─── Main Page ─── */
export function HotspotManagement() {
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [active, setActive] = useState([]);
  const [connections, setConnections] = useState([]);
  const [search, setSearch] = useState('');
  const [showUserForm, setShowUserForm] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editingProfile, setEditingProfile] = useState(null);
  const [selectedConnection, setSelectedConnection] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, profilesRes, activeRes, connRes] = await Promise.all([
        axios.get(`${API}/hotspot/users${selectedConnection ? `?connection_id=${selectedConnection}` : ''}`).catch(() => ({ data: [] })),
        axios.get(`${API}/hotspot/profiles${selectedConnection ? `?connection_id=${selectedConnection}` : ''}`).catch(() => ({ data: [] })),
        axios.get(`${API}/hotspot/active${selectedConnection ? `?connection_id=${selectedConnection}` : ''}`).catch(() => ({ data: [] })),
        axios.get(`${API}/mikrotik`).catch(() => ({ data: [] })),
      ]);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
      setProfiles(Array.isArray(profilesRes.data) ? profilesRes.data : []);
      setActive(Array.isArray(activeRes.data) ? activeRes.data : []);
      setConnections(Array.isArray(connRes.data) ? connRes.data : []);
    } catch (e) { console.error('Hotspot fetch error:', e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [selectedConnection]);

  const handleCreateUser = async (form) => {
    try {
      await axios.post(`${API}/hotspot/users`, { ...form, connection_id: selectedConnection });
      setShowUserForm(false); setEditingUser(null); fetchData();
    } catch (e) { alert(e.response?.data?.error || 'Failed to create user'); }
  };

  const handleDeleteUser = async (name) => {
    if (!confirm(`Delete hotspot user "${name}"?`)) {return;}
    try {
      await axios.delete(`${API}/hotspot/users/${encodeURIComponent(name)}${selectedConnection ? `?connection_id=${selectedConnection}` : ''}`);
      fetchData();
    } catch (e) { alert('Failed to delete user'); }
  };

  const handleToggleUser = async (name) => {
    try {
      await axios.post(`${API}/hotspot/users/${encodeURIComponent(name)}/toggle${selectedConnection ? `?connection_id=${selectedConnection}` : ''}`);
      fetchData();
    } catch (e) { alert('Failed to toggle user'); }
  };

  const handleKickUser = async (address) => {
    try {
      await axios.post(`${API}/hotspot/active/${encodeURIComponent(address)}/kick${selectedConnection ? `?connection_id=${selectedConnection}` : ''}`);
      fetchData();
    } catch (e) { alert('Failed to kick user'); }
  };

  const handleCreateProfile = async (form) => {
    try {
      await axios.post(`${API}/hotspot/profiles`, { ...form, connection_id: selectedConnection });
      setShowProfileForm(false); setEditingProfile(null); fetchData();
    } catch (e) { alert('Failed to create profile'); }
  };

  const handleDeleteProfile = async (name) => {
    if (!confirm(`Delete profile "${name}"?`)) {return;}
    try {
      await axios.delete(`${API}/hotspot/profiles/${encodeURIComponent(name)}${selectedConnection ? `?connection_id=${selectedConnection}` : ''}`);
      fetchData();
    } catch (e) { alert('Failed to delete profile'); }
  };

  const filteredUsers = users.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.comment?.toLowerCase().includes(search.toLowerCase())
  );
  const filteredActive = active.filter(a =>
    a.user?.toLowerCase().includes(search.toLowerCase()) ||
    a.address?.toLowerCase().includes(search.toLowerCase())
  );

  const tabs = [
    { id: 'users', label: 'Users', icon: Users, count: users.length },
    { id: 'profiles', label: 'Profiles', icon: Package, count: profiles.length },
    { id: 'active', label: 'Active Sessions', icon: Wifi, count: active.length },
  ];

  return (
    <div className="relative min-h-full p-8 animate-fade-in">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-noise" />

      {/* Header */}
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Wifi className="w-4 h-4 text-white" />
            </div>
            Hotspot Management
          </h1>
          <p className="text-zinc-400 mt-1">Manage hotspot users, profiles, vouchers and active WiFi sessions</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={selectedConnection} onChange={e => setSelectedConnection(e.target.value)} className="modern-input text-sm py-2">
            <option value="">All Routers</option>
            {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={fetchData} className="btn-ghost"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Stats */}
      <div className="relative grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Users" value={users.length} icon={Users} bg="bg-amber-500/10" ring="ring-amber-500/20" textColor="text-amber-400" sub={`${users.filter(u => u.disabled !== 'true' && u.disabled !== 'yes').length} enabled`} />
        <StatCard title="Active Now" value={active.length} icon={Wifi} bg="bg-emerald-500/10" ring="ring-emerald-500/20" textColor="text-emerald-400" />
        <StatCard title="Profiles" value={profiles.length} icon={Package} bg="bg-violet-500/10" ring="ring-violet-500/20" textColor="text-violet-400" />
        <StatCard title="Total Traffic" value={active.reduce((sum, a) => sum + (parseInt(a['bytes-in']) || 0) + (parseInt(a['bytes-out']) || 0), 0)} icon={Globe} bg="bg-cyan-500/10" ring="ring-cyan-500/20" textColor="text-cyan-400" sub={formatBytes(active.reduce((sum, a) => sum + (parseInt(a['bytes-in']) || 0) + (parseInt(a['bytes-out']) || 0), 0))} />
      </div>

      {/* Tabs */}
      <div className="relative flex gap-2 mb-6 flex-wrap">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === tab.id ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20' : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60'
            }`}>
            <tab.icon className="w-4 h-4" /> {tab.label}
            <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${activeTab === tab.id ? 'bg-amber-500/30' : 'bg-zinc-700/60 text-zinc-500'}`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users, IPs..."
          className="modern-input pl-10 max-w-md" />
      </div>

      {/* USERS TAB */}
      {activeTab === 'users' && (
        <div className="relative glass rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-300">Hotspot Users ({filteredUsers.length})</h3>
            <div className="flex gap-2">
              <button onClick={() => window.location.href = '/hotspot-vouchers'} className="btn-secondary text-xs py-2 px-3">
                <Ticket className="w-3.5 h-3.5" /> Vouchers
              </button>
              <button onClick={() => { setEditingUser(null); setShowUserForm(true); }} className="btn-primary text-xs py-2 px-3">
                <Plus className="w-3.5 h-3.5" /> New User
              </button>
            </div>
          </div>
          {loading ? (
            <div className="p-6 space-y-3">{[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
          ) : (
            <table className="modern-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Profile</th>
                  <th>Rate Limit</th>
                  <th>Data Limit</th>
                  <th>Upload ↓ / Download ↑</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u, i) => (
                  <tr key={i}>
                    <td>
                      <div className="min-w-0">
                        <div className="text-white font-medium truncate">{u.name}</div>
                        <PasswordField value={u.password || ''} />
                      </div>
                    </td>
                    <td><span className="badge badge-violet">{u.profile || 'default'}</span></td>
                    <td className="text-sm text-zinc-300 font-mono">{u['rate-limit'] || <span className="text-zinc-600">—</span>}</td>
                    <td className="text-sm text-zinc-400">{u['limit-bytes-total'] ? formatBytes(u['limit-bytes-total']) : <span className="text-zinc-600">Unlimited</span>}</td>
                    <td>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-emerald-400 flex items-center gap-1"><ArrowUpRight className="w-3 h-3" />{formatBytes(u['bytes-out'] || 0)}</span>
                        <span className="text-blue-400 flex items-center gap-1"><ArrowDownRight className="w-3 h-3" />{formatBytes(u['bytes-in'] || 0)}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${u.disabled === 'true' || u.disabled === 'yes' ? 'badge-red' : 'badge-green'}`}>
                        {u.disabled === 'true' || u.disabled === 'yes' ? 'disabled' : 'active'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleToggleUser(u.name)} className="btn-ghost p-2" title={u.disabled === 'true' ? 'Enable' : 'Disable'}>
                          {u.disabled === 'true' || u.disabled === 'yes' ? <UserCheck className="w-4 h-4 text-emerald-400" /> : <UserX className="w-4 h-4 text-amber-400" />}
                        </button>
                        <button onClick={() => { setEditingUser(u); setShowUserForm(true); }} className="btn-ghost p-2"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => handleDeleteUser(u.name)} className="btn-ghost p-2 text-zinc-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && filteredUsers.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon"><Users className="w-6 h-6 text-zinc-600" /></div>
              <div className="empty-state-title">{search ? 'No users found' : 'No hotspot users yet'}</div>
              <div className="empty-state-desc">{search ? 'Try a different search' : 'Create your first hotspot user or generate vouchers'}</div>
            </div>
          )}
        </div>
      )}

      {/* PROFILES TAB */}
      {activeTab === 'profiles' && (
        <div className="relative glass rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-300">Hotspot Profiles ({profiles.length})</h3>
            <button onClick={() => { setEditingProfile(null); setShowProfileForm(true); }} className="btn-primary text-xs py-2 px-3">
              <Plus className="w-3.5 h-3.5" /> New Profile
            </button>
          </div>
          {loading ? (
            <div className="p-6 space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
          ) : (
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Rate Limit</th>
                  <th>Shared Users</th>
                  <th>Session Timeout</th>
                  <th>Idle Timeout</th>
                  <th>Login By</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p, i) => (
                  <tr key={i}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-amber-400" />
                        <span className="text-white font-medium">{p.name}</span>
                      </div>
                    </td>
                    <td className="text-sm text-zinc-300 font-mono">{p['rate-limit'] || <span className="text-zinc-600">—</span>}</td>
                    <td className="text-sm text-zinc-400">{p['shared-users'] || '1'}</td>
                    <td className="text-sm text-zinc-400">{p['session-timeout'] || <span className="text-zinc-600">Unlimited</span>}</td>
                    <td className="text-sm text-zinc-400">{p['idle-timeout'] || <span className="text-zinc-600">—</span>}</td>
                    <td className="text-sm text-zinc-400">{p['login-by'] || 'mac,http-chap'}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setEditingProfile(p); setShowProfileForm(true); }} className="btn-ghost p-2"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => handleDeleteProfile(p.name)} className="btn-ghost p-2 text-zinc-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && profiles.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon"><Package className="w-6 h-6 text-zinc-600" /></div>
              <div className="empty-state-title">No profiles configured</div>
              <div className="empty-state-desc">Create hotspot profiles to manage speed, time limits, and access</div>
            </div>
          )}
        </div>
      )}

      {/* ACTIVE SESSIONS TAB */}
      {activeTab === 'active' && (
        <div className="relative glass rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800/50">
            <h3 className="text-sm font-medium text-zinc-300">Active Hotspot Sessions ({filteredActive.length})</h3>
          </div>
          {loading ? (
            <div className="p-6 space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
          ) : (
            <table className="modern-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Address</th>
                  <th>MAC Address</th>
                  <th>Uptime</th>
                  <th>Upload ↓ / Download ↑</th>
                  <th>Bytes In/Out</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredActive.map((a, i) => (
                  <tr key={i}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 status-dot" />
                        <span className="text-white font-medium">{a.user || 'Guest'}</span>
                      </div>
                    </td>
                    <td className="text-sm text-zinc-300 font-mono">{a.address}</td>
                    <td className="text-sm text-zinc-400 font-mono">{a['mac-address'] || <span className="text-zinc-600">—</span>}</td>
                    <td>
                      <div className="flex items-center gap-1.5 text-sm text-zinc-300">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        {a.uptime || '00:00:00'}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-emerald-400 flex items-center gap-1"><ArrowUpRight className="w-3 h-3" />{formatBytes(a['bytes-out'] || 0)}</span>
                        <span className="text-blue-400 flex items-center gap-1"><ArrowDownRight className="w-3 h-3" />{formatBytes(a['bytes-in'] || 0)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <span>↓ {formatBytes(a['bytes-in'] || 0)}</span>
                        <span>↑ {formatBytes(a['bytes-out'] || 0)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleKickUser(a.address)} className="btn-ghost p-2 text-zinc-500 hover:text-rose-400" title="Disconnect">
                          <AlertCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && filteredActive.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon"><Wifi className="w-6 h-6 text-zinc-600" /></div>
              <div className="empty-state-title">No active hotspot sessions</div>
              <div className="empty-state-desc">Connected hotspot users will appear here in real-time</div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <UserForm show={showUserForm} onClose={() => { setShowUserForm(false); setEditingUser(null); }}
        editing={editingUser} profiles={profiles} connections={connections} onSubmit={handleCreateUser} />
      <ProfileForm show={showProfileForm} onClose={() => { setShowProfileForm(false); setEditingProfile(null); }}
        editing={editingProfile} connections={connections} onSubmit={handleCreateProfile} />
    </div>
  );
}
