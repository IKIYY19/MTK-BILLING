import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

export function ISPModule({ config, onUpdate }) {
  const [activeTab, setActiveTab] = useState('pppoe');

  // PPPoE Server
  const updatePPPoE = (field, value) => {
    onUpdate({ ...config, pppoe_server: { ...(config.pppoe_server || {}), [field]: value } });
  };

  // PPP Profiles
  const addProfile = () => {
    const ppp_profiles = config.ppp_profiles || [];
    onUpdate({ ...config, ppp_profiles: [...ppp_profiles, { name: '', 'local-address': '', 'remote-address': '', 'rate-limit': '', comment: '' }] });
  };

  const updateProfile = (idx, field, value) => {
    const ppp_profiles = [...(config.ppp_profiles || [])];
    ppp_profiles[idx] = { ...ppp_profiles[idx], [field]: value };
    onUpdate({ ...config, ppp_profiles });
  };

  const removeProfile = (idx) => {
    onUpdate({ ...config, ppp_profiles: config.ppp_profiles.filter((_, i) => i !== idx) });
  };

  // PPP Secrets
  const addSecret = () => {
    const ppp_secrets = config.ppp_secrets || [];
    onUpdate({ ...config, ppp_secrets: [...ppp_secrets, { name: '', password: '', service: 'pppoe', profile: '', comment: '' }] });
  };

  const updateSecret = (idx, field, value) => {
    const ppp_secrets = [...(config.ppp_secrets || [])];
    ppp_secrets[idx] = { ...ppp_secrets[idx], [field]: value };
    onUpdate({ ...config, ppp_secrets });
  };

  const removeSecret = (idx) => {
    onUpdate({ ...config, ppp_secrets: config.ppp_secrets.filter((_, i) => i !== idx) });
  };

  // Hotspot
  const updateHotspot = (field, value) => {
    onUpdate({ ...config, hotspot: { ...(config.hotspot || {}), [field]: value } });
  };

  const addWalledGarden = () => {
    const hotspot = config.hotspot || {};
    const walled_garden = hotspot.walled_garden || [];
    onUpdate({ ...hotspot, walled_garden: [...walled_garden, { 'dst-host': '', action: 'accept', comment: '' }] });
  };

  const updateWalledGarden = (idx, field, value) => {
    const hotspot = config.hotspot || {};
    const walled_garden = [...(hotspot.walled_garden || [])];
    walled_garden[idx] = { ...walled_garden[idx], [field]: value };
    onUpdate({ ...hotspot, walled_garden });
  };

  const removeWalledGarden = (idx) => {
    const hotspot = config.hotspot || {};
    onUpdate({ ...hotspot, walled_garden: hotspot.walled_garden.filter((_, i) => i !== idx) });
  };

  // RADIUS
  const addRADIUSServer = () => {
    const radius = config.radius || { servers: [] };
    onUpdate({ ...radius, servers: [...(radius.servers || []), { address: '', secret: '', service: 'ppp', timeout: '3s', comment: '' }] });
  };

  const updateRADIUSServer = (idx, field, value) => {
    const radius = config.radius || { servers: [] };
    const servers = [...(radius.servers || [])];
    servers[idx] = { ...servers[idx], [field]: value };
    onUpdate({ ...radius, servers });
  };

  const removeRADIUSServer = (idx) => {
    const radius = config.radius || { servers: [] };
    onUpdate({ ...radius, servers: radius.servers.filter((_, i) => i !== idx) });
  };

  const tabs = [
    { id: 'pppoe', label: 'PPPoE Server' },
    { id: 'profiles', label: 'PPP Profiles' },
    { id: 'secrets', label: 'PPP Secrets' },
    { id: 'hotspot', label: 'Hotspot' },
    { id: 'radius', label: 'RADIUS' },
  ];

  return (
    <div>
      <h3 className="text-xl font-bold text-white mb-6">ISP Services</h3>

      <div className="flex gap-2 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'pppoe' && (
        <div className="bg-slate-800 p-4 rounded">
          <h4 className="text-white font-semibold mb-4">PPPoE Server Settings</h4>
          <div className="grid grid-cols-2 gap-4">
            <input
              placeholder="Service Name"
              value={config.pppoe_server?.['service-name'] || ''}
              onChange={(e) => updatePPPoE('service-name', e.target.value)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            />
            <input
              placeholder="Interface"
              value={config.pppoe_server?.interface || ''}
              onChange={(e) => updatePPPoE('interface', e.target.value)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            />
            <input
              placeholder="Max MTU"
              type="number"
              value={config.pppoe_server?.['max-mtu'] || ''}
              onChange={(e) => updatePPPoE('max-mtu', e.target.value)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            />
            <input
              placeholder="Max MRU"
              type="number"
              value={config.pppoe_server?.['max-mru'] || ''}
              onChange={(e) => updatePPPoE('max-mru', e.target.value)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            />
            <input
              placeholder="Comment"
              value={config.pppoe_server?.comment || ''}
              onChange={(e) => updatePPPoE('comment', e.target.value)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white col-span-2"
            />
          </div>
        </div>
      )}

      {activeTab === 'profiles' && (
        <div>
          <button onClick={addProfile} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Profile
          </button>
          {config.ppp_profiles?.map((profile, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4">
              <div className="grid grid-cols-3 gap-4 mb-4">
                <input
                  placeholder="Profile Name"
                  value={profile.name}
                  onChange={(e) => updateProfile(idx, 'name', e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <input
                  placeholder="Local Address"
                  value={profile['local-address'] || ''}
                  onChange={(e) => updateProfile(idx, 'local-address', e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <input
                  placeholder="Remote Address"
                  value={profile['remote-address'] || ''}
                  onChange={(e) => updateProfile(idx, 'remote-address', e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <input
                  placeholder="Rate Limit (10M/10M)"
                  value={profile['rate-limit'] || ''}
                  onChange={(e) => updateProfile(idx, 'rate-limit', e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <label className="flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={profile['change-tcp-mss'] === 'yes'}
                    onChange={(e) => updateProfile(idx, 'change-tcp-mss', e.target.checked ? 'yes' : 'no')}
                  />
                  Change TCP MSS
                </label>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-slate-300">
                    <input
                      type="checkbox"
                      checked={profile['use-encryption'] === 'yes'}
                      onChange={(e) => updateProfile(idx, 'use-encryption', e.target.checked ? 'yes' : 'no')}
                    />
                    Encryption
                  </label>
                  <button onClick={() => removeProfile(idx)} className="text-red-500 hover:text-red-400 ml-auto">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'secrets' && (
        <div>
          <button onClick={addSecret} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Secret
          </button>
          {config.ppp_secrets?.map((secret, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-6 gap-4">
              <input
                placeholder="Name"
                value={secret.name}
                onChange={(e) => updateSecret(idx, 'name', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Password"
                type="password"
                value={secret.password}
                onChange={(e) => updateSecret(idx, 'password', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <select
                value={secret.service}
                onChange={(e) => updateSecret(idx, 'service', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value="pppoe">PPPoE</option>
                <option value="l2tp">L2TP</option>
                <option value="sstp">SSTP</option>
                <option value="pptp">PPTP</option>
                <option value="ovpn">OpenVPN</option>
              </select>
              <input
                placeholder="Profile"
                value={secret.profile || ''}
                onChange={(e) => updateSecret(idx, 'profile', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Rate Limit"
                value={secret['rate-limit'] || ''}
                onChange={(e) => updateSecret(idx, 'rate-limit', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Comment"
                  value={secret.comment || ''}
                  onChange={(e) => updateSecret(idx, 'comment', e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeSecret(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'hotspot' && (
        <div>
          <div className="bg-slate-800 p-4 rounded mb-4">
            <h4 className="text-white font-semibold mb-4">Hotspot Server Setup</h4>
            <div className="grid grid-cols-2 gap-4">
              <input
                placeholder="Interface"
                value={config.hotspot?.server_setup?.interface || ''}
                onChange={(e) => updateHotspot('server_setup', { ...(config.hotspot?.server_setup || {}), interface: e.target.value })}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Address (10.5.50.1/24)"
                value={config.hotspot?.server_setup?.address || ''}
                onChange={(e) => updateHotspot('server_setup', { ...(config.hotspot?.server_setup || {}), address: e.target.value })}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Hotspot Address"
                value={config.hotspot?.server_setup?.['hotspot-address'] || ''}
                onChange={(e) => updateHotspot('server_setup', { ...(config.hotspot?.server_setup || {}), 'hotspot-address': e.target.value })}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="DNS Name (hotspot.local)"
                value={config.hotspot?.server_setup?.['dns-name'] || ''}
                onChange={(e) => updateHotspot('server_setup', { ...(config.hotspot?.server_setup || {}), 'dns-name': e.target.value })}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
            </div>
          </div>

          <button onClick={addWalledGarden} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Walled Garden
          </button>
          {config.hotspot?.walled_garden?.map((wg, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-4 gap-4">
              <input
                placeholder="Dst Host (*.example.com)"
                value={wg['dst-host']}
                onChange={(e) => updateWalledGarden(idx, 'dst-host', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <select
                value={wg.action}
                onChange={(e) => updateWalledGarden(idx, 'action', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value="accept">Accept</option>
                <option value="reject">Reject</option>
              </select>
              <input
                placeholder="Comment"
                value={wg.comment || ''}
                onChange={(e) => updateWalledGarden(idx, 'comment', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <button onClick={() => removeWalledGarden(idx)} className="text-red-500 hover:text-red-400">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'radius' && (
        <div>
          <div className="bg-slate-800 p-4 rounded mb-4">
            <label className="flex items-center gap-2 text-slate-300 mb-4">
              <input
                type="checkbox"
                checked={config.radius?.['use-radius'] === true}
                onChange={(e) => onUpdate({ ...config, radius: { ...(config.radius || {}), 'use-radius': e.target.checked } })}
              />
              Use RADIUS for PPP
            </label>
            <label className="flex items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                checked={config.radius?.accounting === true}
                onChange={(e) => onUpdate({ ...config, radius: { ...(config.radius || {}), accounting: e.target.checked } })}
              />
              Enable Accounting
            </label>
          </div>

          <button onClick={addRADIUSServer} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add RADIUS Server
          </button>
          {config.radius?.servers?.map((server, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-5 gap-4">
              <input
                placeholder="Address"
                value={server.address}
                onChange={(e) => updateRADIUSServer(idx, 'address', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Secret"
                value={server.secret}
                onChange={(e) => updateRADIUSServer(idx, 'secret', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <select
                value={server.service}
                onChange={(e) => updateRADIUSServer(idx, 'service', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value="ppp">PPP</option>
                <option value="login">Login</option>
              </select>
              <input
                placeholder="Timeout (3s)"
                value={server.timeout}
                onChange={(e) => updateRADIUSServer(idx, 'timeout', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Comment"
                  value={server.comment || ''}
                  onChange={(e) => updateRADIUSServer(idx, 'comment', e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeRADIUSServer(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
