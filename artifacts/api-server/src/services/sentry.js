/**
 * Sentry Error Tracking Configuration - Backend
 * Automatically captures and reports all errors to Sentry
 * @see https://docs.sentry.io/platforms/node/
 */

const Sentry = require('@sentry/node');
const logger = require('../utils/logger');

function getSentryIntegrations() {
  const integrations = [];

  if (typeof Sentry.requestDataIntegration === 'function') {
    integrations.push(Sentry.requestDataIntegration());
  }

  if (process.env.NODE_ENV !== 'test') {
    try {
      const { nodeProfilingIntegration } = require('@sentry/profiling-node');
      integrations.push(nodeProfilingIntegration());
    } catch (error) {
      logger.warn('Sentry profiling unavailable, continuing without profiling', {
        error: error.message,
      });
    }
  }

  return integrations;
}

// Initialize Sentry
function initSentry() {
  const SENTRY_DSN = process.env.SENTRY_DSN;
  const release = process.env.SENTRY_RELEASE || `mikrotik-billing@${process.env.npm_package_version || '2.0.0'}`;
  
  if (!SENTRY_DSN) {
    logger.warn('Sentry DSN not configured. Error tracking is disabled.');
    logger.warn('Get your DSN from: https://sentry.io/settings/[org]/projects/');
    return false;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release,
    
    // Performance monitoring - sample 20% of transactions
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    
    // Profile sample rate
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    integrations: getSentryIntegrations(),
    
    // Filter out sensitive data
    beforeSend(event, hint) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      
      // Remove sensitive data from request body
      if (event.request?.data) {
        const sensitive = ['password', 'password_hash', 'token', 'secret', 'credit_card'];
        sensitive.forEach(field => {
          if (event.request.data[field]) {
            event.request.data[field] = '[REDACTED]';
          }
        });
      }
      
      return event;
    },
    
    // Ignore certain errors
    ignoreErrors: [
      // Common noise
      'RandomError',
      'NonError',
      // Health checks (not actual errors)
      /health.*check/i,
      // Network noise
      /ECONNREFUSED.*127\.0\.0\.1:5432/, // PostgreSQL not available locally
    ],
  });

  logger.info('Sentry initialized', {
    environment: process.env.NODE_ENV,
    release,
  });

  return true;
}

// Express response handler (must be after all routes)
function sentryErrorHandler() {
  return function sentryErrorMiddleware(err, req, res, next) {
    // Manually capture the error
    Sentry.captureException(err, {
      extra: {
        request: {
          method: req.method,
          url: req.url,
          headers: req.headers,
        },
      },
    });
    
    // Pass to next error handler
    next(err);
  };
}

// Manual error capture helper
function captureError(error, context = {}) {
  Sentry.withScope((scope) => {
    // Add custom context
    scope.setExtras(context);
    
    // Capture the error
    const eventId = Sentry.captureException(error);
    
    logger.error('Error captured by Sentry', {
      eventId,
      error: error.message,
      ...context,
    });
    
    return eventId;
  });
}

// Capture message (for non-error events)
function captureMessage(message, context = {}) {
  Sentry.withScope((scope) => {
    scope.setExtras(context);
    const eventId = Sentry.captureMessage(message, 'warning');
    
    logger.warn('Message captured by Sentry', {
      eventId,
      message,
      ...context,
    });
    
    return eventId;
  });
}

// Set user context (call after authentication)
function setUser(user) {
  if (!user) {return;}
  
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.name || user.email,
    role: user.role,
    ip_address: '{{auto}}', // Auto-detect IP
  });
}

// Clear user context (call on logout)
function clearUser() {
  Sentry.setUser(null);
}

// Add breadcrumb (for tracking user actions)
function addBreadcrumb(message, category = 'default', level = 'info') {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    timestamp: Date.now() / 1000,
  });
}

module.exports = {
  initSentry,
  sentryErrorHandler,
  captureError,
  captureMessage,
  setUser,
  clearUser,
  addBreadcrumb,
  Sentry,
};
