import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Server, Globe, Shield, Network, Plus, Search, Trash2, Pencil, RefreshCw,
  Play, Pause, Eye, EyeOff, Copy, Check, Settings, Zap, AlertCircle,
  Wifi, ArrowUpRight, ArrowDownRight
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
      <div className={`stat-value ${textColor}`}>{typeof value === 'number' ? value : value}</div>
      <div className="text-sm text-zinc-400 mt-1">{title}</div>
      {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

/* ─── Simple Form Modal ─── */
function SimpleForm({ show, onClose, title, fields, onSubmit, editing }) {
  const [form, setForm] = useState({});
  useEffect(() => {
    if (editing) {setForm({ ...editing });}
    else { const init = {}; fields.forEach(f => init[f.name] = f.default || ''); setForm(init); }
  }, [editing, show]);
  if (!show) {return null;}
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="glass-strong rounded-2xl w-full max-w-lg animate-fade-in-scale" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-zinc-800/50">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="p-6 space-y-4">
          {fields.map((f, i) => (
            <div key={i}>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">{f.label}</label>
              {f.type === 'select' ? (
                <select value={form[f.name] || ''} onChange={e => setForm({ ...form, [f.name]: e.target.value })} className="modern-input">
                  {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input value={form[f.name] || ''} onChange={e => setForm({ ...form, [f.name]: e.target.value })} className="modern-input" placeholder={f.placeholder} />
              )}
            </div>
          ))}
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
export function NetworkServices() {
  const [activeTab, setActiveTab] = useState('queues');
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState('');
  const [search, setSearch] = useState('');

  // Queues
  const [queues, setQueues] = useState([]);
  const [showQueueForm, setShowQueueForm] = useState(false);
  const [editingQueue, setEditingQueue] = useState(null);

  // DHCP
  const [dhcpLeases, setDhcpLeases] = useState([]);
  const [dhcpNetworks, setDhcpNetworks] = useState([]);
  const [dhcpServers, setDhcpServers] = useState([]);

  // DNS
  const [dnsSettings, setDnsSettings] = useState(null);

  // Firewall
  const [firewallRules, setFirewallRules] = useState([]);
  const [showFirewallForm, setShowFirewallForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    const params = selectedConnection ? `?connection_id=${selectedConnection}` : '';
    try {
      const [queuesRes, leasesRes, networksRes, serversRes, dnsRes, firewallRes, connRes] = await Promise.all([
        axios.get(`${API}/network/queues${params}`).catch(() => ({ data: [] })),
        axios.get(`${API}/network/dhcp-leases${params}`).catch(() => ({ data: [] })),
        axios.get(`${API}/network/dhcp-networks${params}`).catch(() => ({ data: [] })),
        axios.get(`${API}/network/dhcp-servers${params}`).catch(() => ({ data: [] })),
        axios.get(`${API}/network/dns${params}`).catch(() => ({ data: null })),
        axios.get(`${API}/network/firewall${params}`).catch(() => ({ data: [] })),
        axios.get(`${API}/mikrotik`).catch(() => ({ data: [] })),
      ]);
      setQueues(Array.isArray(queuesRes.data) ? queuesRes.data : []);
      setDhcpLeases(Array.isArray(leasesRes.data) ? leasesRes.data : []);
      setDhcpNetworks(Array.isArray(networksRes.data) ? networksRes.data : []);
      setDhcpServers(Array.isArray(serversRes.data) ? serversRes.data : []);
      setDnsSettings(dnsRes.data);
      setFirewallRules(Array.isArray(firewallRes.data) ? firewallRes.data : []);
      setConnections(Array.isArray(connRes.data) ? connRes.data : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [selectedConnection]);

  const handleQueueSubmit = async (form) => {
    try {
      await axios.post(`${API}/network/queues`, { ...form, connection_id: selectedConnection });
      setShowQueueForm(false); setEditingQueue(null); fetchData();
    } catch (e) { alert('Failed to create queue'); }
  };

  const handleQueueDelete = async (name) => {
    if (!confirm(`Delete queue "${name}"?`)) {return;}
    try {
      await axios.delete(`${API}/network/queues/${encodeURIComponent(name)}${selectedConnection ? `?connection_id=${selectedConnection}` : ''}`);
      fetchData();
    } catch (e) { alert('Failed to delete'); }
  };

  const handleQueueToggle = async (name) => {
    try {
      await axios.post(`${API}/network/queues/${encodeURIComponent(name)}/toggle${selectedConnection ? `?connection_id=${selectedConnection}` : ''}`);
      fetchData();
    } catch (e) { alert('Failed to toggle'); }
  };

  const handleFirewallSubmit = async (form) => {
    try {
      await axios.post(`${API}/network/firewall`, { ...form, connection_id: selectedConnection });
      setShowFirewallForm(false); setEditingRule(null); fetchData();
    } catch (e) { alert('Failed to create rule'); }
  };

  const handleFirewallDelete = async (id) => {
    if (!confirm('Delete this rule?')) {return;}
    try {
      await axios.delete(`${API}/network/firewall/${encodeURIComponent(id)}${selectedConnection ? `?connection_id=${selectedConnection}` : ''}`);
      fetchData();
    } catch (e) { alert('Failed to delete'); }
  };

  const handleFirewallToggle = async (id) => {
    try {
      await axios.post(`${API}/network/firewall/${encodeURIComponent(id)}/toggle${selectedConnection ? `?connection_id=${selectedConnection}` : ''}`);
      fetchData();
    } catch (e) { alert('Failed to toggle'); }
  };

  const filteredQueues = queues.filter(q => q.name?.toLowerCase().includes(search.toLowerCase()));
  const filteredFirewall = firewallRules.filter(r => r.comment?.toLowerCase().includes(search.toLowerCase()) || r.src_address?.includes(search));
  const filteredLeases = dhcpLeases.filter(l => l.address?.includes(search) || l.mac_address?.toLowerCase().includes(search.toLowerCase()));

  const tabs = [
    { id: 'queues', label: 'Queues', icon: Zap, count: queues.length },
    { id: 'dhcp', label: 'DHCP', icon: Network, count: dhcpLeases.length },
    { id: 'dns', label: 'DNS', icon: Globe, count: 0 },
    { id: 'firewall', label: 'Firewall', icon: Shield, count: firewallRules.length },
  ];

  const queueFields = [
    { name: 'name', label: 'Queue Name', placeholder: 'queue_customer_001' },
    { name: 'target', label: 'Target', placeholder: '192.168.1.100/32 or pppoe-username' },
    { name: 'max_limit', label: 'Max Limit (rx/tx)', placeholder: '10M/10M' },
    { name: 'priority', label: 'Priority', placeholder: '8' },
    { name: 'parent', label: 'Parent Queue', placeholder: 'global' },
    { name: 'comment', label: 'Comment', placeholder: 'Customer queue' },
  ];

  const firewallFields = [
    { name: 'chain', label: 'Chain', type: 'select', options: [
      { value: 'forward', label: 'forward' },
      { value: 'input', label: 'input' },
      { value: 'output', label: 'output' },
    ]},
    { name: 'action', label: 'Action', type: 'select', options: [
      { value: 'accept', label: 'accept' },
      { value: 'drop', label: 'drop' },
      { value: 'reject', label: 'reject' },
      { value: 'add-src-to-address-list', label: 'add to address list' },
    ]},
    { name: 'src_address', label: 'Source Address', placeholder: '192.168.1.0/24' },
    { name: 'dst_address', label: 'Destination Address', placeholder: '0.0.0.0/0' },
    { name: 'protocol', label: 'Protocol', type: 'select', options: [
      { value: '', label: 'any' },
      { value: 'tcp', label: 'tcp' },
      { value: 'udp', label: 'udp' },
      { value: 'icmp', label: 'icmp' },
    ]},
    { name: 'dst_port', label: 'Destination Port', placeholder: '80,443' },
    { name: 'comment', label: 'Comment', placeholder: 'Block Facebook' },
  ];

  return (
    <div className="relative min-h-full p-8 animate-fade-in">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-noise" />

      {/* Header */}
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Server className="w-4 h-4 text-white" />
            </div>
            Network Services
          </h1>
          <p className="text-zinc-400 mt-1">Manage queues, DHCP, DNS, and firewall rules on MikroTik routers</p>
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
        <StatCard title="Simple Queues" value={queues.length} icon={Zap} bg="bg-amber-500/10" ring="ring-amber-500/20" textColor="text-amber-400" sub={`${queues.filter(q => !q.disabled).length} enabled`} />
        <StatCard title="DHCP Leases" value={dhcpLeases.length} icon={Network} bg="bg-blue-500/10" ring="ring-blue-500/20" textColor="text-blue-400" sub={`${dhcpLeases.filter(l => !l.blocked).length} active`} />
        <StatCard title="DHCP Networks" value={dhcpNetworks.length} icon={Server} bg="bg-violet-500/10" ring="ring-violet-500/20" textColor="text-violet-400" />
        <StatCard title="Firewall Rules" value={firewallRules.length} icon={Shield} bg="bg-emerald-500/10" ring="ring-emerald-500/20" textColor="text-emerald-400" sub={`${firewallRules.filter(r => !r.disabled).length} enabled`} />
      </div>

      {/* Tabs */}
      <div className="relative flex gap-2 mb-6 flex-wrap">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === tab.id ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/20' : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60'
            }`}>
            <tab.icon className="w-4 h-4" /> {tab.label}
            <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${activeTab === tab.id ? 'bg-cyan-500/30' : 'bg-zinc-700/60 text-zinc-500'}`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
          className="modern-input pl-10 max-w-md" />
      </div>

      {/* QUEUES TAB */}
      {activeTab === 'queues' && (
        <div className="relative glass rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-300">Simple Queues ({filteredQueues.length})</h3>
            <button onClick={() => { setEditingQueue(null); setShowQueueForm(true); }} className="btn-primary text-xs py-2 px-3">
              <Plus className="w-3.5 h-3.5" /> New Queue
            </button>
          </div>
          {loading ? (
            <div className="p-6 space-y-3">{[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
          ) : (
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Target</th>
                  <th>Max Limit</th>
                  <th>Priority</th>
                  <th>Packets ↑/↓</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredQueues.map((q, i) => (
                  <tr key={i}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-400" />
                        <span className="text-white font-medium truncate max-w-[180px]">{q.name}</span>
                      </div>
                    </td>
                    <td className="text-sm text-zinc-300 font-mono">{q.target || <span className="text-zinc-600">—</span>}</td>
                    <td className="text-sm text-zinc-300 font-mono">{q['max-limit'] || <span className="text-zinc-600">—</span>}</td>
                    <td className="text-sm text-zinc-400">{q.priority || '8'}</td>
                    <td>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-emerald-400 flex items-center gap-1"><ArrowUpRight className="w-3 h-3" />{q.packets || 0}</span>
                        <span className="text-blue-400 flex items-center gap-1"><ArrowDownRight className="w-3 h-3" />{q['bytes'] || 0}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${q.disabled === 'true' || q.disabled === 'yes' ? 'badge-red' : 'badge-green'}`}>
                        {q.disabled === 'true' || q.disabled === 'yes' ? 'disabled' : 'active'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleQueueToggle(q.name)} className="btn-ghost p-2">
                          {q.disabled === 'true' || q.disabled === 'yes' ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4 text-amber-400" />}
                        </button>
                        <button onClick={() => handleQueueDelete(q.name)} className="btn-ghost p-2 text-zinc-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && filteredQueues.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon"><Zap className="w-6 h-6 text-zinc-600" /></div>
              <div className="empty-state-title">No queues configured</div>
              <div className="empty-state-desc">Create simple queues to manage bandwidth per user or IP</div>
            </div>
          )}
        </div>
      )}

      {/* DHCP TAB */}
      {activeTab === 'dhcp' && (
        <div className="space-y-6">
          {/* DHCP Leases */}
          <div className="relative glass rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-zinc-800/50">
              <h3 className="text-sm font-medium text-zinc-300">DHCP Leases ({filteredLeases.length})</h3>
            </div>
            {loading ? (
              <div className="p-6 space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
            ) : (
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Address</th>
                    <th>MAC Address</th>
                    <th>Host Name</th>
                    <th>Server</th>
                    <th>Expires After</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeases.map((l, i) => (
                    <tr key={i}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${l.blocked === 'true' ? 'bg-rose-400' : 'bg-emerald-400'} status-dot`} />
                          <span className="text-white font-mono text-sm">{l.address}</span>
                        </div>
                      </td>
                      <td className="text-sm text-zinc-300 font-mono">{l['mac-address']}</td>
                      <td className="text-sm text-zinc-400">{l['host-name'] || <span className="text-zinc-600">—</span>}</td>
                      <td className="text-sm text-zinc-400">{l.server || 'all'}</td>
                      <td className="text-sm text-zinc-400">{l['expires-after'] || <span className="text-zinc-600">—</span>}</td>
                      <td>
                        <span className={`badge ${l.blocked === 'true' ? 'badge-red' : l.status === 'waiting' ? 'badge-amber' : 'badge-green'}`}>
                          {l.blocked === 'true' ? 'blocked' : l.status || 'bound'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* DHCP Networks */}
          <div className="relative glass rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-zinc-800/50">
              <h3 className="text-sm font-medium text-zinc-300">DHCP Networks ({dhcpNetworks.length})</h3>
            </div>
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Network</th>
                  <th>Gateway</th>
                  <th>DNS Server</th>
                  <th>Address Pool</th>
                </tr>
              </thead>
              <tbody>
                {dhcpNetworks.map((n, i) => (
                  <tr key={i}>
                    <td className="text-white font-mono text-sm">{n.address}</td>
                    <td className="text-sm text-zinc-300 font-mono">{n.gateway || <span className="text-zinc-600">—</span>}</td>
                    <td className="text-sm text-zinc-400 font-mono">{n['dns-server'] || <span className="text-zinc-600">—</span>}</td>
                    <td className="text-sm text-zinc-400">{n['address-list'] || <span className="text-zinc-600">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DNS TAB */}
      {activeTab === 'dns' && (
        <div className="relative glass rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-6">
            <Globe className="w-5 h-5 text-blue-400" />
            <h3 className="text-base font-semibold text-white">DNS Settings</h3>
          </div>
          {loading ? (
            <div className="skeleton h-32 rounded-xl" />
          ) : dnsSettings ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-zinc-900/60 rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-medium text-zinc-300">General</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500">Servers</span>
                    <span className="text-sm text-white font-mono">{dnsSettings.servers || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500">Max Concurrent</span>
                    <span className="text-sm text-white font-mono">{dnsSettings['max-concurrent-queries'] || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500">Max UDP Packet</span>
                    <span className="text-sm text-white font-mono">{dnsSettings['max-udp-packet-size'] || '—'}</span>
                  </div>
                </div>
              </div>
              <div className="bg-zinc-900/60 rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-medium text-zinc-300">Cache & Forwarding</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500">Allow Remote Requests</span>
                    <span className={`badge ${dnsSettings['allow-remote-requests'] === 'true' || dnsSettings['allow-remote-requests'] === 'yes' ? 'badge-green' : 'badge-red'}`}>
                      {dnsSettings['allow-remote-requests'] === 'true' || dnsSettings['allow-remote-requests'] === 'yes' ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500">Use DOH Server</span>
                    <span className="text-sm text-white font-mono">{dnsSettings['doh-server'] || <span className="text-zinc-600">—</span>}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500">Cache Size</span>
                    <span className="text-sm text-white font-mono">{dnsSettings['cache-size'] || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500">Cache Max TTL</span>
                    <span className="text-sm text-white font-mono">{dnsSettings['cache-max-ttl'] || '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-zinc-500">
              <Globe className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
              <div className="text-zinc-300 font-medium mb-1">DNS settings unavailable</div>
              <div className="text-sm">Unable to fetch DNS configuration from router</div>
            </div>
          )}
        </div>
      )}

      {/* FIREWALL TAB */}
      {activeTab === 'firewall' && (
        <div className="relative glass rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-300">Filter Rules ({filteredFirewall.length})</h3>
            <button onClick={() => { setEditingRule(null); setShowFirewallForm(true); }} className="btn-primary text-xs py-2 px-3">
              <Plus className="w-3.5 h-3.5" /> New Rule
            </button>
          </div>
          {loading ? (
            <div className="p-6 space-y-3">{[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
          ) : (
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Chain</th>
                  <th>Action</th>
                  <th>Source</th>
                  <th>Destination</th>
                  <th>Protocol</th>
                  <th>Port</th>
                  <th>Comment</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFirewall.map((r, i) => (
                  <tr key={i}>
                    <td><span className="badge badge-blue">{r.chain}</span></td>
                    <td>
                      <span className={`badge ${r.action === 'accept' ? 'badge-green' : r.action === 'drop' ? 'badge-red' : r.action === 'reject' ? 'badge-amber' : 'badge-zinc'}`}>
                        {r.action}
                      </span>
                    </td>
                    <td className="text-sm text-zinc-300 font-mono">{r.src_address || <span className="text-zinc-600">any</span>}</td>
                    <td className="text-sm text-zinc-300 font-mono">{r.dst_address || <span className="text-zinc-600">any</span>}</td>
                    <td className="text-sm text-zinc-400">{r.protocol || <span className="text-zinc-600">any</span>}</td>
                    <td className="text-sm text-zinc-400 font-mono">{r.dst_port || <span className="text-zinc-600">—</span>}</td>
                    <td className="text-sm text-zinc-400 max-w-[150px] truncate">{r.comment || <span className="text-zinc-600">—</span>}</td>
                    <td>
                      <span className={`badge ${r.disabled === 'true' || r.disabled === 'yes' ? 'badge-red' : 'badge-green'}`}>
                        {r.disabled === 'true' || r.disabled === 'yes' ? 'disabled' : 'active'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleFirewallToggle(r['.id'] || r.id)} className="btn-ghost p-2">
                          {r.disabled === 'true' || r.disabled === 'yes' ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4 text-amber-400" />}
                        </button>
                        <button onClick={() => handleFirewallDelete(r['.id'] || r.id)} className="btn-ghost p-2 text-zinc-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && filteredFirewall.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon"><Shield className="w-6 h-6 text-zinc-600" /></div>
              <div className="empty-state-title">No firewall rules configured</div>
              <div className="empty-state-desc">Create filter rules to secure your network</div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <SimpleForm show={showQueueForm} onClose={() => { setShowQueueForm(false); setEditingQueue(null); }}
        title={editingQueue ? 'Edit Queue' : 'New Simple Queue'} fields={queueFields} onSubmit={handleQueueSubmit} editing={editingQueue} />
      <SimpleForm show={showFirewallForm} onClose={() => { setShowFirewallForm(false); setEditingRule(null); }}
        title={editingRule ? 'Edit Firewall Rule' : 'New Firewall Rule'} fields={firewallFields} onSubmit={handleFirewallSubmit} editing={editingRule} />
    </div>
  );
}
