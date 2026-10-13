/**
 * SMS & WhatsApp Router
 * Handles all message routing, templates, logs, and webhook integration,
 * delegating business logic to the centralized NotificationService.
 */

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const notificationService = require("../services/notificationService");
const messagingStore = require("../services/messagingStore");
const { messagingLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

/**
 * Resolve the provider service once — eliminates the triple switch-case
 * that was copy-pasted across /send, /send-template, and /send-bulk.
 */
async function resolveProviderService(providerName) {
  switch (providerName) {
    case "smsleopard":    return notificationService.getSmsLeopardService();
    case "bulksms_kenya": return notificationService.getBulkSmsKenyaService();
    case "nexmo":         return notificationService.getNexmoService();
    case "twilio":        return notificationService.getTwilioService();
    case "whatsapp":      return notificationService.getWhatsAppService();
    case "africas_talking":
    default:              return notificationService.getATService();
  }
}

/**
 * Send a message through the resolved provider.
 * Handles the africas_talking / whatsapp / generic branching in one place.
 */
async function sendViaProvider(service, providerName, recipients, message) {
  if (providerName === "africas_talking" || providerName === undefined) {
    const formatted = recipients.map(r => notificationService.formatPhone(r));
    return service.sendSMS(formatted, message);
  }
  if (providerName === "whatsapp") {
    return service.sendMessage(recipients[0], message);
  }
  return service.sendSMS(recipients[0], message);
}

// ═══════════════════════════════════════
// BULK SEND RAW MESSAGE to filtered customers
// POST /bulk-send-raw  { message, provider, filter: 'all'|'active'|'overdue' }
// (was: /send-bulk — renamed to avoid confusion with /bulk-send)
// ═══════════════════════════════════════
router.post("/bulk-send-raw", messagingLimiter, async (req, res) => {
  try {
    const { message, provider, filter = "all" } = req.body;
    if (!message) return res.status(400).json({ error: "message required" });

    let customers = [];
    if (global.db) {
      let query = "SELECT id, name, phone, status FROM customers WHERE phone IS NOT NULL AND phone != ''";
      let params = [];
      if (filter === "active") { query += " AND status = $1"; params = ["active"]; }
      else if (filter === "overdue") { query += " AND id IN (SELECT DISTINCT customer_id FROM invoices WHERE status != 'paid' AND due_date < CURRENT_DATE)"; }
      const result = await global.db.query(query, params);
      customers = result.rows;
    }
    if (customers.length === 0) return res.status(404).json({ error: "No customers found with phone numbers" });

    const usedProvider = provider || "africas_talking";
    const service = await resolveProviderService(usedProvider);
    const results = [];
    let successCount = 0, failCount = 0;

    for (const customer of customers) {
      try {
        const result = await sendViaProvider(service, usedProvider, [customer.phone], message);
        await notificationService.logMessage({ to: [customer.phone], message, status: result.success ? "sent" : "failed", cost: result.cost || 0, is_sandbox: false });
        result.success ? successCount++ : failCount++;
        results.push({ phone: customer.phone, success: result.success });
      } catch (err) {
        failCount++;
        results.push({ phone: customer.phone, success: false, error: err.message });
      }
    }
    res.json({ success: true, provider: usedProvider, total: customers.length, sent: successCount, failed: failCount, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════
// SEND SINGLE/RECIPIENTS SMS
// ═══════════════════════════════════════
router.post("/send", messagingLimiter, async (req, res) => {
  try {
    const { to, message, provider } = req.body;
    if (!to || !message) return res.status(400).json({ error: "to and message required" });

    const recipients = Array.isArray(to) ? to : [to];
    const usedProvider = provider || "africas_talking";
    const service = await resolveProviderService(usedProvider);
    const result = await sendViaProvider(service, usedProvider, recipients, message);

    await notificationService.logMessage({
      to: recipients, message,
      status: result.success ? "sent" : "failed",
      message_id: result.messageId || result.results?.[0]?.messageId || null,
      cost: result.cost || result.results?.[0]?.cost || 0,
      is_sandbox: result.isSandbox,
      metadata: { provider: usedProvider },
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════
// SEND VIA TEMPLATE
// ═══════════════════════════════════════
router.post("/send-template", messagingLimiter, async (req, res) => {
  try {
    const { template_id, to, variables, provider } = req.body;
    if (!template_id || !to) return res.status(400).json({ error: "template_id and to required" });

    const message = await notificationService.renderTemplate(template_id, variables || {});
    if (!message) return res.status(404).json({ error: "Template not found or inactive" });

    const recipients = Array.isArray(to) ? to : [to];
    const usedProvider = provider || "africas_talking";
    const service = await resolveProviderService(usedProvider);
    const result = await sendViaProvider(service, usedProvider, recipients, message);

    await notificationService.logMessage({
      template_id, to: recipients, message,
      status: result.success ? "sent" : "failed",
      provider: usedProvider,
      message_id: result.id || result.results?.[0]?.messageId || null,
      cost: result.cost || result.results?.[0]?.cost || 0,
      is_sandbox: result.isSandbox || false,
    });
    res.json({ ...result, template_id, message, provider: usedProvider });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════
// DELETE SMS LOG
// ═══════════════════════════════════════
router.delete("/logs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await messagingStore.deleteLog(id);
    res.json({ success: true, message: "Log deleted" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// CLEAR ALL SMS LOGS
// ═══════════════════════════════════════
router.delete("/logs", async (req, res) => {
  try {
    await messagingStore.clearLogs();
    res.json({ success: true, message: "All logs cleared" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// BULK SMS (via template - Africa's Talking)
// ═══════════════════════════════════════
router.post("/bulk-send", messagingLimiter, async (req, res) => {
  try {
    const { template_id, recipients } = req.body;
    if (!template_id || !recipients?.length) {
      return res.status(400).json({ error: "template_id and recipients required" });
    }

    const messages = (
      await Promise.all(
        recipients.map(async (recipient) => {
          const message = await notificationService.renderTemplate(
            template_id,
            recipient.variables || {},
          );
          return message
            ? { to: notificationService.formatPhone(recipient.to), message }
            : null;
        }),
      )
    ).filter(Boolean);

    if (messages.length === 0) {
      return res.json({ success: true, sent: 0, message: "No valid messages" });
    }

    const at = await notificationService.getATService();
    const result = await at.sendBulkSMS(messages);

    await Promise.all(
      messages.map((item, index) =>
        notificationService.logMessage({
          template_id,
          to: [item.to],
          message: item.message,
          status:
            result.results?.[index]?.status === "Success" ? "sent" : "failed",
          message_id: result.results?.[index]?.messageId || null,
          cost: result.results?.[index]?.cost || 0,
          is_sandbox: result.isSandbox,
        }),
      ),
    );

    res.json({ ...result, sent: messages.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════
router.get("/templates", async (req, res) => {
  try {
    res.json(await messagingStore.listTemplates("sms"));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/templates/:id", messagingLimiter, async (req, res) => {
  try {
    const updated = await messagingStore.updateTemplate(
      req.params.id,
      req.body || {},
      "sms",
    );
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// LOGS
// ═══════════════════════════════════════
router.get("/logs", async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    res.json(await messagingStore.listLogs({ page, limit }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// SETTINGS / BALANCE
// ═══════════════════════════════════════
router.get("/balance", async (req, res) => {
  try {
    const at = await notificationService.getATService();
    res.json(await at.checkBalance());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/settings", async (req, res) => {
  try {
    // Check if any SMS integration is configured in the database
    let isConfigured = false;
    let configuredProvider = null;

    if (global.db) {
      const providers = [
        "africas_talking",
        "smsleopard",
        "bulksms_kenya",
        "nexmo",
        "twilio",
      ];
      for (const provider of providers) {
        const result = await global.db.query(
          "SELECT is_active FROM integrations WHERE service_name = $1 AND is_active = true LIMIT 1",
          [provider],
        );
        if (result.rows.length > 0) {
          isConfigured = true;
          configuredProvider = provider;
          break;
        }
      }
    }

    res.json({
      username: process.env.AT_USERNAME || "",
      sender_id: process.env.AT_SENDER_ID || "",
      is_configured: isConfigured,
      configured_provider: configuredProvider,
      company: notificationService.getCompanyInfo(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// WHATSAPP
// ═══════════════════════════════════════

router.post("/whatsapp/send", messagingLimiter, async (req, res) => {
  try {
    const { to, message } = req.body;
    if (!to || !message) {
      return res.status(400).json({ error: "to and message required" });
    }

    const wa = await notificationService.getWhatsAppService();
    const result = await wa.sendMessage(to, message);

    await notificationService.logMessage({
      channel: "whatsapp",
      to: [to],
      message,
      status: result.success ? "sent" : "failed",
      message_id: result.messageId,
      cost: 0,
      is_sandbox: result.isSandbox,
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/whatsapp/webhook", async (req, res) => {
  const wa = await notificationService.getWhatsAppService();
  const challenge = wa.verifyWebhook(req);
  if (challenge) return res.send(challenge.toString());
  return res.sendStatus(403);
});

router.post("/whatsapp/webhook", async (req, res) => {
  const wa = await notificationService.getWhatsAppService();
  const events = wa.handleWebhook(req.body);

  for (const event of events) {
    if (event.type === "message_received") {
      await notificationService.logMessage({
        channel: "whatsapp_inbound",
        to: [event.from],
        message: event.message,
        status: "received",
        created_at: new Date(
          parseInt(event.timestamp, 10) * 1000,
        ).toISOString(),
        metadata: { direction: "inbound" },
      });
      console.log(`[WhatsApp Inbound] ${event.from}: ${event.message}`);
    }
  }

  res.sendStatus(200);
});

router.post("/whatsapp/send-template", messagingLimiter, async (req, res) => {
  try {
    const { to, template_id, variables } = req.body;
    const message = await notificationService.renderTemplate(template_id, variables || {}, "whatsapp");
    if (!message) return res.status(404).json({ error: "Template not found" });

    const wa = await notificationService.getWhatsAppService();
    const result = await wa.sendMessage(to, message);

    await notificationService.logMessage({
      channel: "whatsapp",
      template_id,
      to: [to],
      message,
      status: result.success ? "sent" : "failed",
      message_id: result.messageId,
      cost: 0,
      is_sandbox: result.isSandbox,
    });

    res.json({ ...result, message });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/whatsapp/settings", async (req, res) => {
  const wa = await notificationService.getWhatsAppService();
  res.json({
    is_configured: wa.isConfigured,
    phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID
      ? `***${process.env.WHATSAPP_PHONE_NUMBER_ID.slice(-4)}`
      : null,
  });
});

module.exports = router;
module.exports.triggerSMS = (event, data) => notificationService.triggerSMS(event, data);
module.exports.triggerMessage = (event, data, channel) => notificationService.triggerMessage(event, data, channel);
module.exports.smsLogs = [];
