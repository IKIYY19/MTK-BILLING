/**
 * M-Pesa Daraja API Integration
 * Handles STK Push, C2B, B2C, and transaction status
 */

const axios = require('axios');

class MpesaService {
  constructor(config = {}) {
    this.consumerKey = config.consumerKey || process.env.MPESA_CONSUMER_KEY || '';
    this.consumerSecret = config.consumerSecret || process.env.MPESA_CONSUMER_SECRET || '';
    this.shortcode = config.shortcode || process.env.MPESA_SHORTCODE || '';
    this.passkey = config.passkey || process.env.MPESA_PASSKEY || '';
    this.callbackUrl = config.callbackUrl || process.env.MPESA_CALLBACK_URL || '';
    this.environment = config.environment || process.env.MPESA_ENVIRONMENT || '';
    this.baseUrl =
      this.environment === 'live'
        ? 'https://api.safaricom.co.ke'
        : this.environment === 'sandbox'
          ? 'https://sandbox.safaricom.co.ke'
          : '';
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  // Generate OAuth token
  async authenticate() {
    if (
      !this.consumerKey ||
      !this.consumerSecret ||
      !this.shortcode ||
      !this.passkey ||
      !this.callbackUrl ||
      !this.baseUrl
    ) {
      throw new Error('M-Pesa credentials, callback URL, shortcode, and environment must be configured');
    }
    if (this.accessToken && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }

    try {
      const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
      const response = await axios.get(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (50 * 60 * 1000); // 50 minutes
      return this.accessToken;
    } catch (error) {
      console.error('M-Pesa authentication error:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with M-Pesa');
    }
  }

  // STK Push (Lipa Na M-Pesa Online)
  async stkPush(phone, amount, accountReference, description) {
    await this.authenticate();

    const timestamp = this.getTimestamp();
    const password = Buffer.from(`${this.shortcode}${this.passkey}${timestamp}`).toString('base64');

    const payload = {
      BusinessShortCode: this.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount),
      PartyA: this.formatPhone(phone),
      PartyB: this.shortcode,
      PhoneNumber: this.formatPhone(phone),
      CallBackURL: this.callbackUrl,
      AccountReference: accountReference,
      TransactionDesc: description,
    };

    try {
      const request = axios.create({ timeout: 15000 });
      const response = await request.post(
        `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
        payload,
        { headers: { Authorization: `Bearer ${this.accessToken}` } }
      );
      return {
        success: true,
        checkoutRequestId: response.data.CheckoutRequestID,
        merchantRequestId: response.data.MerchantRequestID,
        message: response.data.ResponseDescription,
      };
    } catch (error) {
      console.error('STK Push error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.errorMessage || error.message,
      };
    }
  }

  // Check STK Push transaction status
  async checkStkStatus(checkoutRequestId) {
    await this.authenticate();

    const timestamp = this.getTimestamp();
    const password = Buffer.from(`${this.shortcode}${this.passkey}${timestamp}`).toString('base64');

    const payload = {
      BusinessShortCode: this.shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    };

    try {
      const request = axios.create({ timeout: 15000 });
      const response = await request.post(
        `${this.baseUrl}/mpesa/stkpushquery/v1/query`,
        payload,
        { headers: { Authorization: `Bearer ${this.accessToken}` } }
      );
      return {
        success: response.data.ResultCode === '0',
        resultCode: response.data.ResultCode,
        description: response.data.ResultDesc,
        amount: response.data.Amount,
        mpesaReceipt: response.data.MpesaReceiptNumber,
        phone: response.data.PhoneNumber,
        transactionDate: response.data.TransactionDate,
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.errorMessage || error.message,
      };
    }
  }

  // Register C2B URLs with Safaricom (call once per shortcode in production)
  async registerC2BUrls(validationUrl, confirmationUrl) {
    await this.authenticate();
    const response = await axios.post(
      `${this.baseUrl}/mpesa/c2b/v1/registerurl`,
      {
        ShortCode: this.shortcode,
        ResponseType: 'Completed',
        ConfirmationURL: confirmationUrl,
        ValidationURL: validationUrl,
      },
      { headers: { Authorization: `Bearer ${this.accessToken}` } }
    );
    return response.data;
  }

  // B2C (Business to Customer) - Payouts
  async b2c(phone, amount, occasion, description) {
    await this.authenticate();

    const payload = {
      InitiatorName: process.env.MPESA_INITIATOR_NAME || 'testapi',
      SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL || '',
      CommandID: 'SalaryPayment',
      Amount: Math.round(amount),
      PartyA: this.shortcode,
      PartyB: this.formatPhone(phone),
      Remarks: description,
      QueueTimeOutURL: this.callbackUrl,
      ResultURL: this.callbackUrl,
      Occasion: occasion,
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}/mpesa/b2c/v1/paymentrequest`,
        payload,
        { headers: { Authorization: `Bearer ${this.accessToken}` } }
      );
      return {
        success: true,
        conversationId: response.data.ConversationID,
        originatorConversationId: response.data.OriginatorConversationID,
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Utility: Format phone number
  formatPhone(phone) {
    let cleaned = phone.replace(/\s/g, '');
    if (cleaned.startsWith('0')) {cleaned = '254' + cleaned.substring(1);}
    if (!cleaned.startsWith('254')) {cleaned = '254' + cleaned;}
    return cleaned;
  }

  // Utility: Generate timestamp
  getTimestamp() {
    const now = new Date();
    return now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');
  }
}

module.exports = MpesaService;
