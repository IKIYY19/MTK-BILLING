import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

export function LoadBalancingModule({ config, onUpdate }) {
  const [activeTab, setActiveTab] = useState('pcc');

  // ── PCC helpers ──────────────────────────────────────────────────────────
  const applyPCCPreset = (wanCount) => {
    const interfaces = Array.from({ length: wanCount }, (_, i) => `wan${i + 1}`);
    const gateways = Array.from({ length: wanCount }, (_, i) => `192.168.${i + 1}.1`);
    const subnets = Array.from({ length: wanCount }, (_, i) => `192.168.${i + 1}.0/24`);
    onUpdate({
      ...config,
      wan_count: wanCount,
      wan_interfaces: interfaces,
      wan_gateways: gateways,
      wan_subnets: subnets,
      ecmp_fallback: config.ecmp_fallback || false,
    });
  };

  const updatePCCField = (field, value) => {
    onUpdate({ ...config, [field]: value });
  };

  // ── ECMP helpers ─────────────────────────────────────────────────────────
  const addECMPRoute = () => {
    const routes = config.ecmp_routes || [];
    onUpdate({
      ...config,
      ecmp_routes: [...routes, {
        'dst-address': '',
        gateways: '',
        distance: 1,
        comment: '',
      }],
    });
  };

  const updateECMPRoute = (idx, field, value) => {
    const routes = [...(config.ecmp_routes || [])];
    routes[idx] = { ...routes[idx], [field]: value };
    onUpdate({ ...config, ecmp_routes: routes });
  };

  const removeECMPRoute = (idx) => {
    onUpdate({ ...config, ecmp_routes: config.ecmp_routes.filter((_, i) => i !== idx) });
  };

  // ── Recursive Routing helpers ────────────────────────────────────────────
  const addRecursiveRoute = () => {
    const routes = config.recursive_routes || [];
    onUpdate({
      ...config,
      recursive_routes: [...routes, {
        'dst-address': '',
        gateway: '',
        'routing-mark': '',
        'target-scope': 10,
        scope: 10,
        distance: 1,
        comment: '',
      }],
    });
  };

  const updateRecursiveRoute = (idx, field, value) => {
    const routes = [...(config.recursive_routes || [])];
    routes[idx] = { ...routes[idx], [field]: value };
    onUpdate({ ...config, recursive_routes: routes });
  };

  const removeRecursiveRoute = (idx) => {
    onUpdate({ ...config, recursive_routes: config.recursive_routes.filter((_, i) => i !== idx) });
  };

  const addCheckRoute = () => {
    const checks = config.check_routes || [];
    onUpdate({
      ...config,
      check_routes: [...checks, {
        'dst-address': '',
        gateway: '',
        'routing-mark': '',
        'target-scope': 10,
        scope: 10,
        distance: 1,
        comment: '',
      }],
    });
  };

  const updateCheckRoute = (idx, field, value) => {
    const checks = [...(config.check_routes || [])];
    checks[idx] = { ...checks[idx], [field]: value };
    onUpdate({ ...config, check_routes: checks });
  };

  const removeCheckRoute = (idx) => {
    onUpdate({ ...config, check_routes: config.check_routes.filter((_, i) => i !== idx) });
  };

  // ── Netwatch Failover helpers ────────────────────────────────────────────
  const addNetwatchHost = () => {
    const hosts = config.netwatch_hosts || [];
    onUpdate({
      ...config,
      netwatch_hosts: [...hosts, {
        host: '',
        timeout: '5s',
        interval: '10s',
        'on-up': '',
        'on-down': '',
        comment: '',
      }],
    });
  };

  const updateNetwatchHost = (idx, field, value) => {
    const hosts = [...(config.netwatch_hosts || [])];
    hosts[idx] = { ...hosts[idx], [field]: value };
    onUpdate({ ...config, netwatch_hosts: hosts });
  };

  const removeNetwatchHost = (idx) => {
    onUpdate({ ...config, netwatch_hosts: config.netwatch_hosts.filter((_, i) => i !== idx) });
  };

  const toggleFailoverScript = () => {
    onUpdate({ ...config, failover_script: !config.failover_script });
  };

  // ── Tab definitions ──────────────────────────────────────────────────────
  const tabs = [
    { id: 'pcc', label: 'PCC Load Balancing' },
    { id: 'ecmp', label: 'ECMP' },
    { id: 'recursive', label: 'Recursive Routing' },
    { id: 'netwatch', label: 'Netwatch Failover' },
  ];

  return (
    <div>
      <h3 className="text-xl font-bold text-white mb-6">Load Balancing</h3>

      <div className="flex gap-2 mb-6 flex-wrap">
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

      {/* ────────────────────── PCC Load Balancing ────────────────────── */}
      {activeTab === 'pcc' && (
        <div>
          <div className="mb-4 flex gap-2 flex-wrap">
            <button
              onClick={() => applyPCCPreset(2)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded"
            >
              2 WAN PCC
            </button>
            <button
              onClick={() => applyPCCPreset(3)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded"
            >
              3 WAN PCC
            </button>
          </div>

          <div className="bg-slate-800 p-4 rounded mb-4">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-slate-400 text-sm mb-1">WAN Count</label>
                <select
                  value={config.wan_count || 2}
                  onChange={(e) => updatePCCField('wan_count', parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                >
                  <option value={2}>2 WAN</option>
                  <option value={3}>3 WAN</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.ecmp_fallback || false}
                    onChange={(e) => updatePCCField('ecmp_fallback', e.target.checked)}
                    className="w-4 h-4"
                  />
                  ECMP Fallback
                </label>
              </div>
            </div>

            <h4 className="text-white font-semibold mb-2">WAN Interfaces (one per line)</h4>
            <textarea
              value={(config.wan_interfaces || []).join('\n')}
              onChange={(e) => updatePCCField('wan_interfaces', e.target.value.split('\n').filter(Boolean))}
              rows={3}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white mb-4"
              placeholder="wan1&#10;wan2"
            />

            <h4 className="text-white font-semibold mb-2">WAN Gateways (one per line)</h4>
            <textarea
              value={(config.wan_gateways || []).join('\n')}
              onChange={(e) => updatePCCField('wan_gateways', e.target.value.split('\n').filter(Boolean))}
              rows={3}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white mb-4"
              placeholder="192.168.1.1&#10;192.168.2.1"
            />

            <h4 className="text-white font-semibold mb-2">WAN Subnets (one per line)</h4>
            <textarea
              value={(config.wan_subnets || []).join('\n')}
              onChange={(e) => updatePCCField('wan_subnets', e.target.value.split('\n').filter(Boolean))}
              rows={3}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              placeholder="192.168.1.0/24&#10;192.168.2.0/24"
            />
          </div>
        </div>
      )}

      {/* ────────────────────── ECMP ──────────────────────────────────── */}
      {activeTab === 'ecmp' && (
        <div>
          <button onClick={addECMPRoute} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add ECMP Route
          </button>
          {config.ecmp_routes?.map((route, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-4 gap-4">
              <input
                placeholder="Destination Address"
                value={route['dst-address']}
                onChange={(e) => updateECMPRoute(idx, 'dst-address', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Gateways (comma-separated)"
                value={route.gateways}
                onChange={(e) => updateECMPRoute(idx, 'gateways', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                type="number"
                placeholder="Distance"
                value={route.distance}
                onChange={(e) => updateECMPRoute(idx, 'distance', parseInt(e.target.value) || 1)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Comment"
                  value={route.comment}
                  onChange={(e) => updateECMPRoute(idx, 'comment', e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeECMPRoute(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ────────────────────── Recursive Routing ─────────────────────── */}
      {activeTab === 'recursive' && (
        <div>
          <h4 className="text-white font-semibold mb-2">Routes</h4>
          <button onClick={addRecursiveRoute} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Route
          </button>
          {config.recursive_routes?.map((route, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-4 gap-4">
              <input
                placeholder="Destination Address"
                value={route['dst-address']}
                onChange={(e) => updateRecursiveRoute(idx, 'dst-address', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Gateway"
                value={route.gateway}
                onChange={(e) => updateRecursiveRoute(idx, 'gateway', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Routing Mark"
                value={route['routing-mark']}
                onChange={(e) => updateRecursiveRoute(idx, 'routing-mark', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                type="number"
                placeholder="Target Scope"
                value={route['target-scope']}
                onChange={(e) => updateRecursiveRoute(idx, 'target-scope', parseInt(e.target.value) || 10)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                type="number"
                placeholder="Scope"
                value={route.scope}
                onChange={(e) => updateRecursiveRoute(idx, 'scope', parseInt(e.target.value) || 10)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                type="number"
                placeholder="Distance"
                value={route.distance}
                onChange={(e) => updateRecursiveRoute(idx, 'distance', parseInt(e.target.value) || 1)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <div className="flex gap-2 col-span-2">
                <input
                  placeholder="Comment"
                  value={route.comment}
                  onChange={(e) => updateRecursiveRoute(idx, 'comment', e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeRecursiveRoute(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}

          <h4 className="text-white font-semibold mb-2 mt-6">Check Routes</h4>
          <button onClick={addCheckRoute} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Check Route
          </button>
          {config.check_routes?.map((route, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-4 gap-4">
              <input
                placeholder="Destination Address"
                value={route['dst-address']}
                onChange={(e) => updateCheckRoute(idx, 'dst-address', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Gateway"
                value={route.gateway}
                onChange={(e) => updateCheckRoute(idx, 'gateway', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Routing Mark"
                value={route['routing-mark']}
                onChange={(e) => updateCheckRoute(idx, 'routing-mark', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                type="number"
                placeholder="Target Scope"
                value={route['target-scope']}
                onChange={(e) => updateCheckRoute(idx, 'target-scope', parseInt(e.target.value) || 10)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                type="number"
                placeholder="Scope"
                value={route.scope}
                onChange={(e) => updateCheckRoute(idx, 'scope', parseInt(e.target.value) || 10)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                type="number"
                placeholder="Distance"
                value={route.distance}
                onChange={(e) => updateCheckRoute(idx, 'distance', parseInt(e.target.value) || 1)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <div className="flex gap-2 col-span-2">
                <input
                  placeholder="Comment"
                  value={route.comment}
                  onChange={(e) => updateCheckRoute(idx, 'comment', e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeCheckRoute(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ────────────────────── Netwatch Failover ─────────────────────── */}
      {activeTab === 'netwatch' && (
        <div>
          <button onClick={addNetwatchHost} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Host
          </button>
          {config.netwatch_hosts?.map((host, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-4 gap-4">
              <input
                placeholder="Host (IP or DNS)"
                value={host.host}
                onChange={(e) => updateNetwatchHost(idx, 'host', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Timeout (e.g. 5s)"
                value={host.timeout}
                onChange={(e) => updateNetwatchHost(idx, 'timeout', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Interval (e.g. 10s)"
                value={host.interval}
                onChange={(e) => updateNetwatchHost(idx, 'interval', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="On-Up Script"
                value={host['on-up']}
                onChange={(e) => updateNetwatchHost(idx, 'on-up', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="On-Down Script"
                value={host['on-down']}
                onChange={(e) => updateNetwatchHost(idx, 'on-down', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <div className="flex gap-2 col-span-3">
                <input
                  placeholder="Comment"
                  value={host.comment}
                  onChange={(e) => updateNetwatchHost(idx, 'comment', e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeNetwatchHost(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}

          <div className="bg-slate-800 p-4 rounded mt-4">
            <label className="flex items-center gap-2 text-white cursor-pointer">
              <input
                type="checkbox"
                checked={config.failover_script || false}
                onChange={toggleFailoverScript}
                className="w-4 h-4"
              />
              Include Failover Script Template
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
