import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  Users,
  UserPlus,
  Search,
  Edit,
  Trash2,
  Key,
  CheckCircle,
  XCircle,
  X,
  Loader2,
  AlertTriangle,
  Clock,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useToast } from "../hooks/useToast";
import { getToken } from "../lib/auth";

const API = import.meta.env.VITE_API_URL || "/api";

function getPasswordStrength(password) {
  if (!password) {return { score: 0, label: "", color: "" };}

  let score = 0;
  if (password.length >= 8) {score++;}
  if (password.length >= 12) {score++;}
  if (/[A-Z]/.test(password)) {score++;}
  if (/[a-z]/.test(password)) {score++;}
  if (/[0-9]/.test(password)) {score++;}
  if (/[^A-Za-z0-9]/.test(password)) {score++;}

  if (score <= 2) {return { score, label: "Weak", color: "#ef4444" };}
  if (score <= 3) {return { score, label: "Fair", color: "#f59e0b" };}
  if (score <= 4) {return { score, label: "Good", color: "#3b82f6" };}
  return { score, label: "Strong", color: "#22c55e" };
}

const ROLES = {
  ADMIN: "admin",
  STAFF: "staff",
  TECHNICIAN: "technician",
  RESELLER: "reseller",
  CUSTOMER: "customer",
  CUSTOMER_CARE: "customer_care",
  SALES_TEAM: "sales_team",
};

const ROLE_COLORS = {
  admin: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  staff: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  technician: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  reseller: "bg-green-500/20 text-green-400 border-green-500/30",
  customer: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  customer_care: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  sales_team: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
};

const STATUS_COLORS = {
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  disabled: "bg-red-500/20 text-red-400 border-red-500/30",
};

/* ─── Role Badge ─── */
function RoleBadge({ role }) {
  const colorClass = ROLE_COLORS[role] || ROLE_COLORS.customer;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}
    >
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  );
}

/* ─── Status Badge ─── */
function StatusBadge({ isActive }) {
  const status = isActive ? "active" : "disabled";
  const colorClass = STATUS_COLORS[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}
    >
      {isActive ? (
        <CheckCircle className="w-3 h-3" />
      ) : (
        <XCircle className="w-3 h-3" />
      )}
      {isActive ? "Active" : "Disabled"}
    </span>
  );
}

/* ─── Stats Card ─── */
function StatsCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
            {label}
          </p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
        </div>
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

