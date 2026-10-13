import React, { useState, useEffect, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { BrandingProvider } from "./contexts/BrandingContext";
import { Routes, Route, Navigate } from "react-router-dom";
import { Menu } from "lucide-react";
import axios from "axios";
import { Sidebar } from "./components/Sidebar";
import { Toast } from "./components/Toast";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { GlobalSearch } from "./components/GlobalSearch";
import { getToken } from "./lib/auth";

// Page Loader Spinner Component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-white">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 border-4 border-zinc-800 border-t-indigo-500 rounded-full animate-spin"></div>
      <p className="text-zinc-400 text-sm font-medium">Loading...</p>
    </div>
  </div>
);

// Lazy Loaded Routes
const LoginPage = lazy(() => import("./pages/LoginPage"));
const SetupWizard = lazy(() => import("./pages/SetupWizard"));
const CustomerPortalLogin = lazy(() => import("./pages/CustomerPortalLogin"));
const CaptiveHotspotPage = lazy(() => import("./pages/public/CaptiveHotspotPage"));
const CustomerPortalTokenLogin = lazy(() => import("./pages/CustomerPortalLogin").then(m => ({ default: m.CustomerPortalTokenLogin })));
const MergeCustomers = lazy(() => import("./pages/MergeCustomers"));
const MessagingPage = lazy(() => import("./pages/billing/MessagingPage"));
const IntegrationsSettings = lazy(() => import("./pages/IntegrationsSettings"));
const RoutersPage = lazy(() => import("./pages/RoutersPage"));
const RouterLink = lazy(() => import("./pages/RouterLink"));
const TenantSettingsPage = lazy(() => import("./pages/TenantSettingsPage"));
const WebhooksPage = lazy(() => import("./pages/WebhooksPage"));
const IPAMPage = lazy(() => import("./pages/IPAMPage"));

