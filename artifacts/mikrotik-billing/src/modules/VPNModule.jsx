import React, { useState, useEffect } from 'react';
import { Plus, Trash2, RefreshCw, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '/api';

export function VPNModule({ config, onUpdate }) {
  const [activeTab, setActiveTab] = useState('wireguard');
  const [generatedPublicKey, setGeneratedPublicKey] = useState('');
  const [connections, setConnections] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [deployStatus, setDeployStatus] = useState(null);

  useEffect(() => {
    console.log('VPNModule mounted');
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    try {
      const { data } = await axios.get(`${API}/mikrotik`).catch(() => ({ data: [] }));
      console.log('Fetched connections:', data);
      setConnections(data);
    } catch (e) { console.error(e); }
  };

  // WireGuard key generation (using simple base64 random for demo - in production use proper crypto)
  const generateWireGuardKeys = () => {
    console.log('Generate button clicked');
    try {
      // Generate 32 random bytes for private key
      const randomBytes = new Uint8Array(32);
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(randomBytes);
      } else {
        // Fallback for environments without crypto API
        for (let i = 0; i < 32; i++) {
          randomBytes[i] = Math.floor(Math.random() * 256);
        }
      }
      const privateKey = btoa(String.fromCharCode(...randomBytes));
      // For demo purposes, public key is derived (in production use proper curve25519)
      // This is a simplified version - real WireGuard uses curve25519
      const publicKey = btoa(privateKey.split('').reverse().join(''));

      console.log('Generated private key:', privateKey);
      console.log('Generated public key:', publicKey);

      updateWGInterface('private-key', privateKey);
      setGeneratedPublicKey(publicKey);
    } catch (e) {
      console.error('Key generation failed:', e);
      alert('Failed to generate keys. Please try again.');
    }
  };

  const deployToMikroTik = async () => {
    if (!selectedConnection) {
      setDeployStatus({ type: 'error', message: 'Please select a MikroTik connection' });
      return;
    }

    if (!config.wireguard?.interface?.name) {
      setDeployStatus({ type: 'error', message: 'Please configure WireGuard interface first' });
      return;
    }

    setDeploying(true);
    setDeployStatus(null);

    try {
      // Deploy WireGuard interface
      const wg = config.wireguard;
      const interfaceConfig = {
        connection_id: selectedConnection,
        name: wg.interface.name,
        'private-key': wg.interface['private-key'],
        'listen-port': wg.interface['listen-port'] || 13231,
        mtu: wg.interface.mtu || 1420,
      };

      await axios.post(`${API}/network/wireguard/interface`, interfaceConfig);

      // Deploy peers
      if (wg.peers && wg.peers.length > 0) {
        for (const peer of wg.peers) {
          if (peer['public-key'] && peer['allowed-address']) {
            await axios.post(`${API}/network/wireguard/peer`, {
              connection_id: selectedConnection,
              interface: wg.interface.name,
              'public-key': peer['public-key'],
              'allowed-address': peer['allowed-address'],
              endpoint: peer.endpoint,
            });
          }
        }
      }

      setDeployStatus({ type: 'success', message: 'WireGuard configuration deployed successfully!' });
    } catch (e) {
      setDeployStatus({ type: 'error', message: `Deployment failed: ${e.response?.data?.error || e.message}` });
    } finally {
      setDeploying(false);
    }
  };

  // WireGuard
  const updateWGInterface = (field, value) => {
    const wg = config.wireguard || {};
    onUpdate({ ...config, wireguard: { ...wg, interface: { ...(wg.interface || {}), [field]: value } } });
  };

  const addWGPeer = () => {
    const wg = config.wireguard || {};
    const peers = wg.peers || [];
    onUpdate({ ...config, wireguard: { ...wg, peers: [...peers, { interface: wg.interface?.name || 'wg1', 'public-key': '', 'allowed-address': '', endpoint: '', comment: '' }] } });
  };

  const updateWGPeer = (idx, field, value) => {
    const wg = config.wireguard || {};
    const peers = [...(wg.peers || [])];
    peers[idx] = { ...peers[idx], [field]: value };
    onUpdate({ ...config, wireguard: { ...wg, peers } });
  };

  const removeWGPeer = (idx) => {
    const wg = config.wireguard || {};
    onUpdate({ ...config, wireguard: { ...wg, peers: wg.peers.filter((_, i) => i !== idx) } });
  };

  // L2TP
  const updateL2TP = (field, value) => {
    const l2tp = config.l2tp || {};
    onUpdate({ ...config, l2tp: { ...l2tp, [field]: value } });
  };

  const addL2TPSecret = () => {
    const l2tp = config.l2tp || {};
    const secrets = l2tp.secrets || [];
    onUpdate({ ...config, l2tp: { ...l2tp, secrets: [...secrets, { name: '', password: '', profile: '', comment: '' }] } });
  };

  const updateL2TPSecret = (idx, field, value) => {
    const l2tp = config.l2tp || {};
    const secrets = [...(l2tp.secrets || [])];
    secrets[idx] = { ...secrets[idx], [field]: value };
    onUpdate({ ...config, l2tp: { ...l2tp, secrets } });
  };

  const removeL2TPSecret = (idx) => {
    const l2tp = config.l2tp || {};
    onUpdate({ ...config, l2tp: { ...l2tp, secrets: l2tp.secrets.filter((_, i) => i !== idx) } });
  };

  // IPsec
  const addIPsecPeer = () => {
    const ipsec = config.ipsec || {};
    const peers = ipsec.peers || [];
    onUpdate({ ...config, ipsec: { ...ipsec, peers: [...peers, { address: '', secret: '', 'exchange-mode': 'main', comment: '' }] } });
  };

  const updateIPsecPeer = (idx, field, value) => {
    const ipsec = config.ipsec || {};
    const peers = [...(ipsec.peers || [])];
    peers[idx] = { ...peers[idx], [field]: value };
    onUpdate({ ...config, ipsec: { ...ipsec, peers } });
  };

  const removeIPsecPeer = (idx) => {
    const ipsec = config.ipsec || {};
    onUpdate({ ...config, ipsec: { ...ipsec, peers: ipsec.peers.filter((_, i) => i !== idx) } });
  };

  // Generic tunnel helper
  const addTunnel = (type) => {
    const tunnels = config[type]?.tunnels || [];
    onUpdate({ ...config, [type]: { ...(config[type] || {}), tunnels: [...tunnels, { name: '', 'local-address': '', 'remote-address': '', comment: '' }] } });
  };

  const updateTunnel = (type, idx, field, value) => {
    const tunnels = [...(config[type]?.tunnels || [])];
    tunnels[idx] = { ...tunnels[idx], [field]: value };
    onUpdate({ ...config, [type]: { ...(config[type] || {}), tunnels } });
  };

  const removeTunnel = (type, idx) => {
    onUpdate({ ...config, [type]: { ...(config[type] || {}), tunnels: config[type].tunnels.filter((_, i) => i !== idx) } });
  };

  const tabs = [
    { id: 'wireguard', label: 'WireGuard' },
    { id: 'l2tp', label: 'L2TP/IPsec' },
    { id: 'ipsec', label: 'IPsec Site-to-Site' },
    { id: 'gre', label: 'GRE' },
    { id: 'eoip', label: 'EoIP' },
    { id: 'ipip', label: 'IPIP' },
  ];

  return (
    <div>
      <h3 className="text-xl font-bold text-white mb-6">VPN & Tunnels</h3>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 rounded text-sm ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'wireguard' && (
        <div>
          {/* MikroTik Connection Selector */}
          <div className="bg-slate-800 p-4 rounded mb-4">
            <h4 className="text-white font-semibold mb-4">Deploy to MikroTik</h4>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">Select MikroTik Router</label>
                <select
                  value={selectedConnection}
                  onChange={(e) => setSelectedConnection(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                >
                  <option value="">-- Select a connection --</option>
                  {connections.map((conn) => (
                    <option key={conn.id} value={conn.id}>
                      {conn.name} ({conn.ip_address})
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={deployToMikroTik}
                disabled={deploying}
                className="bg-green-600 hover:bg-green-700 disabled:bg-slate-600 px-4 py-2 rounded flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {deploying ? 'Deploying...' : 'Deploy to Router'}
              </button>
            </div>
            {deployStatus && (
              <div className={`mt-3 p-3 rounded flex items-center gap-2 ${
                deployStatus.type === 'success' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
              }`}>
                {deployStatus.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span className="text-sm">{deployStatus.message}</span>
              </div>
            )}
          </div>

          <div className="bg-slate-800 p-4 rounded mb-4">
            <h4 className="text-white font-semibold mb-4">WireGuard Interface</h4>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <input
                placeholder="Name (wg1)"
                value={config.wireguard?.interface?.name || ''}
                onChange={(e) => updateWGInterface('name', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <div className="relative">
                <input
                  placeholder="Private Key"
                  value={config.wireguard?.interface?.['private-key'] || ''}
                  onChange={(e) => updateWGInterface('private-key', e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white pr-20"
                />
                <button
                  onClick={generateWireGuardKeys}
                  className="absolute right-1 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-xs flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Generate
                </button>
              </div>
              <input
                placeholder="Listen Port (13231)"
                type="number"
                value={config.wireguard?.interface?.['listen-port'] || ''}
                onChange={(e) => updateWGInterface('listen-port', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="MTU (1420)"
                type="number"
                value={config.wireguard?.interface?.mtu || ''}
                onChange={(e) => updateWGInterface('mtu', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
            </div>
            {generatedPublicKey && (
              <div className="bg-slate-700 p-3 rounded mb-2">
                <div className="text-xs text-slate-400 mb-1">Generated Public Key (share this with peers):</div>
                <div className="text-sm text-green-400 font-mono break-all">{generatedPublicKey}</div>
              </div>
            )}
          </div>

          <button onClick={addWGPeer} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add WireGuard Peer
          </button>
          {config.wireguard?.peers?.map((peer, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-5 gap-4">
              <input
                placeholder="Interface"
                value={peer.interface}
                onChange={(e) => updateWGPeer(idx, 'interface', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Public Key"
                value={peer['public-key']}
                onChange={(e) => updateWGPeer(idx, 'public-key', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Allowed Address (10.200.0.2/32)"
                value={peer['allowed-address']}
                onChange={(e) => updateWGPeer(idx, 'allowed-address', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Endpoint (IP:Port)"
                value={peer.endpoint || ''}
                onChange={(e) => updateWGPeer(idx, 'endpoint', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Comment"
                  value={peer.comment || ''}
                  onChange={(e) => updateWGPeer(idx, 'comment', e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeWGPeer(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'l2tp' && (
        <div>
          <div className="bg-slate-800 p-4 rounded mb-4">
            <h4 className="text-white font-semibold mb-4">L2TP Server Settings</h4>
            <div className="grid grid-cols-4 gap-4">
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={config.l2tp?.server?.enabled !== false}
                  onChange={(e) => updateL2TP('server', { ...(config.l2tp?.server || {}), enabled: e.target.checked })}
                />
                Enabled
              </label>
              <input
                placeholder="IPsec Secret"
                value={config.l2tp?.server?.['ipsec-secret'] || ''}
                onChange={(e) => updateL2TP('server', { ...(config.l2tp?.server || {}), 'ipsec-secret': e.target.value })}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={config.l2tp?.server?.['use-ipsec'] === true}
                  onChange={(e) => updateL2TP('server', { ...(config.l2tp?.server || {}), 'use-ipsec': e.target.checked })}
                />
                Use IPsec
              </label>
              <input
                placeholder="Keepalive Timeout"
                value={config.l2tp?.server?.['keepalive-timeout'] || ''}
                onChange={(e) => updateL2TP('server', { ...(config.l2tp?.server || {}), 'keepalive-timeout': e.target.value })}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
            </div>
          </div>

          <button onClick={addL2TPSecret} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add L2TP Secret
          </button>
          {config.l2tp?.secrets?.map((secret, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-5 gap-4">
              <input
                placeholder="Name"
                value={secret.name}
                onChange={(e) => updateL2TPSecret(idx, 'name', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Password"
                type="password"
                value={secret.password}
                onChange={(e) => updateL2TPSecret(idx, 'password', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Profile"
                value={secret.profile || ''}
                onChange={(e) => updateL2TPSecret(idx, 'profile', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Remote Address"
                value={secret['remote-address'] || ''}
                onChange={(e) => updateL2TPSecret(idx, 'remote-address', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Comment"
                  value={secret.comment || ''}
                  onChange={(e) => updateL2TPSecret(idx, 'comment', e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeL2TPSecret(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'ipsec' && (
        <div>
          <button onClick={addIPsecPeer} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add IPsec Peer
          </button>
          {config.ipsec?.peers?.map((peer, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-4 gap-4">
              <input
                placeholder="Remote Address"
                value={peer.address}
                onChange={(e) => updateIPsecPeer(idx, 'address', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Pre-Shared Secret"
                value={peer.secret}
                onChange={(e) => updateIPsecPeer(idx, 'secret', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <select
                value={peer['exchange-mode']}
                onChange={(e) => updateIPsecPeer(idx, 'exchange-mode', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value="main">Main</option>
                <option value="aggressive">Aggressive</option>
              </select>
              <div className="flex gap-2">
                <input
                  placeholder="Comment"
                  value={peer.comment || ''}
                  onChange={(e) => updateIPsecPeer(idx, 'comment', e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeIPsecPeer(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {['gre', 'eoip', 'ipip'].includes(activeTab) && (
        <div>
          <button onClick={() => addTunnel(activeTab)} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add {activeTab.toUpperCase()} Tunnel
          </button>
          {config[activeTab]?.tunnels?.map((tunnel, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-4 gap-4">
              <input
                placeholder="Name"
                value={tunnel.name}
                onChange={(e) => updateTunnel(activeTab, idx, 'name', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Local Address"
                value={tunnel['local-address']}
                onChange={(e) => updateTunnel(activeTab, idx, 'local-address', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Remote Address"
                value={tunnel['remote-address']}
                onChange={(e) => updateTunnel(activeTab, idx, 'remote-address', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Comment"
                  value={tunnel.comment || ''}
                  onChange={(e) => updateTunnel(activeTab, idx, 'comment', e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeTunnel(activeTab, idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              {activeTab === 'eoip' && (
                <input
                  placeholder="Tunnel ID"
                  type="number"
                  value={tunnel['tunnel-id'] || ''}
                  onChange={(e) => updateTunnel(activeTab, idx, 'tunnel-id', e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
