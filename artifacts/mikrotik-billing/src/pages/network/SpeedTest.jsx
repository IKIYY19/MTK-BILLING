import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Gauge, Play, RefreshCw, Clock, Download, Upload, Zap,
  Activity, TrendingUp, History, Trash2, AlertCircle
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

export function SpeedTest() {
  const [connections, setConnections] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState('');
  const [testTo, setTestTo] = useState('');
  const [direction, setDirection] = useState('both');
  const [duration, setDuration] = useState(10);
  const [protocol, setProtocol] = useState('tcp');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [history, setHistory] = useState([]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    fetchConnections();
  }, []);

  useEffect(() => {
    if (selectedConnection) {
      fetchHistory(selectedConnection);
    }
  }, [selectedConnection]);

  const fetchConnections = async () => {
    try {
      const { data } = await axios.get(`${API}/mikrotik`).catch(() => ({ data: [] }));
      setConnections(data);
    } catch (e) {
      console.error('Failed to fetch connections:', e);
    }
  };

  const fetchHistory = async (connectionId) => {
    try {
      const { data } = await axios.get(`${API}/speedtest/history/${connectionId}`).catch(() => ({ data: [] }));
      setHistory(data);
    } catch (e) {
      console.error('Failed to fetch history:', e);
    }
  };

  const runSpeedTest = async () => {
    if (!selectedConnection) {
      alert('Please select a connection');
      return;
    }

    setRunning(true);
    setProgress(0);
    setResults(null);

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const pct = Math.min(Math.round((elapsed / (duration + 5)) * 100), 95);
      setProgress(pct);
    }, 200);

    try {
      const { data } = await axios.post(`${API}/speedtest/run`, {
        connection_id: selectedConnection,
        test_to: testTo || null,
        direction,
        duration,
        protocol,
      });

      setResults(data);
      setProgress(100);
      await fetchHistory(selectedConnection);
    } catch (e) {
      alert(`Speed test failed: ${e.response?.data?.error || e.message}`);
    } finally {
      clearInterval(interval);
      setRunning(false);
    }
  };

  const deleteResult = async (id) => {
    if (!confirm('Delete this test result?')) {return;}
    try {
      await axios.delete(`${API}/speedtest/results/${id}`);
      await fetchHistory(selectedConnection);
    } catch (e) {
      alert('Failed to delete result');
    }
  };

  const formatSpeed = (mbps) => {
    if (mbps >= 1000) {return `${(mbps / 1000).toFixed(2)} Gbps`;}
    return `${mbps.toFixed(2)} Mbps`;
  };

  return (
    <div className="relative min-h-full p-8 animate-fade-in">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-noise" />

      {/* Header */}
      <div className="relative flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Gauge className="w-4 h-4 text-white" />
            </div>
            Network Speed Test
          </h1>
          <p className="text-zinc-400 mt-1">Test bandwidth using MikroTik's built-in bandwidth test tool</p>
        </div>
        <button onClick={fetchConnections} className="btn-ghost p-2" title="Refresh connections">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Test Configuration */}
      <div className="relative glass rounded-2xl p-6 mb-6">
        <h3 className="text-base font-semibold text-white mb-4">Test Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Connection *</label>
            <select
              value={selectedConnection}
              onChange={e => setSelectedConnection(e.target.value)}
              className="modern-input"
              disabled={running}
            >
              <option value="">Select Connection</option>
              {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Test To (IP)</label>
            <input
              value={testTo}
              onChange={e => setTestTo(e.target.value)}
              className="modern-input"
              placeholder="Leave empty for self-test"
              disabled={running}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Direction</label>
            <select
              value={direction}
              onChange={e => setDirection(e.target.value)}
              className="modern-input"
              disabled={running}
            >
              <option value="both">Both (Download & Upload)</option>
              <option value="tx">Upload Only</option>
              <option value="rx">Download Only</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Duration (seconds)</label>
            <input
              type="number"
              value={duration}
              onChange={e => setDuration(parseInt(e.target.value))}
              className="modern-input"
              min="5"
              max="60"
              disabled={running}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Protocol</label>
            <select
              value={protocol}
              onChange={e => setProtocol(e.target.value)}
              className="modern-input"
              disabled={running}
            >
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={runSpeedTest}
            disabled={running || !selectedConnection}
            className="btn-primary flex items-center gap-2"
          >
            {running ? (
              <>
                <Activity className="w-4 h-4 animate-spin" />
                Testing... {progress}%
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Speed Test
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results */}
          {results && (
        <div className="relative glass rounded-2xl p-6 mb-6">
          <h3 className="text-base font-semibold text-white mb-4">Test Results</h3>
          {results.note && (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-300">{results.note}</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-zinc-800/50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-zinc-400 mb-2">
                <Download className="w-4 h-4" />
                <span className="text-sm">Download Speed</span>
              </div>
              <div className="text-2xl font-bold text-emerald-400">{formatSpeed(results.download_speed)}</div>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-zinc-400 mb-2">
                <Upload className="w-4 h-4" />
                <span className="text-sm">Upload Speed</span>
              </div>
              <div className="text-2xl font-bold text-cyan-400">{formatSpeed(results.upload_speed)}</div>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-zinc-400 mb-2">
                <Clock className="w-4 h-4" />
                <span className="text-sm">Latency</span>
              </div>
              <div className="text-2xl font-bold text-amber-400">{results.latency.toFixed(1)} ms</div>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-zinc-400 mb-2">
                <Zap className="w-4 h-4" />
                <span className="text-sm">Jitter</span>
              </div>
              <div className="text-2xl font-bold text-violet-400">{results.jitter.toFixed(1)} ms</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-zinc-800/50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-zinc-400 mb-2">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">Packet Loss</span>
              </div>
              <div className="text-xl font-bold text-rose-400">{results.packet_loss.toFixed(2)}%</div>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-zinc-400 mb-2">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm">Test Duration</span>
              </div>
              <div className="text-xl font-bold text-white">{results.duration}s</div>
            </div>
          </div>
          <div className="mt-4 text-sm text-zinc-500">
            Tested at: {new Date(results.timestamp).toLocaleString()}
          </div>
        </div>
      )}

      {/* History */}
      {selectedConnection && (
        <div className="relative glass rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <History className="w-4 h-4" />
              Test History ({history.length})
            </h3>
            <button onClick={() => fetchHistory(selectedConnection)} className="btn-ghost p-2">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <table className="modern-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Download</th>
                <th>Upload</th>
                <th>Latency</th>
                <th>Jitter</th>
                <th>Packet Loss</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.map((test) => (
                <tr key={test.id}>
                  <td className="text-sm text-zinc-400">{new Date(test.timestamp).toLocaleString()}</td>
                  <td className="font-medium text-emerald-400">{formatSpeed(test.download_speed)}</td>
                  <td className="font-medium text-cyan-400">{formatSpeed(test.upload_speed)}</td>
                  <td className="text-sm text-zinc-400">{test.latency.toFixed(1)} ms</td>
                  <td className="text-sm text-zinc-400">{test.jitter.toFixed(1)} ms</td>
                  <td className="text-sm text-zinc-400">{test.packet_loss.toFixed(2)}%</td>
                  <td>
                    <button onClick={() => deleteResult(test.id)} className="btn-ghost p-2 text-zinc-500 hover:text-rose-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.length === 0 && (
            <div className="p-16 text-center">
              <History className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-1">No test history</h3>
              <p className="text-zinc-500">Run a speed test to see results here</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
