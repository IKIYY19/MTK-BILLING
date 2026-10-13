/**
 * Audit Logging System
 * Tracks critical actions across the platform without persisting credentials.
 */

const { v4: uuidv4 } = require("uuid");
const logger = require("./logger");

const SECRET_FIELD =
  /(password|passkey|pin|secret|token|authorization|cookie|credential|private[_-]?key|two[_-]?factor|otp)/i;

function sanitizeAuditData(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeAuditData);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SECRET_FIELD.test(key) ? "[REDACTED]" : sanitizeAuditData(entry),
    ]),
  );
}

function getMemoryStore() {
  return require("../db/memory")._getStore();
}

function getRoute(req) {
  return `${req.baseUrl || ""}${req.route?.path || req.path || ""}`;
}

async function logAudit({
  action,
  entityType,
  entityId,
  userId,
  userName,
  userRole,
  ipAddress,
  userAgent,
  details,
  before,
  after,
}) {
  const entry = {
    id: uuidv4(),
    action,
    entity_type: entityType,
    entity_id: entityId || null,
    user_id: userId || null,
    user_name: userName || "System",
    user_role: userRole || "system",
    ip_address: ipAddress || null,
    user_agent: userAgent || null,
    details: sanitizeAuditData(details || {}),
    before_data: before ? sanitizeAuditData(before) : null,
    after_data: after ? sanitizeAuditData(after) : null,
    created_at: new Date().toISOString(),
  };

  try {
    if (!global.dbAvailable || !global.db) {
      getMemoryStore().audit_logs.push(entry);
      return entry;
    }

    await global.db.query(
      `INSERT INTO audit_logs
       (id, action, entity_type, entity_id, user_id, user_name, user_role,
        ip_address, user_agent, details, before_data, after_data, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        entry.id,
        entry.action,
        entry.entity_type,
        entry.entity_id,
        entry.user_id,
        entry.user_name,
        entry.user_role,
        entry.ip_address,
        entry.user_agent,
        JSON.stringify(entry.details),
        entry.before_data ? JSON.stringify(entry.before_data) : null,
        entry.after_data ? JSON.stringify(entry.after_data) : null,
        entry.created_at,
      ],
    );
    logger.debug("Audit log created", {
      action: entry.action,
      entityType: entry.entity_type,
      entityId: entry.entity_id,
    });
    return entry;
  } catch (error) {
    logger.error("Audit log error", {
      error: error.message,
      action,
      entityType,
    });
    return null;
  }
}

function requestAuditMiddleware(category) {
  return (req, res, next) => {
    res.once("finish", () => {
      const failed = res.statusCode >= 400;
      const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
      const isAuthentication = category.includes("auth");

      if (category === "authentication") {
        if (req.path === "/login") {
          return;
        }
        if (req.path === "/heartbeat" && !failed) {
          return;
        }
        if (["/register", "/logout"].includes(req.path) && !failed) {
          return;
        }
        if (!failed && !isWrite) {
          return;
        }
      } else if (category === "payment") {
        if (!isWrite) {
          return;
        }
      } else if (isAuthentication) {
        if (!failed && !isWrite) {
          return;
        }
      } else {
        if (!isWrite || (!failed && global.dbAvailable)) {
          return;
        }
      }

      const actor = req.customer || req.user;
      const entityType = isAuthentication
        ? "authentication"
        : category === "payment"
          ? "payment"
          : "billing";
      const action = failed
        ? `${category.toUpperCase()}_REQUEST_FAILED`
        : `${category.toUpperCase()}_${req.method}`;

      logAudit({
        action,
        entityType,
        entityId: req.params?.id,
        userId: actor?.id,
        userName: actor?.name,
        userRole: actor?.role || (req.customer ? "customer" : undefined),
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers["user-agent"],
        details: {
          method: req.method,
          route: getRoute(req),
          statusCode: res.statusCode,
        },
      });
    });

    next();
  };
}

const auditMiddleware = (action, entityType) => (req, res, next) => {
  res.once("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return;
    }

    logAudit({
      action,
      entityType,
      entityId: req.params?.id || req.body?.id,
      userId: req.user?.id,
      userName: req.user?.name,
      userRole: req.user?.role,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers["user-agent"],
      details: {
        method: req.method,
        route: getRoute(req),
        statusCode: res.statusCode,
      },
      after: req.body,
    });
  });
  next();
};

const requestMetadata = (req) => ({
  ipAddress: req.ip || req.connection?.remoteAddress,
  userAgent: req.headers["user-agent"],
});

const audit = {
  userLogin: (user, req) =>
    logAudit({
      action: "USER_LOGIN",
      entityType: "user",
      entityId: user.id,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      ...requestMetadata(req),
    }),

  userLoginFailed: (identifier, req) =>
    logAudit({
      action: "USER_LOGIN_FAILED",
      entityType: "user",
      userName: identifier || "Unknown",
      userRole: "anonymous",
      ...requestMetadata(req),
      details: { reason: "Invalid credentials" },
    }),

  userLoginChallenge: (user, req) =>
    logAudit({
      action: "USER_LOGIN_2FA_REQUIRED",
      entityType: "user",
      entityId: user.id,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      ...requestMetadata(req),
    }),

  userLoginError: (req) =>
    logAudit({
      action: "USER_LOGIN_ERROR",
      entityType: "user",
      userName: req.body?.email || "Unknown",
      userRole: "anonymous",
      ...requestMetadata(req),
      details: { reason: "Authentication service error" },
    }),

  userLogout: (user, req) =>
    logAudit({
      action: "USER_LOGOUT",
      entityType: "user",
      entityId: user.id,
      userId: user.id,
      userName: user.name || user.email,
      userRole: user.role,
      ...requestMetadata(req),
    }),

  userCreated: (user, createdBy, req) =>
    logAudit({
      action: "USER_CREATED",
      entityType: "user",
      entityId: user.id,
      userId: createdBy.id === "system" ? null : createdBy.id,
      userName: createdBy.name,
      userRole: createdBy.role,
      ...requestMetadata(req),
      after: { email: user.email, role: user.role, name: user.name },
    }),

  userUpdated: (user, before, after, req) =>
    logAudit({
      action: "USER_UPDATED",
      entityType: "user",
      entityId: user.id,
      userId: req.user?.id,
      userName: req.user?.name,
      userRole: req.user?.role,
      ...requestMetadata(req),
      before,
      after,
    }),

  customerCreated: (customer, req) =>
    logAudit({
      action: "CUSTOMER_CREATED",
      entityType: "customer",
      entityId: customer.id,
      userId: req.user?.id,
      userName: req.user?.name,
      userRole: req.user?.role,
      ...requestMetadata(req),
      after: {
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
      },
    }),

  customerUpdated: (customerId, before, after, req) =>
    logAudit({
      action: "CUSTOMER_UPDATED",
      entityType: "customer",
      entityId: customerId,
      userId: req.user?.id,
      userName: req.user?.name,
      userRole: req.user?.role,
      ...requestMetadata(req),
      before,
      after,
    }),

  invoiceCreated: (invoice, req) =>
    logAudit({
      action: "INVOICE_CREATED",
      entityType: "invoice",
      entityId: invoice.id,
      userId: req.user?.id,
      userName: req.user?.name,
      userRole: req.user?.role,
      ...requestMetadata(req),
      after: { amount: invoice.amount, customerId: invoice.customer_id },
    }),

  paymentRecorded: (payment, req) =>
    logAudit({
      action: "PAYMENT_RECORDED",
      entityType: "payment",
      entityId: payment.id,
      userId: req.user?.id,
      userName: req.user?.name,
      userRole: req.user?.role,
      ...requestMetadata(req),
      after: { amount: payment.amount, method: payment.method },
    }),

  routerConnected: (router, req) =>
    logAudit({
      action: "ROUTER_CONNECTED",
      entityType: "router",
      entityId: router.id,
      userId: req.user?.id,
      userName: req.user?.name,
      userRole: req.user?.role,
      ...requestMetadata(req),
      details: { name: router.name, ip: router.ip_address },
    }),

  customerSuspended: (customerId, reason, req) =>
    logAudit({
      action: "CUSTOMER_SUSPENDED",
      entityType: "customer",
      entityId: customerId,
      userId: req.user?.id || null,
      userName: req.user?.name || "Auto-suspend",
      userRole: req.user?.role || "system",
      ...requestMetadata(req),
      details: { reason },
    }),

  customerRestored: (customerId, req) =>
    logAudit({
      action: "CUSTOMER_RESTORED",
      entityType: "customer",
      entityId: customerId,
      userId: req.user?.id,
      userName: req.user?.name,
      userRole: req.user?.role,
      ...requestMetadata(req),
    }),

  custom: (params) => logAudit(params),
  authRequestMiddleware: requestAuditMiddleware("authentication"),
  billingRequestMiddleware: requestAuditMiddleware("billing"),
  paymentRequestMiddleware: requestAuditMiddleware("payment"),
  customerPortalAuthMiddleware: requestAuditMiddleware("customer-portal-auth"),
};

module.exports = {
  logAudit,
  auditMiddleware,
  sanitizeAuditData,
  audit,
};
