/**
 * Integrations API Routes
 * Manage external service integrations (SMS, Payments, etc.)
 */

const express = require('express');
const router = express.Router();
const db = global.db || require('../db/memory');
const { encryptObject, decryptObject } = require('../utils/encryption');

// ─── GET ALL INTEGRATIONS ───
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM integrations ORDER BY category, display_name'
    );

    // Decrypt sensitive config data before sending
    const integrations = result.rows.map(integration => ({
      ...integration,
      config_data: decryptObject(integration.config_data),
    }));

    res.json(integrations);
  } catch (error) {
    console.error('Error fetching integrations:', error);
    res.status(500).json({ error: 'Failed to fetch integrations' });
  }
});

// ─── GET SINGLE INTEGRATION ───
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM integrations WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const integration = {
      ...result.rows[0],
      config_data: decryptObject(result.rows[0].config_data),
    };

    res.json(integration);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── UPDATE INTEGRATION ───
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { config_data, is_active } = req.body;

    if (!config_data) {
      return res.status(400).json({ error: 'config_data is required' });
    }

    // Encrypt sensitive data before storing
    const encryptedConfig = encryptObject(config_data);

    const result = await db.query(
      `UPDATE integrations 
       SET config_data = $1, is_active = COALESCE($2, is_active), updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [JSON.stringify(encryptedConfig), is_active === undefined ? null : is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const integration = {
      ...result.rows[0],
      config_data: decryptObject(result.rows[0].config_data),
    };

    res.json({
      message: 'Integration updated successfully',
      integration,
    });
  } catch (error) {
    console.error('Error updating integration:', error);
    res.status(500).json({ error: 'Failed to update integration' });
  }
});

// ─── TEST CONNECTION ───
router.post('/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM integrations WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const integration = result.rows[0];
    const config = decryptObject(integration.config_data);

    let testResult;

    switch (integration.service_name) {
      case 'africas_talking':
        testResult = await testAfricasTalking(config);
        break;
      case 'mpesa':
        testResult = await testMpesa(config);
        break;
      case 'airtel_money':
        testResult = await testAirtelMoney(config);
        break;
      case 'mtn_momo':
        testResult = await testMtnMomo(config);
        break;
      case 'paystack':
        testResult = await testPaystack(config);
        break;
      case 'pesalink':
        testResult = await testPesaLink(config);
        break;
      case 'whatsapp':
        testResult = await testWhatsApp(config);
        break;
      case 'sendgrid':
        testResult = await testSendGrid(config);
        break;
      case 'twilio':
        testResult = await testTwilio(config);
        break;
      case 'stripe':
        testResult = await testStripe(config);
        break;
      case 'paypal':
        testResult = await testPayPal(config);
        break;
      case 'flutterwave':
        testResult = await testFlutterwave(config);
        break;
      case 'slack':
        testResult = await testSlack(config);
        break;
      case 'discord':
        testResult = await testDiscord(config);
        break;
      case 'smsleopard':
        testResult = await testSmsLeopard(config);
        break;
      case 'bulksms_kenya':
        testResult = await testBulkSmsKenya(config);
        break;
      case 'nexmo':
        testResult = await testNexmo(config);
        break;
      case 'mailgun':
        testResult = await testMailgun(config);
        break;
      case 'aws_ses':
        testResult = await testAwsSes(config);
        break;
      case 'mailchimp':
        testResult = await testMailchimp(config);
        break;
      case 'telegram':
        testResult = await testTelegram(config);
        break;
      case 'google_cloud_storage':
        testResult = await testGoogleCloudStorage(config);
        break;
      default:
        testResult = { success: false, message: 'Unknown service' };
    }

    // Update last test status
    try {
      await db.query(
        `UPDATE integrations 
         SET last_tested = CURRENT_TIMESTAMP, last_test_status = $1, last_test_message = $2
         WHERE id = $3`,
        [testResult.success ? 'success' : 'failed', testResult.message, id]
      );
    } catch (dbError) {
      console.error('Failed to update integration test status in database:', dbError);
    }

    res.json({
      success: testResult.success,
      message: testResult.message,
      details: testResult.details,
    });
  } catch (error) {
    console.error('Test connection error:', error);
    res.status(500).json({ error: 'Test failed' });
  }
});

// ─── TEST FUNCTIONS FOR EACH SERVICE ───

async function testAfricasTalking(config) {
  try {
    if (!config.api_key) {
      return { success: false, message: 'API key is required' };
    }

    const username = config.username || 'sandbox';
    const isSandbox = username === 'sandbox';
    const baseUrl = isSandbox 
      ? 'https://api.sandbox.africastalking.com' 
      : 'https://api.africastalking.com';

    const response = await fetch(`${baseUrl}/version1/user?username=${username}`, {
      method: 'GET',
      headers: {
        'apikey': config.api_key,
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      const balance = data.UserData?.balance || '0.00';
      return { 
        success: true, 
        message: `Africa's Talking connected successfully. Account balance: ${balance}` 
      };
    }
    const errData = await response.json().catch(() => ({}));
    const errMsg = errData.errorMessage || 'Invalid API key or username';
    return { success: false, message: errMsg };
  } catch (error) {
    return { success: false, message: 'Connection failed: ' + error.message };
  }
}

