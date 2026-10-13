import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Wifi,
  ArrowLeft,
  Check,
  Zap,
  Clock,
  Database,
  Gauge,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "/api";

export function PlansPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    // Check if user came from signup
    const name = sessionStorage.getItem("signup_name");
    if (!name) {
      navigate("/signup");
      return;
    }
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const { data } = await axios.get(`${API}/public/plans`);
      setPlans(data);
    } catch (err) {
      setError("Failed to load plans. Please try again.");
    }
    setLoading(false);
  };

  const handleSelectPlan = async (plan) => {
    setSelecting(plan.id);
    setError("");

    try {
      const name = sessionStorage.getItem("signup_name");
      const phone = sessionStorage.getItem("signup_phone");
      const email = sessionStorage.getItem("signup_email");
      const pin = sessionStorage.getItem("signup_pin");

      const { data } = await axios.post(`${API}/public/register`, {
        name,
        phone,
        email: email || "",
        pin,
        plan_id: plan.id,
      });

      // Store invoice info for checkout
      sessionStorage.setItem("invoice_id", data.invoice.id);
      sessionStorage.setItem("plan_name", data.plan.name);
      sessionStorage.setItem("plan_price", data.plan.price);
      sessionStorage.setItem("customer_id", data.customer.id);
      sessionStorage.setItem("subscription_id", data.subscription.id);

      navigate(`/checkout/${data.invoice.id}`);
    } catch (err) {
      setError(
        err.response?.data?.error || "Failed to select plan. Please try again.",
      );
    }
    setSelecting(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate("/signup")}
          className="text-zinc-400 hover:text-white flex items-center gap-2 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="text-center mb-10">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Wifi className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Choose Your Plan</h1>
          <p className="text-zinc-400 mt-2">
            Select the internet plan that works best for you
          </p>
        </div>

        {error && (
          <div className="max-w-md mx-auto mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400 text-center">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="bg-zinc-800/50 backdrop-blur border border-zinc-700/50 rounded-2xl p-6 hover:border-blue-500/50 transition-all hover:shadow-lg hover:shadow-blue-500/5 group"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-white">
                    {plan.name}
                  </h3>
                  {plan.description && (
                    <p className="text-sm text-zinc-400 mt-1">
                      {plan.description}
                    </p>
                  )}
                </div>
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 text-blue-400" />
                </div>
              </div>

              <div className="mb-6">
                <span className="text-3xl font-bold text-white">
                  KES {plan.price}
                </span>
                <span className="text-zinc-400 text-sm ml-1">
                  / {plan.duration_days || 30} days
                </span>
              </div>

              <div className="space-y-3 mb-6">
                {plan.speed && (
                  <div className="flex items-center gap-3 text-sm">
                    <Gauge className="w-4 h-4 text-blue-400" />
                    <span className="text-zinc-300">
                      Speed:{" "}
                      <span className="text-white font-medium">
                        {plan.speed}
                      </span>
                    </span>
                  </div>
                )}
                {plan.data_cap && (
                  <div className="flex items-center gap-3 text-sm">
                    <Database className="w-4 h-4 text-blue-400" />
                    <span className="text-zinc-300">
                      Data:{" "}
                      <span className="text-white font-medium">
                        {plan.data_cap}
                      </span>
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <span className="text-zinc-300">
                    Billing:{" "}
                    <span className="text-white font-medium">
                      {plan.duration_days || 30}-day cycle
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Check className="w-4 h-4 text-blue-400" />
                  <span className="text-zinc-300">
                    Connection:{" "}
                    <span className="text-white font-medium capitalize">
                      {plan.connection_type}
                    </span>
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleSelectPlan(plan)}
                disabled={selecting === plan.id}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-violet-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-violet-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {selecting === plan.id ? (
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  "Select Plan"
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
