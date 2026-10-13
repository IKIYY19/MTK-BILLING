/**
 * Paystack Payment Service — Production-ready
 * Supports: Nigeria (NGN), Kenya (KES), Ghana (GHS), South Africa (ZAR), Uganda (UGX)
 * Channels: Card, Bank Transfer, Mobile Money, USSD, QR
 * API Docs: https://paystack.com/docs/api/
 *
 * Setup:
 *   1. Create account at https://paystack.com
 *   2. Get your Secret Key from Settings → API Keys & Webhooks
 *   3. Set Webhook URL to: https://yourapp.onrender.com/api/payments/paystack/webhook
 */

const crypto = require('crypto');

class PaystackService {
  constructor(config) {
    this.secretKey = config.secret_key;
    this.publicKey = config.public_key;
    this.baseUrl = 'https://api.paystack.co';
  }

  _headers() {
    return {
      'Authorization': `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    };
  }

  /**
   * Initialize a transaction — returns a hosted checkout URL
   * Customer is redirected to Paystack's secure page to pay
   */
  async initializeTransaction({ email, amount, reference, callbackUrl, metadata, channels, currency }) {
    if (!email) throw new Error('Customer email is required for Paystack');
    if (!amount || amount <= 0) throw new Error('Amount must be greater than 0');

    const resp = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({
        email,
        amount: Math.round(parseFloat(amount) * 100), // convert to lowest denomination (kobo/pesewas/cents)
        reference,
        callback_url: callbackUrl,
        currency: currency || 'KES',
        channels: channels || ['card', 'bank', 'ussd', 'mobile_money'],
        metadata: {
          ...metadata,
          custom_fields: [
            { display_name: 'Invoice', variable_name: 'invoice_id', value: metadata?.invoice_id || '' },
            { display_name: 'Customer', variable_name: 'customer_id', value: metadata?.customer_id || '' },
          ],
        },
      }),
    });

    const data = await resp.json();

    if (!data.status) {
      throw new Error(data.message || 'Paystack initialization failed');
    }

    return {
      success: true,
      reference: data.data.reference,
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
    };
  }

  /**
   * Verify a transaction after redirect (call with the reference from callback)
   */
  async verifyTransaction(reference) {
    const resp = await fetch(`${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: this._headers(),
    });

    const data = await resp.json();

    if (!data.status) {
      return { success: false, status: 'error', message: data.message };
    }

    if (data.data.status === 'success') {
      return {
        success: true,
        status: 'completed',
        reference: data.data.reference,
        amount: data.data.amount / 100,
        currency: data.data.currency,
        channel: data.data.channel,
        paidAt: data.data.paid_at,
        gatewayResponse: data.data.gateway_response,
        customerEmail: data.data.customer?.email,
        customerId: data.data.metadata?.customer_id,
        invoiceId: data.data.metadata?.invoice_id,
        cardType: data.data.authorization?.card_type,
        bank: data.data.authorization?.bank,
      };
    }

    return {
      success: false,
      status: data.data.status,
      message: data.data.gateway_response || 'Transaction was not successful',
    };
  }

  /**
   * Verify Paystack webhook signature (HMAC-SHA512)
   * body must be the raw Buffer from express.raw()
   */
  verifyWebhookSignature(body, signature) {
    if (!signature || !this.secretKey) return false;
    const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    const hash = crypto.createHmac('sha512', this.secretKey).update(rawBody).digest('hex');
    return hash === signature;
  }

  /**
   * Handle a verified Paystack webhook event
   */
  async handleWebhookEvent(event, { billing, notificationService, autoProvision, alertSystem }) {
    if (event.event === 'charge.success') {
      const txData = event.data;
      const customerId = txData.metadata?.customer_id || null;
      const invoiceId = txData.metadata?.invoice_id || null;
      const amount = txData.amount / 100;

      if (!customerId) {
        console.warn('[Paystack Webhook] No customer_id in metadata — skipping payment record');
        return { success: true, skipped: true };
      }

      const payment = await billing.createPayment({
        invoice_id: invoiceId || null,
        customer_id: customerId,
        amount,
        method: 'paystack',
        reference: txData.reference,
        gateway_transaction_id: String(txData.id),
        notes: `Paystack - ${txData.channel} - ${txData.currency}${txData.authorization?.card_type ? ` - ${txData.authorization.card_type}` : ''}`,
      });

      const customer = await billing.getCustomerById(customerId).catch(() => null);
      const invoice = invoiceId ? await billing.getInvoiceById(invoiceId).catch(() => null) : null;

      if (customer?.phone) {
        notificationService.triggerSMS('payment_received', { customer, invoice, payment }).catch(() => {});
      }

      autoProvision.autoProvisionOnPayment(payment).catch(() => {});

      if (invoice?.invoice_number) {
        alertSystem.sendPaymentReceived(customerId, amount, invoice.invoice_number, txData.reference).catch(() => {});
      }

      return { success: true, payment };
    }

    // Other events we acknowledge but don't process (transfer.success, refund.processed, etc.)
    return { success: true, event: event.event, ignored: true };
  }

  /**
   * List banks (used for PesaLink and bank transfer display)
   */
  async listBanks(country) {
    const resp = await fetch(`${this.baseUrl}/bank?country=${country || 'kenya'}`, {
      headers: this._headers(),
    });
    const data = await resp.json();
    return data.status ? data.data : [];
  }

  /**
   * Create a dedicated virtual account for a customer (Paystack Dedicated NUBAN)
   * Available in Nigeria only currently
   */
  async createDedicatedVirtualAccount(customerId, email, name) {
    const resp = await fetch(`${this.baseUrl}/dedicated_account`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({
        customer: customerId,
        preferred_bank: 'wema-bank',
      }),
    });
    const data = await resp.json();
    return data.status ? data.data : null;
  }
}

module.exports = PaystackService;