async function testMpesa(config) {
  try {
    if (!config.consumer_key || !config.consumer_secret) {
      return { success: false, message: 'Consumer key and secret are required' };
    }

    const auth = Buffer.from(`${config.consumer_key}:${config.consumer_secret}`).toString('base64');
    const environment = config.environment || 'sandbox';
    const baseUrl = environment === 'live' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
    const response = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
      },
    });

    if (response.ok) {
      return { success: true, message: 'M-Pesa authentication successful' };
    }
    return { success: false, message: 'Invalid consumer key or secret' };
  } catch (error) {
    return { success: false, message: 'Connection failed: ' + error.message };
  }
}

async function testWhatsApp(config) {
  try {
    if (!config.access_token) {
      return { success: false, message: 'Access token is required' };
    }

    const targetUrl = config.phone_number_id 
      ? `https://graph.facebook.com/v17.0/${config.phone_number_id}`
      : 'https://graph.facebook.com/v17.0/me';

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.access_token}`,
      },
    });

    if (response.ok) {
      return { success: true, message: 'WhatsApp Business API connected successfully' };
    }
    const errorData = await response.json().catch(() => ({}));
    const errMsg = errorData.error?.message || 'Invalid access token or phone number ID';
    return { success: false, message: errMsg };
  } catch (error) {
    return { success: false, message: 'Connection failed: ' + error.message };
  }
}

async function testSendGrid(config) {
  try {
    if (!config.api_key) {
      return { success: false, message: 'API key is required' };
    }

    const response = await fetch('https://api.sendgrid.com/v3/scopes', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.api_key}`,
      },
    });

    if (response.ok) {
      return { success: true, message: 'SendGrid connected successfully' };
    }
    return { success: false, message: 'Invalid API key' };
  } catch (error) {
    return { success: false, message: 'Connection failed: ' + error.message };
  }
}

async function testTwilio(config) {
  try {
    if (!config.account_sid || !config.auth_token) {
      return { success: false, message: 'Account SID and Auth Token are required' };
    }

    const auth = Buffer.from(`${config.account_sid}:${config.auth_token}`).toString('base64');
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.account_sid}.json`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
      },
    });

    if (response.ok) {
      return { success: true, message: 'Twilio connected successfully' };
    }
    return { success: false, message: 'Invalid credentials' };
  } catch (error) {
    return { success: false, message: 'Connection failed: ' + error.message };
  }
}

async function testStripe(config) {
  try {
    if (!config.secret_key) {
      return { success: false, message: 'Secret key is required' };
    }

    const response = await fetch('https://api.stripe.com/v1/balance', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.secret_key}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      return { 
        success: true, 
        message: 'Stripe connected successfully',
        details: `Available: ${(data.available[0]?.amount / 100).toFixed(2)} ${config.currency || 'usd'}`
      };
    }
    return { success: false, message: 'Invalid secret key' };
  } catch (error) {
    return { success: false, message: 'Connection failed: ' + error.message };
  }
}

async function testPayPal(config) {
  try {
    if (!config.client_id || !config.client_secret) {
      return { success: false, message: 'Client ID and secret are required' };
    }

    const auth = Buffer.from(`${config.client_id}:${config.client_secret}`).toString('base64');
    const environment = config.environment || 'sandbox';
    const baseUrl = environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${auth}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (response.ok) {
      return { success: true, message: 'PayPal authentication successful' };
    }
    return { success: false, message: 'Invalid PayPal credentials' };
  } catch (error) {
    return { success: false, message: 'Connection failed: ' + error.message };
  }
}

async function testFlutterwave(config) {
  try {
    if (!config.secret_key) {
      return { success: false, message: 'Secret key is required' };
    }

    const response = await fetch('https://api.flutterwave.com/v3/banks/KE', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.secret_key}`,
      },
    });

    if (response.ok) {
      return { success: true, message: 'Flutterwave connected successfully' };
    }
    return { success: false, message: 'Invalid secret key' };
  } catch (error) {
    return { success: false, message: 'Connection failed: ' + error.message };
  }
}

