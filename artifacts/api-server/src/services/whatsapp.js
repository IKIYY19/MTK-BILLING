/**
 * WhatsApp Business API Integration
 * Extends the SMS system to support WhatsApp messages
 * Uses WhatsApp Cloud API (Meta)
 *
 * Environment variables:
 * WHATSAPP_ACCESS_TOKEN - Meta access token
 * WHATSAPP_PHONE_NUMBER_ID - WhatsApp Business phone number ID
 * WHATSAPP_VERIFY_TOKEN - Webhook verify token
 */

const axios = require('axios');

class WhatsAppService {
  constructor(config = {}) {
    this.accessToken = config.accessToken || process.env.WHATSAPP_ACCESS_TOKEN || '';
    this.phoneNumberId = config.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    this.verifyToken = config.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN || '';
    this.baseUrl = 'https://graph.facebook.com/v17.0';
    this.isConfigured = !!(this.accessToken && this.phoneNumberId);
  }

  /**
   * Send WhatsApp text message
   * @param {string} to - Phone number with country code (e.g., 254712345678)
   * @param {string} message - Text message
   * @returns {Promise<{success: boolean, messageId: string, message: string}>}
   */
  async sendMessage(to, message) {
    if (!this.isConfigured) {
      return {
        success: false,
        messageId: null,
        message: 'WhatsApp Business credentials are not configured',
        isSandbox: false,
      };
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: this.formatPhone(to),
          type: 'text',
          text: { body: message },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        messageId: response.data.messages?.[0]?.id,
        message: 'WhatsApp message sent',
        isSandbox: false,
      };
    } catch (error) {
      console.error('WhatsApp send error:', error.response?.data || error.message);
      return {
        success: false,
        messageId: null,
        message: error.response?.data?.error?.message || error.message,
        isSandbox: false,
      };
    }
  }

  /**
   * Send WhatsApp template message
   * Templates must be pre-approved in Meta Business Manager
   */
  async sendTemplate(to, templateName, language = 'en', variables = []) {
    if (!this.isConfigured) {
      return {
        success: false,
        messageId: null,
        message: 'WhatsApp Business credentials are not configured',
        isSandbox: false,
      };
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: this.formatPhone(to),
          type: 'template',
          template: {
            name: templateName,
            language: { code: language },
            components: variables.length > 0 ? [
              {
                type: 'body',
                parameters: variables.map(v => ({ type: 'text', text: v })),
              },
            ] : [],
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        messageId: response.data.messages?.[0]?.id,
        isSandbox: false,
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Verify webhook (for Meta webhook setup)
   */
  verifyWebhook(req) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === this.verifyToken) {
      return parseInt(challenge);
    }
    return null;
  }

  /**
   * Handle incoming webhook events
   */
  handleWebhook(body) {
    const events = [];

    if (body.entry) {
      for (const entry of body.entry) {
        for (const change of entry.changes || []) {
          if (change.value?.messages) {
            for (const msg of change.value.messages) {
              events.push({
                type: 'message_received',
                from: msg.from,
                message: msg.text?.body || '',
                timestamp: msg.timestamp,
              });
            }
          }
          if (change.value?.statuses) {
            for (const status of change.value.statuses) {
              events.push({
                type: 'status_update',
                messageId: status.id,
                status: status.status, // sent, delivered, read, failed
                timestamp: status.timestamp,
              });
            }
          }
        }
      }
    }

    return events;
  }

  formatPhone(phone) {
    let cleaned = phone.replace(/\s/g, '').replace(/[-()]/g, '');
    if (cleaned.startsWith('+')) {cleaned = cleaned.substring(1);}
    if (cleaned.startsWith('0')) {cleaned = '254' + cleaned.substring(1);}
    return cleaned;
  }
}

module.exports = WhatsAppService;
