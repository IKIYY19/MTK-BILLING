import React, { useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle, CheckCircle, Copy, Download, Link2, RefreshCw,
  Rocket, Search, ShieldCheck, XCircle,
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';

const API = import.meta.env.VITE_API_URL || '/api';

const MODES = [
  { value: '802.3ad', label: '802.3ad / LACP (recommended)' },
  { value: 'active-backup', label: 'Active-backup (failover only)' },
  { value: 'balance-xor', label: 'Balance-xor (static LAG)' },
  { value: 'balance-rr', label: 'Balance-rr (not recommended)' },
];

export function BondingPanel({ routers }) {
  const toast = useToast();
  const [routerId, setRouterId] = useState('');
  const [scan, setScan] = useState(null);
  const [selected, setSelected] = useState([]);
  const [bondName, setBondName] = useState('bond1');
  const [mode, setMode] = useState('802.3ad');
  const [hashPolicy, setHashPolicy] = useState('layer-2-and-3');
  const [minLinks, setMinLinks] = useState(1);
  const [primary, setPrimary] = useState('');
  const [script, setScript] = useState('');
  const [showScript, setShowScript] = useState(false);
  const [busy, setBusy] = useState('');

  const runScan = async () => {
    if (!routerId) {toast.warning('Select a router first'); return;}
    setBusy('scan');
    setScript('');
    try {
      const { data } = await axios.post(`${API}/load-balancing/bonding/scan`, {
        connection_id: routerId,
      });
      setScan(data);
      setSelected(data.candidates || []);
      setPrimary(data.candidates?.[0] || '');
      toast.success('Scan complete', `${data.candidates?.length || 0} bondable port(s) found`);
    } catch (e) {
      toast.error('Scan failed', e.response?.data?.error || e.message);
    } finally {
      setBusy('');
    }
  };

  const toggle = (name) => {
    setSelected((previous) => previous.includes(name)
      ? previous.filter((item) => item !== name)
      : [...previous, name]);
  };

  const generate = async () => {
    if (selected.length < 2) {toast.warning('Select at least two ports'); return;}
    setBusy('generate');
    try {
      const { data } = await axios.post(`${API}/load-balancing/bonding/generate`, {
        connection_id: routerId,
        name: bondName,
        mode,
        slaves: selected,
        hash_policy: hashPolicy,
        min_links: minLinks,
        primary: primary || selected[0],
      });
      setScript(data.script || '');
      setShowScript(true);
      toast.success('Bond script generated', 'Review the notes in the script before pushing');
    } catch (e) {
      toast.error('Generation failed', e.response?.data?.error || e.message);
    } finally {
      setBusy('');
    }
  };

  const push = async (dryRun) => {
    if (!script.trim()) {toast.warning('Generate a script first'); return;}
    if (!dryRun && !window.confirm(
      `Apply bond ${bondName} to ${routers.find((r) => r.id === routerId)?.name || 'this router'}? ` +
      'A backup will be saved first. Slave ports will stop being usable individually.',
    )) {return;}
    setBusy(dryRun ? 'dry-run' : 'push');
    try {
      const { data } = await axios.post(`${API}/load-balancing/push`, {
        connection_id: routerId,
        script,
        dry_run: dryRun,
        backup: !dryRun,
      });
      if (dryRun) {toast.info('Dry run OK', data.message);}
      else {
        toast.success('Pushed', data.backup?.success
          ? `${data.message} Backup saved.`
          : `${data.message} Backup was not saved.`);
      }
    } catch (e) {
      toast.error('Push failed', e.response?.data?.error || e.message);
    } finally {
      setBusy('');
    }
  };

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(script);
      toast.success('Script copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  const downloadScript = () => {
    const url = URL.createObjectURL(new Blob([script], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'link-bonding.rsc';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="relative glass rounded-xl p-4 border border-amber-500/30 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-zinc-400 leading-relaxed">
          Bonding joins ports to the <span className="text-zinc-200">same upstream device</span>. Do not bond
          links from different ISPs — use PCC for that. Both ends must use the same mode; for 802.3ad you must
          configure a matching LAG on the upstream switch. IP/NAT must be moved to the bond after applying.
        </div>
      </div>

      <div className="relative glass rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <label className="block text-xs text-zinc-400 mb-2">MikroTik router</label>
          <select
            className="modern-input w-full"
            value={routerId}
            onChange={(event) => { setRouterId(event.target.value); setScan(null); setScript(''); }}
          >
            <option value="">Select a router</option>
            {routers.map((router) => (
              <option key={router.id} value={router.id}>
                {router.name} ({router.ip_address}){router.is_online ? ' - online' : ''}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={runScan} disabled={!routerId || busy === 'scan'}>
          {busy === 'scan' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Scan ports
        </button>
      </div>

      {scan && (
        <>
          <div className="relative glass rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-zinc-700/50 text-sm text-zinc-200 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-cyan-400" />
              Interfaces on {scan.router?.name}
              <span className="text-xs text-zinc-500">({scan.candidates?.length || 0} bondable)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="modern-table w-full">
                <thead>
                  <tr>
                    <th className="w-10">Use</th>
                    <th>Interface</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Addresses</th>
                  </tr>
                </thead>
                <tbody>
                  {(scan.interfaces || []).map((iface) => (
                    <tr key={iface.name} className={iface.candidate ? '' : 'opacity-50'}>
                      <td>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-cyan-500 cursor-pointer"
                          checked={selected.includes(iface.name)}
                          disabled={!iface.candidate}
                          onChange={() => toggle(iface.name)}
                          aria-label={`Bond ${iface.name}`}
                        />
                      </td>
                      <td className="text-sm text-white">{iface.name}</td>
                      <td className="text-xs text-zinc-400">{iface.type}</td>
                      <td className="text-xs">
                        {iface.is_bond
                          ? <span className="text-cyan-400">bond</span>
                          : iface.in_bond
                            ? <span className="text-amber-400">already a slave</span>
                            : iface.addresses?.length
                              ? <span className="text-amber-400">has IP</span>
                              : iface.candidate
                                ? <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle className="w-3 h-3" /> available</span>
                                : <span className="inline-flex items-center gap-1 text-rose-400"><XCircle className="w-3 h-3" /> not eligible</span>}
                      </td>
                      <td className="text-xs text-zinc-400">{iface.addresses?.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {scan.existing_bonds?.length > 0 && (
            <div className="relative glass rounded-xl p-4 text-xs text-zinc-400">
              Existing bonds: {scan.existing_bonds.map((bond) => (
                <div key={bond.name} className="mt-1">
                  <span className="text-zinc-200">{bond.name}</span> — {bond.mode}, slaves: {bond.slaves.join(', ') || 'none'}
                </div>
              ))}
            </div>
          )}

          <div className="relative glass rounded-xl p-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-2">Bond name</label>
              <input className="modern-input w-40" value={bondName} onChange={(e) => setBondName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-2">Mode</label>
              <select className="modern-input w-64" value={mode} onChange={(e) => setMode(e.target.value)}>
                {MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            {mode === '802.3ad' && (
              <>
                <div>
                  <label className="block text-xs text-zinc-400 mb-2">Hash policy</label>
                  <select className="modern-input w-48" value={hashPolicy} onChange={(e) => setHashPolicy(e.target.value)}>
                    <option value="layer-2-and-3">layer-2-and-3</option>
                    <option value="layer-2">layer-2</option>
                    <option value="layer-3">layer-3</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-2">Min links</label>
                  <input type="number" min="1" max="8" className="modern-input w-20" value={minLinks} onChange={(e) => setMinLinks(Number(e.target.value))} />
                </div>
              </>
            )}
            {mode === 'active-backup' && (
              <div>
                <label className="block text-xs text-zinc-400 mb-2">Primary port</label>
                <select className="modern-input w-48" value={primary || selected[0] || ''} onChange={(e) => setPrimary(e.target.value)}>
                  {selected.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
            )}
            <button className="btn-primary flex items-center gap-2" onClick={generate} disabled={busy === 'generate'}>
              {busy === 'generate' ? 'Generating…' : 'Generate script'}
            </button>
            <span className="text-xs text-zinc-500">{selected.length} port(s) selected</span>
          </div>
        </>
      )}

      {showScript && script && (
        <div className="relative glass-strong rounded-2xl overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-zinc-700/50">
            <div className="flex items-center gap-2 text-sm text-zinc-200">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Generated bonding script
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost text-xs flex items-center gap-2" onClick={copyScript}><Copy className="w-4 h-4" /> Copy</button>
              <button className="btn-ghost text-xs flex items-center gap-2" onClick={downloadScript}><Download className="w-4 h-4" /> Download</button>
              <button className="btn-secondary text-xs" onClick={() => push(true)} disabled={Boolean(busy)}>
                {busy === 'dry-run' ? 'Checking…' : 'Dry run'}
              </button>
              <button className="btn-danger text-xs flex items-center gap-2" onClick={() => push(false)} disabled={Boolean(busy)}>
                <Rocket className="w-4 h-4" /> {busy === 'push' ? 'Pushing…' : 'Push to router'}
              </button>
            </div>
          </div>
          <pre className="p-6 text-sm text-emerald-400 font-mono whitespace-pre-wrap break-all max-h-[500px] overflow-auto">
            {script}
          </pre>
        </div>
      )}
    </div>
  );
}
