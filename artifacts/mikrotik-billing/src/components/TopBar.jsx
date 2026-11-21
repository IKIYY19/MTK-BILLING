import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Bell,
  LogOut,
  Settings,
  User,
  ChevronDown,
  BookOpen,
  ChevronRight,
} from "lucide-react";
import { clearAuth } from "../lib/auth";
import { useTheme } from "../contexts/ThemeContext";
import { useBranding } from "../contexts/BrandingContext";
import { SearchButton } from "./GlobalSearch";

const routeLabels = {
  "/": "Dashboard",
  "/routers": "Routers",
  "/router-link": "Router Link",
  "/mikrotik-api": "MikroTik API",
  "/templates": "Templates",
  "/integrations": "Integrations",
  "/billing": "Billing Overview",
  "/billing-customers": "Customers",
  "/billing-plans": "Service Plans",
  "/billing-subscriptions": "Subscriptions",
  "/billing-invoices": "Invoices",
  "/billing-aging": "Aging Report",
  "/billing-payments": "Payments",
  "/billing-wallet": "Wallet",
  "/billing-reconcile": "Reconcile",
  "/billing-sms": "SMS",
  "/billing-messaging": "Messaging Center",
  "/billing-whatsapp": "WhatsApp",
  "/billing-map": "Network Map",
  "/billing-reports": "Financial Reports",
  "/billing-auto-suspend": "Auto-Suspend",
  "/billing-agents": "Agents",
  "/billing-backup": "Backups",
  "/billing-monitoring": "Monitoring",
  "/network-management": "Network Overview",
  "/network-dashboard": "Network Dashboard",
  "/monitoring": "Monitoring",
  "/alerts": "Alerts",
  "/topology": "Topology Builder",
  "/devices": "Devices",
  "/pppoe": "PPPoE",
  "/hotspot-management": "Hotspot",
  "/hotspot-vouchers": "Vouchers",
  "/hotspot-sessions": "Hotspot Sessions",
  "/captive-portal": "Captive Portal",
  "/ipam": "IPAM",
  "/olt": "OLT / Fiber",
  "/fup": "FUP Profiles",
  "/tr069": "TR-069 CPE",
  "/radius": "RADIUS",
  "/dns-adblock": "DNS Ad-Blocker",
  "/bandwidth": "Bandwidth",
  "/speedtest": "Speed Test",
  "/provision-logs": "Provision Logs",
  "/inventory": "Inventory",
  "/tickets": "Support Tickets",
  "/resellers": "Resellers",
  "/analytics": "Analytics",
  "/settings": "Settings",
  "/users": "User Management",
  "/audit-logs": "Audit Logs",
  "/webhooks": "Webhooks",
  "/tenant-branding": "Tenant Branding",
};

