/**
 * Mailchimp API Integration
 * Email marketing and customer notifications
 */

const axios = require('axios');

class MailchimpService {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.MAILCHIMP_API_KEY || '';
    this.serverPrefix = this.apiKey ? this.apiKey.split('-')[1] : '';
    this.listId = config.listId || process.env.MAILCHIMP_LIST_ID || '';
    this.baseUrl = `https://${this.serverPrefix}.api.mailchimp.com/3.0`;
  }

  async addSubscriber(email, mergeFields = {}, tags = []) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/lists/${this.listId}/members`,
        {
          email_address: email,
          status: 'subscribed',
          merge_fields: mergeFields,
          tags: tags,
        },
        {
          auth: {
            username: 'anystring',
            password: this.apiKey,
          },
        }
      );

      return {
        success: true,
        memberId: response.data.id,
        status: response.data.status,
      };
    } catch (error) {
      console.error('Mailchimp error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.detail || error.message,
      };
    }
  }

  async updateSubscriber(email, mergeFields = {}, tags = []) {
    try {
      const subscriberHash = this.getSubscriberHash(email);

      const response = await axios.put(
        `${this.baseUrl}/lists/${this.listId}/members/${subscriberHash}`,
        {
          email_address: email,
          status_if_new: 'subscribed',
          merge_fields: mergeFields,
          tags: tags,
        },
        {
          auth: {
            username: 'anystring',
            password: this.apiKey,
          },
        }
      );

      return {
        success: true,
        memberId: response.data.id,
        status: response.data.status,
      };
    } catch (error) {
      console.error('Mailchimp update error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.detail || error.message,
      };
    }
  }

  async removeSubscriber(email) {
    try {
      const subscriberHash = this.getSubscriberHash(email);

      const response = await axios.delete(
        `${this.baseUrl}/lists/${this.listId}/members/${subscriberHash}`,
        {
          auth: {
            username: 'anystring',
            password: this.apiKey,
          },
        }
      );

      return {
        success: true,
      };
    } catch (error) {
      console.error('Mailchimp remove error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.detail || error.message,
      };
    }
  }

  async sendCampaign(campaignId) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/campaigns/${campaignId}/actions/send`,
        {},
        {
          auth: {
            username: 'anystring',
            password: this.apiKey,
          },
        }
      );

      return {
        success: true,
      };
    } catch (error) {
      console.error('Mailchimp send campaign error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.detail || error.message,
      };
    }
  }

  async createCampaign(subject, fromName, replyTo, htmlContent) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/campaigns`,
        {
          type: 'regular',
          recipients: {
            list_id: this.listId,
          },
          settings: {
            subject_line: subject,
            from_name: fromName,
            reply_to: replyTo,
          },
        },
        {
          auth: {
            username: 'anystring',
            password: this.apiKey,
          },
        }
      );

      const campaignId = response.data.id;

      // Set content
      await axios.put(
        `${this.baseUrl}/campaigns/${campaignId}/content`,
        {
          html: htmlContent,
        },
        {
          auth: {
            username: 'anystring',
            password: this.apiKey,
          },
        }
      );

      return {
        success: true,
        campaignId,
      };
    } catch (error) {
      console.error('Mailchimp create campaign error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.detail || error.message,
      };
    }
  }

  getSubscriberHash(email) {
    return Buffer.from(email.toLowerCase()).toString('base64').replace(/=+$/, '');
  }
}

module.exports = MailchimpService;
