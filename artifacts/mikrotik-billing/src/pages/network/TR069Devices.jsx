import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Router, Plus, Edit, Trash2, RefreshCw, Power, Settings,
  CheckCircle, Download, SlidersHorizontal, Server
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';

const API = import.meta.env.VITE_API_URL || '/api';

export function TR069Devices() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [connections, setConnections] = useState([]);
  const [acsStatus, setAcsStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [paramDevice, setParamDevice] = useState(null);
  const [parameters, setParameters] = useState([]);
  const [newParam, setNewParam] = useState({ name: '', value: '' });
  const [firmwareDevice, setFirmwareDevice] = useState(null);
  const [firmwareUrl, setFirmwareUrl] = useState('');
  const toast = useToast();
  const [distConnection, setDistConnection] = useState('');
  const [distUrl, setDistUrl] = useState('');
  const [distributing, setDistributing] = useState(false);

  const [form, setForm] = useState({
    serial_number: '',
    manufacturer: '',
    model: '',
    firmware_version: '',
    connection_id: '',
    ip_address: '',
    status: 'unknown',
  });

  useEffect(() => {
    fetchDevices();
    fetchConnections();
    fetchAcsStatus();
  }, []);

  const fetchAcsStatus = async () => {
    try {
      const { data } = await axios.get(`${API}/tr069/acs/status`);
      setAcsStatus(data);
    } catch (e) {
      setAcsStatus(e.response?.data || { configured: false, reachable: false });
    }
  };

  const fetchDevices = async () => {
    try {
      const { data } = await axios.get(`${API}/tr069`);
      setDevices(data);
    } catch (e) {
      console.error('Failed to fetch TR-069 devices:', e);
    }
  };

  const fetchConnections = async () => {
    try {
      const { data } = await axios.get(`${API}/mikrotik`).catch(() => ({ data: [] }));
      setConnections(data);
    } catch (e) {
      console.error('Failed to fetch connections:', e);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editing) {
        await axios.put(`${API}/tr069/${editing.id}`, form);
      } else {
        await axios.post(`${API}/tr069`, form);
      }
      await fetchDevices();
      setShowForm(false);
      setEditing(null);
      setForm({
        serial_number: '',
        manufacturer: '',
        model: '',
        firmware_version: '',
        connection_id: '',
        ip_address: '',
        status: 'unknown',
      });
    } catch (e) {
      alert(`Failed to ${editing ? 'update' : 'register'} device: ${e.response?.data?.error || e.message}`);
    }

    setLoading(false);
  };

  const handleEdit = (device) => {
    setEditing(device);
    setForm(device);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this device?')) {return;}
    try {
      await axios.delete(`${API}/tr069/${id}`);
      fetchDevices();
    } catch (e) {
      alert('Failed to delete device');
    }
  };

  const handleReboot = async (id) => {
    if (!confirm('Reboot this device?')) {return;}
    try {
      const { data } = await axios.post(`${API}/tr069/${id}/reboot`);
      toast.success('Reboot queued', data.message);
    } catch (e) {
      toast.error('Reboot failed', e.response?.data?.message || e.response?.data?.error || e.message);
    }
  };

  const handleFactoryReset = async (id) => {
    if (!confirm('Factory reset this device? This will restore all settings to default.')) {return;}
    try {
      const { data } = await axios.post(`${API}/tr069/${id}/factory-reset`);
      toast.success('Factory reset queued', data.message);
    } catch (e) {
      toast.error('Factory reset failed', e.response?.data?.message || e.response?.data?.error || e.message);
    }
  };

  const handleDistribute = async () => {
    if (!distConnection) {toast.warning('Select a router'); return;}
    setDistributing(true);
    try {
      const { data } = await axios.post(`${API}/tr069/acs/distribute`, {
        connection_id: distConnection,
        url: distUrl || acsStatus?.acsUrl,
      });
      toast.success('ACS URL distributed', data.message);
    } catch (e) {
      toast.error('Distribution failed', e.response?.data?.error || e.message);
    } finally {
      setDistributing(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data } = await axios.post(`${API}/tr069/sync`, {});
      toast.success('ACS sync complete', `${data.created} new, ${data.updated} updated`);
      await fetchDevices();
      await fetchAcsStatus();
    } catch (e) {
      toast.error('ACS sync failed', e.response?.data?.message || e.response?.data?.error || e.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleViewParameters = async (device) => {
    try {
      const { data } = await axios.get(`${API}/tr069/${device.id}/parameters`);
      setParameters(data.parameters || []);
      setParamDevice(device);
    } catch (e) {
      toast.error('Could not read parameters', e.response?.data?.message || e.response?.data?.error || e.message);
    }
  };

  const handleSetParameter = async () => {
    if (!newParam.name.trim()) {toast.warning('Enter a parameter name'); return;}
    try {
      const { data } = await axios.put(`${API}/tr069/${paramDevice.id}/parameters`, {
        parameters: { [newParam.name.trim()]: newParam.value },
      });
      toast.success('Parameter queued', data.message);
      setNewParam({ name: '', value: '' });
    } catch (e) {
      toast.error('Could not set parameter', e.response?.data?.message || e.response?.data?.error || e.message);
    }
  };

  const handleDownload = async () => {
    try {
      const { data } = await axios.post(`${API}/tr069/${firmwareDevice.id}/download`, { file_url: firmwareUrl });
      toast.success('Firmware upgrade queued', data.message);
      setFirmwareDevice(null);
      setFirmwareUrl('');
    } catch (e) {
      toast.error('Firmware upgrade failed', e.response?.data?.message || e.response?.data?.error || e.message);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditing(null);
    setForm({
      serial_number: '',
      manufacturer: '',
      model: '',
      firmware_version: '',
      connection_id: '',
      ip_address: '',
      status: 'unknown',
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return 'text-emerald-400';
      case 'offline': return 'text-rose-400';
      default: return 'text-zinc-400';
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'online': return 'badge badge-emerald';
      case 'offline': return 'badge badge-rose';
      default: return 'badge badge-zinc';
    }
  };

  return (
    <div className="relative min-h-full p-8 animate-fade-in">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-noise" />

      {/* Header */}
      <div className="relative flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Router className="w-4 h-4 text-white" />
            </div>
            TR-069 CPE Management
          </h1>
          <p className="text-zinc-400 mt-1">Manage and provision CPE devices via TR-069 protocol</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs border ${
            acsStatus?.reachable
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-zinc-800/60 border-zinc-700/50 text-zinc-400'
          }`}>
            <Server className="w-3.5 h-3.5" />
            {acsStatus?.reachable ? 'GenieACS online' : acsStatus?.configured ? 'GenieACS unreachable' : 'ACS not configured'}
          </span>
          <button onClick={handleSync} disabled={syncing} className="btn-ghost">
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> Sync from ACS
          </button>
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Register Device
          </button>
        </div>
      </div>

      {acsStatus && (
        <div className="relative glass rounded-xl p-4 mb-6 flex flex-wrap items-center gap-x-8 gap-y-2 text-xs text-zinc-400">
          <span><span className="text-zinc-500">ACS URL (for CPEs):</span> <code className="text-cyan-300">{acsStatus.acsUrl || 'not set'}</code></span>
          <span><span className="text-zinc-500">NBI URL:</span> <code className="text-cyan-300">{acsStatus.nbiUrl || 'not set'}</code></span>
          {!acsStatus.configured && (
            <span className="text-amber-400">Set TR069_NBI_URL and start the GenieACS containers to manage real devices.</span>
          )}
        </div>
      )}

      <div className="relative glass rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/20 flex items-center justify-center shrink-0">
            <Server className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Point CPEs at the ACS</h3>
            <p className="text-xs text-zinc-400 mt-1">
              Pushes the ACS URL as DHCP option 43 (sub-option 1) on every DHCP server of the selected router.
              Most ONTs and CPEs read this on boot and start TR-069 automatically.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="block text-xs text-zinc-400 mb-1.5">Router</label>
            <select value={distConnection} onChange={e => setDistConnection(e.target.value)} className="modern-input">
              <option value="">Select a router</option>
              {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="min-w-[260px] flex-1">
            <label className="block text-xs text-zinc-400 mb-1.5">ACS URL</label>
            <input
              className="modern-input font-mono"
              value={distUrl || acsStatus?.acsUrl || ''}
              onChange={e => setDistUrl(e.target.value)}
              placeholder="http://192.168.100.8:17547"
            />
          </div>
          <button onClick={handleDistribute} disabled={distributing} className="btn-primary flex items-center gap-2">
            <Download className="w-4 h-4" /> {distributing ? 'Pushing…' : 'Push to DHCP'}
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="relative glass rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-semibold text-white">
              {editing ? 'Edit Device' : 'Register Device'}
            </h3>
            <button onClick={handleCancel} className="btn-ghost p-2">
              <Trash2 className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Serial Number *</label>
              <input
                value={form.serial_number}
                onChange={e => setForm({ ...form, serial_number: e.target.value })}
                className="modern-input"
                placeholder="e.g., SN123456789"
                required
                disabled={!!editing}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Manufacturer</label>
              <input
                value={form.manufacturer}
                onChange={e => setForm({ ...form, manufacturer: e.target.value })}
                className="modern-input"
                placeholder="e.g., Huawei, ZTE, TP-Link"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Model</label>
              <input
                value={form.model}
                onChange={e => setForm({ ...form, model: e.target.value })}
                className="modern-input"
                placeholder="e.g., HG8245H, F609"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Firmware Version</label>
              <input
                value={form.firmware_version}
                onChange={e => setForm({ ...form, firmware_version: e.target.value })}
                className="modern-input"
                placeholder="e.g., V3.0.1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Connection</label>
              <select
                value={form.connection_id}
                onChange={e => setForm({ ...form, connection_id: e.target.value })}
                className="modern-input"
              >
                <option value="">None</option>
                {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">IP Address</label>
              <input
                value={form.ip_address}
                onChange={e => setForm({ ...form, ip_address: e.target.value })}
                className="modern-input"
                placeholder="e.g., 192.168.1.100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Status</label>
              <select
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value })}
                className="modern-input"
              >
                <option value="unknown">Unknown</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
              </select>
            </div>
            <div className="md:col-span-2 flex gap-3 pt-2">
              <button type="submit" disabled={loading} className="btn-primary flex-1">
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {editing ? 'Update Device' : 'Register Device'}
              </button>
              <button type="button" onClick={handleCancel} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Devices List */}
      <div className="relative glass rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-300">CPE Devices ({devices.length})</h3>
          <button onClick={fetchDevices} className="btn-ghost p-2" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <table className="modern-table">
          <thead>
            <tr>
              <th>Serial Number</th>
              <th>Device Info</th>
              <th>IP Address</th>
              <th>Connection</th>
              <th>Last Inform</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr key={device.id}>
                <td className="font-mono text-sm text-white">{device.serial_number}</td>
                <td>
                  <div>
                    <div className="font-medium text-white">{device.manufacturer || 'Unknown'}</div>
                    <div className="text-xs text-zinc-500">{device.model || '—'} {device.firmware_version && `(${device.firmware_version})`}</div>
                  </div>
                </td>
                <td className="font-mono text-sm text-zinc-400">{device.ip_address || '—'}</td>
                <td className="text-sm text-zinc-400">
                  {connections.find(c => c.id === device.connection_id)?.name || '—'}
                </td>
                <td className="text-sm text-zinc-400">
                  {device.last_inform ? new Date(device.last_inform).toLocaleString() : 'Never'}
                </td>
                <td>
                  <span className={getStatusBadge(device.status)}>{device.status}</span>
                </td>
                <td>
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => handleViewParameters(device)} className="btn-ghost p-2" title="Parameters">
                      <SlidersHorizontal className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setFirmwareDevice(device); setFirmwareUrl(''); }} className="btn-ghost p-2" title="Firmware upgrade">
                      <Download className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleReboot(device.id)} className="btn-ghost p-2" title="Reboot">
                      <Power className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleFactoryReset(device.id)} className="btn-ghost p-2 text-zinc-500 hover:text-rose-400" title="Factory Reset">
                      <Settings className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleEdit(device)} className="btn-ghost p-2" title="Edit">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(device.id)} className="btn-ghost p-2 text-zinc-500 hover:text-rose-400" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {devices.length === 0 && (
          <div className="p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 ring-1 ring-cyan-500/20 flex items-center justify-center mx-auto mb-4">
              <Router className="w-8 h-8 text-cyan-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">No CPE devices registered</h3>
            <p className="text-zinc-500">Register your first TR-069 CPE device to begin remote management</p>
          </div>
        )}
      </div>

      {paramDevice && (
        <div className="modal-backdrop" onClick={() => setParamDevice(null)}>
          <div className="glass-strong rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-zinc-800/50 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Device parameters</h3>
                <p className="text-xs text-zinc-400 mt-1">{paramDevice.serial_number}</p>
              </div>
              <button onClick={() => setParamDevice(null)} className="btn-ghost p-2"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-zinc-400 mb-1.5">Parameter path</label>
                  <input className="modern-input" value={newParam.name} onChange={e => setNewParam({ ...newParam, name: e.target.value })} placeholder="Device.ManagementServer.URL" />
                </div>
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs text-zinc-400 mb-1.5">Value</label>
                  <input className="modern-input" value={newParam.value} onChange={e => setNewParam({ ...newParam, value: e.target.value })} placeholder="http://192.168.100.8:7547" />
                </div>
                <button onClick={handleSetParameter} className="btn-primary">Set</button>
              </div>
              {parameters.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-zinc-800/60">
                  <table className="modern-table">
                    <thead><tr><th>Name</th><th>Value</th></tr></thead>
                    <tbody>
                      {parameters.map((p, i) => (
                        <tr key={i}>
                          <td className="font-mono text-xs text-zinc-300">{p.name}</td>
                          <td className="font-mono text-xs text-cyan-300 break-all">{String(p.value ?? '')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">No parameters reported by this device yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {firmwareDevice && (
        <div className="modal-backdrop" onClick={() => setFirmwareDevice(null)}>
          <div className="glass-strong rounded-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-1">Firmware upgrade</h3>
            <p className="text-xs text-zinc-400 mb-5">{firmwareDevice.serial_number}</p>
            <label className="block text-xs text-zinc-400 mb-1.5">Firmware file URL</label>
            <input className="modern-input" value={firmwareUrl} onChange={e => setFirmwareUrl(e.target.value)} placeholder="https://example.com/firmware.bin" />
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setFirmwareDevice(null)} className="btn-ghost">Cancel</button>
              <button onClick={handleDownload} className="btn-primary"><Download className="w-4 h-4" /> Upgrade</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
