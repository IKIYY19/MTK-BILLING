import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import {
  Wifi,
  User,
  Phone,
  Mail,
  Lock,
  ArrowRight,
  Loader2,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "/api";

export function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    pin: "",
    confirmPin: "",
  });
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Load Google Identity Services if configured
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (clientId && !window.google?.accounts?.id) {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      document.head.appendChild(s);
    }
  }, []);

  const handleGoogleSignup = async () => {
    const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!GOOGLE_CLIENT_ID) {
      setError("Google Sign-Up is not configured yet");
      return;
    }
    setGoogleLoading(true);
    setError("");

    const init = () => {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (r) => {
          try {
            const res = await axios.post(`${API}/auth/google`, {
              credential: r.credential,
            });
            localStorage.setItem("auth_token", res.data.token);
            localStorage.setItem("auth_user", JSON.stringify(res.data.user));
            sessionStorage.setItem("signup_name", res.data.user.name || "");
            sessionStorage.setItem("signup_email", res.data.user.email || "");
            navigate("/plans");
          } catch {
            setError("Google sign-up failed. Please try again.");
            setGoogleLoading(false);
          }
        },
      });
      window.google.accounts.id.prompt();
    };

    if (window.google?.accounts?.id) {init();}
    else {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.onload = init;
      document.head.appendChild(s);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.pin !== form.confirmPin) {
      setError("PINs do not match");
      return;
    }
    if (form.pin.length < 4 || form.pin.length > 8) {
      setError("PIN must be 4-8 digits");
      return;
    }
    setLoading(true);
    try {
      sessionStorage.setItem("signup_name", form.name);
      sessionStorage.setItem("signup_phone", form.phone);
      sessionStorage.setItem("signup_email", form.email);
      sessionStorage.setItem("signup_pin", form.pin);
      navigate("/plans");
    } catch (err) {
      setError(
        err.response?.data?.error || "Registration failed. Please try again.",
      );
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Wifi className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Get Connected</h1>
          <p className="text-zinc-400 mt-2">
            Sign up for high-speed internet today
          </p>
        </div>

        <div className="bg-zinc-800/50 backdrop-blur border border-zinc-700/50 rounded-2xl p-8 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Google Sign-Up */}
          <button
            type="button"
            onClick={handleGoogleSignup}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-700 font-semibold py-3 px-4 rounded-xl border border-gray-200 transition-all hover:shadow-md text-sm"
          >
            {googleLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            {googleLoading ? "Signing up..." : "Sign up with Google"}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-700" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-zinc-800 px-3 text-zinc-500">
                or sign up with email
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-300 mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/60 border border-zinc-700/50 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="John Doe"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-zinc-300 mb-1.5">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/60 border border-zinc-700/50 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="0712 345 678"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-zinc-300 mb-1.5">
                Email (optional)
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/60 border border-zinc-700/50 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="john@example.com"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-zinc-300 mb-1.5">
                Set PIN (4-8 digits)
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={form.pin}
                  onChange={(e) =>
                    setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })
                  }
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/60 border border-zinc-700/50 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="1234"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-zinc-300 mb-1.5">
                Confirm PIN
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={form.confirmPin}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      confirmPin: e.target.value.replace(/\D/g, ""),
                    })
                  }
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/60 border border-zinc-700/50 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="1234"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-violet-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-violet-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? "Please wait..." : "Continue to Plans"}{" "}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <p className="text-center text-xs text-zinc-500 mt-4">
            Already have an account?{" "}
            <Link
              to={`/portal/login?phone=${encodeURIComponent(form.phone || "")}`}
              className="text-blue-400 hover:text-blue-300"
            >
              Sign in to portal
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
