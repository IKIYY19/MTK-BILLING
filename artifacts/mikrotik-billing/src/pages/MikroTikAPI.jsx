import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Server, TestTube, Trash2, Wifi, WifiOff, Clock, RefreshCw, Users, Download, X, Check, Pencil, Shield, ArrowRightLeft, Globe, Cable, Lock, TriangleAlert as AlertTriangle, Stethoscope, ChevronDown, ChevronUp, Copy, BookOpen } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { getToken } from '../lib/auth';

const API = import.meta.env.VITE_API_URL || '/api';

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const DIAGNOSTIC_TIMEOUT = 15000;

const REMOTE_PROFILES = [
  {
    id: 'secure-api-ssl',
    label: 'Secure API (SSL)',
    icon: Shield,
    summary: 'Use when API-SSL is enabled on the router for encrypted communication on port 8729.',
    connectionType: 'api-ssl',
    defaults: { api_port: 8729, ssh_port: 22, use_tunnel: false },
        checklist: ['Enable api-ssl on the router (/ip service enable api-ssl)', 'Allow TCP 8729 from your billing server IP', 'Uses TLS encryption for all API traffic'],
  },
  {
    id: 'direct-api',
    label: 'Direct API',
    icon: Globe,
    summary: 'Best when the router has a reachable static IP and API access is allowed.',
    connectionType: 'api',
    defaults: { api_port: 8728, ssh_port: 22, use_tunnel: false },
    checklist: ['Allow TCP 8728 from your billing server IP', 'Restrict firewall to trusted management IPs', 'Use a dedicated read/write API account'],
  },
  {
    id: 'vpn-api',
    label: 'VPN / Private API',
    icon: Shield,
    summary: 'Best when routers are behind NAT but reachable over WireGuard, IPsec, or another site VPN.',
    connectionType: 'api',
    defaults: { api_port: 8728, ssh_port: 22, use_tunnel: false },
    checklist: ['Use the router VPN IP, not the public address', 'Confirm the billing server can ping the router VPN IP', 'Keep API closed on the public WAN'],
  },
  {
    id: 'direct-ssh',
    label: 'Direct SSH',
    icon: Cable,
    summary: 'Good fallback for routers where API is disabled or RouterOS API access is unreliable.',
    connectionType: 'ssh',
    defaults: { api_port: 8728, ssh_port: 22, use_tunnel: false },
    checklist: ['Allow TCP 22 from your billing server IP', 'Use a restricted automation account', 'Prefer SSH only when API is not viable'],
  },
  {
    id: 'jump-host',
    label: 'Jump Host / Tunnel',
    icon: Lock,
    summary: 'Use when the router is only reachable through a remote Linux/Windows jump server.',
    connectionType: 'ssh',
    defaults: { api_port: 8728, ssh_port: 22, use_tunnel: true, tunnel_port: 22 },
    checklist: ['Confirm the jump host can reach the router LAN IP', 'Store separate jump-host credentials', 'Use VPN if possible because jump-host support is still basic'],
  },
];

const emptyForm = {
  name: '',
  ip_address: '',
  api_port: 8728,
  ssh_port: 22,
  username: '',
  password: '',
  use_tunnel: false,
  tunnel_host: '',
  tunnel_port: 22,
  tunnel_username: '',
  tunnel_password: '',
};

function formatLastSeen(date) {
  if (!date) {return 'Never';}
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {return 'Just now';}
  if (diffMins < 60) {return `${diffMins}m ago`;}
  if (diffHours < 24) {return `${diffHours}h ago`;}
  return `${diffDays}d ago`;
}

