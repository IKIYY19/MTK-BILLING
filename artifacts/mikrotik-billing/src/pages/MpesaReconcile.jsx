import React, { useState, useRef } from "react";
import axios from "axios";
import { Smartphone, Upload, CheckCircle, AlertTriangle, DollarSign, Hash, FileText, X, RefreshCw } from "lucide-react";
import { useToast } from "../hooks/useToast";
import MpesaLivePayments from "../components/MpesaLivePayments";

const API = import.meta.env.VITE_API_URL || "/api";

// ─── SMART PARSER ────────────────────────────────────────────────────

/**
 * Parse common M-Pesa message formats:
 *   "XXXXX Confirmed. Ksh500.00 sent to JOHN DOE on 12/3/24"
 *   "Received Ksh1,500.00 from 254712345678 JOHN DOE"
 *   "Payment of Ksh500 to Till 12345. New balance..."
 *   "XXXXX Confirmed. You have received Ksh 200.00 from JOHN DOE 254712345678 on 1/1/25 at 10:30 AM"
 *   CSV exports from Safaricom statement
 */
function parseTransactions(text) {
  const transactions = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  // Check if CSV-like (comma or tab separated with header)
  const isCsv = /(completed\s*time|receipt\s*no\.?|phone\s*number|paid\s*(in|out)|amount)/i.test(lines[0] || "");

  if (isCsv) {
    return parseCsvTransactions(lines);
  }

  // Parse each line as an SMS/notification message
  for (const line of lines) {
    const txn = parseSmsLine(line);
    if (txn) {transactions.push(txn);}
  }

  return transactions;
}

