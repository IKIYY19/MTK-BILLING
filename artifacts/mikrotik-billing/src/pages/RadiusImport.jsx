import React, { useState, useMemo } from 'react';
import axios from 'axios';
import {
  Database, Upload, FileText, CheckCircle, XCircle,
  Users, UserPlus, AlertTriangle, Trash2, Eye, Copy,
  Info, ChevronDown, ChevronRight, FileUp, FileCode, ClipboardPaste
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

/* ─── Parse CSV / FreeRADIUS Export ─── */
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  const users = [];

  for (const line of lines) {
    // Skip comments and headers
    if (line.startsWith('#') || line.startsWith('--')) {continue;}
    if (/^(username|User-Name|Cleartext|id,)/i.test(line.trim())) {continue;}

    // Split by comma, handling quoted values
    const cols = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cols.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cols.push(current.trim());

    if (cols.length < 2) {continue;}

    const user = {};

    // Detect format based on number of columns and content
    if (cols.length === 2) {
      // Format: username, password
      user.username = cols[0];
      user.password = cols[1];
      user.attribute = 'Cleartext-Password';
      user.op = ':=';
    } else if (cols.length === 3) {
      // Format: username, attribute, value  OR  username, password, rate_limit
      if (cols[1].includes('-') || cols[1].includes('Password') || cols[1].includes('Rate')) {
        user.username = cols[0];
        user.attribute = cols[1];
        user.value = cols[2];
        user.password = cols[2];
        user.op = ':=';
      } else {
        user.username = cols[0];
        user.password = cols[1];
        user.rate_limit = cols[2];
        user.attribute = 'Cleartext-Password';
        user.op = ':=';
      }
    } else if (cols.length >= 4) {
      // Format: username, attribute, op, value [, rate_limit]
      user.username = cols[0];
      user.attribute = cols[1];
      user.op = cols[2];
      user.password = cols[1].toLowerCase().includes('password') ? cols[3] : null;
      user.value = cols[3];
      if (!user.password) {user.password = cols[3];}
      if (cols.length >= 5) {user.rate_limit = cols[4];}
    }

    if (user.username) {
      users.push(user);
    }
  }

  return users;
}

/* ─── Helpers ─── */
function getAttributeIcon(attr) {
  if (!attr) {return <FileText className="w-3 h-3" />;}
  const a = attr.toLowerCase();
  if (a.includes('password') || a.includes('cleartext')) {return <Eye className="w-3 h-3 text-violet-400" />;}
  if (a.includes('rate') || a.includes('limit')) {return <Zap className="w-3 h-3 text-amber-400" />;}
  if (a.includes('ip') || a.includes('framed')) {return <Copy className="w-3 h-3 text-blue-400" />;}
  if (a.includes('session') || a.includes('timeout')) {return <Clock className="w-3 h-3 text-emerald-400" />;}
  return <FileText className="w-3 h-3 text-zinc-400" />;
}

const Zap = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const Clock = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

