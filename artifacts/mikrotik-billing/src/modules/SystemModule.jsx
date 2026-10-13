import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

const TIMEZONES = [
  'Etc/UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Dubai', 'Asia/Kolkata',
  'Australia/Sydney', 'Pacific/Auckland',
];

export function SystemModule({ config, onUpdate }) {
  const [activeTab, setActiveTab] = useState('system');

  // System
  const updateSystem = (field, value) => {
    onUpdate({ ...config, system: { ...(config.system || {}), [field]: value } });
  };

  // NTP
  const updateNTP = (field, value) => {
    onUpdate({ ...config, ntp: { ...(config.ntp || {}), [field]: value } });
  };

  const addNTPServer = () => {
    const ntp = config.ntp || {};
    const servers = ntp.servers || [];
    onUpdate({ ...config, ntp: { ...ntp, servers: [...servers, ''] } });
  };

  const updateNTPServer = (idx, value) => {
    const ntp = config.ntp || {};
    const servers = [...(ntp.servers || [])];
    servers[idx] = value;
    onUpdate({ ...config, ntp: { ...ntp, servers } });
  };

  const removeNTPServer = (idx) => {
    const ntp = config.ntp || {};
    onUpdate({ ...config, ntp: { ...ntp, servers: ntp.servers.filter((_, i) => i !== idx) } });
  };

  // SNMP
  const updateSNMP = (field, value) => {
    onUpdate({ ...config, snmp: { ...(config.snmp || {}), [field]: value } });
  };

  const addSNMPCommunity = () => {
    const snmp = config.snmp || {};
    const communities = snmp.communities || [];
    onUpdate({ ...config, snmp: { ...snmp, communities: [...communities, { name: 'public', addresses: ['0.0.0.0/0'], security: 'authorized', comment: '' }] } });
  };

  const updateSNMPCommunity = (idx, field, value) => {
    const snmp = config.snmp || {};
    const communities = [...(snmp.communities || [])];
    communities[idx] = { ...communities[idx], [field]: value };
    onUpdate({ ...config, snmp: { ...snmp, communities } });
  };

  const removeSNMPCommunity = (idx) => {
    const snmp = config.snmp || {};
    onUpdate({ ...config, snmp: { ...snmp, communities: snmp.communities.filter((_, i) => i !== idx) } });
  };

  // Logging
  const addLogRule = () => {
    const logging = config.logging || {};
    const rules = logging.rules || [];
    onUpdate({ ...config, logging: { ...logging, rules: [...rules, { topics: 'info', action: 'memory', comment: '' }] } });
  };

  const updateLogRule = (idx, field, value) => {
    const logging = config.logging || {};
    const rules = [...(logging.rules || [])];
    rules[idx] = { ...rules[idx], [field]: value };
    onUpdate({ ...config, logging: { ...logging, rules } });
  };

  const removeLogRule = (idx) => {
    const logging = config.logging || {};
    onUpdate({ ...config, logging: { ...logging, rules: logging.rules.filter((_, i) => i !== idx) } });
  };

  // Services
  const updateServices = (field, value) => {
    onUpdate({ ...config, services: { ...(config.services || {}), [field]: value } });
  };

  // Users
  const addUser = () => {
    const users = config.users || [];
    onUpdate({ ...config, users: [...users, { name: '', password: '', group: 'read', comment: '' }] });
  };

  const updateUser = (idx, field, value) => {
    const users = [...(config.users || [])];
    users[idx] = { ...users[idx], [field]: value };
    onUpdate({ ...config, users });
  };

  const removeUser = (idx) => {
    onUpdate({ ...config, users: config.users.filter((_, i) => i !== idx) });
  };

  return (
    <div>
      <h3 className="text-xl font-bold text-white mb-6">System & Monitoring</h3>

      <div className="flex gap-2 mb-6 flex-wrap">
        {['system', 'ntp', 'snmp', 'logging', 'services', 'users'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 rounded ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'system' && (
        <div className="bg-slate-800 p-4 rounded">
          <h4 className="text-white font-semibold mb-4">System Settings</h4>
          <div className="grid grid-cols-2 gap-4">
            <input
              placeholder="Router Identity"
              value={config.system?.identity || ''}
              onChange={(e) => updateSystem('identity', e.target.value)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            />
            <select
              value={config.system?.timezone || ''}
              onChange={(e) => updateSystem('timezone', e.target.value)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            >
              <option value="">Select Timezone</option>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
            <input
              placeholder="Location"
              value={config.system?.location || ''}
              onChange={(e) => updateSystem('location', e.target.value)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            />
            <input
              placeholder="Contact"
              value={config.system?.contact || ''}
              onChange={(e) => updateSystem('contact', e.target.value)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            />
          </div>
        </div>
      )}

      {activeTab === 'ntp' && (
        <div>
          <div className="bg-slate-800 p-4 rounded mb-4">
            <h4 className="text-white font-semibold mb-4">NTP Settings</h4>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={config.ntp?.enabled !== false}
                  onChange={(e) => updateNTP('enabled', e.target.checked)}
                />
                Enable NTP Client
              </label>
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={config.ntp?.server_mode === true}
                  onChange={(e) => updateNTP('server_mode', e.target.checked)}
                />
                Enable NTP Server Mode
              </label>
            </div>

            <button onClick={addNTPServer} className="mb-3 bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Server
            </button>
            {config.ntp?.servers?.map((server, idx) => (
              <div key={idx} className="flex gap-2 mb-2">
                <input
                  placeholder="NTP Server (pool.ntp.org)"
                  value={server}
                  onChange={(e) => updateNTPServer(idx, e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeNTPServer(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'snmp' && (
        <div>
          <div className="bg-slate-800 p-4 rounded mb-4">
            <h4 className="text-white font-semibold mb-4">SNMP Settings</h4>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={config.snmp?.enabled !== false}
                  onChange={(e) => updateSNMP('enabled', e.target.checked)}
                />
                Enable SNMP
              </label>
              <input
                placeholder="Contact"
                value={config.snmp?.contact || ''}
                onChange={(e) => updateSNMP('contact', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Location"
                value={config.snmp?.location || ''}
                onChange={(e) => updateSNMP('location', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
            </div>

            <button onClick={addSNMPCommunity} className="mb-3 bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Community
            </button>
            {config.snmp?.communities?.map((comm, idx) => (
              <div key={idx} className="bg-slate-700 p-3 rounded mb-2 grid grid-cols-4 gap-4">
                <input
                  placeholder="Name"
                  value={comm.name}
                  onChange={(e) => updateSNMPCommunity(idx, 'name', e.target.value)}
                  className="px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
                />
                <select
                  value={comm.security}
                  onChange={(e) => updateSNMPCommunity(idx, 'security', e.target.value)}
                  className="px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
                >
                  <option value="authorized">Authorized</option>
                  <option value="read-only">Read Only</option>
                </select>
                <input
                  placeholder="Addresses (0.0.0.0/0)"
                  value={comm.addresses?.join(',') || ''}
                  onChange={(e) => updateSNMPCommunity(idx, 'addresses', e.target.value.split(','))}
                  className="px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
                />
                <div className="flex gap-2">
                  <input
                    placeholder="Comment"
                    value={comm.comment || ''}
                    onChange={(e) => updateSNMPCommunity(idx, 'comment', e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
                  />
                  <button onClick={() => removeSNMPCommunity(idx)} className="text-red-500 hover:text-red-400">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'logging' && (
        <div>
          <button onClick={addLogRule} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Log Rule
          </button>
          {config.logging?.rules?.map((rule, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-4 gap-4">
              <select
                value={rule.topics}
                onChange={(e) => updateLogRule(idx, 'topics', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
                <option value="critical">Critical</option>
                <option value="firewall">Firewall</option>
                <option value="dhcp">DHCP</option>
                <option value="ppp">PPP</option>
              </select>
              <select
                value={rule.action}
                onChange={(e) => updateLogRule(idx, 'action', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value="memory">Memory</option>
                <option value="disk">Disk</option>
                <option value="echo">Echo</option>
              </select>
              <input
                placeholder="Comment"
                value={rule.comment || ''}
                onChange={(e) => updateLogRule(idx, 'comment', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <button onClick={() => removeLogRule(idx)} className="text-red-500 hover:text-red-400">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'services' && (
        <div className="bg-slate-800 p-4 rounded">
          <h4 className="text-white font-semibold mb-4">Service Management</h4>
          
          <div className="mb-6">
            <h5 className="text-red-400 font-semibold mb-2">Disable Insecure Services</h5>
            <div className="grid grid-cols-3 gap-4">
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={config.services?.disable_insecure?.includes('telnet')}
                  onChange={(e) => {
                    const current = config.services?.disable_insecure || [];
                    const updated = e.target.checked ? [...current, 'telnet'] : current.filter(s => s !== 'telnet');
                    updateServices('disable_insecure', updated);
                  }}
                />
                Disable Telnet
              </label>
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={config.services?.disable_insecure?.includes('ftp')}
                  onChange={(e) => {
                    const current = config.services?.disable_insecure || [];
                    const updated = e.target.checked ? [...current, 'ftp'] : current.filter(s => s !== 'ftp');
                    updateServices('disable_insecure', updated);
                  }}
                />
                Disable FTP
              </label>
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={config.services?.disable_insecure?.includes('www')}
                  onChange={(e) => {
                    const current = config.services?.disable_insecure || [];
                    const updated = e.target.checked ? [...current, 'www'] : current.filter(s => s !== 'www');
                    updateServices('disable_insecure', updated);
                  }}
                />
                Disable WWW
              </label>
            </div>
          </div>

          <div>
            <h5 className="text-green-400 font-semibold mb-2">Enable Secure Services</h5>
            <div className="grid grid-cols-3 gap-4">
              {['ssh', 'winbox', 'api', 'api-ssl'].map((svc) => (
                <label key={svc} className="flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={config.services?.enable_secure?.includes(svc)}
                    onChange={(e) => {
                      const current = config.services?.enable_secure || [];
                      const updated = e.target.checked ? [...current, svc] : current.filter(s => s !== svc);
                      updateServices('enable_secure', updated);
                    }}
                  />
                  Enable {svc.toUpperCase()}
                </label>
              ))}
            </div>
            <div className="mt-4">
              <input
                placeholder="Allowed Addresses (comma-separated)"
                value={config.services?.allowed_addresses?.join(',') || ''}
                onChange={(e) => updateServices('allowed_addresses', e.target.value ? e.target.value.split(',') : [])}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div>
          <button onClick={addUser} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add User
          </button>
          {config.users?.map((user, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-5 gap-4">
              <input
                placeholder="Username"
                value={user.name}
                onChange={(e) => updateUser(idx, 'name', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Password"
                type="password"
                value={user.password}
                onChange={(e) => updateUser(idx, 'password', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <select
                value={user.group}
                onChange={(e) => updateUser(idx, 'group', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value="read">Read Only</option>
                <option value="write">Write</option>
                <option value="full">Full Access</option>
              </select>
              <input
                placeholder="Comment"
                value={user.comment || ''}
                onChange={(e) => updateUser(idx, 'comment', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <button onClick={() => removeUser(idx)} className="text-red-500 hover:text-red-400">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
