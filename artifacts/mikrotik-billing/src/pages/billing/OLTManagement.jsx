import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useToast } from '../../hooks/useToast';
import {
  Network, Plus, Search, Pencil, Trash2, RefreshCw, AlertTriangle,
  CheckCircle2, XCircle, Activity, Server, Radio, Zap, Eye, Terminal, Settings
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

const VENDOR_CONFIG = {
  huawei: { label: 'Huawei', models: ['MA5600T', 'MA5800', 'MA5608T'], color: 'text-red-400' },
  zte: { label: 'ZTE', models: ['C300', 'C320', 'C600'], color: 'text-blue-400' },
  fiberhome: { label: 'FiberHome', models: ['AN5516', 'AN5116'], color: 'text-green-400' },
  nokia: { label: 'Nokia', models: ['ISAM 7302', 'ISAM 7330'], color: 'text-purple-400' },
  generic: { label: 'Generic', models: [], color: 'text-zinc-400' },
};

function StatCard({ title, value, icon: Icon, bg, ring, textColor, sub }) {
  return (
    <div className="glass rounded-2xl p-5 card-hover group">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${bg} ring-1 ${ring} flex items-center justify-center group-hover:scale-110 transition-transform`}>
          <Icon className={`w-5 h-5 ${textColor}`} />
        </div>
      </div>
      <div className={`stat-value ${textColor}`}>{value}</div>
      <div className="text-sm text-zinc-400 mt-1">{title}</div>
      {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export function OLTManagement() {
  const [activeTab, setActiveTab] = useState('connections');
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedOLT, setSelectedOLT] = useState(null);
  const [onus, setONUs] = useState([]);
  const [ports, setPorts] = useState([]);
  const [oltStats, setOLTStats] = useState(null);
  const [commandOutput, setCommandOutput] = useState('');
  const [command, setCommand] = useState('');
  const { toast } = useToast();

  useEffect(() => { fetchConnections(); }, []);
  useEffect(() => { if (selectedOLT) {loadOLTData(selectedOLT);} }, [selectedOLT]);

  const fetchConnections = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get(`${API}/olt`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setConnections(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch OLT connections:', e);
      toast.error('Failed to load OLT connections');
    }
    setLoading(false);
  };

  const loadOLTData = async (oltId) => {
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const [statsRes, onuRes, portRes] = await Promise.all([
        axios.get(`${API}/olt/${oltId}/statistics`, { headers }).catch(() => ({ data: null })),
        axios.get(`${API}/olt/${oltId}/onu`, { headers }).catch(() => ({ data: null })),
        axios.get(`${API}/olt/${oltId}/ports`, { headers }).catch(() => ({ data: null })),
      ]);

      if (statsRes.data?.success) {setOLTStats(statsRes.data);}
      if (onuRes.data?.success) {setONUs(onuRes.data.onus || []);}
      if (portRes.data?.success) {setPorts(portRes.data.ports || []);}
    } catch (e) {
      console.error('Failed to load OLT data:', e);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

      if (editing?.id) {
        await axios.put(`${API}/olt/${editing.id}`, editing, { headers });
        toast.success('OLT connection updated');
      } else {
        await axios.post(`${API}/olt`, editing, { headers });
        toast.success('OLT connection created');
      }

      setShowForm(false);
      setEditing(null);
      await fetchConnections();
    } catch (e) {
      const error = e.response?.data?.error || 'Failed to save OLT connection';
      toast.error(error);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this OLT connection?')) {return;}
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/olt/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      toast.success('OLT connection deleted');
      if (selectedOLT === id) {setSelectedOLT(null);}
      await fetchConnections();
    } catch (e) {
      toast.error('Failed to delete OLT connection');
    }
  };

  const handleTest = async (id) => {
    try {
      const token = localStorage.getItem('token');
      toast.info('Testing connection...');
      const { data } = await axios.post(`${API}/olt/${id}/test`, {}, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (data.success) {
        toast.success(`SNMP: ${data.systemName || 'Connected'}`);
      } else {
        toast.error(data.error || 'Connection failed');
      }
    } catch (e) {
      toast.error('Connection test failed');
    }
  };

  const handleExecuteCommand = async () => {
    if (!selectedOLT || !command) {return;}
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.post(`${API}/olt/${selectedOLT}/command`, { command }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setCommandOutput(data.output || 'Command executed');
      toast.success('Command executed successfully');
    } catch (e) {
      const error = e.response?.data?.error || 'Command failed';
      setCommandOutput(`Error: ${error}`);
      toast.error(error);
    }
  };

  const filtered = connections.filter(c => 
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.vendor?.toLowerCase().includes(search.toLowerCase()) ||
    c.ip_address?.includes(search)
  );

  const selectedConnection = connections.find(c => c.id === selectedOLT);
  const totalONUs = oltStats?.onuCount || 0;
  const totalPorts = oltStats?.portCount || 0;
  const activeONUs = oltStats?.activeONUs || 0;

  const tabs = [
    { id: 'connections', label: 'Connections', icon: Network },
    { id: 'on us', label: 'ONUs', icon: Radio },
    { id: 'ports', label: 'PON Ports', icon: Server },
    { id: 'terminal', label: 'Command Line', icon: Terminal },
  ];

  return (
    <div className="relative min-h-full p-8 animate-fade-in">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-noise" />

      {/* Header */}
      <div className="relative flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Network className="w-4 h-4 text-white" />
            </div>
            OLT Management
          </h1>
          <p className="text-zinc-400 mt-1">Monitor Huawei, ZTE, FiberHome, Nokia & Generic OLTs with SNMP</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchConnections} className="btn-ghost"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => { setEditing({ name: '', vendor: 'huawei', model: '', ip_address: '', telnet_port: 23, snmp_port: 161, username: 'admin', password: '', snmp_community: 'public', location: '', status: 'active', custom_oids: { ponPorts: '', onuList: '', opticalPower: '' } }); setShowForm(true); }} className="btn-primary">
            <Plus className="w-4 h-4" /> Add OLT
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="relative grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total OLTs" value={connections.length} icon={Network} bg="bg-cyan-500/10" ring="ring-cyan-500/20" textColor="text-cyan-400" />
        <StatCard title="Total ONUs" value={totalONUs} icon={Radio} bg="bg-blue-500/10" ring="ring-blue-500/20" textColor="text-blue-400" sub={`${activeONUs} active`} />
        <StatCard title="PON Ports" value={totalPorts} icon={Server} bg="bg-purple-500/10" ring="ring-purple-500/20" textColor="text-purple-400" />
        <StatCard title="OLT Selected" value={selectedConnection?.name || 'None'} icon={Zap} bg="bg-amber-500/10" ring="ring-amber-500/20" textColor="text-amber-400" sub={selectedConnection?.vendor} />
      </div>

      {/* OLT Selector */}
      {connections.length > 0 && (
        <div className="relative mb-6">
          <label className="block text-sm font-medium text-zinc-300 mb-2">Select OLT to Monitor</label>
          <select
            value={selectedOLT || ''}
            onChange={e => setSelectedOLT(e.target.value || null)}
            className="modern-input max-w-md"
          >
            <option value="">-- Select OLT --</option>
            {connections.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.vendor} - {c.ip_address})</option>
            ))}
          </select>
        </div>
      )}

      {/* Tabs */}
      <div className="relative flex gap-2 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            disabled={!selectedOLT && tab.id !== 'connections'}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === tab.id ? 'bg-cyan-600 text-white shadow-lg' : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700/60'
            } ${!selectedOLT && tab.id !== 'connections' ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      {activeTab === 'connections' && (
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search OLTs..."
            className="modern-input pl-10 max-w-md" />
        </div>
      )}

      {/* Connections Table */}
      {activeTab === 'connections' && (
        <div className="relative glass rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
          ) : (
            <table className="modern-table">
              <thead>
                <tr>
                  <th>OLT Name</th>
                  <th>Vendor</th>
                  <th>IP Address</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className={selectedOLT === c.id ? 'bg-cyan-500/10' : ''}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/20 flex items-center justify-center text-sm font-semibold text-cyan-400 flex-shrink-0">
                          <Network className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-white font-medium">{c.name}</div>
                          {c.model && <div className="text-xs text-zinc-500">{c.model}</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${VENDOR_CONFIG[c.vendor]?.color || 'text-zinc-400'}`}>
                        {VENDOR_CONFIG[c.vendor]?.label || c.vendor}
                      </span>
                    </td>
                    <td className="text-sm text-zinc-300 font-mono">{c.ip_address}</td>
                    <td className="text-sm text-zinc-400">{c.location || '-'}</td>
                    <td><span className={`badge ${c.status === 'active' ? 'badge-green' : 'badge-red'}`}>{c.status}</span></td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleTest(c.id)} className="btn-ghost p-2" title="Test Connection"><Activity className="w-4 h-4" /></button>
                        <button onClick={() => { setSelectedOLT(c.id); setActiveTab('on us'); }} className="btn-ghost p-2" title="View ONUs"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => { setEditing(c); setShowForm(true); }} className="btn-ghost p-2"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(c.id)} className="btn-ghost p-2 text-zinc-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && filtered.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon"><Network className="w-6 h-6 text-zinc-600" /></div>
              <div className="empty-state-title">{search ? 'No OLTs found' : 'No OLT connections yet'}</div>
              <div className="empty-state-desc">Add your first OLT to start monitoring fiber network</div>
            </div>
          )}
        </div>
      )}

      {/* ONUs Tab */}
      {activeTab === 'on us' && selectedOLT && (
        <div className="relative glass rounded-2xl overflow-hidden p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Connected ONUs</h3>
          {onus.length === 0 ? (
            <div className="text-center text-zinc-500 py-8">No ONUs found or SNMP not available</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {onus.slice(0, 50).map((onu, i) => (
                <div key={i} className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white">ONU #{i + 1}</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-xs text-zinc-500 font-mono truncate">{onu.oid}</div>
                  <div className="text-xs text-zinc-400 mt-1">Value: {String(onu.value)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PON Ports Tab */}
      {activeTab === 'ports' && selectedOLT && (
        <div className="relative glass rounded-2xl overflow-hidden p-6">
          <h3 className="text-lg font-semibold text-white mb-4">PON Ports</h3>
          {ports.length === 0 ? (
            <div className="text-center text-zinc-500 py-8">No PON ports found or SNMP not available</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {ports.slice(0, 24).map((port, i) => (
                <div key={i} className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50 text-center">
                  <Server className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
                  <div className="text-sm font-medium text-white">Port {i + 1}</div>
                  <div className="text-xs text-zinc-500 font-mono truncate mt-1">{String(port.value)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Command Line Tab */}
      {activeTab === 'terminal' && selectedOLT && (
        <div className="relative glass rounded-2xl overflow-hidden p-6">
          <h3 className="text-lg font-semibold text-white mb-4">OLT Command Line (Telnet)</h3>
          <div className="space-y-4">
            <div className="flex gap-3">
              <input
                value={command}
                onChange={e => setCommand(e.target.value)}
                placeholder="Enter command (e.g., display ont info 0 0)"
                className="modern-input flex-1 font-mono"
                onKeyDown={e => e.key === 'Enter' && handleExecuteCommand()}
              />
              <button onClick={handleExecuteCommand} className="btn-primary">
                <Terminal className="w-4 h-4" /> Execute
              </button>
            </div>
            {commandOutput && (
              <div className="bg-zinc-900 rounded-lg p-4 font-mono text-sm text-zinc-300 max-h-96 overflow-auto whitespace-pre-wrap">
                {commandOutput}
              </div>
            )}
          </div>
        </div>
      )}

      {/* OLT Form Modal */}
      {showForm && editing && (
        <div className="modal-backdrop" onClick={() => { setShowForm(false); setEditing(null); }}>
          <div className="glass-strong rounded-2xl w-full max-w-2xl animate-fade-in-scale" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-zinc-800/50">
              <h3 className="text-lg font-semibold text-white">{editing.id ? 'Edit OLT Connection' : 'Add OLT Connection'}</h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">OLT Name *</label>
                  <input required value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} className="modern-input" placeholder="Huawei MA5600T - Main" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Vendor *</label>
                  <select value={editing.vendor || 'huawei'} onChange={e => setEditing({ ...editing, vendor: e.target.value })} className="modern-input">
                    <option value="huawei">Huawei</option>
                    <option value="zte">ZTE</option>
                    <option value="fiberhome">FiberHome</option>
                    <option value="nokia">Nokia</option>
                    <option value="generic">Generic (Custom OIDs)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Model</label>
                  <input value={editing.model || ''} onChange={e => setEditing({ ...editing, model: e.target.value })} className="modern-input" placeholder="MA5600T" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">IP Address *</label>
                  <input required value={editing.ip_address || ''} onChange={e => setEditing({ ...editing, ip_address: e.target.value })} className="modern-input" placeholder="192.168.1.1" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Telnet Port</label>
                  <input type="number" value={editing.telnet_port || 23} onChange={e => setEditing({ ...editing, telnet_port: parseInt(e.target.value) })} className="modern-input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">SNMP Port</label>
                  <input type="number" value={editing.snmp_port || 161} onChange={e => setEditing({ ...editing, snmp_port: parseInt(e.target.value) })} className="modern-input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Username</label>
                  <input value={editing.username || 'admin'} onChange={e => setEditing({ ...editing, username: e.target.value })} className="modern-input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Password *</label>
                  <input type="password" value={editing.password || ''} onChange={e => setEditing({ ...editing, password: e.target.value })} className="modern-input" placeholder="OLT password" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">SNMP Community</label>
                  <input value={editing.snmp_community || 'public'} onChange={e => setEditing({ ...editing, snmp_community: e.target.value })} className="modern-input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Location</label>
                  <input value={editing.location || ''} onChange={e => setEditing({ ...editing, location: e.target.value })} className="modern-input" placeholder="Server Room A" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Status</label>
                  <select value={editing.status || 'active'} onChange={e => setEditing({ ...editing, status: e.target.value })} className="modern-input">
                    <option value="active">Active</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Custom OIDs for Generic OLTs */}
              {editing.vendor === 'generic' && (
                <div className="border-t border-zinc-700/50 pt-4 mt-4">
                  <h4 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Custom SNMP OIDs (Optional)
                  </h4>
                  <p className="text-xs text-zinc-500 mb-3">Enter your OLT's SNMP OIDs for monitoring. Leave empty for basic system info only.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">PON Ports OID</label>
                      <input 
                        value={editing.custom_oids?.ponPorts || ''} 
                        onChange={e => setEditing({ ...editing, custom_oids: { ...editing.custom_oids, ponPorts: e.target.value } })} 
                        className="modern-input font-mono text-sm" 
                        placeholder="1.3.6.1.4.1.XXXX.X.X.X" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">ONU List OID</label>
                      <input 
                        value={editing.custom_oids?.onuList || ''} 
                        onChange={e => setEditing({ ...editing, custom_oids: { ...editing.custom_oids, onuList: e.target.value } })} 
                        className="modern-input font-mono text-sm" 
                        placeholder="1.3.6.1.4.1.XXXX.X.X.X" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">Optical Power OID</label>
                      <input 
                        value={editing.custom_oids?.opticalPower || ''} 
                        onChange={e => setEditing({ ...editing, custom_oids: { ...editing.custom_oids, opticalPower: e.target.value } })} 
                        className="modern-input font-mono text-sm" 
                        placeholder="1.3.6.1.4.1.XXXX.X.X.X" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">ONU State OID</label>
                      <input 
                        value={editing.custom_oids?.onuState || ''} 
                        onChange={e => setEditing({ ...editing, custom_oids: { ...editing.custom_oids, onuState: e.target.value } })} 
                        className="modern-input font-mono text-sm" 
                        placeholder="1.3.6.1.4.1.XXXX.X.X.X" 
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2 border-t border-zinc-800/50">
                <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">{editing.id ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
