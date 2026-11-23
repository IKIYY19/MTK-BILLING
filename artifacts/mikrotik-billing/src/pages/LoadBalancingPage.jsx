import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Activity, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock,
  Copy, Download, Network, RefreshCw, Rocket, Search, ShieldCheck,
  Wifi,
} from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { BondingPanel } from './loadBalancing/BondingPanel';
import './loadBalancing.css';

const API = import.meta.env.VITE_API_URL || '/api';

function Stat({ label, value, hint }) {
  return (
    <div className="lb-stat">
      <span className="lb-stat__label">{label}</span>
      <span className="lb-stat__value">{value}</span>
      {hint && <span className="lb-stat__hint">{hint}</span>}
    </div>
  );
}

export function LoadBalancingPage() {
  const toast = useToast();
  const [routers, setRouters] = useState([]);
  const [routerId, setRouterId] = useState('');
  const [scan, setScan] = useState(null);
  const [selected, setSelected] = useState({});
  const [lanInterface, setLanInterface] = useState('bridge');
  const [script, setScript] = useState('');
  const [busy, setBusy] = useState('');
  const [showScript, setShowScript] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [tab, setTab] = useState('pcc');

  useEffect(() => {
    let active = true;
    axios.get(`${API}/mikrotik`)
      .then(({ data }) => { if (active) { setRouters(Array.isArray(data) ? data : []); } })
      .catch((e) => toast.error('Could not load routers', e.response?.data?.error || e.message));
    return () => { active = false; };
  }, []);

  const runScan = async () => {
    if (!routerId) { toast.warning('Select a router first'); return; }
    setBusy('scan');
    setScript('');
    setShowScript(false);
    try {
      const { data } = await axios.post(`${API}/load-balancing/scan`, { connection_id: routerId });
      setScan(data);
      const initial = {};
      for (const iface of data.interfaces || []) {
        if (data.detected_wans?.includes(iface.name)) { initial[iface.name] = 1; }
      }
      setSelected(initial);
      toast.success('Scan complete', `${data.detected_wans?.length || 0} interface(s) reached the internet`);
    } catch (e) {
      toast.error('Scan failed', e.response?.data?.error || e.message);
    } finally {
      setBusy('');
    }
  };

  const toggleInterface = (name) => {
    setSelected((previous) => {
      const next = { ...previous };
      if (next[name]) { delete next[name]; } else { next[name] = 1; }
      return next;
    });
  };

  const selectDetected = () => {
    const next = {};
    for (const iface of scan?.interfaces || []) {
      if (iface.internet) { next[iface.name] = selected[iface.name] || 1; }
    }
    setSelected(next);
  };

  const selectedWans = (scan?.interfaces || [])
    .filter((iface) => selected[iface.name])
    .map((iface) => ({
      name: iface.name,
      gateway: iface.gateway,
      subnet: iface.subnet,
      weight: selected[iface.name],
    }));

  const generate = async () => {
    if (selectedWans.length < 2) { toast.warning('Select at least two interfaces'); return; }
    setBusy('generate');
    try {
      const { data } = await axios.post(`${API}/load-balancing/generate`, {
        connection_id: routerId,
        wans: selectedWans,
        lan_interface: lanInterface,
      });
      setScript(data.script || '');
      setShowScript(true);
      toast.success('Script generated', 'Review it before pushing');
    } catch (e) {
      toast.error('Generation failed', e.response?.data?.error || e.message);
    } finally {
      setBusy('');
    }
  };

  const push = async (dryRun) => {
    if (!script.trim()) { toast.warning('Generate a script first'); return; }
    if (!dryRun && !window.confirm(
      `Apply load balancing to ${routers.find((r) => r.id === routerId)?.name || 'this router'}? ` +
      'A backup will be saved first. Internet traffic may be interrupted briefly.',
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
    link.download = 'pcc-load-balancing.rsc';
    link.click();
    URL.revokeObjectURL(url);
  };

  const internetCount = (scan?.detected_wans || []).length;

  return (
    <div className="lb-page">
      <div className="lb-hero">
        <div>
          <span className="lb-eyebrow"><Network size={13} /> Router configuration studio</span>
          <h1 className="lb-title">Load Balancing</h1>
          <p className="lb-subtitle">
            Scan a router, choose the links that carry internet, then generate and push a verified
            RouterOS configuration. Nothing changes on the router until you approve the push.
          </p>
        </div>
        <span className="lb-updated">
          <Clock size={13} />
          {scan?.scanned_at ? `Scanned ${new Date(scan.scanned_at).toLocaleTimeString()}` : 'No scan yet'}
        </span>
      </div>

      <div className="lb-tabs" role="tablist" aria-label="Link configuration mode">
        <button
          role="tab"
          aria-selected={tab === 'pcc'}
          className={`lb-tab ${tab === 'pcc' ? 'lb-tab--active' : ''}`}
          onClick={() => setTab('pcc')}
        >
          <Network size={15} /> PCC Load Balancing
        </button>
        <button
          role="tab"
          aria-selected={tab === 'bonding'}
          className={`lb-tab ${tab === 'bonding' ? 'lb-tab--active' : ''}`}
          onClick={() => setTab('bonding')}
        >
          <Activity size={15} /> Link Bonding
        </button>
      </div>

      {tab === 'pcc' ? (
        <>
          <div className="lb-callout lb-callout--warn">
            <AlertTriangle size={18} />
            <div>
              <strong>Review before applying.</strong> PCC rewrites mangle, NAT and routing rules on the
              selected router. Use it for two or more separate internet links. Keep the automatic backup
              and apply during a maintenance window.
            </div>
          </div>

          <div className="lb-card">
            <div className="lb-card__body lb-toolbar">
              <div className="lb-field lb-field--grow">
                <label className="lb-label" htmlFor="lb-router">MikroTik router</label>
                <select
                  id="lb-router"
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
              <div className="lb-field">
                <label className="lb-label" htmlFor="lb-lan">LAN / bridge interface</label>
                <input
                  id="lb-lan"
                  className="lb-input"
                  value={lanInterface}
                  onChange={(e) => setLanInterface(e.target.value)}
                  placeholder="bridge"
                />
              </div>
              <button className="lb-btn lb-btn--primary" onClick={runScan} disabled={!routerId || busy === 'scan'}>
                {busy === 'scan' ? <RefreshCw className="animate-spin" size={15} /> : <Search size={15} />}
                {busy === 'scan' ? 'Scanning…' : 'Scan interfaces'}
              </button>
            </div>
          </div>

          {!scan ? (
            <div className="lb-card lb-empty">
              <Wifi size={30} />
              <strong>No interfaces scanned yet</strong>
              <p>Choose a router above and run a scan. Each candidate port is tested against a public target to find working internet links.</p>
            </div>
          ) : (
            <>
              <div className="lb-stats">
                <Stat label="Interfaces" value={scan.interfaces?.length || 0} hint="discovered on router" />
                <Stat label="With internet" value={internetCount} hint={`via ${scan.target || '1.1.1.1'}`} />
                <Stat label="Selected WANs" value={selectedWans.length} hint="used in PCC script" />
                <Stat label="Sample" value={`${scan.sample_seconds || 2}s`} hint="traffic window" />
              </div>

              <div className="lb-card">
                <div className="lb-card__head">
                  <h2 className="lb-card__title"><Activity size={16} /> Interfaces on {scan.router?.name}</h2>
                  <button className="lb-btn lb-btn--soft lb-btn--sm" onClick={selectDetected} disabled={!internetCount}>
                    <CheckCircle2 size={14} /> Select all with internet
                  </button>
                </div>
                <div className="lb-table-wrap">
                  <table className="lb-table">
                    <thead>
                      <tr>
                        <th className="w-10">WAN</th>
                        <th>Interface</th>
                        <th>Type</th>
                        <th>Address / subnet</th>
                        <th>Gateway</th>
                        <th>Internet</th>
                        <th>Latency</th>
                        <th>Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(scan.interfaces || []).map((iface) => {
                        const isOpen = expanded === iface.name;
                        return (
                          <React.Fragment key={iface.name}>
                            <tr className={selected[iface.name] ? 'lb-row--selected' : ''}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={Boolean(selected[iface.name])}
                                  onChange={() => toggleInterface(iface.name)}
                                  aria-label={`Use ${iface.name} for load balancing`}
                                />
                              </td>
                              <td>
                                <button
                                  className="lb-name"
                                  style={{ background: 'none', border: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0 }}
                                  onClick={() => setExpanded(isOpen ? null : iface.name)}
                                >
                                  {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                  {iface.name}
                                </button>
                                <div className="lb-detail" style={{ padding: 0, border: 0, background: 'none', gap: 6 }}>
                                  {iface.has_default_route && <span className="lb-pill lb-pill--info">default</span>}
                                  {iface.has_dhcp_client && <span className="lb-pill lb-pill--ok">dhcp</span>}
                                </div>
                              </td>
                              <td className="lb-mono">{iface.type}</td>
                              <td>
                                <div className="lb-mono">{iface.addresses?.join(', ') || '—'}</div>
                                {iface.subnet && <span className="lb-pill lb-pill--muted">{iface.subnet}</span>}
                              </td>
                              <td className="lb-mono">{iface.gateway || '—'}</td>
                              <td>
                                <span className={`lb-pill ${iface.internet ? 'lb-pill--ok' : 'lb-pill--bad'}`}>
                                  <i className="lb-pill__dot" /> {iface.internet ? 'Online' : 'No route'}
                                </span>
                              </td>
                              <td className="lb-mono">{iface.latency_ms != null ? `${iface.latency_ms} ms` : '—'}</td>
                              <td>
                                <input
                                  type="number"
                                  min="1"
                                  max="8"
                                  className="lb-input"
                                  style={{ width: 70 }}
                                  value={selected[iface.name] || 1}
                                  disabled={!selected[iface.name]}
                                  onChange={(e) => setSelected((p) => ({
                                    ...p,
                                    [iface.name]: Math.max(1, Math.min(8, Number(e.target.value) || 1)),
                                  }))}
                                />
                              </td>
                            </tr>
                            {isOpen && (
                              <tr>
                                <td colSpan={8} className="lb-detail">
                                  <span><b>MAC:</b> {iface.mac_address || '—'}</span>
                                  <span><b>Link:</b> {iface.running ? 'up' : 'down'}</span>
                                  <span><b>Packet loss:</b> {iface.packet_loss ?? '—'}%</span>
                                  <span><b>Target:</b> {scan.target}</span>
                                  {iface.ping_error && <span className="lb-pill lb-pill--bad">{iface.ping_error}</span>}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="lb-card">
                <div className="lb-card__body lb-toolbar">
                  <div style={{ flex: 1 }}>
                    <h2 className="lb-card__title"><ShieldCheck size={16} /> Ready to generate</h2>
                    <p className="lb-footer-note">{selectedWans.length} WAN(s) selected. Weights control how connections are distributed.</p>
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
                <h2 className="lb-card__title"><ShieldCheck size={16} /> Generated RouterOS script</h2>
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
      ) : (
        <BondingPanel routers={routers} />
      )}
    </div>
  );
}

export default LoadBalancingPage;
