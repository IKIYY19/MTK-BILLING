import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Signal,
  Wifi,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "/api";
const SESSION_KEY = "captive_hotspot_session";
const POLL_INTERVAL_MS = 5000;
const MAX_AUTOMATIC_POLLS = 30;

function getPortalContext() {
  const params = new URLSearchParams(window.location.search);
  const linkLoginOnly =
    params.get("link_login_only") || params.get("link-login-only") || "";
  let gatewayIp = params.get("gateway_ip") || params.get("gateway") || "";
  if (!gatewayIp && linkLoginOnly) {
    try {
      gatewayIp = new URL(linkLoginOnly).hostname;
    } catch {
      gatewayIp = "";
    }
  }
  return {
    routerId: params.get("router_id") || params.get("routerId") || "",
    mac: params.get("mac") || "",
    ip: params.get("ip") || "",
    gatewayIp,
    linkLoginOnly,
    brand: params.get("brand") || "",
    originalUrl:
      params.get("original_url") ||
      params.get("link-orig") ||
      params.get("dst") ||
      "",
  };
}

function formatPrice(price) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatExpiry(value) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function CaptiveHotspotPage() {
  const context = useMemo(getPortalContext, []);
  const [plans, setPlans] = useState([]);
  const [routerName, setRouterName] = useState("");
  const [activeSession, setActiveSession] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [phone, setPhone] = useState("");
  const [sessionToken, setSessionToken] = useState(
    () => sessionStorage.getItem(SESSION_KEY) || "",
  );
  const [payment, setPayment] = useState(null);
  const [pollCount, setPollCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!context.routerId || !context.mac) {
      setError("This page must be opened from your Wi-Fi sign-in screen.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    axios
      .get(`${API}/captive-hotspot/plans`, {
        params: { router_id: context.routerId, mac: context.mac },
      })
      .then(({ data }) => {
        if (cancelled) return;
        setPlans(Array.isArray(data.plans) ? data.plans : []);
        setRouterName(data.router?.name || "");
        setActiveSession(data.activeSession || null);
        setSelectedPlan(data.plans?.[0]?.id || "");
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(
            requestError.response?.data?.error ||
              "Internet packages could not be loaded. Please try again.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [context.routerId, context.mac]);

  const refreshPayment = async () => {
    if (!sessionToken) return;
    setChecking(true);
    try {
      const { data } = await axios.get(
        `${API}/captive-hotspot/sessions/${encodeURIComponent(sessionToken)}`,
        { params: { router_id: context.routerId, mac: context.mac } },
      );
      setPayment(data);
      setTimedOut(false);
      if (["failed", "payment_review"].includes(data.status)) {
        sessionStorage.removeItem(SESSION_KEY);
        setSessionToken("");
      }
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Payment status is temporarily unavailable. Try checking again.",
      );
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!sessionToken || pollCount >= MAX_AUTOMATIC_POLLS) {
      if (sessionToken && pollCount >= MAX_AUTOMATIC_POLLS) setTimedOut(true);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      refreshPayment();
      setPollCount((count) => count + 1);
    }, POLL_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [sessionToken, pollCount]);

  const startPayment = async (event) => {
    event.preventDefault();
    const plan = plans.find((item) => item.id === selectedPlan);
    if (!plan) {
      setError("Choose an available package before continuing.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const { data } = await axios.post(`${API}/captive-hotspot/sessions`, {
        router_id: context.routerId,
        plan_id: plan.id,
        mac: context.mac,
        ip: context.ip,
        gateway_ip: context.gatewayIp,
        link_login_only: context.linkLoginOnly,
        original_url: context.originalUrl,
        phone,
      });
      sessionStorage.setItem(SESSION_KEY, data.sessionToken);
      setSessionToken(data.sessionToken);
      setPayment({ status: "pending", planName: plan.name, amount: plan.price });
      setPollCount(0);
      setTimedOut(false);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "M-Pesa could not start the payment prompt. Check your number and retry.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const retryAuthorization = async () => {
    setChecking(true);
    setError("");
    try {
      const { data } = await axios.post(
        `${API}/captive-hotspot/sessions/${encodeURIComponent(sessionToken)}/retry`,
        { router_id: context.routerId, mac: context.mac },
      );
      setPayment(data);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "The router could not be reached. Check the Wi-Fi connection and retry.",
      );
    } finally {
      setChecking(false);
    }
  };

  const resetPayment = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setSessionToken("");
    setPayment(null);
    setPollCount(0);
    setTimedOut(false);
    setError("");
  };

  const authorized = payment?.status === "authorized";
  const paymentConfirmed = [
    "payment_confirmed",
    "provisioning",
    "authorization_failed",
    "authorized",
  ].includes(payment?.status);
  const waitingForPayment =
    sessionToken &&
    ["pending", "initiating"].includes(payment?.status);

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 grid place-items-center px-5">
        <div className="flex items-center gap-3 text-zinc-300" role="status">
          <LoaderCircle className="h-5 w-5 animate-spin text-cyan-400" />
          Loading internet packages…
        </div>
      </main>
    );
  }

  if (authorized) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 grid place-items-center px-5 py-10">
        <section className="w-full max-w-lg border border-emerald-400/25 bg-zinc-900 p-6 sm:p-9">
          <CheckCircle2 className="mb-5 h-9 w-9 text-emerald-400" />
          <h1 className="text-3xl font-semibold tracking-tight">Payment confirmed</h1>
          <p className="mt-3 max-w-prose text-zinc-300">
            Your package is ready. Connect now to finish signing in to the Wi-Fi.
          </p>
          <p className="mt-5 text-sm text-zinc-400">
            {payment.planName} · access until {formatExpiry(payment.expiresAt)}
          </p>
          <form
            action={payment.linkLoginOnly}
            method="post"
            className="mt-7"
          >
            <input type="hidden" name="username" value={payment.username || ""} />
            <input type="hidden" name="password" value={payment.password || ""} />
            <input type="hidden" name="dst" value={payment.originalUrl || ""} />
            <button
              type="submit"
              className="w-full bg-cyan-300 px-5 py-4 font-semibold text-black transition-colors hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            >
              Connect to Wi-Fi
            </button>
          </form>
          <p className="mt-4 text-xs text-zinc-500">
            If the sign-in page does not close, reconnect to this network and try again.
          </p>
        </section>
      </main>
    );
  }

  if (activeSession) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 grid place-items-center px-5 py-10">
        <section className="w-full max-w-lg border border-emerald-400/25 bg-zinc-900 p-6 sm:p-9">
          <Wifi className="mb-5 h-9 w-9 text-emerald-400" />
          <h1 className="text-3xl font-semibold tracking-tight">Your access is active</h1>
          <p className="mt-3 text-zinc-300">
            This device already has a paid package on this Wi-Fi network.
          </p>
          <p className="mt-5 text-sm text-zinc-400">
            Access ends {formatExpiry(activeSession.expiresAt)}.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <section className="flex flex-col justify-between px-5 py-8 sm:px-10 lg:px-14 lg:py-12">
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <span className="grid h-9 w-9 place-items-center border border-cyan-300/30 text-cyan-300">
              <Wifi className="h-4 w-4" />
            </span>
            <span>{routerName || context.brand || "Wi-Fi access"}</span>
          </div>
          <div className="py-12 lg:py-0">
            <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Choose your internet package
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-zinc-400">
              Select a package, approve the M-Pesa prompt on your phone, then connect.
            </p>
            <div className="mt-8 flex items-center gap-3 text-sm text-zinc-500">
              <Signal className="h-4 w-4 text-cyan-300" />
              Secure payment · access starts after payment confirmation
            </div>
          </div>
          <p className="text-xs text-zinc-600">
            Your device address is used only to deliver access to this Wi-Fi session.
          </p>
        </section>

        <section className="border-t border-zinc-800 px-5 py-8 sm:px-10 lg:border-l lg:border-t-0 lg:px-12 lg:py-12">
          {payment ? (
            <div className="mx-auto flex h-full max-w-md flex-col justify-center">
              <div
                className={`mb-6 grid h-12 w-12 place-items-center border ${
                  paymentConfirmed
                    ? "border-emerald-400/30 text-emerald-300"
                    : "border-cyan-300/30 text-cyan-300"
                }`}
              >
                {paymentConfirmed ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <Clock3 className="h-5 w-5" />
                )}
              </div>
              <h2 className="text-2xl font-semibold">
                {payment.status === "authorization_failed"
                  ? "Payment received"
                  : paymentConfirmed
                    ? "Preparing your access"
                    : "Approve payment"}
              </h2>
              <p className="mt-3 leading-6 text-zinc-400">
                {payment.status === "authorization_failed"
                  ? payment.error || "Payment is confirmed, but the router could not be reached."
                  : paymentConfirmed
                    ? "Payment is confirmed. We are authorizing your device on the router."
                    : timedOut
                      ? "The payment prompt may have timed out. Check the payment status or retry the payment."
                      : "Check your phone and enter your M-Pesa PIN to approve the prompt."}
              </p>
              {payment.status === "authorization_failed" ? (
                <button
                  type="button"
                  onClick={retryAuthorization}
                  disabled={checking}
                  className="mt-7 flex w-full items-center justify-center gap-2 bg-cyan-300 px-5 py-4 font-semibold text-black hover:bg-cyan-200 disabled:opacity-50"
                >
                  {checking && <LoaderCircle className="h-4 w-4 animate-spin" />}
                  Retry router authorization
                </button>
              ) : waitingForPayment || paymentConfirmed ? (
                <button
                  type="button"
                  onClick={() => {
                    setPollCount(0);
                    refreshPayment();
                  }}
                  disabled={checking}
                  className="mt-7 flex w-full items-center justify-center gap-2 border border-zinc-700 px-5 py-4 font-medium text-zinc-100 hover:border-cyan-300/60 disabled:opacity-50"
                >
                  {checking ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Check payment status
                </button>
              ) : null}
              {payment.status === "failed" || payment.status === "payment_review" ? (
                <div className="mt-6 border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-100">
                  <AlertTriangle className="mb-2 h-4 w-4 text-amber-300" />
                  {payment.status === "payment_review"
                    ? "The provider amount needs review. Do not pay again; contact the network operator."
                    : payment.error || "Payment was not completed. You can choose a package and try again."}
                </div>
              ) : null}
              {payment.status === "failed" && (
                <button
                  type="button"
                  onClick={resetPayment}
                  className="mt-5 text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-200"
                >
                  Choose another package
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={startPayment} className="mx-auto max-w-md">
              <h2 className="text-xl font-semibold">Available packages</h2>
              {plans.length === 0 ? (
                <p className="mt-6 border border-zinc-800 p-5 text-sm leading-6 text-zinc-400">
                  There are no hotspot packages available right now. Please contact the network operator.
                </p>
              ) : (
                <div className="mt-5 divide-y divide-zinc-800 border-y border-zinc-800">
                  {plans.map((plan) => (
                    <label
                      key={plan.id}
                      className={`flex cursor-pointer items-center justify-between gap-4 py-5 transition-colors ${
                        selectedPlan === plan.id ? "text-white" : "text-zinc-400"
                      }`}
                    >
                      <span className="flex min-w-0 items-start gap-3">
                        <input
                          type="radio"
                          name="hotspot-plan"
                          value={plan.id}
                          checked={selectedPlan === plan.id}
                          onChange={() => setSelectedPlan(plan.id)}
                          className="mt-1 accent-cyan-300 focus-visible:outline-cyan-300"
                        />
                        <span className="min-w-0">
                          <span className="block font-medium text-zinc-100">{plan.name}</span>
                          <span className="mt-1 block text-sm text-zinc-500">
                            {plan.speed_up} up · {plan.speed_down} down
                            {plan.quota_gb ? ` · ${plan.quota_gb} GB` : ""}
                            {" · "}{plan.validity_days} day{plan.validity_days === 1 ? "" : "s"}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold text-cyan-300">
                        {formatPrice(plan.price)}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <label htmlFor="mpesa-phone" className="mt-7 block text-sm font-medium text-zinc-200">
                M-Pesa phone number
              </label>
              <input
                id="mpesa-phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="07XX XXX XXX"
                className="mt-2 h-12 w-full border border-zinc-700 bg-zinc-900 px-4 text-base text-white placeholder:text-zinc-600 focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300/20"
              />
              {error && (
                <div
                  role="alert"
                  className="mt-4 flex gap-2 border border-rose-400/30 bg-rose-400/5 p-3 text-sm leading-5 text-rose-200"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                  <span>{error}</span>
                </div>
              )}
              <button
                type="submit"
                disabled={submitting || plans.length === 0 || !selectedPlan}
                className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 bg-cyan-300 px-5 py-4 font-semibold text-black transition-colors hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-black"
              >
                {submitting ? (
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                ) : (
                  <span>Pay with M-Pesa</span>
                )}
              </button>
              {submitting && (
                <p className="mt-3 text-center text-sm text-zinc-500">
                  Sending a secure payment prompt…
                </p>
              )}
              {sessionToken && (
                <button
                  type="button"
                  onClick={refreshPayment}
                  className="mt-4 w-full text-center text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-200"
                >
                  Recover pending payment
                </button>
              )}
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
