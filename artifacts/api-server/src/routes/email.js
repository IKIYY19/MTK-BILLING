/**
 * Email Routes
 * Handles sending emails via multiple providers (Mailgun, AWS SES, SendGrid)
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const MailgunService = require('../services/mailgun');
const AwsSesService = require('../services/awsSes');
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

async function getMailgunService() {
  const integrationConfig = await getIntegrationConfig('mailgun');
  if (integrationConfig) {
    return new MailgunService({
      apiKey: integrationConfig.api_key,
      domain: integrationConfig.domain,
      fromEmail: integrationConfig.from_email,
      fromName: integrationConfig.from_name,
    });
  }
  return new MailgunService();
}

async function getAwsSesService() {
  const integrationConfig = await getIntegrationConfig('aws_ses');
  if (integrationConfig) {
    return new AwsSesService({
      accessKeyId: integrationConfig.access_key_id,
      secretAccessKey: integrationConfig.secret_access_key,
      region: integrationConfig.region,
      fromEmail: integrationConfig.from_email,
      fromName: integrationConfig.from_name,
    });
  }
  return new AwsSesService();
}

// ═══════════════════════════════════════
// SEND EMAIL
// ═══════════════════════════════════════
router.post('/send', async (req, res) => {
  try {
    const { to, subject, html, text, provider } = req.body;
    if (!to || !subject || !html) {
      return res.status(400).json({ error: 'to, subject, and html are required' });
    }

    let result;
    const usedProvider = provider || 'mailgun';

    switch (usedProvider) {
      case 'aws_ses': {
        const ses = await getAwsSesService();
        result = await ses.sendEmail(to, subject, html, text);
        break;
      }
      case 'mailgun':
      default: {
        const mailgun = await getMailgunService();
        result = await mailgun.sendEmail(to, subject, html, text);
        break;
      }
    }

    res.json(result);
  } catch (e) {
    console.error('Send email error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// SEND TEMPLATE EMAIL
// ═══════════════════════════════════════
router.post('/send-template', async (req, res) => {
  try {
    const { to, templateName, variables, provider } = req.body;
    if (!to || !templateName) {
      return res.status(400).json({ error: 'to and templateName are required' });
    }

    let result;
    const usedProvider = provider || 'mailgun';

    switch (usedProvider) {
      case 'aws_ses': {
        const ses = await getAwsSesService();
        result = await ses.sendTemplate(to, templateName, variables);
        break;
      }
      case 'mailgun':
      default: {
        const mailgun = await getMailgunService();
        result = await mailgun.sendTemplate(to, templateName, variables);
        break;
      }
    }

    res.json(result);
  } catch (e) {
    console.error('Send template email error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// GET PROVIDER STATS/BALANCE
// ═══════════════════════════════════════
router.get('/stats/:provider', async (req, res) => {
  try {
    const { provider } = req.params;

    let result;
    switch (provider) {
      case 'aws_ses': {
        const ses = await getAwsSesService();
        result = await ses.getSendQuota();
        break;
      }
      case 'mailgun': {
        const mailgun = await getMailgunService();
        result = await mailgun.getStats();
        break;
      }
      default:
        return res.status(400).json({ error: 'Invalid provider' });
    }

    res.json(result);
  } catch (e) {
    console.error('Get stats error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
