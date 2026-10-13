import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Wifi,
  CheckCircle,
  User,
  Key,
  Download,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";

export function WelcomePage() {
  const navigate = useNavigate();
  const [copiedField, setCopiedField] = useState(null);

  const username = sessionStorage.getItem("pppoe_username") || "";
  const password = sessionStorage.getItem("pppoe_password") || "";
  const planName = sessionStorage.getItem("welcome_plan_name") || "Your Plan";
  const customerId = sessionStorage.getItem("customer_id") || "";
  const customerName = sessionStorage.getItem("signup_name") || "";

  useEffect(() => {
    if (!username || !password) {
      navigate("/signup");
    }
  }, []);

  const handleCopy = (text, field) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  };

  const handleDownload = () => {
    const details = `=== Internet Service Credentials ===\n\nCustomer: ${customerName}\nPlan: ${planName}\n\nPPPoE / Hotspot Login:\nUsername: ${username}\nPassword: ${password}\n\nKeep these credentials safe. Do not share them.\n`;
    const blob = new Blob([details], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `isp-credentials-${customerName.replace(/\s+/g, "-").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Welcome!</h1>
          <p className="text-zinc-400 mt-2">
            Your service is now active. Here are your login credentials.
          </p>
        </div>

        <div className="bg-zinc-800/50 backdrop-blur border border-zinc-700/50 rounded-2xl p-6 mb-6">
          <div className="text-center mb-6">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Wifi className="w-6 h-6 text-blue-400" />
            </div>
            <h2 className="text-xl font-semibold text-white">{planName}</h2>
            <p className="text-sm text-zinc-400">
              Credentials for your internet connection
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1 uppercase tracking-wider">
                PPPoE / Hotspot Username
              </label>
              <div className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-700/50 rounded-lg p-3">
                <User className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <code className="flex-1 text-sm text-white font-mono">
                  {username}
                </code>
                <button
                  onClick={() => handleCopy(username, "username")}
                  className="text-zinc-400 hover:text-white transition-colors"
                  title="Copy username"
                >
                  {copiedField === "username" ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-1 uppercase tracking-wider">
                Password
              </label>
              <div className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-700/50 rounded-lg p-3">
                <Key className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <code className="flex-1 text-sm text-white font-mono">
                  {password}
                </code>
                <button
                  onClick={() => handleCopy(password, "password")}
                  className="text-zinc-400 hover:text-white transition-colors"
                  title="Copy password"
                >
                  {copiedField === "password" ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleDownload}
            className="w-full py-3 bg-gradient-to-r from-blue-500 to-violet-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-violet-700 transition-all flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            Download Credentials
          </button>

          {customerId && (
            <Link
              to={`/portal/login?phone=${encodeURIComponent(sessionStorage.getItem("signup_phone") || "")}`}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-violet-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-violet-700 transition-all flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Go to Customer Portal
            </Link>
          )}
        </div>

        <p className="text-center text-xs text-zinc-500 mt-6">
          Please save your credentials. You'll need them to configure your
          router.
        </p>
      </div>
    </div>
  );
}
