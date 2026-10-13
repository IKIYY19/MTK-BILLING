import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { RefreshCw, ShieldCheck, AlertTriangle, Unplug, Wrench, Router, WifiOff } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

const API = import.meta.env.VITE_API_URL || '/api';

function Stat({ label, value, tone = 'text-white' }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
      <div className={`text-2xl font-semibold ${tone}`}>{value}</div>
      <div className="mt-1 text-sm text-zinc-400">{label}</div>
    </div>
  );
}

export function BillingReconcile() {
  const toast = useToast();
  const [connections, setConnections] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState('');
  const [loading, setLoading] = useState(true);
  const [reconcilingId, setReconcilingId] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importingKey, setImportingKey] = useState('');
  const [importForm, setImportForm] = useState({
    connection_id: '',
    pppoe_username: '',
    customer_id: '',
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    plan_id: '',
    billing_cycle: 'monthly',
  });
  const [data, setData] = useState({
    summary: {
      total_subscriptions: 0,
      healthy_subscriptions: 0,
      drifted_subscriptions: 0,
      orphan_secrets: 0,
      connection_errors: 0,
    },
    subscriptions: [],
    orphan_secrets: [],
    connection_errors: [],
  });

  const loadConnections = async () => {
    try {
      const response = await axios.get(`${API}/mikrotik`);
      setConnections(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      toast.error('Failed to load MikroTik connections', error.response?.data?.error || error.message);
    }
  };

  const loadReferenceData = async () => {
    try {
      const [customersRes, plansRes] = await Promise.all([
        axios.get(`${API}/billing/customers`),
        axios.get(`${API}/billing/plans`),
      ]);
      setCustomers(Array.isArray(customersRes.data) ? customersRes.data : []);
      setPlans(Array.isArray(plansRes.data) ? plansRes.data : []);
    } catch (error) {
      toast.error('Failed to load billing reference data', error.response?.data?.error || error.message);
    }
  };

  const loadData = async (connectionId = selectedConnection) => {
    setLoading(true);
    try {
      const query = connectionId ? `?connection_id=${encodeURIComponent(connectionId)}` : '';
      const response = await axios.get(`${API}/billing/reconcile${query}`);
      setData(response.data);
    } catch (error) {
      toast.error('Failed to load reconciliation data', error.response?.data?.error || error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConnections();
    loadReferenceData();
  }, []);

  useEffect(() => {
    loadData(selectedConnection);
  }, [selectedConnection]);

  const applyFix = async (subscriptionId) => {
    setReconcilingId(subscriptionId);
    try {
      const response = await axios.post(`${API}/billing/reconcile/subscriptions/${subscriptionId}/apply`);
      const sync = response.data?.mikrotik_sync;
      if (sync?.success) {
        toast.success('Subscription synced', sync.message || 'Billing and MikroTik are back in sync');
      } else {
        toast.error('Sync failed', sync?.error || 'Could not reconcile this subscription');
      }
      if (response.data?.provision_script) {
        toast.info('Fallback script available', 'The backend returned a provisioning script because live sync did not fully succeed');
      }
      await loadData(selectedConnection);
    } catch (error) {
      toast.error('Failed to apply fix', error.response?.data?.error || error.message);
    } finally {
      setReconcilingId('');
    }
  };

  const openImport = (item) => {
    setImportForm({
      connection_id: item.connection_id,
      pppoe_username: item.pppoe_username,
      customer_id: '',
      customer_name: item.pppoe_username,
      customer_email: '',
      customer_phone: '',
      plan_id: plans[0]?.id || '',
      billing_cycle: 'monthly',
    });
    setShowImport(true);
  };

  const submitImport = async (e) => {
    e.preventDefault();
    const key = `${importForm.connection_id}:${importForm.pppoe_username}`;
    setImportingKey(key);
    try {
      const payload = {
        ...importForm,
        customer_name: importForm.customer_id ? '' : importForm.customer_name,
        customer_email: importForm.customer_id ? '' : importForm.customer_email,
        customer_phone: importForm.customer_id ? '' : importForm.customer_phone,
      };
      const response = await axios.post(`${API}/billing/reconcile/orphan-secret/import`, payload);
      toast.success('Orphan secret imported', response.data?.mikrotik_sync?.message || 'Billing subscription created successfully');
      setShowImport(false);
      await loadData(selectedConnection);
    } catch (error) {
      toast.error('Failed to import orphan secret', error.response?.data?.error || error.message);
    } finally {
      setImportingKey('');
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Remote Router Reconcile</h2>
          <p className="mt-1 text-slate-400">Compare billing subscriptions with live MikroTik PPPoE secrets and repair drift from one screen.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            value={selectedConnection}
            onChange={(e) => setSelectedConnection(e.target.value)}
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
          >
            <option value="">All MikroTik Connections</option>
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.name} ({connection.ip_address})
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={() => loadData(selectedConnection)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-xl">
            <CardHeader>
              <CardTitle>Import Router Secret Into Billing</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitImport} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>PPPoE Username</Label>
                    <Input value={importForm.pppoe_username} disabled />
                  </div>
                  <div>
                    <Label>Plan</Label>
                    <select
                      required
                      value={importForm.plan_id}
                      onChange={(e) => setImportForm((current) => ({ ...current, plan_id: e.target.value }))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Select plan</option>
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>{plan.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <Label>Attach To Existing Customer</Label>
                  <select
                    value={importForm.customer_id}
                    onChange={(e) => setImportForm((current) => ({ ...current, customer_id: e.target.value }))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Create new customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>{customer.name}</option>
                    ))}
                  </select>
                </div>

                {!importForm.customer_id && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>Customer Name</Label>
                      <Input
                        required
                        value={importForm.customer_name}
                        onChange={(e) => setImportForm((current) => ({ ...current, customer_name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input
                        value={importForm.customer_email}
                        onChange={(e) => setImportForm((current) => ({ ...current, customer_email: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input
                        value={importForm.customer_phone}
                        onChange={(e) => setImportForm((current) => ({ ...current, customer_phone: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Billing Cycle</Label>
                      <select
                        value={importForm.billing_cycle}
                        onChange={(e) => setImportForm((current) => ({ ...current, billing_cycle: e.target.value }))}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowImport(false)}>Cancel</Button>
                  <Button type="submit" disabled={importingKey === `${importForm.connection_id}:${importForm.pppoe_username}`}>
                    {importingKey === `${importForm.connection_id}:${importForm.pppoe_username}` ? 'Importing...' : 'Import Into Billing'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Stat label="Subscriptions Checked" value={data.summary.total_subscriptions} />
        <Stat label="Healthy Links" value={data.summary.healthy_subscriptions} tone="text-emerald-400" />
        <Stat label="Needs Repair" value={data.summary.drifted_subscriptions} tone="text-amber-400" />
        <Stat label="Router-Only Secrets" value={data.summary.orphan_secrets} tone="text-rose-400" />
        <Stat label="Connection Errors" value={data.summary.connection_errors} tone="text-sky-400" />
      </div>

      {data.connection_errors.length > 0 && (
        <Card className="mb-6 border-amber-500/30 bg-amber-500/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-300">
              <WifiOff className="h-5 w-5" />
              Router Connection Problems
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.connection_errors.map((item) => (
              <div key={item.connection_id} className="rounded-lg border border-amber-500/20 bg-black/20 p-3 text-sm text-amber-100">
                <div className="font-medium">{item.connection_name}</div>
                <div className="mt-1 text-amber-200/80">{item.error}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card className="card-gradient">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Router className="h-5 w-5" />
              Billing Subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && <div className="text-sm text-zinc-400">Loading reconciliation data...</div>}
            {!loading && data.subscriptions.length === 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-6 text-sm text-zinc-400">
                No subscriptions found for this scope.
              </div>
            )}
            {!loading && data.subscriptions.map((item) => (
              <div key={item.subscription_id} className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-base font-semibold text-white">{item.customer_name}</div>
                      <span className={`rounded-full px-2 py-1 text-xs ${
                        item.sync_status === 'healthy' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {item.sync_status}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-zinc-400">
                      {item.pppoe_username || 'No PPPoE username'} • {item.plan_name} • {item.connection_name || 'Unlinked'}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Billing: {item.billing_status} | Router: {item.router_secret_status}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={item.sync_status === 'healthy' ? 'secondary' : 'default'}
                      onClick={() => applyFix(item.subscription_id)}
                      disabled={reconcilingId === item.subscription_id}
                    >
                      <Wrench className="h-4 w-4" />
                      {reconcilingId === item.subscription_id ? 'Applying...' : item.sync_status === 'healthy' ? 'Re-Sync' : 'Fix on Router'}
                    </Button>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {item.issues.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-300">
                      <ShieldCheck className="h-4 w-4" />
                      Billing and MikroTik match for this subscription.
                    </div>
                  ) : (
                    item.issues.map((issue) => (
                      <div key={`${item.subscription_id}-${issue.code}`} className="flex items-start gap-2 text-sm text-amber-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <span>{issue.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="card-gradient">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Unplug className="h-5 w-5" />
              Router-Only PPPoE Secrets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && <div className="text-sm text-zinc-400">Checking router secrets...</div>}
            {!loading && data.orphan_secrets.length === 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-400">
                No untracked PPPoE secrets found on the selected routers.
              </div>
            )}
            {!loading && data.orphan_secrets.map((item) => (
              <div key={`${item.connection_id}-${item.pppoe_username}`} className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
                <div className="text-sm font-semibold text-white">{item.pppoe_username}</div>
                <div className="mt-1 text-xs text-zinc-400">{item.connection_name}</div>
                <div className="mt-3 flex items-start gap-2 text-sm text-rose-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{item.issues[0]?.message || 'Secret exists only on the router.'}</span>
                </div>
                <div className="mt-4">
                  <Button size="sm" onClick={() => openImport(item)}>
                    Import to Billing
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
