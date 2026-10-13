/**
 * Role-Based Access Control (RBAC) for Frontend
 * Mirrors backend permissions defined in server/src/middleware/auth.js
 */

import axios from "axios";

const API = import.meta.env.VITE_API_URL || "/api";

export const ROLES = {
  ADMIN: "admin",
  STAFF: "staff",
  TECHNICIAN: "technician",
  RESELLER: "reseller",
  CUSTOMER: "customer",
};

// Default permissions - used as fallback if backend fails
const DEFAULT_PERMISSIONS = {
  [ROLES.ADMIN]: ["*"],
  [ROLES.STAFF]: [
    "billing:read",
    "billing:write",
    "customers:read",
    "customers:write",
    "reports:read",
  ],
  [ROLES.TECHNICIAN]: [
    "network:read",
    "network:write",
    "monitoring:read",
    "devices:read",
    "devices:write",
  ],
  [ROLES.RESELLER]: [
    "customers:read",
    "customers:write",
    "billing:read",
    "invoices:write",
  ],
  [ROLES.CUSTOMER]: ["own:read", "billing:read", "tickets:write"],
};

// Default feature access - used as fallback
const DEFAULT_FEATURE_ACCESS = {
  [ROLES.ADMIN]: [
    "dashboard",
    "integrations",
    "settings",
    "billing",
    "customers",
    "plans",
    "subscriptions",
    "invoices",
    "payments",
    "wallet",
    "merge-customers",
    "mpesa-reconcile",
    "sms",
    "whatsapp",
    "network-map",
    "monitoring",
    "agents",
    "auto-suspend",
    "reports",
    "analytics",
    "pppoe",
    "hotspot",
    "vouchers",
    "network-services",
    "ipam",
    "olt",
    "radius",
    "tickets",
    "captive-portal",
    "bandwidth",
    "resellers",
    "backups",
    "inventory",
    "users",
    "audit-logs",
  ],
  [ROLES.STAFF]: [
    "dashboard",
    "billing",
    "customers",
    "plans",
    "subscriptions",
    "invoices",
    "payments",
    "wallet",
    "mpesa-reconcile",
    "sms",
    "whatsapp",
    "network-map",
    "monitoring",
    "reports",
    "analytics",
    "pppoe",
    "hotspot",
    "vouchers",
    "tickets",
  ],
  [ROLES.TECHNICIAN]: [
    "dashboard",
    "monitoring",
    "bandwidth",
  ],
  [ROLES.RESELLER]: [
    "dashboard",
    "billing",
    "customers",
    "plans",
    "subscriptions",
    "invoices",
    "payments",
    "wallet",
  ],
  [ROLES.CUSTOMER]: [],
};

// Cached permissions from backend
const cachedPermissions = null;
let cachedFeatureAccess = null;

/**
 * Fetch permissions from backend
 */
export async function fetchPermissions() {
  try {
    const { data } = await axios.get(`${API}/settings/permissions`);
    cachedFeatureAccess = data;
    return data;
  } catch (error) {
    console.error("Failed to fetch permissions:", error);
    return DEFAULT_FEATURE_ACCESS;
  }
}

/**
 * Get permissions (from cache or fetch)
 */
export async function getPermissions() {
  if (!cachedFeatureAccess) {
    await fetchPermissions();
  }
  return cachedFeatureAccess || DEFAULT_FEATURE_ACCESS;
}

/**
 * Check if user has a specific permission
 */
export function hasPermission(user, permission) {
  if (!user) {return false;}
  if (user.role === ROLES.ADMIN) {return true;}

  const userPerms = DEFAULT_PERMISSIONS[user.role] || [];
  return userPerms.includes("*") || userPerms.includes(permission);
}

/**
 * Check if user can access a specific feature/page
 */
export function canAccessFeature(user, feature) {
  if (!user) {return false;}
  if (user.role === ROLES.ADMIN) {return true;}

  // Use cached permissions if available, otherwise use defaults
  const features =
    cachedFeatureAccess?.[user.role] || DEFAULT_FEATURE_ACCESS[user.role] || [];
  return features.includes(feature);
}

/**
 * Check if user has any of the specified roles
 */
export function hasRole(user, ...roles) {
  if (!user) {return false;}
  return roles.includes(user.role);
}

/**
 * Get user's role hierarchy level (higher = more access)
 */
export function getRoleLevel(role) {
  const levels = {
    [ROLES.ADMIN]: 5,
    [ROLES.STAFF]: 4,
    [ROLES.TECHNICIAN]: 3,
    [ROLES.RESELLER]: 2,
    [ROLES.CUSTOMER]: 1,
  };
  return levels[role] || 0;
}

/**
 * Check if user has higher or equal role level
 */
export function hasRoleLevel(user, minRole) {
  if (!user) {return false;}
  return getRoleLevel(user.role) >= getRoleLevel(minRole);
}

// Export defaults for SettingsPage
export const PERMISSIONS = DEFAULT_PERMISSIONS;
export const FEATURE_ACCESS = DEFAULT_FEATURE_ACCESS;
