import React from 'react';
import { hasPermission, canAccessFeature, hasRole } from '../lib/permissions';

/**
 * Wrapper component to conditionally render children based on permissions
 */
export function PermissionWrapper({ permission, user, children, fallback = null }) {
  if (hasPermission(user, permission)) {
    return <>{children}</>;
  }
  return <>{fallback}</>;
}

/**
 * Wrapper component to conditionally render children based on feature access
 */
export function FeatureAccess({ feature, user, children, fallback = null }) {
  if (canAccessFeature(user, feature)) {
    return <>{children}</>;
  }
  return <>{fallback}</>;
}

/**
 * Wrapper component to conditionally render children based on role
 */
export function RoleWrapper({ roles, user, children, fallback = null }) {
  if (hasRole(user, ...roles)) {
    return <>{children}</>;
  }
  return <>{fallback}</>;
}

/**
 * Higher-order component to protect routes based on feature access
 */
export function withFeatureAccess(feature) {
  return function WrappedComponent(props) {
    const user = JSON.parse(localStorage.getItem('auth_user') || 'null');
    
    if (!canAccessFeature(user, feature)) {
      return (
        <div className="flex items-center justify-center h-screen bg-background">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>
            <p className="text-zinc-400">You don't have permission to access this page.</p>
          </div>
        </div>
      );
    }
    
    return <WrappedComponent {...props} />;
  };
}
