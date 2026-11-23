const fs = require("fs");
const logger = require("../utils/logger");

const DEFAULT_DEDUPE_MS = 15 * 60 * 1000;

class OpsAlertService {
  constructor() {
    this.timer = null;
    this.recent = new Map();
    this.failedLogins = new Map();
    this.portalFailedLogins = new Map();
  }

  start() {
    if (this.timer) {return;}
    this.timer = setInterval(() => {
      this.runHealthChecks().catch((error) => {
        logger.warn("Ops health check failed", { error: error.message });
      });
    }, 5 * 60 * 1000);
    logger.info("Operations alert service started");
    this.runHealthChecks().catch(() => {});
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async send(title, message, severity = "warning", key = "", alertType = "ops_alert") {
    const now = Date.now();
    const dedupeKey = key || `${alertType}:${title}`;
    const last = this.recent.get(dedupeKey);
    if (last && now - last < DEFAULT_DEDUPE_MS) {return;}
    this.recent.set(dedupeKey, now);

    try {
      const db = global.dbAvailable ? global.db : require("../db/memory");
      await db.query(
        `INSERT INTO alerts (id, connection_id, alert_type, severity, title, message, status, created_at)
         VALUES ($1, NULL, $2, $3, $4, $5, 'open', $6)`,
        [require("uuid").v4(), alertType, severity, title, message, new Date().toISOString()],
      );
    } catch (error) {
      logger.warn("Could not persist ops alert", { error: error.message });
    }

    try {
      const notifier = require("./routerAlertNotifier");
      await notifier.send(
        { id: null, name: "Billing System", ip_address: "" },
        alertType,
        severity,
        title,
        message,
      );
    } catch (error) {
      logger.warn("Could not deliver ops alert", { error: error.message });
    }
  }

  clientIp(req) {
    return String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  }

  async recordLogin(req, email) {
    const ip = this.clientIp(req);
    try {
      const db = global.dbAvailable ? global.db : require("../db/memory");
      const result = await db.query("SELECT value FROM settings WHERE key = $1", ["ops_known_admin_ips"]);
      let known = [];
      try {known = JSON.parse(result.rows[0]?.value || "[]");} catch {known = [];}
      if (!known.includes(ip)) {
        known.push(ip);
        await db.query(
          `INSERT INTO settings (key, value) VALUES ('ops_known_admin_ips', $1)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [JSON.stringify(known.slice(-50))],
        );
        await this.send(
          "New admin login location",
          `${email || "Admin"} signed in from a new IP: ${ip}`,
          "info",
          `login-ip:${ip}`,
          "security_alert",
        );
      }
      this.failedLogins.delete(ip);
    } catch (error) {
      logger.warn("Could not record admin login", { error: error.message });
    }
  }

  recordFailedLogin(req, email) {
    const ip = this.clientIp(req);
    const entry = this.failedLogins.get(ip) || { count: 0, since: Date.now() };
    if (Date.now() - entry.since > 5 * 60 * 1000) {
      entry.count = 0;
      entry.since = Date.now();
    }
    entry.count++;
    this.failedLogins.set(ip, entry);
    if (entry.count >= 5) {
      this.send(
        "Failed login burst",
        `${entry.count} failed admin login attempts from ${ip}${email ? ` (${email})` : ""} in 5 minutes.`,
        "critical",
        `login-burst:${ip}`,
        "security_alert",
      );
    }
  }

  async recordRoleChange(req, username, fromRole, toRole) {
    await this.send(
      "User role changed",
      `${username} changed from ${fromRole} to ${toRole} by ${req.user?.email || "admin"} (${this.clientIp(req)}).`,
      "warning",
      `role:${username}:${fromRole}:${toRole}`,
      "security_alert",
    );
  }

  async recordPermissionChange(req) {
    await this.send(
      "Role permissions changed",
      `Feature permissions were updated by ${req.user?.email || "admin"} (${this.clientIp(req)}).`,
      "warning",
      "permissions-change",
      "security_alert",
    );
  }

  recordPortalLoginFailure(req, identity) {
    const ip = this.clientIp(req);
    const key = `${ip}:${identity || ""}`;
    const entry = this.portalFailedLogins.get(key) || { count: 0, since: Date.now() };
    if (Date.now() - entry.since > 5 * 60 * 1000) {
      entry.count = 0;
      entry.since = Date.now();
    }
    entry.count++;
    this.portalFailedLogins.set(key, entry);
    if (entry.count >= 5) {
      this.send(
        "Customer portal login failures",
        `${entry.count} failed portal login attempts for ${identity || "unknown"} from ${ip} in 5 minutes.`,
        "critical",
        `portal-login-burst:${key}`,
        "security_alert",
      );
    }
  }

  async recordAdmin2FA(req, enabled) {
    await this.send(
      enabled ? "Admin 2FA enabled" : "Admin 2FA disabled",
      `${req.user?.email || "An administrator"} ${enabled ? "enabled" : "disabled"} two-factor authentication from ${this.clientIp(req)}.`,
      enabled ? "info" : "critical",
      `2fa:${req.user?.email || "admin"}:${enabled}`,
      "security_alert",
    );
  }

  async recordPasswordReset(req, username) {
    await this.send(
      "User password reset",
      `Password for ${username} was reset by ${req.user?.email || "an administrator"} from ${this.clientIp(req)}.`,
      "warning",
      `password-reset:${username}:${Date.now()}`,
      "security_alert",
    );
  }

  async recordApiKeyChange(req, tenantId) {
    await this.send(
      "API key changed",
      `The tenant API key for ${tenantId} was changed by ${req.user?.email || "an administrator"} from ${this.clientIp(req)}.`,
      "critical",
      `api-key:${tenantId}`,
      "security_alert",
    );
  }

  async recordNasChange(req, nasname, action) {
    await this.send(
      `NAS client ${action}`,
      `RADIUS client ${nasname} was ${action} by ${req.user?.email || "an administrator"} from ${this.clientIp(req)}.`,
      "warning",
      `nas:${nasname}:${action}`,
      "security_alert",
    );
  }

  async recordRouterConfigPush(req, routerName, success, error) {
    await this.send(
      success ? "Router configuration pushed" : "Router push failed",
      success
        ? `Configuration was pushed to ${routerName} by ${req.user?.email || "an administrator"}.`
        : `Configuration push to ${routerName} failed: ${error || "unknown error"}`,
      success ? "info" : "critical",
      `router-push:${routerName}:${success ? "ok" : "fail"}`,
      "security_alert",
    );
  }

  async recordBackup(name, success, error) {
    await this.send(
      success ? "Backup completed" : "Backup failed",
      success
        ? `Backup "${name}" completed successfully.`
        : `Backup "${name}" failed: ${error || "unknown error"}`,
      success ? "info" : "critical",
      `backup:${name}`,
      "ops_alert",
    );
  }

  recordException(source, message) {
    this.send(
      "Application error",
      `${source}: ${String(message || "").slice(0, 300)}`,
      "critical",
      `exception:${source}`,
      "ops_alert",
    );
  }

  async paymentFailed(reference, amount, reason) {
    await this.send(
      "Payment failed",
      `Payment ${reference || "unknown"}${amount ? ` (KES ${amount})` : ""} failed: ${reason || "unknown reason"}`,
      "warning", `payment-failed:${reference}`, "ops_alert",
    );
  }

  async paymentRefunded(reference, amount, method) {
    await this.send(
      "Payment refunded",
      `Refund of KES ${amount} on ${reference || "a payment"} via ${method || "gateway"}.`,
      "warning", `refund:${reference}:${amount}`, "ops_alert",
    );
  }

  async subscriptionEvent(action, username, detail = "") {
    await this.send(
      `Subscription ${action}`,
      `${username || "Subscriber"}${detail ? ` — ${detail}` : ""}`,
      action === "suspended" || action === "expired" ? "warning" : "info",
      `subscription:${action}:${username}:${detail}`,
      "ops_alert",
    );
  }

  async lowBalance(identifier, balance, rate) {
    await this.send(
      "Low wallet balance",
      `${identifier} has KES ${Number(balance).toFixed(2)} left at KES ${Number(rate).toFixed(2)}/day.`,
      "warning", `low-balance:${identifier}`, "ops_alert",
    );
  }

  async quotaThreshold(identifier, percent) {
    await this.send(
      "Data quota threshold",
      `${identifier} has used ${Number(percent).toFixed(0)}% of their data allowance.`,
      Number(percent) >= 100 ? "critical" : "warning",
      `quota:${identifier}:${Number(percent).toFixed(0)}`,
      "ops_alert",
    );
  }

  async webhookFailure(url, reason) {
    await this.send(
      "Webhook delivery failed",
      `Delivery to ${url} failed: ${reason || "unknown error"}`,
      "critical", `webhook-failure:${url}`, "ops_alert",
    );
  }

  async integrationDown(name, reason) {
    await this.send(
      `${name} integration down`,
      reason || `${name} is not responding.`,
      "critical", `integration-down:${name}:${new Date().toISOString().slice(0, 10)}`, "ops_alert",
    );
  }

  async checkBillingEvents() {
    const db = global.dbAvailable ? global.db : require("../db/memory");
    try {
      const result = await db.query(
        `SELECT id, invoice_number, customer_id, total, due_date
         FROM invoices
         WHERE status NOT IN ('paid', 'cancelled') AND due_date < CURRENT_DATE`,
      );
      for (const invoice of result.rows) {
        const days = Math.max(1, Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / 86400000));
        if (![1, 3, 7].includes(days) && days < 7) {continue;}
        const label = days >= 7 ? "final notice" : `${days} day${days === 1 ? "" : "s"} overdue`;
        await this.send(
          `Invoice overdue — ${label}`,
          `Invoice ${invoice.invoice_number} for KES ${Number(invoice.total).toFixed(2)} is ${label}.`,
          days >= 7 ? "critical" : "warning",
          `overdue:${invoice.id}:${label}`,
          "ops_alert",
        );
      }
    } catch (error) {
      logger.debug("Overdue check skipped", { error: error.message });
    }

    try {
      const result = await db.query(
        `SELECT s.id, s.pppoe_username, s.end_date, c.name AS customer_name
         FROM subscriptions s LEFT JOIN customers c ON c.id = s.customer_id
         WHERE s.status = 'active' AND s.end_date IS NOT NULL AND s.end_date < CURRENT_TIMESTAMP`,
      );
      for (const row of result.rows) {
        await this.subscriptionEvent("expired", row.pppoe_username || row.customer_name, "End date passed while still active");
      }
    } catch (error) {
      logger.debug("Expiry check skipped", { error: error.message });
    }

    const today = new Date().toISOString().slice(0, 10);
    if (this.lastDigest !== today) {
      this.lastDigest = today;
      try {
        const payments = await db.query(
          "SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS total FROM payments WHERE created_at >= $1",
          [today],
        );
        const customers = await db.query("SELECT COUNT(*)::int AS count FROM customers WHERE created_at >= $1", [today]);
        const missingKyc = await db.query(
          "SELECT COUNT(*)::int AS count FROM customers WHERE id_number IS NULL OR id_number = ''",
        );
        await this.send(
          "Daily collections digest",
          `${payments.rows[0].count} payments totaling KES ${Number(payments.rows[0].total).toFixed(2)} today; ${customers.rows[0].count} new customers; ${missingKyc.rows[0].count} customers missing ID details.`,
          "info", `daily-digest:${today}`, "ops_alert",
        );
      } catch (error) {
        logger.debug("Daily digest skipped", { error: error.message });
      }
    }
  }

  async checkIntegrations() {
    const db = global.dbAvailable ? global.db : require("../db/memory");
    const axios = require("axios");
    const { decryptObject } = require("../utils/encryption");
    try {
      const result = await db.query(
        "SELECT service_name, config_data, is_active FROM integrations WHERE is_active = true",
      );
      const services = Object.fromEntries(result.rows.map((row) => [row.service_name, decryptObject(row.config_data) || {}]));

      if (services.telegram?.bot_token) {
        try {
          const response = await axios.get(`https://api.telegram.org/bot${services.telegram.bot_token}/getMe`, { timeout: 8000 });
          if (!response.data?.ok) {throw new Error("getMe returned not ok");}
        } catch (error) {
          await this.integrationDown("Telegram", `Bot check failed: ${error.message}`);
        }
      }

      if (services.mpesa?.consumer_key && services.mpesa?.consumer_secret) {
        try {
          const auth = Buffer.from(`${services.mpesa.consumer_key}:${services.mpesa.consumer_secret}`).toString("base64");
          const response = await axios.get("https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
            headers: { Authorization: `Basic ${auth}` }, timeout: 8000,
          });
          if (!response.data?.access_token) {throw new Error("No access token returned");}
        } catch (error) {
          await this.integrationDown("M-Pesa", `OAuth check failed: ${error.message}`);
        }
      }

      const emailProviders = ["sendgrid", "mailgun", "aws_ses"];
      const activeEmail = emailProviders.find((name) => services[name]);
      if (!activeEmail) {
        await this.integrationDown("Email", "No email provider is active; reminders and invoices cannot be emailed.");
      }
    } catch (error) {
      logger.debug("Integration check skipped", { error: error.message });
    }
  }

