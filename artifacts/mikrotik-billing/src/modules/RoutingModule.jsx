import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

export function RoutingModule({ config, onUpdate }) {
  const [activeTab, setActiveTab] = useState('static');

  const addStaticRoute = () => {
    const static_routes = config.static_routes || [];
    onUpdate({ ...config, static_routes: [...static_routes, { 'dst-address': '', gateway: '', comment: '' }] });
  };

  const updateStaticRoute = (idx, field, value) => {
    const static_routes = [...(config.static_routes || [])];
    static_routes[idx] = { ...static_routes[idx], [field]: value };
    onUpdate({ ...config, static_routes });
  };

  const removeStaticRoute = (idx) => {
    onUpdate({ ...config, static_routes: config.static_routes.filter((_, i) => i !== idx) });
  };

  const addOSPFNetwork = () => {
    const ospf = config.ospf || { networks: [] };
    onUpdate({ ...ospf, networks: [...(ospf.networks || []), { network: '', area: '' }] });
  };

  const updateOSPFNetwork = (idx, field, value) => {
    const ospf = config.ospf || { networks: [] };
    const networks = [...(ospf.networks || [])];
    networks[idx] = { ...networks[idx], [field]: value };
    onUpdate({ ...ospf, networks });
  };

  const removeOSPFNetwork = (idx) => {
    const ospf = config.ospf || { networks: [] };
    onUpdate({ ...ospf, networks: ospf.networks.filter((_, i) => i !== idx) });
  };

  return (
    <div>
      <h3 className="text-xl font-bold text-white mb-6">Routing</h3>

      <div className="flex gap-2 mb-6">
        {['static', 'ospf', 'bgp', 'pbr'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
          >
            {tab === 'static' ? 'Static Routes' : tab === 'ospf' ? 'OSPF' : tab === 'bgp' ? 'BGP' : 'PBR'}
          </button>
        ))}
      </div>

      {activeTab === 'static' && (
        <div>
          <button onClick={addStaticRoute} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Route
          </button>
          {config.static_routes?.map((route, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-5 gap-4">
              <input
                placeholder="Dst Address"
                value={route['dst-address']}
                onChange={(e) => updateStaticRoute(idx, 'dst-address', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Gateway"
                value={route.gateway}
                onChange={(e) => updateStaticRoute(idx, 'gateway', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Distance"
                type="number"
                value={route.distance || ''}
                onChange={(e) => updateStaticRoute(idx, 'distance', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Routing Table"
                value={route['routing-table'] || ''}
                onChange={(e) => updateStaticRoute(idx, 'routing-table', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Comment"
                  value={route.comment || ''}
                  onChange={(e) => updateStaticRoute(idx, 'comment', e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeStaticRoute(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'ospf' && (
        <div>
          <div className="bg-slate-800 p-4 rounded mb-4">
            <h4 className="text-white font-semibold mb-4">OSPF Settings</h4>
            <div className="grid grid-cols-2 gap-4">
              <input
                placeholder="Router ID"
                value={config.ospf?.['router-id'] || ''}
                onChange={(e) => onUpdate({ ...(config.ospf || {}), 'router-id': e.target.value })}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Instance Name"
                value={config.ospf?.instance?.name || ''}
                onChange={(e) => onUpdate({ ...(config.ospf || {}), instance: { ...(config.ospf?.instance || {}), name: e.target.value } })}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
            </div>
          </div>

          <button onClick={addOSPFNetwork} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add OSPF Network
          </button>
          {config.ospf?.networks?.map((network, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-3 gap-4">
              <input
                placeholder="Network (192.168.1.0/24)"
                value={network.network}
                onChange={(e) => updateOSPFNetwork(idx, 'network', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Area"
                value={network.area}
                onChange={(e) => updateOSPFNetwork(idx, 'area', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Comment"
                  value={network.comment || ''}
                  onChange={(e) => updateOSPFNetwork(idx, 'comment', e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeOSPFNetwork(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'bgp' && (
        <div>
          <div className="bg-slate-800 p-4 rounded mb-4">
            <h4 className="text-white font-semibold mb-4">BGP Settings</h4>
            <div className="grid grid-cols-2 gap-4">
              <input
                placeholder="Local AS"
                type="number"
                value={config.bgp?.as || ''}
                onChange={(e) => onUpdate({ ...(config.bgp || {}), as: e.target.value })}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Router ID"
                value={config.bgp?.['router-id'] || ''}
                onChange={(e) => onUpdate({ ...(config.bgp || {}), 'router-id': e.target.value })}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'pbr' && (
        <div>
          <p className="text-slate-400">Configure Policy Based Routing in the Static Routes tab using routing marks.</p>
        </div>
      )}
    </div>
  );
}