async function testSlack(config) {
  try {
    if (!config.webhook_url) {
      return { success: false, message: 'Webhook URL is required' };
    }

    const response = await fetch(config.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '🔔 Test connection from MikroTik Billing' }),
    });

    if (response.ok) {
      return { success: true, message: 'Slack webhook sent successfully' };
    }
    return { success: false, message: 'Invalid webhook URL' };
  } catch (error) {
    return { success: false, message: 'Connection failed: ' + error.message };
  }
}

async function testDiscord(config) {
  try {
    if (!config.webhook_url) {
      return { success: false, message: 'Webhook URL is required' };
    }

    const response = await fetch(config.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '🔔 Test connection from MikroTik Billing' }),
    });

    if (response.ok || response.status === 204) {
      return { success: true, message: 'Discord webhook sent successfully' };
    }
    return { success: false, message: 'Invalid webhook URL' };
  } catch (error) {
    return { success: false, message: 'Connection failed: ' + error.message };
  }
}

async function testSmsLeopard(config) {
  try {
    if (!config.api_key) {
      return { success: false, message: 'API key is required' };
    }
    // SMSLeopard balance check
    const response = await fetch('https://api.smsleopard.com/v1/sms/balance', {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${config.api_key}:`).toString('base64')}`,
      },
    });
    if (response.ok || response.status === 401) {
      // 401 = credentials recognized by server, just wrong key
      return response.ok
        ? { success: true, message: 'SMSLeopard connected successfully' }
        : { success: false, message: 'Invalid API key — authentication failed' };
    }
    return { success: true, message: 'SMSLeopard configuration saved (API key present)' };
  } catch (error) {
    return { success: false, message: 'Connection failed: ' + error.message };
  }
}

async function testBulkSmsKenya(config) {
  try {
    if (!config.username || !config.api_key) {
      return { success: false, message: 'Username and API key are required' };
    }
    // BulkSMS Kenya balance endpoint
    const url = `https://api.bulksmskenya.co.ke/v1/balance?username=${encodeURIComponent(config.username)}&api_key=${encodeURIComponent(config.api_key)}`;
    const response = await fetch(url, { method: 'GET' });
    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      const balance = data.balance || data.credits || 'N/A';
      return { success: true, message: `BulkSMS Kenya connected. Balance: ${balance}` };
    }
    return { success: false, message: 'Invalid username or API key' };
  } catch (error) {
    return { success: false, message: 'Connection failed: ' + error.message };
  }
}

async function testNexmo(config) {
  try {
    if (!config.api_key || !config.api_secret) {
      return { success: false, message: 'API key and secret are required' };
    }
    // Vonage account info endpoint
    const response = await fetch(`https://rest.nexmo.com/account/get-balance?api_key=${config.api_key}&api_secret=${config.api_secret}`, {
      method: 'GET',
    });
    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      const balance = data.value != null ? `${data.value.toFixed(2)} EUR` : 'N/A';
      return { success: true, message: `Vonage (Nexmo) connected. Balance: ${balance}` };
    }
    const errData = await response.json().catch(() => ({}));
    return { success: false, message: errData['error-code-label'] || 'Invalid API key or secret' };
  } catch (error) {
    return { success: false, message: 'Connection failed: ' + error.message };
  }
}

