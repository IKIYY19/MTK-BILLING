/**
 * Stripe Payment Gateway - Production Ready
 * Handles payment intents, webhooks, refunds, and customer management
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || '');
const crypto = require('crypto');
const billing = require('./billingData');
const paymentSessions = require('./paymentSessions');

class StripeService {
  constructor() {
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    this.currency = process.env.STRIPE_CURRENCY || 'usd';
  }

  /**
   * Create a Payment Intent for one-time payment
   */
  async createPaymentIntent({ amount, customer_id, invoice_id, description, metadata = {} }) {
    try {
      // Get customer details
      const customer = customer_id ? await billing.getCustomerById(customer_id) : null;
      const invoice = invoice_id ? await billing.getInvoiceById(invoice_id) : null;

      // Create or retrieve Stripe customer
      let stripeCustomerId;
      if (customer?.stripe_customer_id) {
        stripeCustomerId = customer.stripe_customer_id;
      } else if (customer?.email) {
        const stripeCustomer = await stripe.customers.create({
          email: customer.email,
          name: customer.name,
          metadata: { customer_id: customer.id },
        });
        stripeCustomerId = stripeCustomer.id;
        
        // Update customer with Stripe ID
        if (customer_id) {
          await billing.updateCustomer(customer_id, { stripe_customer_id: stripeCustomerId });
        }
      }

      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: this.currency,
        customer: stripeCustomerId,
        description: description || `Payment for ${invoice?.invoice_number || 'Invoice'}`,
        metadata: {
          customer_id: customer_id || '',
          invoice_id: invoice_id || '',
          ...metadata,
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      // Save pending payment session
      await paymentSessions.savePending({
        id: paymentIntent.id,
        invoice_id,
        customer_id,
        amount: parseFloat(amount),
        method: 'stripe',
        status: 'pending',
        checkoutRequestId: paymentIntent.id,
        provider_response: paymentIntent,
      });

      return {
        success: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
      };
    } catch (error) {
      console.error('Stripe payment intent error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Create a Setup Intent for saving payment methods
   */
  async createSetupIntent(customer_id) {
    try {
      const customer = await billing.getCustomerById(customer_id);
      if (!customer?.stripe_customer_id) {
        return { success: false, error: 'Customer not found in Stripe' };
      }

      const setupIntent = await stripe.setupIntents.create({
        customer: customer.stripe_customer_id,
        payment_method_types: ['card'],
      });

      return {
        success: true,
        clientSecret: setupIntent.client_secret,
        setupIntentId: setupIntent.id,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Confirm a payment intent with a payment method
   */
  async confirmPaymentIntent(paymentIntentId, paymentMethodId) {
    try {
      const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: paymentMethodId,
      });

      return {
        success: paymentIntent.status === 'succeeded',
        status: paymentIntent.status,
        paymentIntent,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Retrieve payment intent status
   */
  async getPaymentIntent(paymentIntentId) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      return {
        success: true,
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        metadata: paymentIntent.metadata,
        paymentIntent,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a refund
   */
  async createRefund(paymentIntentId, amount = null, reason = 'requested_by_customer') {
    try {
      const refundParams = {
        payment_intent: paymentIntentId,
        reason,
      };

      if (amount !== null) {
        refundParams.amount = Math.round(amount * 100);
      }

      const refund = await stripe.refunds.create(refundParams);

      return {
        success: true,
        refundId: refund.id,
        amount: refund.amount / 100,
        status: refund.status,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature) {
    if (!this.webhookSecret) {
      console.warn('Stripe webhook secret not configured');
      return false;
    }

    try {
      const event = stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
      return event;
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      return null;
    }
  }

  /**
   * Handle webhook events
   */
  async handleWebhook(event) {
    switch (event.type) {
      case 'payment_intent.succeeded':
        return await this.handlePaymentSucceeded(event.data.object);
      case 'payment_intent.payment_failed':
        return await this.handlePaymentFailed(event.data.object);
      case 'charge.refunded':
        return await this.handleRefund(event.data.object);
      case 'invoice.payment_succeeded':
        return await this.handleSubscriptionPayment(event.data.object);
      default:
        console.log(`Unhandled event type: ${event.type}`);
        return { success: true, message: 'Event received' };
    }
  }

  /**
   * Handle successful payment
   */
  async handlePaymentSucceeded(paymentIntent) {
    try {
      const { customer_id, invoice_id } = paymentIntent.metadata;
      
      // Check if payment already recorded
      const pending = await paymentSessions.findByCheckoutRequestId(paymentIntent.id);
      if (pending?.payment_id) {
        return { success: true, message: 'Payment already recorded' };
      }

      // Create payment record
      const payment = await billing.createPayment({
        invoice_id,
        customer_id,
        amount: paymentIntent.amount / 100,
        method: 'stripe',
        reference: paymentIntent.id,
        gateway_transaction_id: paymentIntent.id,
        notes: `Stripe Payment Intent - ${paymentIntent.id}`,
      });

      // Mark session as completed
      if (pending) {
        await paymentSessions.markCompleted(paymentIntent.id, {
          payment_id: payment.id,
          provider_response: paymentIntent,
        });
      }

      return { success: true, payment };
    } catch (error) {
      console.error('Error handling payment succeeded:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle failed payment
   */
  async handlePaymentFailed(paymentIntent) {
    try {
      await paymentSessions.markFailed(paymentIntent.id, {
        status: 'failed',
        provider_response: paymentIntent,
        error_message: paymentIntent.last_payment_error?.message || 'Payment failed',
      });

      return { success: true, message: 'Payment failure recorded' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle refund
   */
  async handleRefund(charge) {
    try {
      // Find payment by gateway transaction ID
      const payments = await billing.listPayments();
      const payment = payments.find(p => p.gateway_transaction_id === charge.payment_intent);

      if (payment) {
        await billing.updatePayment(payment.id, {
          status: 'refunded',
          refund_amount: charge.amount_refunded / 100,
          refund_reference: charge.refunds?.data[0]?.id,
        });
      }

      return { success: true, message: 'Refund recorded' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle subscription payment (for future use)
   */
  async handleSubscriptionPayment(invoice) {
    try {
      // Handle recurring subscription payments
      console.log('Subscription payment succeeded:', invoice.id);
      return { success: true, message: 'Subscription payment recorded' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get customer's saved payment methods
   */
  async getCustomerPaymentMethods(customer_id) {
    try {
      const customer = await billing.getCustomerById(customer_id);
      if (!customer?.stripe_customer_id) {
        return { success: true, paymentMethods: [] };
      }

      const paymentMethods = await stripe.paymentMethods.list({
        customer: customer.stripe_customer_id,
        type: 'card',
      });

      return {
        success: true,
        paymentMethods: paymentMethods.data.map(pm => ({
          id: pm.id,
          brand: pm.card.brand,
          last4: pm.card.last4,
          exp_month: pm.card.exp_month,
          exp_year: pm.card.exp_year,
        })),
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a saved payment method
   */
  async deletePaymentMethod(paymentMethodId) {
    try {
      await stripe.paymentMethods.detach(paymentMethodId);
      return { success: true, message: 'Payment method deleted' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new StripeService();
