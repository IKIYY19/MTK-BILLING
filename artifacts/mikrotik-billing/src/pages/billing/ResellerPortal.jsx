import React, { useEffect, useState, useMemo, useCallback } from "react";
import axios from "axios";
import {
  UserCheck,
  Users,
  DollarSign,
  Package,
  TrendingUp,
  Plus,
  Search,
  Pencil,
  Trash2,
  ExternalLink,
  RefreshCw,
  Shield,
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Clock,
  CreditCard,
  Wallet,
  X,
  ArrowUpRight,
  Phone,
  Mail,
  Building2,
  Percent,
  Hash,
  Ban,
  CheckCircle2,
} from "lucide-react";
import { useToastStore } from "../../stores/toastStore";
import { getToken } from "../../lib/auth";

const API = import.meta.env.VITE_API_URL || "/api";

// ─────────────────── StatCard ───────────────────
function StatCard({ title, value, icon: Icon, bg, ring, textColor, sub }) {
  return (
    <div className="glass rounded-2xl p-5 card-hover group">
      <div className="flex items-center justify-between mb-3">
        <div
          className={`w-10 h-10 rounded-xl ${bg} ring-1 ${ring} flex items-center justify-center group-hover:scale-110 transition-transform`}
        >
          <Icon className={`w-5 h-5 ${textColor}`} />
        </div>
      </div>
      <div className={`stat-value ${textColor}`}>{value}</div>
      <div className="text-sm text-zinc-400 mt-1">{title}</div>
      {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─────────────────── BarChart ───────────────────
function BarChart({ data, labelKey, valueKey, color, maxValue }) {
  const effectiveMax = maxValue || Math.max(...data.map((d) => d[valueKey]), 1);
  return (
    <div className="flex items-end gap-2 h-32">
      {data.map((d, i) => (
        <div
          key={i}
          className="flex-1 flex flex-col items-center gap-1 h-full justify-end"
        >
          <span className="text-xs text-zinc-500 font-mono">
            {typeof d[valueKey] === "number"
              ? `KES ${d[valueKey].toFixed(0)}`
              : d[valueKey]}
          </span>
          <div
            className={`w-full rounded-t-md transition-all duration-500 ${color || "bg-gradient-to-t from-indigo-600 to-indigo-400"}`}
            style={{
              height: `${Math.max(4, ((d[valueKey] || 0) / effectiveMax) * 100)}%`,
            }}
          />
          <span className="text-xs text-zinc-500">{d[labelKey]}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────── Status Badge ───────────────────
function StatusBadge({ status }) {
  const config = {
    active: {
      icon: CheckCircle2,
      cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    },
    suspended: {
      icon: Ban,
      cls: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    },
    inactive: {
      icon: X,
      cls: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    },
  };
  const c = config[status] || config.inactive;
  const Icon = c.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${c.cls}`}
    >
      <Icon className="w-3 h-3" />
      <span className="capitalize">{status}</span>
    </span>
  );
}

// ─────────────────── Main Component ───────────────────
export function ResellerPortal() {
  const { addToast } = useToastStore();

  // ── Core State ──
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [resellers, setResellers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState("");
  const [revenueTrend, setRevenueTrend] = useState([]);

  // ── Expand / Detail State ──
  const [expandedReseller, setExpandedReseller] = useState(null);
  const [selectedReseller, setSelectedReseller] = useState(null);
  const [detailTab, setDetailTab] = useState("profile");
  const [resellerCustomers, setResellerCustomers] = useState([]);
  const [resellerVouchers, setResellerVouchers] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpLoading, setTopUpLoading] = useState(false);

  // ── Fetch ──
  useEffect(() => {
    fetchResellers();
    fetchRevenueTrend();
  }, []);

  const fetchResellers = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const { data } = await axios.get(`${API}/resellers`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setResellers(Array.isArray(data) ? data : []);
      setError("");
    } catch (e) {
      console.error("Failed to fetch resellers:", e);
      setError("Failed to load resellers. Please refresh the page.");
      setResellers([]);
    }
    setLoading(false);
  };

  const fetchRevenueTrend = async () => {
    try {
      const token = getToken();
      const { data } = await axios.get(`${API}/analytics/revenue-trend?period=1y`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setRevenueTrend(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to fetch revenue trend:", e);
      setRevenueTrend([]);
    }
  };

  // ── CRUD ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setError("");

    try {
      const token = getToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      if (editing && editing.id) {
        await axios.put(`${API}/resellers/${editing.id}`, editing, { headers });
        addToast(
          "success",
          "Reseller updated",
          `${editing.name} has been updated.`,
        );
      } else {
        await axios.post(`${API}/resellers`, editing || {}, { headers });
        addToast(
          "success",
          "Reseller created",
          `${editing?.name || "Reseller"} has been added.`,
        );
      }

      setShowForm(false);
      setEditing(null);
      await fetchResellers();
    } catch (e) {
      console.error("Failed to save reseller:", e);
      const errorMsg =
        e.response?.data?.error || e.message || "Failed to save reseller";
      setError(errorMsg);
      addToast("error", "Save failed", errorMsg);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete reseller "${name}"? This cannot be undone.`)) {return;}

    try {
      const token = getToken();
      await axios.delete(`${API}/resellers/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      addToast("success", "Reseller deleted", `${name} has been removed.`);
      if (selectedReseller?.id === id) {setSelectedReseller(null);}
      if (expandedReseller === id) {setExpandedReseller(null);}
      await fetchResellers();
    } catch (e) {
      console.error("Failed to delete reseller:", e);
      addToast(
        "error",
        "Delete failed",
        e.response?.data?.error || "Could not delete reseller.",
      );
    }
  };

  // ── Fetch Reseller Details ──
  const fetchResellerData = useCallback(async (resellerId) => {
    setDetailLoading(true);
    try {
      const token = getToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [custRes, voucherRes] = await Promise.allSettled([
        axios.get(`${API}/customers?reseller_id=${resellerId}`, { headers }),
        axios.get(`${API}/captive-portals?reseller_id=${resellerId}`, {
          headers,
        }),
      ]);
      setResellerCustomers(
        custRes.status === "fulfilled"
          ? Array.isArray(custRes.value.data)
            ? custRes.value.data
            : []
          : [],
      );
      setResellerVouchers(
        voucherRes.status === "fulfilled"
          ? Array.isArray(voucherRes.value.data)
            ? voucherRes.value.data
            : []
          : [],
      );
    } catch (e) {
      console.error("Failed to fetch reseller detail:", e);
      setResellerCustomers([]);
      setResellerVouchers([]);
    }
    setDetailLoading(false);
  }, []);

  const openResellerDetail = (r) => {
    setSelectedReseller(r);
    setDetailTab("profile");
    fetchResellerData(r.id);
  };

  // ── Top-Up ──
  const handleTopUp = async () => {
    const amount = parseFloat(topUpAmount);
    if (!amount || amount <= 0) {
      addToast(
        "warning",
        "Invalid amount",
        "Please enter a valid top-up amount.",
      );
      return;
    }
    setTopUpLoading(true);
    try {
      const token = getToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const newLimit =
        (parseFloat(selectedReseller.credit_limit) || 0) + amount;
      await axios.put(
        `${API}/resellers/${selectedReseller.id}`,
        {
          ...selectedReseller,
          credit_limit: newLimit,
        },
        { headers },
      );
      addToast(
        "success",
        "Top-up successful",
        `Added KES ${amount.toFixed(2)} to ${selectedReseller.name}'s balance.`,
      );
      setTopUpAmount("");
      setSelectedReseller((prev) => ({ ...prev, credit_limit: newLimit }));
      await fetchResellers();
    } catch (e) {
      addToast("error", "Top-up failed", e.response?.data?.error || e.message);
    }
    setTopUpLoading(false);
  };

  // ── Derived Data ──
  const totalRevenue = useMemo(
    () => resellers.reduce((s, r) => s + (parseFloat(r.total_revenue) || 0), 0),
    [resellers],
  );
  const totalCustomers = useMemo(
    () => resellers.reduce((s, r) => s + (r.customer_count || 0), 0),
    [resellers],
  );
  const activeResellers = useMemo(
    () => resellers.filter((r) => r.status === "active").length,
    [resellers],
  );
  const totalCommissions = useMemo(
    () =>
      resellers.reduce(
        (s, r) =>
          s +
          ((parseFloat(r.total_revenue) || 0) * (r.commission_rate || 0)) / 100,
        0,
      ),
    [resellers],
  );

  const filtered = useMemo(() => {
    let list = resellers;
    if (search)
      {list = list.filter((r) =>
        r.name?.toLowerCase().includes(search.toLowerCase()),
      );}
    if (statusFilter !== "all")
      {list = list.filter((r) => r.status === statusFilter);}
    return list;
  }, [resellers, search, statusFilter]);

  // ── Monthly revenue data from API ──
  const monthlyData = useMemo(() => {
    if (revenueTrend && revenueTrend.length > 0) {
      return revenueTrend.map((item) => ({
        month: item.label,
        revenue: item.revenue || 0,
      }));
    }
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    return months.map((m) => ({
      month: m,
      revenue: 0,
    }));
  }, [revenueTrend]);

  // ── Activity log (derived from resellers) ──
  const activityLog = useMemo(() => {
    return resellers.slice(0, 5).map((r) => ({
      id: r.id,
      name: r.name,
      action:
        r.status === "active"
          ? "Active reseller"
          : r.status === "suspended"
            ? "Suspended"
            : "New",
      time: "Recently",
      revenue: parseFloat(r.total_revenue) || 0,
    }));
  }, [resellers]);

  // ── Tabs ──
  const tabs = [
    { id: "overview", label: "Overview", icon: TrendingUp },
    { id: "resellers", label: "Resellers", icon: UserCheck },
    { id: "commissions", label: "Commissions", icon: Percent },
  ];

  // ── Status filter options ──
  const statusOptions = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "suspended", label: "Suspended" },
    { value: "inactive", label: "Inactive" },
  ];

  // ================================================================
  //  RENDER
  // ================================================================
  return (
    <div className="relative min-h-full p-8 animate-fade-in">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-noise" />

      {/* ── Header ── */}
      <div className="relative flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <UserCheck className="w-4 h-4 text-white" />
            </div>
            Reseller Management
          </h1>
          <p className="text-zinc-400 mt-1">
            Multi-tenant reseller dashboards with commission tracking
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchResellers} className="btn-ghost">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setEditing({
                name: "",
                company: "",
                email: "",
                phone: "",
                commission_rate: 10,
                status: "active",
                credit_limit: 0,
              });
              setShowForm(true);
            }}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" /> New Reseller
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="relative mb-6 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300 flex-1">{error}</p>
          <button
            onClick={() => setError("")}
            className="text-red-400 hover:text-red-300"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Stats ── */}
      <div className="relative grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Resellers"
          value={resellers.length}
          icon={UserCheck}
          bg="bg-indigo-500/10"
          ring="ring-indigo-500/20"
          textColor="text-indigo-400"
          sub={`${activeResellers} active`}
        />
        <StatCard
          title="Monthly Revenue"
          value={`KES ${totalRevenue.toFixed(2)}`}
          icon={DollarSign}
          bg="bg-emerald-500/10"
          ring="ring-emerald-500/20"
          textColor="text-emerald-400"
        />
        <StatCard
          title="Total Customers"
          value={totalCustomers}
          icon={Users}
          bg="bg-blue-500/10"
          ring="ring-blue-500/20"
          textColor="text-blue-400"
        />
        <StatCard
          title="Total Commissions"
          value={`KES ${totalCommissions.toFixed(2)}`}
          icon={Package}
          bg="bg-amber-500/10"
          ring="ring-amber-500/20"
          textColor="text-amber-400"
        />
      </div>

      {/* ── Tabs ── */}
      <div className="relative flex gap-2 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === tab.id
                ? "bg-indigo-600 text-white shadow-lg"
                : "bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700/60"
            }`}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════
          OVERVIEW TAB
          ════════════════════════════════════════════════════════════ */}
      {activeTab === "overview" && (
        <div className="relative space-y-6">
          {/* Revenue Chart */}
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-indigo-400" />
              </div>
              <h3 className="text-base font-semibold text-white">
                Revenue Overview
              </h3>
            </div>
            {monthlyData.some(d => d.revenue > 0) || totalRevenue > 0 ? (
              <BarChart
                data={monthlyData}
                labelKey="month"
                valueKey="revenue"
                color="bg-gradient-to-t from-indigo-600 to-indigo-400"
              />
            ) : (
              <div className="text-center text-zinc-500 py-8">
                No revenue data yet
              </div>
            )}
          </div>

          {/* Top Resellers + Commission Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Resellers */}
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-blue-400" />
                </div>
                <h3 className="text-base font-semibold text-white">
                  Top Resellers by Revenue
                </h3>
              </div>
              {resellers.length === 0 ? (
                <div className="text-center text-zinc-500 py-8">
                  No resellers yet
                </div>
              ) : (
                <div className="space-y-3">
                  {[...resellers]
                    .sort(
                      (a, b) =>
                        (parseFloat(b.total_revenue) || 0) -
                        (parseFloat(a.total_revenue) || 0),
                    )
                    .slice(0, 5)
                    .map((r, i) => (
                      <button
                        key={i}
                        onClick={() => openResellerDetail(r)}
                        className="w-full flex items-center justify-between py-2 px-3 rounded-xl hover:bg-zinc-800/50 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-zinc-500 font-mono text-sm w-6">
                            #{i + 1}
                          </span>
                          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-semibold text-xs">
                            {r.name?.charAt(0)}
                          </div>
                          <div className="text-left">
                            <span className="text-sm text-white group-hover:text-indigo-400 transition-colors">
                              {r.name}
                            </span>
                            {r.company && (
                              <div className="text-xs text-zinc-500">
                                {r.company}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-emerald-400 font-semibold">
                            KES {(parseFloat(r.total_revenue) || 0).toFixed(2)}
                          </span>
                          <ArrowUpRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Commission Summary */}
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/20 flex items-center justify-center">
                  <Percent className="w-4 h-4 text-amber-400" />
                </div>
                <h3 className="text-base font-semibold text-white">
                  Commission Overview
                </h3>
              </div>
              <div className="space-y-4">
                {resellers
                  .filter((r) => parseFloat(r.total_revenue) > 0)
                  .map((r, i) => {
                    const commission =
                      ((parseFloat(r.total_revenue) || 0) *
                        (r.commission_rate || 0)) /
                      100;
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-zinc-300">
                            {r.name}
                          </span>
                          <span className="text-sm text-zinc-400">
                            {r.commission_rate}%
                          </span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                            style={{
                              width: `${Math.min(100, (commission / Math.max(totalRevenue * 0.1, 1)) * 100)}%`,
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-500">
                            Commission: KES {commission.toFixed(2)}
                          </span>
                          <span className="text-zinc-500">
                            Revenue: KES{" "}
                            {(parseFloat(r.total_revenue) || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                {resellers.filter((r) => parseFloat(r.total_revenue) > 0)
                  .length === 0 && (
                  <div className="text-center text-zinc-500 py-8">
                    No commission data yet
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-zinc-500/10 ring-1 ring-zinc-500/20 flex items-center justify-center">
                <Activity className="w-4 h-4 text-zinc-400" />
              </div>
              <h3 className="text-base font-semibold text-white">
                Recent Activity
              </h3>
            </div>
            {activityLog.length === 0 ? (
              <div className="text-center text-zinc-500 py-8">
                No recent activity
              </div>
            ) : (
              <div className="space-y-2">
                {activityLog.map((a, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 py-2 px-3 rounded-xl hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                    <div className="flex-1">
                      <span className="text-sm text-white">{a.name}</span>
                      <span className="text-xs text-zinc-500 ml-2">
                        {a.action}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                      <Clock className="w-3 h-3" />
                      <span>{a.time}</span>
                      {a.revenue > 0 && (
                        <span className="text-emerald-400 font-medium">
                          KES {a.revenue.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          RESELLERS LIST TAB
          ════════════════════════════════════════════════════════════ */}
      {activeTab === "resellers" && (
        <div className="relative space-y-4">
          {/* Search + Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search resellers..."
                className="modern-input pl-10 w-full"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="modern-input w-40"
            >
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-zinc-500 ml-2">
              {filtered.length} reseller{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Table */}
          <div className="glass rounded-2xl overflow-hidden">
            {loading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="skeleton h-14 rounded-xl" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <UserCheck className="w-6 h-6 text-zinc-600" />
                </div>
                <div className="empty-state-title">
                  {search || statusFilter !== "all"
                    ? "No resellers found"
                    : "No resellers yet"}
                </div>
                <div className="empty-state-desc">
                  Add your first reseller to enable multi-tenant management
                </div>
              </div>
            ) : (
              <table className="modern-table">
                <thead>
                  <tr>
                    <th className="w-8"></th>
                    <th>Reseller</th>
                    <th>Contact</th>
                    <th>Commission</th>
                    <th>Customers</th>
                    <th>Revenue</th>
                    <th>Credit Limit</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const isExpanded = expandedReseller === r.id;
                    return (
                      <React.Fragment key={r.id}>
                        {/* Main Row */}
                        <tr
                          className={`cursor-pointer hover:bg-zinc-800/30 transition-colors ${isExpanded ? "bg-zinc-800/20" : ""}`}
                          onClick={() =>
                            setExpandedReseller(isExpanded ? null : r.id)
                          }
                        >
                          <td className="w-8">
                            <button className="p-1 rounded-lg hover:bg-zinc-700/50 text-zinc-500">
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                          <td>
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/20 flex items-center justify-center text-sm font-semibold text-indigo-400 flex-shrink-0">
                                {r.name?.charAt(0) || "R"}
                              </div>
                              <div>
                                <div className="text-white font-medium">
                                  {r.name}
                                </div>
                                {r.company && (
                                  <div className="text-xs text-zinc-500">
                                    {r.company}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            {r.email && (
                              <div className="text-sm text-zinc-300">
                                {r.email}
                              </div>
                            )}
                            {r.phone && (
                              <div className="text-xs text-zinc-500">
                                {r.phone}
                              </div>
                            )}
                          </td>
                          <td>
                            <span className="badge badge-emerald">
                              {r.commission_rate}%
                            </span>
                          </td>
                          <td>
                            <span className="badge badge-blue">
                              {r.customer_count || 0}
                            </span>
                          </td>
                          <td className="text-sm text-emerald-400 font-semibold">
                            KES {(parseFloat(r.total_revenue) || 0).toFixed(2)}
                          </td>
                          <td className="text-sm text-zinc-300">
                            KES {(parseFloat(r.credit_limit) || 0).toFixed(2)}
                          </td>
                          <td>
                            <StatusBadge status={r.status} />
                          </td>
                          <td>
                            <div
                              className="flex items-center justify-end gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => openResellerDetail(r)}
                                className="btn-ghost p-2"
                                title="View details"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditing(r);
                                  setShowForm(true);
                                }}
                                className="btn-ghost p-2"
                                title="Edit"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(r.id, r.name)}
                                className="btn-ghost p-2 text-zinc-500 hover:text-rose-400"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Row – Customer & Voucher quick-view */}
                        {isExpanded && (
                          <tr className="bg-zinc-800/10">
                            <td colSpan={9} className="p-0">
                              <ExpandedRow
                                reseller={r}
                                onViewFull={() => openResellerDetail(r)}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          COMMISSIONS TAB
          ════════════════════════════════════════════════════════════ */}
      {activeTab === "commissions" && (
        <div className="relative space-y-6">
          {/* Monthly Summary */}
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-emerald-400" />
              </div>
              <h3 className="text-base font-semibold text-white">
                Monthly Commission Summary
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-zinc-800/40 rounded-xl p-4">
                <div className="text-xs text-zinc-500 mb-1">Total Revenue</div>
                <div className="text-xl font-bold text-white">
                  KES {totalRevenue.toFixed(2)}
                </div>
              </div>
              <div className="bg-zinc-800/40 rounded-xl p-4">
                <div className="text-xs text-zinc-500 mb-1">
                  Total Commissions Payable
                </div>
                <div className="text-xl font-bold text-amber-400">
                  KES {totalCommissions.toFixed(2)}
                </div>
              </div>
              <div className="bg-zinc-800/40 rounded-xl p-4">
                <div className="text-xs text-zinc-500 mb-1">
                  Avg Commission Rate
                </div>
                <div className="text-xl font-bold text-indigo-400">
                  {resellers.length > 0
                    ? (
                        resellers.reduce(
                          (s, r) => s + (r.commission_rate || 0),
                          0,
                        ) / resellers.length
                      ).toFixed(1)
                    : 0}
                  %
                </div>
              </div>
            </div>
          </div>

          {/* Per-Reseller Breakdown */}
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 ring-1 ring-purple-500/20 flex items-center justify-center">
                <Users className="w-4 h-4 text-purple-400" />
              </div>
              <h3 className="text-base font-semibold text-white">
                Per-Reseller Commission Breakdown
              </h3>
            </div>
            {resellers.length === 0 ? (
              <div className="text-center text-zinc-500 py-8">
                No resellers yet
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th>Reseller</th>
                      <th>Rate</th>
                      <th>Revenue</th>
                      <th>Commission</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...resellers]
                      .sort((a, b) => {
                        const ca =
                          ((parseFloat(a.total_revenue) || 0) *
                            (a.commission_rate || 0)) /
                          100;
                        const cb =
                          ((parseFloat(b.total_revenue) || 0) *
                            (b.commission_rate || 0)) /
                          100;
                        return cb - ca;
                      })
                      .map((r) => {
                        const commission =
                          ((parseFloat(r.total_revenue) || 0) *
                            (r.commission_rate || 0)) /
                          100;
                        return (
                          <tr
                            key={r.id}
                            className="cursor-pointer hover:bg-zinc-800/30"
                            onClick={() => openResellerDetail(r)}
                          >
                            <td>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-semibold text-xs">
                                  {r.name?.charAt(0)}
                                </div>
                                <span className="text-white font-medium">
                                  {r.name}
                                </span>
                              </div>
                            </td>
                            <td>
                              <span className="badge badge-emerald">
                                {r.commission_rate}%
                              </span>
                            </td>
                            <td className="text-sm text-zinc-300">
                              KES{" "}
                              {(parseFloat(r.total_revenue) || 0).toFixed(2)}
                            </td>
                            <td className="text-sm text-amber-400 font-semibold">
                              KES {commission.toFixed(2)}
                            </td>
                            <td>
                              <StatusBadge status={r.status} />
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          RESELLER FORM MODAL
          ════════════════════════════════════════════════════════════ */}
      {showForm && editing && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setShowForm(false);
            setEditing(null);
          }}
        >
          <div
            className="glass-strong rounded-2xl w-full max-w-lg animate-fade-in-scale"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-zinc-800/50">
              <h3 className="text-lg font-semibold text-white">
                {editing.id ? "Edit Reseller" : "New Reseller"}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Name *
                  </label>
                  <input
                    required
                    value={editing.name || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, name: e.target.value })
                    }
                    className="modern-input"
                    placeholder="John Kamau"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Company
                  </label>
                  <input
                    value={editing.company || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, company: e.target.value })
                    }
                    className="modern-input"
                    placeholder="Kamau ISP"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={editing.email || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, email: e.target.value })
                    }
                    className="modern-input"
                    placeholder="john@kamau.co.ke"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Phone
                  </label>
                  <input
                    value={editing.phone || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, phone: e.target.value })
                    }
                    className="modern-input"
                    placeholder="+254..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Commission Rate (%)
                  </label>
                  <input
                    type="number"
                    value={editing.commission_rate || 10}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        commission_rate: parseFloat(e.target.value),
                      })
                    }
                    className="modern-input"
                    min="0"
                    max="100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Credit Limit
                  </label>
                  <input
                    type="number"
                    value={editing.credit_limit || 0}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        credit_limit: parseFloat(e.target.value),
                      })
                    }
                    className="modern-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Status
                  </label>
                  <select
                    value={editing.status || "active"}
                    onChange={(e) =>
                      setEditing({ ...editing, status: e.target.value })
                    }
                    className="modern-input"
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2 border-t border-zinc-800/50">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditing(null);
                  }}
                  className="btn-secondary flex-1"
                  disabled={formLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1"
                  disabled={formLoading}
                >
                  {formLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg
                        className="animate-spin w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Saving...
                    </span>
                  ) : editing.id ? (
                    "Update"
                  ) : (
                    "Create"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          RESELLER DETAIL SLIDE-OVER
          ════════════════════════════════════════════════════════════ */}
      {selectedReseller && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedReseller(null)}
        >
          <div
            className="absolute right-0 top-0 h-full w-full max-w-2xl bg-zinc-900 border-l border-zinc-800 overflow-y-auto animate-fade-in-scale shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800 p-6 z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-indigo-500/20">
                    {selectedReseller.name?.charAt(0) || "R"}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">
                      {selectedReseller.name}
                    </h2>
                    {selectedReseller.company && (
                      <div className="flex items-center gap-1.5 text-zinc-400 text-sm">
                        <Building2 className="w-3.5 h-3.5" />
                        {selectedReseller.company}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditing(selectedReseller);
                      setShowForm(true);
                    }}
                    className="btn-ghost p-2"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() =>
                      handleDelete(selectedReseller.id, selectedReseller.name)
                    }
                    className="btn-ghost p-2 text-zinc-500 hover:text-rose-400"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setSelectedReseller(null)}
                    className="btn-ghost p-2"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-4 gap-3 mt-5">
                <div className="bg-zinc-800/50 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-indigo-400">
                    {selectedReseller.commission_rate}%
                  </div>
                  <div className="text-xs text-zinc-500">Commission</div>
                </div>
                <div className="bg-zinc-800/50 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-blue-400">
                    {selectedReseller.customer_count || 0}
                  </div>
                  <div className="text-xs text-zinc-500">Customers</div>
                </div>
                <div className="bg-zinc-800/50 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-emerald-400">
                    KES{" "}
                    {(parseFloat(selectedReseller.total_revenue) || 0).toFixed(
                      0,
                    )}
                  </div>
                  <div className="text-xs text-zinc-500">Revenue</div>
                </div>
                <div className="bg-zinc-800/50 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-amber-400">
                    KES{" "}
                    {(
                      ((parseFloat(selectedReseller.total_revenue) || 0) *
                        (selectedReseller.commission_rate || 0)) /
                      100
                    ).toFixed(0)}
                  </div>
                  <div className="text-xs text-zinc-500">Commission Earned</div>
                </div>
              </div>

              {/* Detail Tabs */}
              <div className="flex gap-2 mt-5">
                {[
                  { id: "profile", label: "Profile", icon: UserCheck },
                  { id: "customers", label: "Customers", icon: Users },
                  { id: "vouchers", label: "Vouchers", icon: CreditCard },
                  { id: "topup", label: "Top-Up", icon: Wallet },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setDetailTab(tab.id);
                      if (tab.id === "customers" || tab.id === "vouchers")
                        {fetchResellerData(selectedReseller.id);}
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      detailTab === tab.id
                        ? "bg-indigo-600 text-white"
                        : "bg-zinc-800/40 text-zinc-400 hover:bg-zinc-700/50"
                    }`}
                  >
                    <tab.icon className="w-3.5 h-3.5" /> {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {detailTab === "profile" && (
                <div className="space-y-4">
                  <DetailRow
                    icon={Mail}
                    label="Email"
                    value={selectedReseller.email || "—"}
                  />
                  <DetailRow
                    icon={Phone}
                    label="Phone"
                    value={selectedReseller.phone || "—"}
                  />
                  <DetailRow
                    icon={Hash}
                    label="ID"
                    value={selectedReseller.id || "—"}
                  />
                  <DetailRow
                    icon={Percent}
                    label="Commission Rate"
                    value={`${selectedReseller.commission_rate}%`}
                  />
                  <DetailRow
                    icon={Wallet}
                    label="Credit Limit"
                    value={`KES ${(parseFloat(selectedReseller.credit_limit) || 0).toFixed(2)}`}
                  />
                  <div className="flex items-center justify-between py-3 border-b border-zinc-800/50">
                    <span className="text-sm text-zinc-400">Status</span>
                    <StatusBadge status={selectedReseller.status} />
                  </div>
                </div>
              )}

              {detailTab === "customers" && (
                <div>
                  {detailLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="skeleton h-12 rounded-xl" />
                      ))}
                    </div>
                  ) : resellerCustomers.length === 0 ? (
                    <div className="text-center text-zinc-500 py-8">
                      No customers found for this reseller
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {resellerCustomers.map((c, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between bg-zinc-800/30 rounded-xl p-3"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 font-semibold text-xs">
                              {(c.name || c.username || "C").charAt(0)}
                            </div>
                            <div>
                              <div className="text-sm text-white">
                                {c.name || c.username || c.id}
                              </div>
                              {c.email && (
                                <div className="text-xs text-zinc-500">
                                  {c.email}
                                </div>
                              )}
                            </div>
                          </div>
                          {c.status && <StatusBadge status={c.status} />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {detailTab === "vouchers" && (
                <div>
                  {detailLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="skeleton h-12 rounded-xl" />
                      ))}
                    </div>
                  ) : resellerVouchers.length === 0 ? (
                    <div className="text-center text-zinc-500 py-8">
                      No vouchers found for this reseller
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {resellerVouchers.map((v, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between bg-zinc-800/30 rounded-xl p-3"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                              <CreditCard className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="text-sm text-white">
                                {v.code || v.id || "Voucher"}
                              </div>
                              <div className="text-xs text-zinc-500">
                                {v.plan || v.duration || "—"}
                              </div>
                            </div>
                          </div>
                          <div className="text-sm text-zinc-400">
                            {v.price ? `KES ${v.price}` : v.status || "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {detailTab === "topup" && (
                <div>
                  <div className="bg-zinc-800/40 rounded-2xl p-6 text-center space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center">
                      <Wallet className="w-8 h-8 text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-sm text-zinc-400">
                        Current Balance
                      </div>
                      <div className="text-2xl font-bold text-white mt-1">
                        KES{" "}
                        {(
                          parseFloat(selectedReseller.credit_limit) || 0
                        ).toFixed(2)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 max-w-xs mx-auto">
                      <input
                        type="number"
                        value={topUpAmount}
                        onChange={(e) => setTopUpAmount(e.target.value)}
                        placeholder="Amount (KES)"
                        className="modern-input flex-1"
                        min="1"
                      />
                      <button
                        onClick={handleTopUp}
                        disabled={topUpLoading}
                        className="btn-primary whitespace-nowrap"
                      >
                        {topUpLoading ? (
                          <span className="flex items-center gap-2">
                            <svg
                              className="animate-spin w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              ></circle>
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                              ></path>
                            </svg>
                            Topping...
                          </span>
                        ) : (
                          "Top Up"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────── ExpandedRow (inline customer preview) ───────────────────
function ExpandedRow({ reseller, onViewFull }) {
  const [customers, setCustomers] = useState([]);
  const [loadingCust, setLoadingCust] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoadingCust(true);
      try {
        const token = getToken();
        const { data } = await axios.get(
          `${API}/customers?reseller_id=${reseller.id}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        );
        if (!cancelled)
          {setCustomers(Array.isArray(data) ? data.slice(0, 5) : []);}
      } catch {
        if (!cancelled) {setCustomers([]);}
      }
      if (!cancelled) {setLoadingCust(false);}
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [reseller.id]);

  const commission =
    ((parseFloat(reseller.total_revenue) || 0) *
      (reseller.commission_rate || 0)) /
    100;

  return (
    <div className="px-6 py-4 space-y-4 border-t border-indigo-500/10">
      {/* Quick stats bar */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-zinc-800/40 rounded-xl p-3">
          <div className="text-xs text-zinc-500">Commission Earned</div>
          <div className="text-sm font-semibold text-amber-400">
            KES {commission.toFixed(2)}
          </div>
        </div>
        <div className="bg-zinc-800/40 rounded-xl p-3">
          <div className="text-xs text-zinc-500">Credit Limit</div>
          <div className="text-sm font-semibold text-white">
            KES {(parseFloat(reseller.credit_limit) || 0).toFixed(2)}
          </div>
        </div>
        <div className="bg-zinc-800/40 rounded-xl p-3">
          <div className="text-xs text-zinc-500">Avg Voucher</div>
          <div className="text-sm font-semibold text-white">
            KES{" "}
            {reseller.customer_count > 0
              ? (
                  (parseFloat(reseller.total_revenue) || 0) /
                  reseller.customer_count
                ).toFixed(2)
              : "0.00"}
          </div>
        </div>
        <div className="bg-zinc-800/40 rounded-xl p-3">
          <div className="text-xs text-zinc-500">Status</div>
          <StatusBadge status={reseller.status} />
        </div>
      </div>

      {/* Customer preview */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-zinc-300">
            Recent Customers
          </h4>
          <button
            onClick={onViewFull}
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            View all <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
        {loadingCust ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="skeleton h-10 rounded-lg" />
            ))}
          </div>
        ) : customers.length === 0 ? (
          <div className="text-xs text-zinc-500 py-3">No customers yet</div>
        ) : (
          <div className="space-y-1.5">
            {customers.map((c, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-zinc-800/20 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center text-blue-400 text-xs font-semibold">
                    {(c.name || c.username || "C").charAt(0)}
                  </div>
                  <span className="text-sm text-zinc-300">
                    {c.name || c.username || `Customer #${c.id}`}
                  </span>
                </div>
                <span className="text-xs text-zinc-500">{c.email || ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────── DetailRow ───────────────────
function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-zinc-800/50">
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Icon className="w-4 h-4 text-zinc-500" />
        <span>{label}</span>
      </div>
      <span className="text-sm text-white">{value}</span>
    </div>
  );
}
