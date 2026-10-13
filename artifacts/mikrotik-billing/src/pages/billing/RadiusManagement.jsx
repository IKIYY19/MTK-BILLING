import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Server, Users, Activity, Plus, Search, Trash2, Pencil, RefreshCw,
  Shield, Database, Clock, Eye, EyeOff, Copy, Check, Settings,
  ArrowUpRight, ArrowDownRight, Zap, UserCheck, UserX, FileText,
  ToggleLeft, ToggleRight,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

/* ─── Stat Card ─── */
function StatCard({ title, value, icon: Icon, bg, ring, textColor, sub }) {
  return (
    <div className="glass rounded-2xl p-5 card-hover group">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${bg} ring-1 ${ring} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
          <Icon className={`w-5 h-5 ${textColor}`} />
        </div>
      </div>
      <div className={`stat-value ${textColor}`}>{value}</div>
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
      <button onClick={() => setShow(!show)} className="text-zinc-500 hover:text-zinc-300">{show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
      <button onClick={copy} className="text-zinc-500 hover:text-zinc-300">{copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}</button>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) {return '0 B';}
  const b = parseInt(bytes);
  if (b < 1024) {return `${b} B`;}
  if (b < 1048576) {return `${(b / 1024).toFixed(1)} KB`;}
  if (b < 1073741824) {return `${(b / 1048576).toFixed(1)} MB`;}
  return `${(b / 1073741824).toFixed(2)} GB`;
}

function formatUptime(seconds) {
  if (!seconds) {return '—';}
  const s = parseInt(seconds);
  if (s < 60) {return `${s}s`;}
  if (s < 3600) {return `${Math.floor(s / 60)}m`;}
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

/* ─── Main Page ─── */
export function RadiusManagement() {
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [radiusProvisioningEnabled, setRadiusProvisioningEnabled] = useState(false);
  const [togglingRadius, setTogglingRadius] = useState(false);

  // Data
  const [nasClients, setNasClients] = useState([]);
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [accounting, setAccounting] = useState([]);
  const [authLog, setAuthLog] = useState([]);
  const [onlineCount, setOnlineCount] = useState(0);

  // Modal state
  const [showNasForm, setShowNasForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [nasRes, groupsRes, usersRes, accountingRes, authRes] = await Promise.all([
        axios.get(`${API}/radius/nas`).catch(() => ({ data: [] })),
        axios.get(`${API}/radius/groups`).catch(() => ({ data: [] })),
        axios.get(`${API}/radius/users`).catch(() => ({ data: [] })),
        axios.get(`${API}/radius/accounting/online`).catch(() => ({ data: [] })),
        axios.get(`${API}/radius/auth-log?limit=50`).catch(() => ({ data: { data: [] } })),
      ]);
      setNasClients(nasRes.data);
      setGroups(groupsRes.data);
      setUsers(usersRes.data);
      setAccounting(accountingRes.data);
      setAuthLog(authRes.data.data || authRes.data);
      setOnlineCount(accountingRes.data.length || 0);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); fetchRadiusProvisioningSetting(); }, []);

  const fetchRadiusProvisioningSetting = async () => {
    try {
      const { data } = await axios.get(`${API}/settings`);
      setRadiusProvisioningEnabled(data.radius_provisioning_enabled === 'true');
    } catch (e) { /* ignore */ }
  };

  const toggleRadiusProvisioning = async () => {
    setTogglingRadius(true);
    const newValue = !radiusProvisioningEnabled;
    try {
      await axios.post(`${API}/settings`, {
        key: 'radius_provisioning_enabled',
        value: String(newValue),
      });
      setRadiusProvisioningEnabled(newValue);
    } catch (e) {
      alert('Failed to toggle RADIUS provisioning');
    }
    setTogglingRadius(false);
  };

  // NAS
  const handleNasSubmit = async (form) => {
    try {
      await axios.post(`${API}/radius/nas`, form);
      setShowNasForm(false); setEditingItem(null); fetchData();
    } catch (e) { alert('Failed'); }
  };
  const handleNasDelete = async (id) => {
    if (!confirm('Delete NAS client?')) {return;}
    await axios.delete(`${API}/radius/nas/${id}`);
    fetchData();
  };

  // Groups
  const handleGroupSubmit = async (form) => {
    try {
      await axios.post(`${API}/radius/groups`, form);
      setShowGroupForm(false); setEditingItem(null); fetchData();
    } catch (e) { alert('Failed'); }
  };
  const handleGroupDelete = async (name) => {
    if (!confirm('Delete group?')) {return;}
    await axios.delete(`${API}/radius/groups/${name}`);
    fetchData();
  };

  // Users
  const handleUserSubmit = async (form) => {
    try {
      await axios.post(`${API}/radius/users`, form);
      setShowUserForm(false); setEditingItem(null); fetchData();
    } catch (e) { alert('Failed'); }
  };
  const handleUserDelete = async (username) => {
    if (!confirm(`Delete RADIUS user "${username}"?`)) {return;}
    await axios.delete(`${API}/radius/users/${username}`);
    fetchData();
  };
  const handleUserToggle = async (username) => {
    await axios.post(`${API}/radius/users/${username}/toggle`);
    fetchData();
  };

  // Sync from billing
  const handleSync = async () => {
    try {
      const { data } = await axios.post(`${API}/radius/sync-from-billing`);
      alert(`Created ${data.total_created} users, skipped ${data.total_skipped}`);
      fetchData();
    } catch (e) { alert('Sync failed'); }
  };

  const filteredUsers = users.filter(u => u.username?.toLowerCase().includes(search.toLowerCase()));
  const filteredAccounting = accounting.filter(a => a.username?.toLowerCase().includes(search.toLowerCase()));

  const tabs = [
    { id: 'users', label: 'Users', icon: Users, count: users.length },
    { id: 'groups', label: 'Groups', icon: Settings, count: groups.length },
    { id: 'nas', label: 'NAS Clients', icon: Server, count: nasClients.length },
    { id: 'accounting', label: 'Accounting', icon: Database, count: accounting.length },
    { id: 'authlog', label: 'Auth Log', icon: FileText },
  ];

  return (
    <div className="relative min-h-full p-8 animate-fade-in">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-noise" />

      {/* Header */}
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Shield className="w-4 h-4 text-white" />
            </div>
            RADIUS Management
          </h1>
          <p className="text-zinc-400 mt-1">FreeRADIUS user authentication, accounting, and MikroTik NAS integration</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleRadiusProvisioning}
            disabled={togglingRadius}
            className={`flex items-center gap-2 text-xs py-2 px-3 rounded-xl border transition-all ${
              radiusProvisioningEnabled
                ? 'bg-violet-500/20 border-violet-500/30 text-violet-300 hover:bg-violet-500/30'
                : 'bg-zinc-800/60 border-zinc-700/30 text-zinc-400 hover:text-zinc-200'
            }`}
            title={radiusProvisioningEnabled ? 'Auto-provision to RADIUS is ENABLED' : 'Auto-provision to RADIUS is DISABLED'}
          >
            {radiusProvisioningEnabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            RADIUS Provisioning {radiusProvisioningEnabled ? 'ON' : 'OFF'}
          </button>
          <button onClick={handleSync} className="btn-secondary text-xs py-2 px-3">
            <RefreshCw className="w-3.5 h-3.5" /> Sync from Billing
          </button>
          <button onClick={fetchData} className="btn-ghost"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Stats */}
      <div className="relative grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="RADIUS Users" value={users.length} icon={Users} bg="bg-violet-500/10" ring="ring-violet-500/20" textColor="text-violet-400" />
        <StatCard title="Online Sessions" value={onlineCount} icon={Activity} bg="bg-emerald-500/10" ring="ring-emerald-500/20" textColor="text-emerald-400" />
        <StatCard title="NAS Clients" value={nasClients.length} icon={Server} bg="bg-blue-500/10" ring="ring-blue-500/20" textColor="text-blue-400" />
        <StatCard title="Service Groups" value={groups.length} icon={Settings} bg="bg-amber-500/10" ring="ring-amber-500/20" textColor="text-amber-400" sub={`${groups.reduce((s, g) => s + g.user_count, 0)} users`} />
      </div>

      {/* Tabs */}
      <div className="relative flex gap-2 mb-6 flex-wrap">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === tab.id ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20' : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60'
            }`}>
            <tab.icon className="w-4 h-4" /> {tab.label}
            {tab.count !== undefined && <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${activeTab === tab.id ? 'bg-violet-500/30' : 'bg-zinc-700/60 text-zinc-500'}`}>{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
          className="modern-input pl-10 max-w-md" />
      </div>

      {/* USERS TAB */}
      {activeTab === 'users' && (
        <div className="relative glass rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-300">RADIUS Users ({filteredUsers.length})</h3>
            <button onClick={() => { setEditingItem(null); setShowUserForm(true); }} className="btn-primary text-xs py-2 px-3">
              <Plus className="w-3.5 h-3.5" /> New User
            </button>
          </div>
          {loading ? (
            <div className="p-6 space-y-3">{[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
          ) : (
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Customer</th>
                  <th>Groups</th>
                  <th>Rate Limit</th>
                  <th>Expiration</th>
                  <th>Sessions</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u, i) => (
                  <tr key={i}>
                    <td>
                      <div className="text-white font-mono text-sm">{u.username}</div>
                      <PasswordField value={u.password || ''} />
                    </td>
                    <td className="text-sm text-zinc-300">{u.customer_name || <span className="text-zinc-600">—</span>}</td>
                    <td><span className="badge badge-violet">{u.groups || 'none'}</span></td>
                    <td className="text-sm text-zinc-400 font-mono">{u.rate_limit || <span className="text-zinc-600">—</span>}</td>
                    <td className="text-sm text-zinc-400">{u.expiration || <span className="text-zinc-600">—</span>}</td>
                    <td>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-zinc-300">{u.active_sessions || 0}</span>
                        {parseInt(u.active_sessions || 0) > 0 && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleUserToggle(u.username)} className="btn-ghost p-2">
                          {parseInt(u.active_sessions || 0) > 0 ? <UserCheck className="w-4 h-4 text-emerald-400" /> : <UserX className="w-4 h-4 text-amber-400" />}
                        </button>
                        <button onClick={() => handleUserDelete(u.username)} className="btn-ghost p-2 text-zinc-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
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
              <div className="empty-state-title">No RADIUS users yet</div>
              <div className="empty-state-desc">Create users manually or sync from billing subscriptions</div>
              <button onClick={handleSync} className="btn-secondary mt-4"><RefreshCw className="w-4 h-4" /> Sync from Billing</button>
            </div>
          )}
        </div>
      )}

      {/* GROUPS TAB */}
      {activeTab === 'groups' && (
        <div className="relative glass rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-300">Service Groups ({groups.length})</h3>
            <button onClick={() => { setEditingItem(null); setShowGroupForm(true); }} className="btn-primary text-xs py-2 px-3">
              <Plus className="w-3.5 h-3.5" /> New Group
            </button>
          </div>
          {loading ? (
            <div className="p-6 space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
          ) : (
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Group Name</th>
                  <th>Check Rules</th>
                  <th>Reply Attributes</th>
                  <th>Users</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g, i) => (
                  <tr key={i}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Settings className="w-4 h-4 text-violet-400" />
                        <span className="text-white font-medium">{g.name}</span>
                      </div>
                    </td>
                    <td className="text-sm text-zinc-400">{g.check.length} rules</td>
                    <td className="text-sm text-zinc-400">{g.reply.length} attrs</td>
                    <td><span className="badge badge-blue">{g.user_count}</span></td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleGroupDelete(g.name)} className="btn-ghost p-2 text-zinc-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && groups.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon"><Settings className="w-6 h-6 text-zinc-600" /></div>
              <div className="empty-state-title">No service groups configured</div>
              <div className="empty-state-desc">Create groups to define rate limits, quotas, and access rules</div>
            </div>
          )}
        </div>
      )}

      {/* NAS TAB */}
      {activeTab === 'nas' && (
        <div className="relative glass rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-300">NAS Clients ({nasClients.length})</h3>
            <button onClick={() => { setEditingItem(null); setShowNasForm(true); }} className="btn-primary text-xs py-2 px-3">
              <Plus className="w-3.5 h-3.5" /> New NAS
            </button>
          </div>
          {loading ? (
            <div className="p-6 space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
          ) : (
            <table className="modern-table">
              <thead>
                <tr>
                  <th>NAS Name</th>
                  <th>Short Name</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {nasClients.map((n, i) => (
                  <tr key={i}>
                    <td className="font-mono text-white text-sm">{n.nasname}</td>
                    <td className="text-sm text-zinc-300">{n.shortname || <span className="text-zinc-600">—</span>}</td>
                    <td><span className="badge badge-blue">{n.type}</span></td>
                    <td className="text-sm text-zinc-400 max-w-[200px] truncate">{n.description || <span className="text-zinc-600">—</span>}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleNasDelete(n.id)} className="btn-ghost p-2 text-zinc-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && nasClients.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon"><Server className="w-6 h-6 text-zinc-600" /></div>
              <div className="empty-state-title">No NAS clients configured</div>
              <div className="empty-state-desc">Add MikroTik routers as RADIUS NAS clients</div>
            </div>
          )}
        </div>
      )}

      {/* ACCOUNTING TAB */}
      {activeTab === 'accounting' && (
        <div className="relative glass rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800/50">
            <h3 className="text-sm font-medium text-zinc-300">Active Sessions ({filteredAccounting.length})</h3>
          </div>
          {loading ? (
            <div className="p-6 space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
          ) : (
            <table className="modern-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>NAS IP</th>
                  <th>IP Address</th>
                  <th>Uptime</th>
                  <th>Upload ↓ / Download ↑</th>
                  <th>Called Station</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounting.map((a, i) => (
                  <tr key={i}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 status-dot" />
                        <span className="text-white font-mono text-sm">{a.username}</span>
                      </div>
                    </td>
                    <td className="text-sm text-zinc-300 font-mono">{a.nasipaddress?.toString() || <span className="text-zinc-600">—</span>}</td>
                    <td className="text-sm text-zinc-300 font-mono">{a.framedipaddress?.toString() || <span className="text-zinc-600">—</span>}</td>
                    <td className="text-sm text-zinc-300">{formatUptime(a.acctsessiontime)}</td>
                    <td>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-emerald-400 flex items-center gap-1"><ArrowUpRight className="w-3 h-3" />{formatBytes(a.acctoutputoctets)}</span>
                        <span className="text-blue-400 flex items-center gap-1"><ArrowDownRight className="w-3 h-3" />{formatBytes(a.acctinputoctets)}</span>
                      </div>
                    </td>
                    <td className="text-sm text-zinc-400 font-mono text-xs">{a.calledstationid || <span className="text-zinc-600">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && filteredAccounting.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon"><Database className="w-6 h-6 text-zinc-600" /></div>
              <div className="empty-state-title">No active sessions</div>
              <div className="empty-state-desc">RADIUS accounting data will appear when users authenticate</div>
            </div>
          )}
        </div>
      )}

      {/* AUTH LOG TAB */}
      {activeTab === 'authlog' && (
        <div className="relative glass rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800/50">
            <h3 className="text-sm font-medium text-zinc-300">Authentication Log ({authLog.length})</h3>
          </div>
          <table className="modern-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Username</th>
                <th>Result</th>
                <th>NAS IP</th>
                <th>Calling Station</th>
              </tr>
            </thead>
            <tbody>
              {authLog.map((l, i) => (
                <tr key={i}>
                  <td className="text-sm text-zinc-400">{new Date(l.authdate).toLocaleString()}</td>
                  <td className="text-white font-mono text-sm">{l.username}</td>
                  <td>
                    <span className={`badge ${l.reply === 'Access-Accept' ? 'badge-green' : 'badge-red'}`}>{l.reply}</span>
                  </td>
                  <td className="text-sm text-zinc-400 font-mono">{l.nasipaddress?.toString() || <span className="text-zinc-600">—</span>}</td>
                  <td className="text-sm text-zinc-400 font-mono text-xs">{l.callingstationid || <span className="text-zinc-600">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && authLog.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon"><FileText className="w-6 h-6 text-zinc-600" /></div>
              <div className="empty-state-title">No authentication logs yet</div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showNasForm && (
        <div className="modal-backdrop" onClick={() => setShowNasForm(false)}>
          <NasForm onClose={() => setShowNasForm(false)} onSubmit={handleNasSubmit} editing={editingItem} />
        </div>
      )}
      {showGroupForm && (
        <div className="modal-backdrop" onClick={() => setShowGroupForm(false)}>
          <GroupForm onClose={() => setShowGroupForm(false)} onSubmit={handleGroupSubmit} editing={editingItem} />
        </div>
      )}
      {showUserForm && (
        <div className="modal-backdrop" onClick={() => setShowUserForm(false)}>
          <RadiusUserForm onClose={() => setShowUserForm(false)} onSubmit={handleUserSubmit} editing={editingItem} groups={groups} />
        </div>
      )}
    </div>
  );
}

/* ─── NAS Form ─── */
function NasForm({ onClose, onSubmit }) {
  const [form, setForm] = useState({ nasname: '', shortname: '', secret: '', description: '', type: 'other' });
  return (
    <div className="glass-strong rounded-2xl w-full max-w-lg animate-fade-in-scale" onClick={e => e.stopPropagation()}>
      <div className="p-6 border-b border-zinc-800/50"><h3 className="text-lg font-semibold text-white">New NAS Client</h3></div>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">NAS Name (IP or Hostname) *</label>
          <input required value={form.nasname} onChange={e => setForm({ ...form, nasname: e.target.value })} className="modern-input" placeholder="192.168.1.1" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Short Name</label>
            <input value={form.shortname} onChange={e => setForm({ ...form, shortname: e.target.value })} className="modern-input" placeholder="router1" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Type</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="modern-input">
              <option value="other">other</option>
              <option value="mikrotik">mikrotik</option>
              <option value="cisco">cisco</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Shared Secret *</label>
          <input required value={form.secret} onChange={e => setForm({ ...form, secret: e.target.value })} className="modern-input" placeholder="radius_secret_123" />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
          <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="modern-input" placeholder="Main office router" />
        </div>
        <div className="flex gap-3 pt-2 border-t border-zinc-800/50">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" className="btn-primary flex-1">Create NAS</button>
        </div>
      </form>
    </div>
  );
}

/* ─── Group Form ─── */
function GroupForm({ onClose, onSubmit }) {
  const [name, setName] = useState('');
  const [checkRules, setCheckRules] = useState([{ attribute: '', value: '', op: '==' }]);
  const [replyAttrs, setReplyAttrs] = useState([{ attribute: 'Mikrotik-Rate-Limit', value: '10M/10M', op: '=' }]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ name, check: checkRules.filter(r => r.attribute && r.value), reply: replyAttrs.filter(r => r.attribute && r.value) });
  };

  return (
    <div className="glass-strong rounded-2xl w-full max-w-lg animate-fade-in-scale" onClick={e => e.stopPropagation()}>
      <div className="p-6 border-b border-zinc-800/50"><h3 className="text-lg font-semibold text-white">New Service Group</h3></div>
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Group Name *</label>
          <input required value={name} onChange={e => setName(e.target.value)} className="modern-input" placeholder="50mbps_unlimited" />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Check Rules</label>
          {checkRules.map((r, i) => (
            <div key={i} className="flex gap-2 mt-1">
              <input value={r.attribute} onChange={e => { const n = [...checkRules]; n[i].attribute = e.target.value; setCheckRules(n); }} className="modern-input text-xs py-2" placeholder="Attribute (e.g., Simultaneous-Use)" />
              <input value={r.value} onChange={e => { const n = [...checkRules]; n[i].value = e.target.value; setCheckRules(n); }} className="modern-input text-xs py-2" placeholder="Value" />
            </div>
          ))}
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Reply Attributes</label>
          {replyAttrs.map((r, i) => (
            <div key={i} className="flex gap-2 mt-1">
              <input value={r.attribute} onChange={e => { const n = [...replyAttrs]; n[i].attribute = e.target.value; setReplyAttrs(n); }} className="modern-input text-xs py-2" placeholder="Attribute" />
              <input value={r.value} onChange={e => { const n = [...replyAttrs]; n[i].value = e.target.value; setReplyAttrs(n); }} className="modern-input text-xs py-2" placeholder="Value" />
            </div>
          ))}
        </div>
        <div className="flex gap-3 pt-2 border-t border-zinc-800/50">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" className="btn-primary flex-1">Create Group</button>
        </div>
      </form>
    </div>
  );
}

/* ─── RADIUS User Form ─── */
function RadiusUserForm({ onClose, onSubmit, groups }) {
  const [form, setForm] = useState({ username: '', password: '', customer_id: '', groups: [], attributes: [] });

  const handleSubmit = (e) => {
    e.preventDefault();
    const attrs = [];
    if (form.rate_limit) {attrs.push({ attribute: 'Mikrotik-Rate-Limit', value: form.rate_limit, op: ':=' });}
    if (form.framed_ip) {attrs.push({ attribute: 'Framed-IP-Address', value: form.framed_ip, op: '=' });}
    if (form.expiration) {attrs.push({ attribute: 'Expiration', value: form.expiration, op: ':=' });}
    onSubmit({ ...form, attributes: attrs });
  };

  return (
    <div className="glass-strong rounded-2xl w-full max-w-lg animate-fade-in-scale" onClick={e => e.stopPropagation()}>
      <div className="p-6 border-b border-zinc-800/50"><h3 className="text-lg font-semibold text-white">New RADIUS User</h3></div>
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Username *</label>
            <input required value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className="modern-input" placeholder="customer001" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Password *</label>
            <input required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="modern-input" placeholder="secure123" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Rate Limit</label>
            <input value={form.rate_limit} onChange={e => setForm({ ...form, rate_limit: e.target.value })} className="modern-input" placeholder="10M/10M" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Expiration</label>
            <input value={form.expiration} onChange={e => setForm({ ...form, expiration: e.target.value })} className="modern-input" placeholder="01 Jan 2026" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Groups</label>
          <select value={form.groups[0] || ''} onChange={e => setForm({ ...form, groups: [e.target.value] })} className="modern-input">
            <option value="">None</option>
            {groups.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
          </select>
        </div>
        <div className="flex gap-3 pt-2 border-t border-zinc-800/50">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" className="btn-primary flex-1">Create User</button>
        </div>
      </form>
    </div>
  );
}
