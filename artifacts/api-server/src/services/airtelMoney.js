/**
 * Airtel Money Service — Production-ready STK Push
 * Supports: Kenya (KE), Uganda (UG), Tanzania (TZ), Rwanda (RW), Zambia (ZM)
 * API Docs: https://developers.airtel.africa/documentation
 */

class AirtelMoneyService {
  constructor(config) {
    this.clientId = config.client_id;
    this.clientSecret = config.client_secret;
    this.environment = config.environment || 'sandbox';
    this.country = (config.country || 'KE').toUpperCase();
    this.currency = this._currencyFor(this.country);
    // Airtel uses same base URL for sandbox and production; env is passed in headers
    this.baseUrl = 'https://openapi.airtel.africa';
  }

  _currencyFor(country) {
    const map = { KE: 'KES', UG: 'UGX', TZ: 'TZS', RW: 'RWF', ZM: 'ZMW', MW: 'MWK', NG: 'NGN', GH: 'GHS', CD: 'CDF' };
    return map[country] || 'KES';
  }

  _normalizePhone(phone) {
    // Remove all non-digit chars, strip leading +
    let p = phone.replace(/\D/g, '');
    // For Kenya: 07xx -> 2547xx, 01xx -> 2541xx, already 254xxx stay
    if (this.country === 'KE') {
      if (p.startsWith('07') || p.startsWith('01')) p = '254' + p.slice(1);
      if (p.startsWith('7') && p.length === 9) p = '254' + p;
    }
    // For Uganda: 07xx -> 2567xx
    if (this.country === 'UG') {
      if (p.startsWith('07') || p.startsWith('0')) p = '256' + p.slice(1);
      if (p.length === 9) p = '256' + p;
    }
    // For Tanzania: 07xx -> 2557xx
    if (this.country === 'TZ') {
      if (p.startsWith('07') || p.startsWith('0')) p = '255' + p.slice(1);
    }
    // For Rwanda: 07xx -> 2507xx
    if (this.country === 'RW') {
      if (p.startsWith('07') || p.startsWith('0')) p = '250' + p.slice(1);
    }
    return p;
  }

  async getToken() {
    const resp = await fetch(`${this.baseUrl}/auth/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': '*/*',
      },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error_description || `Airtel auth failed (${resp.status})`);
    }

    const data = await resp.json();
    if (!data.access_token) throw new Error('No access_token in Airtel response');
    return data.access_token;
  }

  async stkPush(phone, amount, reference, description) {
    try {
      const token = await this.getToken();
      const msisdn = this._normalizePhone(phone);

      const payload = {
        reference,
        subscriber: {
          country: this.country,
          currency: this.currency,
          msisdn,
        },
        transaction: {
          amount: parseFloat(amount).toFixed(2),
          country: this.country,
          currency: this.currency,
          id: reference,
        },
      };

      const resp = await fetch(`${this.baseUrl}/merchant/v1/payments/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': '*/*',
          'X-Country': this.country,
          'X-Currency': this.currency,
        },
        body: JSON.stringify(payload),
      });

      const data = await resp.json();

      // Airtel returns status.code '200' for success
      if (data.status?.code === '200' || data.status?.success === true) {
        return {
          success: true,
          transactionId: data.data?.transaction?.id || reference,
          message: data.status?.message || 'STK push sent — check your Airtel Money app',
        };
      }

      return {
        success: false,
        message: data.status?.message || data.error || 'Airtel Money STK push failed',
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async checkStatus(transactionId) {
    try {
      const token = await this.getToken();

      const resp = await fetch(`${this.baseUrl}/standard/v1/payments/${transactionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': '*/*',
          'X-Country': this.country,
          'X-Currency': this.currency,
        },
      });

      const data = await resp.json();
      const tx = data.data?.transaction;
      const code = tx?.status || data.status?.code;

      // Airtel status codes: TS = Transaction Success, TF = Transaction Failed, TIP = In Progress
      if (code === 'TS' || tx?.status === 'SUCCESS') {
        return {
          success: true,
          status: 'completed',
          transactionId: tx?.id || transactionId,
          message: 'Payment successful',
        };
      }
      if (code === 'TF' || tx?.status === 'FAILED') {
        return { success: false, status: 'failed', message: 'Payment failed or cancelled by customer' };
      }

      return { success: false, status: 'pending', message: 'Waiting for customer to approve in Airtel Money app...' };
    } catch (err) {
      return { success: false, status: 'error', message: err.message };
    }
  }
}

module.exports = AirtelMoneyService;
