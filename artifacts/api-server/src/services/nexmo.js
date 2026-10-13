/**
 * Nexmo (Vonage) API Integration
 * Global SMS provider with Kenya coverage
 */

const axios = require('axios');

class NexmoService {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.NEXMO_API_KEY || '';
    this.apiSecret = config.apiSecret || process.env.NEXMO_API_SECRET || '';
    this.senderId = config.senderId || process.env.NEXMO_SENDER_ID || '';
    this.baseUrl = 'https://rest.nexmo.com';
  }

  async sendSMS(phone, message) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/sms/json`,
        {
          params: {
            api_key: this.apiKey,
            api_secret: this.apiSecret,
            from: this.senderId,
            to: this.formatPhone(phone),
            text: message,
            type: 'text',
          },
        }
      );

      if (response.data.messages[0].status === '0') {
        return {
          success: true,
          messageId: response.data.messages[0]['message-id'],
          status: response.data.messages[0].status,
          remainingBalance: response.data.messages[0]['remaining-balance'],
        };
      } else {
        return {
          success: false,
          message: response.data.messages[0]['error-text'],
        };
      }
    } catch (error) {
      console.error('Nexmo error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || error.message,
      };
    }
  }

  async getBalance() {
    try {
      const response = await axios.get(
        `${this.baseUrl}/account/get-balance`,
        {
          params: {
            api_key: this.apiKey,
            api_secret: this.apiSecret,
          },
        }
      );

      return {
        success: true,
        balance: response.data.value,
        currency: response.data.currency,
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message,
      };
    }
  }

  formatPhone(phone) {
    let cleaned = phone.replace(/\s/g, '');
    if (cleaned.startsWith('0')) {cleaned = '254' + cleaned.substring(1);}
    if (!cleaned.startsWith('254')) {cleaned = '254' + cleaned;}
    return cleaned;
  }
}

module.exports = NexmoService;
