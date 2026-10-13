import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

export function WirelessModule({ config, onUpdate }) {
  const [activeTab, setActiveTab] = useState('wireless');

  // Wireless
  const addWireless = () => {
    const wireless = config.wireless || [];
    onUpdate({ ...config, wireless: [...wireless, { interface: '', mode: 'ap-bridge', ssid: '', band: '5ghz-a/n/ac', 'security-profile': '', comment: '' }] });
  };

  const updateWireless = (idx, field, value) => {
    const wireless = [...(config.wireless || [])];
    wireless[idx] = { ...wireless[idx], [field]: value };
    onUpdate({ ...config, wireless });
  };

  const removeWireless = (idx) => {
    onUpdate({ ...config, wireless: config.wireless.filter((_, i) => i !== idx) });
  };

  // Security Profiles
  const addSecurityProfile = () => {
    const security_profiles = config.security_profiles || [];
    onUpdate({ ...config, security_profiles: [...security_profiles, { name: '', 'authentication-types': '', 'unicast-ciphers': '', 'wpa-pre-shared-key': '', comment: '' }] });
  };

  const updateSecurityProfile = (idx, field, value) => {
    const security_profiles = [...(config.security_profiles || [])];
    security_profiles[idx] = { ...security_profiles[idx], [field]: value };
    onUpdate({ ...config, security_profiles });
  };

  const removeSecurityProfile = (idx) => {
    onUpdate({ ...config, security_profiles: config.security_profiles.filter((_, i) => i !== idx) });
  };

  // CAPsMAN
  const updateCAPsMAN = (field, value) => {
    const capsman = config.capsman || {};
    onUpdate({ ...config, capsman: { ...capsman, [field]: value } });
  };

  const addCAPsMANItem = (type) => {
    const capsman = config.capsman || {};
    const items = capsman[type] || [];
    const defaults = {
      channels: { name: '', band: '5ghz-a/n/ac', comment: '' },
      datapaths: { name: '', bridge: 'bridge', comment: '' },
      security: { name: '', encryption: 'aes-ccm', passphrase: '', comment: '' },
      configurations: { name: '', ssid: 'MikroTik', comment: '' },
      provisioning: { action: 'create-cfg-enabled', comment: '' },
    };
    onUpdate({ ...config, capsman: { ...capsman, [type]: [...items, { ...(defaults[type] || {}), }] } });
  };

  const updateCAPsMANItem = (type, idx, field, value) => {
    const capsman = config.capsman || {};
    const items = [...(capsman[type] || [])];
    items[idx] = { ...items[idx], [field]: value };
    onUpdate({ ...config, capsman: { ...capsman, [type]: items } });
  };

  const removeCAPsMANItem = (type, idx) => {
    const capsman = config.capsman || {};
    onUpdate({ ...config, capsman: { ...capsman, [type]: capsman[type].filter((_, i) => i !== idx) } });
  };

  const [capsmanTab, setCapsmanTab] = useState('channels');

  return (
    <div>
      <h3 className="text-xl font-bold text-white mb-6">Wireless Configuration</h3>

      <div className="flex gap-2 mb-6">
        {['wireless', 'security', 'capsman'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
          >
            {tab === 'wireless' ? 'Wireless' : tab === 'security' ? 'Security Profiles' : 'CAPsMAN'}
          </button>
        ))}
      </div>

      {activeTab === 'wireless' && (
        <div>
          <button onClick={addWireless} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Wireless Interface
          </button>
          {config.wireless?.map((w, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-4 gap-4">
              <input
                placeholder="Interface (wlan1)"
                value={w.interface}
                onChange={(e) => updateWireless(idx, 'interface', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <select
                value={w.mode}
                onChange={(e) => updateWireless(idx, 'mode', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value="ap-bridge">AP Bridge</option>
                <option value="bridge">Bridge</option>
                <option value="station">Station</option>
                <option value="station-bridge">Station Bridge</option>
              </select>
              <input
                placeholder="SSID"
                value={w.ssid}
                onChange={(e) => updateWireless(idx, 'ssid', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <select
                value={w.band}
                onChange={(e) => updateWireless(idx, 'band', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value="2ghz-b/g/n">2.4 GHz B/G/N</option>
                <option value="5ghz-a/n/ac">5 GHz A/N/AC</option>
                <option value="5ghz-n/ac/ax">5 GHz N/AC/AX</option>
              </select>
              <div className="col-span-3 flex gap-2">
                <input
                  placeholder="Security Profile"
                  value={w['security-profile'] || ''}
                  onChange={(e) => updateWireless(idx, 'security-profile', e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <label className="flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={w['hide-ssid'] === true}
                    onChange={(e) => updateWireless(idx, 'hide-ssid', e.target.checked)}
                  />
                  Hide SSID
                </label>
                <button onClick={() => removeWireless(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              <input
                placeholder="Comment"
                value={w.comment || ''}
                onChange={(e) => updateWireless(idx, 'comment', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white col-span-4"
              />
            </div>
          ))}
        </div>
      )}

      {activeTab === 'security' && (
        <div>
          <button onClick={addSecurityProfile} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Security Profile
          </button>
          {config.security_profiles?.map((sp, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4">
              <div className="grid grid-cols-4 gap-4 mb-4">
                <input
                  placeholder="Profile Name"
                  value={sp.name}
                  onChange={(e) => updateSecurityProfile(idx, 'name', e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <select
                  value={sp['authentication-types'] || ''}
                  onChange={(e) => updateSecurityProfile(idx, 'authentication-types', e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                >
                  <option value="">Authentication Type</option>
                  <option value="wpa-psk">WPA-PSK</option>
                  <option value="wpa2-psk">WPA2-PSK</option>
                  <option value="wpa-eap">WPA-EAP</option>
                  <option value="wpa2-eap">WPA2-EAP</option>
                </select>
                <select
                  value={sp['unicast-ciphers'] || ''}
                  onChange={(e) => updateSecurityProfile(idx, 'unicast-ciphers', e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                >
                  <option value="">Cipher</option>
                  <option value="aes-ccm">AES-CCM</option>
                  <option value="tkip">TKIP</option>
                </select>
                <button onClick={() => removeSecurityProfile(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input
                  placeholder="WPA Pre-Shared Key"
                  type="password"
                  value={sp['wpa-pre-shared-key'] || ''}
                  onChange={(e) => updateSecurityProfile(idx, 'wpa-pre-shared-key', e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <input
                  placeholder="Comment"
                  value={sp.comment || ''}
                  onChange={(e) => updateSecurityProfile(idx, 'comment', e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'capsman' && (
        <div>
          <div className="flex gap-2 mb-4">
            {['channels', 'datapaths', 'security', 'configurations', 'provisioning'].map((tab) => (
              <button
                key={tab}
                onClick={() => setCapsmanTab(tab)}
                className={`px-3 py-1 rounded text-sm ${capsmanTab === tab ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <button onClick={() => addCAPsMANItem(capsmanTab)} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add {capsmanTab.slice(0, -1)}
          </button>

          {config.capsman?.[capsmanTab]?.map((item, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-4 gap-4">
              {capsmanTab === 'channels' && (
                <>
                  <input placeholder="Name" value={item.name || ''} onChange={(e) => updateCAPsMANItem(capsmanTab, idx, 'name', e.target.value)} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white" />
                  <select value={item.band || ''} onChange={(e) => updateCAPsMANItem(capsmanTab, idx, 'band', e.target.value)} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white">
                    <option value="2ghz-b/g/n">2.4 GHz</option>
                    <option value="5ghz-a/n/ac">5 GHz</option>
                  </select>
                  <input placeholder="Frequency" value={item.frequency || ''} onChange={(e) => updateCAPsMANItem(capsmanTab, idx, 'frequency', e.target.value)} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white" />
                  <button onClick={() => removeCAPsMANItem(capsmanTab, idx)} className="text-red-500 hover:text-red-400"><Trash2 className="w-5 h-5" /></button>
                </>
              )}
              {capsmanTab === 'datapaths' && (
                <>
                  <input placeholder="Name" value={item.name || ''} onChange={(e) => updateCAPsMANItem(capsmanTab, idx, 'name', e.target.value)} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white" />
                  <input placeholder="Bridge" value={item.bridge || ''} onChange={(e) => updateCAPsMANItem(capsmanTab, idx, 'bridge', e.target.value)} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white" />
                  <label className="flex items-center gap-2 text-slate-300">
                    <input type="checkbox" checked={item['local-forwarding'] === true} onChange={(e) => updateCAPsMANItem(capsmanTab, idx, 'local-forwarding', e.target.checked)} /> Local Forwarding
                  </label>
                  <button onClick={() => removeCAPsMANItem(capsmanTab, idx)} className="text-red-500 hover:text-red-400"><Trash2 className="w-5 h-5" /></button>
                </>
              )}
              {capsmanTab === 'security' && (
                <>
                  <input placeholder="Name" value={item.name || ''} onChange={(e) => updateCAPsMANItem(capsmanTab, idx, 'name', e.target.value)} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white" />
                  <input placeholder="Passphrase" type="password" value={item.passphrase || ''} onChange={(e) => updateCAPsMANItem(capsmanTab, idx, 'passphrase', e.target.value)} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white" />
                  <select value={item.encryption || ''} onChange={(e) => updateCAPsMANItem(capsmanTab, idx, 'encryption', e.target.value)} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white">
                    <option value="aes-ccm">AES-CCM</option>
                    <option value="tkip">TKIP</option>
                  </select>
                  <button onClick={() => removeCAPsMANItem(capsmanTab, idx)} className="text-red-500 hover:text-red-400"><Trash2 className="w-5 h-5" /></button>
                </>
              )}
              {capsmanTab === 'configurations' && (
                <>
                  <input placeholder="Name" value={item.name || ''} onChange={(e) => updateCAPsMANItem(capsmanTab, idx, 'name', e.target.value)} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white" />
                  <input placeholder="SSID" value={item.ssid || ''} onChange={(e) => updateCAPsMANItem(capsmanTab, idx, 'ssid', e.target.value)} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white" />
                  <input placeholder="Channel" value={item.channel || ''} onChange={(e) => updateCAPsMANItem(capsmanTab, idx, 'channel', e.target.value)} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white" />
                  <button onClick={() => removeCAPsMANItem(capsmanTab, idx)} className="text-red-500 hover:text-red-400"><Trash2 className="w-5 h-5" /></button>
                </>
              )}
              {capsmanTab === 'provisioning' && (
                <>
                  <select value={item.action || ''} onChange={(e) => updateCAPsMANItem(capsmanTab, idx, 'action', e.target.value)} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white">
                    <option value="create-cfg-enabled">Create Config Enabled</option>
                    <option value="create-disabled">Create Disabled</option>
                  </select>
                  <input placeholder="Identity Regexp" value={item['identity-regexp'] || ''} onChange={(e) => updateCAPsMANItem(capsmanTab, idx, 'identity-regexp', e.target.value)} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white col-span-2" />
                  <button onClick={() => removeCAPsMANItem(capsmanTab, idx)} className="text-red-500 hover:text-red-400"><Trash2 className="w-5 h-5" /></button>
                </>
              )}
              <input placeholder="Comment" value={item.comment || ''} onChange={(e) => updateCAPsMANItem(capsmanTab, idx, 'comment', e.target.value)} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white col-span-4" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