const ROUTER_SETUP_GUIDES = {
  api: {
    title: 'Enable MikroTik API Access',
    steps: [
      { label: 'Open WinBox or terminal', command: null, detail: 'Connect to your MikroTik router via WinBox, SSH, or serial console.' },
      { label: 'Enable the API service', command: '/ip service enable api', detail: 'Enables RouterOS API on the default port 8728.' },
      { label: 'Restrict API to billing server', command: '/ip service set api address=<billing-server-ip>/32', detail: 'Restrict API access to only the billing server IP for security.' },
      { label: 'Create a dedicated API user', command: '/user add name=api-billing group=full password=<strong-password>', detail: 'Use a dedicated user with full permissions.' },
      { label: 'Allow API port in firewall', command: '/ip firewall filter add chain=input protocol=tcp dst-port=8728 src-address=<billing-server-ip> action=accept', detail: 'Add this rule before any drop/reject rules.' },
      { label: 'Verify the service is running', command: '/ip service print', detail: 'You should see "api" listed with port 8728 and status "running".' },
    ],
  },
  'api-ssl': {
    title: 'Enable MikroTik API-SSL Access',
    steps: [
      { label: 'Open WinBox or terminal', command: null, detail: 'Connect to your MikroTik router via WinBox, SSH, or serial console.' },
      { label: 'Generate or import a certificate', command: '/certificate add name=api-cert common-name=<router-ip> days-valid=3650', detail: 'For production, use a CA-signed certificate. For internal use, self-signed works.' },
      { label: 'Enable the API-SSL service', command: '/ip service enable api-ssl', detail: 'Enables RouterOS encrypted API on port 8729.' },
      { label: 'Set API-SSL certificate', command: '/ip service set api-ssl certificate=api-cert', detail: 'Associate the certificate with the API-SSL service.' },
      { label: 'Restrict API-SSL to billing server', command: '/ip service set api-ssl address=<billing-server-ip>/32', detail: 'Restrict access to only the billing server IP.' },
      { label: 'Create a dedicated API user', command: '/user add name=api-billing group=full password=<strong-password>', detail: 'Use a dedicated user with full permissions.' },
      { label: 'Allow API-SSL port in firewall', command: '/ip firewall filter add chain=input protocol=tcp dst-port=8729 src-address=<billing-server-ip> action=accept', detail: 'Add this rule before any drop/reject rules.' },
      { label: 'Verify the service is running', command: '/ip service print', detail: 'You should see "api-ssl" listed with port 8729 and status "running".' },
    ],
  },
  ssh: {
    title: 'Enable MikroTik SSH Access',
    steps: [
      { label: 'Open WinBox or terminal', command: null, detail: 'Connect to your MikroTik router via WinBox, SSH, or serial console.' },
      { label: 'Enable the SSH service', command: '/ip service enable ssh', detail: 'Enables SSH on the default port 22.' },
      { label: 'Restrict SSH to trusted IPs', command: '/ip service set ssh address=<billing-server-ip>/32', detail: 'Restrict SSH access to only the billing server IP.' },
      { label: 'Create a dedicated SSH user', command: '/user add name=ssh-billing group=full password=<strong-password>', detail: 'Use a dedicated user with full permissions.' },
      { label: 'Allow SSH port in firewall', command: '/ip firewall filter add chain=input protocol=tcp dst-port=22 src-address=<billing-server-ip> action=accept', detail: 'Add this rule before any drop/reject rules.' },
      { label: 'Verify the service is running', command: '/ip service print', detail: 'You should see "ssh" listed with port 22 and status "running".' },
    ],
  },
};

