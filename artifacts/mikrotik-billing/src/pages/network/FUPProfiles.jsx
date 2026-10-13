import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Gauge, Plus, Edit, Trash2, Save, X, AlertCircle,
  CheckCircle, Clock, Zap, Activity, Package
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

export function FUPProfiles() {
  const [profiles, setProfiles] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    data_limit: '',
    data_limit_unit: 'GB',
    reset_period: 'monthly',
    throttle_speed: '',
    priority: 100,
    is_active: true,
    plan_id: '',
  });

  useEffect(() => {
    fetchProfiles();
    axios.get(`${API}/billing/plans`).then(r => setPlans(r.data)).catch(() => {});
  }, []);

  const fetchProfiles = async () => {
    try {
      const { data } = await axios.get(`${API}/fup`);
      setProfiles(data);
    } catch (e) {
      console.error('Failed to fetch FUP profiles:', e);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editing) {
        await axios.put(`${API}/fup/${editing.id}`, form);
      } else {
        await axios.post(`${API}/fup`, form);
      }
      await fetchProfiles();
      setShowForm(false);
      setEditing(null);
      setForm({
        name: '',
        description: '',
        data_limit: '',
        data_limit_unit: 'GB',
        reset_period: 'monthly',
        throttle_speed: '',
        priority: 100,
        is_active: true,
      });
    } catch (e) {
      alert(`Failed to ${editing ? 'update' : 'create'} FUP profile: ${e.response?.data?.error || e.message}`);
    }

    setLoading(false);
  };

  const handleEdit = (profile) => {
    setEditing(profile);
    setForm(profile);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this FUP profile?')) {return;}
    try {
      await axios.delete(`${API}/fup/${id}`);
      fetchProfiles();
    } catch (e) {
      alert('Failed to delete FUP profile');
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditing(null);
    setForm({
      name: '',
      description: '',
      data_limit: '',
      data_limit_unit: 'GB',
      reset_period: 'monthly',
      throttle_speed: '',
      priority: 100,
      is_active: true,
    });
  };

  return (
    <div className="relative min-h-full p-8 animate-fade-in">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-noise" />

      {/* Header */}
      <div className="relative flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Gauge className="w-4 h-4 text-white" />
            </div>
            Fair Usage Policy (FUP)
          </h1>
          <p className="text-zinc-400 mt-1">Manage bandwidth throttling profiles for data limits</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> New Profile
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="relative glass rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-semibold text-white">
              {editing ? 'Edit FUP Profile' : 'Create FUP Profile'}
            </h3>
            <button onClick={handleCancel} className="btn-ghost p-2">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Profile Name</label>
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="modern-input"
                placeholder="e.g., Home Basic, Business Premium"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="modern-input"
                rows={2}
                placeholder="Optional description of this FUP profile"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Data Limit</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    value={form.data_limit}
                    onChange={e => setForm({ ...form, data_limit: e.target.value })}
                    className="modern-input pr-10"
                    placeholder="100"
                    min="0"
                    step="1"
                    required
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, data_limit: parseInt(form.data_limit || 0) + 1 })}
                      className="text-zinc-400 hover:text-white text-xs leading-none"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, data_limit: Math.max(0, parseInt(form.data_limit || 0) - 1) })}
                      className="text-zinc-400 hover:text-white text-xs leading-none"
                    >
                      ▼
                    </button>
                  </div>
                </div>
                <select
                  value={form.data_limit_unit}
                  onChange={e => setForm({ ...form, data_limit_unit: e.target.value })}
                  className="modern-input w-24"
                >
                  <option value="MB">MB</option>
                  <option value="GB">GB</option>
                  <option value="TB">TB</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Reset Period</label>
              <select
                value={form.reset_period}
                onChange={e => setForm({ ...form, reset_period: e.target.value })}
                className="modern-input"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="never">Never</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Throttle Speed</label>
              <input
                value={form.throttle_speed}
                onChange={e => setForm({ ...form, throttle_speed: e.target.value })}
                className="modern-input"
                placeholder="e.g., 1M/1M, 512K/512K"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Link to Plan</label>
              <select
                value={form.plan_id}
                onChange={e => setForm({ ...form, plan_id: e.target.value })}
                className="modern-input"
              >
                <option value="">All plans (global)</option>
                {plans.map(p => (
                  <option key={p.id} value={p.id}>{p.name} — {p.speed_up}/{p.speed_down} @ {p.price}/mo</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Priority</label>
              <input
                type="number"
                value={form.priority}
                onChange={e => setForm({ ...form, priority: parseInt(e.target.value) })}
                className="modern-input"
                min="1"
                max="1000"
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-violet-500"
                />
                <span className="text-sm text-zinc-300">Active</span>
              </label>
            </div>
            <div className="md:col-span-2 flex gap-3 pt-2">
              <button type="submit" disabled={loading} className="btn-primary flex-1">
                {loading ? <Activity className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editing ? 'Update Profile' : 'Create Profile'}
              </button>
              <button type="button" onClick={handleCancel} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Profiles List */}
      <div className="relative glass rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800/50">
          <h3 className="text-sm font-medium text-zinc-300">FUP Profiles ({profiles.length})</h3>
        </div>
        <table className="modern-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Data Limit</th>
              <th>Reset Period</th>
              <th>Throttle Speed</th>
              <th>Priority</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => (
              <tr key={profile.id}>
                <td>
                  <div>
                    <div className="font-medium text-white">{profile.name}</div>
                    {profile.description && (
                      <div className="text-xs text-zinc-500">{profile.description}</div>
                    )}
                  </div>
                </td>
                <td className="font-mono text-sm text-white">
                  {profile.data_limit} {profile.data_limit_unit}
                </td>
                <td className="text-sm text-zinc-400 capitalize">{profile.reset_period}</td>
                <td className="font-mono text-sm text-zinc-400">{profile.throttle_speed || '—'}</td>
                <td className="text-sm text-zinc-400">{profile.priority}</td>
                <td>
                  {profile.is_active ? (
                    <span className="badge badge-emerald">Active</span>
                  ) : (
                    <span className="badge badge-zinc">Inactive</span>
                  )}
                </td>
                <td>
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => handleEdit(profile)} className="btn-ghost p-2" title="Edit">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(profile.id)} className="btn-ghost p-2 text-zinc-500 hover:text-rose-400" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {profiles.length === 0 && (
          <div className="p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-violet-500/10 ring-1 ring-violet-500/20 flex items-center justify-center mx-auto mb-4">
              <Gauge className="w-8 h-8 text-violet-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">No FUP profiles</h3>
            <p className="text-zinc-500">Create your first Fair Usage Policy profile to manage bandwidth limits</p>
          </div>
        )}
      </div>
    </div>
  );
}
