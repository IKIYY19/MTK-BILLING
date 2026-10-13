import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Package, Plus, Search, Filter, Download, Upload, Trash2, Pencil, ExternalLink,
  AlertTriangle, CheckCircle2, Clock, MapPin, User, HardDrive, Wifi, Router,
  Settings, Server, Battery, Radio, Monitor, Cable, Grid, ChevronRight, X,
  Eye, Save, BarChart3, Wrench, Bell
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

const CATEGORY_ICONS = {
  'Router': Router, 'cat-router': Router,
  'Switch': Wifi, 'cat-switch': Wifi,
  'Access Point': Wifi, 'cat-ap': Wifi,
  'ONT / Fiber Terminal': Cable, 'cat-ont': Cable,
  'CPE / Client Device': Monitor, 'cat-cpe': Monitor,
  'Antenna / Sector': Radio, 'cat-antenna': Radio,
  'Server': Server, 'cat-server': Server,
  'UPS / Power': Battery, 'cat-ups': Battery,
  'Cable / Fiber': Cable, 'cat-cable': Cable,
  'Rack / Enclosure': Grid, 'cat-rack': Grid,
  'Other Equipment': Package, 'cat-other': Package,
};

const STATUS_COLORS = {
  'active': 'badge-green', 'in-stock': 'badge-blue', 'deployed': 'badge-violet',
  'in-repair': 'badge-amber', 'retired': 'badge-zinc', 'lost': 'badge-red',
};

/* ─── Stat Mini Card ─── */
function StatMini({ label, value, icon: Icon, color }) {
  return (
    <div className="glass rounded-xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <div className="text-xl font-bold text-white tabular-nums">{value}</div>
        <div className="text-xs text-zinc-500">{label}</div>
      </div>
    </div>
  );
}