export function MikroTikAPI() {
  const toast = useToast();
  const [connections, setConnections] = useState([]);
  const [plans, setPlans] = useState([]);
  const [remoteProfile, setRemoteProfile] = useState('direct-api');
  const [connectionType, setConnectionType] = useState('api');
  const [formData, setFormData] = useState(emptyForm);
  const [testResult, setTestResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingConnectionId, setEditingConnectionId] = useState('');

  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [userType, setUserType] = useState('ppp');
  const [selectedImportPlanId, setSelectedImportPlanId] = useState('');
  const [importBillingCycle, setImportBillingCycle] = useState('monthly');
  const [scanningUsers, setScanningUsers] = useState(false);
  const [foundUsers, setFoundUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [diagnosingId, setDiagnosingId] = useState(null);
  const [diagnosticResult, setDiagnosticResult] = useState(null);

  const activeProfile = useMemo(
    () => REMOTE_PROFILES.find((profile) => profile.id === remoteProfile) || REMOTE_PROFILES[0],
    [remoteProfile]
  );

  const fetchConnections = async () => {
    try {
      const { data } = await axios.get(`${API}/mikrotik`, { headers: authHeaders() });
      setConnections(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('Failed to load MikroTik connections', error.response?.data?.error || error.message);
    }
  };

  const fetchPlans = async () => {
    try {
      const { data } = await axios.get(`${API}/billing/plans`, { headers: authHeaders() });
      setPlans(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('Failed to load billing plans', error.response?.data?.error || error.message);
    }
  };

  useEffect(() => {
    fetchConnections();
    fetchPlans();
  }, []);

  useEffect(() => {
    if (!editingConnectionId) {
      setConnectionType(activeProfile.connectionType);
      setFormData((current) => ({
        ...current,
        ...activeProfile.defaults,
      }));
      setTestResult(null);
    }
  }, [activeProfile, editingConnectionId]);

  const payload = {
    ...formData,
    connection_type: connectionType,
    api_port: Number(formData.api_port || 8728),
    ssh_port: Number(formData.ssh_port || 22),
    tunnel_port: Number(formData.tunnel_port || 22),
  };

  const remoteWarnings = useMemo(() => {
    const warnings = [];
    if (!formData.ip_address) {warnings.push('Router host/IP is missing.');}
    if (!formData.username || (!editingConnectionId && !formData.password)) {warnings.push('Router login credentials are incomplete.');}
    if (connectionType === 'ssh' && formData.use_tunnel && !formData.tunnel_host) {warnings.push('Jump-host mode needs a tunnel host.');}
    if (remoteProfile === 'jump-host') {warnings.push('Current backend tunnel support is limited, so VPN is still safer for production remote linking.');}
    return warnings;
  }, [connectionType, editingConnectionId, formData, remoteProfile]);

  const handleTest = async () => {
    setLoading(true);
    setTestResult(null);
    try {
      const { data } = await axios.post(`${API}/mikrotik/test`, payload, { headers: authHeaders(), timeout: DIAGNOSTIC_TIMEOUT });
      setTestResult(data);
      if (data.success) {toast.success('Connection test passed', data.message || 'Router responded successfully');}
      else {toast.error('Connection test failed', data.message || 'Router did not respond');}
    } catch (error) {
      const result = { success: false, message: error.response?.data?.error || error.message };
      setTestResult(result);
      toast.error('Connection test failed', result.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingConnectionId('');
    setRemoteProfile('direct-api');
    setConnectionType('api');
    setFormData({ ...emptyForm });
    setTestResult(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = editingConnectionId
        ? await axios.put(`${API}/mikrotik/${editingConnectionId}`, payload, { headers: authHeaders() })
        : await axios.post(`${API}/mikrotik`, payload, { headers: authHeaders() });

      setConnections((current) => editingConnectionId
        ? current.map((connection) => connection.id === editingConnectionId ? data : connection)
        : [...current, data]);

      resetForm();
      setTestResult({ success: true, message: editingConnectionId ? 'Connection updated successfully' : 'Connection saved successfully' });
      toast.success(editingConnectionId ? 'Connection updated' : 'Connection saved', 'Router connection is now available across billing and network tools');
    } catch (error) {
      const result = { success: false, message: error.response?.data?.error || error.message };
      setTestResult(result);
      toast.error(editingConnectionId ? 'Failed to update connection' : 'Failed to save connection', result.message);
    } finally {
      setSaving(false);
    }
  };

  const inferRemoteProfile = (connection) => {
    if (connection.connection_type === 'ssh' && connection.use_tunnel) {return 'jump-host';}
    if (connection.connection_type === 'ssh') {return 'direct-ssh';}
    if (connection.connection_type === 'api' && /^10\.|^172\.1[6-9]\.|^172\.2\d\.|^172\.3[0-1]\.|^192\.168\./.test(connection.ip_address || '')) {
      return 'vpn-api';
    }
    return 'direct-api';
  };

  const startEditingConnection = (connection) => {
    setEditingConnectionId(connection.id);
    setRemoteProfile(inferRemoteProfile(connection));
    setConnectionType(connection.connection_type || 'api');
    setFormData({
      ...emptyForm,
      name: connection.name || '',
      ip_address: connection.ip_address || '',
      api_port: connection.api_port || 8728,
      ssh_port: connection.ssh_port || 22,
      username: connection.username || '',
      password: '',
      use_tunnel: Boolean(connection.use_tunnel),
      tunnel_host: connection.tunnel_host || '',
      tunnel_port: connection.tunnel_port || 22,
      tunnel_username: connection.tunnel_username || '',
      tunnel_password: '',
    });
    setTestResult(null);
  };

  const checkConnection = async (connectionId) => {
    try {
      await axios.post(`${API}/mikrotik/${connectionId}/check`, {}, {
        headers: authHeaders(),
      });
      await fetchConnections();
      toast.success('Connection check complete', 'Router status has been refreshed');
    } catch (error) {
      toast.error('Failed to check router', error.response?.data?.error || error.message);
    }
  };

  const handleDiagnose = async (connectionId) => {
    setDiagnosingId(connectionId);
    setDiagnosticResult(null);
    try {
      const { data } = await axios.post(`${API}/mikrotik/${connectionId}/diagnose`, {}, {
        headers: authHeaders(),
        timeout: DIAGNOSTIC_TIMEOUT,
      });
      setDiagnosticResult(data);
      await fetchConnections();
      if (data.success) {
        toast.success('Connection healthy', 'Router responded successfully');
      } else {
        toast.error('Connection problem detected', data.message || 'See diagnosis for details');
      }
    } catch (error) {
      const result = { success: false, message: error.response?.data?.error || error.message, diagnosis: { category: 'unknown', title: 'Diagnosis failed', description: error.message, fixes: ['Check that the backend server is running', 'Verify the connection ID is valid'] } };
      setDiagnosticResult(result);
      toast.error('Diagnosis failed', error.response?.data?.error || error.message);
    } finally {
      setDiagnosingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this connection?')) {return;}
    try {
      await axios.delete(`${API}/mikrotik/${id}`, { headers: authHeaders() });
      setConnections((current) => current.filter((connection) => connection.id !== id));
      if (editingConnectionId === id) {resetForm();}
      toast.success('Connection deleted', 'The MikroTik connection has been removed');
    } catch (error) {
      toast.error('Failed to delete connection', error.response?.data?.error || error.message);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success('Copied', 'Command copied to clipboard'),
      () => {},
    );
  };

  const activeSetupGuide = ROUTER_SETUP_GUIDES[connectionType === 'ssh' ? 'ssh' : (connectionType === 'api-ssl' ? 'api-ssl' : 'api')];

  const handleScanUsers = async (connection) => {
    setSelectedConnection(connection);
    setScanningUsers(true);
    setFoundUsers([]);
    setSelectedUsers(new Set());
    setImportResult(null);

    try {
      const endpoint = userType === 'ppp' ? `/mikrotik/${connection.id}/ppp-secrets` : `/mikrotik/${connection.id}/hotspot-users`;
      const { data } = await axios.get(`${API}${endpoint}`, { headers: authHeaders() });
      setFoundUsers(data.users || []);
      setShowImportModal(true);
    } catch (error) {
      toast.error('Failed to scan router users', error.response?.data?.error || error.message);
    } finally {
      setScanningUsers(false);
    }
  };

  const toggleUserSelection = (userName) => {
    const next = new Set(selectedUsers);
    if (next.has(userName)) {next.delete(userName);}
    else {next.add(userName);}
    setSelectedUsers(next);
  };

  const selectAllUsers = () => setSelectedUsers(new Set(foundUsers.map((user) => user.name)));
  const deselectAllUsers = () => setSelectedUsers(new Set());

  const handleImportUsers = async () => {
    if (selectedUsers.size === 0) {
      toast.warning('No users selected', 'Choose at least one router user to import');
      return;
    }

    setImporting(true);
    setImportResult(null);

    try {
      const usersToImport = foundUsers.filter((user) => selectedUsers.has(user.name));
      const { data } = await axios.post(`${API}/mikrotik/${selectedConnection.id}/import-users`, {
        users: usersToImport,
        userType,
        plan_id: userType === 'ppp' ? selectedImportPlanId : null,
        billing_cycle: importBillingCycle,
      }, { headers: authHeaders() });
      setImportResult(data);
      if (data.imported > 0) {toast.success('Import finished', `Imported ${data.imported} router users into billing`);}
      else {toast.warning('Nothing imported', 'Every selected user was skipped or failed');}
    } catch (error) {
      toast.error('Failed to import users', error.response?.data?.error || error.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="mb-2 text-2xl font-bold text-white">Remote MikroTik Linking Wizard</h2>
          <p className="text-slate-400">Choose the right remote access pattern, test it, then save a router connection the billing system can actually use.</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2">
            <div className="text-xs text-slate-400">Total</div>
            <div className="text-xl font-bold text-white">{connections.length}</div>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2">
            <div className="text-xs text-slate-400">Online</div>
            <div className="text-xl font-bold text-emerald-400">{connections.filter((connection) => connection.is_online).length}</div>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2">
            <div className="text-xs text-slate-400">Offline</div>
            <div className="text-xl font-bold text-red-400">{connections.filter((connection) => !connection.is_online).length}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1.2fr_0.8fr_1fr]">
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
          <div className="mb-5">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
              <ArrowRightLeft className="h-5 w-5" />
              1. Pick Remote Access Pattern
            </h3>
            <p className="mt-1 text-sm text-slate-400">This sets the safest default for how the billing platform should reach the router.</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {REMOTE_PROFILES.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => setRemoteProfile(profile.id)}
                className={`rounded-xl border p-4 text-left transition ${
                  remoteProfile === profile.id ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700 bg-slate-900/40 hover:border-slate-600'
                }`}
              >
                <profile.icon className={`mb-3 h-6 w-6 ${remoteProfile === profile.id ? 'text-blue-400' : 'text-slate-400'}`} />
                <div className="font-semibold text-white">{profile.label}</div>
                <div className="mt-1 text-sm text-slate-400">{profile.summary}</div>
              </button>
            ))}
          </div>

          <form onSubmit={handleSave} className="mt-6">
            <div className="mb-4">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
                <Server className="h-5 w-5" />
                2. Router Connection Details
              </h3>
              <p className="mt-1 text-sm text-slate-400">These credentials are reused by billing subscriptions, PPPoE management, hotspot tools, and the reconcile screen.</p>
            </div>

            {editingConnectionId && (
              <div className="mb-4 rounded border border-blue-500/40 bg-blue-500/10 p-3 text-sm text-blue-200">
                You are editing an existing router connection. Leave password fields empty if you want to keep the saved secret.
              </div>
            )}

            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-slate-300">Connection Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-white"
                    placeholder="e.g., Nairobi POP Core"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm text-slate-300">Connection Engine</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setConnectionType('api')} className={`rounded px-4 py-2 text-sm ${connectionType === 'api' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}>API</button>
                    <button type="button" onClick={() => setConnectionType('ssh')} className={`rounded px-4 py-2 text-sm ${connectionType === 'ssh' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}>SSH</button>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-slate-300">Router Host / IP</label>
                  <input
                    type="text"
                    value={formData.ip_address}
                    onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                    className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-white"
                    placeholder={remoteProfile === 'vpn-api' ? '10.x.x.x or 172.16.x.x over VPN' : '192.168.88.1'}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm text-slate-300">{connectionType === 'api' ? 'API Port' : 'SSH Port'}</label>
                  <input
                    type="number"
                    value={connectionType === 'api' ? formData.api_port : formData.ssh_port}
                    onChange={(e) => setFormData(connectionType === 'api' ? { ...formData, api_port: e.target.value } : { ...formData, ssh_port: e.target.value })}
                    className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-white"
                    placeholder={connectionType === 'api' ? '8728' : '22'}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-slate-300">Username</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-white"
                    placeholder="automation-user"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm text-slate-300">Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-white"
                    placeholder={editingConnectionId ? 'Leave blank to keep saved password' : 'Router password'}
                  />
                </div>
              </div>

              {connectionType === 'ssh' && (
                <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <input id="use_tunnel" type="checkbox" checked={formData.use_tunnel} onChange={(e) => setFormData({ ...formData, use_tunnel: e.target.checked })} />
                    <label htmlFor="use_tunnel" className="text-sm text-slate-300">Connect through a jump host / tunnel</label>
                  </div>

                  {formData.use_tunnel && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs text-slate-400">Jump Host</label>
                        <input type="text" value={formData.tunnel_host} onChange={(e) => setFormData({ ...formData, tunnel_host: e.target.value })} className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white" placeholder="jump-host.example.com" />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs text-slate-400">Jump Host Port</label>
                        <input type="number" value={formData.tunnel_port} onChange={(e) => setFormData({ ...formData, tunnel_port: e.target.value })} className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white" placeholder="22" />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs text-slate-400">Jump Host Username</label>
                        <input type="text" value={formData.tunnel_username} onChange={(e) => setFormData({ ...formData, tunnel_username: e.target.value })} className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white" placeholder="ubuntu" />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs text-slate-400">Jump Host Password</label>
                        <input type="password" value={formData.tunnel_password} onChange={(e) => setFormData({ ...formData, tunnel_password: e.target.value })} className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white" placeholder={editingConnectionId ? 'Leave blank to keep saved tunnel password' : ''} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button type="button" onClick={handleTest} disabled={loading} className="flex-1 rounded-lg bg-yellow-600 px-4 py-2 text-white hover:bg-yellow-700 disabled:opacity-50">
                <span className="flex items-center justify-center gap-2">
                  <TestTube className="h-4 w-4" />
                  {loading ? 'Testing...' : 'Test Connection'}
                </span>
              </button>
              <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? (editingConnectionId ? 'Updating...' : 'Saving...') : (editingConnectionId ? 'Update Connection' : 'Save Connection')}
              </button>
            </div>

            {editingConnectionId && (
              <button type="button" onClick={resetForm} className="mt-3 w-full rounded-lg bg-slate-700 px-4 py-2 text-white hover:bg-slate-600">
                Cancel Editing
              </button>
            )}

            {testResult && (
              <div className={`mt-4 rounded-lg p-4 ${testResult.success ? 'bg-emerald-600/20 border border-emerald-500/40' : 'bg-red-600/20 border border-red-500/40'}`}>
                <div className={`text-sm font-medium ${testResult.success ? 'text-emerald-300' : 'text-red-300'}`}>
                  {testResult.message}
                </div>
                {testResult.diagnostics && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Diagnostic Steps</div>
                    {testResult.diagnostics.steps?.map((step, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={`inline-block h-2 w-2 rounded-full ${step.status === 'passed' ? 'bg-emerald-400' : step.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                        <span className="text-slate-300">{step.step}: </span>
                        <span className={step.status === 'passed' ? 'text-emerald-400' : 'text-red-400'}>{step.detail || step.status}</span>
                      </div>
                    ))}
                    {testResult.diagnostics.elapsed_ms && (
                      <div className="text-xs text-slate-500">Completed in {testResult.diagnostics.elapsed_ms}ms</div>
                    )}
                  </div>
                )}
                {testResult.diagnosis && (
                  <div className="mt-3 rounded border border-slate-700 bg-slate-800/60 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-amber-300">
                      <AlertTriangle className="h-4 w-4" />
                      {testResult.diagnosis.title}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{testResult.diagnosis.description}</p>
                    {testResult.diagnosis.fixes?.length > 0 && (
                      <div className="mt-2">
                        <div className="text-xs font-medium text-slate-300">Suggested fixes:</div>
                        <ul className="mt-1 space-y-1">
                          {testResult.diagnosis.fixes.map((fix, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                              <Check className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-400" />
                              <span>{fix}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </form>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">3. Remote Setup Checklist</h3>
            <div className="space-y-3">
              {activeProfile.checklist.map((item) => (
                <div key={item} className="flex items-start gap-3 text-sm text-slate-300">
                  <Check className="mt-0.5 h-4 w-4 text-emerald-400" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">Wizard Notes</h3>
            <div className="space-y-3 text-sm text-slate-300">
              <div>
                <div className="font-medium text-white">Recommended profile</div>
                <div className="mt-1 text-slate-400">{activeProfile.summary}</div>
              </div>
              <div>
                <div className="font-medium text-white">Billing impact</div>
                <div className="mt-1 text-slate-400">Saved connections are reused by subscriptions, PPPoE management, hotspot tools, and the reconcile screen.</div>
              </div>
              {remoteWarnings.length > 0 && (
                <div>
                  <div className="font-medium text-amber-300">Warnings</div>
                  <ul className="mt-2 space-y-2 text-amber-200">
                    {remoteWarnings.map((warning) => (
                      <li key={warning}>- {warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
            <button
              type="button"
              onClick={() => setShowSetupGuide(!showSetupGuide)}
              className="flex w-full items-center justify-between text-lg font-semibold text-white"
            >
              <span className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Router Setup Guide
              </span>
              {showSetupGuide ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
            </button>

            {showSetupGuide && (
              <div className="mt-4">
                <h4 className="mb-3 text-sm font-medium text-blue-300">{activeSetupGuide.title}</h4>
                <div className="space-y-3">
                  {activeSetupGuide.steps.map((step, i) => (
                    <div key={i} className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                      <div className="flex items-start gap-3">
                        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600/30 text-xs font-bold text-blue-300">{i + 1}</span>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-white">{step.label}</div>
                          {step.command && (
                            <div className="mt-1 flex items-center gap-2">
                              <code className="flex-1 rounded bg-slate-900 px-2 py-1 font-mono text-xs text-emerald-400 break-all">{step.command}</code>
                              <button type="button" onClick={() => copyToClipboard(step.command)} className="flex-shrink-0 rounded p-1 text-slate-400 hover:text-white" title="Copy command">
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                          {step.detail && <p className="mt-1 text-xs text-slate-400">{step.detail}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Saved Connections</h3>
            <button onClick={fetchConnections} className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>

          {connections.length === 0 ? (
            <div className="py-12 text-center">
              <Server className="mx-auto mb-4 h-12 w-12 text-slate-600" />
              <p className="text-slate-400">No connections configured yet</p>
              <p className="mt-1 text-sm text-slate-500">Save a router connection here, then link it from billing subscriptions.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {connections.map((connection) => (
                <div key={connection.id} className={`rounded-lg border-l-4 bg-slate-700 p-4 ${connection.is_online ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-2">
                        <h4 className="font-semibold text-white">{connection.name}</h4>
                        {connection.is_online ? (
                          <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-1 text-xs font-medium text-emerald-400">
                            <Wifi className="h-3 w-3" />
                            Online
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-1 text-xs font-medium text-red-400">
                            <WifiOff className="h-3 w-3" />
                            Offline
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-slate-400">Host: </span>
                          <span className="text-white">{connection.ip_address}:{connection.connection_type === 'ssh' ? connection.ssh_port : connection.api_port}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Engine: </span>
                          <span className="text-white uppercase">{connection.connection_type || 'api'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">User: </span>
                          <span className="text-white">{connection.username}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-500" />
                          <span className="text-slate-400">Last seen: </span>
                          <span className="text-white">{formatLastSeen(connection.last_seen)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleDiagnose(connection.id)} disabled={diagnosingId === connection.id} className="rounded-lg bg-amber-600/20 p-2 text-amber-400 transition-colors hover:bg-amber-600/30 disabled:opacity-50" title="Run full diagnostics">
                        {diagnosingId === connection.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
                      </button>
                      <button onClick={() => handleScanUsers(connection)} disabled={scanningUsers} className="rounded-lg bg-emerald-600/20 p-2 text-emerald-400 transition-colors hover:bg-emerald-600/30 disabled:opacity-50" title="Scan for users">
                        <Users className="h-4 w-4" />
                      </button>
                      <button onClick={() => startEditingConnection(connection)} className="rounded-lg bg-slate-600/50 p-2 text-slate-200 transition-colors hover:bg-slate-600" title="Edit connection">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => checkConnection(connection.id)} className="rounded-lg bg-blue-600/20 p-2 text-blue-400 transition-colors hover:bg-blue-600/30" title="Check connectivity">
                        <RefreshCw className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(connection.id)} className="rounded-lg bg-red-600/20 p-2 text-red-400 transition-colors hover:bg-red-600/30" title="Delete connection">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 rounded border border-yellow-600/50 bg-yellow-600/20 p-4">
            <h4 className="mb-2 font-semibold text-yellow-400">Production Reminder</h4>
            <p className="text-sm text-yellow-200">
              Save only management paths you actually trust. For many remote routers, VPN + API or RADIUS-centered control is still safer than exposing SSH/API broadly on the public internet.
            </p>
          </div>

          {diagnosticResult && (
            <div className={`mt-4 rounded-lg border p-4 ${diagnosticResult.success ? 'border-emerald-500/40 bg-emerald-600/10' : 'border-red-500/40 bg-red-600/10'}`}>
              <h4 className="flex items-center gap-2 font-semibold text-white">
                <Stethoscope className="h-5 w-5" />
                Diagnostic Report
                {diagnosticResult.diagnostics?.connection?.name && (
                  <span className="text-slate-400">- {diagnosticResult.diagnostics.connection.name}</span>
                )}
              </h4>

              {diagnosticResult.diagnostics?.steps && (
                <div className="mt-3 space-y-2">
                  {diagnosticResult.diagnostics.steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${step.status === 'passed' ? 'bg-emerald-400' : step.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                      <span className="text-slate-300 font-medium">{step.step}:</span>
                      <span className={step.status === 'passed' ? 'text-emerald-400' : 'text-red-400'}>{step.detail || step.status}</span>
                    </div>
                  ))}
                  {diagnosticResult.diagnostics.elapsed_ms && (
                    <div className="text-xs text-slate-500">Completed in {diagnosticResult.diagnostics.elapsed_ms}ms</div>
                  )}
                </div>
              )}

              {diagnosticResult.diagnosis && (
                <div className="mt-3 rounded border border-slate-700 bg-slate-800/80 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    {diagnosticResult.diagnosis.title}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{diagnosticResult.diagnosis.description}</p>
                  {diagnosticResult.diagnosis.fixes?.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      <div className="text-xs font-medium text-slate-300">How to fix:</div>
                      {diagnosticResult.diagnosis.fixes.map((fix, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                          <Check className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-400" />
                          <span>{fix}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button type="button" onClick={() => setDiagnosticResult(null)} className="mt-3 text-xs text-slate-400 hover:text-white">
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[80vh] w-full max-w-4xl overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
            <div className="border-b border-slate-700 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-xl font-semibold text-white">
                  <Users className="h-5 w-5" />
                  Import Users from {selectedConnection?.name}
                </h3>
                <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-300">User Type:</label>
                  <select value={userType} onChange={(e) => setUserType(e.target.value)} className="rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-white">
                    <option value="ppp">PPP Secrets</option>
                    <option value="hotspot">Hotspot Users</option>
                  </select>
                </div>
                {userType === 'ppp' && (
                  <>
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-300">Plan:</label>
                      <select value={selectedImportPlanId} onChange={(e) => setSelectedImportPlanId(e.target.value)} className="rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-white">
                        <option value="">Select billing plan</option>
                        {plans.map((plan) => (
                          <option key={plan.id} value={plan.id}>{plan.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-300">Cycle:</label>
                      <select value={importBillingCycle} onChange={(e) => setImportBillingCycle(e.target.value)} className="rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-white">
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </div>
                  </>
                )}
                <button onClick={() => handleScanUsers(selectedConnection)} disabled={scanningUsers} className="flex items-center gap-2 rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                  <RefreshCw className={`h-4 w-4 ${scanningUsers ? 'animate-spin' : ''}`} />
                  Scan
                </button>
              </div>
            </div>

            <div className="max-h-[50vh] overflow-y-auto p-6">
              {scanningUsers ? (
                <div className="py-8 text-center">
                  <RefreshCw className="mx-auto mb-2 h-8 w-8 animate-spin text-blue-400" />
                  <p className="text-slate-400">Scanning for users...</p>
                </div>
              ) : foundUsers.length === 0 ? (
                <div className="py-8 text-center">
                  <Users className="mx-auto mb-2 h-12 w-12 text-slate-600" />
                  <p className="text-slate-400">No users found</p>
                </div>
              ) : (
                <>
                  {userType === 'ppp' && !selectedImportPlanId && (
                    <div className="mb-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                      Pick a billing plan before importing PPP users so the wizard can create subscriptions, not just customer records.
                    </div>
                  )}
                  {userType === 'hotspot' && (
                    <div className="mb-4 rounded border border-sky-500/40 bg-sky-500/10 p-3 text-sm text-sky-200">
                      Hotspot imports currently create billing customers with import notes. PPP subscriptions are only created for PPP user imports.
                    </div>
                  )}

                  <div className="mb-4 flex items-center justify-between">
                    <div className="text-sm text-slate-400">Found {foundUsers.length} users • {selectedUsers.size} selected</div>
                    <div className="flex gap-2">
                      <button onClick={selectAllUsers} className="text-sm text-blue-400 hover:text-blue-300">Select All</button>
                      <button onClick={deselectAllUsers} className="text-sm text-slate-400 hover:text-slate-300">Deselect All</button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {foundUsers.map((user) => (
                      <div
                        key={user.name}
                        onClick={() => toggleUserSelection(user.name)}
                        className={`cursor-pointer rounded-lg border p-4 transition-colors ${selectedUsers.has(user.name) ? 'border-blue-500 bg-blue-600/20' : 'border-slate-600 bg-slate-700 hover:border-slate-500'}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-5 w-5 items-center justify-center rounded border ${selectedUsers.has(user.name) ? 'border-blue-500 bg-blue-500' : 'border-slate-500'}`}>
                              {selectedUsers.has(user.name) && <Check className="h-3 w-3 text-white" />}
                            </div>
                            <div>
                              <div className="font-medium text-white">{user.name}</div>
                              <div className="text-sm text-slate-400">
                                {user.profile && `Profile: ${user.profile}`}
                                {user.comment && ` • ${user.comment}`}
                              </div>
                            </div>
                          </div>
                          {user.disabled && <span className="rounded bg-red-500/20 px-2 py-1 text-xs text-red-400">Disabled</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {importResult && (
              <div className={`border-t border-slate-700 p-4 ${importResult.imported > 0 ? 'bg-green-600/10' : 'bg-red-600/10'}`}>
                <div className="text-sm">
                  <span className={`font-medium ${importResult.imported > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {importResult.imported} users imported successfully
                  </span>
                  {importResult.errors > 0 && <span className="ml-2 text-red-400">({importResult.errors} failed)</span>}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 border-t border-slate-700 p-6">
              <button onClick={() => setShowImportModal(false)} className="rounded-lg bg-slate-700 px-4 py-2 text-white hover:bg-slate-600">
                Cancel
              </button>
              <button
                onClick={handleImportUsers}
                disabled={importing || selectedUsers.size === 0 || (userType === 'ppp' && !selectedImportPlanId)}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {importing ? 'Importing...' : `Import ${selectedUsers.size} Users`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
