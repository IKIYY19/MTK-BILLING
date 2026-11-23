import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  Activity, AlertTriangle, CheckCircle2, Clock3, Gauge, Pencil, Play,
  Plus, RefreshCw, ShieldCheck, Trash2, Users, X, Zap,
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import './fup.css';

const API = import.meta.env.VITE_API_URL || '/api';

const EMPTY_FORM = {
  name: '',
  description: '',
  data_limit: '',
  data_limit_unit: 'GB',
  reset_period: 'monthly',
  throttle_speed: '',
  priority: 100,
  is_active: true,
  plan_id: '',
};

const shortDate = (value) => value
  ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  : '—';

function Metric({ icon: Icon, label, value, detail, tone }) {
  return (
    <div className={`fup-metric fup-metric--${tone}`}>
      <span className="fup-metric__icon"><Icon size={18} /></span>
      <div>
        <span className="fup-metric__label">{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

export function FUPProfiles() {
  const toast = useToast();
  const [profiles, setProfiles] = useState([]);
  const [plans, setPlans] = useState([]);
  const [statusRows, setStatusRows] = useState([]);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    try {
      const [profileRes, planRes, statusRes] = await Promise.all([
        axios.get(`${API}/fup`),
        axios.get(`${API}/billing/plans`),
        axios.get(`${API}/fup/status`).catch(() => ({ data: [] })),
      ]);
      setProfiles(Array.isArray(profileRes.data) ? profileRes.data : []);
      setPlans(Array.isArray(planRes.data) ? planRes.data : []);
      setStatusRows(Array.isArray(statusRes.data) ? statusRes.data : []);
    } catch (error) {
      toast.error('Could not load FUP data', error.response?.data?.error || error.message);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDrawer(true);
  };

  const openEdit = (profile) => {
    setEditing(profile);
    setForm({
      name: profile.name || '',
      description: profile.description || '',
      data_limit: String(profile.data_limit ?? ''),
      data_limit_unit: profile.data_limit_unit || 'GB',
      reset_period: profile.reset_period || 'monthly',
      throttle_speed: profile.throttle_speed || '',
      priority: Number(profile.priority || 100),
      is_active: profile.is_active !== false,
      plan_id: profile.plan_id || '',
    });
    setDrawer(true);
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy('save');
    try {
      const payload = { ...form, priority: Number(form.priority) };
      if (editing) {
        await axios.put(`${API}/fup/${editing.id}`, payload);
      } else {
        await axios.post(`${API}/fup`, payload);
      }
      toast.success(editing ? 'FUP profile updated' : 'FUP profile created');
      setDrawer(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      await load();
    } catch (error) {
      toast.error('Could not save FUP profile', error.response?.data?.error || error.message);
    } finally {
      setBusy('');
    }
  };

  const remove = async (profile) => {
    if (!window.confirm(`Delete "${profile.name}"? Subscribers currently throttled by it will be restored on the next check.`)) return;
    try {
      await axios.delete(`${API}/fup/${profile.id}`);
      toast.success('FUP profile deleted');
      await load();
    } catch (error) {
      toast.error('Could not delete FUP profile', error.response?.data?.error || error.message);
    }
  };

  const runCheck = async () => {
    setBusy('check');
    try {
      const { data } = await axios.post(`${API}/fup/evaluate`);
      setResults(data);
      await load();
      toast.success(
        'FUP check complete',
        `${data.throttled?.length || 0} throttled · ${data.restored?.length || 0} restored · ${data.errors?.length || 0} errors`,
      );
    } catch (error) {
      toast.error('FUP check failed', error.response?.data?.error || error.message);
    } finally {
      setBusy('');
    }
  };

  const activeCount = profiles.filter((p) => p.is_active).length;
  const coveredPlans = new Set(profiles.filter((p) => p.is_active && p.plan_id).map((p) => p.plan_id)).size;

  return (
    <div className="fup-page">
      <header className="fup-header">
        <div className="fup-header__title">
          <span className="fup-header__icon"><Gauge size={22} /></span>
          <div>
            <h1>Fair Usage Policy</h1>
            <p>Throttle heavy users automatically when they exceed their monthly data allowance.</p>
          </div>
        </div>
        <div className="fup-header__actions">
          <button className="fup-btn fup-btn--ghost" onClick={runCheck} disabled={busy === 'check'}>
            {busy === 'check' ? <RefreshCw className="fup-spin" size={16} /> : <Play size={16} />}
            Run check
          </button>
          <button className="fup-btn fup-btn--primary" onClick={openCreate}>
            <Plus size={16} /> New profile
          </button>
        </div>
      </header>

      <div className="fup-metrics">
        <Metric icon={ShieldCheck} label="Active profiles" value={activeCount} detail={`${profiles.length} total`} tone="violet" />
        <Metric icon={Users} label="Throttled now" value={statusRows.length} detail="subscribers limited" tone="amber" />
        <Metric icon={Zap} label="Plans covered" value={coveredPlans} detail="plan-specific policies" tone="blue" />
        <Metric icon={Clock3} label="Last check" value={results ? `${results.throttled?.length || 0} changes` : 'Auto'} detail="runs every 10 minutes" tone="emerald" />
      </div>

      <section className="fup-how">
        <div className="fup-how__head"><Activity size={16} /> How enforcement works</div>
        <div className="fup-how__steps">
          <div><span>1</span><p>RADIUS accounting records each session's upload and download.</p></div>
          <div><span>2</span><p>The FUP engine compares usage with your profile limit and reset period.</p></div>
          <div><span>3</span><p>Over-limit users get the reduced speed in <code>radreply</code> and are disconnected so it applies.</p></div>
        </div>
      </section>

      {(results || busy === 'check') && (
        <section className="fup-results">
          <div className="fup-section__title">
            <h2>Last evaluation</h2>
            <button className="fup-link" onClick={() => setResults(null)}>Dismiss</button>
          </div>
          {busy === 'check' ? (
            <p className="fup-muted">Evaluating subscribers…</p>
          ) : (
            <div className="fup-results__grid">
              <div><strong>{results?.evaluated || 0}</strong><span>Evaluated</span></div>
              <div className="is-amber"><strong>{results?.throttled?.length || 0}</strong><span>Throttled</span></div>
              <div className="is-emerald"><strong>{results?.restored?.length || 0}</strong><span>Restored</span></div>
              <div className="is-rose"><strong>{results?.errors?.length || 0}</strong><span>Errors</span></div>
            </div>
          )}
        </section>
      )}

      <section className="fup-section">
        <div className="fup-section__title">
          <h2>Profiles <span>{profiles.length}</span></h2>
          <p>Plan-specific profiles override global ones. Lower priority number wins.</p>
        </div>

        {profiles.length === 0 ? (
          <div className="fup-empty">
            <span><Gauge size={30} /></span>
            <h3>No FUP profiles yet</h3>
            <p>Create a profile to start limiting heavy data users automatically.</p>
            <button className="fup-btn fup-btn--primary" onClick={openCreate}><Plus size={16} /> Create first profile</button>
          </div>
        ) : (
          <div className="fup-grid">
            {profiles.map((profile) => {
              const plan = plans.find((p) => p.id === profile.plan_id);
              return (
                <article key={profile.id} className={`fup-card ${profile.is_active ? '' : 'is-inactive'}`}>
                  <div className="fup-card__top">
                    <div>
                      <h3>{profile.name}</h3>
                      <p>{profile.description || 'No description'}</p>
                    </div>
                    <span className={`fup-badge ${profile.is_active ? 'is-active' : ''}`}>
                      {profile.is_active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <div className="fup-card__limit">
                    <strong>{profile.data_limit}</strong>
                    <span>{profile.data_limit_unit}</span>
                  </div>
                  <div className="fup-card__meta">
                    <div><Clock3 size={14} /> Resets {profile.reset_period}</div>
                    <div><Zap size={14} /> {profile.throttle_speed || '512k/512k'}</div>
                    <div><ShieldCheck size={14} /> {plan ? plan.name : 'All plans'}</div>
                    <div>Priority {profile.priority}</div>
                  </div>
                  <div className="fup-card__actions">
                    <button onClick={() => openEdit(profile)}><Pencil size={14} /> Edit</button>
                    <button className="is-danger" onClick={() => remove(profile)}><Trash2 size={14} /> Delete</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {statusRows.length > 0 && (
        <section className="fup-section">
          <div className="fup-section__title">
            <h2>Currently throttled</h2>
            <p>These subscribers are on reduced speed until their usage window resets.</p>
          </div>
          <div className="fup-table-wrap">
            <table className="fup-table">
              <thead><tr><th>Subscriber</th><th>Plan</th><th>Applied</th><th>Resets</th></tr></thead>
              <tbody>
                {statusRows.map((row) => (
                  <tr key={row.id}>
                    <td><CheckCircle2 size={14} /> {row.pppoe_username}</td>
                    <td>{row.plan_name || '—'}</td>
                    <td>{shortDate(row.fup_applied_at)}</td>
                    <td>{shortDate(row.fup_reset_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {drawer && (
        <div className="fup-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDrawer(false); }}>
          <aside className="fup-drawer">
            <div className="fup-drawer__head">
              <div>
                <span>{editing ? 'Edit profile' : 'New profile'}</span>
                <h2>{editing ? editing.name : 'Fair usage rule'}</h2>
              </div>
              <button className="fup-icon-btn" onClick={() => setDrawer(false)}><X size={18} /></button>
            </div>
            <form onSubmit={save} className="fup-drawer__form">
              <label className="fup-field">
                <span>Profile name</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Home 200GB" required />
              </label>
              <label className="fup-field">
                <span>Description</span>
                <textarea rows="2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this policy does" />
              </label>
              <div className="fup-field-row">
                <label className="fup-field">
                  <span>Data allowance</span>
                  <input type="number" min="1" step="1" value={form.data_limit} onChange={(e) => setForm({ ...form, data_limit: e.target.value })} placeholder="200" required />
                </label>
                <label className="fup-field fup-field--unit">
                  <span>Unit</span>
                  <select value={form.data_limit_unit} onChange={(e) => setForm({ ...form, data_limit_unit: e.target.value })}>
                    <option value="MB">MB</option><option value="GB">GB</option><option value="TB">TB</option>
                  </select>
                </label>
              </div>
              <label className="fup-field">
                <span>Reset period</span>
                <select value={form.reset_period} onChange={(e) => setForm({ ...form, reset_period: e.target.value })}>
                  <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="never">Never</option>
                </select>
              </label>
              <label className="fup-field">
                <span>Throttle speed</span>
                <input value={form.throttle_speed} onChange={(e) => setForm({ ...form, throttle_speed: e.target.value })} placeholder="e.g. 1M/1M or 512k" />
                <small>Applied to subscribers once they pass the allowance.</small>
              </label>
              <label className="fup-field">
                <span>Plan</span>
                <select value={form.plan_id} onChange={(e) => setForm({ ...form, plan_id: e.target.value })}>
                  <option value="">All plans (global fallback)</option>
                  {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                </select>
              </label>
              <label className="fup-field">
                <span>Priority</span>
                <input type="number" min="1" max="1000" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
                <small>Lower numbers are evaluated first.</small>
              </label>
              <label className="fup-switch">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                <span className="fup-switch__track" />
                <span><strong>Profile active</strong><small>Disabled profiles are ignored by the engine.</small></span>
              </label>
              {!form.throttle_speed && (
                <div className="fup-hint"><AlertTriangle size={15} /> Defaults to 512k/512k when left empty.</div>
              )}
              <div className="fup-drawer__actions">
                <button type="button" className="fup-btn fup-btn--ghost" onClick={() => setDrawer(false)}>Cancel</button>
                <button type="submit" className="fup-btn fup-btn--primary" disabled={busy === 'save'}>
                  {busy === 'save' ? <RefreshCw className="fup-spin" size={16} /> : <CheckCircle2 size={16} />}
                  {editing ? 'Save changes' : 'Create profile'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}
