import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  BarChart3,
  Activity,
  Gauge,
  FileText,
  Receipt,
  Ticket,
  Lock,
  Smartphone,
  MessageSquare,
  Plus,
  Clock,
  CheckCircle,
  AlertCircle,
  X,
  Key,
  History,
  User,
  CreditCard,
  Settings,
  Wifi,
  Download,
  Upload,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  Calendar,
  Bell,
  Zap,
  Printer,
  ExternalLink,
  Star,
  ThumbsUp,
  ThumbsDown,
  LogOut,
  Layers,
} from "lucide-react";
import { useToast } from "../../hooks/useToast";
import { getToken } from "../../lib/auth";
import {
  generateInvoicePDF,
  generateReceiptPDF,
} from "../../utils/pdfGenerator";

const API = import.meta.env.VITE_API_URL || "/api";

function StatCard({ title, value, icon: Icon, color = "blue", sub }) {
  const colors = {
    blue: "from-blue-500 to-cyan-500",
    green: "from-emerald-500 to-green-500",
    purple: "from-purple-500 to-pink-500",
    orange: "from-orange-500 to-amber-500",
  };

  return (
    <div className="bg-zinc-900/50 backdrop-blur border border-zinc-800/50 rounded-2xl p-5 hover:border-zinc-700/50 transition-all">
      <div className="flex items-center justify-between mb-3">
        <div
          className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors[color]} flex items-center justify-center`}
        >
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-sm text-zinc-400 mt-1">{title}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

export function CustomerPortal() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [speedTest, setSpeedTest] = useState({
    running: false,
    download: 0,
    upload: 0,
    ping: 0,
  });
  const [bandwidthHistory, setBandwidthHistory] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    subject: "",
    description: "",
    category: "general",
  });
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [paying, setPaying] = useState(false);
  const [usageAlerts, setUsageAlerts] = useState([]);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [changingPassword, setChangingPassword] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    service_quality: "good",
    comment: "",
  });
  const [customerReview, setCustomerReview] = useState(null);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [passwordInfo, setPasswordInfo] = useState({
    password_changed_at: null,
  });
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [credentialsForm, setCredentialsForm] = useState({
    current_password: "",
    new_username: "",
    new_password: "",
    confirm_password: "",
  });
  const [updatingCredentials, setUpdatingCredentials] = useState(false);
  const [availablePlans, setAvailablePlans] = useState([]);
  const [changingPlan, setChangingPlan] = useState(false);
  const [confirmPlan, setConfirmPlan] = useState(null);
  const [billingInvoices, setBillingInvoices] = useState([]);
  const [billingPayments, setBillingPayments] = useState([]);
  const [usageHistory, setUsageHistory] = useState([]);
  const [usageViewMode, setUsageViewMode] = useState("daily");
  const [subscriptions, setSubscriptions] = useState([]);

  useEffect(() => {
    // Check auth - redirect to login if not authenticated
    const token = localStorage.getItem("customerToken");
    if (!token) {
      navigate("/portal/login", { replace: true });
      return;
    }
    fetchData();
    fetchPaymentHistory();
    fetchSupportTickets();
    fetchBandwidthHistory();
    fetchCustomerReview();
    fetchPasswordInfo();
    fetchAvailablePlans();
    fetchBillingInvoices();
    fetchBillingPayments();
    fetchUsageHistory();
    fetchSubscriptions();
  }, [customerId]);

  // Handle browser back/forward cache (bfcache) - page may restore from cache
  useEffect(() => {
    const handlePageShow = (e) => {
      if (e.persisted) {
        const token = localStorage.getItem("customerToken");
        if (!token) {
          navigate("/portal/login", { replace: true });
        }
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  useEffect(() => {
    checkUsageAlerts();
  }, [data]);

  const fetchData = async () => {
    try {
      const { data } = await axios.get(`${API}/portal/${customerId}/dashboard`);
      setData(data);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load data");
    }
    setLoading(false);
  };

  const fetchPaymentHistory = async () => {
    try {
      const { data } = await axios.get(`${API}/portal/${customerId}/payments`);
      setPaymentHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to fetch payments:", e);
    }
  };

  const fetchSupportTickets = async () => {
    try {
      const { data } = await axios.get(`${API}/portal/${customerId}/tickets`);
      setSupportTickets(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to fetch tickets:", e);
    }
  };

  const fetchBandwidthHistory = async () => {
    try {
      const { data } = await axios.get(`${API}/portal/${customerId}/bandwidth`);
      setBandwidthHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to fetch bandwidth:", e);
    }
  };

  const fetchAvailablePlans = async () => {
    try {
      const { data } = await axios.get(
        `${API}/portal/${customerId}/available-plans`,
      );
      setAvailablePlans(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to fetch available plans:", e);
    }
  };

  const fetchBillingInvoices = async () => {
    try {
      const { data } = await axios.get(
        `${API}/billing/invoices?customer_id=${customerId}`,
      );
      setBillingInvoices(Array.isArray(data) ? data : data?.invoices || []);
    } catch (e) {
      console.error("Failed to fetch billing invoices:", e);
    }
  };

  const fetchBillingPayments = async () => {
    try {
      const { data } = await axios.get(
        `${API}/billing/payments?customer_id=${customerId}`,
      );
      setBillingPayments(Array.isArray(data) ? data : data?.payments || []);
    } catch (e) {
      console.error("Failed to fetch billing payments:", e);
    }
  };

  const fetchUsageHistory = async () => {
    try {
      const { data } = await axios.get(
        `${API}/billing/usage/history?customer_id=${customerId}`,
      );
      setUsageHistory(Array.isArray(data) ? data : data?.usage || []);
    } catch (e) {
      console.error("Failed to fetch usage history:", e);
    }
  };

  const fetchSubscriptions = async () => {
    try {
      const { data } = await axios.get(
        `${API}/billing/subscriptions?customer_id=${customerId}`,
      );
      setSubscriptions(Array.isArray(data) ? data : data?.subscriptions || []);
    } catch (e) {
      console.error("Failed to fetch subscriptions:", e);
    }
  };

  const handleChangePlan = async () => {
    if (!confirmPlan) {return;}
    setChangingPlan(true);
    try {
      await axios.post(`${API}/portal/${customerId}/change-plan`, {
        plan_id: confirmPlan.id,
      });
      toast.success(`Plan changed to ${confirmPlan.name}`);
      setConfirmPlan(null);
      fetchData();
      fetchAvailablePlans();
    } catch (e) {
      toast.error("Failed to change plan");
    }
    setChangingPlan(false);
  };

  const checkUsageAlerts = () => {
    const alerts = [];
    const quotaPercent = data?.usage?.quota_used_percent || 0;

    if (quotaPercent >= 100) {
      alerts.push({
        type: "critical",
        message: "You have exceeded your monthly quota. Speed may be reduced.",
      });
    } else if (quotaPercent >= 90) {
      alerts.push({
        type: "warning",
        message: `You've used ${quotaPercent.toFixed(0)}% of your quota. ${100 - quotaPercent.toFixed(0)}% remaining.`,
      });
    } else if (quotaPercent >= 75) {
      alerts.push({
        type: "info",
        message: `You've used ${quotaPercent.toFixed(0)}% of your monthly quota.`,
      });
    }

    if (data?.outstanding_balance > 0) {
      alerts.push({
        type: "critical",
        message: `You have an outstanding balance of KES ${data.outstanding_balance.toFixed(2)}.`,
      });
    }

    setUsageAlerts(alerts);
  };

  const runSpeedTest = async () => {
    setSpeedTest({ running: true, download: 0, upload: 0, ping: 0 });

    try {
      // Simple speed test using file downloads
      const startTime = Date.now();

      // Test ping
      const pingStart = Date.now();
      await axios.get(`${API}/portal/${customerId}/ping`);
      const ping = Date.now() - pingStart;

      // Test download (download a test file or use a large endpoint response)
      const downloadStart = Date.now();
      await axios.get(`${API}/portal/${customerId}/speedtest`, {
        responseType: "blob",
      });
      const downloadTime = (Date.now() - downloadStart) / 1000;
      const downloadSpeed = ((1024 / downloadTime / 1024) * 8).toFixed(2); // Mbps

      // Test upload
      const uploadData = new Blob([new ArrayBuffer(512 * 1024)]); // 512KB
      const uploadStart = Date.now();
      await axios.post(`${API}/portal/${customerId}/speedtest`, uploadData);
      const uploadTime = (Date.now() - uploadStart) / 1000;
      const uploadSpeed = ((512 / uploadTime / 1024) * 8).toFixed(2); // Mbps

      setSpeedTest({
        running: false,
        download: downloadSpeed,
        upload: uploadSpeed,
        ping: ping,
      });
    } catch (e) {
      console.error("Speed test failed:", e);
      setSpeedTest({ running: false, download: 0, upload: 0, ping: 0 });
      toast.error("Speed test failed");
    }
  };

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/portal/${customerId}/tickets`, ticketForm);
      setShowTicketForm(false);
      setTicketForm({ subject: "", description: "", category: "general" });
      toast.success("Ticket created", "Your support ticket has been submitted");
      fetchSupportTickets();
    } catch (error) {
      toast.error(
        "Failed to create ticket",
        error.response?.data?.error || error.message,
      );
    }
  };

  const handlePayment = async () => {
    if (!payAmount) {return;}
    setPaying(true);
    try {
      await axios.post(`${API}/portal/${customerId}/pay`, {
        amount: parseFloat(payAmount),
        method: "mpesa",
      });
      setShowPayModal(false);
      setPayAmount("");
      toast.success("Payment initiated", "Check your phone for M-Pesa prompt");
      fetchData();
      fetchPaymentHistory();
    } catch (e) {
      toast.error("Payment failed", e.response?.data?.error || e.message);
    }
    setPaying(false);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error("Passwords do not match");
      return;
    }
    if (passwordForm.new_password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setChangingPassword(true);
    try {
      await axios.post(`${API}/portal/${customerId}/change-password`, {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      setShowPasswordModal(false);
      setPasswordForm({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });
      toast.success("Password changed successfully");
    } catch (e) {
      toast.error(
        "Failed to change password",
        e.response?.data?.error || e.message,
      );
    }
    setChangingPassword(false);
  };

  const fetchCustomerReview = async () => {
    try {
      const { data } = await axios.get(`${API}/portal/${customerId}/reviews`);
      if (data.has_review) {
        setCustomerReview(data.review);
      }
    } catch (e) {
      console.error("Failed to fetch review:", e);
    }
  };

  const fetchPasswordInfo = async () => {
    try {
      const { data } = await axios.get(
        `${API}/portal/${customerId}/password-info`,
      );
      setPasswordInfo(data);
    } catch (e) {
      console.error("Failed to fetch password info:", e);
    }
  };

  const handleUpdateCredentials = async (e) => {
    e.preventDefault();
    if (
      credentialsForm.new_password &&
      credentialsForm.new_password !== credentialsForm.confirm_password
    ) {
      toast.error("Passwords do not match");
      return;
    }
    setUpdatingCredentials(true);
    try {
      await axios.put(`${API}/portal/${customerId}/credentials`, {
        current_password: credentialsForm.current_password,
        new_username: credentialsForm.new_username || undefined,
        new_password: credentialsForm.new_password || undefined,
      });
      toast.success("Credentials updated successfully");
      setShowSettingsModal(false);
      setCredentialsForm({
        current_password: "",
        new_username: "",
        new_password: "",
        confirm_password: "",
      });
      fetchData(); // Refresh to get updated username
    } catch (e) {
      toast.error(
        "Failed to update credentials",
        e.response?.data?.error || e.message,
      );
    } finally {
      setUpdatingCredentials(false);
    }
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    setSubmittingReview(true);
    try {
      await axios.post(`${API}/portal/${customerId}/reviews`, reviewForm);
      setShowReviewModal(false);
      setReviewForm({ rating: 5, service_quality: "good", comment: "" });
      toast.success("Thank you for your feedback!");
      fetchCustomerReview();
    } catch (e) {
      toast.error(
        "Failed to submit review",
        e.response?.data?.error || e.message,
      );
    }
    setSubmittingReview(false);
  };

  const downloadInvoice = (invoice) => {
    generateInvoicePDF(invoice, data?.customer || {});
  };

  const downloadReceipt = (payment) => {
    const invoice = data?.recent_invoices?.find(
      (inv) => inv.id === payment.invoice_id,
    );
    generateReceiptPDF(payment, invoice, data?.customer || {});
  };

  if (loading)
    {return <div className="p-8 text-zinc-400">Loading portal...</div>;}
  if (!data) {return <div className="p-8 text-white">Customer not found</div>;}

  const quotaPercent = data.usage?.quota_used_percent
    ? parseInt(data.usage.quota_used_percent)
    : 0;
  const isThrottled = data.subscription?.throttled;

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "usage", label: "Bandwidth", icon: Activity },
    { id: "speedtest", label: "Speed Test", icon: Gauge },
    { id: "invoices", label: "Invoices", icon: FileText },
    { id: "payments", label: "Payments", icon: Receipt },
    { id: "support", label: "Support", icon: Ticket },
    { id: "history", label: "History", icon: History },
    { id: "review", label: "Review", icon: Star },
    { id: "plans", label: "Plans", icon: Layers },
    { id: "settings", label: "Settings", icon: Lock },
  ];

  const handleLogout = () => {
    localStorage.removeItem("customerToken");
    localStorage.removeItem("customer");
    navigate("/portal/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#0a0b0f]">
      {/* Header */}
      <div className="bg-zinc-900/50 backdrop-blur border-b border-zinc-800/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {data.customer.name}
            </h1>
            <p className="text-zinc-400 text-sm">
              {data.customer.phone} • {data.customer.email}
              <span className="ml-2 px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded text-xs font-mono">
                Acct:{" "}
                {data.customer.account_number ||
                  data.customer.id_number ||
                  data.customer.id?.substring(0, 8) ||
                  "-"}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowTicketForm(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Open Ticket</span>
            </button>
            <button
              onClick={() => setShowPayModal(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-colors"
            >
              <Smartphone className="w-4 h-4" />
              <span>Pay Now</span>
            </button>
            <button
              onClick={handleLogout}
              className="text-zinc-400 hover:text-white p-2 rounded-lg hover:bg-zinc-800/50 transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Usage Alerts */}
      {usageAlerts.length > 0 && (
        <div className="max-w-7xl mx-auto px-6 py-4 space-y-2">
          {usageAlerts.map((alert, i) => (
            <div
              key={i}
              className={`flex items-center justify-between p-4 rounded-xl border ${
                alert.type === "critical"
                  ? "bg-red-500/10 border-red-500/20"
                  : alert.type === "warning"
                    ? "bg-amber-500/10 border-amber-500/20"
                    : "bg-blue-500/10 border-blue-500/20"
              }`}
            >
              <div className="flex items-center gap-3">
                <Bell
                  className={`w-5 h-5 ${
                    alert.type === "critical"
                      ? "text-red-400"
                      : alert.type === "warning"
                        ? "text-amber-400"
                        : "text-blue-400"
                  }`}
                />
                <span
                  className={`text-sm ${
                    alert.type === "critical"
                      ? "text-red-300"
                      : alert.type === "warning"
                        ? "text-amber-300"
                        : "text-blue-300"
                  }`}
                >
                  {alert.message}
                </span>
              </div>
              <button
                onClick={() =>
                  setUsageAlerts((alerts) =>
                    alerts.filter((_, idx) => idx !== i),
                  )
                }
                className="text-zinc-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white shadow-lg"
                  : "bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800/50"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            {/* Status Banners */}
            {isThrottled && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <div>
                  <span className="text-amber-300 font-semibold">
                    Service Throttled
                  </span>
                  <span className="text-amber-400 text-sm ml-2">
                    Your speed has been reduced to 1M/1M
                  </span>
                </div>
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Outstanding Balance - Pay Now Card */}
              {data.outstanding_balance > 0 && (
                <div className="bg-gradient-to-r from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                      <Smartphone className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-emerald-300 font-semibold text-lg">
                        Outstanding Balance
                      </p>
                      <p className="text-3xl font-bold text-white">
                        KES {data.outstanding_balance.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowPayModal(true)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-xl font-bold text-lg shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 w-full sm:w-auto"
                  >
                    <Smartphone className="w-5 h-5 inline mr-2" />
                    Pay with M-Pesa
                  </button>
                </div>
              )}
              <StatCard
                title="Current Plan"
                value={data.subscription?.plan_name || "No plan"}
                icon={Wifi}
                color="blue"
                sub={data.subscription?.speed}
              />
              <StatCard
                title="Monthly Price"
                value={`KES ${data.subscription?.plan?.price || 0}`}
                icon={DollarSign}
                color="green"
                sub="per month"
              />
              <StatCard
                title="Data Used"
                value={`${data.usage?.total_gb || 0} GB`}
                icon={Download}
                color="purple"
                sub={`of ${data.usage?.quota_gb || 0} GB`}
              />
              <StatCard
                title="Active Sessions"
                value={data.usage?.active_sessions || 0}
                icon={Zap}
                color="orange"
                sub={`${data.usage?.session_count || 0} total`}
              />
              <StatCard
                title="Days Remaining"
                value={(() => {
                  const sub = subscriptions[0] || data.subscription;
                  if (sub?.next_billing_date) {
                    const now = new Date();
                    const next = new Date(sub.next_billing_date);
                    const diff = Math.ceil(
                      (next - now) / (1000 * 60 * 60 * 24),
                    );
                    return diff > 0 ? diff : 0;
                  }
                  if (sub?.billing_cycle_days_remaining)
                    {return sub.billing_cycle_days_remaining;}
                  return "—";
                })()}
                icon={Calendar}
                color="blue"
                sub={(() => {
                  const sub = subscriptions[0] || data.subscription;
                  if (sub?.next_billing_date)
                    {return `Next: ${new Date(sub.next_billing_date).toLocaleDateString()}`;}
                  return "billing cycle";
                })()}
              />
            </div>

            {/* Quota Progress */}
            {data.usage?.quota_gb && (
              <div className="bg-zinc-900/50 backdrop-blur border border-zinc-800/50 rounded-2xl p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Monthly Quota Usage
                  </h3>
                  <span
                    className={`text-lg font-bold ${
                      quotaPercent >= 100
                        ? "text-red-400"
                        : quotaPercent >= 80
                          ? "text-amber-400"
                          : "text-emerald-400"
                    }`}
                  >
                    {quotaPercent}%
                  </span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-4 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      quotaPercent >= 100
                        ? "bg-red-500"
                        : quotaPercent >= 80
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(100, quotaPercent)}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm text-zinc-400 mt-2">
                  <span>{data.usage.total_gb} GB used</span>
                  <span>
                    {(data.usage.quota_gb - data.usage.total_gb).toFixed(1)} GB
                    remaining
                  </span>
                  <span>{data.usage.quota_gb} GB total</span>
                </div>
              </div>
            )}

            {/* Recent Invoices */}
            <div className="bg-zinc-900/50 backdrop-blur border border-zinc-800/50 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between">
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Recent Invoices
                </h3>
                <button
                  onClick={() => setActiveTab("invoices")}
                  className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1"
                >
                  View All <ExternalLink className="w-3 h-3" />
                </button>
              </div>
              {data.recent_invoices?.length === 0 ? (
                <div className="p-6 text-zinc-500 text-center">No invoices</div>
              ) : (
                <div className="divide-y divide-zinc-800/50">
                  {data.recent_invoices?.slice(0, 3).map((inv) => (
                    <div
                      key={inv.id}
                      className="p-4 flex items-center justify-between hover:bg-zinc-800/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="w-8 h-8 text-blue-400" />
                        <div>
                          <div className="text-white font-medium text-sm">
                            {inv.invoice_number}
                          </div>
                          <div className="text-zinc-500 text-xs">
                            {new Date(inv.due_date).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-white font-semibold">
                            KES {parseFloat(inv.amount || 0).toFixed(2)}
                          </div>
                          <div
                            className={`text-xs ${inv.balance > 0 ? "text-red-400" : "text-emerald-400"}`}
                          >
                            {inv.balance > 0
                              ? `Balance: KES ${parseFloat(inv.balance || 0).toFixed(2)}`
                              : "Paid"}
                          </div>
                        </div>
                        <button
                          onClick={() => downloadInvoice(inv)}
                          className="p-2 hover:bg-zinc-700/50 rounded-lg transition-colors"
                          title="Download PDF"
                        >
                          <Printer className="w-4 h-4 text-zinc-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bandwidth Tab */}
        {activeTab === "usage" && (
          <div className="space-y-6">
            {/* Usage View Toggle */}
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Bandwidth Usage
              </h3>
              <div className="flex bg-zinc-800/50 rounded-lg p-1 gap-1">
                {["daily", "weekly", "monthly"].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setUsageViewMode(mode)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${
                      usageViewMode === mode
                        ? "bg-blue-600 text-white"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Quota Warning */}
            {(() => {
              const usage =
                usageHistory.find((u) => u.period === usageViewMode) ||
                usageHistory[0];
              const quota = data.usage?.quota_gb || usage?.quota_gb || 0;
              const used = data.usage?.total_gb || usage?.total_gb || 0;
              const pct = quota > 0 ? (used / quota) * 100 : 0;
              if (pct >= 75 && quota > 0) {
                return (
                  <div
                    className={`flex items-center gap-3 p-4 rounded-xl border ${
                      pct >= 100
                        ? "bg-red-500/10 border-red-500/20"
                        : pct >= 90
                          ? "bg-amber-500/10 border-amber-500/20"
                          : "bg-blue-500/10 border-blue-500/20"
                    }`}
                  >
                    <AlertTriangle
                      className={`w-5 h-5 ${
                        pct >= 100
                          ? "text-red-400"
                          : pct >= 90
                            ? "text-amber-400"
                            : "text-blue-400"
                      }`}
                    />
                    <span
                      className={`text-sm ${
                        pct >= 100
                          ? "text-red-300"
                          : pct >= 90
                            ? "text-amber-300"
                            : "text-blue-300"
                      }`}
                    >
                      {pct >= 100
                        ? "You have exceeded your monthly data quota. Speed may be reduced."
                        : pct >= 90
                          ? `Warning: You've used ${pct.toFixed(0)}% of your ${quota} GB quota. Only ${(quota - used).toFixed(1)} GB remaining.`
                          : `You've used ${pct.toFixed(0)}% of your monthly ${quota} GB quota.`}
                    </span>
                  </div>
                );
              }
              return null;
            })()}

            {/* Bar Chart */}
            <div className="bg-zinc-900/50 backdrop-blur border border-zinc-800/50 rounded-2xl p-6">
              <h4 className="text-white font-semibold mb-6">
                {usageViewMode === "daily"
                  ? "Daily Usage (Last 30 Days)"
                  : usageViewMode === "weekly"
                    ? "Weekly Usage (Last 12 Weeks)"
                    : "Monthly Usage (Last 12 Months)"}
              </h4>

              {(() => {
                const sourceData =
                  usageHistory.length > 0 ? usageHistory : bandwidthHistory;
                const displayData =
                  usageViewMode === "daily"
                    ? sourceData.slice(0, 30)
                    : usageViewMode === "weekly"
                      ? sourceData
                          .filter((d) => d.period === "weekly" || d.week)
                          .slice(0, 12)
                      : sourceData
                          .filter((d) => d.period === "monthly" || d.month)
                          .slice(0, 12);
                const fallbackData = sourceData.slice(0, 14);
                const chartData =
                  displayData.length > 0 ? displayData : fallbackData;

                if (chartData.length === 0) {
                  return (
                    <div className="text-zinc-500 text-center py-8">
                      No bandwidth data available
                    </div>
                  );
                }

                const maxVal = Math.max(
                  ...chartData.map((d) => d.download_gb || d.total_gb || 0),
                  1,
                );

                return (
                  <div className="space-y-3">
                    {chartData.map((day, i) => {
                      const dl = day.download_gb || 0;
                      const ul = day.upload_gb || 0;
                      const total = dl + ul || day.total_gb || 0;
                      const dlPct = (dl / maxVal) * 100;
                      const ulPct = (ul / maxVal) * 100;
                      const label =
                        day.label || day.date
                          ? new Date(day.date).toLocaleDateString("en", {
                              month: "short",
                              day: "numeric",
                            })
                          : day.week || day.month || `Period ${i + 1}`;

                      return (
                        <div key={i} className="flex items-center gap-4">
                          <div className="w-20 text-sm text-zinc-400 truncate">
                            {label}
                          </div>
                          <div className="flex-1">
                            <div className="flex h-6 rounded-full overflow-hidden bg-zinc-800">
                              <div
                                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 flex items-center justify-end pr-2 transition-all"
                                style={{ width: `${Math.min(100, dlPct)}%` }}
                              >
                                {dlPct > 15 && (
                                  <span className="text-xs text-white font-semibold">
                                    {dl.toFixed(1)} ↓
                                  </span>
                                )}
                              </div>
                              <div
                                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 flex items-center justify-end pr-2 transition-all"
                                style={{ width: `${Math.min(100, ulPct)}%` }}
                              >
                                {ulPct > 15 && (
                                  <span className="text-xs text-white font-semibold">
                                    {ul.toFixed(1)} ↑
                                  </span>
                                )}
                              </div>
                            </div>
                            {dlPct <= 15 && ulPct <= 15 && (
                              <span className="text-xs text-zinc-400 mt-1">
                                ↓{dl.toFixed(1)} ↑{ul.toFixed(1)} GB
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Download vs Upload Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-zinc-900/50 backdrop-blur border border-zinc-800/50 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-white font-semibold flex items-center gap-2">
                    <Download className="w-5 h-5 text-emerald-400" />
                    Total Downloaded
                  </h4>
                  <span className="text-2xl font-bold text-emerald-400">
                    {(() => {
                      const src =
                        usageHistory.length > 0
                          ? usageHistory
                          : bandwidthHistory;
                      const total = src.reduce(
                        (sum, d) => sum + (d.download_gb || d.total_gb || 0),
                        0,
                      );
                      return total.toFixed(1);
                    })()}{" "}
                    GB
                  </span>
                </div>
                <div className="text-sm text-zinc-400">
                  This{" "}
                  {usageViewMode === "daily"
                    ? "month"
                    : usageViewMode === "weekly"
                      ? "quarter"
                      : "year"}
                </div>
              </div>

              <div className="bg-zinc-900/50 backdrop-blur border border-zinc-800/50 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-white font-semibold flex items-center gap-2">
                    <Upload className="w-5 h-5 text-blue-400" />
                    Total Uploaded
                  </h4>
                  <span className="text-2xl font-bold text-blue-400">
                    {(() => {
                      const src =
                        usageHistory.length > 0
                          ? usageHistory
                          : bandwidthHistory;
                      const total = src.reduce(
                        (sum, d) => sum + (d.upload_gb || 0),
                        0,
                      );
                      return total.toFixed(1);
                    })()}{" "}
                    GB
                  </span>
                </div>
                <div className="text-sm text-zinc-400">
                  This{" "}
                  {usageViewMode === "daily"
                    ? "month"
                    : usageViewMode === "weekly"
                      ? "quarter"
                      : "year"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Speed Test Tab */}
        {activeTab === "speedtest" && (
          <div className="space-y-6">
            <div className="bg-zinc-900/50 backdrop-blur border border-zinc-800/50 rounded-2xl p-8">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-white mb-2">
                  Internet Speed Test
                </h3>
                <p className="text-zinc-400">
                  Test your current connection speed
                </p>
              </div>

              <div className="grid grid-cols-3 gap-6 mb-8">
                <div className="text-center">
                  <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-3">
                    <Download className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-3xl font-bold text-white mb-1">
                    {speedTest.download > 0 ? `${speedTest.download}` : "---"}
                  </div>
                  <div className="text-sm text-zinc-400">Mbps Download</div>
                </div>

                <div className="text-center">
                  <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-3">
                    <Upload className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-3xl font-bold text-white mb-1">
                    {speedTest.upload > 0 ? `${speedTest.upload}` : "---"}
                  </div>
                  <div className="text-sm text-zinc-400">Mbps Upload</div>
                </div>

                <div className="text-center">
                  <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center mb-3">
                    <Clock className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-3xl font-bold text-white mb-1">
                    {speedTest.ping > 0 ? `${speedTest.ping}` : "---"}
                  </div>
                  <div className="text-sm text-zinc-400">ms Ping</div>
                </div>
              </div>

              <div className="text-center">
                <button
                  onClick={runSpeedTest}
                  disabled={speedTest.running}
                  className={`px-8 py-3 rounded-xl font-semibold text-white transition-all ${
                    speedTest.running
                      ? "bg-zinc-700 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20"
                  }`}
                >
                  {speedTest.running ? (
                    <span className="flex items-center gap-2">
                      <svg
                        className="animate-spin w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Testing...
                    </span>
                  ) : (
                    "Run Speed Test"
                  )}
                </button>
              </div>
            </div>

            {/* Plan Comparison */}
            {data.subscription?.speed && (
              <div className="bg-zinc-900/50 backdrop-blur border border-zinc-800/50 rounded-2xl p-6">
                <h4 className="text-white font-semibold mb-4">
                  Your Plan Speed
                </h4>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-white">
                      {data.subscription.speed}
                    </div>
                    <div className="text-sm text-zinc-400">
                      Advertised speed
                    </div>
                  </div>
                  {speedTest.download > 0 && (
                    <div className="text-right">
                      <div
                        className={`text-2xl font-bold ${
                          speedTest.download >=
                          parseInt(data.subscription.speed) * 0.8
                            ? "text-emerald-400"
                            : speedTest.download >=
                                parseInt(data.subscription.speed) * 0.5
                              ? "text-amber-400"
                              : "text-red-400"
                        }`}
                      >
                        {speedTest.download} Mbps
                      </div>
                      <div className="text-sm text-zinc-400">
                        Actual download speed
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Invoices Tab */}
        {activeTab === "invoices" && (
          <div className="bg-zinc-900/50 backdrop-blur border border-zinc-800/50 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <FileText className="w-5 h-5" />
                All Invoices
              </h3>
              <span className="text-sm text-zinc-500">
                {billingInvoices.length || data.recent_invoices?.length || 0}{" "}
                invoice(s)
              </span>
            </div>
            {(() => {
              const invoices =
                billingInvoices.length > 0
                  ? billingInvoices
                  : data.recent_invoices || [];
              if (invoices.length === 0) {
                return (
                  <div className="p-6 text-zinc-500 text-center">
                    No invoices
                  </div>
                );
              }
              return (
                <div className="divide-y divide-zinc-800/50">
                  {invoices.map((inv) => {
                    const isPaid = inv.status === "paid" || inv.balance <= 0;
                    const isOverdue =
                      inv.status === "overdue" ||
                      (inv.due_date &&
                        new Date(inv.due_date) < new Date() &&
                        !isPaid);
                    const isPending =
                      inv.status === "pending" || inv.status === "sent";
                    return (
                      <div
                        key={inv.id || inv.invoice_number}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-zinc-800/30 transition-colors gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              isPaid
                                ? "bg-emerald-500/10"
                                : isOverdue
                                  ? "bg-red-500/10"
                                  : "bg-amber-500/10"
                            }`}
                          >
                            <FileText
                              className={`w-5 h-5 ${
                                isPaid
                                  ? "text-emerald-400"
                                  : isOverdue
                                    ? "text-red-400"
                                    : "text-amber-400"
                              }`}
                            />
                          </div>
                          <div>
                            <div className="text-white font-medium">
                              {inv.invoice_number ||
                                inv.number ||
                                `Invoice #${inv.id}`}
                            </div>
                            <div className="text-zinc-500 text-xs">
                              {inv.invoice_date
                                ? `Issued: ${new Date(inv.invoice_date).toLocaleDateString()}`
                                : `Due: ${new Date(inv.due_date).toLocaleDateString()}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 ml-13 sm:ml-0">
                          <div className="text-right">
                            <div className="text-white font-semibold">
                              KES{" "}
                              {parseFloat(inv.amount || inv.total || 0).toFixed(
                                2,
                              )}
                            </div>
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                isPaid
                                  ? "bg-emerald-500/20 text-emerald-400"
                                  : isOverdue
                                    ? "bg-red-500/20 text-red-400"
                                    : isPending
                                      ? "bg-amber-500/20 text-amber-400"
                                      : "bg-blue-500/20 text-blue-400"
                              }`}
                            >
                              {isOverdue && !isPaid
                                ? "Overdue"
                                : isPaid
                                  ? "Paid"
                                  : isPending
                                    ? "Pending"
                                    : inv.status || "Unpaid"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {!isPaid && (
                              <button
                                onClick={() => {
                                  setPayAmount(
                                    inv.balance ||
                                      inv.amount ||
                                      inv.total ||
                                      "",
                                  );
                                  setShowPayModal(true);
                                }}
                                className="p-2 hover:bg-emerald-700/50 rounded-lg transition-colors text-emerald-400 hover:text-emerald-300"
                                title="Pay Now"
                              >
                                <Smartphone className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => downloadInvoice(inv)}
                              className="p-2 hover:bg-zinc-700/50 rounded-lg transition-colors"
                              title="Download PDF"
                            >
                              <Printer className="w-4 h-4 text-zinc-400" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* Payments Tab */}
        {activeTab === "payments" && (
          <div className="space-y-6">
            {/* Total Paid This Year */}
            <div className="bg-gradient-to-r from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 rounded-2xl p-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <DollarSign className="w-7 h-7 text-emerald-400" />
                </div>
                <div>
                  <p className="text-emerald-300 text-sm font-medium">
                    Total Paid This Year
                  </p>
                  <p className="text-3xl font-bold text-white">
                    KES{" "}
                    {(() => {
                      const payments =
                        billingPayments.length > 0
                          ? billingPayments
                          : paymentHistory;
                      const thisYear = new Date().getFullYear();
                      const total = payments
                        .filter((p) => {
                          const d = new Date(
                            p.payment_date || p.created_at || p.date,
                          );
                          return (
                            d.getFullYear() === thisYear &&
                            (p.status === "completed" ||
                              p.status === "paid" ||
                              p.status === "success" ||
                              !p.status)
                          );
                        })
                        .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
                      return total.toFixed(2);
                    })()}
                  </p>
                </div>
              </div>
            </div>

            {/* Payment List */}
            <div className="bg-zinc-900/50 backdrop-blur border border-zinc-800/50 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between">
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <Receipt className="w-5 h-5" />
                  Payment History
                </h3>
                <span className="text-sm text-zinc-500">
                  {billingPayments.length || paymentHistory.length || 0}{" "}
                  payment(s)
                </span>
              </div>
              {(() => {
                const payments =
                  billingPayments.length > 0 ? billingPayments : paymentHistory;
                if (payments.length === 0) {
                  return (
                    <div className="p-6 text-zinc-500 text-center">
                      No payment history
                    </div>
                  );
                }
                return (
                  <div className="divide-y divide-zinc-800/50">
                    {payments.map((payment) => {
                      const pDate =
                        payment.payment_date ||
                        payment.created_at ||
                        payment.date;
                      const method =
                        payment.method || payment.payment_method || "M-Pesa";
                      const ref =
                        payment.receipt_number ||
                        payment.reference ||
                        payment.transaction_id ||
                        "N/A";
                      const isSuccess =
                        payment.status === "completed" ||
                        payment.status === "paid" ||
                        payment.status === "success" ||
                        !payment.status;
                      return (
                        <div
                          key={payment.id || ref}
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-zinc-800/30 transition-colors gap-3"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                isSuccess
                                  ? "bg-emerald-500/10"
                                  : "bg-amber-500/10"
                              }`}
                            >
                              <CreditCard
                                className={`w-5 h-5 ${
                                  isSuccess
                                    ? "text-emerald-400"
                                    : "text-amber-400"
                                }`}
                              />
                            </div>
                            <div>
                              <div className="text-white font-medium capitalize">
                                {method}
                              </div>
                              <div className="text-zinc-500 text-xs">
                                {pDate
                                  ? new Date(pDate).toLocaleDateString()
                                  : "—"}{" "}
                                • Ref: {ref}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 ml-13 sm:ml-0">
                            <div className="text-right">
                              <div className="text-emerald-400 font-semibold">
                                KES {parseFloat(payment.amount || 0).toFixed(2)}
                              </div>
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                  isSuccess
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : "bg-amber-500/20 text-amber-400"
                                }`}
                              >
                                {isSuccess
                                  ? "Paid"
                                  : payment.status || "Pending"}
                              </span>
                            </div>
                            <button
                              onClick={() => downloadReceipt(payment)}
                              className="p-2 hover:bg-zinc-700/50 rounded-lg transition-colors"
                              title="Download Receipt"
                            >
                              <Printer className="w-4 h-4 text-zinc-400" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Support Tab */}
        {activeTab === "support" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Ticket className="w-5 h-5" />
                Support Tickets
              </h3>
              <button
                onClick={() => setShowTicketForm(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                New Ticket
              </button>
            </div>

            {supportTickets.length === 0 ? (
              <div className="bg-zinc-900/50 backdrop-blur border border-zinc-800/50 rounded-2xl p-8 text-zinc-500 text-center">
                No support tickets yet
              </div>
            ) : (
              <div className="space-y-3">
                {supportTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="bg-zinc-900/50 backdrop-blur border border-zinc-800/50 rounded-2xl p-5 hover:border-zinc-700/50 transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h4 className="text-white font-semibold mb-1">
                          {ticket.subject}
                        </h4>
                        <div className="flex items-center gap-3 text-sm text-zinc-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(ticket.created_at).toLocaleDateString()}
                          </span>
                          <span className="capitalize">
                            Category: {ticket.category}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          ticket.status === "open"
                            ? "bg-blue-500/20 text-blue-400"
                            : ticket.status === "in_progress"
                              ? "bg-amber-500/20 text-amber-400"
                              : ticket.status === "resolved"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-zinc-500/20 text-zinc-400"
                        }`}
                      >
                        {ticket.status}
                      </span>
                    </div>
                    {ticket.description && (
                      <p className="text-zinc-400 text-sm">
                        {ticket.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Plans Tab */}
        {activeTab === "plans" && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-white">
              Available Plans
            </h3>
            <p className="text-sm text-zinc-400">
              Switch to a different plan. Upgrades take effect immediately,
              downgrades at next billing cycle.
            </p>

            <div className="grid gap-4">
              {availablePlans.map((plan) => (
                <div
                  key={plan.id}
                  className={`rounded-xl border p-5 ${
                    plan.is_current
                      ? "border-blue-500/30 bg-blue-500/5"
                      : "border-zinc-800 bg-zinc-900/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-white font-semibold">
                          {plan.name}
                        </h4>
                        {plan.is_current && (
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
                            Current
                          </span>
                        )}
                        {plan.change_type === "upgrade" && (
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                            Upgrade
                          </span>
                        )}
                        {plan.change_type === "downgrade" && (
                          <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">
                            Downgrade
                          </span>
                        )}
                      </div>
                      <p className="text-2xl font-bold text-white mt-2">
                        KES {plan.price}
                        <span className="text-sm text-zinc-500">/mo</span>
                      </p>
                      <div className="flex gap-4 mt-2 text-sm text-zinc-400">
                        <span>
                          {plan.speed_up} / {plan.speed_down}
                        </span>
                        {plan.quota_gb && <span>{plan.quota_gb} GB</span>}
                      </div>
                    </div>
                    {!plan.is_current && (
                      <button
                        onClick={() => setConfirmPlan(plan)}
                        className={`shrink-0 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                          plan.change_type === "upgrade"
                            ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                            : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                        }`}
                      >
                        {plan.change_type === "upgrade" ? "Upgrade" : "Switch"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Settings Tab - WiFi & Account */}
        {activeTab === "settings" && (
          <div className="space-y-6">
            {/* PPPoE Username & Connection Info */}
            <div className="bg-zinc-900/50 backdrop-blur border border-zinc-800/50 rounded-2xl p-6">
              <h3 className="text-white font-semibold flex items-center gap-2 mb-6">
                <Wifi className="w-5 h-5" />
                Connection Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-zinc-800/50 rounded-xl p-4">
                  <div className="text-sm text-zinc-400 mb-1">
                    PPPoE Username
                  </div>
                  <div className="text-white font-medium font-mono">
                    {data.subscription?.pppoe_username ||
                      data.customer?.pppoe_username ||
                      data.customer?.portal_username ||
                      data.customer?.username ||
                      "—"}
                  </div>
                </div>
                <div className="bg-zinc-800/50 rounded-xl p-4">
                  <div className="text-sm text-zinc-400 mb-1">Current Plan</div>
                  <div className="text-white font-medium">
                    {data.subscription?.plan_name || "—"}{" "}
                    <span className="text-zinc-500 text-sm">
                      ({data.subscription?.speed || "N/A"})
                    </span>
                  </div>
                </div>
                <div className="bg-zinc-800/50 rounded-xl p-4">
                  <div className="text-sm text-zinc-400 mb-1">
                    Account Status
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        data.subscription?.status === "active"
                          ? "bg-emerald-400"
                          : data.subscription?.throttled
                            ? "bg-amber-400"
                            : "bg-red-400"
                      }`}
                    />
                    <span className="text-white font-medium capitalize">
                      {data.subscription?.throttled
                        ? "Throttled"
                        : data.subscription?.status || "Unknown"}
                    </span>
                  </div>
                </div>
                <div className="bg-zinc-800/50 rounded-xl p-4">
                  <div className="text-sm text-zinc-400 mb-1">
                    Account Number
                  </div>
                  <div className="text-white font-medium font-mono">
                    {data.customer?.account_number ||
                      data.customer?.id_number ||
                      data.customer?.id?.substring(0, 8) ||
                      "—"}
                  </div>
                </div>
              </div>
            </div>

            {/* WiFi Password */}
            <div className="bg-zinc-900/50 backdrop-blur border border-zinc-800/50 rounded-2xl p-6">
              <h3 className="text-white font-semibold flex items-center gap-2 mb-6">
                <Key className="w-5 h-5" />
                WiFi Password
              </h3>

              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="text-zinc-400 text-sm">Current Password</div>
                  <div className="text-white font-medium font-mono mt-1 text-lg">
                    {data.customer?.wifi_password ? "••••••••••••" : "Not set"}
                  </div>
                </div>
                <button
                  onClick={() => setShowPasswordModal(true)}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Lock className="w-4 h-4" />
                  Change WiFi Password
                </button>
              </div>

              {passwordInfo?.password_changed_at && (
                <div className="bg-zinc-800/50 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <History className="w-4 h-4" />
                    Last changed:{" "}
                    <span className="text-white">
                      {new Date(
                        passwordInfo.password_changed_at,
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              <div className="bg-zinc-800/50 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Bell className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
                  <div className="text-sm text-zinc-400">
                    <span className="text-amber-300 font-medium">Note:</span>{" "}
                    Changing your WiFi password will disconnect all currently
                    connected devices. You will need to update the password on
                    each device.
                  </div>
                </div>
              </div>
            </div>

            {/* Account Credentials */}
            <div className="bg-zinc-900/50 backdrop-blur border border-zinc-800/50 rounded-2xl p-6">
              <h3 className="text-white font-semibold flex items-center gap-2 mb-6">
                <User className="w-5 h-5" />
                Portal Account
              </h3>

              <div className="bg-zinc-800/50 rounded-xl p-4 mb-4">
                <div className="text-sm text-zinc-400 mb-1">
                  Portal Username
                </div>
                <div className="text-white font-medium">
                  {data.customer?.portal_username ||
                    data.customer?.email ||
                    data.customer?.phone ||
                    "—"}
                </div>
              </div>

              <button
                onClick={() => setShowSettingsModal(true)}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <Settings className="w-4 h-4" />
                Change Username or Password
              </button>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="space-y-6">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <History className="w-5 h-5 text-purple-400" />
                Activity History
              </h3>
              <div className="space-y-3">
                {/* Tickets History */}
                <div className="bg-zinc-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Ticket className="w-4 h-4 text-blue-400" />
                    <span className="text-white font-medium">
                      Support Tickets
                    </span>
                  </div>
                  {data.recent_tickets && data.recent_tickets.length > 0 ? (
                    <div className="space-y-2">
                      {data.recent_tickets.map((ticket) => (
                        <div
                          key={ticket.id}
                          className="bg-zinc-900/50 rounded p-3"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-white font-medium">
                              {ticket.subject}
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded ${
                                ticket.status === "open"
                                  ? "bg-blue-500/20 text-blue-400"
                                  : ticket.status === "in_progress"
                                    ? "bg-amber-500/20 text-amber-400"
                                    : ticket.status === "resolved"
                                      ? "bg-green-500/20 text-green-400"
                                      : "bg-zinc-500/20 text-zinc-400"
                              }`}
                            >
                              {ticket.status}
                            </span>
                          </div>
                          <div className="text-xs text-zinc-500">
                            {ticket.ticket_number} •{" "}
                            {new Date(ticket.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-500">
                      No tickets created yet
                    </div>
                  )}
                </div>

                {/* Payments History */}
                <div className="bg-zinc-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CreditCard className="w-4 h-4 text-green-400" />
                    <span className="text-white font-medium">Payments</span>
                  </div>
                  {data.recent_payments && data.recent_payments.length > 0 ? (
                    <div className="space-y-2">
                      {data.recent_payments.map((payment) => (
                        <div
                          key={payment.id}
                          className="bg-zinc-900/50 rounded p-3"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-white font-medium">
                              KES {parseFloat(payment.amount || 0).toFixed(2)}
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded ${
                                payment.status === "completed"
                                  ? "bg-green-500/20 text-green-400"
                                  : payment.status === "pending"
                                    ? "bg-amber-500/20 text-amber-400"
                                    : "bg-red-500/20 text-red-400"
                              }`}
                            >
                              {payment.status}
                            </span>
                          </div>
                          <div className="text-xs text-zinc-500">
                            {payment.method} •{" "}
                            {new Date(payment.received_at).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-500">
                      No payments made yet
                    </div>
                  )}
                </div>

                {/* Password Changes */}
                <div className="bg-zinc-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Key className="w-4 h-4 text-amber-400" />
                    <span className="text-white font-medium">
                      Password Changes
                    </span>
                  </div>
                  {passwordInfo.password_changed_at ? (
                    <div className="bg-zinc-900/50 rounded p-3">
                      <div className="text-sm text-white">
                        WiFi password was changed
                      </div>
                      <div className="text-xs text-zinc-500">
                        {new Date(
                          passwordInfo.password_changed_at,
                        ).toLocaleString()}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-500">
                      No password changes recorded
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Review Tab */}
        {activeTab === "review" && (
          <div className="space-y-6">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-400" />
                Rate Our Service
              </h3>

              {customerReview ? (
                <div className="bg-zinc-800 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-white font-medium text-lg">
                        Your Review
                      </div>
                      <div className="text-sm text-zinc-500">
                        Submitted on{" "}
                        {new Date(
                          customerReview.created_at,
                        ).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setReviewForm({
                          rating: customerReview.rating,
                          service_quality: customerReview.service_quality,
                          comment: customerReview.comment || "",
                        });
                        setShowReviewModal(true);
                      }}
                      className="text-blue-400 hover:text-blue-300 text-sm"
                    >
                      Update Review
                    </button>
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-6 h-6 ${
                          star <= customerReview.rating
                            ? "text-yellow-400 fill-yellow-400"
                            : "text-zinc-600"
                        }`}
                      />
                    ))}
                    <span className="text-white font-semibold ml-2">
                      {customerReview.rating}/5
                    </span>
                  </div>

                  <div className="mb-4">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        customerReview.service_quality === "bad"
                          ? "bg-red-500/20 text-red-400"
                          : customerReview.service_quality === "satisfactory"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : customerReview.service_quality === "good"
                              ? "bg-blue-500/20 text-blue-400"
                              : customerReview.service_quality === "excellent"
                                ? "bg-green-500/20 text-green-400"
                                : "bg-purple-500/20 text-purple-400"
                      }`}
                    >
                      {customerReview.service_quality
                        .replace("_", " ")
                        .toUpperCase()}
                    </span>
                  </div>

                  {customerReview.comment && (
                    <div className="bg-zinc-900/50 rounded-lg p-4">
                      <p className="text-zinc-300">{customerReview.comment}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Star className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
                  <p className="text-zinc-400 mb-6">
                    You haven't rated our service yet
                  </p>
                  <button
                    onClick={() => setShowReviewModal(true)}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg flex items-center gap-2 mx-auto transition-colors"
                  >
                    <Star className="w-5 h-5" />
                    Leave a Review
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Review Modal */}
      {showReviewModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowReviewModal(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-zinc-800/50 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                Rate Our Service
              </h3>
              <button
                onClick={() => setShowReviewModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitReview} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-3">
                  Overall Rating
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() =>
                        setReviewForm({ ...reviewForm, rating: star })
                      }
                      className="transition-transform hover:scale-110"
                    >
                      <Star
                        className={`w-8 h-8 ${
                          star <= reviewForm.rating
                            ? "text-yellow-400 fill-yellow-400"
                            : "text-zinc-600"
                        }`}
                      />
                    </button>
                  ))}
                  <span className="text-white font-semibold ml-2">
                    {reviewForm.rating}/5
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Service Quality
                </label>
                <select
                  value={reviewForm.service_quality}
                  onChange={(e) =>
                    setReviewForm({
                      ...reviewForm,
                      service_quality: e.target.value,
                    })
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white"
                >
                  <option value="bad">Bad - Below expectations</option>
                  <option value="satisfactory">
                    Satisfactory - Met expectations
                  </option>
                  <option value="good">Good - Above expectations</option>
                  <option value="excellent">
                    Excellent - Far exceeded expectations
                  </option>
                  <option value="over_expectation">
                    Over Expectation - Outstanding service
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Comments (Optional)
                </label>
                <textarea
                  value={reviewForm.comment}
                  onChange={(e) =>
                    setReviewForm({ ...reviewForm, comment: e.target.value })
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white"
                  rows="4"
                  placeholder="Tell us more about your experience..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReviewModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReview}
                  className={`btn-primary flex-1 ${submittingReview ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {submittingReview ? "Submitting..." : "Submit Review"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowPasswordModal(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-zinc-800/50 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                Change WiFi Password
              </h3>
              <button
                onClick={() => setShowPasswordModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleChangePassword} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Current Password
                </label>
                <input
                  type="password"
                  value={passwordForm.current}
                  onChange={(e) =>
                    setPasswordForm({
                      ...passwordForm,
                      current: e.target.value,
                    })
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white"
                  placeholder="Enter current password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  New Password
                </label>
                <input
                  type="password"
                  value={passwordForm.new}
                  onChange={(e) =>
                    setPasswordForm({ ...passwordForm, new: e.target.value })
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white"
                  placeholder="Enter new password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={passwordForm.confirm}
                  onChange={(e) =>
                    setPasswordForm({
                      ...passwordForm,
                      confirm: e.target.value,
                    })
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white"
                  placeholder="Confirm new password"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changingPassword}
                  className={`btn-primary flex-1 ${changingPassword ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {changingPassword ? "Changing..." : "Change Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowSettingsModal(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-zinc-800/50 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                Change Credentials
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateCredentials} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Current Password
                </label>
                <input
                  type="password"
                  value={credentialsForm.current_password}
                  onChange={(e) =>
                    setCredentialsForm({
                      ...credentialsForm,
                      current_password: e.target.value,
                    })
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white"
                  placeholder="Enter current password"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  New Username (Optional)
                </label>
                <input
                  type="text"
                  value={credentialsForm.new_username}
                  onChange={(e) =>
                    setCredentialsForm({
                      ...credentialsForm,
                      new_username: e.target.value,
                    })
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white"
                  placeholder="Enter new username"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  New Password (Optional)
                </label>
                <input
                  type="password"
                  value={credentialsForm.new_password}
                  onChange={(e) =>
                    setCredentialsForm({
                      ...credentialsForm,
                      new_password: e.target.value,
                    })
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white"
                  placeholder="Enter new password"
                />
              </div>
              {credentialsForm.new_password && (
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={credentialsForm.confirm_password}
                    onChange={(e) =>
                      setCredentialsForm({
                        ...credentialsForm,
                        confirm_password: e.target.value,
                      })
                    }
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white"
                    placeholder="Confirm new password"
                    required
                  />
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingCredentials}
                  className={`btn-primary flex-1 ${updatingCredentials ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {updatingCredentials ? "Updating..." : "Update Credentials"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ticket Form Modal */}
      {showTicketForm && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowTicketForm(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-zinc-800/50 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                Create Support Ticket
              </h3>
              <button
                onClick={() => setShowTicketForm(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTicket} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Subject *
                </label>
                <input
                  required
                  value={ticketForm.subject}
                  onChange={(e) =>
                    setTicketForm({ ...ticketForm, subject: e.target.value })
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white"
                  placeholder="Brief description of your issue"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Category
                </label>
                <select
                  value={ticketForm.category}
                  onChange={(e) =>
                    setTicketForm({ ...ticketForm, category: e.target.value })
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white"
                >
                  <option value="general">General Inquiry</option>
                  <option value="technical">Technical Issue</option>
                  <option value="billing">Billing Question</option>
                  <option value="upgrade">Upgrade Request</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Description *
                </label>
                <textarea
                  required
                  value={ticketForm.description}
                  onChange={(e) =>
                    setTicketForm({
                      ...ticketForm,
                      description: e.target.value,
                    })
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white"
                  rows="4"
                  placeholder="Describe your issue in detail..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTicketForm(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1">
                  Submit Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowPayModal(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-zinc-800/50 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Make Payment</h3>
              <button
                onClick={() => setShowPayModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Amount (KES) *
                </label>
                <input
                  type="number"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white text-2xl font-bold"
                  placeholder="0.00"
                />
              </div>
              {data.outstanding_balance > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                  <div className="text-sm text-amber-300">
                    Outstanding Balance:{" "}
                    <span className="font-bold">
                      KES {data.outstanding_balance.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePayment}
                  disabled={paying || !payAmount}
                  className={`btn-primary flex-1 ${paying || !payAmount ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {paying ? "Processing..." : "Pay via M-Pesa"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plan Change Confirmation Modal */}
      {confirmPlan && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setConfirmPlan(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-zinc-800/50 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Change Plan</h3>
              <button
                onClick={() => setConfirmPlan(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-zinc-400">
                Switch from{" "}
                <span className="text-white">
                  {data?.subscription?.plan_name}
                </span>{" "}
                to <span className="text-white">{confirmPlan.name}</span>?
              </p>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">New price</span>
                <span className="text-white font-semibold">
                  KES {confirmPlan.price}/mo
                </span>
              </div>
              {confirmPlan.change_type === "downgrade" && (
                <p className="text-xs text-amber-400">
                  Downgrades take effect at the end of your current billing
                  cycle.
                </p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmPlan(null)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleChangePlan}
                  disabled={changingPlan}
                  className={`btn-primary flex-1 ${changingPlan ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {changingPlan ? "Changing..." : "Confirm Change"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