/* ─── Stat Badge ─── */
function StatBadge({ icon: Icon, label, value, color }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-${color}-500/10 ring-1 ring-${color}-500/20`}>
      <Icon className={`w-4 h-4 text-${color}-400`} />
      <span className="text-sm text-zinc-400">{label}:</span>
      <span className={`text-sm font-bold text-${color}-400`}>{value}</span>
    </div>
  );
}

/* ─── Main Page ─── */
export function RadiusImport() {
  const [activeTab, setActiveTab] = useState('paste');
  const [pasteData, setPasteData] = useState('');
  const [file, setFile] = useState(null);
  const [createCustomers, setCreateCustomers] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [error, setError] = useState('');

  // Parse preview from paste data or file
  const previewUsers = useMemo(() => {
    if (activeTab === 'paste' && pasteData.trim()) {
      return parseCSV(pasteData);
    }
    if (activeTab === 'file' && file) {
      return parseCSV(file.content || '');
    }
    return [];
  }, [activeTab, pasteData, file]);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) {return;}
    setError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target.result;
      setFile({ name: f.name, content });
    };
    reader.onerror = () => setError('Failed to read file');
    reader.readAsText(f);
  };

  const handleImport = async () => {
    if (previewUsers.length === 0) {
      setError('No valid users to import');
      return;
    }
    setLoading(true);
    setError('');
    setResults(null);
    try {
      const { data } = await axios.post(`${API}/radius/import`, {
        users: previewUsers,
        create_customers: createCustomers,
      });
      setResults(data);
      if (data.created === 0 && data.errors.length === 0) {
        setError('All users were skipped (already exist)');
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Import failed');
    }
    setLoading(false);
  };

  const clearAll = () => {
    setPasteData('');
    setFile(null);
    setResults(null);
    setError('');
  };

  const formatRow = (user) =>
    `${user.username || user.user || ''},${user.attribute || 'Cleartext-Password'},${user.op || ':='},${user.password || user.value || ''}${user.rate_limit ? ',' + user.rate_limit : ''}`;

  const tabs = [
    { id: 'paste', label: 'Paste Data', icon: ClipboardPaste },
    { id: 'file', label: 'Upload File', icon: FileUp },
  ];

  return (
    <div className="relative min-h-full p-8 animate-fade-in">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-noise" />

      {/* Header */}
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Database className="w-4 h-4 text-white" />
            </div>
            RADIUS User Import
          </h1>
          <p className="text-zinc-400 mt-1">
            Bulk import RADIUS users from FreeRADIUS/MySQL exports or CSV files
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={clearAll} className="btn-ghost text-xs py-2 px-3">
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
      </div>

      {/* Instructions Card */}
      <div className="relative glass rounded-2xl p-5 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center flex-shrink-0">
            <Info className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">Supported Import Formats</h3>
            <div className="space-y-2">
              <div className="text-xs text-zinc-400">
                <span className="text-zinc-300 font-medium">FreeRADIUS Export:</span> One entry per line. Supports CSV with headers from radcheck/radreply tables.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <code className="block text-xs bg-zinc-800/60 rounded-lg p-3 text-zinc-300 font-mono">
                  username,Cleartext-Password,:=,password123<br />
                  username,Mikrotik-Rate-Limit,:=,10M/10M
                </code>
                <code className="block text-xs bg-zinc-800/60 rounded-lg p-3 text-zinc-300 font-mono">
                  john_doe,mysecretpass<br />
                  jane_doe,pass456,5M/5M
                </code>
              </div>
              <div className="text-xs text-zinc-500 mt-2">
                <strong>Common fields:</strong> username, password, attribute, op, value, rate_limit, customer_name, phone, email
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Input Tabs */}
      <div className="relative flex gap-2 mb-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/20'
                : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Input Area */}
      <div className="relative glass rounded-2xl p-6 mb-6">
        {activeTab === 'paste' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-zinc-300">Paste CSV or FreeRADIUS Export Data</label>
              <span className="text-xs text-zinc-500">
                {previewUsers.length > 0 ? `${previewUsers.length} users detected` : 'No users detected'}
              </span>
            </div>
            <textarea
              value={pasteData}
              onChange={(e) => { setPasteData(e.target.value); setResults(null); setError(''); }}
              placeholder={`Paste your RADIUS user data here...\n\nExamples:\nusername1,Cleartext-Password,:=,password123\nusername1,Mikrotik-Rate-Limit,:=,10M/10M\nusername2,password456\nusername3,password789,5M/5M`}
              className="modern-input w-full h-48 font-mono text-sm resize-y"
            />
          </div>
        )}

        {activeTab === 'file' && (
          <div>
            <label className="text-sm font-medium text-zinc-300 block mb-3">Upload CSV File</label>
            <div className="border-2 border-dashed border-zinc-700/70 rounded-xl p-8 text-center hover:border-cyan-500/50 transition-colors">
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/20 flex items-center justify-center mx-auto mb-3">
                  <Upload className="w-6 h-6 text-cyan-400" />
                </div>
                <div className="text-sm text-zinc-300 font-medium mb-1">
                  {file ? file.name : 'Click to select a CSV file'}
                </div>
                <div className="text-xs text-zinc-500">
                  {file ? `${previewUsers.length} users detected` : '.csv or .txt files accepted'}
                </div>
                {file && (
                  <button
                    onClick={(e) => { e.preventDefault(); setFile(null); }}
                    className="mt-3 text-xs text-rose-400 hover:text-rose-300"
                  >
                    Remove file
                  </button>
                )}
              </label>
            </div>
          </div>
        )}

        {/* Options */}
        <div className="mt-5 pt-4 border-t border-zinc-800/50">
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={createCustomers}
              onChange={(e) => setCreateCustomers(e.target.checked)}
              className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-cyan-500 focus:ring-cyan-500/20"
            />
            <div>
              <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">
                Create Customer Records
              </span>
              <p className="text-xs text-zinc-500 mt-0.5">
                Automatically create a customer entry for each user (uses username as customer name)
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Preview Table */}
      {previewUsers.length > 0 && (
        <div className="relative glass rounded-2xl overflow-hidden mb-6">
          <button
            onClick={() => setPreviewCollapsed(!previewCollapsed)}
            className="w-full p-4 flex items-center justify-between border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-zinc-400" />
              <h3 className="text-sm font-medium text-zinc-300">
                Preview ({previewUsers.length} users)
              </h3>
            </div>
            {previewCollapsed ? <ChevronRight className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
          </button>

          {!previewCollapsed && (
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Username</th>
                    <th>Password / Value</th>
                    <th>Attribute</th>
                    <th>Op</th>
                    <th>Rate Limit</th>
                  </tr>
                </thead>
                <tbody>
                  {previewUsers.slice(0, 100).map((user, i) => (
                    <tr key={i}>
                      <td className="text-xs text-zinc-500">{i + 1}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-zinc-500" />
                          <span className="text-sm text-zinc-200 font-mono">
                            {user.username || user.UserName || user.user}
                          </span>
                        </div>
                      </td>
                      <td className="font-mono text-sm text-zinc-400">
                        {user.password || user.Password || user.value || user.Value || '—'}
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          {getAttributeIcon(user.attribute || user.Attribute)}
                          <span className="text-xs text-zinc-400">{user.attribute || user.Attribute || 'Cleartext-Password'}</span>
                        </div>
                      </td>
                      <td className="text-xs text-zinc-500 font-mono">{user.op || user.Op || ':='}</td>
                      <td>
                        <span className={`text-xs font-mono ${user.rate_limit || user.RateLimit ? 'text-amber-400' : 'text-zinc-600'}`}>
                          {user.rate_limit || user.RateLimit || user['Mikrotik-Rate-Limit'] || '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {previewUsers.length > 100 && (
                    <tr>
                      <td colSpan="6" className="text-center text-xs text-zinc-500 py-3">
                        ... and {previewUsers.length - 100} more users
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Import Button */}
      <div className="relative flex items-center gap-4 mb-6">
        <button
          onClick={handleImport}
          disabled={loading || previewUsers.length === 0}
          className="btn-primary text-sm py-2.5 px-6 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Import {previewUsers.length} Users
            </>
          )}
        </button>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-400">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {results && (
        <div className="relative glass rounded-2xl overflow-hidden animate-fade-in">
          <div className="p-4 border-b border-zinc-800/50">
            <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              Import Results
            </h3>
          </div>

          <div className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <StatBadge icon={UserPlus} label="Created" value={results.created} color="emerald" />
              <StatBadge icon={CheckCircle} label="Skipped" value={results.skipped} color="amber" />
              <StatBadge icon={Users} label="Customers" value={results.customers_created} color="blue" />
              <StatBadge icon={XCircle} label="Errors" value={results.errors.length} color="rose" />
            </div>

            {results.errors.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                  Error Details
                </h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {results.errors.map((err, i) => (
                    <div key={i} className="flex items-start gap-2 px-3 py-2 bg-rose-500/5 rounded-lg border border-rose-500/10">
                      <XCircle className="w-3.5 h-3.5 text-rose-400 mt-0.5 flex-shrink-0" />
                      <div className="text-xs">
                        <span className="text-zinc-300 font-mono">{err.user}</span>
                        <span className="text-zinc-500 mx-1">—</span>
                        <span className="text-rose-400">{err.error}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {results.created > 0 && (
              <div className="mt-4 pt-4 border-t border-zinc-800/50 flex items-center gap-2 text-sm text-emerald-400">
                <CheckCircle className="w-4 h-4" />
                Successfully imported {results.created} user{results.created !== 1 ? 's' : ''}
                {results.customers_created > 0 && ` and created ${results.customers_created} customer record${results.customers_created !== 1 ? 's' : ''}`}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default RadiusImport;
