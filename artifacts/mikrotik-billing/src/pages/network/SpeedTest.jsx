import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Activity, ArrowDownRight, ArrowUpRight, Gauge, History, Info,
  Network, Play, Radio, RefreshCw, Square, Timer, Trash2, Wifi,
} from 'lucide-react';
import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { useToast } from '../../hooks/useToast';
import { useTheme } from '../../contexts/ThemeContext';
import './speedtest.css';

const API = import.meta.env.VITE_API_URL || '/api';
const ORIGIN = API.replace(/\/api\/?$/, '');

function pad(value) { return String(value).padStart(2, '0'); }

function timeLabel() {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${String(now.getMilliseconds()).padStart(3, '0').slice(0, 2)}`;
}

function formatSpeed(mbps) {
  const value = Number(mbps) || 0;
  return value >= 1000 ? (value / 1000).toFixed(2) : value.toFixed(2);
}

function speedUnit(mbps) {
  return (Number(mbps) || 0) >= 1000 ? 'Gbps' : 'Mbps';
}

function useChartColors() {
  const { theme, mode } = useTheme();
  return useMemo(() => {
    const styles = getComputedStyle(document.documentElement);
    const get = (name, fallback) => (styles.getPropertyValue(name) || fallback).trim();
    return {
      down: get('--accent-blue', '#38bdf8'),
      up: get('--accent-cyan', '#22d3ee'),
      ping: get('--accent-amber', '#f59e0b'),
      grid: get('--border-subtle', 'rgba(140,140,140,.18)'),
      axis: get('--text-muted', '#8b949e'),
      bg: get('--bg-card', '#111827'),
      text: get('--text-primary', '#e5e7eb'),
    };
  }, [theme, mode]);
}

async function measureDownload(mb, onSample, onProgress, signal) {
  const started = performance.now();
  const response = await fetch(`${ORIGIN}/speedtest/payload?mb=${Math.min(20, Math.max(1, mb))}`, {
    signal,
    cache: 'no-store',
  });
  if (!response.ok || !response.body) {
    throw new Error('Download endpoint is unavailable');
  }
  const reader = response.body.getReader();
  let total = 0;
  let previousBytes = 0;
  let previousAt = started;
  const expected = mb * 1024 * 1024;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) { break; }
    total += value?.byteLength || 0;
    const now = performance.now();
    const seconds = (now - previousAt) / 1000;
    if (seconds >= 0.25 && total > previousBytes) {
      onSample({
        time: timeLabel(),
        download: Math.round(((total - previousBytes) * 8) / seconds / 1e6 * 100) / 100,
      });
      previousBytes = total;
      previousAt = now;
    }
    onProgress(total, expected);
  }

  const seconds = Math.max((performance.now() - started) / 1000, 0.01);
  return {
    mbps: Math.round((total * 8) / seconds / 1e6 * 100) / 100,
    seconds,
    bytes: total,
  };
}

function measureUpload(mb, onSample, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const payload = new Uint8Array(Math.round(mb * 1024 * 1024));
    const xhr = new XMLHttpRequest();
    const started = performance.now();
    let previousLoaded = 0;
    let previousAt = started;

    xhr.open('POST', `${ORIGIN}/speedtest/upload`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (event) => {
      const now = performance.now();
      const seconds = (now - previousAt) / 1000;
      if (seconds >= 0.25 && event.loaded > previousLoaded) {
        onSample({
          time: timeLabel(),
          upload: Math.round(((event.loaded - previousLoaded) * 8) / seconds / 1e6 * 100) / 100,
        });
        previousLoaded = event.loaded;
        previousAt = now;
      }
      onProgress(event.loaded, event.total || payload.byteLength);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const seconds = Math.max((performance.now() - started) / 1000, 0.01);
        resolve({
          mbps: Math.round((payload.byteLength * 8) / seconds / 1e6 * 100) / 100,
          seconds,
          bytes: payload.byteLength,
        });
      } else {
        reject(new Error(`Upload failed with HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));

    const abort = () => xhr.abort();
    signal?.addEventListener('abort', abort, { once: true });
    xhr.send(payload);
  });
}