const Dashboard = lazy(() => import("./pages/Dashboard").then(m => ({ default: m.Dashboard })));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail").then(m => ({ default: m.ProjectDetail })));
const ScriptOutput = lazy(() => import("./pages/ScriptOutput").then(m => ({ default: m.ScriptOutput })));
const BillingDashboard = lazy(() => import("./pages/billing/BillingDashboard").then(m => ({ default: m.BillingDashboard })));
const BillingCustomers = lazy(() => import("./pages/billing/BillingCustomers").then(m => ({ default: m.BillingCustomers })));
const BillingPlans = lazy(() => import("./pages/billing/BillingPlans").then(m => ({ default: m.BillingPlans })));
const BillingSubscriptions = lazy(() => import("./pages/billing/BillingSubscriptions").then(m => ({ default: m.BillingSubscriptions })));
const BillingReconcile = lazy(() => import("./pages/billing/BillingReconcile").then(m => ({ default: m.BillingReconcile })));
const BillingInvoices = lazy(() => import("./pages/billing/BillingInvoices").then(m => ({ default: m.BillingInvoices })));
const BillingPayments = lazy(() => import("./pages/billing/BillingPayments").then(m => ({ default: m.BillingPayments })));
const BillingCustomerDetail = lazy(() => import("./pages/billing/BillingCustomerDetail").then(m => ({ default: m.BillingCustomerDetail })));
const PaymentPage = lazy(() => import("./pages/billing/PaymentPage").then(m => ({ default: m.PaymentPage })));
const SMSPage = lazy(() => import("./pages/billing/SMSPage").then(m => ({ default: m.SMSPage })));
const MonitoringDashboard = lazy(() => import("./pages/billing/MonitoringDashboard").then(m => ({ default: m.MonitoringDashboard })));
const AgentResellerPage = lazy(() => import("./pages/billing/AgentResellerPage").then(m => ({ default: m.AgentResellerPage })));
const AutoSuspendPage = lazy(() => import("./pages/billing/AutoSuspendPage").then(m => ({ default: m.AutoSuspendPage })));
const CustomerPortal = lazy(() => import("./pages/billing/EnhancedCustomerPortal").then(m => ({ default: m.CustomerPortal })));
const ReviewsManagement = lazy(() => import("./pages/billing/ReviewsManagement").then(m => ({ default: m.ReviewsManagement })));
const FinancialReports = lazy(() => import("./pages/billing/FinancialReports").then(m => ({ default: m.FinancialReports })));
const AgingReport = lazy(() => import("./pages/billing/AgingReport").then(m => ({ default: m.AgingReport })));
const WhatsAppPage = lazy(() => import("./pages/billing/WhatsAppPage").then(m => ({ default: m.WhatsAppPage })));
const MapView = lazy(() => import("./pages/billing/MapView").then(m => ({ default: m.MapView })));
const WalletPage = lazy(() => import("./pages/billing/WalletPage").then(m => ({ default: m.WalletPage })));
const MpesaReconcile = lazy(() => import("./pages/MpesaReconcile").then(m => ({ default: m.MpesaReconcile })));
const BackupPage = lazy(() => import("./pages/billing/BackupPage").then(m => ({ default: m.BackupPage })));
const CreditNotes = lazy(() => import("./pages/billing/CreditNotes"));
const InventoryPage = lazy(() => import("./pages/billing/InventoryPage").then(m => ({ default: m.InventoryPage })));
const AnalyticsReports = lazy(() => import("./pages/billing/AnalyticsReports").then(m => ({ default: m.AnalyticsReports })));
const SalesPage = lazy(() => import("./pages/billing/SalesPage"));
const PPPoEManagement = lazy(() => import("./pages/billing/PPPoEManagement").then(m => ({ default: m.PPPoEManagement })));
const HotspotManagement = lazy(() => import("./pages/billing/HotspotManagement").then(m => ({ default: m.HotspotManagement })));
const HotspotVouchers = lazy(() => import("./pages/billing/HotspotVouchers").then(m => ({ default: m.HotspotVouchers })));
const NetworkServices = lazy(() => import("./pages/billing/NetworkServices").then(m => ({ default: m.NetworkServices })));
const NetworkManagement = lazy(() => import("./pages/billing/NetworkManagement").then(m => ({ default: m.NetworkManagement })));
const RadiusManagement = lazy(() => import("./pages/billing/RadiusManagement").then(m => ({ default: m.RadiusManagement })));
const RadiusImport = lazy(() => import("./pages/RadiusImport").then(m => ({ default: m.RadiusImport })));
const TicketSystem = lazy(() => import("./pages/billing/TicketSystem").then(m => ({ default: m.TicketSystem })));
const CaptivePortalBuilder = lazy(() => import("./pages/billing/CaptivePortalBuilder"));
const BandwidthGraphs = lazy(() => import("./pages/billing/BandwidthGraphs").then(m => ({ default: m.BandwidthGraphs })));
const ResellerPortal = lazy(() => import("./pages/billing/ResellerPortal").then(m => ({ default: m.ResellerPortal })));
const OLTManagement = lazy(() => import("./pages/billing/OLTManagement").then(m => ({ default: m.OLTManagement })));
const UserManagement = lazy(() => import("./pages/UserManagement").then(m => ({ default: m.UserManagement })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const AuditLogs = lazy(() => import("./pages/AuditLogs").then(m => ({ default: m.AuditLogs })));
const FUPProfiles = lazy(() => import("./pages/network/FUPProfiles").then(m => ({ default: m.FUPProfiles })));
const TR069Devices = lazy(() => import("./pages/network/TR069Devices").then(m => ({ default: m.TR069Devices })));
const SpeedTest = lazy(() => import("./pages/network/SpeedTest").then(m => ({ default: m.SpeedTest })));
const NetworkManagementDashboard = lazy(() => import("./pages/network/NetworkManagementDashboard").then(m => ({ default: m.NetworkManagementDashboard })));

const SignupPage = lazy(() => import("./pages/public/SignupPage").then(m => ({ default: m.SignupPage })));
const PlansPage = lazy(() => import("./pages/public/PlansPage").then(m => ({ default: m.PlansPage })));
const CheckoutPage = lazy(() => import("./pages/public/CheckoutPage").then(m => ({ default: m.CheckoutPage })));
const WelcomePage = lazy(() => import("./pages/public/WelcomePage").then(m => ({ default: m.WelcomePage })));

function App() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.dir = i18n.language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  // Clear chunk load reload flag on successful mount
  useEffect(() => {
    try {
      sessionStorage.removeItem('chunk-load-reload-attempted');
    } catch (e) {
      // Ignore session storage access errors
    }
  }, []);

  // Heartbeat to keep user online status updated
  useEffect(() => {
    const token = getToken();
    if (!token) {
      return;
    }

    const sendHeartbeat = async () => {
      try {
        const API = import.meta.env.VITE_API_URL || "/api";
        await axios.post(
          `${API}/auth/heartbeat`,
          {},
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
      } catch (e) {
        // Silently fail - don't spam errors
      }
    };

    // Send heartbeat every 30 seconds
    const interval = setInterval(sendHeartbeat, 30000);

    // Send initial heartbeat
    sendHeartbeat();

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <BrandingProvider>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public route */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<SetupWizard />} />

          {/* Customer portal - public (different UI) */}
          <Route path="/portal/login" element={<CustomerPortalLogin />} />
          <Route path="/hotspot" element={<CaptiveHotspotPage />} />
          <Route path="/portal/token/:token" element={<CustomerPortalTokenLogin />} />
          <Route path="/portal/:customerId" element={<CustomerPortal />} />
          <Route path="/pay/:invoiceId" element={<PaymentPage />} />

          {/* Self-provisioning portal */}
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/checkout/:invoiceId" element={<CheckoutPage />} />
          <Route path="/welcome" element={<WelcomePage />} />

          {/* Protected routes - require authentication */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <div className="app-frame flex h-screen bg-background overflow-hidden">
                  {/* Mobile overlay */}
                  {mobileMenuOpen && (
                    <button
                      type="button"
                      aria-label="Close navigation menu"
                      className="fixed inset-0 z-20 border-0 bg-black/60 p-0 lg:hidden"
                      onClick={() => setMobileMenuOpen(false)}
                    />
                  )}

                  {/* Sidebar */}
                  <div
                    id="primary-navigation-panel"
                    className={`
                      fixed lg:static inset-y-0 left-0 z-30 h-full
                      transform transition-transform duration-300
                      ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
                      lg:translate-x-0
                    `}
                  >
                    <Sidebar
                      onSearchOpen={() => setSearchOpen(true)}
                      onCloseMobile={() => setMobileMenuOpen(false)}
                    />
                  </div>

                  {/* Main content */}
                  <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    {/* Mobile header bar */}
                    <div className="app-mobile-header lg:hidden flex items-center justify-between p-4">
                      <button
                        type="button"
                        onClick={() => setMobileMenuOpen(true)}
                        className="app-mobile-menu-button p-3 -m-1"
                        aria-label="Open navigation menu"
                        aria-expanded={mobileMenuOpen}
                        aria-controls="primary-navigation-panel"
                      >
                        <Menu className="w-5 h-5" />
                      </button>
                      <span className="text-sm font-semibold">
                        MikroTik Billing
                      </span>
                      <div className="w-11" aria-hidden="true" />
                    </div>
                    <Suspense fallback={<PageLoader />}>
                      <div className="app-main flex-1 overflow-y-auto">
                      <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/project/:id" element={<ProjectDetail />} />
                        <Route path="/output" element={<ScriptOutput />} />

                        {/* Billing */}
                        <Route path="/billing" element={<BillingDashboard />} />
                        <Route
                          path="/billing-customers"
                          element={<BillingCustomers />}
                        />
                        <Route
                          path="/billing-customers/:id"
                          element={<BillingCustomerDetail />}
                        />
                        <Route path="/billing-plans" element={<BillingPlans />} />
                        <Route
                          path="/billing-subscriptions"
                          element={<BillingSubscriptions />}
                        />
                        <Route
                          path="/billing-reconcile"
                          element={<BillingReconcile />}
                        />
                        <Route
                          path="/billing-invoices"
                          element={<BillingInvoices />}
                        />
                        <Route
                          path="/billing-aging"
                          element={<AgingReport />}
                        />
                        <Route
                          path="/billing-payments"
                          element={<BillingPayments />}
                        />
                        <Route path="/billing-sms" element={<SMSPage />} />
                        <Route path="/billing-whatsapp" element={<WhatsAppPage />} />
                        <Route path="/billing-messaging" element={<MessagingPage />} />
                        <Route path="/billing-map" element={<MapView />} />
                        <Route path="/billing-wallet" element={<WalletPage />} />
                        <Route
                          path="/merge-customers"
                          element={<MergeCustomers />}
                        />
                        <Route
                          path="/mpesa-reconcile"
                          element={
                            <ProtectedRoute feature="mpesa-reconcile">
                              <MpesaReconcile />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="/billing-monitoring"
                          element={<MonitoringDashboard />}
                        />
                        <Route
                          path="/billing-agents"
                          element={<AgentResellerPage />}
                        />
                        <Route
                          path="/billing-auto-suspend"
                          element={<AutoSuspendPage />}
                        />
                        <Route
                          path="/billing-reviews"
                          element={<ReviewsManagement />}
                        />
                        <Route
                          path="/billing-reports"
                          element={<FinancialReports />}
                        />
                        <Route path="/billing-backup" element={<BackupPage />} />
                        <Route path="/credit-notes" element={<CreditNotes />} />
                        <Route path="/inventory" element={<InventoryPage />} />
                        <Route path="/analytics" element={<AnalyticsReports />} />
                        <Route path="/billing-sales" element={<SalesPage />} />
                        <Route path="/pppoe" element={<PPPoEManagement />} />
                        <Route path="/hotspot-management" element={<HotspotManagement />} />
                        <Route
                          path="/hotspot-vouchers"
                          element={<HotspotVouchers />}
                        />
                        <Route
                          path="/network-services"
                          element={<NetworkServices />}
                        />
                        <Route path="/network-management" element={<NetworkManagement />} />
                        <Route path="/olt" element={<OLTManagement />} />
                        <Route path="/fup" element={<FUPProfiles />} />
                        <Route path="/tr069" element={<TR069Devices />} />
                        <Route path="/speedtest" element={<SpeedTest />} />
                        <Route path="/ipam" element={<IPAMPage />} />
                        <Route path="/network-dashboard" element={<NetworkManagementDashboard />} />
                        <Route path="/billing-monitoring" element={<MonitoringDashboard />} />
                        <Route path="/radius" element={<RadiusManagement />} />
                        <Route path="/radius-import" element={<RadiusImport />} />
                        <Route path="/tickets" element={<TicketSystem />} />
                        <Route
                          path="/captive-portal"
                          element={<CaptivePortalBuilder />}
                        />
                        <Route path="/bandwidth" element={<BandwidthGraphs />} />
                        <Route path="/resellers" element={<ResellerPortal />} />
                        <Route
                          path="/users"
                          element={
                            <ProtectedRoute feature="users">
                              <UserManagement />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="/integrations"
                          element={<IntegrationsSettings />}
                        />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/routers" element={<RoutersPage />} />
                        <Route path="/router-link" element={<RouterLink />} />
                        <Route path="/tenant-branding" element={<TenantSettingsPage />} />
                        <Route path="/audit-logs" element={<AuditLogs />} />
                        <Route path="/webhooks" element={<WebhooksPage />} />

                        {/* Fallback */}
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                      </div>
                    </Suspense>
                  </main>
                  <Toast />
                </div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
      <GlobalSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </BrandingProvider>
  );
}

export default App;
