/**
 * MTN Mobile Money (MoMo) Collections Service — Production-ready
 * Supports: Uganda (UG/UGX), Rwanda (RW/RWF), Ghana (GH/GHS), Cameroon, Ivory Coast, Zambia
 * API Docs: https://momodeveloper.mtn.com/docs
 *
 * Setup:
 *   1. Create an account at https://momodeveloper.mtn.com
 *   2. Subscribe to "Collection" product → get Subscription Key
 *   3. In sandbox: create an API User (POST /v1_0/apiuser) with your subscription key
 *   4. Create API Key for that user (POST /v1_0/apiuser/{userId}/apikey)
 *   5. Use those credentials here
 */

const { v4: uuidv4 } = require('uuid');

class MtnMomoService {
  constructor(config) {
    this.subscriptionKey = config.subscription_key; // Ocp-Apim-Subscription-Key
    this.apiUser = config.api_user;                 // X-Reference-Id used to create API user
    this.apiKey = config.api_key;                   // returned by POST /apiuser/{id}/apikey
    this.environment = config.environment || 'sandbox';
    this.country = (config.country || 'UG').toUpperCase();
    this.currency = this._currencyFor(this.country);

    this.baseUrl = this.environment === 'production'
      ? 'https://proxy.momoapi.mtn.com'
      : 'https://sandbox.momodeveloper.mtn.com';

    this.targetEnv = this.environment === 'production'
      ? this._targetEnvFor(this.country)
      : 'sandbox';
  }

  _currencyFor(country) {
    const map = {
      UG: 'UGX', RW: 'RWF', GH: 'GHS',
      CM: 'XAF', CI: 'XOF', ZM: 'ZMW', BJ: 'XOF', GA: 'XAF', CG: 'XAF',
    };
    return map[country] || 'EUR'; // EUR in sandbox
  }

  _targetEnvFor(country) {
    const map = {
      UG: 'mtnuganda', RW: 'mtnrwanda', GH: 'mtnghanasandbox',
      CM: 'mtncameroon', CI: 'mtnivorycoast', ZM: 'mtnzambia',
    };
    return map[country] || 'sandbox';
  }

  _normalizePhone(phone) {
    let p = phone.replace(/\D/g, '');
    const prefixes = { UG: '256', RW: '250', GH: '233', CM: '237', CI: '225', ZM: '260' };
    const prefix = prefixes[this.country];
    if (prefix && p.startsWith('0') && !p.startsWith(prefix)) {
      p = prefix + p.slice(1);
    }
    return p;
  }

  /**
   * Get OAuth2 Bearer token for Collections
   */
  async getToken() {
    const auth = Buffer.from(`${this.apiUser}:${this.apiKey}`).toString('base64');
    const resp = await fetch(`${this.baseUrl}/collection/token/`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Ocp-Apim-Subscription-Key': this.subscriptionKey,
      },
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `MTN MoMo auth failed (${resp.status})`);
    }

    const data = await resp.json();
    return data.access_token;
  }

  /**
   * Initiate a Request-to-Pay (sends push notification to customer)
   */
  async requestToPay(phone, amount, reference, description) {
    try {
      const token = await this.getToken();
      const referenceId = uuidv4(); // unique per transaction
      const msisdn = this._normalizePhone(phone);

      // In sandbox, MTN only accepts EUR
      const currency = this.environment === 'sandbox' ? 'EUR' : this.currency;
      const amountStr = this.environment === 'sandbox' ? '100' : String(Math.round(amount));

      const payload = {
        amount: amountStr,
        currency,
        externalId: reference,
        payer: {
          partyIdType: 'MSISDN',
          partyId: msisdn,
        },
        payerMessage: description || `Payment for ${reference}`,
        payeeNote: reference,
      };

      const resp = await fetch(`${this.baseUrl}/collection/v1_0/requesttopay`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Reference-Id': referenceId,
          'X-Target-Environment': this.targetEnv,
          'Ocp-Apim-Subscription-Key': this.subscriptionKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      // MTN returns 202 Accepted on success (no body)
      if (resp.status === 202) {
        return {
          success: true,
          referenceId,
          message: 'Request to pay sent — customer will get a push notification on their MTN MoMo app',
        };
      }

      const err = await resp.json().catch(() => ({}));
      return {
        success: false,
        message: err.message || err.code || `MTN MoMo request failed (${resp.status})`,
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /**
   * Check the status of a Request-to-Pay
   */
  async checkStatus(referenceId) {
    try {
      const token = await this.getToken();

      const resp = await fetch(`${this.baseUrl}/collection/v1_0/requesttopay/${referenceId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Target-Environment': this.targetEnv,
          'Ocp-Apim-Subscription-Key': this.subscriptionKey,
        },
      });

      const data = await resp.json();

      if (data.status === 'SUCCESSFUL') {
        return {
          success: true,
          status: 'completed',
          transactionId: data.financialTransactionId || referenceId,
          amount: data.amount,
          message: 'Payment successful',
        };
      }

      if (data.status === 'FAILED') {
        const reason = data.reason?.code || data.reason || 'Payment declined';
        return { success: false, status: 'failed', message: reason };
      }

      // PENDING
      return {
        success: false,
        status: 'pending',
        message: 'Waiting for customer to approve in MTN MoMo app...',
      };
    } catch (err) {
      return { success: false, status: 'error', message: err.message };
    }
  }

  /**
   * Sandbox helper: provision a new API User (call once during setup)
   */
  async provisionSandboxApiUser(callbackHost) {
    const userId = uuidv4();
    const resp = await fetch(`${this.baseUrl}/v1_0/apiuser`, {
      method: 'POST',
      headers: {
        'X-Reference-Id': userId,
        'Ocp-Apim-Subscription-Key': this.subscriptionKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ providerCallbackHost: callbackHost || 'https://webhook.site' }),
    });

    if (!resp.ok) {
      throw new Error(`Failed to create API user (${resp.status})`);
    }

    // Create API key for this user
    const keyResp = await fetch(`${this.baseUrl}/v1_0/apiuser/${userId}/apikey`, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': this.subscriptionKey },
    });
    const keyData = await keyResp.json();

    return { apiUser: userId, apiKey: keyData.apiKey };
  }
}

module.exports = MtnMomoService;