function parseCsvTransactions(lines) {
  const transactions = [];
  const header = lines[0].toLowerCase();

  // Determine column indices
  const cols = header.split(/[,\t]/).map((c) => c.trim().replace(/[\s"]/g, ""));
  const phoneIdx = cols.findIndex((c) => c.includes("phone") || c.includes("number"));
  const amountIdx = cols.findIndex((c) => c.includes("amount") || c.includes("paid"));
  const nameIdx = cols.findIndex((c) => c.includes("name") || c.includes("sender") || c.includes("recipient"));
  const refIdx = cols.findIndex((c) => c.includes("receipt") || c.includes("ref") || c.includes("transaction") || c.includes("code"));
  const dateIdx = cols.findIndex((c) => c.includes("date") || c.includes("time") || c.includes("completed"));

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(/[,\t]/).map((v) => v.trim().replace(/^"|"$/g, ""));
    if (vals.length < 2) {continue;}

    const txn = {
      phone: phoneIdx >= 0 ? cleanPhone(vals[phoneIdx]) : "",
      amount: amountIdx >= 0 ? extractAmount(vals[amountIdx]) : "",
      reference: refIdx >= 0 ? (vals[refIdx] || "") : "",
      date: dateIdx >= 0 ? (vals[dateIdx] || "") : "",
      name: nameIdx >= 0 ? (vals[nameIdx] || "") : "",
    };

    // If no amount column found, try to extract from raw line
    if (!txn.amount) {
      txn.amount = extractAmount(lines[i]);
      if (!txn.amount) {continue;}
    }

    transactions.push(txn);
  }

  return transactions;
}

function parseSmsLine(line) {
  const amount = extractAmount(line);
  if (!amount) {return null;}

  const phone = extractPhoneNumber(line);
  const name = extractName(line, phone, amount);
  const reference = extractReference(line);
  const date = extractDate(line);

  return { phone, amount, reference, date, name };
}

function extractAmount(text) {
  // Match patterns: Ksh500.00, Ksh 500.00, Ksh 1,500.00, KES 500, Ksh500
  const patterns = [
    /(?:Ksh|KES)\s*([\d,]+(?:\.\d{1,2})?)\b/i,
    /(?:Ksh|KES)\.?\s*([\d,]+(?:\.\d{1,2})?)\b/i,
    /amount[:\s]*([\d,]+(?:\.\d{1,2})?)/i,
    /(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:Ksh|KES)/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m) {return parseFloat(m[1].replace(/,/g, "")).toFixed(2);}
  }

  // Fallback: look for currency-like numbers
  const m = text.match(/(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/g);
  if (m) {
    for (const candidate of m) {
      const n = parseFloat(candidate.replace(/,/g, ""));
      if (n >= 1 && n <= 500000) {return n.toFixed(2);}
    }
  }

  return null;
}

function extractPhoneNumber(text) {
  // Match Kenyan phone numbers: 254XXXXXXXXX, 07XXXXXXXX, +254XXXXXXXXX
  const patterns = [
    /(\+?254\d{9})\b/,
    /(07\d{8})\b/,
    /(01\d{8})\b/,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m) {return cleanPhone(m[1]);}
  }
  return "";
}

function cleanPhone(phone) {
  if (!phone) {return "";}
  let cleaned = phone.replace(/[^0-9+]/g, "");
  if (cleaned.startsWith("0")) {cleaned = "254" + cleaned.slice(1);}
  if (cleaned.startsWith("+")) {cleaned = cleaned.slice(1);}
  return cleaned;
}

function extractName(text, phone, amount) {
  // Try to extract name: text between amount and phone, or common patterns
  // "sent to JOHN DOE on"
  // "from 254712345678 JOHN DOE"
  // "from JOHN DOE 254712345678"

  // Pattern: "from PHONE NAME" or "from NAME PHONE"
  const fromPhoneName = text.match(/from\s+(?:254\d{9}|07\d{8}|01\d{8})\s+([A-Z\s]+?)(?:\s+on\s|\s+at\s|$)/i);
  if (fromPhoneName) {return fromPhoneName[1].trim();}

  // Pattern: "from NAME PHONE"
  const fromNamePhone = text.match(/from\s+([A-Z\s]+?)\s+(?:254\d{9}|07\d{8}|01\d{8})/i);
  if (fromNamePhone) {return fromNamePhone[1].trim();}

  // Pattern: "sent to NAME on"
  const sentTo = text.match(/sent\s+to\s+([A-Z\s]+?)(?:\s+on\s|\s+at\s|$)/i);
  if (sentTo) {return sentTo[1].trim();}

  // Pattern: "received from NAME"
  const receivedFrom = text.match(/(?:received\s+from|you\s+have\s+received.*?from)\s+([A-Z\s]+?)(?:\s+on\s|\s+at\s|$)/i);
  if (receivedFrom) {return receivedFrom[1].trim();}

  // Pattern: "to NAME" (till payments)
  const toName = text.match(/\bto\s+([A-Z][A-Z\s]{2,30}?)(?:\s+on\s|\s+at\s|$)/i);
  if (toName) {return toName[1].trim();}

  return "";
}

function extractReference(text) {
  // M-Pesa transaction codes are typically alphanumeric, 10 chars, uppercase
  const m = text.match(/\b([A-Z0-9]{10})\b/);
  return m ? m[1] : "";
}

function extractDate(text) {
  // Match dates like 12/3/24, 12/03/2024, 1/1/25
  const m = text.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
  return m ? m[1] : "";
}

// ─── COMPONENTS ──────────────────────────────────────────────────────

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-xs text-zinc-400">{label}</div>
        <div className="text-xl font-bold text-white">{value}</div>
      </div>
    </div>
  );
}