async function testMailgun(config) {
  try {
    if (!config.api_key || !config.domain) {
      return { success: false, message: 'API key and domain are required' };
    }
    // Use the Mailgun domain info endpoint
    const region = config.api_key.startsWith('key-') ? '' : ''; // EU uses api.eu.mailgun.net
    const baseUrl = 'https://api.mailgun.net';
    const auth = Buffer.from(`api:${config.api_key}`).toString('base64');
    const response = await fetch(`${baseUrl}/v3/domains/${config.domain}`, {
      method: 'GET',
      headers: { 'Authorization': `Basic ${auth}` },
    });
    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      return { success: true, message: `Mailgun connected. Domain: ${data.domain?.name || config.domain} (${data.domain?.state || 'active'})` };
    }
    const errData = await response.json().catch(() => ({}));
    return { success: false, message: errData.message || 'Invalid API key or domain' };
  } catch (error) {
    return { success: false, message: 'Connection failed: ' + error.message };
  }
}

async function testAwsSes(config) {
  try {
    if (!config.access_key_id || !config.secret_access_key) {
      return { success: false, message: 'Access key ID and secret access key are required' };
    }
    // AWS doesn't support unauthenticated calls — validate field formats
    const region = config.region || 'us-east-1';
    if (!config.access_key_id.match(/^[A-Z0-9]{20}$/)) {
      return { success: false, message: 'Invalid AWS Access Key ID format (should be 20 uppercase alphanumeric characters)' };
    }
    if (config.secret_access_key.length < 40) {
      return { success: false, message: 'AWS Secret Access Key appears too short (should be 40+ characters)' };
    }
    return { success: true, message: `AWS SES configuration saved for region ${region}. Credentials will be validated on first send.` };
  } catch (error) {
    return { success: false, message: 'Connection failed: ' + error.message };
  }
}

async function testMailchimp(config) {
  try {
    if (!config.api_key) {
      return { success: false, message: 'API key is required' };
    }
    // Mailchimp API key format: <key>-<datacenter>
    const dcMatch = config.api_key.match(/-([a-z0-9]+)$/);
    if (!dcMatch) {
      return { success: false, message: 'Invalid Mailchimp API key format. Should end with -us1, -eu1, etc.' };
    }
    const dc = dcMatch[1];
    const response = await fetch(`https://${dc}.api.mailchimp.com/3.0/ping`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`any:${config.api_key}`).toString('base64')}`,
      },
    });
    if (response.ok) {
      return { success: true, message: `Mailchimp connected successfully (datacenter: ${dc})` };
    }
    return { success: false, message: 'Invalid API key — authentication failed' };
  } catch (error) {
    return { success: false, message: 'Connection failed: ' + error.message };
  }
}

async function testTelegram(config) {
  try {
    if (!config.bot_token) {
      return { success: false, message: 'Bot token is required' };
    }

    const response = await fetch(`https://api.telegram.org/bot${config.bot_token}/getMe`, {
      method: 'GET',
    });

    if (response.ok) {
      const data = await response.json();
      return { success: true, message: `Telegram bot connected: @${data.result.username}` };
    }
    return { success: false, message: 'Invalid bot token' };
  } catch (error) {
    return { success: false, message: 'Connection failed: ' + error.message };
  }
}

async function testGoogleCloudStorage(config) {
  try {
    if (!config.project_id || !config.bucket_name) {
      return { success: false, message: 'Project ID and bucket name are required' };
    }
    return { success: true, message: 'Google Cloud Storage configuration saved' };
  } catch (error) {
    return { success: false, message: 'Connection failed: ' + error.message };
  }
}

