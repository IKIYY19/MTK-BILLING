import React, { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import axios from "axios";
import { Wifi, ArrowLeft, CreditCard, Smartphone, CheckCircle, AlertCircle } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "/api";

const TAX_RATE = 0.16;

export function CheckoutPage() {
  const navigate = useNavigate();
  const { invoiceId } = useParams();
  const [mpesaCode, setMpesaCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const planName = sessionStorage.getItem("plan_name") || "";
  const planPrice = Number(sessionStorage.getItem("plan_price"));
  const tax = planPrice * TAX_RATE;
  const total = planPrice + tax;

  useEffect(() => {
    // Check if user has come through proper flow
    const customerId = sessionStorage.getItem("customer_id");
    if (
      !customerId ||
      !invoiceId ||
      !planName ||
      !Number.isFinite(planPrice) ||
      planPrice < 0
    ) {
      navigate("/signup");
    }
  }, [invoiceId, navigate, planName, planPrice]);

  const handleMpesaPayment = async () => {
    if (!mpesaCode.trim()) {
      setError("Please enter the M-Pesa confirmation code");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data } = await axios.post(`${API}/public/confirm-payment`, {
        invoice_id: invoiceId,
        mpesa_code: mpesaCode.trim(),
      });

      // Store credentials for welcome page
      sessionStorage.setItem("pppoe_username", data.credentials.username);
      sessionStorage.setItem("pppoe_password", data.credentials.password);
      sessionStorage.setItem("welcome_plan_name", data.credentials.plan_name);

      setSuccess(true);
      setTimeout(() => {
        navigate("/welcome");
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.error || "Payment confirmation failed. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <button
          onClick={() => navigate("/plans")}
          className="text-zinc-400 hover:text-white flex items-center gap-2 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Plans
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <CreditCard className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Checkout</h1>
          <p className="text-zinc-400 mt-2">Complete your payment to activate your service</p>
        </div>

        {success ? (
          <div className="bg-zinc-800/50 backdrop-blur border border-green-500/30 rounded-2xl p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Payment Confirmed!</h2>
            <p className="text-zinc-400">Redirecting to your welcome page...</p>
          </div>
        ) : (
          <>
            {/* Invoice Summary */}
            <div className="bg-zinc-800/50 backdrop-blur border border-zinc-700/50 rounded-2xl p-6 mb-6">
              <h2 className="text-lg font-semibold text-white mb-4">Invoice Summary</h2>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Plan</span>
                  <span className="text-white font-medium">{planName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Subtotal</span>
                  <span className="text-white">KES {planPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Tax (16% VAT)</span>
                  <span className="text-white">KES {tax.toFixed(2)}</span>
                </div>
                <div className="border-t border-zinc-700 pt-3 flex justify-between">
                  <span className="text-zinc-200 font-semibold">Total</span>
                  <span className="text-white font-bold text-lg">KES {total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Payment Section */}
            <div className="bg-zinc-800/50 backdrop-blur border border-zinc-700/50 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-green-400" />
                Pay via M-Pesa
              </h2>

              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-4">
                <p className="text-sm text-green-300">
                  Use the official M-Pesa payment details provided by your
                  internet provider. Confirm the business number and invoice
                  reference with them before sending KES {total.toFixed(2)}.
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400 mb-4">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm text-zinc-300 mb-1.5">M-Pesa Confirmation Code</label>
                <input
                  type="text"
                  value={mpesaCode}
                  onChange={(e) => setMpesaCode(e.target.value)}
                  placeholder="e.g. QW12XYZ34"
                  className="w-full px-4 py-2.5 bg-zinc-900/60 border border-zinc-700/50 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <button
                onClick={handleMpesaPayment}
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-medium hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  "Confirm Payment"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
