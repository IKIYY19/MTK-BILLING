import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Signal,
  Smartphone,
  Sparkles,
  Wifi,
  Zap,
} from "lucide-react";
import "../../hotspot-portal.css";

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
  let mac =
    params.get("mac") ||
    params.get("client_mac") ||
    params.get("client-mac") ||
    params.get("mac_address") ||
    "";
  if (!mac && linkLoginOnly) {
    try {
      mac = new URL(linkLoginOnly).searchParams.get("mac") || "";
    } catch {
      mac = "";
    }
  }

  return {
    routerId: params.get("router_id") || params.get("routerId") || "",
    mac,
    ip: params.get("ip") || "",
    gatewayIp,
    linkLoginOnly,
    brand: params.get("brand") || "",
    theme: params.get("theme") || localStorage.getItem("portal_theme") || "aurora",
    welcome: params.get("welcome") || "",
    support: params.get("support") || "",
    font: params.get("font") || "Inter",
    terms: params.get("terms") || "",
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

function PortalMark() {
  return (
    <div className="hp-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M4.5 9.5a10 10 0 0 1 15 0" />
        <path d="M7.5 12.8a6 6 0 0 1 9 0" />
        <circle cx="12" cy="17" r="1.6" fill="currentColor" stroke="none" />
      </svg>
    </div>
  );
}

function PortalShell({ brand, device, theme, support, font, children }) {
  return (
    <main className="hp-shell" data-theme={theme} style={{ fontFamily: `'${font || "Inter"}', Inter, system-ui, sans-serif` }}>
      <div className="hp-orb hp-orb-a" />
      <div className="hp-orb hp-orb-b" />
      <div className="hp-orb hp-orb-c" />
      <div className="hp-grid" />
      <div className="hp-wrap">
        <header className="hp-top">
          <div className="hp-brand">
            <PortalMark />
            <div className="min-w-0">
              <div className="hp-brand-name">{brand}</div>
              <div className="hp-brand-sub">Hotspot network</div>
            </div>
          </div>
          <div className="hp-chip"><span className="hp-dot" /><Signal className="h-3.5 w-3.5" /> Wi-Fi ready</div>
        </header>
        {children}
        <footer className="hp-foot">
          <span>Powered by {brand}{support ? ` · Need help? ${support}` : ""}</span>
          <span>{device ? `Device ${device}` : "Secure hotspot access"}</span>
        </footer>
      </div>
    </main>
  );
}

function StatusCard({ icon, tone = "success", eyebrow, title, children }) {
  return (
    <div className="hp-center">
      <section className="hp-status">
        {tone === "success" && <div className="hp-confetti" aria-hidden="true"><i /><i /><i /><i /></div>}
        <div className={`hp-status-icon ${tone === "info" ? "is-info" : ""}`}>{icon}</div>
        <div className="hp-brand-sub">{eyebrow}</div>
        <h1>{title}</h1>
        {children}
      </section>
    </div>
  );
}

function PaymentSteps({ stage }) {
  const labels = ["Approve on your phone", "Confirm your payment", "Activate this device"];
  return (
    <div className="hp-progress">
      {labels.map((label, index) => (
        <div
          key={label}
          className={`hp-progress-row ${index < stage ? "is-done" : index === stage ? "is-active" : ""}`}
        >
          <span className="hp-progress-dot" />
          <span>{label}</span>
          {index < stage && <Check className="ml-auto h-3.5 w-3.5" />}
        </div>
      ))}
    </div>
  );
}

export default function CaptiveHotspotPage() {
  const context = useMemo(getPortalContext, []);
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const [policy, setPolicy] = useState({});

  useEffect(() => {
    axios.get(`${API}/public/policy`).then(({ data }) => setPolicy(data || {})).catch(() => {});
  }, []);

  const portalTheme = query.has("theme") ? context.theme : policy.portal_theme || context.theme;
  const portalFont = query.has("font") ? context.font : policy.portal_font || context.font;
  const portalTerms = query.has("terms")
    ? context.terms
    : policy.portal_terms_enabled ? policy.portal_terms_text || "" : "";
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
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [paymentsEnabled, setPaymentsEnabled] = useState(true);
  const [resolvedMac, setResolvedMac] = useState("");

  useEffect(() => {
    if (!portalFont || portalFont === "Inter") {return undefined;}
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(portalFont).replace(/%20/g, "+")}:wght@400;500;600;700;800&display=swap`;
    document.head.appendChild(link);
    return () => link.remove();
  }, [portalFont]);

  // RouterOS can leave $(mac) empty in the hotspot HTML. When that happens the
  // API resolves the client from $(ip) and returns the authoritative MAC.
  const activeMac = context.mac || resolvedMac;
  const preview = !context.routerId || (!context.mac && !context.ip && !resolvedMac);

  useEffect(() => {
    if (!context.routerId || (!context.mac && !context.ip)) {
      let cancelled = false;
      axios
        .get(`${API}/public/hotspot-plans`, {
          params: context.routerId ? { router_id: context.routerId } : {},
        })
        .then(({ data }) => {
          if (cancelled) {return;}
          setPlans(Array.isArray(data.plans) ? data.plans : []);
          setRouterName(data.router?.name || "");
          setSelectedPlan(data.plans?.[0]?.id || "");
        })
        .catch(() => {if (!cancelled) {setPlans([]);}})
        .finally(() => {if (!cancelled) {setLoading(false);}});
      return () => {cancelled = true;};
    }
    let cancelled = false;
    axios
      .get(`${API}/captive-hotspot/plans`, {
        params: { router_id: context.routerId, mac: context.mac, ip: context.ip },
      })
      .then(({ data }) => {
        if (cancelled) return;
        setPlans(Array.isArray(data.plans) ? data.plans : []);
        setRouterName(data.router?.name || "");
        setActiveSession(data.activeSession || null);
        setPaymentsEnabled(data.paymentsEnabled !== false);
        if (data.mac) {setResolvedMac(data.mac);}
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
  }, [context.routerId, activeMac, preview]);

  const refreshPayment = async () => {
    if (!sessionToken) return;
    setChecking(true);
    try {
      const { data } = await axios.get(
        `${API}/captive-hotspot/sessions/${encodeURIComponent(sessionToken)}`,
        { params: { router_id: context.routerId, mac: activeMac } },
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
    if (preview) {
      setError("Preview only — connect to the hotspot Wi-Fi to buy a package.");
      return;
    }
    if (!paymentsEnabled) {
      setError("Payments are not enabled for this network yet. Contact the network operator.");
      return;
    }
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
        mac: activeMac,
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
  const brand = routerName || context.brand || "Wi-Fi access";
  const device = activeMac ? activeMac.toUpperCase().slice(-5) : "";
  const stage = paymentConfirmed
    ? payment.status === "payment_confirmed" ? 1 : 2
    : 0;
  const bestValueId = plans.length
    ? plans.reduce((best, plan) =>
        Number(plan.validity_days || 0) > Number(best.validity_days || 0) ? plan : best,
      ).id
    : "";

  if (loading) {
    return (
      <PortalShell brand={brand} device={device} theme={portalTheme} support={context.support} font={portalFont}>
        <div className="hp-center">
          <div className="hp-splash"><LoaderCircle className="h-5 w-5 animate-spin text-cyan-300" /> Finding your internet packages…</div>
        </div>
      </PortalShell>
    );
  }

  if (authorized) {
    return (
      <PortalShell brand={brand} device={device} theme={portalTheme} support={context.support} font={portalFont}>
        <StatusCard
          icon={<Wifi className="h-7 w-7" />}
          eyebrow="All set"
          title="You're connected"
        >
          <p>{payment.planName} · access until {formatExpiry(payment.expiresAt)}</p>
          <form action={payment.linkLoginOnly} method="post">
            <button type="submit" className="hp-btn">
              Connect to Wi-Fi <ArrowRight className="h-4 w-4" />
            </button>
            <input type="hidden" name="username" value={payment.username || ""} />
            <input type="hidden" name="password" value={payment.password || ""} />
            <input type="hidden" name="dst" value={payment.originalUrl || ""} />
          </form>
          <p style={{ marginTop: 14, fontSize: ".74rem", color: "#52607a" }}>
            If the sign-in page does not close, reconnect to this network and try again.
          </p>
        </StatusCard>
      </PortalShell>
    );
  }

  if (activeSession) {
    return (
      <PortalShell brand={brand} device={device} theme={portalTheme} support={context.support} font={portalFont}>
        <StatusCard
          icon={<CheckCircle2 className="h-7 w-7" />}
          eyebrow="Already active"
          title="Your access is ready"
        >
          <p>This device already has a paid package on this network. You can reconnect any time.</p>
          <div className="hp-status-meta">Access ends {formatExpiry(activeSession.expiresAt)}</div>
        </StatusCard>
      </PortalShell>
    );
  }

  if (error && plans.length === 0 && !payment) {
    return (
      <PortalShell brand={brand} device={device} theme={portalTheme} support={context.support} font={portalFont}>
        <StatusCard
          icon={<AlertTriangle className="h-7 w-7" />}
          tone="info"
          eyebrow="Connection"
          title="We couldn't load packages"
        >
          <p>{error}</p>
          <button type="button" className="hp-btn" onClick={() => window.location.reload()}>
            Try again <RefreshCw className="h-4 w-4" />
          </button>
        </StatusCard>
      </PortalShell>
    );
  }

  return (
    <PortalShell brand={brand} device={device} theme={portalTheme} support={context.support} font={portalFont}>
      <div className="hp-layout">
        <section className="hp-hero">
          <div className="hp-eyebrow"><Sparkles className="h-3.5 w-3.5" /> Fast · Simple · Secure</div>
          <h1 className="hp-title">Get online in <span className="hp-gradient-text">seconds.</span></h1>
          <p className="hp-sub">
            {context.welcome || "Pick a package that fits your day, approve the prompt on your phone, and you're browsing. No sign-up, no hassle."}
          </p>
          <div className="hp-steps">
            <div className="hp-step"><span className="hp-step-num">01</span> Choose an internet package below</div>
            <div className="hp-step"><span className="hp-step-num">02</span> Approve the M-Pesa prompt on your phone</div>
            <div className="hp-step"><span className="hp-step-num">03</span> Tap connect and start browsing</div>
          </div>
          <div className="hp-trust"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Secure payment · your device is identified by its Wi-Fi address</div>
        </section>

        <section className="hp-card">
          {preview && (
            <div className="mb-5 rounded-lg border border-blue-400/30 bg-blue-500/10 p-3 text-xs text-blue-300">
              Preview mode — connect to the Wi-Fi network to sign in and purchase a package.
            </div>
          )}
          {payment ? (
            <div>
              <div className="hp-ring"><Clock3 className="h-6 w-6" /></div>
              <div className="hp-brand-sub" style={{ marginTop: 18 }}>
                {paymentConfirmed ? "Almost there" : "Payment in progress"}
              </div>
              <h2 className="hp-card-title">
                {payment.status === "authorization_failed"
                  ? "Payment received"
                  : paymentConfirmed
                    ? "Preparing your access"
                    : "Approve on your phone"}
              </h2>
              <p className="hp-card-note" style={{ lineHeight: 1.6 }}>
                {payment.status === "authorization_failed"
                  ? payment.error || "Payment is confirmed, but the router could not be reached."
                  : paymentConfirmed
                    ? "We are activating your device on the network now."
                    : timedOut
                      ? "The prompt may have expired. Check the status or start a new payment."
                      : "Look for the M-Pesa message and enter your PIN to approve."}
              </p>
              <PaymentSteps stage={stage} />
              {payment.status === "authorization_failed" ? (
                <button type="button" className="hp-btn" onClick={retryAuthorization} disabled={checking}>
                  {checking ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Retry router authorization
                </button>
              ) : waitingForPayment || paymentConfirmed ? (
                <button
                  type="button"
                  className="hp-btn-ghost"
                  onClick={() => { setPollCount(0); refreshPayment(); }}
                  disabled={checking}
                >
                  {checking ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Check payment status
                </button>
              ) : null}
              {(payment.status === "failed" || payment.status === "payment_review" || error) && (
                <div className="hp-notice">
                  <AlertTriangle className="mb-1 h-4 w-4" />
                  {payment.status === "payment_review"
                    ? "The provider amount needs review. Do not pay again; contact the network operator."
                    : error || payment.error || "Payment was not completed. You can choose a package and try again."}
                </div>
              )}
              {(payment.status === "failed" || payment.status === "payment_review") && (
                <button type="button" className="hp-link" onClick={resetPayment}>Choose another package</button>
              )}
            </div>
          ) : (
            <form onSubmit={startPayment}>
              <div className="hp-brand-sub">Wi-Fi packages</div>
              <h2 className="hp-card-title">Choose your package</h2>
              <p className="hp-card-note">Pay only for the time you need.</p>
              {plans.length === 0 ? (
                <div className="hp-empty">No packages are available right now. Please contact the network operator.</div>
              ) : (
                <div className="hp-plans">
                  {plans.map((plan) => (
                    <label
                      key={plan.id}
                      className={`hp-plan ${selectedPlan === plan.id ? "is-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="hotspot-plan"
                        value={plan.id}
                        checked={selectedPlan === plan.id}
                        onChange={() => setSelectedPlan(plan.id)}
                        className="hp-plan-radio"
                      />
                      <span className="hp-plan-check"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
                      <span className="hp-plan-body">
                        <span className="hp-plan-name">
                          {plan.name}
                          {plan.id === bestValueId && plans.length > 1 && <span className="hp-badge">Best value</span>}
                        </span>
                        <span className="hp-plan-meta">
                          <span className="hp-tag"><Zap className="mr-1 inline h-3 w-3" />{plan.speed_up}/{plan.speed_down}</span>
                          {plan.quota_gb ? <span className="hp-tag">{plan.quota_gb} GB</span> : null}
                          <span className="hp-tag">{plan.validity_days} day{plan.validity_days === 1 ? "" : "s"}</span>
                        </span>
                      </span>
                      <span className="hp-plan-price">
                        <span className="hp-price">{formatPrice(plan.price)}</span>
                        <span className="hp-price-label">one-off</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <label className="hp-field" htmlFor="mpesa-phone">M-Pesa phone number</label>
              <div className="hp-input-wrap">
                <Smartphone className="h-4 w-4" />
                <input
                  id="mpesa-phone"
                  className="hp-input"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  required
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="07XX XXX XXX"
                />
              </div>
              <p className="hp-card-note" style={{ marginTop: 8 }}>We'll send the payment prompt to this number.</p>

              {portalTerms && (
                <label className="flex items-start gap-2 mt-4 text-xs text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(event) => setTermsAccepted(event.target.checked)}
                    className="mt-0.5 accent-cyan-300"
                    required
                  />
                  <span>{portalTerms}</span>
                </label>
              )}

              {error && (
                <div role="alert" className="hp-error">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {!preview && !paymentsEnabled && (
                <div role="alert" className="hp-notice">
                  <AlertTriangle className="mb-1 h-4 w-4" />
                  Payments are not enabled for this network yet. Contact the network operator.
                </div>
              )}
              <button
                type="submit"
                disabled={preview || !paymentsEnabled || submitting || plans.length === 0 || !selectedPlan || (Boolean(portalTerms) && !termsAccepted)}
                className="hp-btn"
              >
                {submitting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <><span>Pay with M-Pesa</span><ArrowRight className="h-4 w-4" /></>}
              </button>
              {sessionToken && (
                <button type="button" className="hp-link" onClick={refreshPayment}>Recover a pending payment</button>
              )}
            </form>
          )}
        </section>
      </div>
    </PortalShell>
  );
}
