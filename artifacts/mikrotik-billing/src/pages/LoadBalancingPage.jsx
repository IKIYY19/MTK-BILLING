import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Activity, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Copy,
  Download, Network, RefreshCw, Rocket, Search, ShieldCheck, XCircle,
} from 'lucide-react';
import { useToast } from '../hooks/useToast';

const API = import.meta.env.VITE_API_URL || '/api';

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

  useEffect(() => {
    let active = true;
    axios.get(`${API}/mikrotik`)
      .then(({ data }) => { if (active) {setRouters(Array.isArray(data) ? data : []);} })
      .catch((e) => toast.error('Could not load routers', e.response?.data?.error || e.message));
    return () => { active = false; };
  }, []);

  const runScan = async () => {
    if (!routerId) {toast.warning('Select a router first'); return;}
    setBusy('scan');
    setScript('');
    try {
      const { data } = await axios.post(`${API}/load-balancing/scan`, { connection_id: routerId });
      setScan(data);
      const initial = {};
      for (const iface of data.interfaces || []) {
        if (data.detected_wans?.includes(iface.name)) {initial[iface.name] = 1;}
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
      if (next[name]) {delete next[name];} else {next[name] = 1;}
      return next;
    });
  };

  const selectDetected = () => {
    const next = {};
    for (const iface of scan?.interfaces || []) {
      if (iface.internet) {next[iface.name] = selected[iface.name] || 1;}
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
    if (selectedWans.length < 2) {
      toast.warning('Select at least two interfaces');
      return;
    }
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
    if (!script.trim()) {toast.warning('Generate a script first'); return;}
    if (!dryRun && !window.confirm(
      `Apply load balancing to ${routers.find((r) => r.id === routerId)?.name || 'this router'}? ` +
      'A backup will be saved first. Internet traffic may be interrupted briefly.',
    )) {return;}
    setBusy(dryRun ? 'dry-run' : 'push');
    try {
      const { data } = await axios.post(`${API}/load-balancing/push`, {
        connection_id: routerId,
        script,
        dry_run: dryRun,
        backup: !dryRun,
      });
      if (dryRun) {
        toast.info('Dry run OK', data.message);
      } else {
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
    link.download = 'pcc-load-balancing.rsc';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative p-4 sm:p-6 space-y-5 animate-fade-in">
      <div className="absolute inset-0 bg-mesh pointer-events-none" />
      <div className="absolute inset-0 bg-noise pointer-events-none" />

      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Network className="w-5 h-5 text-white" />
            </div>
            Load Balancing
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Scan a router, pick the interfaces that have internet, then generate and push a PCC configuration
          </p>
        </div>
        <button className="btn-ghost flex items-center gap-2 text-xs" onClick={runScan} disabled={busy === 'scan'}>
          <RefreshCw className={`w-4 h-4 ${busy === 'scan' ? 'animate-spin' : ''}`} /> Rescan
        </button>
      </div>

      <div className="relative glass rounded-xl p-4 border border-amber-500/30 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-zinc-400 leading-relaxed">
          This changes firewall mangle, NAT and routing on the selected router. Review the generated script,
          apply it in a maintenance window, and keep the automatic backup. Nothing is changed until you press
          <span className="text-zinc-200 font-medium"> Push to router</span>.
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
        <div className="min-w-[180px]">
          <label className="block text-xs text-zinc-400 mb-2">LAN / bridge interface</label>
          <input
            className="modern-input w-full"
            value={lanInterface}
            onChange={(event) => setLanInterface(event.target.value)}
            placeholder="bridge"
          />
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={runScan} disabled={!routerId || busy === 'scan'}>
          <Search className="w-4 h-4" /> {busy === 'scan' ? 'Scanning…' : 'Scan interfaces'}
        </button>
      </div>

      {scan && (
        <>
          <div className="relative glass rounded-2xl overflow-hidden">
            <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-700/50">
              <div className="flex items-center gap-2 text-sm text-zinc-200">
                <Activity className="w-4 h-4 text-cyan-400" />
                Interfaces on {scan.router?.name}
                <span className="text-xs text-zinc-500">
                  ({scan.interfaces?.length || 0} found, {scan.detected_wans?.length || 0} with internet)
                </span>
              </div>
              <button className="btn-ghost text-xs" onClick={selectDetected} disabled={!scan.detected_wans?.length}>
                Select all with internet
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="modern-table w-full">
                <thead>
                  <tr>
                    <th className="w-10">WAN</th>
                    <th>Interface</th>
                    <th>Type</th>
                    <th>Address / Subnet</th>
                    <th>Gateway</th>
                    <th>Internet</th>
                    <th>Latency</th>
                    <th className="w-24">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {(scan.interfaces || []).map((iface) => {
                    const isOpen = expanded === iface.name;
                    return (
                      <React.Fragment key={iface.name}>
                        <tr className={iface.internet ? 'hover:bg-zinc-800/30' : 'opacity-60'}>
                          <td>
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-cyan-500 cursor-pointer"
                              checked={Boolean(selected[iface.name])}
                              onChange={() => toggleInterface(iface.name)}
                              aria-label={`Use ${iface.name} for load balancing`}
                            />
                          </td>
                          <td>
                            <button
                              className="flex items-center gap-2 text-left text-sm text-white"
                              onClick={() => setExpanded(isOpen ? null : iface.name)}
                            >
                              {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              {iface.name}
                              {iface.has_default_route && <span className="text-[10px] text-cyan-400">default</span>}
                              {iface.has_dhcp_client && <span className="text-[10px] text-emerald-400">dhcp</span>}
                            </button>
                          </td>
                          <td className="text-xs text-zinc-400">{iface.type}</td>
                          <td className="text-xs text-zinc-400">
                            {iface.addresses?.join(', ') || '—'}
                            {iface.subnet && <div className="text-zinc-500">{iface.subnet}</div>}
                          </td>
                          <td className="text-xs text-zinc-300">{iface.gateway || '—'}</td>
                          <td>
                            {iface.internet
                              ? <span className="inline-flex items-center gap-1 text-xs text-emerald-400"><CheckCircle className="w-3 h-3" /> yes</span>
                              : <span className="inline-flex items-center gap-1 text-xs text-rose-400"><XCircle className="w-3 h-3" /> no</span>}
                          </td>
                          <td className="text-xs text-zinc-400">
                            {iface.latency_ms != null ? `${iface.latency_ms} ms` : '—'}
                          </td>
                          <td>
                            <input
                              type="number"
                              min="1"
                              max="8"
                              className="modern-input w-16 text-xs"
                              value={selected[iface.name] || 1}
                              disabled={!selected[iface.name]}
                              onChange={(event) => setSelected((previous) => ({
                                ...previous,
                                [iface.name]: Math.max(1, Math.min(8, Number(event.target.value) || 1)),
                              }))}
                            />
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={8} className="bg-zinc-950/40 px-6 py-3 text-xs text-zinc-500">
                              MAC: {iface.mac_address || '—'} · running: {iface.running ? 'yes' : 'no'} ·
                              packet loss: {iface.packet_loss ?? '—'}% · target: {scan.target}
                              {iface.ping_error && <div className="text-rose-400 mt-1">{iface.ping_error}</div>}
                              {iface.comment && <div className="mt-1">{iface.comment}</div>}
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

          <div className="relative glass rounded-xl p-4 flex flex-wrap items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span className="text-sm text-zinc-200">{selectedWans.length} WAN(s) selected</span>
            <button className="btn-primary flex items-center gap-2" onClick={generate} disabled={busy === 'generate'}>
              {busy === 'generate' ? 'Generating…' : 'Generate script'}
            </button>
          </div>
        </>
      )}

      {showScript && script && (
        <div className="relative glass-strong rounded-2xl overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-zinc-700/50">
            <div className="flex items-center gap-2 text-sm text-zinc-200">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Generated RouterOS script
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost text-xs flex items-center gap-2" onClick={copyScript}>
                <Copy className="w-4 h-4" /> Copy
              </button>
              <button className="btn-ghost text-xs flex items-center gap-2" onClick={downloadScript}>
                <Download className="w-4 h-4" /> Download
              </button>
              <button className="btn-secondary text-xs flex items-center gap-2" onClick={() => push(true)} disabled={Boolean(busy)}>
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

export default LoadBalancingPage;
