import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Network, Users, Activity, Plus, Search, Trash2, Pencil, RefreshCw,
  Play, Pause, Wifi, Eye, EyeOff, Copy, Check, Settings, Server,
  ArrowUpRight, ArrowDownRight, Zap, AlertCircle
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
      <span className="font-mono text-sm text-zinc-300 truncate max-w-[120px]">
        {show ? value : '••••••••'}
      </span>
      <button onClick={() => setShow(!show)} className="text-zinc-500 hover:text-zinc-300 transition-colors" title={show ? 'Hide' : 'Show'}>
        {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
      <button onClick={copy} className="text-zinc-500 hover:text-zinc-300 transition-colors relative" title="Copy">
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

/* ─── Secret Form Modal ─── */
function SecretForm({ show, onClose, editing, profiles, connections, onSubmit }) {
  const [form, setForm] = useState({
    name: '', password: '', service: 'pppoe', profile: '', local_address: '', remote_address: '',
    routes: '', comment: '', rate_limit: '', connection_id: '',
  });

  useEffect(() => {
    if (editing) {
      setForm({ ...editing });
    } else {
      setForm({ name: '', password: '', service: 'pppoe', profile: '', local_address: '', remote_address: '', routes: '', comment: '', rate_limit: '', connection_id: '' });
    }
  }, [editing, show]);

  if (!show) {return null;}

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="glass-strong rounded-2xl w-full max-w-lg animate-fade-in-scale" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-zinc-800/50">
          <h3 className="text-lg font-semibold text-white">{editing ? 'Edit PPPoE Secret' : 'New PPPoE Secret'}</h3>
          <p className="text-sm text-zinc-400 mt-0.5">{editing ? 'Update secret configuration' : 'Create a new PPPoE secret on MikroTik'}</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Username *</label>
              <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="modern-input" placeholder="customer001" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Password *</label>
              <input required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="modern-input" placeholder="securepass" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Service</label>
              <select value={form.service} onChange={e => setForm({ ...form, service: e.target.value })} className="modern-input">
                <option value="pppoe">pppoe</option>
                <option value="pppoa">pppoa</option>
                <option value="l2tp">l2tp</option>
                <option value="pptp">pptp</option>
                <option value="sstp">sstp</option>
                <option value="ovpn">ovpn</option>
              </select>
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
              <input value={form.rate_limit} onChange={e => setForm({ ...form, rate_limit: e.target.value })} className="modern-input" placeholder="10M/10M" />
              <span className="text-xs text-zinc-500 mt-1 block">Format: rx/tx (e.g., 10M/5M)</span>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Connection</label>
              <select value={form.connection_id} onChange={e => setForm({ ...form, connection_id: e.target.value })} className="modern-input">
                <option value="">Select router...</option>
                {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Comment</label>
              <input value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} className="modern-input" placeholder="Customer name or notes" />
            </div>
          </div>
          <div className="flex gap-3 pt-2 border-t border-zinc-800/50">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1">{editing ? 'Update Secret' : 'Create Secret'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Profile Form Modal ─── */
function ProfileForm({ show, onClose, editing, onSubmit }) {
  const [form, setForm] = useState({
    name: '', local_address: '', remote_address: '', rate_limit: '', only_one: 'yes',
    change_tcp_mss: 'yes', use_compression: 'no', use_encryption: 'yes',
    dns_server: '', wins_server: '', parent_queue: '',
  });

  useEffect(() => {
    if (editing) {setForm({ ...editing });}
    else {setForm({ name: '', local_address: '', remote_address: '', rate_limit: '', only_one: 'yes', change_tcp_mss: 'yes', use_compression: 'no', use_encryption: 'yes', dns_server: '', wins_server: '', parent_queue: '' });}
  }, [editing, show]);

  if (!show) {return null;}

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="glass-strong rounded-2xl w-full max-w-lg animate-fade-in-scale" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-zinc-800/50">
          <h3 className="text-lg font-semibold text-white">{editing ? 'Edit Profile' : 'New PPPoE Profile'}</h3>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Profile Name *</label>
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="modern-input" placeholder="50mbps_profile" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Rate Limit</label>
              <input value={form.rate_limit} onChange={e => setForm({ ...form, rate_limit: e.target.value })} className="modern-input" placeholder="50M/50M" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">DNS Server</label>
              <input value={form.dns_server} onChange={e => setForm({ ...form, dns_server: e.target.value })} className="modern-input" placeholder="8.8.8.8" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Local Address</label>
              <input value={form.local_address} onChange={e => setForm({ ...form, local_address: e.target.value })} className="modern-input" placeholder="10.0.0.1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Remote Address Pool</label>
              <input value={form.remote_address} onChange={e => setForm({ ...form, remote_address: e.target.value })} className="modern-input" placeholder="pppoe_pool" />
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

/* ─── Main Page ─── */
export function PPPoEManagement() {
  const [activeTab, setActiveTab] = useState('secrets');
  const [loading, setLoading] = useState(true);
  const [secrets, setSecrets] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [active, setActive] = useState([]);
  const [connections, setConnections] = useState([]);
  const [search, setSearch] = useState('');
  const [showSecretForm, setShowSecretForm] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [editingSecret, setEditingSecret] = useState(null);
  const [editingProfile, setEditingProfile] = useState(null);
  const [selectedConnection, setSelectedConnection] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [secretsRes, profilesRes, activeRes, connRes] = await Promise.all([
        axios.get(`${API}/pppoe/secrets${selectedConnection ? `?connection_id=${selectedConnection}` : ''}`).catch(() => ({ data: [] })),
        axios.get(`${API}/pppoe/profiles${selectedConnection ? `?connection_id=${selectedConnection}` : ''}`).catch(() => ({ data: [] })),
        axios.get(`${API}/pppoe/active${selectedConnection ? `?connection_id=${selectedConnection}` : ''}`).catch(() => ({ data: [] })),
        axios.get(`${API}/mikrotik`).catch(() => ({ data: [] })),
      ]);
      setSecrets(Array.isArray(secretsRes.data) ? secretsRes.data : []);
      setProfiles(Array.isArray(profilesRes.data) ? profilesRes.data : []);
      setActive(Array.isArray(activeRes.data) ? activeRes.data : []);
      setConnections(Array.isArray(connRes.data) ? connRes.data : []);
    } catch (e) {
      console.error('PPPoE fetch error:', e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [selectedConnection]);

  const handleCreateSecret = async (form) => {
    try {
      await axios.post(`${API}/pppoe/secrets`, { ...form, connection_id: selectedConnection });
      setShowSecretForm(false);
      setEditingSecret(null);
      fetchData();
    } catch (e) { alert(e.response?.data?.error || 'Failed to create secret'); }
  };

  const handleDeleteSecret = async (name) => {
    if (!confirm(`Delete PPPoE secret "${name}"?`)) {return;}
    try {
      await axios.delete(`${API}/pppoe/secrets/${encodeURIComponent(name)}${selectedConnection ? `?connection_id=${selectedConnection}` : ''}`);
      fetchData();
    } catch (e) { alert('Failed to delete secret'); }
  };

  const handleToggleSecret = async (name, disabled) => {
    try {
      await axios.post(`${API}/pppoe/secrets/${encodeURIComponent(name)}/toggle${selectedConnection ? `?connection_id=${selectedConnection}` : ''}`);
      fetchData();
    } catch (e) { alert('Failed to toggle secret'); }
  };

  const handleCreateProfile = async (form) => {
    try {
      await axios.post(`${API}/pppoe/profiles`, { ...form, connection_id: selectedConnection });
      setShowProfileForm(false);
      setEditingProfile(null);
      fetchData();
    } catch (e) { alert('Failed to create profile'); }
  };

  const handleDeleteProfile = async (name) => {
    if (!confirm(`Delete profile "${name}"?`)) {return;}
    try {
      await axios.delete(`${API}/pppoe/profiles/${encodeURIComponent(name)}${selectedConnection ? `?connection_id=${selectedConnection}` : ''}`);
      fetchData();
    } catch (e) { alert('Failed to delete profile'); }
  };

  const handleKickUser = async (name) => {
    try {
      await axios.post(`${API}/pppoe/active/${encodeURIComponent(name)}/kick${selectedConnection ? `?connection_id=${selectedConnection}` : ''}`);
      fetchData();
    } catch (e) { alert('Failed to kick user'); }
  };

  const filteredSecrets = secrets.filter(s =>
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.comment?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredActive = active.filter(a =>
    a.name?.toLowerCase().includes(search.toLowerCase())
  );

  const tabs = [
    { id: 'secrets', label: 'Secrets', icon: Users, count: secrets.length },
    { id: 'profiles', label: 'Profiles', icon: Settings, count: profiles.length },
    { id: 'active', label: 'Active Sessions', icon: Activity, count: active.length },
  ];

  return (
    <div className="relative min-h-full p-8 animate-fade-in">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-noise" />

      {/* Header */}
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
              <Network className="w-4 h-4 text-white" />
            </div>
            PPPoE Management
          </h1>
          <p className="text-zinc-400 mt-1">Manage PPPoE secrets, profiles, and active sessions on MikroTik routers</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={selectedConnection} onChange={e => setSelectedConnection(e.target.value)} className="modern-input text-sm py-2">
            <option value="">All Routers</option>
            {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={fetchData} className="btn-ghost">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="relative grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Secrets" value={secrets.length} icon={Users} bg="bg-blue-500/10" ring="ring-blue-500/20" textColor="text-blue-400" sub={`${secrets.filter(s => !s.disabled).length} enabled`} />
        <StatCard title="Active Sessions" value={active.length} icon={Activity} bg="bg-emerald-500/10" ring="ring-emerald-500/20" textColor="text-emerald-400" />
        <StatCard title="Profiles" value={profiles.length} icon={Settings} bg="bg-violet-500/10" ring="ring-violet-500/20" textColor="text-violet-400" />
        <StatCard title="Connected" value={active.reduce((sum, a) => sum + (parseInt(a.uptime_seconds) || 0), 0)} icon={Wifi} bg="bg-cyan-500/10" ring="ring-cyan-500/20" textColor="text-cyan-400" sub="Total uptime" />
      </div>

      {/* Tabs */}
      <div className="relative flex gap-2 mb-6 flex-wrap">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60'
            }`}>
            <tab.icon className="w-4 h-4" /> {tab.label}
            <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${activeTab === tab.id ? 'bg-blue-500/30' : 'bg-zinc-700/60 text-zinc-500'}`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
          className="modern-input pl-10 max-w-md" />
      </div>

      {/* SECRETS TAB */}
      {activeTab === 'secrets' && (
        <div className="relative glass rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-300">PPPoE Secrets ({filteredSecrets.length})</h3>
            <button onClick={() => { setEditingSecret(null); setShowSecretForm(true); }} className="btn-primary text-xs py-2 px-3">
              <Plus className="w-3.5 h-3.5" /> New Secret
            </button>
          </div>
          {loading ? (
            <div className="p-6 space-y-3">{[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
          ) : (
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Service</th>
                  <th>Profile</th>
                  <th>Rate Limit</th>
                  <th>Comment</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSecrets.map((s, i) => (
                  <tr key={i}>
                    <td>
                      <div className="min-w-0">
                        <div className="text-white font-medium truncate">{s.name}</div>
                        <PasswordField value={s.password || ''} />
                      </div>
                    </td>
                    <td><span className="badge badge-blue">{s.service}</span></td>
                    <td className="text-sm text-zinc-400">{s.profile || 'default'}</td>
                    <td className="text-sm text-zinc-300 font-mono">{s.rate_limit || <span className="text-zinc-600">—</span>}</td>
                    <td className="text-sm text-zinc-400 max-w-[180px] truncate">{s.comment || <span className="text-zinc-600">—</span>}</td>
                    <td>
                      <span className={`badge ${s.disabled === 'true' || s.disabled === 'yes' ? 'badge-red' : 'badge-green'}`}>
                        {s.disabled === 'true' || s.disabled === 'yes' ? 'disabled' : 'active'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleToggleSecret(s.name, s.disabled)} className="btn-ghost p-2" title={s.disabled === 'true' ? 'Enable' : 'Disable'}>
                          {s.disabled === 'true' || s.disabled === 'yes' ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4 text-amber-400" />}
                        </button>
                        <button onClick={() => { setEditingSecret(s); setShowSecretForm(true); }} className="btn-ghost p-2" title="Edit">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteSecret(s.name)} className="btn-ghost p-2 text-zinc-500 hover:text-rose-400" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && filteredSecrets.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon"><Users className="w-6 h-6 text-zinc-600" /></div>
              <div className="empty-state-title">{search ? 'No secrets found' : 'No PPPoE secrets yet'}</div>
              <div className="empty-state-desc">{search ? 'Try a different search term' : 'Create your first PPPoE secret to get started'}</div>
            </div>
          )}
        </div>
      )}

      {/* PROFILES TAB */}
      {activeTab === 'profiles' && (
        <div className="relative glass rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-300">PPPoE Profiles ({profiles.length})</h3>
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
                  <th>Local Address</th>
                  <th>Remote Pool</th>
                  <th>DNS</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p, i) => (
                  <tr key={i}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Settings className="w-4 h-4 text-violet-400" />
                        <span className="text-white font-medium">{p.name}</span>
                      </div>
                    </td>
                    <td className="text-sm text-zinc-300 font-mono">{p.rate_limit || <span className="text-zinc-600">—</span>}</td>
                    <td className="text-sm text-zinc-400">{p.local_address || <span className="text-zinc-600">—</span>}</td>
                    <td className="text-sm text-zinc-400">{p.remote_address || <span className="text-zinc-600">—</span>}</td>
                    <td className="text-sm text-zinc-400">{p.dns_server || <span className="text-zinc-600">—</span>}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setEditingProfile(p); setShowProfileForm(true); }} className="btn-ghost p-2">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteProfile(p.name)} className="btn-ghost p-2 text-zinc-500 hover:text-rose-400">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && profiles.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon"><Settings className="w-6 h-6 text-zinc-600" /></div>
              <div className="empty-state-title">No profiles configured</div>
              <div className="empty-state-desc">Create PPPoE profiles to manage rate limits and settings</div>
            </div>
          )}
        </div>
      )}

      {/* ACTIVE SESSIONS TAB */}
      {activeTab === 'active' && (
        <div className="relative glass rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800/50">
            <h3 className="text-sm font-medium text-zinc-300">Active PPPoE Sessions ({filteredActive.length})</h3>
          </div>
          {loading ? (
            <div className="p-6 space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
          ) : (
            <table className="modern-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Address</th>
                  <th>Uptime</th>
                  <th>Encoding</th>
                  <th>Session ID</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredActive.map((a, i) => (
                  <tr key={i}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 status-dot" />
                        <span className="text-white font-medium">{a.name}</span>
                      </div>
                    </td>
                    <td className="text-sm text-zinc-300 font-mono">{a.address || <span className="text-zinc-600">—</span>}</td>
                    <td>
                      <div className="flex items-center gap-1.5 text-sm text-zinc-300">
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        {a.uptime || '00:00:00'}
                      </div>
                    </td>
                    <td className="text-sm text-zinc-400">{a.encoding || <span className="text-zinc-600">—</span>}</td>
                    <td className="text-sm text-zinc-500 font-mono">{a['.id'] || <span className="text-zinc-600">—</span>}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleKickUser(a.name)} className="btn-ghost p-2 text-zinc-500 hover:text-rose-400" title="Disconnect">
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
              <div className="empty-state-icon"><Activity className="w-6 h-6 text-zinc-600" /></div>
              <div className="empty-state-title">No active sessions</div>
              <div className="empty-state-desc">Active PPPoE connections will appear here</div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <SecretForm show={showSecretForm} onClose={() => { setShowSecretForm(false); setEditingSecret(null); }}
        editing={editingSecret} profiles={profiles} connections={connections} onSubmit={handleCreateSecret} />
      <ProfileForm show={showProfileForm} onClose={() => { setShowProfileForm(false); setEditingProfile(null); }}
        editing={editingProfile} onSubmit={handleCreateProfile} />
    </div>
  );
}
