import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

export function FirewallModule({ config, onUpdate }) {
  const [activeTab, setActiveTab] = useState('filter');

  const addFilterRule = () => {
    const filter_rules = config.filter_rules || [];
    onUpdate({
      ...config,
      filter_rules: [...filter_rules, {
        chain: '',
        action: '',
        protocol: '',
        'src-address': '',
        'dst-address': '',
        'dst-port': '',
        'connection-state': '',
        comment: '',
      }],
    });
  };

  const updateFilterRule = (idx, field, value) => {
    const filter_rules = [...(config.filter_rules || [])];
    filter_rules[idx] = { ...filter_rules[idx], [field]: value };
    onUpdate({ ...config, filter_rules });
  };

  const removeFilterRule = (idx) => {
    onUpdate({ ...config, filter_rules: config.filter_rules.filter((_, i) => i !== idx) });
  };

  const addNATRule = () => {
    const nat_rules = config.nat_rules || [];
    onUpdate({
      ...config,
      nat_rules: [...nat_rules, {
        chain: '',
        action: '',
        'out-interface': '',
        'to-addresses': '',
        'to-ports': '',
        comment: '',
      }],
    });
  };

  const updateNATRule = (idx, field, value) => {
    const nat_rules = [...(config.nat_rules || [])];
    nat_rules[idx] = { ...nat_rules[idx], [field]: value };
    onUpdate({ ...config, nat_rules });
  };

  const removeNATRule = (idx) => {
    onUpdate({ ...config, nat_rules: config.nat_rules.filter((_, i) => i !== idx) });
  };

  const addMangleRule = () => {
    const mangle_rules = config.mangle_rules || [];
    onUpdate({
      ...config,
      mangle_rules: [...mangle_rules, {
        chain: '',
        action: '',
        protocol: '',
        'src-address': '',
        'dst-address': '',
        'connection-mark': '',
        'routing-mark': '',
        comment: '',
      }],
    });
  };

  const updateMangleRule = (idx, field, value) => {
    const mangle_rules = [...(config.mangle_rules || [])];
    mangle_rules[idx] = { ...mangle_rules[idx], [field]: value };
    onUpdate({ ...config, mangle_rules });
  };

  const removeMangleRule = (idx) => {
    onUpdate({ ...config, mangle_rules: config.mangle_rules.filter((_, i) => i !== idx) });
  };

  const addAddressList = () => {
    const address_lists = config.address_lists || [];
    onUpdate({
      ...config,
      address_lists: [...address_lists, {
        address: '',
        list: '',
        timeout: '',
        comment: '',
      }],
    });
  };

  const updateAddressList = (idx, field, value) => {
    const address_lists = [...(config.address_lists || [])];
    address_lists[idx] = { ...address_lists[idx], [field]: value };
    onUpdate({ ...config, address_lists });
  };

  const removeAddressList = (idx) => {
    onUpdate({ ...config, address_lists: config.address_lists.filter((_, i) => i !== idx) });
  };

  const tabs = [
    { id: 'filter', label: 'Filter Rules' },
    { id: 'nat', label: 'NAT' },
    { id: 'mangle', label: 'Mangle' },
    { id: 'address_lists', label: 'Address Lists' },
  ];

  return (
    <div>
      <h3 className="text-xl font-bold text-white mb-6">Firewall</h3>

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

      {activeTab === 'filter' && (
        <div>
          <button onClick={addFilterRule} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Filter Rule
          </button>
          {config.filter_rules?.map((rule, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-4 gap-4">
              <select
                value={rule.chain}
                onChange={(e) => updateFilterRule(idx, 'chain', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value="">Chain</option>
                <option value="input">input</option>
                <option value="forward">forward</option>
                <option value="output">output</option>
              </select>
              <select
                value={rule.action}
                onChange={(e) => updateFilterRule(idx, 'action', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value="">Action</option>
                <option value="accept">accept</option>
                <option value="drop">drop</option>
                <option value="reject">reject</option>
                <option value="add-src-to-address-list">add-src-to-address-list</option>
                <option value="add-dst-to-address-list">add-dst-to-address-list</option>
                <option value="jump">jump</option>
                <option value="log">log</option>
                <option value="passthrough">passthrough</option>
              </select>
              <input
                placeholder="Protocol (tcp, udp, icmp)"
                value={rule.protocol}
                onChange={(e) => updateFilterRule(idx, 'protocol', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Connection State"
                value={rule['connection-state']}
                onChange={(e) => updateFilterRule(idx, 'connection-state', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Source Address"
                value={rule['src-address']}
                onChange={(e) => updateFilterRule(idx, 'src-address', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Destination Address"
                value={rule['dst-address']}
                onChange={(e) => updateFilterRule(idx, 'dst-address', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Destination Port"
                value={rule['dst-port']}
                onChange={(e) => updateFilterRule(idx, 'dst-port', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Comment"
                  value={rule.comment}
                  onChange={(e) => updateFilterRule(idx, 'comment', e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeFilterRule(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'nat' && (
        <div>
          <button onClick={addNATRule} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add NAT Rule
          </button>
          {config.nat_rules?.map((rule, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-4 gap-4">
              <select
                value={rule.chain}
                onChange={(e) => updateNATRule(idx, 'chain', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value="">Chain</option>
                <option value="srcnat">srcnat</option>
                <option value="dstnat">dstnat</option>
                <option value="postrouting">postrouting</option>
                <option value="prerouting">prerouting</option>
              </select>
              <select
                value={rule.action}
                onChange={(e) => updateNATRule(idx, 'action', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value="">Action</option>
                <option value="masquerade">masquerade</option>
                <option value="src-nat">src-nat</option>
                <option value="dst-nat">dst-nat</option>
                <option value="netmap">netmap</option>
                <option value="redirect">redirect</option>
              </select>
              <input
                placeholder="Out Interface"
                value={rule['out-interface']}
                onChange={(e) => updateNATRule(idx, 'out-interface', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="To Addresses"
                value={rule['to-addresses']}
                onChange={(e) => updateNATRule(idx, 'to-addresses', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="To Ports"
                value={rule['to-ports']}
                onChange={(e) => updateNATRule(idx, 'to-ports', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Comment"
                  value={rule.comment}
                  onChange={(e) => updateNATRule(idx, 'comment', e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeNATRule(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'mangle' && (
        <div>
          <button onClick={addMangleRule} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Mangle Rule
          </button>
          {config.mangle_rules?.map((rule, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-4 gap-4">
              <select
                value={rule.chain}
                onChange={(e) => updateMangleRule(idx, 'chain', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value="">Chain</option>
                <option value="prerouting">prerouting</option>
                <option value="input">input</option>
                <option value="forward">forward</option>
                <option value="output">output</option>
                <option value="postrouting">postrouting</option>
              </select>
              <select
                value={rule.action}
                onChange={(e) => updateMangleRule(idx, 'action', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value="">Action</option>
                <option value="mark-connection">mark-connection</option>
                <option value="mark-packet">mark-packet</option>
                <option value="mark-routing">mark-routing</option>
                <option value="change-mss">change-mss</option>
                <option value="change-ttl">change-ttl</option>
                <option value="strip-ipv4-options">strip-ipv4-options</option>
                <option value="log">log</option>
                <option value="passthrough">passthrough</option>
                <option value="return">return</option>
                <option value="jump">jump</option>
              </select>
              <input
                placeholder="Protocol"
                value={rule.protocol}
                onChange={(e) => updateMangleRule(idx, 'protocol', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Connection Mark"
                value={rule['connection-mark']}
                onChange={(e) => updateMangleRule(idx, 'connection-mark', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Source Address"
                value={rule['src-address']}
                onChange={(e) => updateMangleRule(idx, 'src-address', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Destination Address"
                value={rule['dst-address']}
                onChange={(e) => updateMangleRule(idx, 'dst-address', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Routing Mark"
                value={rule['routing-mark']}
                onChange={(e) => updateMangleRule(idx, 'routing-mark', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Comment"
                  value={rule.comment}
                  onChange={(e) => updateMangleRule(idx, 'comment', e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeMangleRule(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'address_lists' && (
        <div>
          <button onClick={addAddressList} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Address List
          </button>
          {config.address_lists?.map((entry, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-4 gap-4">
              <input
                placeholder="Address (IP or range)"
                value={entry.address}
                onChange={(e) => updateAddressList(idx, 'address', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="List Name"
                value={entry.list}
                onChange={(e) => updateAddressList(idx, 'list', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Timeout (e.g. 1h, 1d)"
                value={entry.timeout}
                onChange={(e) => updateAddressList(idx, 'timeout', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Comment"
                  value={entry.comment}
                  onChange={(e) => updateAddressList(idx, 'comment', e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeAddressList(idx)} className="text-red-500 hover:text-red-400">
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
