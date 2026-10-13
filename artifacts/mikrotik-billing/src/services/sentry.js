/**
 * Sentry Error Tracking Configuration - Frontend
 * Automatically captures and reports all errors to Sentry
 * @see https://docs.sentry.io/platforms/javascript/guides/react/
 */

import * as Sentry from '@sentry/react';

// Initialize Sentry
export function initSentry() {
  const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
  
  if (!SENTRY_DSN) {
    console.warn('Sentry DSN not configured. Frontend error tracking is disabled.');
    console.warn('Get your DSN from: https://sentry.io/settings/[org]/projects/');
    return null;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.VITE_NODE_ENV || 'production',
    release: `mikrotik-billing@${import.meta.env.VITE_APP_VERSION || '2.0.0'}`,
    
    // Performance monitoring
    tracesSampleRate: import.meta.env.VITE_NODE_ENV === 'production' ? 0.2 : 1.0,
    
    // Session replay (records user sessions for debugging)
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    
    // Set user context from localStorage
    initialScope: {
      user: getUserContext(),
    },
    
    // Ignore certain errors
    ignoreErrors: [
      // Common browser extensions errors
      /extensions\//i,
      /chrome-extension:\/\//i,
      // Third-party scripts
      /facebookexternalhit/i,
      // Network noise
      /Network Error/,
      /Failed to fetch/,
    ],
    
    // Filter out sensitive data
    beforeSend(event, hint) {
      // Remove sensitive data from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(crumb => {
          if (crumb.category === 'http') {
            // Remove authorization headers
            if (crumb.data?.headers?.Authorization) {
              crumb.data.headers.Authorization = '[REDACTED]';
            }
          }
          return crumb;
        });
      }
      
      return event;
    },
  });

  console.log('Sentry initialized for frontend error tracking');
  return Sentry;
}

// Get user context from localStorage
function getUserContext() {
  try {
    const authUser = localStorage.getItem('auth_user');
    if (authUser) {
      const user = JSON.parse(authUser);
      return {
        id: user.id,
        email: user.email,
        username: user.name || user.email,
      };
    }
  } catch (e) {
    // Ignore parse errors
  }
  return null;
}

// Sentry Error Boundary Component
// Wrap your app or individual components with this
export const SentryErrorBoundary = Sentry.ErrorBoundary;

// React Router Integration (tracks page views)
export function createSentryRouter(routes) {
  return Sentry.withSentryReactRouterV6Routing(routes);
}

// Manual error capture
export function captureError(error, context = {}) {
  Sentry.withScope((scope) => {
    scope.setExtras(context);
    const eventId = Sentry.captureException(error);
    console.error('Error captured by Sentry:', eventId, error.message);
    return eventId;
  });
}

// Capture message
export function captureMessage(message, context = {}) {
  Sentry.captureMessage(message, 'warning', context);
}

// Add breadcrumb (track user actions)
export function addBreadcrumb(message, category = 'default', level = 'info') {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    timestamp: new Date().toISOString(),
  });
}

// Set user context (call after login)
export function setUser(user) {
  if (!user) {return;}
  
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.name || user.email,
  });
}

// Clear user context (call on logout)
export function clearUser() {
  Sentry.setUser(null);
}

export default Sentry;
