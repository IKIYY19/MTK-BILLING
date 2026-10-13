/**
 * BulkSMS Kenya API Integration
 * Local Kenyan SMS provider
 */

const axios = require('axios');

class BulkSmsKenyaService {
  constructor(config = {}) {
    this.username = config.username || process.env.BULKSMS_KENYA_USERNAME || '';
    this.apiKey = config.apiKey || process.env.BULKSMS_KENYA_API_KEY || '';
    this.senderId = config.senderId || process.env.BULKSMS_KENYA_SENDER_ID || '';
    this.baseUrl = 'https://bulksmskenya.com/api';
  }

  async sendSMS(phone, message) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/sms/send`,
        {
          username: this.username,
          api_key: this.apiKey,
          sender_id: this.senderId,
          mobile: this.formatPhone(phone),
          message: message,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        messageId: response.data.message_id,
        status: response.data.status,
        cost: response.data.cost,
      };
    } catch (error) {
      console.error('BulkSMS Kenya error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || error.message,
      };
    }
  }

  async getBalance() {
    try {
      const response = await axios.get(`${this.baseUrl}/account/balance`, {
        params: {
          username: this.username,
          api_key: this.apiKey,
        },
      });

      return {
        success: true,
        balance: response.data.balance,
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

module.exports = BulkSmsKenyaService;
