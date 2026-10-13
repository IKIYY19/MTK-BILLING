import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import {
  Network,
  Plus,
  Trash2,
  Pencil,
  X,
  ChevronDown,
  ChevronRight,
  Router,
  Gauge,
  HardDrive,
  Activity,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "/api";

/* ─── Status Colors ─── */
const STATUS_COLORS = {
  free: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  used: { bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-400" },
  reserved: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    dot: "bg-amber-400",
  },
};

/* ─── Stat Mini Card ─── */
function StatMini({ label, value, icon: Icon, color }) {
  return (
    <div className="glass rounded-xl p-4 flex items-center gap-3">
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center`}
        style={{ backgroundColor: color }}
      >
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <div className="text-xl font-bold text-white tabular-nums">{value}</div>
        <div className="text-xs text-zinc-500">{label}</div>
      </div>
    </div>
  );
}

/* ─── Status Badge ─── */
function StatusBadge({ status }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.free;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
      {status}
    </span>
  );
}

/* ─── Usage Progress Bar ─── */
function UsageBar({ used, total }) {
  const pct = total > 0 ? (used / total) * 100 : 0;
  const color =
    pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-zinc-500 mb-1">
        <span>
          {used} / {total} IPs
        </span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ─── Modal ─── */
function Modal({ title, children, onClose, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`relative glass border border-zinc-800/50 rounded-2xl p-6 max-h-[85vh] overflow-y-auto ${
          wide ? "w-[640px]" : "w-[480px]"
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-800/50 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ─── Add Subnet Modal ─── */
function AddSubnetModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    network: "",
    mask: 24,
    gateway: "",
    description: "",
    vlan_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        mask: parseInt(form.mask),
        vlan_id: form.vlan_id ? parseInt(form.vlan_id) : null,
      };
      await axios.post(`${API}/ipam/subnets`, payload);
      onCreated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setSaving(false);
  };

  return (
    <Modal title="Add Subnet" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
            {error}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">
            Subnet Name
          </label>
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="e.g. Management VLAN"
            required
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">
            Network Address
          </label>
          <input
            name="network"
            value={form.network}
            onChange={handleChange}
            placeholder="e.g. 192.168.1.0"
            required
            pattern="^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 text-sm font-mono"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">
              Subnet Mask
            </label>
            <select
              name="mask"
              value={form.mask}
              onChange={handleChange}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-blue-500/50 text-sm"
            >
              {Array.from({ length: 15 }, (_, i) => i + 16).map((m) => (
                <option key={m} value={m}>
                  /{m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">
              VLAN ID
            </label>
            <input
              name="vlan_id"
              type="number"
              min="1"
              max="4094"
              value={form.vlan_id}
              onChange={handleChange}
              placeholder="e.g. 100"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">
            Gateway
          </label>
          <input
            name="gateway"
            value={form.gateway}
            onChange={handleChange}
            placeholder="e.g. 192.168.1.1"
            pattern="^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">
            Description
          </label>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            rows={2}
            placeholder="Optional description..."
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 text-sm resize-none"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800/50 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Subnet"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ─── Edit IP Modal ─── */
function EditIPModal({ ip, onClose, onSaved }) {
  const [form, setForm] = useState({
    status: ip.status,
    description: ip.description || "",
    assigned_to: ip.assigned_to || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.put(`${API}/ipam/ips/${ip.id}`, form);
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  return (
    <Modal title={`Edit IP: ${ip.ip_address}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">
            Status
          </label>
          <select
            value={form.status}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, status: e.target.value }))
            }
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-blue-500/50 text-sm"
          >
            <option value="free">Free</option>
            <option value="used">Used</option>
            <option value="reserved">Reserved</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">
            Assigned To
          </label>
          <input
            value={form.assigned_to}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, assigned_to: e.target.value }))
            }
            placeholder="Customer or device name..."
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">
            Description
          </label>
          <textarea
            value={form.description}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, description: e.target.value }))
            }
            rows={2}
            placeholder="Optional description..."
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 text-sm resize-none"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800/50 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ─── IP Table Row ─── */
function IPRow({ ip, onEdit }) {
  return (
    <tr className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
      <td className="px-4 py-2.5 text-sm font-mono text-zinc-300">
        {ip.ip_address}
      </td>
      <td className="px-4 py-2.5">
        <StatusBadge status={ip.status} />
      </td>
      <td className="px-4 py-2.5 text-sm text-zinc-400 max-w-[200px] truncate">
        {ip.description || "—"}
      </td>
      <td className="px-4 py-2.5 text-sm text-zinc-400 max-w-[200px] truncate">
        {ip.assigned_to || "—"}
      </td>
      <td className="px-4 py-2.5 text-right">
        <button
          onClick={() => onEdit(ip)}
          className="p-1.5 rounded-lg hover:bg-zinc-700/50 text-zinc-500 hover:text-blue-400 transition-colors"
          title="Edit IP"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

/* ─── Subnet Card ─── */
function SubnetCard({
  subnet,
  expanded,
  onToggle,
  onDelete,
  onEditIP,
  ips,
  ipsLoading,
}) {
  return (
    <div className="glass rounded-2xl border border-zinc-800/50 overflow-hidden">
      {/* Header */}
      <div
        className="p-5 cursor-pointer hover:bg-zinc-800/20 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Network className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                {subnet.name}
              </h3>
              <p className="text-sm font-mono text-zinc-400">
                {subnet.network}/{subnet.mask}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("Delete this subnet and all its IPs?"))
                  {onDelete(subnet.id);}
              }}
              className="p-1.5 rounded-lg hover:bg-rose-500/10 text-zinc-500 hover:text-rose-400 transition-colors"
              title="Delete Subnet"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            {expanded ? (
              <ChevronDown className="w-5 h-5 text-zinc-500" />
            ) : (
              <ChevronRight className="w-5 h-5 text-zinc-500" />
            )}
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-4 mt-4 text-xs text-zinc-500">
          {subnet.gateway && (
            <span className="flex items-center gap-1">
              <Router className="w-3 h-3" />
              Gateway: {subnet.gateway}
            </span>
          )}
          {subnet.vlan_id && (
            <span className="flex items-center gap-1">
              <Gauge className="w-3 h-3" />
              VLAN: {subnet.vlan_id}
            </span>
          )}
        </div>

        {/* Usage bar */}
        <div className="mt-3">
          <UsageBar used={subnet.used_ips || 0} total={subnet.total_ips || 0} />
        </div>
      </div>

      {/* Expanded IP table */}
      {expanded && (
        <div className="border-t border-zinc-800/50">
          {ipsLoading ? (
            <div className="p-8 text-center text-zinc-500 text-sm">
              Loading IPs...
            </div>
          ) : ips.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-sm">
              No IPs found in this subnet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-800/50 bg-zinc-900/50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      IP Address
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      Assigned To
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ips.map((ip) => (
                    <IPRow key={ip.id} ip={ip} onEdit={onEditIP} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   Main IPAM Page
   ═══════════════════════════════════════ */
export default function IPAMPage() {
  const [subnets, setSubnets] = useState([]);
  const [stats, setStats] = useState({
    subnets: 0,
    total_ips: 0,
    used_ips: 0,
    free_ips: 0,
    reserved_ips: 0,
  });
  const [expandedId, setExpandedId] = useState(null);
  const [ipsCache, setIpsCache] = useState({});
  const [ipsLoading, setIpsLoading] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [editIP, setEditIP] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSubnets = useCallback(async () => {
    try {
      const [subRes, statsRes] = await Promise.all([
        axios.get(`${API}/ipam/subnets`),
        axios.get(`${API}/ipam/stats`),
      ]);
      setSubnets(subRes.data);
      setStats(statsRes.data);
    } catch (e) {
      console.error("Failed to fetch IPAM data:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSubnets();
  }, [fetchSubnets]);

  const toggleExpand = async (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!ipsCache[id]) {
      setIpsLoading((prev) => ({ ...prev, [id]: true }));
      try {
        const { data } = await axios.get(`${API}/ipam/subnets/${id}/ips`);
        setIpsCache((prev) => ({ ...prev, [id]: data }));
      } catch (e) {
        console.error(e);
      }
      setIpsLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/ipam/subnets/${id}`);
      setSubnets((prev) => prev.filter((s) => s.id !== id));
      setExpandedId(null);
      setIpsCache((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      fetchSubnets();
    } catch (e) {
      console.error(e);
    }
  };

  const handleIPEdit = async (ip) => {
    setEditIP(ip);
  };

  const handleIPSaved = () => {
    // Refresh the IPs for the currently expanded subnet
    if (expandedId) {
      const refreshIps = async () => {
        try {
          const { data } = await axios.get(
            `${API}/ipam/subnets/${expandedId}/ips`,
          );
          setIpsCache((prev) => ({ ...prev, [expandedId]: data }));
        } catch (e) {
          console.error(e);
        }
      };
      refreshIps();
    }
    fetchSubnets();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">IPAM</h1>
          <p className="text-sm text-zinc-400 mt-1">
            IP Address Management — Track subnets, pools, and assignments
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Subnet
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatMini
          label="Subnets"
          value={stats.subnets}
          icon={Network}
          color="#3b82f6"
        />
        <StatMini
          label="Total IPs"
          value={stats.total_ips}
          icon={HardDrive}
          color="#6366f1"
        />
        <StatMini
          label="Used"
          value={stats.used_ips}
          icon={Activity}
          color="#3b82f6"
        />
        <StatMini
          label="Free"
          value={stats.free_ips}
          icon={Activity}
          color="#10b981"
        />
        <StatMini
          label="Reserved"
          value={stats.reserved_ips}
          icon={Activity}
          color="#f59e0b"
        />
      </div>

      {/* Subnet List */}
      <div className="space-y-4">
        {subnets.length === 0 ? (
          <div className="glass rounded-2xl border border-zinc-800/50 p-12 text-center">
            <Network className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-zinc-400 mb-2">
              No Subnets Yet
            </h3>
            <p className="text-sm text-zinc-500 mb-4">
              Create your first subnet to start tracking IP usage.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Subnet
            </button>
          </div>
        ) : (
          subnets.map((subnet) => (
            <SubnetCard
              key={subnet.id}
              subnet={subnet}
              expanded={expandedId === subnet.id}
              onToggle={() => toggleExpand(subnet.id)}
              onDelete={handleDelete}
              onEditIP={handleIPEdit}
              ips={ipsCache[subnet.id] || []}
              ipsLoading={!!ipsLoading[subnet.id]}
            />
          ))
        )}
      </div>

      {/* Add Subnet Modal */}
      {showAddModal && (
        <AddSubnetModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => fetchSubnets()}
        />
      )}

      {/* Edit IP Modal */}
      {editIP && (
        <EditIPModal
          ip={editIP}
          onClose={() => setEditIP(null)}
          onSaved={handleIPSaved}
        />
      )}
    </div>
  );
}
