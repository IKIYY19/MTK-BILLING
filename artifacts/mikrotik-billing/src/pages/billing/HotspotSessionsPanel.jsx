import { Fragment, useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Search,
  Signal,
  Wifi,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "/api";
const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
  ["all", "All sessions"],
  ["pending", "Awaiting payment"],
  ["authorized", "Authorized"],
  ["authorization_failed", "Router authorization failed"],
  ["expiration_cleanup_failed", "Expiry cleanup failed"],
  ["failed", "Payment failed"],
  ["payment_review", "Payment review"],
  ["expired", "Expired"],
];

const STATUS_STYLES = {
  initiating: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  pending: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  payment_confirmed: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  provisioning: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  authorization_failed: "border-rose-400/30 bg-rose-400/10 text-rose-200",
  authorized: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  expiration_pending: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  expiration_cleanup_failed: "border-rose-400/30 bg-rose-400/10 text-rose-200",
  expired: "border-zinc-700 bg-zinc-800 text-zinc-300",
  failed: "border-zinc-700 bg-zinc-800 text-zinc-300",
  payment_review: "border-rose-400/30 bg-rose-400/10 text-rose-200",
};

function formatMoney(value) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function humanize(value) {
  return String(value || "unknown")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap border px-2 py-1 text-xs font-medium ${
        STATUS_STYLES[status] || "border-zinc-700 bg-zinc-800 text-zinc-300"
      }`}
    >
      {humanize(status)}
    </span>
  );
}

function Metric({ icon: Icon, label, value, tone = "text-zinc-100" }) {
  return (
    <div className="flex min-w-0 items-center gap-3 py-3">
      <Icon className={`h-4 w-4 shrink-0 ${tone}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs text-zinc-500">{label}</p>
        <p className={`mt-0.5 truncate text-base font-semibold ${tone}`}>{value}</p>
      </div>
    </div>
  );
}