  async runHealthChecks() {
    try {
      const stats = fs.statfsSync(process.cwd());
      const freePercent = (stats.bavail * 100) / stats.blocks;
      if (freePercent < 15) {
        await this.send(
          "Low disk space",
          `Only ${freePercent.toFixed(1)}% disk space remains on the billing server.`,
          "critical",
          "disk-space",
          "ops_alert",
        );
      }
    } catch (error) {
      logger.warn("Disk check failed", { error: error.message });
    }

    try {
      const db = global.dbAvailable ? global.db : require("../db/memory");
      const result = await db.query("SELECT pg_database_size(current_database()) AS size");
      const gb = Number(result.rows[0]?.size || 0) / 1073741824;
      if (gb > 5) {
        await this.send(
          "Database growth",
          `Billing database is now ${gb.toFixed(2)} GB.`,
          "warning",
          "db-size",
          "ops_alert",
        );
      }
    } catch {}

    const appUrl = process.env.APP_URL;
    if (appUrl && !/localhost|127\.0\.0\.1/.test(appUrl)) {
      try {
        const axios = require("axios");
        const response = await axios.get(`${appUrl.replace(/\/$/, "")}/api/health`, { timeout: 8000 });
        if (response.status >= 400) {throw new Error(`HTTP ${response.status}`);}
      } catch (error) {
        await this.send(
          "Billing API unreachable",
          `Self-check to ${appUrl}/api/health failed: ${error.message}`,
          "critical",
          "api-health",
          "ops_alert",
        );
      }
    }

    await this.checkBillingEvents().catch((error) => {
      logger.warn("Billing event check failed", { error: error.message });
    });
    await this.checkIntegrations().catch((error) => {
      logger.warn("Integration check failed", { error: error.message });
    });
  }
}

module.exports = new OpsAlertService();
