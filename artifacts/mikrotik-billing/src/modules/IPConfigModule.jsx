import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

export function IPConfigModule({ config, onUpdate }) {
  const [activeTab, setActiveTab] = useState('addresses');

  const addAddress = () => {
    const addresses = config.addresses || [];
    onUpdate({ ...config, addresses: [...addresses, { address: '', interface: '', comment: '' }] });
  };

  const updateAddress = (idx, field, value) => {
    const addresses = [...(config.addresses || [])];
    addresses[idx] = { ...addresses[idx], [field]: value };
    onUpdate({ ...config, addresses });
  };

  const removeAddress = (idx) => {
    onUpdate({ ...config, addresses: config.addresses.filter((_, i) => i !== idx) });
  };

  const addDNS = () => {
    const dns = config.dns || { servers: [] };
    onUpdate({ ...dns, servers: [...(dns.servers || []), ''] });
  };

  const updateDNS = (idx, value) => {
    const dns = config.dns || { servers: [] };
    const servers = [...(dns.servers || [])];
    servers[idx] = value;
    onUpdate({ ...dns, servers });
  };

  const removeDNS = (idx) => {
    const dns = config.dns || { servers: [] };
    onUpdate({ ...dns, servers: dns.servers.filter((_, i) => i !== idx) });
  };

  const addDHCPServer = () => {
    const dhcp_servers = config.dhcp_servers || [];
    onUpdate({
      ...config,
      dhcp_servers: [...dhcp_servers, {
        name: '',
        interface: '',
        'address-pool': '',
        network: { address: '', gateway: '', dns: '' },
        pool: { name: '', ranges: '' },
      }],
    });
  };

  const updateDHCPServer = (idx, field, value) => {
    const dhcp_servers = [...(config.dhcp_servers || [])];
    dhcp_servers[idx] = { ...dhcp_servers[idx], [field]: value };
    onUpdate({ ...config, dhcp_servers });
  };

  const removeDHCPServer = (idx) => {
    onUpdate({ ...config, dhcp_servers: config.dhcp_servers.filter((_, i) => i !== idx) });
  };

  return (
    <div>
      <h3 className="text-xl font-bold text-white mb-6">IP Configuration</h3>

      <div className="flex gap-2 mb-6">
        {['addresses', 'dns', 'dhcp'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
          >
            {tab === 'addresses' ? 'Addresses' : tab === 'dns' ? 'DNS' : 'DHCP Server'}
          </button>
        ))}
      </div>

      {activeTab === 'addresses' && (
        <div>
          <button onClick={addAddress} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Address
          </button>
          {config.addresses?.map((addr, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-4 gap-4">
              <input
                placeholder="Address (192.168.1.1/24)"
                value={addr.address}
                onChange={(e) => updateAddress(idx, 'address', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Interface"
                value={addr.interface}
                onChange={(e) => updateAddress(idx, 'interface', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Network (optional)"
                value={addr.network || ''}
                onChange={(e) => updateAddress(idx, 'network', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Comment"
                  value={addr.comment || ''}
                  onChange={(e) => updateAddress(idx, 'comment', e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeAddress(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'dns' && (
        <div>
          <button onClick={addDNS} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add DNS Server
          </button>
          <div className="bg-slate-800 p-4 rounded mb-4">
            <label className="flex items-center gap-2 text-slate-300 mb-4">
              <input
                type="checkbox"
                checked={config.dns?.['allow-remote-requests'] === true}
                onChange={(e) => onUpdate({ ...config, dns: { ...(config.dns || {}), 'allow-remote-requests': e.target.checked } })}
              />
              Allow Remote Requests
            </label>
            {config.dns?.servers?.map((server, idx) => (
              <div key={idx} className="flex gap-2 mb-2">
                <input
                  placeholder="DNS Server IP"
                  value={server}
                  onChange={(e) => updateDNS(idx, e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeDNS(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'dhcp' && (
        <div>
          <button onClick={addDHCPServer} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add DHCP Server
          </button>
          {config.dhcp_servers?.map((server, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4">
              <div className="grid grid-cols-4 gap-4 mb-4">
                <input
                  placeholder="Server Name"
                  value={server.name}
                  onChange={(e) => updateDHCPServer(idx, 'name', e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <input
                  placeholder="Interface"
                  value={server.interface}
                  onChange={(e) => updateDHCPServer(idx, 'interface', e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <input
                  placeholder="Address Pool"
                  value={server['address-pool']}
                  onChange={(e) => updateDHCPServer(idx, 'address-pool', e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeDHCPServer(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <input
                  placeholder="Network (192.168.1.0/24)"
                  value={server.network?.address || ''}
                  onChange={(e) => updateDHCPServer(idx, 'network', { ...server.network, address: e.target.value })}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <input
                  placeholder="Gateway"
                  value={server.network?.gateway || ''}
                  onChange={(e) => updateDHCPServer(idx, 'network', { ...server.network, gateway: e.target.value })}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <input
                  placeholder="DNS Server"
                  value={server.network?.dns || ''}
                  onChange={(e) => updateDHCPServer(idx, 'network', { ...server.network, dns: e.target.value })}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <input
                  placeholder="Pool Name"
                  value={server.pool?.name || ''}
                  onChange={(e) => updateDHCPServer(idx, 'pool', { ...server.pool, name: e.target.value })}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <input
                  placeholder="Pool Ranges (192.168.1.100-192.168.1.200)"
                  value={server.pool?.ranges || ''}
                  onChange={(e) => updateDHCPServer(idx, 'pool', { ...server.pool, ranges: e.target.value })}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
