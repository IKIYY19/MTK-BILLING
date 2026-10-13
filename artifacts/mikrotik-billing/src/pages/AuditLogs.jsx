import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import {
  Shield,
  Search,
  Filter,
  Clock,
  User,
  ChevronDown,
  ChevronUp,
  FileText,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Database,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

const API = import.meta.env.VITE_API_URL || "/api";

const PAGE_SIZE = 50;

const ACTION_COLORS = {
  USER_LOGIN: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  USER_CREATED: "bg-green-500/20 text-green-400 border-green-500/30",
  USER_UPDATED: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  CUSTOMER_CREATED: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  CUSTOMER_UPDATED: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  CUSTOMER_SUSPENDED: "bg-red-500/20 text-red-400 border-red-500/30",
  CUSTOMER_RESTORED: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  INVOICE_CREATED: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  PAYMENT_RECORDED: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  ROUTER_CONNECTED: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
};

const ENTITY_COLORS = {
  user: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  customer: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  invoice: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  payment: "bg-green-500/20 text-green-400 border-green-500/30",
  router: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  subscription: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  plan: "bg-pink-500/20 text-pink-400 border-pink-500/30",
};

function formatTimestamp(ts) {
  if (!ts) {return "—";}
  const d = new Date(ts);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function ActionBadge({ action }) {
  const colorClass =
    ACTION_COLORS[action] || "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}
    >
      {action ? action.replace(/_/g, " ") : "—"}
    </span>
  );
}

function EntityBadge({ entityType }) {
  const colorClass =
    ENTITY_COLORS[entityType] ||
    "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}
    >
      {entityType || "—"}
    </span>
  );
}

