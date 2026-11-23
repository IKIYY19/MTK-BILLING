import React, { useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle, Copy, Download, Layers, Link2,
  RefreshCw, Rocket, Search, ShieldCheck,
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';

const API = import.meta.env.VITE_API_URL || '/api';

const MODES = [
  { value: '802.3ad', label: '802.3ad / LACP (recommended)' },
  { value: 'active-backup', label: 'Active-backup (failover only)' },
  { value: 'balance-xor', label: 'Balance-xor (static LAG)' },
  { value: 'balance-rr', label: 'Balance-rr (not recommended)' },
];

function Stat({ label, value, hint }) {
  return (
    <div className="lb-stat">
      <span className="lb-stat__label">{label}</span>
      <span className="lb-stat__value">{value}</span>
      {hint && <span className="lb-stat__hint">{hint}</span>}
    </div>
  );
}

function Traffic({ rxBps, txBps, rxRate, txRate, max }) {
  const width = (value) => `${Math.min(100, Math.round((value / (max || 1)) * 100))}%`;
  return (
    <div className="lb-traffic">
      <div className="lb-traffic__row">
        <span>↓</span>
        <div className="lb-bar"><i style={{ width: width(rxBps || 0) }} /></div>
        <span>{rxRate || '0 bps'}</span>
      </div>
      <div className="lb-traffic__row">
        <span>↑</span>
        <div className="lb-bar"><i style={{ width: width(txBps || 0) }} /></div>
        <span>{txRate || '0 bps'}</span>
      </div>
    </div>
  );
}

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
    if (!routerId) { toast.warning('Select a router first'); return; }
    setBusy('scan');
    setScript('');
    setShowScript(false);
    try {
      const { data } = await axios.post(`${API}/load-balancing/bonding/scan`, { connection_id: routerId });
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
    if (selected.length < 2) { toast.warning('Select at least two ports'); return; }
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
    if (!script.trim()) { toast.warning('Generate a script first'); return; }
    if (!dryRun && !window.confirm(
      `Apply bond ${bondName} to ${routers.find((r) => r.id === routerId)?.name || 'this router'}? ` +
      'A backup will be saved first. Slave ports will stop being usable individually.',
    )) { return; }
    setBusy(dryRun ? 'dry-run' : 'push');
    try {
      const { data } = await axios.post(`${API}/load-balancing/push`, {
        connection_id: routerId,
        script,
        dry_run: dryRun,
        backup: !dryRun,
      });
      if (dryRun) { toast.info('Dry run OK', data.message); }
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
    } catch { toast.error('Copy failed'); }
  };

  const downloadScript = () => {
    const url = URL.createObjectURL(new Blob([script], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'link-bonding.rsc';
    link.click();
    URL.revokeObjectURL(url);
  };

  const maxTraffic = Math.max(
    1,
    ...(scan?.interfaces || []).flatMap((iface) => [iface.rx_bps || 0, iface.tx_bps || 0]),
  );

  return (
    <>
      <div className="lb-callout lb-callout--warn">
        <AlertTriangle size={18} />
        <div>
          <strong>Same upstream device only.</strong> Bonding aggregates ports that terminate on one
          switch or ISP hand-off — never bond links from different providers (use PCC for that).
          Both ends must use the same mode, and IP/NAT must be moved to the bond after applying.
        </div>
      </div>

      <div className="lb-card">
        <div className="lb-card__body lb-toolbar">
          <div className="lb-field lb-field--grow">
            <label className="lb-label" htmlFor="lb-bond-router">MikroTik router</label>
            <select
              id="lb-bond-router"
              className="lb-select"
              value={routerId}
              onChange={(e) => { setRouterId(e.target.value); setScan(null); setScript(''); setShowScript(false); }}
            >
              <option value="">Select a router</option>
              {routers.map((router) => (
                <option key={router.id} value={router.id}>
                  {router.name} ({router.ip_address}){router.is_online ? ' — online' : ''}
                </option>
              ))}
            </select>
          </div>
          <button className="lb-btn lb-btn--primary" onClick={runScan} disabled={!routerId || busy === 'scan'}>
            {busy === 'scan' ? <RefreshCw className="animate-spin" size={15} /> : <Search size={15} />}
            {busy === 'scan' ? 'Scanning…' : 'Scan ports'}
          </button>
        </div>
      </div>

      {!scan ? (
        <div className="lb-card lb-empty">
          <Layers size={30} />
          <strong>No ports scanned yet</strong>
          <p>Choose a router and scan. We show link state, IP assignments and live traffic for every interface.</p>
        </div>
      ) : (
        <>
          <div className="lb-stats">
            <Stat label="Interfaces" value={scan.interfaces?.length || 0} hint="discovered on router" />
            <Stat label="Bondable ports" value={scan.candidates?.length || 0} hint="selectable below" />
            <Stat label="Existing bonds" value={scan.existing_bonds?.length || 0} hint="already configured" />
            <Stat label="Selected" value={selected.length} hint="slaves for new bond" />
          </div>

          <div className="lb-card">
            <div className="lb-card__head">
              <h2 className="lb-card__title"><Link2 size={16} /> Interfaces on {scan.router?.name}</h2>
              <span className="lb-card__hint">Traffic sampled over {scan.sample_seconds || 2}s</span>
            </div>
            <div className="lb-table-wrap">
              <table className="lb-table">
                <thead>
                  <tr>
                    <th>Use</th>
                    <th>Interface</th>
                    <th>Type</th>
                    <th>Link</th>
                    <th>Addresses</th>
                    <th>Traffic</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(scan.interfaces || []).map((iface) => (
                    <tr key={iface.name} className={selected.includes(iface.name) ? 'lb-row--selected' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.includes(iface.name)}
                          disabled={!iface.candidate}
                          onChange={() => toggle(iface.name)}
                          aria-label={`Bond ${iface.name}`}
                        />
                      </td>
                      <td className="lb-name">{iface.name}</td>
                      <td className="lb-mono">{iface.type}</td>
                      <td>
                        {iface.is_bond
                          ? <span className="lb-pill lb-pill--info">bond</span>
                          : iface.in_bond
                            ? <span className="lb-pill lb-pill--info">slave</span>
                            : iface.running
                              ? <span className="lb-pill lb-pill--ok"><i className="lb-pill__dot" /> up{iface.speed ? ` · ${iface.speed}` : ''}</span>
                              : <span className="lb-pill lb-pill--bad"><i className="lb-pill__dot" /> down</span>}
                      </td>
                      <td className="lb-mono">{iface.addresses?.join(', ') || '—'}</td>
                      <td><Traffic rxBps={iface.rx_bps} txBps={iface.tx_bps} rxRate={iface.rx_rate} txRate={iface.tx_rate} max={maxTraffic} /></td>
                      <td>
                        {(iface.warnings || []).length > 0
                          ? iface.warnings.map((w) => (
                            <div key={w}><span className="lb-pill lb-pill--warn">{w}</span></div>
                          ))
                          : iface.candidate
                            ? <span className="lb-pill lb-pill--ok">available</span>
                            : <span className="lb-pill lb-pill--muted">not bondable</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {scan.existing_bonds?.length > 0 && (
            <div className="lb-callout lb-callout--info">
              <Link2 size={18} />
              <div>
                <strong>Existing bonds:</strong>{' '}
                {scan.existing_bonds.map((bond) => `${bond.name} (${bond.mode}, slaves: ${bond.slaves.join(', ') || 'none'})`).join(' · ')}
              </div>
            </div>
          )}

          <div className="lb-card">
            <div className="lb-card__body lb-toolbar">
              <div className="lb-field">
                <label className="lb-label" htmlFor="lb-bond-name">Bond name</label>
                <input id="lb-bond-name" className="lb-input" value={bondName} onChange={(e) => setBondName(e.target.value)} />
              </div>
              <div className="lb-field">
                <label className="lb-label" htmlFor="lb-bond-mode">Mode</label>
                <select id="lb-bond-mode" className="lb-select" value={mode} onChange={(e) => setMode(e.target.value)}>
                  {MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
              {mode === '802.3ad' && (
                <>
                  <div className="lb-field">
                    <label className="lb-label" htmlFor="lb-hash">Hash policy</label>
                    <select id="lb-hash" className="lb-select" value={hashPolicy} onChange={(e) => setHashPolicy(e.target.value)}>
                      <option value="layer-2-and-3">layer-2-and-3</option>
                      <option value="layer-2">layer-2</option>
                      <option value="layer-3">layer-3</option>
                    </select>
                  </div>
                  <div className="lb-field lb-field--compact">
                    <label className="lb-label" htmlFor="lb-min-links">Min links</label>
                    <input id="lb-min-links" type="number" min="1" max="8" className="lb-input" value={minLinks} onChange={(e) => setMinLinks(Number(e.target.value))} />
                  </div>
                </>
              )}
              {mode === 'active-backup' && (
                <div className="lb-field">
                  <label className="lb-label" htmlFor="lb-primary">Primary port</label>
                  <select id="lb-primary" className="lb-select" value={primary || selected[0] || ''} onChange={(e) => setPrimary(e.target.value)}>
                    {selected.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
              )}
              <div style={{ flex: 1, minWidth: 120 }}>
                <span className="lb-label">Selection</span>
                <div className="lb-footer-note">{selected.length} port(s) selected</div>
              </div>
              <button className="lb-btn lb-btn--primary" onClick={generate} disabled={busy === 'generate'}>
                {busy === 'generate' ? <RefreshCw className="animate-spin" size={15} /> : <ShieldCheck size={15} />}
                Generate script
              </button>
            </div>
          </div>
        </>
      )}

      {showScript && script && (
        <div className="lb-card">
          <div className="lb-card__head">
            <h2 className="lb-card__title"><ShieldCheck size={16} /> Generated bonding script</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="lb-btn lb-btn--soft lb-btn--sm" onClick={copyScript}><Copy size={14} /> Copy</button>
              <button className="lb-btn lb-btn--soft lb-btn--sm" onClick={downloadScript}><Download size={14} /> Download</button>
              <button className="lb-btn lb-btn--soft lb-btn--sm" onClick={() => push(true)} disabled={Boolean(busy)}>
                {busy === 'dry-run' ? 'Checking…' : 'Dry run'}
              </button>
              <button className="lb-btn lb-btn--danger lb-btn--sm" onClick={() => push(false)} disabled={Boolean(busy)}>
                <Rocket size={14} /> {busy === 'push' ? 'Pushing…' : 'Push to router'}
              </button>
            </div>
          </div>
          <pre className="lb-code">{script}</pre>
        </div>
      )}
    </>
  );
}
