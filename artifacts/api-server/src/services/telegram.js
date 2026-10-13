/**
 * Telegram Bot API Integration
 * Send payment reminders and alerts via Telegram
 */

const axios = require('axios');

class TelegramService {
  constructor(config = {}) {
    this.botToken = config.botToken || process.env.TELEGRAM_BOT_TOKEN || '';
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  async sendMessage(chatId, text, options = {}) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/sendMessage`,
        {
          chat_id: chatId,
          text: text,
          parse_mode: options.parseMode || 'HTML',
          disable_web_page_preview: options.disableWebPagePreview || false,
          reply_markup: options.replyMarkup || null,
        }
      );

      return {
        success: true,
        messageId: response.data.result.message_id,
        chatId: response.data.result.chat.id,
      };
    } catch (error) {
      console.error('Telegram error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.description || error.message,
      };
    }
  }

  async sendPaymentReminder(chatId, customerName, amount, dueDate, invoiceNumber) {
    const message = `
🔔 <b>Payment Reminder</b>

Dear <b>${customerName}</b>,

This is a friendly reminder that you have an outstanding payment of <b>KES ${amount}</b> for invoice <b>${invoiceNumber}</b>.

Due Date: <b>${dueDate}</b>

Please make your payment via M-Pesa to avoid service interruption.

Thank you for your business!
    `.trim();

    return await this.sendMessage(chatId, message);
  }

  async sendPaymentConfirmation(chatId, customerName, amount, invoiceNumber, receiptNumber) {
    const message = `
✅ <b>Payment Received</b>

Dear <b>${customerName}</b>,

We have received your payment of <b>KES ${amount}</b> for invoice <b>${invoiceNumber}</b>.

Receipt: <b>${receiptNumber}</b>

Thank you for your payment!
    `.trim();

    return await this.sendMessage(chatId, message);
  }

  async sendServiceAlert(chatId, alertType, message) {
    const icons = {
      warning: '⚠️',
      error: '❌',
      info: 'ℹ️',
      success: '✅',
    };

    const icon = icons[alertType] || '📢';
    const formattedMessage = `${icon} <b>${alertType.toUpperCase()}</b>\n\n${message}`;

    return await this.sendMessage(chatId, formattedMessage);
  }

  async sendOverdueNotice(chatId, customerName, amount, daysOverdue) {
    const message = `
🚨 <b>URGENT: Payment Overdue</b>

Dear <b>${customerName}</b>,

Your payment of <b>KES ${amount}</b> is <b>${daysOverdue} days</b> overdue.

Please make immediate payment to avoid service suspension.

Thank you.
    `.trim();

    return await this.sendMessage(chatId, message);
  }

  async setWebhook(url) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/setWebhook`,
        {
          url: url,
        }
      );

      return {
        success: true,
        description: response.data.description,
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.description || error.message,
      };
    }
  }

  async getWebhookInfo() {
    try {
      const response = await axios.get(`${this.baseUrl}/getWebhookInfo`);

      return {
        success: true,
        url: response.data.result.url,
        hasCustomCertificate: response.data.result.has_custom_certificate,
        pendingUpdateCount: response.data.result.pending_update_count,
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.description || error.message,
      };
    }
  }

  async getMe() {
    try {
      const response = await axios.get(`${this.baseUrl}/getMe`);

      return {
        success: true,
        id: response.data.result.id,
        isBot: response.data.result.is_bot,
        firstName: response.data.result.first_name,
        username: response.data.result.username,
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.description || error.message,
      };
    }
  }

  async getUpdates(offset = 0, limit = 100) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/getUpdates`,
        {
          params: {
            offset: offset,
            limit: limit,
            timeout: 0,
          },
        }
      );

      return {
        success: true,
        updates: response.data.result,
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.description || error.message,
      };
    }
  }
}

module.exports = TelegramService;
