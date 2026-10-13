/**
 * Mailgun API Integration
 * Transactional email service
 */

const axios = require('axios');
const FormData = require('form-data');

class MailgunService {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.MAILGUN_API_KEY || '';
    this.domain = config.domain || process.env.MAILGUN_DOMAIN || '';
    this.fromEmail = config.fromEmail || process.env.MAILGUN_FROM_EMAIL || '';
    this.fromName = config.fromName || process.env.MAILGUN_FROM_NAME || '';
    this.baseUrl = `https://api.mailgun.net/v3/${this.domain}`;
  }

  async sendEmail(to, subject, html, text = '') {
    try {
      const formData = new FormData();
      formData.append('from', `${this.fromName} <${this.fromEmail}>`);
      formData.append('to', Array.isArray(to) ? to.join(',') : to);
      formData.append('subject', subject);
      formData.append('html', html);
      if (text) {formData.append('text', text);}

      const response = await axios.post(`${this.baseUrl}/messages`, formData, {
        auth: {
          username: 'api',
          password: this.apiKey,
        },
      });

      return {
        success: true,
        messageId: response.data.id,
        message: response.data.message,
      };
    } catch (error) {
      console.error('Mailgun error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || error.message,
      };
    }
  }

  async sendTemplate(to, templateName, variables = {}) {
    try {
      const formData = new FormData();
      formData.append('from', `${this.fromName} <${this.fromEmail}>`);
      formData.append('to', Array.isArray(to) ? to.join(',') : to);
      formData.append('template', templateName);
      
      Object.keys(variables).forEach(key => {
        formData.append(`v:${key}`, variables[key]);
      });

      const response = await axios.post(`${this.baseUrl}/messages`, formData, {
        auth: {
          username: 'api',
          password: this.apiKey,
        },
      });

      return {
        success: true,
        messageId: response.data.id,
        message: response.data.message,
      };
    } catch (error) {
      console.error('Mailgun template error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || error.message,
      };
    }
  }

  async getStats() {
    try {
      const response = await axios.get(`${this.baseUrl}/stats/total`, {
        auth: {
          username: 'api',
          password: this.apiKey,
        },
      });

      return {
        success: true,
        stats: response.data,
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message,
      };
    }
  }
}

module.exports = MailgunService;
