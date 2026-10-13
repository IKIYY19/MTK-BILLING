/**
 * Flutterwave Payment Gateway - Production Ready
 * Popular in Africa - supports mobile money, card, bank transfer
 */

const axios = require('axios');
const crypto = require('crypto');
const billing = require('./billingData');
const paymentSessions = require('./paymentSessions');

function resolveRedirectUrl(redirectUrl) {
  if (redirectUrl) return redirectUrl;
  const appUrl = process.env.APP_URL?.replace(/\/+$/, '');
  return appUrl ? `${appUrl}/payment/callback` : null;
}

class FlutterwaveService {
  constructor() {
    this.secretKey = process.env.FLUTTERWAVE_SECRET_KEY || '';
    this.publicKey = process.env.FLUTTERWAVE_PUBLIC_KEY || '';
    this.encryptionKey = process.env.FLUTTERWAVE_ENCRYPTION_KEY || '';
    this.environment = process.env.FLUTTERWAVE_ENVIRONMENT || '';
    this.baseUrl = this.environment === 'live'
      ? 'https://api.flutterwave.com/v3'
      : 'https://api.flutterwave.com/v3';
  }

  /**
   * Encrypt payment payload (required for card payments)
   */
  encryptPayload(data) {
    if (!this.encryptionKey) {
      return JSON.stringify(data);
    }

    try {
      const key = crypto.createHash('md5').update(this.encryptionKey).digest('hex');
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      
      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return `${iv.toString('hex')}:${encrypted}`;
    } catch (error) {
      console.error('Encryption error:', error);
      return JSON.stringify(data);
    }
  }

  /**
   * Create a payment link
   */
  async createPaymentLink({ amount, currency = 'KES', customer_id, invoice_id, description, redirect_url, metadata = {} }) {
    try {
      const invoice = invoice_id ? await billing.getInvoiceById(invoice_id) : null;
      const resolvedCustomerId = customer_id || invoice?.customer_id;
      const customer = resolvedCustomerId
        ? await billing.getCustomerById(resolvedCustomerId)
        : null;

      if (!customer?.email) {
        return {
          success: false,
          error: 'A customer email is required for Flutterwave payments.',
        };
      }

      const callbackUrl = resolveRedirectUrl(redirect_url);
      if (!callbackUrl) {
        return {
          success: false,
          error: 'Configure APP_URL or provide a payment redirect URL.',
        };
      }

      const payload = {
        tx_ref: `TX-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        amount: amount,
        currency: currency,
        redirect_url: callbackUrl,
        customer: {
          email: customer.email,
          name: customer.name || undefined,
          phone_number: customer?.phone || '',
        },
        customizations: {
          title: description || 'Payment',
          description: description || `Payment for ${invoice?.invoice_number || 'Invoice'}`,
          logo: process.env.COMPANY_LOGO || '',
        },
        meta: {
          customer_id: customer_id || '',
          invoice_id: invoice_id || '',
          ...metadata,
        },
      };

      const response = await axios.post(
        `${this.baseUrl}/payments`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.secretKey}`,
          },
        }
      );

      const data = response.data.data;

      // Save pending payment session
      await paymentSessions.savePending({
        id: data.link,
        invoice_id,
        customer_id,
        amount: parseFloat(amount),
        method: 'flutterwave',
        status: 'pending',
        checkoutRequestId: data.link,
        provider_response: data,
      });