export function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const menuRef = useRef(null);
  const branding = useBranding();
  const { mode, setMode } = useTheme();

  useEffect(() => {
    try {
      const userData = localStorage.getItem("auth_user");
      if (userData) setUser(JSON.parse(userData));
    } catch (err) {
      console.error("Error parsing user data:", err);
    }
  }, []);

  // Fetch alerts/notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const API = import.meta.env.VITE_API_URL || "/api";
        const token = localStorage.getItem("auth_token");
        if (token) {
          const res = await fetch(`${API}/mikrotik/alerts/all?limit=5`, {
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => null);
          if (res?.ok) {
            const data = await res.json();
            const alerts = Array.isArray(data) ? data : data?.alerts || data?.items || [];
            if (alerts.length > 0) {
              const notifs = alerts.slice(0, 5).map((a) => ({
                id: a.id,
                title: a.alert_type || "Alert",
                message: a.message || a.title || "System alert",
                time: a.created_at ? new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
                severity: a.severity || "warning",
                type: a.connection_id ? "network" : "system",
              }));
              setNotifications(notifs);
              setUnreadCount(notifs.filter((n) => n.severity === "error" || n.severity === "critical").length);
            }
          }
        }
      } catch {
        // silently ignore
      }
    };
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleLogout = () => {
    setShowMenu(false);
    clearAuth();
    navigate("/login");
  };

  return (
    <header className="topbar">
      {/* Left: Brand + Search */}
      <div className="topbar-left">
        <button className="topbar-brand" onClick={() => navigate("/")}>
          {branding.company_logo ? (
            <img src={branding.company_logo} alt={branding.appName} className="topbar-brand-logo" />
          ) : (
            <Building2Icon />
          )}
          <span className="topbar-brand-name">{branding.appName || "ISP Platform"}</span>
        </button>

        <SearchButton onClick={() => {
          const event = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true });
          window.dispatchEvent(event);
        }} />

        <nav className="topbar-breadcrumb" aria-label="Breadcrumb">
          <button type="button" onClick={() => navigate("/")}>Home</button>
          <ChevronRight className="topbar-breadcrumb-sep" aria-hidden="true" />
          <span aria-current="page">
            {routeLabels[location.pathname] || location.pathname.replace(/^\//, "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || "Page"}
          </span>
        </nav>
      </div>

      {/* Right: Notifications, User */}
      <div className="topbar-right">
        {/* Notifications Bell */}
        <div className="topbar-item">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="topbar-icon-btn"
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell className="topbar-icon-bell" />
            {unreadCount > 0 && (
              <span className="topbar-notification-dot" aria-label={`${unreadCount} unread notifications`}>
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notification Dropdown */}
          {showNotifications && (
            <div className="topbar-notifications">
              <div className="topbar-notifications-header">
                <h3>Notifications</h3>
                {notifications.length > 0 && (
                  <button onClick={() => setNotifications([])} className="topbar-mark-read">Mark all read</button>
                )}
              </div>
              <div className="topbar-notifications-list">
                {notifications.length === 0 ? (
                  <div className="topbar-notifications-empty">
                    <Bell className="w-6 h-6 opacity-40" />
                    <p>No new notifications</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className={`topbar-notification-item ${n.severity === "error" || n.severity === "critical" ? "is-error" : ""}`}>
                      <div className={`topbar-notification-dot-icon`} data-severity={n.severity}>
                        {n.type === "network" ? <span>◑</span> : <User className="w-3 h-3" />}
                      </div>
                      <div className="topbar-notification-content">
                        <span className="topbar-notification-title">{n.title}</span>
                        <span className="topbar-notification-message">{n.message}</span>
                        {n.time && <span className="topbar-notification-time">{n.time}</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="topbar-item">
          <button
            ref={menuRef}
            onClick={() => setShowMenu(!showMenu)}
            className="topbar-user-btn"
          >
            <div className="topbar-user-avatar">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <span className="topbar-user-name">
              {user?.name || user?.email?.split("@")[0] || "User"}
            </span>
            <ChevronDown className={`topbar-user-chevron ${showMenu ? "rotated" : ""}`} />
          </button>

          {showMenu && (
            <div className="topbar-user-menu">
              <button onClick={() => { navigate("/settings"); setShowMenu(false); }} className="topbar-menu-item">
                <Settings className="w-4 h-4" /> Account Settings
              </button>
              <button onClick={() => setMode(mode === "dark" ? "light" : "dark")} className="topbar-menu-item">
                {mode === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
              </button>
              <button onClick={() => navigate("/help")} className="topbar-menu-item">
                <BookOpen className="w-4 h-4" /> Help & Support
              </button>
              <div className="topbar-menu-divider" />
              <button onClick={handleLogout} className="topbar-menu-item topbar-menu-item-danger">
                <LogOut className="w-4 h-4" /> Logout
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Click outside to close */}
      {showNotifications && (
        <div className="topbar-backdrop" onClick={() => setShowNotifications(false)} />
      )}
    </header>
  );
}

// Simple building icon
const Building2Icon = () => (
  <svg className="topbar-brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
    <line x1="8" y1="12" x2="16" y2="12" />
    <line x1="12" y1="8" x2="12" y2="16" />
  </svg>
);
