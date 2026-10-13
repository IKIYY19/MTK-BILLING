/**
 * SMSLeopard API Integration
 * Kenyan SMS provider with competitive rates
 */

const axios = require('axios');

class SMSLeopardService {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.SMSLEOPARD_API_KEY || '';
    this.senderId = config.senderId || process.env.SMSLEOPARD_SENDER_ID || '';
    this.baseUrl = 'https://api.smsleopard.com/v1';
  }

  async sendSMS(phone, message) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/sms/send`,
        {
          mobile: this.formatPhone(phone),
          message: message,
          sender_id: this.senderId,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
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
      console.error('SMSLeopard error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || error.message,
      };
    }
  }

  async getBalance() {
    try {
      const response = await axios.get(`${this.baseUrl}/account/balance`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
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

module.exports = SMSLeopardService;
