const { v4: uuidv4 } = require("uuid");
const logger = require("../utils/logger");

const memoryDb = require("../db/memory");

const ALERT_TYPE = "customer_outage";
const DEFAULT_MIN_CUSTOMERS = 5;
const DEFAULT_OFFLINE_RATIO = 0.5;
const DEFAULT_NOTIFY_LIMIT = 50;

function getDb() {
  return global.dbAvailable && global.db ? global.db : memoryDb;
}

function numberFromEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function customerNotificationsEnabled() {
  return String(process.env.OUTAGE_NOTIFY_CUSTOMERS || "").toLowerCase() === "true";
}

function parseAlertMetadata(metadata) {
  if (!metadata) {
    return null;
  }
  if (typeof metadata === "object") {
    return metadata;
  }
  try {
    return JSON.parse(metadata);
  } catch {
    return null;
  }
}

function getOutageConfig() {
  return {
    minCustomers: numberFromEnv("OUTAGE_MIN_CUSTOMERS", DEFAULT_MIN_CUSTOMERS),
    offlineRatio: Math.min(
      1,
      numberFromEnv("OUTAGE_OFFLINE_RATIO", DEFAULT_OFFLINE_RATIO),
    ),
    notifyLimit: numberFromEnv("OUTAGE_NOTIFY_LIMIT", DEFAULT_NOTIFY_LIMIT),
  };
}

async function getAffectedSubscriptions(connectionId) {
  const db = getDb();
  const result = await db.query(
    `SELECT s.id as subscription_id, s.pppoe_username, s.customer_id,
            c.name as customer_name, c.phone, sp.name as plan_name
     FROM subscriptions s
     JOIN customers c ON c.id = s.customer_id
     LEFT JOIN service_plans sp ON sp.id = s.plan_id
     LEFT JOIN routers r ON r.id = s.router_id
     WHERE s.status = 'active'
       AND s.pppoe_username IS NOT NULL
       AND s.pppoe_username != ''
       AND (
         s.mikrotik_connection_id = $1
         OR r.linked_mikrotik_connection_id = $1
       )`,
    [connectionId],
  );
  return result.rows || [];
}

async function getRecentSessionBaseline(connectionId) {
  try {
    const result = await getDb().query(
      `SELECT
         COALESCE(MAX(active_pppoe), 0) as max_active,
         COALESCE(AVG(active_pppoe), 0) as avg_active
       FROM device_metrics
       WHERE router_id = $1
         AND recorded_at >= NOW() - INTERVAL '2 hours'
         AND recorded_at < NOW() - INTERVAL '1 minute'`,
      [connectionId],
    );
    const row = result.rows[0] || {};
    return {
      maxActive: Number(row.max_active || 0),
      avgActive: Number(row.avg_active || 0),
    };
  } catch (error) {
    return null;
  }
}

async function getOpenOutageAlert(connectionId) {
  const db = getDb();
  const result = await db.query(
    `SELECT * FROM alerts
     WHERE connection_id = $1
       AND alert_type = $2
       AND status IN ('open', 'acknowledged')
     ORDER BY created_at DESC
     LIMIT 1`,
    [connectionId, ALERT_TYPE],
  );
  return result.rows[0] || null;
}

async function createOutageAlert(connection, outage) {
  const db = getDb();
  const id = uuidv4();
  const title = `Possible customer outage on ${connection.name || connection.ip_address}`;
  const message = `${outage.offlineCount}/${outage.totalCustomers} active customer(s) appear offline on ${connection.name || connection.ip_address}.`;
  await db.query(
    `INSERT INTO alerts (id, connection_id, alert_type, severity, title, message, status, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8)`,
    [
      id,
      connection.id,
      ALERT_TYPE,
      outage.severity,
      title,
      message,
      JSON.stringify(outage),
      new Date().toISOString(),
    ],
  );
  return { id, title, message };
}

async function updateOutageAlert(alertId, outage) {
  const db = getDb();
  await db.query(
    `UPDATE alerts
     SET metadata = $1,
         message = $2
     WHERE id = $3`,
    [
      JSON.stringify(outage),
      `${outage.offlineCount}/${outage.totalCustomers} active customer(s) still appear offline.`,
      alertId,
    ],
  );
}

async function resolveOutageAlert(alertId, connection, outage) {
  const db = getDb();
  await db.query(
    `UPDATE alerts
     SET status = 'resolved',
         resolved_at = $1,
         metadata = $2,
         message = $3
     WHERE id = $4`,
    [
      new Date().toISOString(),
      JSON.stringify(outage),
      `Outage appears resolved on ${connection.name || connection.ip_address}. ${outage.onlineCount}/${outage.totalCustomers} customer(s) are online.`,
      alertId,
    ],
  );
}

async function notifyAdmin(connection, outage, alertInfo) {
  try {
    const slack = require("./slackNotifier");
    await slack.notify(
      `*Possible Customer Outage*\nRouter: ${connection.name || connection.ip_address}\nAffected: ${outage.offlineCount}/${outage.totalCustomers}\nOnline sessions: ${outage.onlineCount}\nAlert: ${alertInfo.id}`,
      outage.severity === "critical" ? "#ef4444" : "#f59e0b",
    );
  } catch (error) {
    logger.warn("[Outage] Admin notification failed", { error: error.message });
  }
}

