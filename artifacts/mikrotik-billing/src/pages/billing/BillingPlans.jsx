import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Plus, Edit2, Trash2, Zap, X, Search, Clock, Gauge, Tag,
  RefreshCw, Wifi, Users, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';

const API = import.meta.env.VITE_API_URL || '/api';

const emptyForm = {
  name: '', speed_up: '10M', speed_down: '10M',
  burst_limit: '', burst_threshold: '', burst_time: '', hotspot_profile: '',
  price: 25, quota_gb: '', priority: 8, description: '',
  plan_type: 'monthly', validity_days: 30, validity_hours: 0, validity_minutes: 0,
};

function validityLabel(plan) {
  const pieces = [];
  const d = Number(plan.validity_days) || 0;
  const h = Number(plan.validity_hours) || 0;
  const m = Number(plan.validity_minutes) || 0;
  if (d) {pieces.push(`${d}d`);}
  if (h) {pieces.push(`${h}h`);}
  if (m) {pieces.push(`${m}m`);}
  return pieces.join(' ') || '—';
}

function toForm(plan) {
  return {
    name: plan.name || '',
    speed_up: plan.speed_up || '',
    speed_down: plan.speed_down || '',
    burst_limit: plan.burst_limit || '',
    burst_threshold: plan.burst_threshold || '',
    burst_time: plan.burst_time || '',
    hotspot_profile: plan.hotspot_profile || '',
    price: plan.price ?? 25,
    quota_gb: plan.quota_gb ?? '',
    priority: plan.priority ?? 8,
    description: plan.description || '',
    plan_type: plan.plan_type || 'monthly',
    validity_days: plan.validity_days ?? 30,
    validity_hours: plan.validity_hours ?? 0,
    validity_minutes: plan.validity_minutes ?? 0,
  };
}

const QUICK_SPEEDS = ['1M', '2M', '5M', '10M', '20M', '50M', '100M', '1G'];

