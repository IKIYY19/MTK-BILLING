const logger = require("../utils/logger");

const ESCALATION_MINUTES = Number(process.env.ALERT_ESCALATION_MINUTES || 5);
const CHECK_INTERVAL_MS = 60000;

class AlertEscalationService {
  constructor() {
    this.timer = null;
  }

  start() {
    if (this.timer) {return;}
    this.timer = setInterval(() => {
      this.run().catch((error) => {
        logger.error("Alert escalation failed", { error: error.message });
      });
    }, CHECK_INTERVAL_MS);
    logger.info("Alert escalation service started", {
      minutes: ESCALATION_MINUTES,
    });
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async run() {
    const db = global.dbAvailable ? global.db : require("../db/memory");
    const result = await db.query(
      `SELECT * FROM alerts
       WHERE status = 'open'
         AND created_at < NOW() - ($1 || ' minutes')::interval
         AND (metadata->>'escalated_at') IS NULL
       LIMIT 50`,
      [ESCALATION_MINUTES],
    );

    for (const alert of result.rows) {
      const connection = await db.query(
        "SELECT id, name, ip_address FROM mikrotik_connections WHERE id = $1",
        [alert.connection_id],
      );
      const notifier = require("./routerAlertNotifier");
      await notifier.send(
        connection.rows[0] || { id: alert.connection_id, name: "Router" },
        "escalation",
        "critical",
        `ESCALATED: ${alert.title}`,
        `${alert.message} — still open after ${ESCALATION_MINUTES} minutes.`,
      );
      await db.query(
        "UPDATE alerts SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb WHERE id = $1",
        [alert.id, JSON.stringify({ escalated_at: new Date().toISOString() })],
      );
      logger.info("Alert escalated", { alertId: alert.id, type: alert.alert_type });
    }
  }
}

module.exports = new AlertEscalationService();