async function notifyCustomers(connection, outage, eventType) {
  if (!customerNotificationsEnabled()) {
    return { enabled: false, sent: 0 };
  }

  const notificationService = require("./notificationService");
  const company = notificationService.getCompanyInfo();
  const targets = outage.offlineCustomers.slice(0, outage.notifyLimit);
  let sent = 0;

  for (const customer of targets) {
    if (!customer.phone) {
      continue;
    }
    const customMessage =
      eventType === "outage_resolved"
        ? `${company.company_name}: Service has been restored on ${connection.name || "your area"}. Thank you for your patience.`
        : `${company.company_name}: We are investigating a service outage affecting ${connection.name || "your area"}. No action is needed from you.`;

    const result = await notificationService.triggerSMS(eventType, {
      customer: {
        id: customer.customer_id,
        name: customer.customer_name,
        phone: customer.phone,
      },
      custom_message: customMessage,
    });

    if (result?.success) {
      sent += 1;
    }
  }

  return { enabled: true, sent, attempted: targets.length };
}

async function detectCustomerOutage(connection, activeSessionNames = []) {
  if (!connection?.id) {
    return { checked: false, reason: "Missing connection id" };
  }

  const config = getOutageConfig();
  const activeNames = new Set(
    activeSessionNames
      .map((name) => String(name || "").trim())
      .filter(Boolean),
  );

  let subscriptions = [];
  try {
    subscriptions = await getAffectedSubscriptions(connection.id);
  } catch (error) {
    logger.warn("[Outage] Could not load active subscriptions", {
      connectionId: connection.id,
      error: error.message,
    });
    return { checked: false, reason: error.message };
  }

  const totalCustomers = subscriptions.length;
  const baseline = await getRecentSessionBaseline(connection.id);
  const offlineCustomers = subscriptions.filter(
    (sub) => !activeNames.has(sub.pppoe_username),
  );
  const offlineCount = offlineCustomers.length;
  const onlineCount = totalCustomers - offlineCount;
  const offlineRatio = totalCustomers > 0 ? offlineCount / totalCustomers : 0;
  const baselineActive = baseline?.maxActive || 0;
  const droppedSessions = Math.max(0, baselineActive - activeNames.size);
  const sessionDropRatio = baselineActive > 0 ? droppedSessions / baselineActive : 0;
  const hasBaseline = baselineActive >= config.minCustomers;
  const shouldOpen = hasBaseline
    ? droppedSessions >= config.minCustomers &&
      sessionDropRatio >= config.offlineRatio
    : totalCustomers >= config.minCustomers &&
      offlineCount >= config.minCustomers &&
      offlineRatio >= config.offlineRatio;

  const outage = {
    connection_id: connection.id,
    connection_name: connection.name || connection.ip_address,
    totalCustomers,
    onlineCount,
    offlineCount,
    offlineRatio,
    threshold: {
      minCustomers: config.minCustomers,
      offlineRatio: config.offlineRatio,
    },
    baseline: {
      hasBaseline,
      maxActive: baselineActive,
      avgActive: baseline?.avgActive || 0,
      currentActive: activeNames.size,
      droppedSessions,
      sessionDropRatio,
    },
    notifyLimit: config.notifyLimit,
    offlineCustomers: offlineCustomers.map((customer) => ({
      customer_id: customer.customer_id,
      customer_name: customer.customer_name,
      phone: customer.phone,
      pppoe_username: customer.pppoe_username,
      plan_name: customer.plan_name,
    })),
    checked_at: new Date().toISOString(),
    severity: offlineRatio >= 0.8 ? "critical" : "warning",
  };

  const openAlert = await getOpenOutageAlert(connection.id).catch((error) => {
    logger.warn("[Outage] Could not check existing alerts", {
      connectionId: connection.id,
      error: error.message,
    });
    return null;
  });

  if (shouldOpen && !openAlert) {
    const alertInfo = await createOutageAlert(connection, outage);
    await notifyAdmin(connection, outage, alertInfo);
    const customerNotifications = await notifyCustomers(
      connection,
      outage,
      "outage_detected",
    );
    return {
      checked: true,
      status: "created",
      alert_id: alertInfo.id,
      outage,
      customer_notifications: customerNotifications,
    };
  }

  if (shouldOpen && openAlert) {
    await updateOutageAlert(openAlert.id, outage).catch((error) => {
      logger.warn("[Outage] Could not update outage alert", {
        alertId: openAlert.id,
        error: error.message,
      });
    });
    return { checked: true, status: "ongoing", alert_id: openAlert.id, outage };
  }

  if (!shouldOpen && openAlert) {
    const previousOutage = parseAlertMetadata(openAlert.metadata);
    await resolveOutageAlert(openAlert.id, connection, outage);
    const customerNotifications = await notifyCustomers(
      connection,
      previousOutage?.offlineCustomers?.length
        ? { ...outage, offlineCustomers: previousOutage.offlineCustomers }
        : outage,
      "outage_resolved",
    );
    return {
      checked: true,
      status: "resolved",
      alert_id: openAlert.id,
      outage,
      customer_notifications: customerNotifications,
    };
  }

  return { checked: true, status: "healthy", outage };
}

module.exports = {
  ALERT_TYPE,
  detectCustomerOutage,
};
