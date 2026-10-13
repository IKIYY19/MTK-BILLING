import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

export function InterfacesModule({ config, onUpdate }) {
  const [activeTab, setActiveTab] = useState('vlans');

  const addVLAN = () => {
    const vlans = config.vlans || [];
    onUpdate({ ...config, vlans: [...vlans, { name: '', 'vlan-id': '', interface: '', comment: '' }] });
  };

  const updateVLAN = (idx, field, value) => {
    const vlans = [...(config.vlans || [])];
    vlans[idx] = { ...vlans[idx], [field]: value };
    onUpdate({ ...config, vlans });
  };

  const removeVLAN = (idx) => {
    const vlans = config.vlans || [];
    onUpdate({ ...config, vlans: vlans.filter((_, i) => i !== idx) });
  };

  const addBridge = () => {
    const bridges = config.bridges || [];
    onUpdate({ ...config, bridges: [...bridges, { name: '', comment: '' }] });
  };

  const updateBridge = (idx, field, value) => {
    const bridges = [...(config.bridges || [])];
    bridges[idx] = { ...bridges[idx], [field]: value };
    onUpdate({ ...config, bridges });
  };

  const removeBridge = (idx) => {
    const bridges = config.bridges || [];
    onUpdate({ ...config, bridges: bridges.filter((_, i) => i !== idx) });
  };

  const addBridgePort = () => {
    const bridge_ports = config.bridge_ports || [];
    onUpdate({ ...config, bridge_ports: [...bridge_ports, { bridge: '', interface: '', pvid: '' }] });
  };

  const updateBridgePort = (idx, field, value) => {
    const bridge_ports = [...(config.bridge_ports || [])];
    bridge_ports[idx] = { ...bridge_ports[idx], [field]: value };
    onUpdate({ ...config, bridge_ports });
  };

  const removeBridgePort = (idx) => {
    const bridge_ports = config.bridge_ports || [];
    onUpdate({ ...config, bridge_ports: bridge_ports.filter((_, i) => i !== idx) });
  };

  const addBridgeVLAN = () => {
    const bridge_vlans = config.bridge_vlans || [];
    onUpdate({ ...config, bridge_vlans: [...bridge_vlans, { bridge: '', 'vlan-ids': '', tagged: [], untagged: [] }] });
  };

  const updateBridgeVLAN = (idx, field, value) => {
    const bridge_vlans = [...(config.bridge_vlans || [])];
    bridge_vlans[idx] = { ...bridge_vlans[idx], [field]: value };
    onUpdate({ ...config, bridge_vlans });
  };

  const removeBridgeVLAN = (idx) => {
    const bridge_vlans = config.bridge_vlans || [];
    onUpdate({ ...config, bridge_vlans: bridge_vlans.filter((_, i) => i !== idx) });
  };

  const tabs = [
    { id: 'vlans', label: 'VLANs' },
    { id: 'bridges', label: 'Bridges' },
    { id: 'bridge_ports', label: 'Bridge Ports' },
    { id: 'bridge_vlans', label: 'Bridge VLANs' },
  ];

  return (
    <div>
      <h3 className="text-xl font-bold text-white mb-6">Interfaces & Switching</h3>

      <div className="flex gap-2 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded ${
              activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'vlans' && (
        <div>
          <button onClick={addVLAN} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add VLAN
          </button>
          {config.vlans?.map((vlan, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-4 gap-4">
              <input
                placeholder="Name (vlan10)"
                value={vlan.name}
                onChange={(e) => updateVLAN(idx, 'name', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="VLAN ID"
                type="number"
                value={vlan['vlan-id']}
                onChange={(e) => updateVLAN(idx, 'vlan-id', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Interface"
                value={vlan.interface}
                onChange={(e) => updateVLAN(idx, 'interface', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Comment"
                  value={vlan.comment}
                  onChange={(e) => updateVLAN(idx, 'comment', e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeVLAN(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'bridges' && (
        <div>
          <button onClick={addBridge} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Bridge
          </button>
          {config.bridges?.map((bridge, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-4 gap-4">
              <input
                placeholder="Name"
                value={bridge.name}
                onChange={(e) => updateBridge(idx, 'name', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="PVID"
                type="number"
                value={bridge.pvid || ''}
                onChange={(e) => updateBridge(idx, 'pvid', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={bridge['vlan-filtering'] === 'yes'}
                  onChange={(e) => updateBridge(idx, 'vlan-filtering', e.target.checked ? 'yes' : 'no')}
                />
                VLAN Filtering
              </label>
              <div className="flex gap-2">
                <input
                  placeholder="Comment"
                  value={bridge.comment || ''}
                  onChange={(e) => updateBridge(idx, 'comment', e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeBridge(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'bridge_ports' && (
        <div>
          <button onClick={addBridgePort} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Bridge Port
          </button>
          {config.bridge_ports?.map((port, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-5 gap-4">
              <input
                placeholder="Bridge"
                value={port.bridge}
                onChange={(e) => updateBridgePort(idx, 'bridge', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Interface"
                value={port.interface}
                onChange={(e) => updateBridgePort(idx, 'interface', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="PVID"
                type="number"
                value={port.pvid || ''}
                onChange={(e) => updateBridgePort(idx, 'pvid', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <select
                value={port['frame-types'] || ''}
                onChange={(e) => updateBridgePort(idx, 'frame-types', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value="">Frame Types</option>
                <option value="ethernet-without-tag">Ethernet without tag</option>
                <option value="ethernet-with-tag">Ethernet with tag</option>
                <option value="any">Any</option>
              </select>
              <div className="flex gap-2">
                <button onClick={() => removeBridgePort(idx)} className="text-red-500 hover:text-red-400 ml-auto">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'bridge_vlans' && (
        <div>
          <button onClick={addBridgeVLAN} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Bridge VLAN
          </button>
          {config.bridge_vlans?.map((bvlan, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-5 gap-4">
              <input
                placeholder="Bridge"
                value={bvlan.bridge}
                onChange={(e) => updateBridgeVLAN(idx, 'bridge', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="VLAN IDs"
                value={bvlan['vlan-ids']}
                onChange={(e) => updateBridgeVLAN(idx, 'vlan-ids', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Tagged (comma-sep)"
                value={bvlan.tagged?.join(',')}
                onChange={(e) => updateBridgeVLAN(idx, 'tagged', e.target.value.split(','))}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Untagged (comma-sep)"
                value={bvlan.untagged?.join(',')}
                onChange={(e) => updateBridgeVLAN(idx, 'untagged', e.target.value.split(','))}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <button onClick={() => removeBridgeVLAN(idx)} className="text-red-500 hover:text-red-400">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