/* ─── Alert Badge ─── */
function AlertBadge({ alert }) {
  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg ${
      alert.severity === 'critical' ? 'bg-rose-500/10 ring-1 ring-rose-500/20' :
      alert.severity === 'warning' ? 'bg-amber-500/10 ring-1 ring-amber-500/20' :
      'bg-blue-500/10 ring-1 ring-blue-500/20'
    }`}>
      {alert.severity === 'critical' ? <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" /> :
       alert.severity === 'warning' ? <Clock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" /> :
       <Bell className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />}
      <div className="min-w-0">
        <div className="text-sm text-zinc-200 truncate">{alert.message}</div>
        <div className="text-xs text-zinc-500 mt-0.5">{new Date(alert.created_at).toLocaleDateString()}</div>
      </div>
    </div>
  );
}

export function InventoryPage() {
  const [activeTab, setActiveTab] = useState('devices');
  const [devices, setDevices] = useState([]);
  const [stats, setStats] = useState(null);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [devRes, statsRes, catRes, brandRes, locRes] = await Promise.all([
        axios.get(`${API}/inventory/devices`),
        axios.get(`${API}/inventory/stats`),
        axios.get(`${API}/inventory/categories`),
        axios.get(`${API}/inventory/brands`),
        axios.get(`${API}/inventory/locations`),
      ]);
      setDevices(devRes.data);
      setStats(statsRes.data);
      setCategories(catRes.data);
      setBrands(brandRes.data);
      setLocations(locRes.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const filtered = devices.filter(d => {
    if (statusFilter !== 'all' && d.status !== statusFilter) {return false;}
    if (categoryFilter !== 'all' && d.category_id !== categoryFilter) {return false;}
    if (search) {
      const s = search.toLowerCase();
      return d.name.toLowerCase().includes(s) || d.model.toLowerCase().includes(s) ||
        d.serial.toLowerCase().includes(s) || d.brand.toLowerCase().includes(s) ||
        d.ip_address.toLowerCase().includes(s);
    }
    return true;
  });

  const openNew = () => {
    setForm({ status: 'in-stock', maintenance_schedule: 'none', specs: {} });
    setShowForm(true);
  };

  const openEdit = (d) => {
    setForm({ ...d, specs: d.specs || {} });
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (form.id) {await axios.put(`${API}/inventory/devices/${form.id}`, form);}
    else {await axios.post(`${API}/inventory/devices`, form);}
    setShowForm(false);
    fetchData();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this device?')) {return;}
    await axios.delete(`${API}/inventory/devices/${id}`);
    fetchData();
  };

  const exportCSV = async () => {
    try {
      const response = await axios.get(`${API}/inventory/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `inventory-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export inventory. Please try again.');
    }
  };

  /* ─── Detail View ─── */
  if (selectedDevice) {
    return <DeviceDetail device={selectedDevice} onBack={() => { setSelectedDevice(null); fetchData(); }} />;
  }

  return (
    <div className="relative min-h-full animate-fade-in">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-noise" />

      <div className="relative p-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
              <Package className="w-6 h-6 text-zinc-400" /> Device Inventory
            </h1>
            <p className="text-zinc-400 mt-1">
              {stats?.total_devices || 0} devices • KES {stats?.total_value?.toLocaleString() || 0} total value
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={exportCSV} className="btn-secondary"><Download className="w-4 h-4" /> Export</button>
            <button onClick={openNew} className="btn-primary"><Plus className="w-4 h-4" /> Add Device</button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
            <StatMini label="Total" value={stats.total_devices} icon={Package} color="bg-zinc-600" />
            <StatMini label="Active" value={stats.active_count} icon={CheckCircle2} color="bg-emerald-600" />
            <StatMini label="In Stock" value={stats.in_stock_count} icon={HardDrive} color="bg-blue-600" />
            <StatMini label="Deployed" value={stats.deployed_count} icon={User} color="bg-violet-600" />
            <StatMini label="In Repair" value={stats.in_repair_count} icon={Wrench} color="bg-amber-600" />
            <StatMini label="Retired" value={stats.retired_count} icon={Trash2} color="bg-zinc-600" />
            <StatMini label="Value" value={`KES ${(stats.depreciated_value / 1000).toFixed(0)}k`} icon={BarChart3} color="bg-cyan-600" />
          </div>
        )}

        {/* Alerts */}
        {stats?.alerts?.length > 0 && (
          <div className="glass rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-medium text-zinc-300">Alerts ({stats.alerts.length})</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {stats.alerts.slice(0, 6).map(a => <AlertBadge key={a.id} alert={a} />)}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="glass rounded-2xl p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search devices..."
                className="modern-input pl-10" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="modern-input w-auto min-w-[120px]">
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="in-stock">In Stock</option>
              <option value="deployed">Deployed</option>
              <option value="in-repair">In Repair</option>
              <option value="retired">Retired</option>
            </select>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="modern-input w-auto min-w-[140px]">
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="text-sm text-zinc-500">{filtered.length} results</div>
          </div>
        </div>

        {/* Device Table */}
        <div className="glass rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
          ) : (
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Category</th>
                  <th>Brand / Model</th>
                  <th>Serial</th>
                  <th>IP Address</th>
                  <th>Status</th>
                  <th>Location</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => (
                  <tr key={d.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${d.category_color}20` }}>
                          {(() => {
                            const Icon = CATEGORY_ICONS[d.category_id] || CATEGORY_ICONS[d.category_name] || CATEGORY_ICONS[d.category_icon] || Package;
                            return <Icon className="w-4 h-4" style={{ color: d.category_color }} />;
                          })()}
                        </div>
                        <div className="min-w-0">
                          <button onClick={() => setSelectedDevice(d)} className="text-white font-medium hover:text-blue-400 transition-colors truncate block">{d.name}</button>
                          {d.assigned_customer && <div className="text-[11px] text-zinc-500">→ {d.assigned_customer}</div>}
                        </div>
                      </div>
                    </td>
                    <td><span className="badge badge-zinc">{d.category_name}</span></td>
                    <td>
                      <div className="text-sm text-zinc-300">{d.brand}</div>
                      <div className="text-xs text-zinc-500">{d.model}</div>
                    </td>
                    <td className="font-mono text-xs text-zinc-400">{d.serial || '—'}</td>
                    <td className="font-mono text-xs text-zinc-400">{d.ip_address || '—'}</td>
                    <td><span className={`badge ${STATUS_COLORS[d.status] || 'badge-zinc'}`}>{d.status}</span></td>
                    <td className="text-sm text-zinc-400 max-w-[120px] truncate">{d.location_id ? locations.find(l => l.id === d.location_id)?.name || '—' : '—'}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setSelectedDevice(d)} className="btn-ghost p-2" title="View"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => openEdit(d)} className="btn-ghost p-2" title="Edit"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(d.id)} className="btn-ghost p-2 text-zinc-500 hover:text-rose-400" title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && filtered.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon"><Package className="w-7 h-7 text-zinc-600" /></div>
              <div className="empty-state-title">{search || statusFilter !== 'all' ? 'No devices match filters' : 'No devices in inventory'}</div>
              <div className="empty-state-desc">Add your first device to start tracking</div>
            </div>
          )}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && <DeviceForm form={form} setForm={setForm} onClose={() => setShowForm(false)} onSave={handleSave} categories={categories} brands={brands} locations={locations} />}
    </div>
  );
}

