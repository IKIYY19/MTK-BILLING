/**
 * Telegram Bot Routes
 * Handles sending messages via Telegram Bot API
 */

const express = require('express');
const TelegramService = require('../services/telegram');
const { decryptObject } = require('../utils/encryption');

const router = express.Router();

async function getIntegrationConfig(serviceName) {
  try {
    if (!global.db) {return null;}
    const result = await global.db.query(
      'SELECT config_data, is_active FROM integrations WHERE service_name = $1 AND is_active = true LIMIT 1',
      [serviceName]
    );
    if (result.rows.length === 0) {return null;}
    const decrypted = decryptObject(result.rows[0].config_data);
    return decrypted;
  } catch (error) {
    console.error('Error fetching integration config:', error);
    return null;
  }
}

async function getTelegramService() {
  const integrationConfig = await getIntegrationConfig('telegram');
  if (integrationConfig) {
    return new TelegramService({
      botToken: integrationConfig.bot_token,
    });
  }
  return new TelegramService();
}

// ═══════════════════════════════════════
// SEND MESSAGE
// ═══════════════════════════════════════
router.post('/send', async (req, res) => {
  try {
    const { chatId, text, parseMode, disableWebPagePreview } = req.body;
    if (!chatId || !text) {
      return res.status(400).json({ error: 'chatId and text are required' });
    }

    const telegram = await getTelegramService();
    const result = await telegram.sendMessage(chatId, text, {
      parseMode,
      disableWebPagePreview,
    });

    res.json(result);
  } catch (e) {
    console.error('Send Telegram message error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// SEND PAYMENT REMINDER
// ═══════════════════════════════════════
router.post('/payment-reminder', async (req, res) => {
  try {
    const { chatId, customerName, amount, dueDate, invoiceNumber } = req.body;
    if (!chatId || !customerName || !amount || !dueDate || !invoiceNumber) {
      return res.status(400).json({ error: 'chatId, customerName, amount, dueDate, and invoiceNumber are required' });
    }

    const telegram = await getTelegramService();
    const result = await telegram.sendPaymentReminder(customerName, amount, dueDate, invoiceNumber);

    res.json(result);
  } catch (e) {
    console.error('Send payment reminder error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// SEND PAYMENT CONFIRMATION
// ═══════════════════════════════════════
router.post('/payment-confirmation', async (req, res) => {
  try {
    const { chatId, customerName, amount, invoiceNumber, receiptNumber } = req.body;
    if (!chatId || !customerName || !amount || !invoiceNumber || !receiptNumber) {
      return res.status(400).json({ error: 'chatId, customerName, amount, invoiceNumber, and receiptNumber are required' });
    }

    const telegram = await getTelegramService();
    const result = await telegram.sendPaymentConfirmation(customerName, amount, invoiceNumber, receiptNumber);

    res.json(result);
  } catch (e) {
    console.error('Send payment confirmation error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// SEND SERVICE ALERT
// ═══════════════════════════════════════
router.post('/service-alert', async (req, res) => {
  try {
    const { chatId, alertType, message } = req.body;
    if (!chatId || !alertType || !message) {
      return res.status(400).json({ error: 'chatId, alertType, and message are required' });
    }

    const telegram = await getTelegramService();
    const result = await telegram.sendServiceAlert(chatId, alertType, message);

    res.json(result);
  } catch (e) {
    console.error('Send service alert error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// SEND OVERDUE NOTICE
// ═══════════════════════════════════════
router.post('/overdue-notice', async (req, res) => {
  try {
    const { chatId, customerName, amount, daysOverdue } = req.body;
    if (!chatId || !customerName || !amount || !daysOverdue) {
      return res.status(400).json({ error: 'chatId, customerName, amount, and daysOverdue are required' });
    }

    const telegram = await getTelegramService();
    const result = await telegram.sendOverdueNotice(customerName, amount, daysOverdue);

    res.json(result);
  } catch (e) {
    console.error('Send overdue notice error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// GET BOT INFO
// ═══════════════════════════════════════
router.get('/me', async (req, res) => {
  try {
    const telegram = await getTelegramService();
    const result = await telegram.getMe();

    res.json(result);
  } catch (e) {
    console.error('Get bot info error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// GET WEBHOOK INFO
// ═══════════════════════════════════════
router.get('/webhook', async (req, res) => {
  try {
    const telegram = await getTelegramService();
    const result = await telegram.getWebhookInfo();

    res.json(result);
  } catch (e) {
    console.error('Get webhook info error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// SET WEBHOOK
// ═══════════════════════════════════════
router.post('/webhook', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'url is required' });
    }

    const telegram = await getTelegramService();
    const result = await telegram.setWebhook(url);

    res.json(result);
  } catch (e) {
    console.error('Set webhook error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// GET UPDATES
// ═══════════════════════════════════════
router.get('/updates', async (req, res) => {
  try {
    const { offset, limit } = req.query;
    const telegram = await getTelegramService();
    const result = await telegram.getUpdates(
      offset ? parseInt(offset) : 0,
      limit ? parseInt(limit) : 100
    );

    res.json(result);
  } catch (e) {
    console.error('Get updates error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
