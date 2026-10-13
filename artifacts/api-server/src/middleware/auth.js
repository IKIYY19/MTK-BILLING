/**
 * Authentication Middleware
 * Protects API routes with JWT authentication
 * Includes Role-Based Access Control (RBAC)
 */

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { generateSecret, isDefaultSecret } = require('../utils/security');
const isProductionEnv = process.env.NODE_ENV === 'production';

// JWT_SECRET must be set via environment variable - no fallback for security
let JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  if (isProductionEnv) {
    throw new Error('JWT_SECRET environment variable is required in production');
  }

  JWT_SECRET = generateSecret(64);
  process.env.JWT_SECRET = JWT_SECRET;
  logger.warn('JWT_SECRET not set; generated an ephemeral secret for non-production runtime');
}

if (isProductionEnv && isDefaultSecret(JWT_SECRET)) {
  throw new Error('JWT_SECRET cannot use a default or placeholder value in production');
}

if (JWT_SECRET.length < 32) {
  const message = 'JWT_SECRET must be at least 32 characters';
  if (isProductionEnv) {
    throw new Error(message);
  }
  logger.warn(`${message}; using weak secret only because NODE_ENV is not production`);
}

// Role hierarchy
const ROLES = {
  ADMIN: 'admin',
  STAFF: 'staff',
  TECHNICIAN: 'technician',
  RESELLER: 'reseller',
  CUSTOMER: 'customer',
};

// Permission matrix
const PERMISSIONS = {
  admin: ['*'], // all permissions
  staff: ['billing:read', 'billing:write', 'customers:read', 'customers:write', 'reports:read'],
  technician: ['network:read', 'network:write', 'monitoring:read', 'devices:read', 'devices:write'],
  reseller: ['customers:read', 'customers:write', 'billing:read', 'invoices:write'],
  customer: ['own:read', 'billing:read', 'tickets:write'],
};

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      logger.warn('Auth failed: No Bearer token in header', { ip: req.ip });
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, JWT_SECRET);

    // Attach user info to request
    req.user = decoded;
    logger.debug('Auth successful', { userId: decoded.id, email: decoded.email });
    next();
  } catch (error) {
    logger.warn('Token verification failed', { error: error.name, message: error.message });
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired, please login again' });
    }
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Optional auth - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    }
  } catch (error) {
    // Ignore errors - user will be treated as unauthenticated
  }
  next();
};

// Role-based authorization
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

// Middleware to check permissions
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userPerms = PERMISSIONS[req.user.role] || [];

    if (userPerms.includes('*') || userPerms.includes(permission)) {
      return next();
    }

    logger.warn('Permission denied', {
      userId: req.user.id,
      email: req.user.email,
      role: req.user.role,
      required: permission,
      has: userPerms,
    });
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
};

module.exports = {
  authenticate,
  optionalAuth,
  requireRole,
  requirePermission,
  ROLES,
  PERMISSIONS,
  JWT_SECRET,
};
