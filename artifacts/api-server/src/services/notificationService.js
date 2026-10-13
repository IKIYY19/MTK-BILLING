/**
 * Unified Notification Service
 * Centralizes SMS, WhatsApp, and template trigger logic.
 */

const { v4: uuidv4 } = require("uuid");
const AfricaTalkingService = require("./africasTalking");
const WhatsAppService = require("./whatsapp");
const SMSLeopardService = require("./smsLeopard");
const BulkSmsKenyaService = require("./bulkSmsKenya");
const NexmoService = require("./nexmo");
const TwilioService = require("./twilio");
const messagingStore = require("./messagingStore");
const { decryptObject } = require("../utils/encryption");

const db = global.db || require("../db/memory");

function getDb() {
  return global.db || db;
}

// Fetch dynamic configuration for integrations
async function getIntegrationConfig(serviceName) {
  try {
    const database = getDb();
    const result = await database.query(
      "SELECT config_data, is_active FROM integrations WHERE service_name = $1 AND is_active = true LIMIT 1",
      [serviceName]
    );
    if (result.rows.length === 0) {return null;}
    return decryptObject(result.rows[0].config_data);
  } catch (error) {
    console.error(`Error fetching integration config for ${serviceName}:`, error);
    return null;
  }
}

// Getters for configured provider instances
async function getATService() {
  const integrationConfig = await getIntegrationConfig("africas_talking");
  if (integrationConfig) {
    return new AfricaTalkingService({
      apiKey: integrationConfig.api_key,
      username: integrationConfig.username || "",
      senderId: integrationConfig.sender_id || "",
    });
  }
  return new AfricaTalkingService({
    apiKey: process.env.AT_API_KEY,
    username: process.env.AT_USERNAME || "",
    senderId: process.env.AT_SENDER_ID || "",
  });
}

async function getWhatsAppService() {
  const integrationConfig = await getIntegrationConfig("whatsapp");
  if (integrationConfig) {
    return new WhatsAppService({
      accessToken: integrationConfig.access_token,
      phoneNumberId: integrationConfig.phone_number_id,
      verifyToken: integrationConfig.verify_token,
    });
  }
  return new WhatsAppService();
}

async function getSmsLeopardService() {
  const integrationConfig = await getIntegrationConfig("smsleopard");
  if (integrationConfig) {
    return new SMSLeopardService({
      apiKey: integrationConfig.api_key,
      senderId: integrationConfig.sender_id,
    });
  }
  return new SMSLeopardService();
}

async function getBulkSmsKenyaService() {
  const integrationConfig = await getIntegrationConfig("bulksms_kenya");
  if (integrationConfig) {
    return new BulkSmsKenyaService({
      username: integrationConfig.username,
      apiKey: integrationConfig.api_key,
      senderId: integrationConfig.sender_id,
    });
  }
  return new BulkSmsKenyaService();
}

async function getNexmoService() {
  const integrationConfig = await getIntegrationConfig("nexmo");
  if (integrationConfig) {
    return new NexmoService({
      apiKey: integrationConfig.api_key,
      apiSecret: integrationConfig.api_secret,
      senderId: integrationConfig.sender_id,
    });
  }
  return new NexmoService();
}

async function getTwilioService() {
  const integrationConfig = await getIntegrationConfig("twilio");
  if (integrationConfig) {
    return new TwilioService({
      accountSid: integrationConfig.account_sid,
      authToken: integrationConfig.auth_token,
      phoneNumber: integrationConfig.phone_number,
    });
  }
  return new TwilioService();
}

function getCompanyInfo() {
  return {
    company_name: process.env.COMPANY_NAME || "",
    paybill: process.env.MPESA_PAYBILL || "",
    support_phone: process.env.SUPPORT_PHONE || "",
  };
}

// Render dynamic variables within a message template
async function renderTemplate(templateId, variables, channel = "sms") {
  const template = await messagingStore.getTemplate(templateId, channel);
  if (!template || !template.is_active) {return null;}

  let message = template.body;
  const company = getCompanyInfo();

  for (const [key, value] of Object.entries({ ...variables, ...company })) {
    message = message.replace(new RegExp(`\\{${key}\\}`, "g"), value || "");
  }

  return AfricaTalkingService.truncate(message);
}

