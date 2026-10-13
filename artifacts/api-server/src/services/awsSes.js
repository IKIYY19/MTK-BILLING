/**
 * AWS SES API Integration
 * Amazon Simple Email Service for high-volume transactional email
 */

let awsSdk = null;

function getAwsSdk() {
  if (awsSdk) {
    return awsSdk;
  }

  try {
    awsSdk = require('aws-sdk');
    return awsSdk;
  } catch (error) {
    return null;
  }
}

class AwsSesService {
  constructor(config = {}) {
    this.accessKeyId = config.accessKeyId || process.env.AWS_ACCESS_KEY_ID || '';
    this.secretAccessKey = config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY || '';
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';
    this.fromEmail = config.fromEmail || process.env.AWS_SES_FROM_EMAIL || '';
    this.fromName = config.fromName || process.env.AWS_SES_FROM_NAME || '';

    const AWS = getAwsSdk();

    if (!AWS) {
      this.ses = null;
      return;
    }

    AWS.config.update({
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      region: this.region,
    });

    this.ses = new AWS.SES({ apiVersion: '2010-12-01' });
  }

  isConfigured() {
    return Boolean(this.ses);
  }

  async sendEmail(to, subject, html, text = '') {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'AWS SES SDK is not installed',
      };
    }

    try {
      const params = {
        Source: `${this.fromName} <${this.fromEmail}>`,
        Destination: {
          ToAddresses: Array.isArray(to) ? to : [to],
        },
        Message: {
          Subject: {
            Data: subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: html,
              Charset: 'UTF-8',
            },
            Text: text ? {
              Data: text,
              Charset: 'UTF-8',
            } : undefined,
          },
        },
      };

      const result = await this.ses.sendEmail(params).promise();

      return {
        success: true,
        messageId: result.MessageId,
      };
    } catch (error) {
      console.error('AWS SES error:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async sendTemplate(to, templateName, templateData = {}) {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'AWS SES SDK is not installed',
      };
    }

    try {
      const params = {
        Source: `${this.fromName} <${this.fromEmail}>`,
        Destination: {
          ToAddresses: Array.isArray(to) ? to : [to],
        },
        Template: templateName,
        TemplateData: JSON.stringify(templateData),
      };

      const result = await this.ses.sendTemplatedEmail(params).promise();

      return {
        success: true,
        messageId: result.MessageId,
      };
    } catch (error) {
      console.error('AWS SES template error:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async getSendQuota() {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'AWS SES SDK is not installed',
      };
    }

    try {
      const result = await this.ses.getSendQuota().promise();

      return {
        success: true,
        max24HourSend: result.Max24HourSend,
        maxSendRate: result.MaxSendRate,
        sentLast24Hours: result.SentLast24Hours,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async verifyEmail(email) {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'AWS SES SDK is not installed',
      };
    }

    try {
      const params = {
        EmailAddress: email,
      };

      const result = await this.ses.verifyEmailIdentity(params).promise();

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }
}

module.exports = AwsSesService;