function TransactionTable({ transactions, onRemove, showStatus, matchedIds }) {
  if (!transactions || transactions.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No transactions to display</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-700/50 text-zinc-400 text-xs uppercase tracking-wider">
            <th className="text-left py-3 px-3">#</th>
            <th className="text-left py-3 px-3">Phone</th>
            <th className="text-left py-3 px-3">Amount</th>
            <th className="text-left py-3 px-3">Name</th>
            <th className="text-left py-3 px-3">Reference</th>
            <th className="text-left py-3 px-3">Date</th>
            {showStatus && <th className="text-left py-3 px-3">Status</th>}
            {onRemove && <th className="py-3 px-3"></th>}
          </tr>
        </thead>
        <tbody>
          {transactions.map((txn, i) => {
            const isMatched = matchedIds && matchedIds.has(i);
            return (
              <tr
                key={i}
                className={`border-b border-zinc-800/50 transition-colors ${
                  showStatus && isMatched
                    ? "bg-emerald-500/5"
                    : showStatus
                      ? "bg-amber-500/5"
                      : "hover:bg-zinc-800/30"
                }`}
              >
                <td className="py-2.5 px-3 text-zinc-500">{i + 1}</td>
                <td className="py-2.5 px-3 text-zinc-300 font-mono text-xs">{txn.phone || "—"}</td>
                <td className="py-2.5 px-3 text-zinc-200 font-medium">
                  KES {parseFloat(txn.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="py-2.5 px-3 text-zinc-300">{txn.name || "—"}</td>
                <td className="py-2.5 px-3 text-zinc-400 font-mono text-xs">{txn.reference || "—"}</td>
                <td className="py-2.5 px-3 text-zinc-400 text-xs">{txn.date || "—"}</td>
                {showStatus && (
                  <td className="py-2.5 px-3">
                    {isMatched ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
                        <CheckCircle className="w-3 h-3" /> Matched
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full">
                        <AlertTriangle className="w-3 h-3" /> Unmatched
                      </span>
                    )}
                  </td>
                )}
                {onRemove && (
                  <td className="py-2.5 px-3">
                    <button
                      onClick={() => onRemove(i)}
                      className="text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MatchedDetailTable({ matched }) {
  if (!matched || matched.length === 0) {return null;}

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-700/50 text-zinc-400 text-xs uppercase tracking-wider">
            <th className="text-left py-2 px-3">Amount</th>
            <th className="text-left py-2 px-3">Invoice #</th>
            <th className="text-left py-2 px-3">Customer</th>
            <th className="text-left py-2 px-3">Phone</th>
          </tr>
        </thead>
        <tbody>
          {matched.map((m, i) => (
            <tr key={i} className="border-b border-zinc-800/30">
              <td className="py-2 px-3 text-emerald-400 font-medium">
                KES {parseFloat(m.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
              <td className="py-2 px-3 text-zinc-300 font-mono text-xs">{m.invoice_number || m.invoice_id}</td>
              <td className="py-2 px-3 text-zinc-200">{m.customer_name}</td>
              <td className="py-2 px-3 text-zinc-400 font-mono text-xs">{m.phone || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────

export function MpesaReconcile() {
  // eslint-disable-next-line no-unused-vars
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState("paste"); // "paste" | "csv"
  const [pasteText, setPasteText] = useState("");
  const [parsedTransactions, setParsedTransactions] = useState([]);
  const [reconciling, setReconciling] = useState(false);
  const [results, setResults] = useState(null); // { matched: [], unmatched: [], total_amount }
  const [error, setError] = useState(null);

  // ── Parse ──
  const handleParse = () => {
    setError(null);
    setResults(null);
    if (!pasteText.trim()) {
      setParsedTransactions([]);
      return;
    }
    const parsed = parseTransactions(pasteText);
    setParsedTransactions(parsed);
    if (parsed.length === 0) {
      setError("No transactions could be parsed from the input. Check the format and try again.");
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) {return;}

    setError(null);
    setResults(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      setPasteText(text);
      const parsed = parseTransactions(text);
      setParsedTransactions(parsed);
      if (parsed.length === 0) {
        setError("No transactions could be parsed from the CSV file.");
      }
    };
    reader.onerror = () => {
      setError("Failed to read file.");
    };
    reader.readAsText(file);
  };

  const handleRemoveTransaction = (index) => {
    setParsedTransactions((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Reconcile ──
  const handleReconcile = async () => {
    if (parsedTransactions.length === 0) {return;}
    setReconciling(true);
    setError(null);
    try {
      const { data } = await axios.post(`${API}/mpesa/reconcile`, {
        transactions: parsedTransactions,
      });
      setResults(data);
      toast.success(`Reconciled: ${data.matched.length} matched, ${data.unmatched.length} unmatched`);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      toast.error("Reconcile failed", err.response?.data?.error || err.message);
    } finally {
      setReconciling(false);
    }
  };

  const handleClear = () => {
    setPasteText("");
    setParsedTransactions([]);
    setResults(null);
    setError(null);
  };

  // ── Derived ──
  const matchedIds = results
    ? new Set(
        results.matched.map((m) => {
          // Find original index by matching amount + phone + reference
          return parsedTransactions.findIndex(
            (t) => t.amount === m.amount && t.phone === m.phone && t.reference === m.reference,
          );
        }),
      )
    : null;

  const totalAmount = results ? results.total_amount : parsedTransactions.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Smartphone className="w-7 h-7 text-emerald-400" />
            M-Pesa
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Real-time Daraja payments + manual statement reconciliation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800/50 rounded-lg transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Live Payments Feed + Daraja C2B Setup */}
      <div className="mb-8">
        <MpesaLivePayments />
      </div>

      <div className="border-t border-zinc-800 mb-6 pt-6">
        <h3 className="text-lg font-semibold text-white mb-1">Manual Reconciliation</h3>
        <p className="text-sm text-zinc-400">Paste M-Pesa statements or upload CSV to auto-match payments to invoices</p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat
          icon={Hash}
          label="Parsed"
          value={parsedTransactions.length}
          color="bg-blue-500/10 text-blue-400"
        />
        <Stat
          icon={DollarSign}
          label="Total Amount"
          value={`KES ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          color="bg-emerald-500/10 text-emerald-400"
        />
        <Stat
          icon={CheckCircle}
          label="Matched"
          value={results ? results.matched.length : "—"}
          color="bg-emerald-500/10 text-emerald-400"
        />
        <Stat
          icon={AlertTriangle}
          label="Unmatched"
          value={results ? results.unmatched.length : "—"}
          color="bg-amber-500/10 text-amber-400"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-zinc-800/40 rounded-lg p-1 w-fit">
        <button
          onClick={() => { setActiveTab("paste"); setResults(null); setError(null); }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === "paste"
              ? "bg-zinc-700 text-white shadow-sm"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <FileText className="w-4 h-4 inline mr-1.5" />
          Paste Data
        </button>
        <button
          onClick={() => { setActiveTab("csv"); setResults(null); setError(null); }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === "csv"
              ? "bg-zinc-700 text-white shadow-sm"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Upload className="w-4 h-4 inline mr-1.5" />
          Upload CSV
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "paste" && (
        <div className="space-y-4">
          <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-4">
            <label className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">
              Paste M-Pesa SMS / Statement Text
            </label>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`Paste M-Pesa messages here, one per line. Examples:\n\nXXXXX Confirmed. Ksh500.00 sent to JOHN DOE on 12/3/24\nReceived Ksh1,500.00 from 254712345678 JOHN DOE\nPayment of Ksh500 to Till 12345. New balance...\n\nOr paste CSV data from Safaricom statement export.`}
              className="w-full h-48 bg-zinc-900/60 border border-zinc-700/50 rounded-lg p-4 text-sm text-zinc-200 placeholder-zinc-600 resize-y focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-colors font-mono"
            />
            <button
              onClick={handleParse}
              disabled={!pasteText.trim()}
              className="mt-3 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Parse Transactions
            </button>
          </div>
        </div>
      )}

      {activeTab === "csv" && (
        <div className="space-y-4">
          <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-8 text-center">
            <Upload className="w-10 h-10 text-zinc-500 mx-auto mb-3" />
            <p className="text-zinc-400 text-sm mb-4">
              Upload a Safaricom M-Pesa statement CSV export
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Choose File
            </button>
            <p className="text-xs text-zinc-600 mt-3">
              Supports .csv and .txt files exported from Safaricom M-Pesa statements
            </p>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Preview Table */}
      {parsedTransactions.length > 0 && !results && (
        <div className="mt-6 bg-zinc-800/60 border border-zinc-700/50 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-700/50 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              Preview — {parsedTransactions.length} transaction{parsedTransactions.length !== 1 ? "s" : ""}
            </h3>
            <button
              onClick={handleReconcile}
              disabled={reconciling}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {reconciling ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Reconciling...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Reconcile Now
                </>
              )}
            </button>
          </div>
          <TransactionTable transactions={parsedTransactions} onRemove={handleRemoveTransaction} />
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="mt-6 space-y-4">
          {/* Matched */}
          <div className="bg-zinc-800/60 border border-emerald-500/20 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-700/50 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-white">
                Matched — {results.matched.length} transaction{results.matched.length !== 1 ? "s" : ""}
              </h3>
            </div>
            {results.matched.length > 0 ? (
              <MatchedDetailTable matched={results.matched} />
            ) : (
              <div className="text-center py-6 text-zinc-500 text-sm">No transactions matched</div>
            )}
          </div>

          {/* Unmatched */}
          <div className="bg-zinc-800/60 border border-amber-500/20 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-700/50 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-white">
                Unmatched — {results.unmatched.length} transaction{results.unmatched.length !== 1 ? "s" : ""}
              </h3>
            </div>
            {results.unmatched.length > 0 ? (
              <TransactionTable transactions={results.unmatched} showStatus={false} />
            ) : (
              <div className="text-center py-6 text-zinc-500 text-sm">All transactions matched!</div>
            )}
          </div>

          {/* Re-reconcile button */}
          <div className="flex gap-2">
            <button
              onClick={handleReconcile}
              disabled={reconciling}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {reconciling ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Reconciling...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Re-run Reconciliation
                </>
              )}
            </button>
            <button
              onClick={handleClear}
              className="px-5 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800/50 rounded-lg text-sm transition-colors"
            >
              Start New
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MpesaReconcile;
