import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  ArrowLeft,
  User,
  Package,
  FileText,
  CreditCard,
  Activity,
  MapPin,
  Mail,
  Phone,
  Hash,
  Link,
  Copy,
  ExternalLink,
  RefreshCw,
  Send,
  Wifi,
  Shield,
  AlertTriangle,
  Smartphone,
  Download,
} from "lucide-react";
import { useToast } from "../../hooks/useToast";
import { MpesaStkModal } from "../../components/MpesaStkModal";
import AirtelStkModal from "../../components/AirtelStkModal";
import MtnStkModal from "../../components/MtnStkModal";
import PaystackModal from "../../components/PaystackModal";

const API = import.meta.env.VITE_API_URL || "/api";

export function BillingCustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [portalModal, setPortalModal] = useState(false);
  const [portalInfo, setPortalInfo] = useState(null);
  const [generatingUrl, setGeneratingUrl] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState(null);
  const [resettingPin, setResettingPin] = useState(false);
  const [newPin, setNewPin] = useState(null);
  const [paymentPromptModal, setPaymentPromptModal] = useState(false);
  const [sendingPrompt, setSendingPrompt] = useState(false);
  const [promptAmount, setPromptAmount] = useState("");
  const [telegramModal, setTelegramModal] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState("");
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [stkModal, setStkModal] = useState(false);
  const [airtelModal, setAirtelModal] = useState(false);
  const [mtnModal, setMtnModal] = useState(false);
  const [paystackModal, setPaystackModal] = useState(false);
  const [paymentDropdown, setPaymentDropdown] = useState(false);

  useEffect(() => {
    fetchCustomer();
  }, [id]);

  const fetchCustomer = async () => {
    try {
      const { data } = await axios.get(`${API}/billing/customers/${id}`);
      setCustomer(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const fetchPortalInfo = async () => {
    try {
      const { data } = await axios.get(
        `${API}/billing/customers/${id}/portal-info`,
      );
      setPortalInfo(data);
    } catch (e) {
      console.error("Failed to fetch portal info:", e);
    }
  };

  const generatePortalUrl = async () => {
    setGeneratingUrl(true);
    try {
      const { data } = await axios.post(
        `${API}/billing/customers/${id}/portal-url`,
      );
      setPortalInfo(data);
      if (data.password) {
        setNewPassword(data.password);
      }
      toast.success("Portal URL generated successfully");
    } catch (e) {
      toast.error(
        "Failed to generate portal URL",
        e.response?.data?.error || e.message,
      );
    } finally {
      setGeneratingUrl(false);
    }
  };

  const openPortalModal = async () => {
    await fetchPortalInfo();
    setNewPin(null);
    setPortalModal(true);
  };

  const resetPassword = async () => {
    setResettingPassword(true);
    try {
      const { data } = await axios.post(
        `${API}/billing/customers/${id}/reset-password`,
      );
      setNewPassword(data.password);
      toast.success("Password reset successfully");
    } catch (e) {
      toast.error(
        "Failed to reset password",
        e.response?.data?.error || e.message,
      );
    } finally {
      setResettingPassword(false);
    }
  };

  const resetPin = async () => {
    setResettingPin(true);
    try {
      const { data } = await axios.post(
        `${API}/billing/customers/${id}/reset-pin`,
      );
      setNewPin(data.pin);
      toast.success("Portal PIN reset successfully");
    } catch (e) {
      toast.error("Failed to reset PIN", e.response?.data?.error || e.message);
    } finally {
      setResettingPin(false);
    }
  };

  const sendPaymentPrompt = async (e) => {
    e.preventDefault();
    setSendingPrompt(true);
    try {
      const { data } = await axios.post(
        `${API}/billing/customers/${id}/payment-prompt`,
        {
          amount: parseFloat(promptAmount),
          invoice_id: null,
        },
      );
      toast.success("Payment prompt sent successfully");
      setPaymentPromptModal(false);
      setPromptAmount("");
    } catch (e) {
      toast.error(
        "Failed to send payment prompt",
        e.response?.data?.error || e.message,
      );
    } finally {
      setSendingPrompt(false);
    }
  };

  const saveTelegramChatId = async (e) => {
    e.preventDefault();
    setSavingTelegram(true);
    try {
      await axios.put(`${API}/billing/customers/${id}`, {
        telegram_chat_id: telegramChatId,
      });
      toast.success("Telegram Chat ID saved successfully");
      setTelegramModal(false);
      fetchCustomer();
    } catch (e) {
      toast.error(
        "Failed to save Telegram Chat ID",
        e.response?.data?.error || e.message,
      );
    } finally {
      setSavingTelegram(false);
    }
  };

  if (loading) {return <div className="p-8 text-white">Loading...</div>;}
  if (!customer)
    {return <div className="p-8 text-white">Customer not found</div>;}

  const totalBilled = customer.invoices?.reduce((s, i) => s + i.total, 0) || 0;
  const totalPaid = customer.payments?.reduce((s, p) => s + p.amount, 0) || 0;
  const outstanding = totalBilled - totalPaid;

  const statusColor = (s) => {
    const map = {
      paid: "bg-green-600/20 text-green-400",
      pending: "bg-amber-600/20 text-amber-400",
      partial: "bg-blue-600/20 text-blue-400",
    };
    return map[s] || "bg-slate-600/20 text-slate-400";
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate("/billing-customers")}
          className="text-slate-400 hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white text-lg font-bold">
            {customer.name.charAt(0)}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">{customer.name}</h2>
            <p className="text-sm text-slate-400">
              Customer since{" "}
              {new Date(customer.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded text-sm ${customer.status === "active" ? "bg-green-600/20 text-green-400" : "bg-red-600/20 text-red-400"}`}
          >
            {customer.status}
          </span>
          {/* Payment dropdown */}
          <div className="relative">
            <button
              onClick={() => setPaymentDropdown(v => !v)}
              className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              <span className="hidden sm:inline">Collect Payment</span>
              <span className="ml-1 text-xs opacity-70">▾</span>
            </button>
            {paymentDropdown && (
              <>
                {/* Backdrop */}
                <div className="fixed inset-0 z-10" onClick={() => setPaymentDropdown(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden min-w-[220px]">
                  <div className="px-3 py-1.5 text-xs text-slate-500 uppercase tracking-wider border-b border-slate-700">Mobile Money</div>
                  <button onClick={() => { setPaymentDropdown(false); setStkModal(true); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-700 transition-colors text-sm text-left text-white">
                    <span>📱</span> M-Pesa STK Push
                  </button>
                  <button onClick={() => { setPaymentDropdown(false); setAirtelModal(true); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-700 transition-colors text-sm text-left text-white">
                    <span>📲</span> Airtel Money
                  </button>
                  <button onClick={() => { setPaymentDropdown(false); setMtnModal(true); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-700 transition-colors text-sm text-left text-white">
                    <span>📳</span> MTN Mobile Money
                  </button>
                  <div className="px-3 py-1.5 text-xs text-slate-500 uppercase tracking-wider border-t border-b border-slate-700">Card &amp; Bank</div>
                  <button onClick={() => { setPaymentDropdown(false); setPaystackModal(true); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-700 transition-colors text-sm text-left text-white">
                    <span>💳</span> Paystack (Card/Bank/USSD)
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => window.open(`${API}/billing/customers/${id}/statement`, '_blank')}
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Statement</span>
          </button>
          <button
            onClick={openPortalModal}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Link className="w-4 h-4" />
            <span className="hidden sm:inline">Portal Access</span>
          </button>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <Mail className="w-4 h-4" /> Email
          </div>
          <div className="text-white">{customer.email || "—"}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <Phone className="w-4 h-4" /> Phone
          </div>
          <div className="text-white">{customer.phone || "—"}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <MapPin className="w-4 h-4" /> Location
          </div>
          <div className="text-white">
            {[customer.address, customer.city, customer.country]
              .filter(Boolean)
              .join(", ") || "—"}
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <Hash className="w-4 h-4" /> ID Number
          </div>
          <div className="text-white">{customer.id_number || "—"}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                <Send className="w-4 h-4" /> Telegram Chat ID
              </div>
              <div className="text-white">
                {customer.telegram_chat_id || "—"}
              </div>
            </div>
            <button
              onClick={() => {
                setTelegramModal(true);
                setTelegramChatId(customer.telegram_chat_id || "");
              }}
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              Edit
            </button>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 text-center">
          <div className="text-sm text-slate-400 mb-1">Total Billed</div>
          <div className="text-2xl font-bold text-white">
            KES {totalBilled.toFixed(2)}
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 text-center">
          <div className="text-sm text-slate-400 mb-1">Total Paid</div>
          <div className="text-2xl font-bold text-green-400">
            KES {totalPaid.toFixed(2)}
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 text-center">
          <div className="text-sm text-slate-400 mb-1">Outstanding</div>
          <div className="text-2xl font-bold text-amber-400">
            KES {outstanding.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subscriptions */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg">
          <div className="p-4 border-b border-slate-700">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Package className="w-4 h-4" /> Subscriptions (
              {customer.subscriptions?.length || 0})
            </h3>
          </div>
          <div className="p-4">
            {customer.subscriptions?.length === 0 ? (
              <p className="text-slate-500 text-sm">No subscriptions</p>
            ) : (
              <div className="space-y-3">
                {customer.subscriptions?.map((sub) => (
                  <div key={sub.id} className="bg-slate-700 rounded p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white font-medium">
                        {sub.plan?.name || "No plan"}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${sub.status === "active" ? "bg-green-600/20 text-green-400" : "bg-red-600/20 text-red-400"}`}
                      >
                        {sub.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      {sub.pppoe_username && (
                        <span>PPPoE: {sub.pppoe_username} | </span>
                      )}
                      {sub.plan && (
                        <span>
                          {sub.plan.speed_up}/{sub.plan.speed_down} — $
                          {sub.plan.price}/mo
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs">
                      <span
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
                          sub.last_sync_status === "synced"
                            ? "bg-green-600/20 text-green-400"
                            : "bg-amber-600/20 text-amber-400"
                        }`}
                        title={`API: ${sub.last_sync_status || "never"}${sub.last_sync_error ? " — " + sub.last_sync_error : ""}`}
                      >
                        <Wifi className="w-3 h-3" />
                        {sub.last_sync_status || "not synced"}
                      </span>
                      <span
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-600/20 text-slate-400`}
                        title="RADIUS sync status"
                      >
                        <Shield className="w-3 h-3" />
                        RADIUS
                      </span>
                    </div>
                    {sub.last_sync_error && (
                      <div className="flex items-start gap-1 mt-1 text-xs text-amber-300">
                        <AlertTriangle className="w-3 h-3 mt-px shrink-0" />
                        <span className="truncate">{sub.last_sync_error}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Invoices */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg">
          <div className="p-4 border-b border-slate-700 flex items-center justify-between">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4" /> Invoices
            </h3>
            <button
              onClick={() => navigate("/billing-invoices")}
              className="text-blue-400 text-xs hover:text-blue-300"
            >
              View all
            </button>
          </div>
          <div className="p-4">
            {customer.invoices?.length === 0 ? (
              <p className="text-slate-500 text-sm">No invoices</p>
            ) : (
              <div className="space-y-2">
                {customer.invoices?.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between text-sm py-2 border-b border-slate-700 last:border-0"
                  >
                    <div>
                      <div className="text-white font-mono text-xs">
                        {inv.invoice_number}
                      </div>
                      <div className="text-slate-500 text-xs">
                        {inv.due_date}
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div>
                        <div className="text-white font-semibold">
                          KES {inv.total.toFixed(2)}
                        </div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${statusColor(inv.status)}`}
                        >
                          {inv.status}
                        </span>
                      </div>
                      <button
                        onClick={() => window.open(`${API}/billing/invoices/${inv.id}/pdf`, '_blank')}
                        title="Download Invoice PDF"
                        className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 hover:text-white transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Payments History */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg mt-6">
        <div className="p-4 border-b border-slate-700 flex items-center gap-2">
          <CreditCard className="w-4 h-4" />
          <h3 className="text-white font-semibold">
            Payment History ({customer.payments?.length || 0})
          </h3>
        </div>
        {customer.payments?.length === 0 ? (
          <div className="p-4 text-slate-500 text-sm">No payments recorded</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="text-left p-3">Receipt</th>
                <th className="text-left p-3">Amount</th>
                <th className="text-left p-3">Method</th>
                <th className="text-left p-3">Reference</th>
                <th className="text-left p-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {customer.payments?.map((pay) => (
                <tr key={pay.id} className="border-t border-slate-700">
                  <td className="p-3 text-blue-400 font-mono text-xs">
                    {pay.receipt_number}
                  </td>
                  <td className="p-3 text-green-400 font-semibold">
                    +${pay.amount.toFixed(2)}
                  </td>
                  <td className="p-3 text-slate-300 capitalize">
                    {pay.method.replace("_", " ")}
                  </td>
                  <td className="p-3 text-slate-400 text-xs">
                    {pay.reference || "—"}
                  </td>
                  <td className="p-3 text-slate-400 text-xs">
                    {new Date(pay.received_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Notes */}
      {customer.notes && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg mt-6 p-4">
          <h3 className="text-white font-semibold mb-2">Notes</h3>
          <p className="text-slate-300 text-sm">{customer.notes}</p>
        </div>
      )}

      {/* Portal Access Modal */}
      {portalModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-md">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                Customer Portal Access
              </h3>
              <button
                onClick={() => setPortalModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {!portalInfo?.portal_url ? (
                <div className="text-center py-8">
                  <p className="text-slate-400 mb-4">
                    No portal URL generated yet
                  </p>
                  <button
                    onClick={generatePortalUrl}
                    disabled={generatingUrl}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg flex items-center gap-2 mx-auto transition-colors disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${generatingUrl ? "animate-spin" : ""}`}
                    />
                    {generatingUrl ? "Generating..." : "Generate Portal URL"}
                  </button>
                </div>
              ) : (
                <>
                  <div className="bg-slate-800 rounded-lg p-4">
                    <div className="text-sm text-slate-400 mb-2">
                      Portal Link
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={portalInfo.portal_url}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white font-mono"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(portalInfo.portal_url);
                          toast.success("URL copied to clipboard");
                        }}
                        className="p-2 bg-slate-700 hover:bg-slate-600 rounded text-white"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-800 rounded-lg p-4">
                    <div className="text-sm text-slate-400 mb-2">Username</div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={portalInfo.portal_username}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white font-mono"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(
                            portalInfo.portal_username,
                          );
                          toast.success("Username copied to clipboard");
                        }}
                        className="p-2 bg-slate-700 hover:bg-slate-600 rounded text-white"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-slate-400">Password</div>
                      <button
                        onClick={resetPassword}
                        disabled={resettingPassword}
                        className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                      >
                        {resettingPassword ? "Resetting..." : "Reset Password"}
                      </button>
                    </div>
                    {newPassword ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={newPassword}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white font-mono"
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(newPassword);
                            toast.success("Password copied to clipboard");
                          }}
                          className="p-2 bg-slate-700 hover:bg-slate-600 rounded text-white"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="text-slate-500 text-sm italic">
                        Click "Reset Password" to generate a new password
                      </div>
                    )}
                  </div>

                  <div className="bg-slate-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-slate-400">
                        Portal PIN (phone + PIN login)
                      </div>
                      <button
                        onClick={resetPin}
                        disabled={resettingPin}
                        className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                      >
                        {resettingPin ? "Resetting..." : "Reset PIN"}
                      </button>
                    </div>
                    {newPin ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={newPin}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white font-mono text-center text-2xl tracking-widest"
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(newPin);
                            toast.success("PIN copied to clipboard");
                          }}
                          className="p-2 bg-slate-700 hover:bg-slate-600 rounded text-white"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="text-slate-500 text-sm italic">
                        Click "Reset PIN" to generate a new 4-digit PIN
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={generatePortalUrl}
                      disabled={generatingUrl}
                      className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${generatingUrl ? "animate-spin" : ""}`}
                      />
                      {generatingUrl ? "Regenerating..." : "Regenerate URL"}
                    </button>
                    <button
                      onClick={() =>
                        window.open(portalInfo.portal_url, "_blank")
                      }
                      className="flex-1 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open Portal
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* M-Pesa STK Push Modal */}
      <MpesaStkModal
        open={stkModal}
        onClose={() => setStkModal(false)}
        onSuccess={() => { setStkModal(false); fetchCustomer(); }}
        customer={customer}
        invoice={customer?.invoices?.find(i => i.status !== 'paid') || null}
        defaultAmount={outstanding > 0 ? outstanding : undefined}
      />

      {/* Airtel Money Modal */}
      <AirtelStkModal
        open={airtelModal}
        onClose={() => setAirtelModal(false)}
        onSuccess={() => { setAirtelModal(false); fetchCustomer(); }}
        customer={customer}
        invoice={customer?.invoices?.find(i => i.status !== 'paid') || null}
        defaultAmount={outstanding > 0 ? outstanding : undefined}
      />

      {/* MTN Mobile Money Modal */}
      <MtnStkModal
        open={mtnModal}
        onClose={() => setMtnModal(false)}
        onSuccess={() => { setMtnModal(false); fetchCustomer(); }}
        customer={customer}
        invoice={customer?.invoices?.find(i => i.status !== 'paid') || null}
        defaultAmount={outstanding > 0 ? outstanding : undefined}
      />

      {/* Paystack Modal */}
      <PaystackModal
        open={paystackModal}
        onClose={() => setPaystackModal(false)}
        onSuccess={() => { setPaystackModal(false); fetchCustomer(); }}
        customer={customer}
        invoice={customer?.invoices?.find(i => i.status !== 'paid') || null}
        defaultAmount={outstanding > 0 ? outstanding : undefined}
      />

      {/* Telegram Chat ID Modal */}
      {telegramModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg w-full max-w-md p-6">
            <h3 className="text-white font-semibold mb-4">
              Set Telegram Chat ID
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Enter the Telegram Chat ID for {customer.name} to receive
              automated alerts via Telegram.
            </p>
            <form onSubmit={saveTelegramChatId} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Telegram Chat ID *
                </label>
                <input
                  type="text"
                  required
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="e.g., 123456789"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <p className="text-xs text-slate-500 mt-1">
                  To get your Chat ID: Start your bot in Telegram, send a
                  message, then check the bot's updates
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setTelegramModal(false);
                    setTelegramChatId("");
                  }}
                  className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingTelegram}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {savingTelegram ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