export default function HotspotSessionsPanel() {
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState(null);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [events, setEvents] = useState([]);
  const [eventsError, setEventsError] = useState("");
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [retryingId, setRetryingId] = useState("");
  const [retryError, setRetryError] = useState("");
  const eventRequestId = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(0);
      setSearch(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    axios
      .get(`${API}/captive-portal/hotspot-sessions`, {
        params: {
          status,
          search,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
      })
      .then(({ data }) => {
        if (cancelled) return;
        setSessions(Array.isArray(data.sessions) ? data.sessions : []);
        setStats(data.stats || null);
        setTotal(Number(data.total) || 0);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(
          requestError.response?.data?.error ||
            "Hotspot sessions could not be loaded. Refresh the page to try again.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, search, page, refreshKey]);

  const openEvents = async (sessionId) => {
    if (expandedId === sessionId) {
      eventRequestId.current += 1;
      setExpandedId("");
      return;
    }
    const requestId = ++eventRequestId.current;
    setExpandedId(sessionId);
    setEvents([]);
    setEventsError("");
    setLoadingEvents(true);
    try {
      const { data } = await axios.get(`${API}/captive-portal/hotspot-events`, {
        params: { session_id: sessionId, limit: 50 },
      });
      if (eventRequestId.current === requestId) {
        setEvents(Array.isArray(data.events) ? data.events : []);
      }
    } catch (requestError) {
      if (eventRequestId.current === requestId) {
        setEventsError(
          requestError.response?.data?.error || "This session's activity could not be loaded.",
        );
      }
    } finally {
      if (eventRequestId.current === requestId) setLoadingEvents(false);
    }
  };

  const retryAuthorization = async (sessionId) => {
    setRetryingId(sessionId);
    setRetryError("");
    try {
      await axios.post(`${API}/captive-portal/hotspot-sessions/${sessionId}/retry-authorization`);
      setRefreshKey((key) => key + 1);
    } catch (requestError) {
      setRetryError(
        requestError.response?.data?.error ||
          "Router authorization could not be retried. Check the router connection and try again.",
      );
    } finally {
      setRetryingId("");
    }
  };

  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const start = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const end = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <section className="space-y-5" aria-labelledby="hotspot-sessions-title">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="hotspot-sessions-title" className="text-xl font-semibold text-white">
            Hotspot sessions
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Track guest payments, router access, and session expiry.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((key) => key + 1)}
          disabled={loading}
          className="inline-flex items-center gap-2 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-amber-400/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      <div className="grid grid-cols-2 gap-x-4 border-y border-zinc-800 px-2 sm:grid-cols-3 lg:grid-cols-5">
        <Metric icon={Activity} label="All sessions" value={stats?.total_sessions ?? "—"} />
        <Metric
          icon={Clock3}
          label="Awaiting payment"
          value={stats?.pending_count ?? "—"}
          tone="text-sky-300"
        />
        <Metric
          icon={Wifi}
          label="Active access"
          value={stats?.active_count ?? "—"}
          tone="text-emerald-300"
        />
        <Metric
          icon={AlertTriangle}
          label="Needs attention"
          value={stats?.attention_count ?? "—"}
          tone="text-rose-200"
        />
        <Metric
          icon={CircleDollarSign}
          label="Payments received"
          value={stats ? formatMoney(stats.paid_total) : "—"}
          tone="text-amber-300"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
            aria-hidden="true"
          />
          <span className="sr-only">Search hotspot sessions</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search MAC, IP, package, router or receipt"
            className="h-10 w-full border border-zinc-700 bg-zinc-900 pl-9 pr-3 text-sm text-white placeholder:text-zinc-500 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
          />
        </label>
        <label>
          <span className="sr-only">Filter sessions by status</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(0);
            }}
            className="h-10 w-full border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20 sm:w-64"
          >
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {retryError && (
        <div role="alert" className="flex items-start gap-2 border border-rose-400/30 bg-rose-400/5 p-3 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{retryError}</span>
        </div>
      )}

      {error ? (
        <div role="alert" className="border border-rose-400/30 bg-rose-400/5 p-5">
          <div className="flex items-start gap-3 text-sm text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
            className="mt-4 text-sm font-medium text-rose-100 underline underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-200"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="overflow-hidden border border-zinc-800 bg-zinc-950/40">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-zinc-800 bg-zinc-900/70 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Guest / device</th>
                  <th scope="col" className="px-4 py-3 font-medium">Package</th>
                  <th scope="col" className="px-4 py-3 font-medium">Payment</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Access expiry</th>
                  <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {loading && sessions.length === 0 ? (
                  Array.from({ length: 5 }, (_, index) => (
                    <tr key={index} aria-hidden="true">
                      {Array.from({ length: 6 }, (_, cell) => (
                        <td key={cell} className="px-4 py-4">
                          <div className="h-4 w-24 animate-pulse bg-zinc-800" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : sessions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center">
                      {search || status !== "all" ? (
                        <>
                          <Search className="mx-auto h-5 w-5 text-zinc-500" aria-hidden="true" />
                          <p className="mt-3 text-sm font-medium text-zinc-200">No matching sessions</p>
                          <p className="mt-1 text-sm text-zinc-500">Change the search or status filter.</p>
                        </>
                      ) : (
                        <>
                          <Signal className="mx-auto h-5 w-5 text-zinc-500" aria-hidden="true" />
                          <p className="mt-3 text-sm font-medium text-zinc-200">No hotspot sessions yet</p>
                          <p className="mt-1 text-sm text-zinc-500">Guest checkouts will appear here after the first payment starts.</p>
                        </>
                      )}
                    </td>
                  </tr>
                ) : (
                  sessions.map((session) => {
                    return (
                      <Fragment key={session.id}>
                        <tr className="align-top transition-colors hover:bg-zinc-900/50">
                          <td className="px-4 py-4">
                            <p className="font-medium text-zinc-100">
                              {session.phone_last4 ? `•••• ${session.phone_last4}` : "Guest"}
                            </p>
                            <p className="mt-1 font-mono text-xs text-zinc-400">{session.mac_address}</p>
                            {session.client_ip && (
                              <p className="mt-1 text-xs text-zinc-500">{session.client_ip}</p>
                            )}
                            <p className="mt-1 text-xs text-zinc-600">Router: {session.router_name}</p>
                          </td>
                          <td className="px-4 py-4">
                            <p className="font-medium text-zinc-200">{session.plan_name}</p>
                            <p className="mt-1 text-xs text-zinc-500">{formatDate(session.created_at)}</p>
                          </td>
                          <td className="px-4 py-4">
                            <p className="font-semibold text-zinc-100">{formatMoney(session.amount)}</p>
                            {session.mpesa_receipt && (
                              <p className="mt-1 font-mono text-xs text-zinc-500">{session.mpesa_receipt}</p>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <StatusBadge status={session.status} />
                            {session.error_message && (
                              <p className="mt-2 max-w-56 text-xs leading-5 text-rose-200/80">
                                {session.error_message}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <p className="text-zinc-200">{formatDate(session.expires_at)}</p>
                            {session.paid_at && (
                              <p className="mt-1 text-xs text-zinc-500">Paid {formatDate(session.paid_at)}</p>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center justify-end gap-2">
                              {session.status === "authorization_failed" && (
                                <button
                                  type="button"
                                  onClick={() => retryAuthorization(session.id)}
                                  disabled={retryingId === session.id}
                                  className="inline-flex items-center gap-1.5 whitespace-nowrap border border-amber-400/40 px-2.5 py-1.5 text-xs font-medium text-amber-200 hover:border-amber-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:cursor-wait disabled:opacity-60"
                                >
                                  {retryingId === session.id && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                                  Retry router
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openEvents(session.id)}
                                aria-expanded={expandedId === session.id}
                                className="whitespace-nowrap px-2 py-1.5 text-xs font-medium text-zinc-300 underline decoration-zinc-700 underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
                              >
                                {expandedId === session.id ? "Hide activity" : "Activity"}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandedId === session.id && (
                          <tr className="bg-zinc-900/40">
                            <td colSpan={6} className="px-4 py-5">
                              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-200">
                                <Activity className="h-4 w-4 text-amber-300" />
                                Session activity
                              </div>
                              {loadingEvents ? (
                                <div className="flex items-center gap-2 py-2 text-sm text-zinc-400" role="status">
                                  <LoaderCircle className="h-4 w-4 animate-spin" />
                                  Loading session events…
                                </div>
                              ) : eventsError ? (
                                <p role="alert" className="text-sm text-rose-200">{eventsError}</p>
                              ) : events.length === 0 ? (
                                <p className="text-sm text-zinc-500">No activity has been recorded for this session.</p>
                              ) : (
                                <ol className="space-y-3">
                                  {events.map((event, index) => (
                                    <li key={`${event.event_type}-${event.created_at}-${index}`} className="grid gap-1 sm:grid-cols-[180px_1fr] sm:gap-4">
                                      <time className="text-xs text-zinc-500">{formatDate(event.created_at)}</time>
                                      <div>
                                        <p className="text-sm text-zinc-200">{humanize(event.event_type)}</p>
                                        {event.details &&
                                          typeof event.details === "object" &&
                                          Object.keys(event.details).length > 0 && (
                                          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-xs text-zinc-500">
                                            {JSON.stringify(event.details, null, 2)}
                                          </pre>
                                        )}
                                      </div>
                                    </li>
                                  ))}
                                </ol>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 px-4 py-3">
            <p className="text-xs text-zinc-500">
              {loading && sessions.length > 0 ? "Updating sessions…" : `Showing ${start}–${end} of ${total}`}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0 || loading}
                aria-label="Previous page"
                className="border border-zinc-700 p-2 text-zinc-300 hover:border-zinc-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(lastPage, current + 1))}
                disabled={page >= lastPage || loading}
                aria-label="Next page"
                className="border border-zinc-700 p-2 text-zinc-300 hover:border-zinc-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </footer>
        </div>
      )}
    </section>
  );
}