function JsonDiffView({ before, after }) {
  const [expanded, setExpanded] = useState(false);
  const beforeObj = typeof before === "string" ? tryParse(before) : before;
  const afterObj = typeof after === "string" ? tryParse(after) : after;

  const hasData = beforeObj || afterObj;

  if (!hasData) {
    return <span className="text-xs text-zinc-600 italic">No change data</span>;
  }

  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
      >
        {expanded ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
        {expanded ? "Hide" : "Show"} Change Details
      </button>
      {expanded && (
        <div className="mt-2 grid grid-cols-1 gap-3">
          {beforeObj && (
            <div>
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                Before
              </div>
              <pre className="text-xs text-zinc-400 bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 overflow-x-auto max-h-48">
                {JSON.stringify(beforeObj, null, 2)}
              </pre>
            </div>
          )}
          {afterObj && (
            <div>
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                After
              </div>
              <pre className="text-xs text-zinc-300 bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 overflow-x-auto max-h-48">
                {JSON.stringify(afterObj, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function tryParse(val) {
  if (!val) {return null;}
  if (typeof val === "object") {return val;}
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
}

export function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState({});

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(0);
  const [actions, setActions] = useState([]);
  const [entityTypes, setEntityTypes] = useState([]);
  const [storageMode, setStorageMode] = useState(null);
  const [fetchError, setFetchError] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setFetchError("");
    try {
      const params = new URLSearchParams();
      if (actionFilter) {params.set("action", actionFilter);}
      if (entityTypeFilter) {params.set("entity_type", entityTypeFilter);}
      if (searchText) {params.set("search", searchText);}
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      const { data } = await axios.get(
        `${API}/audit/logs?${params.toString()}`,
      );
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setTotal(Number(data.total) || 0);
      setActions(Array.isArray(data.actions) ? data.actions : []);
      setEntityTypes(Array.isArray(data.entityTypes) ? data.entityTypes : []);
      setStorageMode(data.storage || null);
    } catch (e) {
      console.error("Failed to fetch audit logs:", e);
      setFetchError(
        e.response?.data?.error || "Could not connect to the audit log service.",
      );
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, entityTypeFilter, searchText, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const toggleRow = (id) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-400" />
            Audit Logs
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Track all authentication and billing events across the platform
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchLogs}
          disabled={loading}
        >
          <RefreshCw
            className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {storageMode === "memory" && (
        <Card className="mb-6 border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Database className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-300">
                  Audit logs are session-only
                </p>
                <p className="text-xs text-amber-400/70 mt-1">
                  Logs are available here while the API is running, but will
                  be lost when it restarts. Configure PostgreSQL to keep a
                  durable audit history.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {fetchError && (
        <Card className="mb-6 border-red-500/20 bg-red-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-red-300">
                  Unable to load audit logs
                </p>
                <p className="text-xs text-red-400/70 mt-1">{fetchError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchLogs}
                  disabled={loading}
                  className="mt-3"
                >
                  Try again
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter Bar */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Action filter */}
            <div className="flex-1 min-w-[160px]">
              <Label className="text-xs text-zinc-500 mb-1.5 block">
                Action
              </Label>
              <select
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(0);
                }}
                className="w-full h-10 rounded-md border border-zinc-700/60 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40"
              >
                <option value="">All Actions</option>
                {actions.map((action) => (
                  <option key={action} value={action}>
                    {action.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>

            {/* Entity Type filter */}
            <div className="flex-1 min-w-[160px]">
              <Label className="text-xs text-zinc-500 mb-1.5 block">
                Entity Type
              </Label>
              <select
                value={entityTypeFilter}
                onChange={(e) => {
                  setEntityTypeFilter(e.target.value);
                  setPage(0);
                }}
                className="w-full h-10 rounded-md border border-zinc-700/60 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40"
              >
                <option value="">All Entities</option>
                {entityTypes.map((entityType) => (
                  <option key={entityType} value={entityType}>
                    {entityType.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div className="flex-[2] min-w-[200px]">
              <Label className="text-xs text-zinc-500 mb-1.5 block">
                Search
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  placeholder="Search logs..."
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value);
                    setPage(0);
                  }}
                  className="pl-9 bg-zinc-900/60 border-zinc-700/60 text-zinc-200"
                />
              </div>
            </div>

            {/* Clear filters */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActionFilter("");
                setEntityTypeFilter("");
                setSearchText("");
                setPage(0);
              }}
              className="text-zinc-400 hover:text-zinc-200"
            >
              <Filter className="w-3 h-3 mr-1" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Total count */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-zinc-500">
          {total.toLocaleString()} log{total !== 1 ? "s" : ""} found
        </p>
      </div>

      {/* Logs Table */}
      <Card>
        <CardContent className="p-0">
          {loading && logs.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-6 h-6 text-zinc-500 animate-spin" />
            </div>
          ) : fetchError ? (
            <div className="flex flex-col items-center justify-center py-20 text-red-400">
              <AlertTriangle className="w-10 h-10 mb-3 opacity-60" />
              <p className="text-sm">Audit logs could not be loaded</p>
              <p className="text-xs text-red-400/70 mt-1">
                Check the connection and try again.
              </p>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
              <FileText className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">No audit logs found</p>
              <p className="text-xs text-zinc-600 mt-1">
                {total === 0
                  ? "Events will appear here as they occur"
                  : "Try adjusting your filters"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800/50">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      <Clock className="w-3 h-3 inline mr-1" />
                      Timestamp
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      <User className="w-3 h-3 inline mr-1" />
                      User
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      Action
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      Entity
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      Entity ID
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      IP Address
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <React.Fragment key={log.id}>
                      <tr
                        className={`border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors cursor-pointer ${
                          expandedRows[log.id] ? "bg-zinc-800/20" : ""
                        }`}
                        onClick={() => toggleRow(log.id)}
                      >
                        <td className="py-3 px-4 text-xs text-zinc-400 whitespace-nowrap font-mono">
                          {formatTimestamp(log.created_at)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-zinc-700/50 flex items-center justify-center flex-shrink-0">
                              <User className="w-3 h-3 text-zinc-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs text-zinc-300 truncate max-w-[120px]">
                                {log.user_name || "System"}
                              </p>
                              {log.user_role && (
                                <p className="text-[10px] text-zinc-500">
                                  {log.user_role}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <ActionBadge action={log.action} />
                        </td>
                        <td className="py-3 px-4">
                          <EntityBadge entityType={log.entity_type} />
                        </td>
                        <td className="py-3 px-4 text-xs text-zinc-500 font-mono truncate max-w-[100px]">
                          {log.entity_id
                            ? log.entity_id.slice(0, 8) + "..."
                            : "—"}
                        </td>
                        <td className="py-3 px-4 text-xs text-zinc-500 font-mono">
                          {log.ip_address || "—"}
                        </td>
                        <td className="py-3 px-4">
                          {expandedRows[log.id] ? (
                            <ChevronUp className="w-4 h-4 text-zinc-500" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-zinc-500" />
                          )}
                        </td>
                      </tr>
                      {expandedRows[log.id] && (
                        <tr className="bg-zinc-900/40">
                          <td colSpan={7} className="py-3 px-6">
                            <JsonDiffView
                              before={log.before_data}
                              after={log.after_data}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-zinc-500">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="w-3 h-3 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
            >
              Next
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
