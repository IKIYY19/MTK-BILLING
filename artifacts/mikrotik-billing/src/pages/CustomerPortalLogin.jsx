import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Smartphone,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  ArrowLeft,
  X,
} from "lucide-react";
import { useToast } from "../hooks/useToast";

const API = import.meta.env.VITE_API_URL || "/api";

export default function CustomerPortalLogin() {
  const [loginMethod, setLoginMethod] = useState("phone");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForgotPin, setShowForgotPin] = useState(false);
  const [resetStep, setResetStep] = useState(1); // 1 = enter phone, 2 = enter code + new PIN
  const [resetPhone, setResetPhone] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const navigate = useNavigate();
  const toast = useToast();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(`${API}/portal/auth/login`, {
        ...(loginMethod === "phone" ? { phone, pin } : { username, password }),
      });

      // Store customer token
      localStorage.setItem("customerToken", response.data.token);
      localStorage.setItem("customer", JSON.stringify(response.data.customer));

      toast.success("Login successful!");
      navigate(`/portal/${response.data.customer.id}`);
    } catch (error) {
      console.error("Login error:", error);
      toast.error(
        "Login failed",
        error.response?.data?.error || "Invalid portal credentials",
      );
    } finally {
      setLoading(false);
    }
  };
  const handleSendCode = async (e) => {
    e.preventDefault();
    setResetLoading(true);
    setResetError("");
    try {
      const { data } = await axios.post(`${API}/portal/auth/forgot-pin`, {
        phone: resetPhone,
      });
      // In development, show the code. In production it would be sent via SMS.
      if (data.resetCode) {
        setResetCode(data.resetCode);
        toast.success(`Your reset code is: ${data.resetCode}`);
      } else {
        toast.success("Reset code sent to your phone");
      }
      setResetStep(2);
    } catch (err) {
      setResetError(err.response?.data?.error || "Failed to send code");
    }
    setResetLoading(false);
  };

  const handleResetPin = async (e) => {
    e.preventDefault();
    if (newPin !== confirmNewPin) {
      setResetError("PINs do not match");
      return;
    }
    if (newPin.length < 4 || newPin.length > 8) {
      setResetError("PIN must be 4-8 digits");
      return;
    }
    setResetLoading(true);
    setResetError("");
    try {
      await axios.post(`${API}/portal/auth/reset-pin`, {
        phone: resetPhone,
        resetCode,
        newPIN: newPin,
      });
      toast.success("PIN reset successfully. You can now login.");
      setShowForgotPin(false);
      setResetStep(1);
      setResetPhone("");
      setResetCode("");
      setNewPin("");
      setConfirmNewPin("");
      // Fill in the phone on the login form
      setPhone(resetPhone);
    } catch (err) {
      setResetError(err.response?.data?.error || "Failed to reset PIN");
    }
    setResetLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-slate-900 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back button */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to main site</span>
        </button>

        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-600 rounded-2xl mb-4">
            <Smartphone className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Customer Portal
          </h1>
          <p className="text-gray-400">Sign in to view your account</p>
        </div>

        {/* Login Form */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-300">
                  {loginMethod === "phone" ? "Phone Number" : "Username"}
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setLoginMethod(loginMethod === "phone" ? "username" : "phone")
                  }
                  className="text-xs text-emerald-400 hover:text-emerald-300"
                >
                  {loginMethod === "phone"
                    ? "Use username instead"
                    : "Use phone instead"}
                </button>
              </div>
              {loginMethod === "phone" ? (
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="e.g., +254712345678"
                  required
                  autoFocus
                />
              ) : (
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="Enter your username"
                  autoComplete="username"
                  required
                  autoFocus
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {loginMethod === "phone" ? "PIN" : "Password"}
              </label>
              <div className="relative">
                <input
                  type={showPin ? "text" : "password"}
                  value={loginMethod === "phone" ? pin : password}
                  onChange={(e) =>
                    loginMethod === "phone"
                      ? setPin(e.target.value)
                      : setPassword(e.target.value)
                  }
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent pr-12"
                  placeholder={
                    loginMethod === "phone"
                      ? "Enter your PIN"
                      : "Enter your password"
                  }
                  autoComplete="current-password"
                  required
                  minLength={loginMethod === "phone" ? 4 : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showPin ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {loginMethod === "phone" ? (
                <>
                  <p className="text-xs text-gray-500 mt-2">
                    First time? Use the last 4 digits of your phone number.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowForgotPin(true)}
                    className="text-xs text-emerald-400 hover:text-emerald-300 mt-2 transition-colors"
                  >
                    Forgot PIN?
                  </button>
                </>
              ) : (
                <p className="text-xs text-gray-500 mt-2">
                  Use the username and password provided by your service provider.
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <Lock className="w-5 h-5" />
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Help */}
          <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <p className="text-sm text-emerald-300 mb-1 font-medium">
              Need Help?
            </p>
            <p className="text-xs text-gray-400">
              Contact your service provider for login credentials
            </p>
          </div>
        </div>

        {/* Forgot PIN Modal */}
        {showForgotPin && (
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowForgotPin(false)}
          >
            <div
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-zinc-800/50 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">
                  Reset Portal PIN
                </h3>
                <button
                  onClick={() => setShowForgotPin(false)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {resetStep === 1 ? (
                <form onSubmit={handleSendCode} className="p-6 space-y-4">
                  <p className="text-sm text-zinc-400">
                    Enter your phone number to receive a reset code.
                  </p>
                  {resetError && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
                      {resetError}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={resetPhone}
                      onChange={(e) => setResetPhone(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white"
                      placeholder="0712 345 678"
                      required
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowForgotPin(false)}
                      className="flex-1 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={resetLoading}
                      className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-50"
                    >
                      {resetLoading ? "Sending..." : "Send Code"}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleResetPin} className="p-6 space-y-4">
                  <p className="text-sm text-zinc-400">
                    Enter the reset code sent to {resetPhone} and your new PIN.
                  </p>
                  {resetError && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
                      {resetError}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      Reset Code
                    </label>
                    <input
                      type="text"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white font-mono text-center text-xl tracking-widest"
                      placeholder="000000"
                      required
                      maxLength={6}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      New PIN (4-8 digits)
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      value={newPin}
                      onChange={(e) =>
                        setNewPin(e.target.value.replace(/\D/g, ""))
                      }
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white text-center text-xl tracking-widest"
                      placeholder="****"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      Confirm New PIN
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      value={confirmNewPin}
                      onChange={(e) =>
                        setConfirmNewPin(e.target.value.replace(/\D/g, ""))
                      }
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white text-center text-xl tracking-widest"
                      placeholder="****"
                      required
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowForgotPin(false);
                        setResetStep(1);
                      }}
                      className="flex-1 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={resetLoading}
                      className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-50"
                    >
                      {resetLoading ? "Resetting..." : "Reset PIN"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-gray-500 text-sm mt-8">
          Self-Service Customer Portal
        </p>
      </div>
    </div>
  );
}

export function CustomerPortalTokenLogin() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const exchangeToken = async () => {
      try {
        const response = await axios.post(`${API}/portal/auth/token-login`, {
          token,
        });
        if (cancelled) return;

        localStorage.setItem("customerToken", response.data.token);
        localStorage.setItem("customer", JSON.stringify(response.data.customer));
        navigate(`/portal/${response.data.customer.id}`, { replace: true });
      } catch (requestError) {
        if (cancelled) return;
        setError(
          requestError.response?.data?.error || "Unable to open this portal link",
        );
      }
    };

    exchangeToken();
    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-slate-900 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white/10 p-8 text-center backdrop-blur-lg">
        <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-emerald-400" />
        <h1 className="text-xl font-semibold text-white">
          {error ? "Portal link unavailable" : "Opening your portal"}
        </h1>
        {error && (
          <>
            <p className="mt-3 text-sm text-red-300">{error}</p>
            <button
              type="button"
              onClick={() => navigate("/portal/login", { replace: true })}
              className="mt-6 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Sign in with your credentials
            </button>
          </>
        )}
      </div>
    </div>
  );
}
