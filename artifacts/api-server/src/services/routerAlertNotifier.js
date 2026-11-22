/**
 * Router Alert Notifier
 * Sends router online/offline alerts through the configured notification
 * channels (email, SMS, WhatsApp, Telegram), webhooks and Slack.
 * All recipients and provider credentials come from the database/integrations —
 * no placeholder or demo contacts.
 */

const logger = require("../utils/logger");

function getDb() {
  return global.dbAvailable ? global.db : require("../db/memory");
}

// Get the Telegram bot token from the integrations table (same source alertSystem uses)
async function getTelegramConfig() {
  try {
    const { decryptObject } = require("../utils/encryption");
    const result = await getDb().query(
      "SELECT config_data, is_active FROM integrations WHERE service_name = 'telegram' AND is_active = true LIMIT 1"
    );
    if (result.rows.length === 0) return null;
    const config = decryptObject(result.rows[0].config_data) || {};
    return { botToken: config.bot_token || "" };
  } catch {
    return null;
  }
}

function acceptsSeverity(config, severity) {
  const levels = config?.severities;
  if (!Array.isArray(levels) || levels.length === 0) {return true;}
  return levels.includes(severity);
}

class RouterAlertNotifier {
  async send(connection, alertType, severity, title, message) {
    const work = [];

    // 1) User-configured notification channels (email, SMS, WhatsApp, Telegram)
    work.push(this.sendViaChannels(connection, alertType, severity, title, message));

    // 2) Webhooks (event: router.offline / router.online, also matched by "*")
    const event =
      alertType === "router_offline"
        ? "router.offline"
        : alertType === "escalation"
          ? "alert.escalated"
          : "router.online";
    work.push(this.sendWebhook(event, {
      connection_id: connection.id,
      name: connection.name,
      ip_address: connection.ip_address,
      alert_type: alertType,
      severity,
      title,
      message,
    }));

    // 3) Slack (if configured globally)
    work.push(this.sendSlack(severity, title, message, connection));

    await Promise.allSettled(work);
  }

  async sendViaChannels(connection, alertType, severity, title, message) {
    try {
      const db = getDb();
      const channels = await db.query(
        `SELECT nc.channel_type, nc.config, u.email, u.name
         FROM notification_channels nc
         JOIN users u ON u.id = nc.user_id
         WHERE nc.is_enabled = true AND u.role = 'admin'`
      );
      if (channels.rows.length === 0) {
        logger.debug("No enabled admin notification channels for router alert", { alertType });
        return;
      }

      const telegramConfig = await getTelegramConfig();

      for (const channel of channels.rows) {
        if (!acceptsSeverity(channel.config, severity)) {continue;}
        try {
          if (channel.channel_type === "email" && channel.email) {
            const emailService = require("./email");
            await emailService.sendEmail({
              to: channel.email,
              subject: `[${severity.toUpperCase()}] ${title}`,
              html: `<div style="font-family:Arial,sans-serif;max-width:600px">
                <h3 style="color:${severity === "critical" ? "#ef4444" : "#f59e0b"}">${title}</h3>
                <p>${message}</p>
                <p style="color:#6b7280;font-size:12px">Router: ${connection.name} (${connection.ip_address}) | Severity: ${severity}</p>
              </div>`,
            });
            logger.info("Router alert email sent", { to: channel.email, title });
          } else if (channel.channel_type === "sms") {
            const phone = channel.config?.phone;
            if (phone) {
              const notificationService = require("./notificationService");
              await notificationService.triggerSMS("service_suspended", {
                customer: { phone, name: channel.name || "Admin" },
                custom_message: `[${severity.toUpperCase()}] ${title}: ${message}`,
              });
              logger.info("Router alert SMS sent", { phone, title });
            }
          } else if (channel.channel_type === "whatsapp") {
            const phone = channel.config?.phone;
            if (phone) {
              const notificationService = require("./notificationService");
              const wa = await notificationService.getWhatsAppService();
              if (wa && wa.isConfigured) {
                await wa.sendMessage(phone, `*[${severity.toUpperCase()}] ${title}*\n${message}`);
                logger.info("Router alert WhatsApp sent", { phone, title });
              }
            }
          } else if (channel.channel_type === "telegram") {
            const chatId = channel.config?.chat_id;
            if (chatId && telegramConfig?.botToken) {
              const TelegramService = require("./telegram");
              const tg = new TelegramService({ botToken: telegramConfig.botToken });
              await tg.sendMessage(chatId, `*[${severity.toUpperCase()}] ${title}*\n${message}`);
              logger.info("Router alert Telegram sent", { chatId, title });
            }
          }
        } catch (channelError) {
          logger.error("Failed to send router alert via channel", {
            channel: channel.channel_type,
            error: channelError.message,
          });
        }
      }
    } catch (error) {
      logger.error("Failed to load notification channels for router alert", { error: error.message });
    }
  }

  async sendWebhook(event, data) {
    try {
      const webhooks = require("../routes/webhooks");
      if (typeof webhooks.triggerWebhook === "function") {
        await webhooks.triggerWebhook(event, data);
      }
    } catch (error) {
      logger.error("Failed to fire router alert webhook", { error: error.message });
    }
  }

  async sendSlack(severity, title, message, connection) {
    try {
      const slack = require("./slackNotifier");
      const color = severity === "critical" ? "danger" : "good";
      await slack.notify(`*${title}*\n${message}\nRouter: ${connection.name} (${connection.ip_address})`, color);
    } catch (error) {
      logger.error("Failed to send router alert Slack message", { error: error.message });
    }
  }
}

module.exports = new RouterAlertNotifier();
