import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  Plus,
  Power,
  PowerOff,
  Copy,
  Terminal,
  Check,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
  RefreshCw,
  Wifi,
  Shield,
} from "lucide-react";
import { useToast } from "../../hooks/useToast";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

const API = import.meta.env.VITE_API_URL || "/api";
const emptyForm = {
  customer_id: "",
  plan_id: "",
  mikrotik_connection_id: "",
  pppoe_username: "",
  pppoe_password: "",
  mac_address: "",
  mac_binding_enabled: false,
  pppoe_profile: "",
  start_date: "",
  billing_cycle: "monthly",
  auto_provision: true,
};

export function BillingSubscriptions() {
  const toast = useToast();
  const [subs, setSubs] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [connections, setConnections] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showScript, setShowScript] = useState(null);
  const [copied, setCopied] = useState(false);
  const [editingSub, setEditingSub] = useState(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    fetchSubs();
    axios.get(`${API}/billing/customers`).then((r) => setCustomers(r.data));
    axios.get(`${API}/billing/plans`).then((r) => setPlans(r.data));
    axios.get(`${API}/mikrotik`).then((r) => setConnections(r.data));
  }, []);

  const fetchSubs = async () => {
    try {
      const { data } = await axios.get(`${API}/billing/subscriptions`);
      setSubs(data);
    } catch (error) {
      console.error("Failed to fetch subscriptions:", error);
      toast.error(
        "Failed to load subscriptions",
        error.response?.data?.error || error.message,
      );
    }
  };

  const handleSyncFeedback = (data, successMessage) => {
    if (successMessage) {
      toast.success(successMessage);
    }
    if (data?.mikrotik_sync?.success) {
      toast.success("MikroTik API: " + (data.mikrotik_sync.message || "Synced"));
    } else if (data?.mikrotik_sync?.error && data?.mikrotik_sync?.status !== "skipped") {
      toast.error("MikroTik sync failed", data.mikrotik_sync.error);
    }
    if (data?.radius_sync?.success) {
      toast.success("RADIUS: " + (data.radius_sync.message || "Synced"));
    } else if (data?.radius_sync?.error && data?.radius_sync?.status !== "skipped") {
      toast.error("RADIUS sync failed", data.radius_sync.error);
    }
    if (data?.provision_script) {
      setShowScript(data.provision_script);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingSub) {
      const { data } = await axios.put(
        `${API}/billing/subscriptions/${editingSub.id}`,
        {
          ...form,
          router_id: null,
        },
      );
      handleSyncFeedback(data, "Subscription updated");
    } else {
      const { data } = await axios.post(`${API}/billing/subscriptions`, {
        ...form,
        router_id: null,
        start_date: form.start_date || new Date().toISOString().split("T")[0],
      });
      handleSyncFeedback(data, "Subscription created");
    }
    setShowForm(false);
    setEditingSub(null);
    setForm({ ...emptyForm });
    fetchSubs();
  };

  const handleEdit = (sub) => {
    setEditingSub(sub);
    setForm({
      customer_id: sub.customer_id,
      plan_id: sub.plan_id,
      mikrotik_connection_id:
        sub.mikrotik_connection_id || sub.router?.id || "",
      pppoe_username: sub.pppoe_username || "",
      pppoe_password: sub.pppoe_password || "",
      mac_address: sub.mac_address || "",
      mac_binding_enabled: sub.mac_binding_enabled || false,
      pppoe_profile: sub.pppoe_profile || "",
      start_date: sub.start_date,
      billing_cycle: sub.billing_cycle,
      auto_provision: sub.auto_provision,
    });
    setShowForm(true);
  };

  const handleDelete = async (sub) => {
    console.log("Deleting subscription:", sub.id);
    try {
      const { data } = await axios.delete(
        `${API}/billing/subscriptions/${sub.id}`,
      );
      handleSyncFeedback(data, "Subscription deleted");
      fetchSubs();
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("Failed to delete subscription");
    }
  };

  const toggleStatus = async (sub) => {
    const { data } = await axios.post(
      `${API}/billing/subscriptions/${sub.id}/toggle`,
    );
    fetchSubs();
    handleSyncFeedback(data);
  };

  const syncSubscription = async (sub) => {
    try {
      const { data } = await axios.post(
        `${API}/billing/subscriptions/${sub.id}/sync`,
      );
      handleSyncFeedback(data, "Subscription sync started");
      fetchSubs();
    } catch (error) {
      toast.error(
        "Failed to sync subscription",
        error.response?.data?.error || error.message,
      );
    }
  };

  const copyScript = (script) => {
    navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="billing-page">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white gradient-text">
            Subscriptions ({subs.length})
          </h2>
          <p className="text-slate-400 mt-1">
            Manage customer subscriptions and plans
          </p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="btn-gradient-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" /> New Subscription
        </Button>
      </div>

      {subs.length === 0 ? (
        <div className="billing-list-empty">No subscriptions yet. Create your first subscription.</div>
      ) : (
        <div className="billing-table-wrap">
          <table className="billing-data-table">
            <thead><tr><th>Customer</th><th>Plan</th><th>PPPoE Username</th><th>Router</th><th>Billing</th><th>RADIUS</th><th>Status</th><th>Start Date</th><th>Actions</th></tr></thead>
            <tbody>{subs.map((sub) => (
              <tr key={sub.id}>
                <td className="billing-primary-cell">{sub.customer?.name || "Unknown"}</td>
                <td><span className="billing-primary-cell">{sub.plan?.name || "No plan"}</span><small className="billing-secondary-cell">{sub.plan?.speed_up || "—"}/{sub.plan?.speed_down || "—"} Mbps · KES {sub.plan?.price ?? "—"}/mo</small></td>
                <td className="billing-mono-cell">{sub.pppoe_username || "—"}</td>
                <td>{sub.router?.name || "—"}</td>
                <td><span className={`billing-sync-pill ${sub.last_sync_status === "synced" ? "is-synced" : "is-pending"}`}>{sub.last_sync_status || "not synced"}</span></td>
                <td><span className={`billing-sync-pill ${sub.last_radius_sync_status === "synced" ? "is-synced" : "is-pending"}`}>{sub.last_radius_sync_status || "disabled"}</span></td>
                <td><span className={`billing-status-pill ${sub.status === "active" ? "is-paid" : "is-pending"}`}>{sub.status || "unknown"}</span></td>
                <td>{sub.start_date ? new Date(sub.start_date).toLocaleDateString() : "—"}</td>
                <td><div className="billing-row-actions">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(sub)} title="Edit subscription" aria-label={`Edit ${sub.customer?.name || "subscription"}`}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="outline" size="sm" onClick={() => syncSubscription(sub)} title="Synchronize subscription" aria-label={`Synchronize ${sub.customer?.name || "subscription"}`}><RefreshCw className="w-3.5 h-3.5" /></Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(sub)} title="Delete subscription" aria-label={`Delete ${sub.customer?.name || "subscription"}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                  <Button variant="outline" size="sm" onClick={() => toggleStatus(sub)} title={sub.status === "active" ? "Suspend" : "Activate"} aria-label={`${sub.status === "active" ? "Suspend" : "Activate"} ${sub.customer?.name || "subscription"}`}>
                    {sub.status === "active" ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                  </Button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <Card className="card-glow w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader className="border-b border-zinc-800">
              <div className="flex items-center justify-between">
                <CardTitle>
                  {editingSub ? "Edit Subscription" : "New Subscription"}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowForm(false);
                    setEditingSub(null);
                    setForm({ ...emptyForm });
                  }}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4 pt-6">
                <div>
                  <Label htmlFor="customer">Customer *</Label>
                  <select
                    id="customer"
                    required
                    value={form.customer_id}
                    onChange={(e) =>
                      setForm({ ...form, customer_id: e.target.value })
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  >
                    <option value="">Select customer</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="plan">Service Plan *</Label>
                  <select
                    id="plan"
                    required
                    value={form.plan_id}
                    onChange={(e) =>
                      setForm({ ...form, plan_id: e.target.value })
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  >
                    <option value="">Select plan</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — ${p.price}/mo
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="router">MikroTik Connection</Label>
                  <select
                    id="router"
                    value={form.mikrotik_connection_id}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        mikrotik_connection_id: e.target.value,
                      })
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  >
                    <option value="">No MikroTik linked</option>
                    {connections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.ip_address})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="pppoe-username">PPPoE Username</Label>
                    <Input
                      id="pppoe-username"
                      value={form.pppoe_username}
                      onChange={(e) =>
                        setForm({ ...form, pppoe_username: e.target.value })
                      }
                      placeholder="customer01"
                    />
                  </div>
                  <div>
                    <Label htmlFor="pppoe-password">PPPoE Password</Label>
                    <Input
                      id="pppoe-password"
                      type="password"
                      value={form.pppoe_password}
                      onChange={(e) =>
                        setForm({ ...form, pppoe_password: e.target.value })
                      }
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="mac-address">MAC Address Binding</Label>
                  <Input
                    id="mac-address"
                    value={form.mac_address || ""}
                    onChange={(e) =>
                      setForm({ ...form, mac_address: e.target.value })
                    }
                    placeholder="XX:XX:XX:XX:XX:XX"
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    Lock this user to a specific MAC address
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="mac-binding"
                    checked={form.mac_binding_enabled || false}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        mac_binding_enabled: e.target.checked,
                      })
                    }
                    className="rounded"
                  />
                  <Label
                    htmlFor="mac-binding"
                    className="text-sm cursor-pointer"
                  >
                    Enable MAC Binding
                  </Label>
                </div>
                <div>
                  <Label htmlFor="pppoe-profile">PPPoE Profile</Label>
                  <Input
                    id="pppoe-profile"
                    value={form.pppoe_profile}
                    onChange={(e) =>
                      setForm({ ...form, pppoe_profile: e.target.value })
                    }
                    placeholder="default"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="start-date">Start Date</Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={form.start_date}
                      onChange={(e) =>
                        setForm({ ...form, start_date: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="billing-cycle">Billing Cycle</Label>
                    <select
                      id="billing-cycle"
                      value={form.billing_cycle}
                      onChange={(e) =>
                        setForm({ ...form, billing_cycle: e.target.value })
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 pt-4 border-t border-zinc-800">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowForm(false);
                      setEditingSub(null);
                      setForm({ ...emptyForm });
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="btn-gradient-primary flex-1">
                    {editingSub ? "Update Subscription" : "Create Subscription"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* MikroTik Script Modal */}
      {showScript && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <Card className="card-glow w-3/4 max-w-4xl max-h-[80vh] flex flex-col">
            <CardHeader className="border-b border-zinc-800">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-green-500" />
                  MikroTik Provisioning Script
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => copyScript(showScript)}
                    className="btn-gradient-success flex items-center gap-1"
                  >
                    {copied ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowScript(null)}
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-6">
              <div className="bg-yellow-600/20 border border-yellow-600/50 rounded p-3 mb-4">
                <p className="text-yellow-400 text-sm">
                  ⚠️ Paste this into your MikroTik terminal to apply the
                  provisioning changes.
                </p>
              </div>
              <pre className="text-sm text-green-400 font-mono whitespace-pre-wrap">
                {showScript}
              </pre>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
