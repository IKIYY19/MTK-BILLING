/**
 * Africa's Talking SMS Integration
 * https://africastalking.com/
 * 
 * Environment variables:
 * AT_API_KEY - Your Africa's Talking API key
 * AT_USERNAME - Your Africa's Talking username
 * AT_SENDER_ID - Your registered sender ID
 */

const axios = require('axios');

class AfricaTalkingService {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.AT_API_KEY || '';
    this.username = config.username || process.env.AT_USERNAME || '';
    this.senderId = config.senderId || process.env.AT_SENDER_ID || '';
    this.baseUrl = this.username === 'sandbox'
      ? 'https://api.sandbox.africastalking.com'
      : 'https://api.africastalking.com';
  }

  /**
   * Send SMS to one or multiple phone numbers
   * @param {string|string[]} to - Phone number(s) in format +254712345678
   * @param {string} message - SMS body (max 160 chars for single SMS)
   * @returns {Promise<{success: boolean, results: Array, message: string}>}
   */
  async sendSMS(to, message) {
    if (!this.apiKey) {
      return {
        success: false,
        results: [],
        message: 'Africa\'s Talking API key is not configured',
        isSandbox: false,
      };
    }

    try {
      const phones = Array.isArray(to) ? to : [to];
      const response = await axios.post(
        `${this.baseUrl}/version1/messaging`,
        {
          username: this.username,
          to: phones.join(','),
          message: message,
          from: this.senderId,
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
            'ApiKey': this.apiKey,
          },
        }
      );

      const results = response.data.SMSMessageData.Recipients.map(r => ({
        phoneNumber: r.phoneNumber,
        status: r.status,
        messageId: r.messageId,
        cost: r.cost,
      }));

      const allSuccess = results.every(r => r.status === 'Success');

      return {
        success: allSuccess,
        results,
        message: response.data.SMSMessageData.Message,
        isSandbox: false,
      };
    } catch (error) {
      console.error('Africa\'s Talking SMS error:', error.response?.data || error.message);
      return {
        success: false,
        results: [],
        message: error.response?.data?.ErrorMessage || error.message,
        isSandbox: false,
      };
    }
  }

  /**
   * Send bulk SMS with different messages per recipient
   * Useful for personalized invoice reminders
   */
  async sendBulkSMS(messages) {
    // messages: [{ to: '+254...', message: '...' }, ...]
    if (!this.apiKey) {
      return {
        success: false,
        results: [],
        message: 'Africa\'s Talking API key is not configured',
        isSandbox: false,
      };
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/version1/messaging`,
        {
          username: this.username,
          to: messages.map(m => m.to).join(','),
          message: messages.map(m => m.message).join('|||'),
          from: this.senderId,
          bulkSMSMode: 1,
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
            'ApiKey': this.apiKey,
          },
        }
      );

      return {
        success: true,
        results: response.data.SMSMessageData.Recipients.map(r => ({
          phoneNumber: r.phoneNumber,
          status: r.status,
          messageId: r.messageId,
          cost: r.cost,
        })),
        message: response.data.SMSMessageData.Message,
        isSandbox: false,
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Check SMS balance
   */
  async checkBalance() {
    if (!this.apiKey) {
      return {
        success: false,
        message: 'Africa\'s Talking API key is not configured',
        isSandbox: false,
      };
    }

    try {
      const response = await axios.get(`${this.baseUrl}/version1/user`, {
        headers: { 'Accept': 'application/json', 'ApiKey': this.apiKey },
      });
      return {
        success: true,
        balance: response.data.balance,
        unit: response.data.currencyCode || 'KES',
        isSandbox: false,
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Truncate message to fit in single SMS (160 chars)
   */
  static truncate(message, maxChars = 160) {
    if (message.length <= maxChars) {return message;}
    return message.substring(0, maxChars - 3) + '...';
  }

  /**
   * Format phone number for AT API
   */
  static formatPhone(phone) {
    let cleaned = phone.replace(/\s/g, '').replace(/-/g, '');
    if (cleaned.startsWith('0')) {cleaned = '254' + cleaned.substring(1);}
    if (cleaned.startsWith('+')) {cleaned = cleaned.substring(1);}
    if (!cleaned.startsWith('254')) {cleaned = '254' + cleaned;}
    return '+' + cleaned;
  }
}

module.exports = AfricaTalkingService;
