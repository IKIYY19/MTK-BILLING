import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  AlertTriangle,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Router,
  Plus,
  Activity,
  UserPlus,
  Key,
  Wifi,
  MessageSquare,
  CreditCard,
  Link,
  Zap,
  ChevronRight,
} from "lucide-react";
import { useToast } from "../hooks/useToast";
import { useStore } from "../store";

const API_URL = import.meta.env.VITE_API_URL || "/api";

function SummaryMetric({ label, value, prefix = "", trend, trendLabel, onClick }) {
  const formattedValue = (Number(value) || 0).toLocaleString();
  const isPositive = Number(trend) >= 0;
  const content = (
    <>
      <span className="dashboard-metric-label">{label}</span>
      <span className="dashboard-metric-value">{prefix}{formattedValue}</span>
      {(trend !== undefined || trendLabel) && (
        <span className="dashboard-metric-detail">
          {trend !== undefined && (
            <span className={isPositive ? "dashboard-trend-positive" : "dashboard-trend-negative"}>
              {isPositive ? <ArrowUpRight aria-hidden="true" /> : <ArrowDownRight aria-hidden="true" />}
              {Math.abs(Number(trend))}%
            </span>
          )}
          {trendLabel && <span>{trendLabel}</span>}
        </span>
      )}
    </>
  );

  return onClick ? (
    <button type="button" className="dashboard-metric" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="dashboard-metric">{content}</div>
  );
}

function ActivityItem({ type, name, amount, time, currency }) {
  const typeConfig = {
    payment: { icon: CreditCard, label: "Payment received" },
    suspend: { icon: AlertTriangle, label: "Account suspended" },
    signup: { icon: UserPlus, label: "New customer" },
    renewal: { icon: RefreshCw, label: "Subscription renewed" },
  };
  const config = typeConfig[type] || typeConfig.payment;
  const Icon = config.icon;

  return (
    <div className="dashboard-payment-row">
      <span className="dashboard-payment-mark"><Icon aria-hidden="true" /></span>
      <div className="dashboard-payment-description">
        <p className="dashboard-payment-name">{name}</p>
        <p className="dashboard-payment-meta">{config.label} · {time}</p>
      </div>
      {amount != null && (
        <span className="dashboard-payment-amount">
          {currency} {(Number(amount) || 0).toLocaleString()}
        </span>
      )}
    </div>
  );
}