/* ─── Create User Modal ─── */
function CreateUserModal({ onClose, onSuccess }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: ROLES.STAFF,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const strength = getPasswordStrength(form.password);
    if (strength.score < 3) {
      setError(
        "Password is too weak. Use at least 8 characters with a mix of letters, numbers, and symbols.",
      );
      return;
    }

    setLoading(true);

    try {
      const token = getToken();
      const { data } = await axios.post(`${API}/users`, form, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("User created successfully");
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create user");
      toast.error(
        "Failed to create user",
        err.response?.data?.error || err.message,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h3 className="text-lg font-semibold text-white">Create New User</h3>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              placeholder="Enter full name"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Email
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              placeholder="Enter email address"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              placeholder="Minimum 6 characters"
            />
            {form.password && (
              <div className="mt-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${(getPasswordStrength(form.password).score / 6) * 100}%`,
                        backgroundColor: getPasswordStrength(form.password)
                          .color,
                      }}
                    />
                  </div>
                  <span
                    className="text-xs font-medium"
                    style={{ color: getPasswordStrength(form.password).color }}
                  >
                    {getPasswordStrength(form.password).label}
                  </span>
                </div>
                <div className="flex gap-1 text-[10px] text-zinc-600">
                  <span
                    className={
                      form.password.length >= 8 ? "text-emerald-500" : ""
                    }
                  >
                    8+ chars
                  </span>
                  <span>•</span>
                  <span
                    className={
                      /[A-Z]/.test(form.password) ? "text-emerald-500" : ""
                    }
                  >
                    Upper
                  </span>
                  <span>•</span>
                  <span
                    className={
                      /[0-9]/.test(form.password) ? "text-emerald-500" : ""
                    }
                  >
                    Digit
                  </span>
                  <span>•</span>
                  <span
                    className={
                      /[^A-Za-z0-9]/.test(form.password)
                        ? "text-emerald-500"
                        : ""
                    }
                  >
                    Symbol
                  </span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Role
            </label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              {Object.values(ROLES).map((role) => (
                <option key={role} value={role}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-zinc-800 text-zinc-400 rounded-lg hover:bg-zinc-700 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              Create User
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Edit User Modal ─── */
function EditUserModal({ user, onClose, onSuccess }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: user.name,
    role: user.role,
    is_active: user.is_active,
  });
  const [loading, setLoading] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = getToken();
      await axios.put(`${API}/users/${user.id}`, form, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("User updated successfully");
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(
        "Failed to update user",
        err.response?.data?.error || err.message,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    const strength = getPasswordStrength(newPassword);
    if (strength.score < 3) {
      toast.error(
        "Password is too weak. Use at least 8 characters with a mix of letters, numbers, and symbols.",
      );
      return;
    }

    setResetLoading(true);
    try {
      const token = getToken();
      await axios.post(
        `${API}/users/${user.id}/reset-password`,
        { new_password: newPassword },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success("Password reset successfully");
      setShowResetPassword(false);
      setNewPassword("");
    } catch (err) {
      toast.error(
        "Failed to reset password",
        err.response?.data?.error || err.message,
      );
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h3 className="text-lg font-semibold text-white">Edit User</h3>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleUpdate} className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Role
            </label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              {Object.values(ROLES).map((role) => (
                <option key={role} value={role}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Status
            </label>
            <select
              value={form.is_active}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value={true}>Active</option>
              <option value={false}>Disabled</option>
            </select>
          </div>

          <div className="pt-2 border-t border-zinc-800">
            {!showResetPassword ? (
              <button
                type="button"
                onClick={() => setShowResetPassword(true)}
                className="flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300"
              >
                <Key className="w-4 h-4" />
                Reset Password
              </button>
            ) : (
              <div className="space-y-3 p-3 bg-zinc-800/50 rounded-lg">
                <label className="block text-xs font-medium text-zinc-400">
                  New Password
                </label>
                <input
                  type="password"
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  placeholder="Minimum 6 characters"
                />
                {newPassword && (
                  <div className="mt-2">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${(getPasswordStrength(newPassword).score / 6) * 100}%`,
                            backgroundColor:
                              getPasswordStrength(newPassword).color,
                          }}
                        />
                      </div>
                      <span
                        className="text-xs font-medium"
                        style={{
                          color: getPasswordStrength(newPassword).color,
                        }}
                      >
                        {getPasswordStrength(newPassword).label}
                      </span>
                    </div>
                    <div className="flex gap-1 text-[10px] text-zinc-600">
                      <span
                        className={
                          newPassword.length >= 8 ? "text-emerald-500" : ""
                        }
                      >
                        8+ chars
                      </span>
                      <span>•</span>
                      <span
                        className={
                          /[A-Z]/.test(newPassword) ? "text-emerald-500" : ""
                        }
                      >
                        Upper
                      </span>
                      <span>•</span>
                      <span
                        className={
                          /[0-9]/.test(newPassword) ? "text-emerald-500" : ""
                        }
                      >
                        Digit
                      </span>
                      <span>•</span>
                      <span
                        className={
                          /[^A-Za-z0-9]/.test(newPassword)
                            ? "text-emerald-500"
                            : ""
                        }
                      >
                        Symbol
                      </span>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowResetPassword(false);
                      setNewPassword("");
                    }}
                    className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={resetLoading}
                    className="px-3 py-1.5 bg-amber-600 text-white text-xs rounded-lg hover:bg-amber-500 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {resetLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Key className="w-3 h-3" />
                    )}
                    Reset
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-zinc-800 text-zinc-400 rounded-lg hover:bg-zinc-700 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Edit className="w-4 h-4" />
              )}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Disable Confirmation Modal ─── */
function DisableConfirmModal({ user, onClose, onConfirm }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-red-500/20 rounded-2xl w-full max-w-sm">
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Disable User</h3>
              <p className="text-xs text-zinc-500">
                This action can be reversed
              </p>
            </div>
          </div>
          <p className="text-sm text-zinc-400">
            Are you sure you want to disable{" "}
            <span className="text-white font-medium">{user.name}</span>? They
            will no longer be able to log in.
          </p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-zinc-800 text-zinc-400 rounded-lg hover:bg-zinc-700 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 text-sm font-medium flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Disable
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main User Management Page ─── */
export function UserManagement() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    disabled: 0,
    byRole: {},
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [disablingUser, setDisablingUser] = useState(null);

  useEffect(() => {
    fetchUsers();
    fetchStats();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams();
      if (roleFilter) {params.set("role", roleFilter);}
      if (statusFilter) {params.set("status", statusFilter);}
      if (search) {params.set("search", search);}

      const { data } = await axios.get(`${API}/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(data);
    } catch (err) {
      toast.error(
        "Failed to load users",
        err.response?.data?.error || err.message,
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const token = getToken();
      const { data } = await axios.get(`${API}/users/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(data);
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  };

  const handleDisableUser = async () => {
    try {
      const token = getToken();
      await axios.delete(`${API}/users/${disablingUser.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("User disabled");
      setDisablingUser(null);
      fetchUsers();
      fetchStats();
    } catch (err) {
      toast.error(
        "Failed to disable user",
        err.response?.data?.error || err.message,
      );
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) {return "Never";}
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatLastSeen = (dateStr) => {
    if (!dateStr) {return "Never";}
    const now = new Date();
    const lastSeen = new Date(dateStr);
    const diffMs = now - lastSeen;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {return "Just now";}
    if (diffMins < 60) {return `${diffMins}m ago`;}
    if (diffHours < 24) {return `${diffHours}h ago`;}
    if (diffDays < 7) {return `${diffDays}d ago`;}
    return formatDate(dateStr);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Manage users, roles, and permissions
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 text-sm font-medium"
        >
          <UserPlus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          label="Total Users"
          value={stats.total}
          icon={Users}
          color="bg-blue-500/20 text-blue-400"
        />
        <StatsCard
          label="Active"
          value={stats.active}
          icon={CheckCircle}
          color="bg-emerald-500/20 text-emerald-400"
        />
        <StatsCard
          label="Disabled"
          value={stats.disabled}
          icon={XCircle}
          color="bg-red-500/20 text-red-400"
        />
        <StatsCard
          label="Admins"
          value={stats.byRole.admin || 0}
          icon={Users}
          color="bg-purple-500/20 text-purple-400"
        />
      </div>

      {/* Filters */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg pl-9 pr-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="">All Roles</option>
            {Object.values(ROLES).map((role) => (
              <option key={role} value={role}>
                {role.charAt(0).toUpperCase() + role.slice(1)}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
          <button
            onClick={() => {
              setSearch("");
              setRoleFilter("");
              setStatusFilter("");
            }}
            className="px-4 py-2 bg-zinc-800 text-zinc-400 rounded-lg hover:bg-zinc-700 text-sm font-medium"
          >
            Clear
          </button>
          <button
            onClick={fetchUsers}
            className="px-4 py-2 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 text-sm font-medium"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800/50">
                <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                  User
                </th>
                <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                  Role
                </th>
                <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                  Status
                </th>
                <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                  Online
                </th>
                <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                  Last Seen
                </th>
                <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                  Created
                </th>
                <th className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/30">
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-zinc-500"
                  >
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading users...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-zinc-500"
                  >
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-zinc-800/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-medium">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">
                            {user.name}
                          </p>
                          <p className="text-xs text-zinc-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge isActive={user.is_active} />
                    </td>
                    <td className="px-4 py-3">
                      {user.is_online ? (
                        <div className="flex items-center gap-1.5 text-emerald-400">
                          <div className="w-2 h-2 rounded-full bg-emerald-400 status-dot" />
                          <span className="text-xs font-medium">Online</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-zinc-500">
                          <WifiOff className="w-3 h-3" />
                          <span className="text-xs">Offline</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-400">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-zinc-500" />
                        {formatLastSeen(user.last_seen)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-500">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingUser(user)}
                          className="p-1.5 text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                          title="Edit user"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        {user.is_active ? (
                          <button
                            onClick={() => setDisablingUser(user)}
                            className="p-1.5 text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                            title="Disable user"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={async () => {
                              try {
                                const token = getToken();
                                await axios.post(
                                  `${API}/users/${user.id}/enable`,
                                  {},
                                  {
                                    headers: {
                                      Authorization: `Bearer ${token}`,
                                    },
                                  },
                                );
                                toast.success("User enabled");
                                fetchUsers();
                                fetchStats();
                              } catch (err) {
                                toast.error(
                                  "Failed to enable user",
                                  err.response?.data?.error || err.message,
                                );
                              }
                            }}
                            className="p-1.5 text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                            title="Enable user"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            if (
                              !confirm(
                                `Are you sure you want to permanently delete ${user.name}? This action cannot be undone.`,
                              )
                            ) {
                              return;
                            }
                            try {
                              const token = getToken();
                              await axios.delete(
                                `${API}/users/${user.id}/permanent`,
                                {
                                  headers: { Authorization: `Bearer ${token}` },
                                },
                              );
                              toast.success("User deleted permanently");
                              fetchUsers();
                              fetchStats();
                            } catch (err) {
                              toast.error(
                                "Failed to delete user",
                                err.response?.data?.error || err.message,
                              );
                            }
                          }}
                          className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Delete user permanently"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            fetchUsers();
            fetchStats();
          }}
        />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSuccess={() => {
            fetchUsers();
            fetchStats();
          }}
        />
      )}

      {disablingUser && (
        <DisableConfirmModal
          user={disablingUser}
          onClose={() => setDisablingUser(null)}
          onConfirm={handleDisableUser}
        />
      )}
    </div>
  );
}

export default UserManagement;