function Metric({ icon: Icon, label, value, unit, hint }) {
  return (
    <div className="st-metric">
      <div className="st-metric__top">
        <span className="st-metric__label">{label}</span>
        <span className="st-metric__icon"><Icon size={15} /></span>
      </div>
      <span className="st-metric__value">{value}<span className="st-metric__unit">{unit}</span></span>
      {hint && <span className="st-metric__hint">{hint}</span>}
    </div>
  );
}

export function SpeedTest() {
  const toast = useToast();
  const colors = useChartColors();
  const [connections, setConnections] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState('');
  const [payloadMb, setPayloadMb] = useState(10);
  const [direction, setDirection] = useState('both');
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [samples, setSamples] = useState([]);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const abortRef = useRef(null);
  const pingTimerRef = useRef(null);
  const latencyRef = useRef([]);

  useEffect(() => {
    axios.get(`${API}/mikrotik`)
      .then(({ data }) => setConnections(Array.isArray(data) ? data : []))
      .catch(() => toast.error('Could not load routers'));
  }, []);

  const fetchHistory = useCallback(async (id) => {
    if (!id) { return; }
    try {
      const { data } = await axios.get(`${API}/speedtest/history/${id}`);
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    fetchHistory(selectedConnection);
  }, [selectedConnection, fetchHistory]);

  useEffect(() => () => {
    if (pingTimerRef.current) { clearInterval(pingTimerRef.current); }
    abortRef.current?.abort();
  }, []);

  const pushSample = useCallback((partial) => {
    setSamples((previous) => {
      const time = partial.time || timeLabel();
      const last = previous[previous.length - 1];
      if (last && last.time === time) {
        const next = [...previous];
        next[next.length - 1] = { ...last, ...partial, time };
        return next;
      }
      return [...previous.slice(-39), { time, ...partial }];
    });
  }, []);

  const runTest = async () => {
    if (!selectedConnection) { toast.warning('Select a router first'); return; }
    const controller = new AbortController();
    abortRef.current = controller;
    latencyRef.current = [];
    setSamples([]);
    setResult(null);
    setProgress(0);
    setRunning(true);
    setPhase('starting');

    let latency = 0;
    let packetLoss = 0;
    const samplePing = async () => {
      try {
        const { data } = await axios.get(`${API}/speedtest/ping/${selectedConnection}`, {
          params: { host: '8.8.8.8', count: 3 },
          signal: controller.signal,
        });
        latency = Number(data.latency_ms) || 0;
        packetLoss = Number(data.packet_loss) || 0;
        latencyRef.current.push(latency);
        pushSample({ time: timeLabel(), ping: latency });
      } catch {
        // Keep the test running when a single ping fails.
      }
    };

    try {
      await samplePing();
      pingTimerRef.current = setInterval(samplePing, 1200);

      setPhase('download');
      const down = await measureDownload(
        payloadMb,
        pushSample,
        (bytes, expected) => setProgress(Math.min(99, Math.round((bytes / expected) * 100))),
        controller.signal,
      );

      setPhase('upload');
      setProgress(0);
      const up = await measureUpload(
        2,
        pushSample,
        (bytes, total) => setProgress(Math.min(99, Math.round((bytes / total) * 100))),
        controller.signal,
      );

      setPhase('saving');
      setProgress(100);
      const values = latencyRef.current;
      const jitter = values.length > 1
        ? Math.round(values.slice(1).reduce((sum, value, index) => sum + Math.abs(value - values[index]), 0) / (values.length - 1) * 100) / 100
        : 0;

      const { data } = await axios.post(`${API}/speedtest/run`, {
        connection_id: selectedConnection,
        test_to: 'browser stream',
        direction,
        protocol: 'browser-stream',
        download_mbps: down.mbps,
        upload_mbps: up.mbps,
        latency_ms: latency,
        jitter_ms: jitter,
        packet_loss_pct: packetLoss,
        duration: Math.round((down.seconds + up.seconds) * 100) / 100,
      });
      setResult(data);
      await fetchHistory(selectedConnection);
      toast.success('Speed test complete', `↓ ${formatSpeed(data.download_mbps)} ${speedUnit(data.download_mbps)}`);
    } catch (error) {
      if (error?.name === 'AbortError' || error?.code === 'ERR_CANCELED') {
        toast.info('Speed test cancelled');
      } else {
        toast.error('Speed test failed', error.response?.data?.error || error.message);
      }
    } finally {
      if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
      abortRef.current = null;
      setRunning(false);
      setPhase('idle');
    }
  };

  const cancelTest = () => abortRef.current?.abort();

  const deleteResult = async (id) => {
    if (!window.confirm('Delete this speed test result?')) { return; }
    try {
      await axios.delete(`${API}/speedtest/results/${id}`);
      await fetchHistory(selectedConnection);
      toast.success('Result deleted');
    } catch (error) {
      toast.error('Delete failed', error.response?.data?.error || error.message);
    }
  };

  const phaseLabel = {
    idle: 'Ready',
    starting: 'Measuring latency…',
    download: 'Measuring download…',
    upload: 'Measuring upload…',
    saving: 'Saving result…',
  }[phase];

  const currentSpeed = samples.length ? samples[samples.length - 1] : null;
  const showingChart = samples.length > 0;

  return (
    <div className="st-page">
      <div className="st-hero">
        <div>
          <span className="st-eyebrow"><Gauge size={13} /> Network diagnostics</span>
          <h1 className="st-title">Speed Test</h1>
          <p className="st-subtitle">
            Measure real throughput with live, per-sample charts. Download and upload are streamed
            through this server; latency is measured from the selected MikroTik router.
          </p>
        </div>
        <span className={`st-live-badge ${running ? 'st-live-badge--on' : ''}`}>
          <i className="st-live-dot" /> {running ? 'Live measurement' : 'Standby'}
        </span>
      </div>

      <div className="st-card">
        <div className="st-card__body st-toolbar">
          <div className="st-field st-field--grow">
            <label className="st-label" htmlFor="st-router">MikroTik router</label>
            <select
              id="st-router"
              className="st-select"
              value={selectedConnection}
              disabled={running}
              onChange={(event) => setSelectedConnection(event.target.value)}
            >
              <option value="">Select a router</option>
              {connections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.name} ({connection.ip_address}){connection.is_online ? ' — online' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="st-field st-field--compact">
            <label className="st-label" htmlFor="st-size">Payload</label>
            <select id="st-size" className="st-select" value={payloadMb} disabled={running} onChange={(e) => setPayloadMb(Number(e.target.value))}>
              {[5, 10, 20].map((size) => <option key={size} value={size}>{size} MB</option>)}
            </select>
          </div>
          <div className="st-field st-field--compact">
            <label className="st-label" htmlFor="st-direction">Direction</label>
            <select id="st-direction" className="st-select" value={direction} disabled={running} onChange={(e) => setDirection(e.target.value)}>
              <option value="both">Both</option>
              <option value="download">Download</option>
              <option value="upload">Upload</option>
            </select>
          </div>
          {running ? (
            <button className="st-btn st-btn--soft" onClick={cancelTest}><Square size={15} /> Cancel</button>
          ) : (
            <button className="st-btn st-btn--primary" onClick={runTest} disabled={!selectedConnection}>
              <Play size={15} /> Start test
            </button>
          )}
          <div className="st-callout" style={{ marginTop: 0, flex: '1 1 100%' }}>
            <Info size={15} />
            Throughput is measured from real bytes transferred to and from this server. No estimated
            or hardcoded values are used; latency comes from a router-side ping.
          </div>
        </div>
      </div>

      {running && (
        <div className="st-card">
          <div className="st-card__body">
            <div className="st-phase-row">
              <span className="st-phase"><Radio size={15} /> {phaseLabel}</span>
              <div className="st-hero-metric">
                <span>Current</span>
                <strong>
                  {formatSpeed(
                    phase === 'upload' ? currentSpeed?.upload : currentSpeed?.download,
                  )}
                  <span className="st-metric__unit">Mbps</span>
                </strong>
              </div>
            </div>
            <div className="st-phase-bar"><i style={{ width: `${progress}%` }} /></div>
            <div className="st-phase-meta">
              <span>{progress}% transferred</span>
              <span>{samples.length} samples collected</span>
            </div>
          </div>
        </div>
      )}

      <div className="st-card">
        <div className="st-card__head">
          <h2 className="st-card__title"><Activity size={16} /> Live throughput</h2>
          <div className="st-legend">
            <span className="st-legend-item"><i style={{ background: colors.down }} /> Download</span>
            <span className="st-legend-item"><i style={{ background: colors.up }} /> Upload</span>
            <span className="st-legend-item"><i style={{ background: colors.ping }} /> Latency (ms)</span>
          </div>
        </div>
        {showingChart ? (
          <div style={{ padding: '12px 8px 8px' }}>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={samples} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="st-down" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.down} stopOpacity={0.42} />
                    <stop offset="100%" stopColor={colors.down} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="st-up" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.up} stopOpacity={0.32} />
                    <stop offset="100%" stopColor={colors.up} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={colors.grid} strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="time" stroke={colors.axis} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} minTickGap={45} />
                <YAxis yAxisId="speed" stroke={colors.axis} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={44} />
                <YAxis yAxisId="ping" orientation="right" stroke={colors.axis} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={38} />
                <Tooltip
                  contentStyle={{
                    background: colors.bg,
                    border: `1px solid ${colors.grid}`,
                    borderRadius: 12,
                    color: colors.text,
                    fontSize: 11,
                  }}
                  labelStyle={{ color: colors.text }}
                  formatter={(value, name) => [`${value} ${name === 'ping' ? 'ms' : 'Mbps'}`, name]}
                />
                <Area yAxisId="speed" type="monotone" dataKey="download" name="Download" stroke={colors.down} fill="url(#st-down)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                <Area yAxisId="speed" type="monotone" dataKey="upload" name="Upload" stroke={colors.up} fill="url(#st-up)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                <Line yAxisId="ping" type="monotone" dataKey="ping" name="ping" stroke={colors.ping} strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="st-chart-empty">
            <Wifi size={28} />
            <strong>Waiting for a test</strong>
            <p>Start a test to see download, upload and latency update in real time.</p>
          </div>
        )}
      </div>

      {result && (
        <div className="st-metrics">
          <Metric icon={ArrowDownRight} label="Download" value={formatSpeed(result.download_mbps)} unit={speedUnit(result.download_mbps)} hint="streamed bytes" />
          <Metric icon={ArrowUpRight} label="Upload" value={formatSpeed(result.upload_mbps)} unit={speedUnit(result.upload_mbps)} hint="browser → server" />
          <Metric icon={Wifi} label="Latency" value={(result.latency_ms || 0).toFixed(1)} unit="ms" hint="from router" />
          <Metric icon={Activity} label="Jitter" value={(result.jitter_ms || 0).toFixed(1)} unit="ms" hint="variation" />
          <Metric icon={Network} label="Packet loss" value={(result.packet_loss_pct || 0).toFixed(2)} unit="%" hint="ICMP ping" />
          <Metric icon={Timer} label="Duration" value={(result.duration || 0).toFixed(2)} unit="s" hint="test length" />
        </div>
      )}

      <div className="st-card">
        <div className="st-card__head">
          <h2 className="st-card__title"><History size={16} /> Test history</h2>
          <button className="st-btn st-btn--soft st-btn--sm" onClick={() => fetchHistory(selectedConnection)} disabled={!selectedConnection}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        {history.length > 0 ? (
          <div className="st-table-wrap">
            <table className="st-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Download</th>
                  <th>Upload</th>
                  <th>Latency</th>
                  <th>Jitter</th>
                  <th>Loss</th>
                  <th>Source</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.map((test) => (
                  <tr key={test.id}>
                    <td>{test.timestamp ? new Date(test.timestamp).toLocaleString() : '—'}</td>
                    <td className="st-strong">{formatSpeed(test.download_speed)} {speedUnit(test.download_speed)}</td>
                    <td className="st-strong">{formatSpeed(test.upload_speed)} {speedUnit(test.upload_speed)}</td>
                    <td>{(test.latency || 0).toFixed(1)} ms</td>
                    <td>{(test.jitter || 0).toFixed(1)} ms</td>
                    <td>{(test.packet_loss || 0).toFixed(2)}%</td>
                    <td>{test.protocol || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="st-btn st-btn--soft st-btn--sm" onClick={() => deleteResult(test.id)} title="Delete result">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="st-empty">
            <History size={26} />
            <strong>No results yet</strong>
            <p>Completed tests on this router will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default SpeedTest;