      return {
        success: true,
        paymentLink: data.link,
        txRef: payload.tx_ref,
        amount: data.amount,
        currency: data.currency,
      };
    } catch (error) {
      console.error('Flutterwave payment link error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Create a mobile money payment (M-Pesa, Airtel, etc.)
   */
  async createMobileMoneyPayment({ amount, currency, phone, provider, customer_id, invoice_id, description, metadata = {} }) {
    try {
      const invoice = invoice_id ? await billing.getInvoiceById(invoice_id) : null;
      const resolvedCustomerId = customer_id || invoice?.customer_id;
      const customer = resolvedCustomerId
        ? await billing.getCustomerById(resolvedCustomerId)
        : null;

      if (!customer?.email) {
        return {
          success: false,
          error: 'A customer email is required for Flutterwave payments.',
        };
      }

      const callbackUrl = resolveRedirectUrl();
      if (!callbackUrl) {
        return {
          success: false,
          error: 'Configure APP_URL for Flutterwave payment callbacks.',
        };
      }

      const payload = {
        tx_ref: `TX-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        amount: amount,
        currency: currency,
        email: customer.email,
        phone_number: phone,
        payment_type: provider, // mpesa, airtelmoney, etc.
        redirect_url: callbackUrl,
        meta: {
          customer_id: customer_id || '',
          invoice_id: invoice_id || '',
          ...metadata,
        },
      };

      const response = await axios.post(
        `${this.baseUrl}/charges?type=${provider}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.secretKey}`,
          },
        }
      );

      const data = response.data.data;

      // Save pending payment session
      await paymentSessions.savePending({
        id: data.id,
        invoice_id,
        customer_id,
        amount: parseFloat(amount),
        method: `flutterwave_${provider}`,
        status: 'pending',
        checkoutRequestId: data.id,
        provider_response: data,
      });

      return {
        success: true,
        transactionId: data.id,
        txRef: payload.tx_ref,
        status: data.status,
        message: data.message,
      };
    } catch (error) {
      console.error('Flutterwave mobile money error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Verify a transaction
   */
  async verifyTransaction(transactionId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/transactions/${transactionId}/verify`,
        {
          headers: {
            'Authorization': `Bearer ${this.secretKey}`,
          },
        }
      );

      const data = response.data.data;

      if (data.status === 'successful') {
        const meta = data.meta || {};
        
        // Check if payment already recorded
        const pending = await paymentSessions.findByCheckoutRequestId(data.id);
        if (pending?.payment_id) {
          return {
            success: true,
            status: 'completed',
            alreadyRecorded: true,
            transaction: data,
          };
        }

        // Create payment record
        const payment = await billing.createPayment({
          invoice_id: meta.invoice_id,
          customer_id: meta.customer_id,
          amount: parseFloat(data.amount),
          method: data.payment_type || 'flutterwave',
          reference: data.flw_ref,
          gateway_transaction_id: data.id,
          notes: `Flutterwave Transaction - ${data.tx_ref}`,
        });

        // Mark session as completed
        if (pending) {
          await paymentSessions.markCompleted(data.id, {
            payment_id: payment.id,
            provider_response: data,
          });
        }

        return {
          success: true,
          status: 'completed',
          payment,
          transaction: data,
        };
      }

      return {
        success: false,
        status: data.status,
        message: data.processor_response || 'Transaction not successful',
        transaction: data,
      };
    } catch (error) {
      console.error('Flutterwave verification error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Refund a transaction
   */
  async refundTransaction(transactionId, amount = null) {
    try {
      const payload = {};
      if (amount !== null) {
        payload.amount = amount;
      }

      const response = await axios.post(
        `${this.baseUrl}/transactions/${transactionId}/refund`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.secretKey}`,
          },
        }
      );

      const data = response.data.data;

      // Update payment record
      const payments = await billing.listPayments();
      const payment = payments.find(p => p.gateway_transaction_id === transactionId);
      if (payment) {
        await billing.updatePayment(payment.id, {
          status: 'refunded',
          refund_amount: parseFloat(data.amount_refunded || amount || payment.amount),
          refund_reference: data.id,
        });
      }

      return {
        success: true,
        refundId: data.id,
        amount: data.amount_refunded,
        currency: data.currency,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Get transaction details
   */
  async getTransaction(transactionId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/transactions/${transactionId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.secretKey}`,
          },
        }
      );

      return {
        success: true,
        transaction: response.data.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(headers, body) {
    const signature = headers['verif-hash'];
    if (!signature) {
      return false;
    }

    if (!this.secretKey) {
      console.warn('Flutterwave secret key not configured');
      return false;
    }

    const computedSignature = crypto
      .createHmac('sha256', this.secretKey)
      .update(JSON.stringify(body))
      .digest('hex');

    return signature === computedSignature;
  }

  /**
   * Handle webhook events
   */
  async handleWebhook(event) {
    const eventType = event.event;
    const data = event.data;

    switch (eventType) {
      case 'charge.completed':
        return await this.handleChargeCompleted(data);
      case 'transfer.completed':
        return await this.handleTransferCompleted(data);
      case 'refund.completed':
        return await this.handleRefundCompleted(data);
      default:
        console.log(`Unhandled Flutterwave event: ${eventType}`);
        return { success: true, message: 'Event received' };
    }
  }

  /**
   * Handle successful charge
   */
  async handleChargeCompleted(charge) {
    try {
      if (charge.status !== 'successful') {
        return { success: true, message: 'Charge not successful' };
      }

      const meta = charge.meta || {};
      
      // Check if payment already recorded
      const pending = await paymentSessions.findByCheckoutRequestId(charge.id);
      if (pending?.payment_id) {
        return { success: true, message: 'Payment already recorded' };
      }

      // Create payment record
      const payment = await billing.createPayment({
        invoice_id: meta.invoice_id,
        customer_id: meta.customer_id,
        amount: parseFloat(charge.amount),
        method: charge.payment_type || 'flutterwave',
        reference: charge.flw_ref,
        gateway_transaction_id: charge.id,
        notes: `Flutterwave Charge - ${charge.tx_ref}`,
      });

      // Mark session as completed
      if (pending) {
        await paymentSessions.markCompleted(charge.id, {
          payment_id: payment.id,
          provider_response: charge,
        });
      }

      return { success: true, payment };
    } catch (error) {
      console.error('Error handling Flutterwave charge completed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle transfer completed (for payouts)
   */
  async handleTransferCompleted(transfer) {
    try {
      console.log('Transfer completed:', transfer.id);
      return { success: true, message: 'Transfer recorded' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle refund completed
   */
  async handleRefundCompleted(refund) {
    try {
      const transactionId = refund.transaction_id;
      
      // Find payment by gateway transaction ID
      const payments = await billing.listPayments();
      const payment = payments.find(p => p.gateway_transaction_id === transactionId);

      if (payment) {
        await billing.updatePayment(payment.id, {
          status: 'refunded',
          refund_amount: parseFloat(refund.amount),
          refund_reference: refund.id,
        });
      }

      return { success: true, message: 'Refund recorded' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get supported banks for bank transfer
   */
  async getBanks(country = 'KE') {
    try {
      const response = await axios.get(
        `${this.baseUrl}/banks/${country}`,
        {
          headers: {
            'Authorization': `Bearer ${this.secretKey}`,
          },
        }
      );

      return {
        success: true,
        banks: response.data.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }
}

module.exports = new FlutterwaveService();
