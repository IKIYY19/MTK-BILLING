const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { loadEnv } = require("./config/loadEnv");
loadEnv();
const logger = require("./utils/logger");
const { validateSecrets } = require("./utils/security");
const { initSentry, sentryErrorHandler } = require("./services/sentry");
const helmet = require("helmet");
const { domainResolver } = require("./middleware/domainResolver");

const isTestEnv = process.env.NODE_ENV === "test";
const isProductionEnv = process.env.NODE_ENV === "production";

// Prevent crashes from unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Promise Rejection", {
    error: reason?.message || reason,
  });
  const Sentry = require("./services/sentry").Sentry;
  Sentry.captureException(reason, {
    tags: { type: "unhandledRejection" },
  });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", {
    error: error.message,
    stack: error.stack,
  });
  const Sentry = require("./services/sentry").Sentry;
  Sentry.captureException(error, {
    tags: { type: "uncaughtException" },
  });
});

// Graceful shutdown - these will be re-bound in startServer() once the server is created
let serverInstance = null;

async function shutdownGracefully(signal) {
  logger.info(`${signal} received: shutting down gracefully`);

  // Stop accepting new requests
  if (serverInstance) {
    serverInstance.close(() => {
      logger.info("HTTP server closed");
    });
  }

  // Disconnect database pool
  if (global.db && global.db.end) {
    try {
      await global.db.end();
      logger.info("Database pool disconnected");
    } catch (err) {
      logger.warn("Error disconnecting database", { error: err.message });
    }
  }

  // Give in-flight requests 3 seconds to finish, then exit
  setTimeout(() => {
    logger.info("Shutdown complete");
    process.exit(0);
  }, 3000);
}

process.on("SIGTERM", () => shutdownGracefully("SIGTERM"));
process.on("SIGINT", () => shutdownGracefully("SIGINT"));

// Try to use PostgreSQL, fall back to in-memory storage
let db;
let dbAvailable = false;
let billingRepo = null;
const defaultDevCorsOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
];