// Log message execution status to Database
async function logMessage(log) {
  try {
    await messagingStore.createLog({
      id: log.id || uuidv4(),
      channel: log.channel || "sms",
      event: log.event || null,
      template_id: log.template_id || null,
      to: Array.isArray(log.to) ? log.to : log.to ? [log.to] : [],
      message: log.message,
      status: log.status,
      message_id: log.message_id || null,
      cost: log.cost || 0,
      is_sandbox: log.is_sandbox === true,
      metadata: log.metadata || null,
      created_at: log.created_at || new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to log message sending:", error.message);
  }
}

// Format message variables from customer/invoice data
function buildMessageVariables(data = {}) {
  return {
    customer_name: data.customer?.name?.split(" ")[0] || "Customer",
    invoice_number: data.invoice?.invoice_number || "",
    amount:
      data.invoice?.total?.toFixed?.(2) || data.amount?.toFixed?.(2) || "0",
    due_date: data.invoice?.due_date || "",
    days_overdue: data.days_overdue || 0,
    mpesa_receipt: data.payment?.reference || data.mpesa_receipt || "",
    balance: data.invoice
      ? (
          Number(data.invoice.total || 0) - Number(data.paid_amount || 0)
        ).toFixed(2)
      : "0",
    plan_name: data.plan?.name || "",
    speed: data.plan ? `${data.plan.speed_down}/${data.plan.speed_up}` : "",
    pppoe_user: data.pppoe_username || data.sub?.pppoe_username || "",
    pppoe_pass: data.pppoe_password || data.sub?.pppoe_password || "",
  };
}

class NotificationService {
  /**
   * Main entrypoint to dispatch template-driven SMS to a customer
   */
  async triggerSMS(event, data) {
    try {
      const phone = data.customer?.phone;
      if (!phone) {return { success: false, message: "No phone number" };}

      const templateId = {
        invoice_due_soon: "invoice_due_soon",
        invoice_overdue: "invoice_overdue",
        payment_received: "payment_received",
        service_suspended: "service_suspended",
        service_restored: "service_restored",
        outage_detected: "outage_detected",
        outage_resolved: "outage_resolved",
        welcome: "welcome",
        password_reset: "password_reset",
      }[event];

      if (!templateId) {return { success: false, message: "Unknown event" };}

      const message =
        data.custom_message ||
        (await renderTemplate(templateId, buildMessageVariables(data)));
      if (!message) {return { success: false, message: "Template not found" };}

      const providers = [
        {
          name: "africas_talking",
          getService: getATService,
          send: (svc, to, msg) =>
            svc.sendSMS([AfricaTalkingService.formatPhone(to)], msg),
        },
        {
          name: "twilio",
          getService: getTwilioService,
          send: (svc, to, msg) => svc.sendSMS(to, msg),
        },
        {
          name: "bulksms_kenya",
          getService: getBulkSmsKenyaService,
          send: (svc, to, msg) => svc.sendSMS(to, msg),
        },
        {
          name: "smsleopard",
          getService: getSmsLeopardService,
          send: (svc, to, msg) => svc.sendSMS(to, msg),
        },
        {
          name: "nexmo",
          getService: getNexmoService,
          send: (svc, to, msg) => svc.sendSMS(to, msg),
        },
      ];

      let result = { success: false, message: "No provider available" };
      for (const provider of providers) {
        try {
          const service = await provider.getService();
          if (!service || !service.isConfigured) {continue;}
          result = await provider.send(service, phone, message);
          if (result && result.success) {
            result.provider = provider.name;
            break;
          }
        } catch (e) {
          continue; // Try fallback providers
        }
      }

      await logMessage({
        event,
        template_id: templateId,
        provider: result.provider || "none",
        to: [phone],
        message,
        status: result.success ? "sent" : "failed",
        message_id: result.messageId || null,
        cost: result.cost || 0,
        is_sandbox: result.isSandbox,
      });

      return result;
    } catch (e) {
      console.error("SMS trigger error:", e.message);
      return { success: false, message: e.message };
    }
  }

  /**
   * Main entrypoint to dispatch template-driven SMS and/or WhatsApp
   */
  async triggerMessage(event, data, channel = "both") {
    const phone = data.customer?.phone;
    if (!phone) {return { success: false, message: "No phone number" };}

    const results = { sms: null, whatsapp: null };

    if (channel === "both" || channel === "sms") {
      results.sms = await this.triggerSMS(event, data);
    }

    if (channel === "both" || channel === "whatsapp") {
      const templateId = {
        invoice_due_soon: "invoice_due_soon",
        invoice_overdue: "invoice_overdue",
        payment_received: "payment_received",
        service_suspended: "service_suspended",
        service_restored: "service_restored",
        outage_detected: "outage_detected",
        outage_resolved: "outage_resolved",
        welcome: "welcome",
      }[event];

      if (templateId) {
        const message = await renderTemplate(
          templateId,
          buildMessageVariables(data),
          "whatsapp"
        );
        if (message) {
          const wa = await getWhatsAppService();
          results.whatsapp = await wa.sendMessage(phone, message);

          await logMessage({
            channel: "whatsapp",
            event,
            template_id: templateId,
            to: [phone],
            message,
            status: results.whatsapp.success ? "sent" : "failed",
            message_id: results.whatsapp.messageId,
            cost: 0,
            is_sandbox: results.whatsapp.isSandbox,
          });
        }
      }
    }

    return results;
  }

  // Raw helpers for direct controller usage
  async getWhatsAppService() {
    return getWhatsAppService();
  }

  async getATService() {
    return getATService();
  }

  async getSmsLeopardService() {
    return getSmsLeopardService();
  }

  async getBulkSmsKenyaService() {
    return getBulkSmsKenyaService();
  }

  async getNexmoService() {
    return getNexmoService();
  }

  async getTwilioService() {
    return getTwilioService();
  }

  async logMessage(log) {
    return logMessage(log);
  }

  async renderTemplate(templateId, variables, channel) {
    return renderTemplate(templateId, variables, channel);
  }

  formatPhone(phone) {
    return AfricaTalkingService.formatPhone(phone);
  }

  getCompanyInfo() {
    return getCompanyInfo();
  }
}

module.exports = new NotificationService();