function MiniBarChart({ data = [], color = "#818cf8", label = "" }) {
  const hasData = data && data.length > 0 && data.some(d => (d.value || 0) > 0);
  const max = hasData ? Math.max(...data.map(d => d.value || 0), 1) : 1;

  return (
    <div>
      {label && <p className="text-xs font-semibold text-white/60 mb-3 uppercase tracking-wider">{label}</p>}
      {!hasData ? (
        <div className="dashboard-chart-empty">
          <p className="text-xs">No revenue data yet</p>
        </div>
      ) : (
        <div className="dashboard-chart-bars" role="img" aria-label="Weekly revenue bar chart">
          {data.map((d, i) => {
            const pct = ((d.value || 0) / max) * 100;
            return (
              <div key={i} className="dashboard-chart-column">
                <div
                  className="dashboard-chart-bar"
                  style={{
                    height: `${Math.max(pct, 4)}%`,
                    background: color,
                  }}
                  title={`${d.label}: ${(Number(d.value) || 0).toLocaleString()}`}
                />
              </div>
            );
          })}
        </div>
      )}
      {data.length > 0 && (
        <div className="dashboard-chart-labels">
          {data.map((d, i) => (
            <span key={i}>{d.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickAction({ icon: Icon, label, color, onClick }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className="dashboard-quick-action"
      aria-label={label}
      data-tone={color || "blue"}
    >
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}



// ─── Main Dashboard ───────────────────────────────────────────────────────────
export function Dashboard() {
  const { fetchProjects } = useStore();
  const [stats, setStats] = useState(null);
  const [quickActions, setQuickActions] = useState([]);
  const [churnData, setChurnData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [currencySymbol, setCurrencySymbol] = useState("KES");
  const navigate = useNavigate();
  const toast = useToast();

  const fetchDashboardData = async () => {
    try {
      const [statsRes, actionsRes, settingsRes, churnRes] = await Promise.all([
        axios.get(`${API_URL}/dashboard/stats`),
        axios.get(`${API_URL}/dashboard/quick-actions`),
        axios.get(`${API_URL}/settings`).catch(() => ({ data: {} })),
        axios.get(`${API_URL}/analytics/churn-report`).catch(() => ({ data: null })),
      ]);
      const settings = settingsRes.data?.settings || settingsRes.data || {};
      setCurrencySymbol(settings.currency_symbol || settings.currency || "KES");
      if (!statsRes.data.success) {
        throw new Error("The dashboard returned no overview data.");
      }
      setStats(statsRes.data.stats || {});
      if (actionsRes.data.success && Array.isArray(actionsRes.data.actions)) {
        setQuickActions(actionsRes.data.actions);
      } else {
        setQuickActions([]);
      }
      if (churnRes.data?.high_risk) setChurnData(churnRes.data);
      setLastRefresh(new Date());
      setLoadError("");
      setLoading(false);
      return true;
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
      setLoadError("We couldn't load the overview. Check your connection and try again.");
      setLoading(false);
      return false;
    }
  };

  useEffect(() => { fetchDashboardData(); }, []);
  useEffect(() => {
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    fetchProjects();
    if (await fetchDashboardData()) {
      toast.success("Dashboard refreshed");
    }
  };

  // Build weekly bar data from real backend data
  const defaultWeekLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekRevenue = stats?.weeklyRevenue?.length > 0
    ? stats.weeklyRevenue
    : defaultWeekLabels.map((l) => ({ label: l, value: 0 }));

  if (loading && !stats) {
    return (
      <div className="dashboard-loading" role="status" aria-live="polite">
        <span className="dashboard-loading-mark" aria-hidden="true" />
        <span>Loading the operations overview…</span>
      </div>
    );
  }

  const iconMap = { UserPlus, MessageSquare, CreditCard, Link, Router, Key, Wifi, Activity, Zap };

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1>Operations overview</h1>
          <p>Network access, customer accounts, and collections in one place.</p>
        </div>
        <div className="dashboard-header-actions">
          <span className="dashboard-updated" aria-live="polite">
            <span className="dashboard-updated-dot" aria-hidden="true" />
            {lastRefresh
              ? `Updated ${lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Waiting for data"}
          </span>
          <button
            type="button"
            onClick={() => navigate("/billing-customers/new")}
            className="dashboard-button dashboard-button-primary"
          >
            <Plus aria-hidden="true" /> Add customer
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            className="dashboard-button dashboard-button-secondary"
            disabled={loading}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} aria-hidden="true" />
            Refresh data
          </button>
        </div>
      </header>

      <div className="dashboard-content">
        {loadError && (
          <div className="dashboard-error" role="alert">
            <AlertTriangle aria-hidden="true" />
            <span>{loadError}</span>
            <button type="button" onClick={handleRefresh}>Try again</button>
          </div>
        )}
        {stats && (
          <section className="dashboard-snapshot" aria-label="Billing and customer summary">
            <SummaryMetric
              label="Today's Revenue"
              value={stats.todayRevenue || 0}
              prefix={`${currencySymbol} `}
              trend={stats.revenueChange || 0}
              trendLabel={`${stats.todayPayments || 0} payments today`}
              onClick={() => navigate("/billing-reports")}
            />
            <SummaryMetric
              label="Month revenue"
              value={stats.monthRevenue || 0}
              prefix={`${currencySymbol} `}
              trend={stats.revenueChange || 0}
              trendLabel="vs last month"
              onClick={() => navigate("/billing-reports")}
            />
            <SummaryMetric
              label="Outstanding"
              value={stats.outstandingBalance || 0}
              prefix={`${currencySymbol} `}
              trendLabel={`${stats.overdueInvoices || 0} overdue invoices`}
              onClick={() => navigate("/billing-invoices")}
            />
            <SummaryMetric
              label="Active customers"
              value={stats.activeCustomers || 0}
              trend={stats.customerGrowth}
              trendLabel={`${stats.activeSubscriptions || 0} subscriptions`}
              onClick={() => navigate("/billing-customers")}
            />
          </section>
        )}

        {stats && (
          <section className="dashboard-status-list" aria-label="Service and account status">
            {[
              { label: "Online sessions", value: stats.activeRadiusSessions || 0, route: "/radius", note: "RADIUS active" },
              { label: "Overdue invoices", value: stats.overdueInvoices || 0, route: "/billing-invoices", note: `${currencySymbol} ${(stats.outstandingBalance || 0).toLocaleString()}` },
              { label: "Suspended accounts", value: stats.suspendedCustomers || 0, route: "/billing-auto-suspend", note: "Review accounts" },
              { label: "New this week", value: stats.recentCustomers || 0, route: "/billing-customers", note: "Customer sign-ups" },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                className="dashboard-status-item"
                onClick={() => navigate(item.route)}
              >
                <span className="dashboard-status-label">{item.label}</span>
                <span className="dashboard-status-value">{Number(item.value || 0).toLocaleString()}</span>
                <span className="dashboard-status-note">{item.note}</span>
                <ChevronRight aria-hidden="true" />
              </button>
            ))}
          </section>
        )}

        {stats && (
          <div className="dashboard-workspace">
            <section className="dashboard-section dashboard-revenue">
              <div className="dashboard-section-heading">
                <div>
                  <h2>Revenue movement</h2>
                  <p>Daily collections over the last seven days</p>
                </div>
                <button type="button" className="dashboard-text-action" onClick={() => navigate("/billing-reports")}>
                  Revenue report <ChevronRight aria-hidden="true" />
                </button>
              </div>
              <MiniBarChart data={weekRevenue} color="var(--dashboard-accent)" />
              <div className="dashboard-revenue-summary">
                <span>Month total</span>
                <strong>{currencySymbol} {(Number(stats.monthRevenue) || 0).toLocaleString()}</strong>
                <span>vs last month</span>
                <strong className={(Number(stats.revenueChange) || 0) >= 0 ? "dashboard-trend-positive" : "dashboard-trend-negative"}>
                  {(Number(stats.revenueChange) || 0) >= 0 ? "↑" : "↓"} {Math.abs(Number(stats.revenueChange) || 0)}%
                </strong>
              </div>
            </section>

            <section className="dashboard-section dashboard-payments">
              <div className="dashboard-section-heading">
                <div>
                  <h2>Latest payments</h2>
                  <p>Recent collections recorded</p>
                </div>
                <button type="button" className="dashboard-text-action" onClick={() => navigate("/billing-payments")}>
                  All payments <ChevronRight aria-hidden="true" />
                </button>
              </div>
              <div className="dashboard-payment-list">
                {stats.recentPayments?.length > 0 ? (
                  stats.recentPayments.slice(0, 6).map((payment, index) => (
                    <ActivityItem
                      key={payment.id || index}
                      type="payment"
                      name={payment.customer_name || "Unknown"}
                      amount={payment.amount}
                      time={payment.received_at ? new Date(payment.received_at).toLocaleDateString() : ""}
                      currency={currencySymbol}
                    />
                  ))
                ) : (
                  <div className="dashboard-empty">
                    <CreditCard aria-hidden="true" />
                    <p>No payments have been recorded recently.</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {!stats && !loadError && (
          <div className="dashboard-empty dashboard-empty-large">
            <Activity aria-hidden="true" />
            <p>Overview data is not available yet.</p>
            <span>Refresh to check the connection and load the latest figures.</span>
          </div>
        )}

        {churnData && churnData.high_risk?.length > 0 && (
          <section className="dashboard-section dashboard-risk">
            <div className="dashboard-section-heading">
              <div>
                <h2>Customers needing attention</h2>
                <p>{churnData.high_risk.length} high-risk accounts identified</p>
              </div>
              <AlertTriangle aria-hidden="true" />
            </div>
            <div className="dashboard-risk-list">
              {churnData.high_risk.slice(0, 5).map((customer) => {
                const score = Math.min(100, Math.max(0, Number(customer.score) || 0));
                return (
                  <div key={customer.customer_id} className="dashboard-risk-row">
                    <div>
                      <p className="dashboard-payment-name">{customer.name}</p>
                      <p className="dashboard-payment-meta">
                        {customer.factors?.[0]?.detail || "Churn risk detected"}
                      </p>
                    </div>
                    <div className="dashboard-risk-meter" aria-label={`Risk score ${score}%`}>
                      <span style={{ width: `${score}%` }} />
                    </div>
                    <strong>{score}%</strong>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {quickActions.length > 0 && (
          <section className="dashboard-section dashboard-actions">
            <div className="dashboard-section-heading">
              <div>
                <h2>Quick actions</h2>
                <p>Common tasks from your workspace</p>
              </div>
              <Zap aria-hidden="true" />
            </div>
            <div className="dashboard-quick-actions">
              {quickActions.map(action => {
                const Icon = iconMap[action.icon] || Activity;
                return (
                  <QuickAction
                    key={action.id}
                    icon={Icon}
                    label={action.label}
                    color={action.color || "blue"}
                    onClick={() => navigate(action.route)}
                  />
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