function parseAllowedOrigins(rawOrigins) {
  const values = (rawOrigins || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (values.length > 0) {
    return values;
  }

  if (process.env.COOLIFY_FQDN) {
    const fqdn = process.env.COOLIFY_FQDN;
    return [
      `https://${fqdn}`,
      `http://${fqdn}`,
      `https://*.${fqdn}`,
      `http://localhost:${process.env.PORT || 5000}`,
    ];
  }

  if (process.env.APP_URL) {
    try {
      const url = new URL(process.env.APP_URL);
      return [url.origin, `http://localhost:${process.env.PORT || 5000}`];
    } catch (e) {
      return [`http://localhost:${process.env.PORT || 5000}`];
    }
  }

  return isProductionEnv ? [] : defaultDevCorsOrigins;
}

function ensureCriticalProductionConfig() {
  if (!isProductionEnv) {
    return;
  }

  const missing = [];
  if (!process.env.JWT_SECRET) {missing.push("JWT_SECRET");}
  if (!process.env.ENCRYPTION_KEY) {missing.push("ENCRYPTION_KEY");}

  if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
    logger.warn(
      "DATABASE_URL or DB_HOST not set - using in-memory storage (not recommended for production)",
    );
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(", ")}`,
    );
  }
}

function createCorsOriginHandler() {
  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGIN);

  // Helper to match wildcards like https://*.bolt.app
  function matchesPattern(origin, pattern) {
    if (pattern === origin) return true;
    if (!pattern.includes('*')) return false;
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\./g, '\\.') + '$');
    return regex.test(origin);
  }

  return async (origin, callback) => {
    if (!origin) return callback(null, true);

    // In development, allow all origins (Replit preview, localhost, etc.)
    if (!isProductionEnv) return callback(null, true);

    // Static allowed origins (from env / config) with wildcard support
    if (allowedOrigins.length === 0 || allowedOrigins.some(pattern => matchesPattern(origin, pattern))) {
      return callback(null, true);
    }

    // Dynamic: allow custom tenant domains registered in the DB
    if (global.dbAvailable && global.db) {
      try {
        const hostname = new URL(origin).hostname.replace(/^www\./, "");
        const result = await global.db.query(
          "SELECT id FROM tenants WHERE LOWER(domain) = LOWER($1) AND is_active = true LIMIT 1",
          [hostname]
        );
        if (result.rows.length > 0) return callback(null, true);
      } catch { /* ignore */ }
    }

    return callback(new Error("Origin not allowed by CORS"));
  };
}

function applySecurityHeaders(req, res, next) {
  // These headers are set by helmet already, but we add extra ones
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  next();
}

async function initDB() {
  if (isTestEnv) {
    db = require("./db/memory");
    billingRepo = require("./db/billingStore");
    dbAvailable = false;
    logger.info("Using in-memory database in test environment");
    return false;
  }

  try {
    const pgDb = require("./db");
    await pgDb.query("SELECT 1");
    db = pgDb;
    dbAvailable = true;
    logger.info("Using PostgreSQL database");
    billingRepo = require("./db/billingRepository");
  } catch (err) {
    if (isProductionEnv) {
      logger.error("PostgreSQL connection failed — required for production", { error: err.message });
      throw err;
    }
    logger.warn("PostgreSQL connection failed — falling back to in-memory storage", { error: err.message });
    db = require("./db/memory");
    billingRepo = require("./db/billingStore");
    dbAvailable = false;
  }
  return true;
}

const app = express();
const PORT = process.env.PORT || 5000;
app.disable("x-powered-by");
app.set("trust proxy", isProductionEnv ? 1 : false);
app.set("query parser", "simple");
const monitoringApiEnabled = process.env.ENABLE_MONITORING_API !== "false";

// Domain resolver — runs first so custom ISP domains are identified
// before authentication middleware reads the JWT
app.use(domainResolver);

// HTTPS redirect (respects proxy headers from Render, Railway, etc.)
app.use((req, res, next) => {
  if (isProductionEnv && req.headers["x-forwarded-proto"] === "http") {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

// Middleware
app.use(
  cors({
    origin: createCorsOriginHandler(),
    credentials: true,
  }),
);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://fonts.googleapis.com", "https://maps.googleapis.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "blob:", "https://*.unsplash.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'", "wss:", "ws:", "https://mikrotik-billing-raiq.onrender.com"],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(applySecurityHeaders);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Apply general rate limiting to all API routes
const {
  trackUserActivity,
  startOnlineStatusUpdater,
} = require("./middleware/userActivity");
const {
  apiLimiter,
  authLimiter,
  paymentLimiter,
  messagingLimiter,
  mikrotikLimiter,
} = require("./middleware/rateLimiter");

// Health endpoint bypasses rate limiter (Render load balancer hits it frequently)
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    database: global.dbAvailable ? "connected" : "initializing",
    deployment: process.env.COOLIFY_FQDN ? "coolify" : (process.env.RENDER ? "render" : "self-hosted"),
  });
});

app.use("/api", apiLimiter);

// Track user activity on authenticated requests
app.use("/api", trackUserActivity);

// Start server
const startServer = async () => {
  try {
    if (!isTestEnv) {
      ensureCriticalProductionConfig();
      const secretsValid = validateSecrets();
      if (!secretsValid && isProductionEnv) {
        throw new Error(
          "Security validation failed: configure non-default JWT_SECRET and ENCRYPTION_KEY",
        );
      }
    }

    // Initialize Sentry as early as possible after env validation
    initSentry();
    // Initialize database FIRST
    await initDB();

    // Export for routes AFTER database is connected
    global.db = db;
    global.dbAvailable = dbAvailable;
    global.billingRepo = billingRepo;

    // Run database migrations automatically
    if (dbAvailable) {
      const { runMigrations } = require("./db/migrate");
      await runMigrations();
      logger.info("Database migrations done");
      require("./services/captiveHotspot").startExpiryWorker();
      db.query("SELECT 1")
        .then(() => logger.info("DB pool warmed"))
        .catch(() => {});
      // Run webhook migration
      require("./db/webhookMigrations")
        .run()
        .catch(() => {});
      // Run IPAM migration
      require("./db/ipamMigrations")
        .run()
        .catch(() => {});
    } else {
      logger.info("Skipping SQL migrations while running in memory mode");
    }

    // Bootstrap initial admin only when the user table is empty
    try {
      const bcrypt = require("bcryptjs");
      const { v4: uuidv4 } = require("uuid");
      const userCount = await db.query("SELECT COUNT(*) FROM users");
      if (parseInt(userCount.rows[0].count) === 0) {
        const configuredAdminEmail =
          process.env.INITIAL_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "";
        const configuredAdminPassword =
          process.env.INITIAL_ADMIN_PASSWORD ||
          process.env.ADMIN_PASSWORD ||
          "";

        if (isProductionEnv && (!configuredAdminEmail || !configuredAdminPassword)) {
          throw new Error(
            "INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD are required for a fresh production deployment",
          );
        }

        if (configuredAdminEmail && configuredAdminPassword) {
          const adminHash = await bcrypt.hash(configuredAdminPassword, 10);
          await db.query(
            `INSERT INTO users (id, email, password_hash, name, role, is_active, created_at)
             VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP)`,
            [uuidv4(), configuredAdminEmail, adminHash, "Administrator", "admin"],
          );
          logger.info("Initial admin created", {
            email: configuredAdminEmail,
            passwordConfigured: true,
          });
        } else {
          logger.warn(
            "Initial admin creation skipped; configure INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD",
          );
        }
      } else {
        const adminEmail =
          process.env.INITIAL_ADMIN_EMAIL ||
          process.env.ADMIN_EMAIL ||
          "";
        if (adminEmail) {
          const adminCheck = await db.query(
            "SELECT id, email, role FROM users WHERE email = $1",
            [adminEmail],
          );
          if (adminCheck.rows.length > 0 && adminCheck.rows[0].role !== "admin") {
            await db.query("UPDATE users SET role = $1 WHERE email = $2", [
              "admin",
              adminEmail,
            ]);
            logger.info('Fixed admin role to "admin"');
          }
        }
      }
    } catch (e) {
      if (isProductionEnv) {
        throw e;
      }
      logger.warn("Admin user creation/fix skipped", { error: e.message });
    }

    app.get("/api/live", (req, res) => {
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
      });
    });

    app.get("/api/ready", async (req, res) => {
      try {
        const ready = !isProductionEnv || dbAvailable;
        const payload = {
          status: ready ? "ok" : "degraded",
          timestamp: new Date().toISOString(),
          database: dbAvailable ? "connected" : "memory",
          environment: process.env.NODE_ENV || "development",
        };

        if (!ready) {
          return res.status(503).json(payload);
        }

        return res.json(payload);
      } catch (error) {
        logger.error("Readiness check failed", { error: error.message });
        return res
          .status(503)
          .json({ status: "error", message: "Service unavailable" });
      }
    });

    // Enhanced health check endpoint
    app.get("/api/health", async (req, res) => {
      try {
        const uptime = process.uptime();
        res.json({
          status: "ok",
          timestamp: new Date().toISOString(),
          database: dbAvailable ? "connected" : "memory",
          readiness: !isProductionEnv || dbAvailable ? "ready" : "degraded",
          uptime: Math.floor(uptime),
          version: process.env.npm_package_version || "2.0.0",
          environment: process.env.NODE_ENV || "development",
        });
      } catch (error) {
        logger.error("Health check failed", { error: error.message });
        res
          .status(503)
          .json({ status: "error", message: "Service unavailable" });
      }
    });

    // Public routes (no auth required)
    app.use("/api/auth", authLimiter, require("./routes/auth"));
    app.use("/mikrotik", mikrotikLimiter, require("./routes/provision"));
    app.use("/metrics", require("./routes/metrics"));
    app.use("/api/portal/auth", require("./routes/customerAuth"));
    app.use("/api/public", require("./routes/publicPortal"));
    app.use("/api/captive-hotspot", require("./routes/captiveHotspot"));
    app.use("/api/router", mikrotikLimiter, require("./routes/provision"));

    app.use("/hotspot", (req, res, next) => {
      const policy = res.getHeader("Content-Security-Policy");
      if (policy) {
        res.setHeader(
          "Content-Security-Policy",
          String(policy).replace(/form-action\s+[^;]+/, "form-action 'self' http:"),
        );
      }
      next();
    });

    // Serve static frontend files
    const possiblePaths = [
      path.join(__dirname, "..", "..", "client", "dist"),
      path.join(__dirname, "..", "client", "dist"),
      path.join(process.cwd(), "client", "dist"),
      path.join(process.cwd(), "public"),
    ];

    const frontendPath = possiblePaths.find((p) =>
      fs.existsSync(path.join(p, "index.html")),
    );

    if (frontendPath) {
      logger.info("Serving frontend", { path: frontendPath });
      app.use(express.static(frontendPath));
    } else if (!isProductionEnv) {
      app.get("/portal/*", (req, res) => {
        const frontendUrl =
          process.env.PUBLIC_APP_URL ||
          process.env.FRONTEND_URL ||
          `${req.protocol}://${req.hostname}:5173`;
        res.redirect(302, new URL(req.originalUrl, frontendUrl).toString());
      });
    } else {
      logger.warn("Frontend dist not found, skipping static file serving");
    }

    // Serve hosted captive portals (public, no auth required)
    const portalsDir = path.join(__dirname, "public", "portals");
    if (!fs.existsSync(portalsDir)) {
      fs.mkdirSync(portalsDir, { recursive: true });
    }
    app.use("/portals", express.static(portalsDir));
    app.use("/logos", express.static(path.join(__dirname, "public", "logos")));
    logger.info("Serving captive portals from", { path: portalsDir });

    // Tenant context middleware (resolves tenant_id from user)
    const { tenantContext } = require("./middleware/tenantContext");
    app.use("/api", tenantContext);

    // Protected routes (require authentication)
    // Each route has auth middleware applied individually
    const {
      authenticate,
      requirePermission,
      requireRole,
      ROLES,
    } = require("./middleware/auth");

    // Admin-only routes
    app.use(
      "/api/users",
      authenticate,
      requireRole(ROLES.ADMIN),
      require("./routes/users"),
    );

    // Role-protected routes - separate read and write permissions
    // Billing routes - read for GET, write for POST/PUT/DELETE
    app.use(
      "/api/billing",
      authenticate,
      requirePermission("billing:read"),
      require("./routes/billing"),
    );

    // Customer routes - check permissions per method
    const {
      authenticate: auth,
      requirePermission: perm,
    } = require("./middleware/auth");
    const billingRoutes = require("./routes/billing");
    const customerAliasRouter = express.Router();
    const resellerRoutes = require("./routes/resellers");
    const networkRoutes = require("./routes/network");

    customerAliasRouter.use((req, res, next) => {
      req.url = `/customers${req.url === "/" ? "" : req.url}`;
      next();
    });
    customerAliasRouter.use(billingRoutes);

    app.use(
      "/api/customers",
      auth,
      (req, res, next) => {
        const permission =
          req.method === "GET" ? "customers:read" : "customers:write";
        return perm(permission)(req, res, next);
      },
      customerAliasRouter,
    );

    const createPrefixedAliasRouter = (prefixResolver, targetRouter) => {
      const aliasRouter = express.Router();
      aliasRouter.use((req, res, next) => {
        const suffix = req.url === "/" ? "" : req.url;
        req.url = prefixResolver(suffix);
        next();
      });
      aliasRouter.use(targetRouter);
      return aliasRouter;
    };

    const requireNetworkPermission = (req, res, next) => {
      const permission =
        req.method === "GET" ? "network:read" : "network:write";
      return perm(permission)(req, res, next);
    };

    const networkAliasRouter = createPrefixedAliasRouter((suffix) => {
      if (suffix.startsWith("/pppoe/") || suffix.startsWith("/hotspot/")) {
        return suffix;
      }
      return `/network${suffix}`;
    }, networkRoutes);
    const pppoeAliasRouter = createPrefixedAliasRouter(
      (suffix) => `/pppoe${suffix}`,
      networkRoutes,
    );
    const hotspotAliasRouter = createPrefixedAliasRouter(
      (suffix) => suffix,
      networkRoutes,
    );
    const captivePortalAliasRouter = createPrefixedAliasRouter(
      (suffix) => `/captive-portals${suffix}`,
      resellerRoutes,
    );

    app.use(
      "/api/network",
      authenticate,
      requireNetworkPermission,
      networkAliasRouter,
    );
    app.use(
      "/api/pppoe",
      authenticate,
      requireNetworkPermission,
      pppoeAliasRouter,
    );
    app.use(
      "/api/hotspot",
      authenticate,
      requireNetworkPermission,
      hotspotAliasRouter,
    );
    app.use("/api/captive-portals", authenticate, captivePortalAliasRouter);

    // Standard authenticated routes
    app.use("/api/projects", authenticate, require("./routes/projects"));
    app.use("/api/modules", authenticate, require("./routes/modules"));
    app.use("/api/generator", authenticate, require("./routes/generator"));
    app.use("/api/templates", authenticate, require("./routes/templates"));
    app.use("/api/mikrotik", authenticate, require("./routes/mikrotik"));
    app.use(
      "/api/mikrotik-automation",
      authenticate,
      require("./routes/mikrotikAutomation"),
    );
    app.use("/api/devices", authenticate, require("./routes/devices"));
    app.use("/api/provisioning-queue", authenticate, require("./routes/provisioningQueue"));
    // Public C2B webhook endpoints — Safaricom sends no auth headers
    app.use("/api/payments/mpesa/c2b", require("./routes/mpesaC2BPublic"));
    const paymentsRoutes = require("./routes/payments");
    app.use(
      "/api/payments/mpesa/callback",
      paymentsRoutes.mpesaCallbackRouter,
    );
    app.use(
      "/api/payments",
      authenticate,
      paymentLimiter,
      paymentsRoutes,
    );
    app.use("/api/mpesa", authenticate, require("./routes/mpesaReconcile"));
    app.use(
      "/api/sms",
      authenticate,
      messagingLimiter,
      require("./routes/sms"),
    );
    app.use(
      "/api/email",
      authenticate,
      messagingLimiter,
      require("./routes/email"),
    );
    app.use(
      "/api/telegram",
      authenticate,
      messagingLimiter,
      require("./routes/telegram"),
    );
    app.use("/api/storage", authenticate, require("./routes/storage"));
    app.use("/api/features", authenticate, require("./routes/features"));
    const { verifyCustomerToken } = require("./routes/customerAuth");
    const customerPortalRouter = require("./routes/customerPortal");
    app.use("/api/portal", (req, res, next) => {
      const customerRoute = req.path.match(
        /^\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})(?:\/|$)/i,
      );

      if (!customerRoute) {
        return authenticate(req, res, next);
      }

      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : "";
      let customerIdentity;
      try {
        customerIdentity = verifyCustomerToken(token);
      } catch {
        return authenticate(req, res, next);
      }

      if (customerIdentity.customerId !== customerRoute[1]) {
        return res.status(403).json({ error: "Customer access denied" });
      }
      req.customerId = customerIdentity.customerId;
      next();
    }, customerPortalRouter);
    app.use("/api/advanced", authenticate, require("./routes/advanced"));
    app.use("/api/inventory", authenticate, require("./routes/inventory"));
    app.use("/api/analytics", authenticate, require("./routes/analytics"));
    app.use("/api/radius", authenticate, require("./routes/radius"));
    app.use("/api/tickets", authenticate, require("./routes/tickets"));
    app.use("/api/resellers", authenticate, resellerRoutes);
    app.use("/api/olt", authenticate, require("./routes/olt"));
    app.use(
      "/api/integrations",
      authenticate,
      require("./routes/integrations"),
    );
    app.use("/api/dashboard", authenticate, require("./routes/dashboard"));
    app.use("/api/settings", authenticate, require("./routes/settings"));
    app.use("/api/cgnat-tunnel", authenticate, require("./routes/cgnatTunnel"));
    app.use("/api/fup", authenticate, require("./routes/fup"));
    app.use("/api/sales", authenticate, require("./routes/sales"));
    app.use("/api/tr069", authenticate, require("./routes/tr069"));
    app.use("/api/speedtest", authenticate, require("./routes/speedtest"));
    if (monitoringApiEnabled) {
      app.use("/api/monitoring", authenticate, require("./routes/monitoring"));
    } else {
      logger.warn(
        "Monitoring API disabled (set ENABLE_MONITORING_API=true to enable)",
      );
    }

    // QoS routes
    app.use("/api/qos", authenticate, require("./routes/qos"));

    // Audit Log routes
    app.use("/api/audit", authenticate, require("./routes/audit"));

    // Tenant management routes
    app.use("/api/tenants", authenticate, require("./routes/tenants"));

    // Captive Portal routes
    app.use(
      "/api/captive-portal",
      authenticate,
      require("./routes/captivePortal"),
    );

    // IPAM routes
    app.use("/api/ipam", authenticate, require("./routes/ipam"));

    // Webhook routes
    app.use("/api/webhooks", authenticate, require("./routes/webhooks"));

    // Sentry error handler (MUST be before global error handler)
    app.use(sentryErrorHandler());

    // Global error handler
    app.use((err, req, res, next) => {
      logger.error("Unhandled error", {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
      });
      res.status(500).json({
        error:
          process.env.NODE_ENV === "production"
            ? "Internal server error"
            : err.message,
      });
    });

    // SPA catch-all route MUST be last - serves index.html for all non-API routes
    if (frontendPath) {
      app.get("*", (req, res) => {
        res.sendFile(path.join(frontendPath, "index.html"));
      });
    }

    if (!isTestEnv) {
      // Start cron jobs
      let cronStarted = false;

      // Start auto-suspend cron
      if (!cronStarted) {
        try {
          const { startCron } = require("./cron/autoSuspend");
          startCron();
          logger.info("Auto-suspend cron started");
          cronStarted = true;
        } catch (e) {
          logger.warn("Could not start auto-suspend cron", {
            error: e.message,
          });
        }
      }

      // Start payment reminders cron
      try {
        const {
          startCron: startPaymentReminders,
        } = require("./cron/paymentReminders");
        startPaymentReminders();
        logger.info("Payment reminders cron started");
      } catch (e) {
        logger.warn("Could not start payment reminders cron", {
          error: e.message,
        });
      }

      // Start metrics collection cron
      try {
        const {
          startCron: startMetricsCron,
        } = require("./cron/collectMetrics");
        startMetricsCron();
        logger.info("Metrics collection cron started");
      } catch (e) {
        logger.warn("Could not start metrics collection cron", {
          error: e.message,
        });
      }

      // Start usage alerts cron
      try {
        const { startCron: startUsageAlerts } = require("./cron/usageAlerts");
        startUsageAlerts();
        logger.info("Usage alerts cron started (every 1 hour)");
      } catch (e) {
        logger.warn("Could not start usage alerts cron", {
          error: e.message,
        });
      }

      serverInstance = app.listen(PORT, "0.0.0.0", async () => {
        logger.info("============================================");
        logger.info(" MikroTik Billing Platform");
        logger.info(` Version: ${process.env.npm_package_version || "1.0.0"}`);
        logger.info(` Port: ${PORT}`);
        logger.info(` Environment: ${process.env.NODE_ENV || "development"}`);
        logger.info(` Database: ${dbAvailable ? "PostgreSQL" : "In-Memory"}`);
        logger.info(` CORS: ${process.env.CORS_ORIGIN || (process.env.COOLIFY_FQDN ? `https://${process.env.COOLIFY_FQDN}` : "auto-detect")}`);
        logger.info(` Deployment: ${process.env.COOLIFY_FQDN ? "Coolify" : process.env.RENDER ? "Render" : process.env.DOCKER ? "Docker" : "Local"}`);
        logger.info("============================================");

        // Initialize WebSocket service for real-time monitoring
        const websocketService = require("./services/websocketService");
        websocketService.initialize(serverInstance);

        // Start user online status updater
        startOnlineStatusUpdater();

        // Initialize alert system for Telegram notifications
        try {
          const alertSystem = require("./services/alertSystem");
          alertSystem.init().catch((err) => {
            logger.warn("Could not initialize alert system", {
              error: err.message,
            });
          });
        } catch (error) {
          logger.warn("Could not initialize alert system", {
            error: error.message,
          });
        }

        // Initialize Slack notifier with stored webhook URL
        try {
          if (dbAvailable) {
            const result = await db.query(
              "SELECT value FROM settings WHERE key = $1",
              ["slack_webhook_url"],
            );
            const slackUrl = result.rows[0]?.value || "";
            if (slackUrl) {
              const slack = require("./services/slackNotifier");
              slack.configure(slackUrl);
              logger.info("Slack notifier configured from stored settings");
            }
          }
        } catch (error) {
          logger.warn("Could not configure Slack notifier from settings", {
            error: error.message,
          });
        }

        // Start TR-069 ACS service
        try {
          const tr069Service = require("./services/tr069Service");
          tr069Service.start().catch((err) => {
            logger.error("Failed to initialize TR-069 ACS service", {
              error: err.message,
            });
          });
        } catch (error) {
          logger.error("Failed to initialize TR-069 ACS service", {
            error: error.message,
          });
        }

        const enableRouterConnectivity =
          process.env.ENABLE_ROUTER_CONNECTIVITY !== "false";
        if (enableRouterConnectivity) {
          try {
            const routerConnectivityService = require("./services/routerConnectivity");
            routerConnectivityService.start();
            logger.info("Router connectivity service started");
          } catch (error) {
            logger.error("Failed to initialize router connectivity service", {
              error: error.message,
            });
          }
        } else {
          logger.warn(
            "Router connectivity service disabled (set ENABLE_ROUTER_CONNECTIVITY=true to enable)",
          );
        }

        logger.info(
          "WebSocket service initialized for real-time bandwidth monitoring",
        );
      });
    }
  } catch (error) {
    logger.error("Failed to start server", {
      error: error.message,
      stack: error.stack,
    });
    if (isTestEnv) {
      throw error;
    }
    process.exit(1);
  }
};

const ready = startServer();

module.exports = app;
module.exports.ready = ready;