/* ─── Device Form Modal ─── */
function DeviceForm({ form, setForm, onClose, onSave, categories, brands, locations }) {
  const [tab, setTab] = useState('basic');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="glass-strong rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in-scale" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-zinc-800/50 flex justify-between items-start">
          <div>
            <h3 className="text-lg font-semibold text-white">{form.id ? 'Edit Device' : 'Add Device'}</h3>
            <p className="text-sm text-zinc-400 mt-0.5">{form.id ? 'Update device details' : 'Register new equipment in inventory'}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-2">✕</button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4 flex gap-1 border-b border-zinc-800/50">
          {['basic', 'details', 'financial', 'specs'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 ${
                tab === t ? 'text-blue-400 border-blue-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'
              }`}>{t}</button>
          ))}
        </div>

        <form onSubmit={onSave} className="p-6 space-y-4">
          {tab === 'basic' && (
            <>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Device Name *</label>
                <input required value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} className="modern-input" placeholder="e.g., CCR2004-Core-01" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Category</label>
                  <select value={form.category_id || ''} onChange={e => setForm({...form, category_id: e.target.value})} className="modern-input">
                    <option value="">Select category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Brand</label>
                  <input list="brands-list" value={form.brand || ''} onChange={e => setForm({...form, brand: e.target.value})} className="modern-input" placeholder="MikroTik" />
                  <datalist id="brands-list">{brands.map(b => <option key={b} value={b} />)}</datalist>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Model</label>
                  <input value={form.model || ''} onChange={e => setForm({...form, model: e.target.value})} className="modern-input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Serial Number</label>
                  <input value={form.serial || ''} onChange={e => setForm({...form, serial: e.target.value})} className="modern-input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">MAC Address</label>
                  <input value={form.mac || ''} onChange={e => setForm({...form, mac: e.target.value})} className="modern-input" placeholder="AA:BB:CC:DD:EE:FF" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">IP Address</label>
                  <input value={form.ip_address || ''} onChange={e => setForm({...form, ip_address: e.target.value})} className="modern-input" placeholder="192.168.88.1" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Firmware Version</label>
                <input value={form.firmware || ''} onChange={e => setForm({...form, firmware: e.target.value})} className="modern-input" />
              </div>
            </>
          )}

          {tab === 'details' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Status</label>
                  <select value={form.status || 'in-stock'} onChange={e => setForm({...form, status: e.target.value})} className="modern-input">
                    <option value="in-stock">In Stock</option>
                    <option value="active">Active</option>
                    <option value="deployed">Deployed</option>
                    <option value="in-repair">In Repair</option>
                    <option value="retired">Retired</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Location</label>
                  <select value={form.location_id || ''} onChange={e => setForm({...form, location_id: e.target.value})} className="modern-input">
                    <option value="">No location</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Assigned To (Customer)</label>
                <input value={form.assigned_customer || ''} onChange={e => setForm({...form, assigned_customer: e.target.value})} className="modern-input" placeholder="Customer name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Purchase Date</label>
                  <input type="date" value={form.purchase_date || ''} onChange={e => setForm({...form, purchase_date: e.target.value})} className="modern-input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Warranty Expires</label>
                  <input type="date" value={form.warranty_expires || ''} onChange={e => setForm({...form, warranty_expires: e.target.value})} className="modern-input" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Maintenance Schedule</label>
                <select value={form.maintenance_schedule || 'none'} onChange={e => setForm({...form, maintenance_schedule: e.target.value})} className="modern-input">
                  <option value="none">None</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="semi-annual">Semi-Annual</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Notes</label>
                <textarea value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} rows="3" className="modern-input resize-none" />
              </div>
            </>
          )}

          {tab === 'financial' && (
            <>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Purchase Cost (KES)</label>
                <input type="number" value={form.purchase_cost || ''} onChange={e => setForm({...form, purchase_cost: parseFloat(e.target.value) || 0})} className="modern-input" />
              </div>
            </>
          )}

          {tab === 'specs' && (
            <>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Specifications (JSON)</label>
                <textarea
                  value={JSON.stringify(form.specs || {}, null, 2)}
                  onChange={e => { try { setForm({...form, specs: JSON.parse(e.target.value)}); } catch(ex) { /* Ignore parse errors while typing */ } }}
                  rows="8"
                  className="modern-input resize-none font-mono text-xs"
                  placeholder='{"cpu": "AL32400", "ram": "1GB", "ports": "12xSFP+"}'
                />
                <p className="text-xs text-zinc-500 mt-1">Enter specs as JSON object</p>
              </div>
            </>
          )}

          <div className="flex gap-3 pt-4 border-t border-zinc-800/50">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1">
              <Save className="w-4 h-4" /> {form.id ? 'Update Device' : 'Add Device'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Device Detail View ─── */
function DeviceDetail({ device, onBack }) {
  const [tab, setTab] = useState('overview');
  const [maintenanceForm, setMaintenanceForm] = useState({ type: 'general', notes: '', performed_by: '', cost: '' });
  const [showMaintForm, setShowMaintForm] = useState(false);

  const addMaintenance = async (e) => {
    e.preventDefault();
    await axios.post(`${API}/inventory/devices/${device.id}/maintenance`, maintenanceForm);
    setShowMaintForm(false);
    setMaintenanceForm({ type: 'general', notes: '', performed_by: '', cost: '' });
    onBack(); // refresh
  };

  const categoryIcon = CATEGORY_ICONS[device.category_id] || CATEGORY_ICONS[device.category_name] || Package;
  const CatIcon = categoryIcon;

  return (
    <div className="relative min-h-full animate-fade-in">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-noise" />
      <div className="relative p-8">
        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <button onClick={onBack} className="btn-ghost mt-1"><ChevronRight className="w-4 h-4 rotate-180" /></button>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center`} style={{ background: `${device.category_color}20` }}>
            <CatIcon className="w-6 h-6" style={{ color: device.category_color }} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">{device.name}</h1>
              <span className={`badge ${STATUS_COLORS[device.status]}`}>{device.status}</span>
            </div>
            <p className="text-zinc-400 mt-0.5">{device.brand} {device.model} • {device.category_name}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800/50 mb-6">
          {['overview', 'maintenance', 'assignments'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 ${
                tab === t ? 'text-blue-400 border-blue-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'
              }`}>{t}</button>
          ))}
        </div>

        {/* Overview */}
        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">Device Information</h3>
              {[
                ['Brand', device.brand], ['Model', device.model], ['Serial', device.serial],
                ['MAC', device.mac], ['Firmware', device.firmware], ['IP Address', device.ip_address],
                ['Warranty', device.warranty_expires ? new Date(device.warranty_expires).toLocaleDateString() : 'None'],
                ['Last Maintenance', device.last_maintenance || 'Never'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-2 border-b border-zinc-800/30">
                  <span className="text-sm text-zinc-500">{label}</span>
                  <span className="text-sm text-white font-mono">{value || '—'}</span>
                </div>
              ))}
            </div>
            <div className="glass rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">Financial & Location</h3>
              {[
                ['Purchase Date', device.purchase_date ? new Date(device.purchase_date).toLocaleDateString() : '—'],
                ['Purchase Cost', device.purchase_cost ? `KES ${device.purchase_cost.toLocaleString()}` : '—'],
                ['Location', device.location_id || 'Not assigned'],
                ['Assigned To', device.assigned_customer || 'In Stock'],
                ['Maintenance', device.maintenance_schedule],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-2 border-b border-zinc-800/30">
                  <span className="text-sm text-zinc-500">{label}</span>
                  <span className="text-sm text-white">{value}</span>
                </div>
              ))}
              {device.notes && (
                <div className="pt-2">
                  <span className="text-sm text-zinc-500">Notes</span>
                  <p className="text-sm text-zinc-300 mt-1">{device.notes}</p>
                </div>
              )}
            </div>
            {device.specs && Object.keys(device.specs).length > 0 && (
              <div className="glass rounded-2xl p-6 lg:col-span-2">
                <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wider mb-4">Specifications</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {Object.entries(device.specs).map(([key, value]) => (
                    <div key={key} className="bg-zinc-800/30 rounded-lg p-3">
                      <div className="text-xs text-zinc-500 capitalize mb-1">{key}</div>
                      <div className="text-sm text-white">{String(value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Maintenance */}
        {tab === 'maintenance' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-medium text-zinc-300">Maintenance History</h3>
              <button onClick={() => setShowMaintForm(true)} className="btn-primary text-xs"><Wrench className="w-3 h-3" /> Log Maintenance</button>
            </div>
            <div className="glass rounded-2xl overflow-hidden">
              {device.maintenance_logs?.length === 0 ? (
                <div className="p-8 text-center text-zinc-500">No maintenance records</div>
              ) : (
                <table className="modern-table">
                  <thead>
                    <tr><th>Date</th><th>Type</th><th>Performed By</th><th>Cost</th><th>Notes</th></tr>
                  </thead>
                  <tbody>
                    {device.maintenance_logs?.map(log => (
                      <tr key={log.id}>
                        <td className="text-sm text-zinc-400">{new Date(log.created_at).toLocaleDateString()}</td>
                        <td><span className="badge badge-blue">{log.type}</span></td>
                        <td className="text-sm text-zinc-300">{log.performed_by}</td>
                        <td className="text-sm text-white">KES {log.cost?.toLocaleString() || 0}</td>
                        <td className="text-sm text-zinc-400">{log.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {showMaintForm && (
              <div className="modal-backdrop" onClick={() => setShowMaintForm(false)}>
                <div className="glass-strong rounded-2xl w-full max-w-lg animate-fade-in-scale p-6" onClick={e => e.stopPropagation()}>
                  <h3 className="text-lg font-semibold text-white mb-4">Log Maintenance</h3>
                  <form onSubmit={addMaintenance} className="space-y-4">
                    <select value={maintenanceForm.type} onChange={e => setMaintenanceForm({...maintenanceForm, type: e.target.value})} className="modern-input">
                      <option value="general">General</option>
                      <option value="firmware_update">Firmware Update</option>
                      <option value="battery_replacement">Battery Replacement</option>
                      <option value="cleaning">Cleaning</option>
                      <option value="inspection">Inspection</option>
                      <option value="repair">Repair</option>
                    </select>
                    <input value={maintenanceForm.performed_by} onChange={e => setMaintenanceForm({...maintenanceForm, performed_by: e.target.value})} placeholder="Performed by" className="modern-input" />
                    <input type="number" value={maintenanceForm.cost} onChange={e => setMaintenanceForm({...maintenanceForm, cost: e.target.value})} placeholder="Cost (KES)" className="modern-input" />
                    <textarea value={maintenanceForm.notes} onChange={e => setMaintenanceForm({...maintenanceForm, notes: e.target.value})} placeholder="Notes" rows="3" className="modern-input resize-none" />
                    <div className="flex gap-3">
                      <button type="button" onClick={() => setShowMaintForm(false)} className="btn-secondary flex-1">Cancel</button>
                      <button type="submit" className="btn-primary flex-1"><Save className="w-4 h-4" /> Save</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Assignments */}
        {tab === 'assignments' && (
          <div className="glass rounded-2xl p-6">
            <h3 className="text-sm font-medium text-zinc-300 mb-4">Assignment History</h3>
            {device.assignment_history?.length === 0 ? (
              <div className="text-center text-zinc-500 py-8">No assignment history</div>
            ) : (
              <div className="space-y-3">
                {device.assignment_history?.map(a => (
                  <div key={a.id} className="flex items-center gap-3 p-3 bg-zinc-800/30 rounded-lg">
                    <User className="w-4 h-4 text-zinc-500" />
                    <div className="flex-1">
                      <div className="text-sm text-white">{a.customer_name || 'Unknown'}</div>
                      <div className="text-xs text-zinc-500">{new Date(a.assigned_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