export function BillingPlans() {
  const toast = useToast();
  const [plans, setPlans] = useState([]);
  const [pushInfo, setPushInfo] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchPlans(); }, []);
  const fetchPlans = async () => {
    try {
      const { data } = await axios.get(`${API}/billing/plans`);
      setPlans(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('Failed to load plans', error.response?.data?.error || error.message);
    }
  };

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {return plans;}
    return plans.filter((plan) =>
      [plan.name, plan.description, plan.plan_type, plan.speed_up, plan.speed_down]
        .some((value) => String(value || '').toLowerCase().includes(term)));
  }, [plans, search]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        const { data } = await axios.put(`${API}/billing/plans/${editing.id}`, form);
        const push = data?.push;
        if (push?.total) {
          setPushInfo((previous) => ({ ...previous, [data.id]: push }));
          const kicked = push.live_updates?.filter((item) => item.kicked).length || 0;
          toast.success(
            `Plan saved and pushed to ${push.synced}/${push.total} subscriber(s)`,
            kicked ? `${kicked} active session(s) restarted to apply the new speed` : '',
          );
        } else {
          toast.success('Plan saved');
        }
      } else {
        await axios.post(`${API}/billing/plans`, form);
        toast.success('Plan created');
      }
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      await fetchPlans();
    } catch (error) {
      toast.error('Failed to save plan', error.response?.data?.error || error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this plan?')) {return;}
    try {
      await axios.delete(`${API}/billing/plans/${id}`);
      await fetchPlans();
      toast.success('Plan deleted');
    } catch (error) {
      toast.error('Failed to delete plan', error.response?.data?.error || error.message);
    }
  };

  const openEdit = (plan) => {
    setEditing(plan);
    setForm(toForm(plan));
    setShowForm(true);
  };

  return (
    <div className="relative min-h-full p-8 animate-fade-in">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-noise" />

      <header className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-yellow-400 flex items-center justify-center text-zinc-950 shadow-lg shadow-yellow-500/20">
              <Tag className="w-5 h-5" />
            </div>
            Service Plans <span className="text-zinc-500 text-lg font-normal">({plans.length})</span>
          </h1>
          <p className="text-zinc-400 mt-1">Speeds, validity and pricing — pushed instantly to subscribers.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search plans"
              className="modern-input h-10 pl-9 pr-3 text-sm w-full sm:w-56"
            />
          </label>
          <button
            type="button"
            onClick={() => { setEditing(null); setForm(emptyForm); setShowForm(true); }}
            className="btn-primary inline-flex items-center gap-2 h-10 px-4 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Add plan
          </button>
        </div>
      </header>

      {visible.length === 0 ? (
        <div className="relative glass rounded-2xl p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-yellow-400/10 ring-1 ring-yellow-400/20 flex items-center justify-center mx-auto mb-4">
            <Wifi className="w-8 h-8 text-yellow-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">{search ? 'No matching plans' : 'No plans yet'}</h3>
          <p className="text-zinc-500">
            {search ? 'Try a different search.' : 'Create your first service plan to get started.'}
          </p>
        </div>
      ) : (
        <div className="relative grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {visible.map((plan) => {
            const push = pushInfo[plan.id];
            const hotspot = plan.plan_type === 'hotspot';
            return (
              <article key={plan.id} className="glass rounded-2xl overflow-hidden border border-zinc-800/60 transition-colors hover:border-yellow-400/30">
                <div className="flex items-start justify-between gap-3 p-5 border-b border-zinc-800/60">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-400 shrink-0" />
                      <h2 className="text-base font-semibold text-white truncate">{plan.name}</h2>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="badge badge-violet">{hotspot ? 'Hotspot' : 'PPPoE'}</span>
                      <span className={`badge ${plan.is_active === false ? 'badge-red' : 'badge-green'}`}>
                        {plan.is_active === false ? 'Inactive' : 'Active'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEdit(plan)} className="btn-ghost p-2" title="Edit plan"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(plan.id)} className="btn-ghost p-2 text-zinc-500 hover:text-rose-400" title="Delete plan"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>

                <div className="p-5">
                  <p className="text-sm text-zinc-400 min-h-[40px]">{plan.description || 'No description'}</p>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-zinc-950/50 border border-zinc-800/60 p-3">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500"><Gauge className="w-3 h-3" /> Speed</div>
                      <div className="mt-1 font-semibold text-white">{plan.speed_up}<span className="text-zinc-600">/</span>{plan.speed_down}</div>
                      {plan.burst_limit && <div className="text-[10px] text-yellow-400 mt-1">burst {plan.burst_limit}</div>}
                    </div>
                    <div className="rounded-xl bg-zinc-950/50 border border-zinc-800/60 p-3">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500"><Clock className="w-3 h-3" /> Validity</div>
                      <div className="mt-1 font-semibold text-white">{validityLabel(plan)}</div>
                      <div className="text-[10px] text-zinc-500 mt-1">d · h · m</div>
                    </div>
                    <div className="rounded-xl bg-zinc-950/50 border border-zinc-800/60 p-3">
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500">Price</div>
                      <div className="mt-1 font-semibold text-emerald-400">KES {plan.price}{hotspot ? '' : '/mo'}</div>
                    </div>
                    <div className="rounded-xl bg-zinc-950/50 border border-zinc-800/60 p-3">
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500">Quota</div>
                      <div className="mt-1 font-semibold text-white">{plan.quota_gb ? `${plan.quota_gb} GB` : 'Unlimited'}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                    <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {plan.active_subscribers || 0} active subscriber{(plan.active_subscribers || 0) !== 1 ? 's' : ''}</span>
                    <span>Priority {plan.priority}</span>
                  </div>

                  {push && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 text-[11px] text-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        Pushed to {push.synced}/{push.total} subscribers
                        {push.live_updates?.some((item) => item.kicked) ? ' · live sessions restarted' : ''}
                      </span>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="relative glass w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-zinc-700/60">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800/60 bg-[#101614]/95 px-6 py-4 backdrop-blur">
              <div>
                <h2 className="text-lg font-semibold text-white">{editing ? 'Edit plan' : 'New plan'}</h2>
                <p className="text-xs text-zinc-500">Changes push immediately to subscribers.</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost p-2"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="plan-name">Plan name *</label>
                  <input id="plan-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="modern-input" placeholder="e.g. Gold 20M" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="plan-type">Service type</label>
                  <select id="plan-type" value={form.plan_type} onChange={(e) => setForm({ ...form, plan_type: e.target.value })} className="modern-input">
                    <option value="monthly">PPPoE / monthly</option>
                    <option value="hotspot">Hotspot package</option>
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm font-medium text-white">Validity</span>
                  <span className="ml-auto text-xs text-yellow-300">{validityLabel(form)}</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1" htmlFor="validity-days">Days</label>
                    <input id="validity-days" type="number" min="0" max="365" value={form.validity_days} onChange={(e) => setForm({ ...form, validity_days: Number(e.target.value) || 0 })} className="modern-input" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1" htmlFor="validity-hours">Hours</label>
                    <input id="validity-hours" type="number" min="0" max="23" value={form.validity_hours} onChange={(e) => setForm({ ...form, validity_hours: Number(e.target.value) || 0 })} className="modern-input" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1" htmlFor="validity-minutes">Minutes</label>
                    <input id="validity-minutes" type="number" min="0" max="59" value={form.validity_minutes} onChange={(e) => setForm({ ...form, validity_minutes: Number(e.target.value) || 0 })} className="modern-input" />
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">Example: 1 day 2 hours 30 minutes → 1d2h30m on the router.</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-white">Speed limits</label>
                  <span className="text-xs text-zinc-500">upload / download</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <input aria-label="Upload speed" required value={form.speed_up} onChange={(e) => setForm({ ...form, speed_up: e.target.value })} className="modern-input" placeholder="e.g. 5M, 1500k, 1G" />
                  <input aria-label="Download speed" required value={form.speed_down} onChange={(e) => setForm({ ...form, speed_down: e.target.value })} className="modern-input" placeholder="e.g. 20M, 500k, 1G" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-zinc-500 mr-1">Quick picks:</span>
                  {QUICK_SPEEDS.map((speed) => (
                    <button key={speed} type="button" onClick={() => setForm({ ...form, speed_down: speed })} className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-yellow-400/50 hover:text-yellow-300">{speed}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-white block mb-2">Burst (optional)</label>
                <div className="grid grid-cols-3 gap-3">
                  <input aria-label="Burst limit" value={form.burst_limit} onChange={(e) => setForm({ ...form, burst_limit: e.target.value })} className="modern-input" placeholder="20M" />
                  <input aria-label="Burst threshold" value={form.burst_threshold} onChange={(e) => setForm({ ...form, burst_threshold: e.target.value })} className="modern-input" placeholder="15M" />
                  <input aria-label="Burst time" value={form.burst_time} onChange={(e) => setForm({ ...form, burst_time: e.target.value })} className="modern-input" placeholder="10s" />
                </div>
                <p className="flex items-start gap-1.5 mt-2 text-[11px] text-zinc-500">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  Burst limit must be ≥ speeds and threshold ≤ burst limit, or RouterOS rejects the session.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="price">Price (KES) *</label>
                  <input id="price" type="number" min="1" step="0.01" required value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) || '' })} className="modern-input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="quota">Quota (GB, blank = unlimited)</label>
                  <input id="quota" type="number" value={form.quota_gb} onChange={(e) => setForm({ ...form, quota_gb: e.target.value ? Number(e.target.value) : null })} className="modern-input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="priority">Priority (1 highest)</label>
                  <input id="priority" type="number" min="1" max="8" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} className="modern-input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="hotspot-profile">Hotspot profile (router)</label>
                  <input id="hotspot-profile" value={form.hotspot_profile} onChange={(e) => setForm({ ...form, hotspot_profile: e.target.value })} className="modern-input" placeholder="billing-profile" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="description">Description</label>
                <textarea id="description" rows="2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="modern-input resize-none" placeholder="Short note about this plan" />
              </div>

              <div className="flex gap-3 pt-4 border-t border-zinc-800/60">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 inline-flex items-center justify-center gap-2">
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {editing ? 'Save changes' : 'Create plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