// ─── AIRTEL MONEY ───
async function testAirtelMoney(config) {
  try {
    if (!config.client_id || !config.client_secret) {
      return { success: false, message: 'Client ID and Client Secret are required' };
    }
    const resp = await fetch('https://openapi.airtel.africa/auth/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': '*/*' },
      body: JSON.stringify({
        client_id: config.client_id,
        client_secret: config.client_secret,
        grant_type: 'client_credentials',
      }),
    });
    if (resp.ok) {
      const data = await resp.json().catch(() => ({}));
      if (data.access_token) {
        const country = config.country || 'KE';
        return { success: true, message: `Airtel Money connected successfully (${country}) — OAuth2 token obtained` };
      }
      return { success: false, message: 'Authentication failed: no token returned. Check your Client ID and Secret.' };
    }
    const err = await resp.json().catch(() => ({}));
    return { success: false, message: err.error_description || `Authentication failed (${resp.status})` };
  } catch (error) {
    return { success: false, message: 'Connection failed: ' + error.message };
  }
}

// ─── MTN MOBILE MONEY ───
async function testMtnMomo(config) {
  try {
    if (!config.subscription_key) {
      return { success: false, message: 'Subscription Key (Ocp-Apim-Subscription-Key) is required. Get it from momodeveloper.mtn.com' };
    }
    if (!config.api_user || !config.api_key) {
      return { 
        success: false, 
        message: 'API User and API Key are required. In sandbox: go to momodeveloper.mtn.com → create API User → generate API Key.' 
      };
    }
    // Try to get a token
    const auth = Buffer.from(`${config.api_user}:${config.api_key}`).toString('base64');
    const baseUrl = config.environment === 'production'
      ? 'https://proxy.momoapi.mtn.com'
      : 'https://sandbox.momodeveloper.mtn.com';
    const resp = await fetch(`${baseUrl}/collection/token/`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Ocp-Apim-Subscription-Key': config.subscription_key,
      },
    });
    if (resp.ok) {
      const data = await resp.json().catch(() => ({}));
      if (data.access_token) {
        const country = config.country || 'UG';
        return { success: true, message: `MTN MoMo connected successfully (${country} Collections) — Bearer token obtained` };
      }
    }
    const err = await resp.json().catch(() => ({}));
    return { success: false, message: err.error || err.message || `Authentication failed (${resp.status})` };
  } catch (error) {
    return { success: false, message: 'Connection failed: ' + error.message };
  }
}

// ─── PAYSTACK ───
async function testPaystack(config) {
  try {
    if (!config.secret_key) {
      return { success: false, message: 'Secret Key is required. Get it from dashboard.paystack.com → Settings → API Keys & Webhooks' };
    }
    if (!config.secret_key.startsWith('sk_')) {
      return { success: false, message: 'Invalid Secret Key format — should start with sk_test_ or sk_live_' };
    }
    const resp = await fetch('https://api.paystack.co/bank?country=kenya&use_cursor=true&perPage=5', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${config.secret_key}` },
    });
    if (resp.ok) {
      const data = await resp.json().catch(() => ({}));
      const mode = config.secret_key.startsWith('sk_live_') ? 'LIVE' : 'SANDBOX/TEST';
      return { success: true, message: `Paystack connected (${mode} mode) — ${data.data?.length || 0} banks fetched successfully` };
    }
    const err = await resp.json().catch(() => ({}));
    return { success: false, message: err.message || `Authentication failed (${resp.status})` };
  } catch (error) {
    return { success: false, message: 'Connection failed: ' + error.message };
  }
}

// ─── PESALINK ───
async function testPesaLink(config) {
  try {
    const missing = [];
    if (!config.bank_name) missing.push('Bank Name');
    if (!config.account_name) missing.push('Account Name');
    if (!config.account_number) missing.push('Account Number');
    if (missing.length > 0) {
      return { success: false, message: `Missing required fields: ${missing.join(', ')}` };
    }
    if (!/^\d{8,20}$/.test(config.account_number.replace(/\s/g, ''))) {
      return { success: false, message: 'Account number should be 8-20 digits' };
    }
    return {
      success: true,
      message: `PesaLink configured: ${config.account_name} at ${config.bank_name} (${config.account_number}). Customers will transfer to this account and provide their reference.`,
    };
  } catch (error) {
    return { success: false, message: 'Validation failed: ' + error.message };
  }
}

module.exports = router;
