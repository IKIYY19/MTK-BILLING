/**
 * Payment Gateways - Kenyan payment methods
 * M-Pesa, Airtel Money, Bank Transfer, Card (via local gateways)
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const MpesaService = require('../services/mpesa');
const AirtelMoneyService = require('../services/airtelMoney');
const MtnMomoService = require('../services/mtnMomo');
const PaystackService = require('../services/paystackService');
const { PesaLinkService, PESALINK_BANKS } = require('../services/pesalinkService');
const stripeService = require('../services/stripe');
const paypalService = require('../services/paypal');
const flutterwaveService = require('../services/flutterwave');
const billing = require('../services/billingData');
const paymentSessions = require('../services/paymentSessions');
const { paymentLimiter } = require('../middleware/rateLimiter');
const notificationService = require('../services/notificationService');
const { decryptObject } = require('../utils/encryption');
const alertSystem = require('../services/alertSystem');
const autoProvision = require('../services/autoProvision');
const { audit } = require('../utils/audit');

const router = express.Router();
const mpesaCallbackRouter = express.Router();
router.use(audit.paymentRequestMiddleware);

// Import settings store for payment gateway config
const settingsRoutes = require('./settings');

async function getBankPaybills() {
  try {
    if (settingsRoutes.bankPaybillStore?.enabled) {
      return settingsRoutes.bankPaybillStore.banks.filter(bank => bank.enabled);
    }
    return [];
  } catch (error) {
    console.error('Error fetching bank paybills:', error);
    return [];
  }
}

async function getIntegrationConfig(serviceName) {
  try {
    // First try to get from settings store
    if (serviceName === 'mpesa' && settingsRoutes.paymentGatewayStore?.mpesa?.enabled) {
      return settingsRoutes.paymentGatewayStore.mpesa;
    }
    if (serviceName === 'stripe' && settingsRoutes.paymentGatewayStore?.stripe?.enabled) {
      return settingsRoutes.paymentGatewayStore.stripe;
    }
    if (serviceName === 'paypal' && settingsRoutes.paymentGatewayStore?.paypal?.enabled) {
      return settingsRoutes.paymentGatewayStore.paypal;
    }

    // Fallback to database if available
    if (!global.db) {return null;}
    const result = await global.db.query(
      'SELECT config_data, is_active FROM integrations WHERE service_name = $1 AND is_active = true LIMIT 1',
      [serviceName]
    );
    if (result.rows.length === 0) {return null;}
    const decrypted = decryptObject(result.rows[0].config_data);
    return { ...decrypted, enabled: true, is_active: true };
  } catch (error) {
    console.error('Error fetching integration config:', error);
    return null;
  }
}

async function getMpesaService() {
  const integrationConfig = await getIntegrationConfig('mpesa');
  if (integrationConfig && integrationConfig.enabled) {
    return new MpesaService({
      consumerKey: integrationConfig.consumer_key,
      consumerSecret: integrationConfig.consumer_secret,
      shortcode: integrationConfig.shortcode,
      passkey: integrationConfig.passkey,
      callbackUrl: integrationConfig.callback_url,
      environment: integrationConfig.environment,
    });
  }
  return new MpesaService({
    consumerKey: process.env.MPESA_CONSUMER_KEY || '',
    consumerSecret: process.env.MPESA_CONSUMER_SECRET || '',
    shortcode: process.env.MPESA_SHORTCODE || '',
    passkey: process.env.MPESA_PASSKEY || '',
    callbackUrl: process.env.MPESA_CALLBACK_URL || '',
    environment: process.env.MPESA_ENVIRONMENT,
  });
}

async function isMpesaConfigured() {
  const config = await getIntegrationConfig('mpesa');
  if (config && config.enabled) {
    return Boolean(
      config.consumer_key &&
      config.consumer_secret &&
      config.shortcode &&
      config.passkey &&
      config.callback_url &&
      ["live", "sandbox"].includes(config.environment),
    );
  }
  return Boolean(
    process.env.MPESA_CONSUMER_KEY &&
      process.env.MPESA_CONSUMER_SECRET &&
      process.env.MPESA_SHORTCODE &&
      process.env.MPESA_PASSKEY &&
      process.env.MPESA_CALLBACK_URL &&
      ["live", "sandbox"].includes(process.env.MPESA_ENVIRONMENT),
  );
}

async function isStripeConfigured() {
  const config = await getIntegrationConfig('stripe');
  if (config && config.enabled) {
    return Boolean(config.secret_key);
  }
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

async function isPaypalConfigured() {
  const config = await getIntegrationConfig('paypal');
  if (config && config.enabled) {
    return Boolean(config.client_id && config.client_secret);
  }
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

async function isAirtelMoneyConfigured() {
  const config = await getIntegrationConfig('airtel_money');
  return Boolean(config?.is_active && config?.client_id && config?.client_secret);
}

async function isMtnMomoConfigured() {
  const config = await getIntegrationConfig('mtn_momo');
  return Boolean(config?.is_active && config?.subscription_key && config?.api_user && config?.api_key);
}

async function isPaystackConfigured() {
  const config = await getIntegrationConfig('paystack');
  if (config?.is_active && config?.secret_key) return true;
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

async function isPesaLinkConfigured() {
  const config = await getIntegrationConfig('pesalink');
  return Boolean(config?.is_active && config?.account_number && config?.bank_name);
}

async function getAirtelService() {
  const config = await getIntegrationConfig('airtel_money');
  if (config) return new AirtelMoneyService(config);
  return new AirtelMoneyService({ client_id: process.env.AIRTEL_CLIENT_ID || '', client_secret: process.env.AIRTEL_CLIENT_SECRET || '', environment: process.env.AIRTEL_ENVIRONMENT || '', country: process.env.AIRTEL_COUNTRY || '' });
}

async function getMtnService() {
  const config = await getIntegrationConfig('mtn_momo');
  if (config) return new MtnMomoService(config);
  return new MtnMomoService({ subscription_key: process.env.MTN_SUBSCRIPTION_KEY || '', api_user: process.env.MTN_API_USER || '', api_key: process.env.MTN_API_KEY || '', environment: process.env.MTN_ENVIRONMENT || '', country: process.env.MTN_COUNTRY || '' });
}

async function getPaystackService() {
  const config = await getIntegrationConfig('paystack');
  const secretKey = (config?.is_active && config?.secret_key) ? config.secret_key : (process.env.PAYSTACK_SECRET_KEY || '');
  const publicKey = (config?.is_active && config?.public_key) ? config.public_key : (process.env.PAYSTACK_PUBLIC_KEY || '');
  return new PaystackService({ secret_key: secretKey, public_key: publicKey });
}

async function getPesaLinkService() {
  const config = await getIntegrationConfig('pesalink');
  if (config) return new PesaLinkService(config);
  return new PesaLinkService({ bank_name: process.env.BANK_NAME || '', account_name: process.env.BANK_ACCOUNT_NAME || '', account_number: process.env.BANK_ACCOUNT_NUMBER || '' });
}

function ensureWebhookSecretConfigured(provider) {
  if (provider === 'stripe') {
    return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  }
  if (provider === 'paypal') {
    return Boolean(process.env.PAYPAL_WEBHOOK_ID);
  }
  if (provider === 'flutterwave') {
    return Boolean(process.env.FLUTTERWAVE_SECRET_KEY);
  }
  return false;
}

const flutterwaveConfigured = Boolean(
  process.env.FLUTTERWAVE_SECRET_KEY &&
  process.env.FLUTTERWAVE_PUBLIC_KEY &&
  process.env.FLUTTERWAVE_ENVIRONMENT,
);

router.use(paymentLimiter);

async function getCustomerAndInvoice(customerId, invoiceId) {
  const invoice = invoiceId ? await billing.getInvoiceById(invoiceId) : null;
  const resolvedCustomerId = customerId || invoice?.customer_id || null;
  const customer = resolvedCustomerId ? await billing.getCustomerById(resolvedCustomerId) : null;
  return {
    customer,
    invoice,
    customerId: resolvedCustomerId,
  };
}

async function finalizeSessionPayment(session, mpesaReceipt, phone) {
  if (session.payment_id) {
    return billing.getPaymentById(session.payment_id);
  }

  const payment = await billing.createPayment({
    invoice_id: session.invoice_id,
    customer_id: session.customer_id,
    amount: session.amount,
    method: session.method || 'mpesa_stk',
    reference: mpesaReceipt,
    gateway_transaction_id: session.checkout_request_id || session.checkoutRequestId,
    notes: `M-Pesa STK Push - ${phone || session.phone}`,
  });

  await paymentSessions.markCompleted(session.checkout_request_id || session.checkoutRequestId, {
    payment_id: payment.id,
    mpesaReceipt,
  });

  const customer = payment.customer || await billing.getCustomerById(payment.customer_id);
  const invoice = payment.invoice || await billing.getInvoiceById(payment.invoice_id);
  if (customer?.phone) {
    notificationService.triggerSMS('payment_received', { customer, invoice, payment }).catch((error) => {
      console.error('SMS error:', error.message);
    });
  }

  autoProvision.autoProvisionOnPayment(payment).catch(err => console.error('Auto-provision error:', err.message));
  
  // Send Telegram alert
  if (invoice?.invoice_number) {
    alertSystem.sendPaymentReceived(
      payment.customer_id,
      payment.amount,
      invoice.invoice_number,
      payment.reference
    ).catch((error) => {
      console.error('Telegram alert error:', error.message);
    });
  }

  return payment;
}

// ═══════════════════════════════════════
// GENERIC PAYMENTS API
// ═══════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const payments = await billing.listPayments();
    res.json(payments.sort((a, b) => new Date(b.received_at) - new Date(a.received_at)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { customer_id, amount, method, reference, invoice_id, notes } = req.body || {};

    if (!customer_id || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'customer_id and amount are required' });
    }

    const payment = await billing.createPayment({
      customer_id,
      amount: parseFloat(amount),
      method: method || 'cash',
      reference,
      invoice_id,
      notes,
    });

    const customer = payment.customer || await billing.getCustomerById(payment.customer_id);
    const invoice = payment.invoice || await billing.getInvoiceById(payment.invoice_id);
    if (customer?.phone) {
      notificationService.triggerSMS('payment_received', { customer, invoice, payment }).catch((error) => {
        console.error('SMS error:', error.message);
      });
    }

    autoProvision.autoProvisionOnPayment(payment).catch(err => console.error('Auto-provision error:', err.message));

    res.status(201).json(payment);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Refund a payment
router.post('/:id/refund', async (req, res) => {
  try {
    const { amount, reason, reference } = req.body || {};
    const paymentId = req.params.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Refund amount must be greater than 0' });
    }

    if (!global.db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    // Get payment details
    const paymentResult = await global.db.query(
      'SELECT * FROM payments WHERE id = $1',
      [paymentId]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = paymentResult.rows[0];

    // Check if refund amount exceeds payment amount
    const alreadyRefunded = payment.refund_amount || 0;
    const availableForRefund = payment.amount - alreadyRefunded;

    if (amount > availableForRefund) {
      return res.status(400).json({ error: `Refund amount exceeds available amount. Available: ${availableForRefund}` });
    }

    // Update payment with refund
    const newRefundAmount = alreadyRefunded + parseFloat(amount);
    await global.db.query(
      `UPDATE payments
       SET refund_amount = $1, refund_reference = $2, notes = COALESCE(notes, '') || ' Refund: ' || $3
       WHERE id = $4 RETURNING *`,
      [newRefundAmount, reference || '', reason || '', paymentId]
    );

    // If full refund, update invoice status back to pending
    if (newRefundAmount >= payment.amount && payment.invoice_id) {
      await global.db.query(
        `UPDATE invoices SET status = 'pending' WHERE id = $1`,
        [payment.invoice_id]
      );
    }

    res.json({ success: true, refund_amount: newRefundAmount, message: 'Refund processed successfully' });
  } catch (e) {
    console.error('Refund error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// PAYMENT METHODS CONFIG
// ═══════════════════════════════════════
router.get('/methods', async (req, res) => {
  const mpesaEnabled = await isMpesaConfigured();
  const stripeEnabled = await isStripeConfigured();
  const paypalEnabled = await isPaypalConfigured();
  const airtelEnabled = await isAirtelMoneyConfigured();
  const mtnEnabled = await isMtnMomoConfigured();
  const paystackEnabled = await isPaystackConfigured();
  const pesalinkEnabled = await isPesaLinkConfigured();
  const bankPaybills = await getBankPaybills();
  const mpesaConfig = await getIntegrationConfig('mpesa');
  const mpesaPaybill =
    mpesaConfig?.shortcode ||
    settingsRoutes.paymentGatewayStore?.mpesa?.shortcode ||
    process.env.MPESA_PAYBILL ||
    '';
  const bankTransferConfigured = Boolean(
    process.env.BANK_NAME &&
    process.env.BANK_ACCOUNT_NAME &&
    process.env.BANK_ACCOUNT_NUMBER,
  );

  const methods = [
    {
      id: 'mpesa_stk',
      name: 'M-Pesa (STK Push)',
      icon: '📱',
      description: 'Pay via M-Pesa - instant prompt on your phone',
      min: 1, max: 150000, fee: 0,
      enabled: mpesaEnabled,
    },
    {
      id: 'mpesa_paybill',
      name: 'M-Pesa Paybill',
      icon: '🏦',
      description: 'Pay using your configured M-Pesa business number',
      min: 1, max: 70000, fee: 0,
      enabled: Boolean(mpesaEnabled && mpesaPaybill),
      paybill: mpesaPaybill,
    },
    {
      id: 'airtel_money',
      name: 'Airtel Money (STK Push)',
      icon: '📲',
      description: 'Pay via Airtel Money — instant push to your phone',
      min: 1, max: 50000, fee: 0,
      enabled: airtelEnabled,
    },
    {
      id: 'mtn_momo',
      name: 'MTN Mobile Money',
      icon: '📳',
      description: 'Pay via MTN MoMo — approve on your phone',
      min: 1, max: 500000, fee: 0,
      enabled: mtnEnabled,
    },
    {
      id: 'paystack',
      name: 'Card / Bank (Paystack)',
      icon: '💳',
      description: 'Pay with Visa, Mastercard, bank transfer, or USSD',
      min: 1, max: 5000000, fee: 1.5,
      enabled: paystackEnabled,
    },
    {
      id: 'pesalink',
      name: 'PesaLink (Bank Transfer)',
      icon: '🏛️',
      description: 'Kenya bank-to-bank instant transfer via PesaLink',
      min: 10, max: 999999, fee: 0,
      enabled: pesalinkEnabled,
    },
  ];

  // Add bank paybills
  bankPaybills.forEach((bank, index) => {
    methods.push({
      id: `bank_paybill_${index}`,
      name: `${bank.name} Paybill`,
      icon: '🏦',
      description: `Pay via ${bank.name} Paybill: ${bank.paybill}`,
      min: 1, max: 150000, fee: 0,
      enabled: true,
      paybill: bank.paybill,
      account_number: bank.account_number,
      bank_name: bank.name,
      type: 'bank_paybill',
    });
  });

  methods.push(
    {
      id: 'stripe',
      name: 'Credit/Debit Card (Stripe)',
      icon: '💳',
      description: 'Pay securely with Visa, Mastercard, Amex',
      min: 1, max: 1000000, fee: 2.9,
      enabled: stripeEnabled,
    },
    {
      id: 'paypal',
      name: 'PayPal',
      icon: '🅿️',
      description: 'Pay with your PayPal account',
      min: 1, max: 1000000, fee: 3.4,
      enabled: paypalEnabled,
    },
    {
      id: 'flutterwave',
      name: 'Flutterwave',
      icon: '🌍',
      description: 'Mobile money, card, bank transfer across Africa',
      min: 1, max: 1000000, fee: 1.4,
      enabled: flutterwaveConfigured,
    },
    {
      id: 'bank_transfer',
      name: 'Bank Transfer (EFT/RTGS)',
      icon: '🏛️',
      description: 'Direct bank transfer',
      min: 100, max: 10000000, fee: 0,
      enabled: bankTransferConfigured,
      bank_details: {
        bank_name: process.env.BANK_NAME || '',
        account_name: process.env.BANK_ACCOUNT_NAME || '',
        account_number: process.env.BANK_ACCOUNT_NUMBER || '',
        branch: process.env.BANK_BRANCH || '',
        swift_code: process.env.BANK_SWIFT || '',
      },
    },
    {
      id: 'cash',
      name: 'Cash',
      icon: '💵',
      description: 'Pay cash at our office',
      min: 0, max: 1000000, fee: 0,
      enabled: process.env.CASH_PAYMENTS_ENABLED === 'true',
    }
  );

  res.json({ methods });
});

// ═══════════════════════════════════════
// M-PESA STK PUSH (Production only)
// ═══════════════════════════════════════
router.post('/mpesa/stk', async (req, res) => {
  try {
    const { phone, amount, invoice_id, customer_id } = req.body;
    if (!phone || !amount) {return res.status(400).json({ error: 'phone and amount required' });}

    const { customer, invoice, customerId } = await getCustomerAndInvoice(customer_id, invoice_id);
    if (!customerId) {return res.status(404).json({ error: 'Customer not found' });}

    const mpesaConfigured = await isMpesaConfigured();
    if (!mpesaConfigured) {
      return res.status(503).json({
        success: false,
        error: 'M-Pesa is not configured. Add your Daraja Consumer Key, Secret, Shortcode, Passkey, and Callback URL in Integrations → M-Pesa.',
      });
    }

    const accountRef = invoice?.invoice_number || `INV-${Date.now()}`;
    const description = invoice ? `Payment for ${invoice.invoice_number}` : 'ISP Payment';

    const mpesaService = await getMpesaService();
    const result = await mpesaService.stkPush(phone, amount, accountRef, description);

    if (result.success) {
      await paymentSessions.savePending({
        id: uuidv4(),
        invoice_id,
        customer_id: customerId,
        phone,
        amount: parseFloat(amount),
        method: 'mpesa_stk',
        status: 'pending',
        checkoutRequestId: result.checkoutRequestId,
        provider_response: result,
      });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// CHECK STK STATUS (Production only)
// ═══════════════════════════════════════
router.post('/mpesa/stk/check', async (req, res) => {
  try {
    const { checkoutRequestId } = req.body;

    const pending = await paymentSessions.findByCheckoutRequestId(checkoutRequestId);
    if (!pending) {
      return res.status(404).json({ error: 'Payment session not found' });
    }

    // Already finalised — return cached result
    if (pending.payment_id) {
      const payment = await billing.getPaymentById(pending.payment_id);
      return res.json({
        success: true,
        status: 'completed',
        mpesaReceipt: pending.mpesa_receipt || pending.mpesaReceipt || payment?.reference,
        payment,
      });
    }

    const mpesaConfigured = await isMpesaConfigured();
    if (!mpesaConfigured) {
      return res.status(503).json({
        success: false,
        error: 'M-Pesa is not configured.',
      });
    }

    // Query Safaricom for real status
    const mpesaService = await getMpesaService();
    const result = await mpesaService.checkStkStatus(checkoutRequestId);

    if (result.success && result.mpesaReceipt) {
      const payment = await finalizeSessionPayment(pending, result.mpesaReceipt, result.phone || pending.phone);
      return res.json({
        success: true,
        status: 'completed',
        mpesaReceipt: result.mpesaReceipt,
        payment,
      });
    }

    if (result.resultCode && result.resultCode !== '0') {
      await paymentSessions.markFailed(checkoutRequestId, {
        status: 'failed',
        provider_response: result,
      });
      return res.json({
        success: false,
        status: 'failed',
        message: result.description || 'Payment was cancelled or declined.',
      });
    }

    return res.json({
      success: false,
      status: pending.status || 'pending',
      message: result.description || result.message || 'Waiting for customer to enter PIN...',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// M-PESA PAYBILL CONFIRMATION
// ═══════════════════════════════════════
router.post('/mpesa/paybill/confirm', async (req, res) => {
  try {
    const { phone, receipt, amount, invoice_id, customer_id } = req.body;
    const { customer, invoice, customerId } = await getCustomerAndInvoice(customer_id, invoice_id);

    const payment = await billing.createPayment({
      invoice_id,
      customer_id: customerId,
      amount: parseFloat(amount),
      method: 'mpesa_paybill',
      reference: receipt,
      notes: `M-Pesa Paybill - ${phone}`,
    });

    if (customer?.phone) {
      notificationService.triggerSMS('payment_received', { customer, invoice, payment }).catch((error) => {
        console.error('SMS error:', error.message);
      });
    }

    autoProvision.autoProvisionOnPayment(payment).catch(err => console.error('Auto-provision error:', err.message));

    res.json({ success: true, payment });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// BANK PAYBILL CONFIRMATION
// ═══════════════════════════════════════
router.post('/bank-paybill/confirm', async (req, res) => {
  try {
    const { bank_name, paybill, account_number, receipt, amount, invoice_id, customer_id } = req.body;
    const { customer, invoice, customerId } = await getCustomerAndInvoice(customer_id, invoice_id);

    const payment = await billing.createPayment({
      invoice_id,
      customer_id: customerId,
      amount: parseFloat(amount),
      method: 'bank_paybill',
      reference: receipt,
      notes: `${bank_name} Paybill - Paybill: ${paybill}, Account: ${account_number}`,
    });

    if (customer?.phone) {
      notificationService.triggerSMS('payment_received', { customer, invoice, payment }).catch((error) => {
        console.error('SMS error:', error.message);
      });
    }

    res.json({ success: true, payment });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// M-PESA CALLBACK (from Safaricom)
// ═══════════════════════════════════════
async function handleMpesaCallback(req, res) {
  try {
    const callback = req.body;
    const body = callback.Body?.stkCallback;
    if (!body) {
      return res.json({ ResultCode: 0, ResultDesc: 'Success' });
    }

    const checkoutRequestId = body.CheckoutRequestID;
    if (!checkoutRequestId) {
      return res.json({ ResultCode: 0, ResultDesc: 'Success' });
    }
    const mpesa = await getMpesaService();
    const verification = await mpesa.checkStkStatus(checkoutRequestId);

    const captiveHotspot = require("../services/captiveHotspot");
    const hotspotSession =
      await captiveHotspot.findByCheckoutRequestId(checkoutRequestId);
    if (hotspotSession) {
      await captiveHotspot.handleProviderVerification(
        checkoutRequestId,
        verification,
      );
      return res.json({ ResultCode: 0, ResultDesc: 'Success' });
    }

    const pending = await paymentSessions.findByCheckoutRequestId(checkoutRequestId);
    if (pending && verification.resultCode !== undefined && String(verification.resultCode) !== '0') {
      await paymentSessions.markFailed(checkoutRequestId, {
        status: 'failed',
        provider_response: verification,
      });
    } else if (
      pending &&
      !pending.payment_id &&
      verification.success &&
      verification.mpesaReceipt &&
      Math.round(Number(verification.amount) * 100) === Math.round(Number(pending.amount) * 100)
    ) {
        const payment = await billing.createPayment({
          invoice_id: pending.invoice_id,
          customer_id: pending.customer_id,
          amount: pending.amount,
          method: 'mpesa_stk',
          reference: verification.mpesaReceipt,
          gateway_transaction_id: checkoutRequestId,
          notes: `M-Pesa STK Push - ${pending.phone}`,
        });

        await paymentSessions.markCompleted(checkoutRequestId, {
          payment_id: payment.id,
          mpesaReceipt: verification.mpesaReceipt,
          provider_response: { callback, verification },
        });

        const customer = payment.customer || await billing.getCustomerById(payment.customer_id);
        const invoice = payment.invoice || await billing.getInvoiceById(payment.invoice_id);
        if (customer?.phone) {
          notificationService.triggerSMS('payment_received', { customer, invoice, payment }).catch((error) => {
            console.error('SMS error:', error.message);
          });
        }

        autoProvision.autoProvisionOnPayment(payment).catch(err => console.error('Auto-provision error:', err.message));
    }

    res.json({ ResultCode: 0, ResultDesc: 'Success' });
  } catch (e) {
    console.error('M-Pesa callback error:', e);
    res.json({ ResultCode: 0, ResultDesc: 'Success' });
  }
}

router.post('/mpesa/callback', handleMpesaCallback);
mpesaCallbackRouter.post('/', paymentLimiter, handleMpesaCallback);

// ═══════════════════════════════════════
// C2B DARAJA — Real-time Safaricom webhooks
// These are called by Safaricom when a customer pays the Paybill directly.
// Must be public (no auth) — Safaricom does NOT send auth headers.
// ═══════════════════════════════════════

// 1. Validation URL — Safaricom calls this first, must respond within 8s
router.post('/mpesa/c2b/validate', (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

// 2. Confirmation URL — Safaricom calls when payment is finalised
router.post('/mpesa/c2b/confirm', async (req, res) => {
  // Always respond immediately — Safaricom has a strict timeout
  res.json({ ResultCode: 0, ResultDesc: 'Success' });

  try {
    const {
      TransID,
      TransAmount,
      MSISDN,
      BillRefNumber,
      FirstName,
      MiddleName,
      LastName,
    } = req.body;

    if (!TransID || !TransAmount) return;

    const amount = parseFloat(TransAmount);
    const phone = (MSISDN || '').replace(/\D/g, '');
    const ref = (BillRefNumber || '').trim();
    const senderName = [FirstName, MiddleName, LastName].filter(Boolean).join(' ');

    // Idempotency — skip if this M-Pesa receipt was already recorded
    if (global.db) {
      const dup = await global.db.query('SELECT id FROM payments WHERE reference = $1 LIMIT 1', [TransID]);
      if (dup.rows.length > 0) return;
    }

    // Match to a customer: invoice number first, then phone
    let invoice = null;
    let customer = null;

    if (ref && global.db) {
      const inv = await global.db.query(
        `SELECT i.*, c.id AS cid, c.name AS cname, c.phone AS cphone
         FROM invoices i JOIN customers c ON c.id = i.customer_id
         WHERE i.invoice_number = $1 LIMIT 1`,
        [ref]
      );
      if (inv.rows.length > 0) {
        const row = inv.rows[0];
        invoice = row;
        customer = { id: row.cid, name: row.cname, phone: row.cphone || phone };
      }
    }

    if (!customer && phone && global.db) {
      const intl = phone.startsWith('254') ? phone : '254' + (phone.startsWith('0') ? phone.slice(1) : phone);
      const local = '0' + intl.slice(3);
      const cust = await global.db.query(
        'SELECT * FROM customers WHERE phone IN ($1,$2,$3) LIMIT 1',
        [phone, intl, local]
      );
      if (cust.rows.length > 0) {
        customer = cust.rows[0];
        const inv = await global.db.query(
          `SELECT * FROM invoices WHERE customer_id = $1 AND status IN ('pending','partial')
           ORDER BY due_date ASC LIMIT 1`,
          [customer.id]
        );
        invoice = inv.rows[0] || null;
      }
    }

    if (!customer) {
      console.warn(`[C2B] Unmatched payment ${TransID} KES ${amount} from ${phone} ref="${ref}" sender="${senderName}"`);
      return;
    }

    const payment = await billing.createPayment({
      invoice_id: invoice?.id || null,
      customer_id: customer.id,
      amount,
      method: 'mpesa_paybill',
      reference: TransID,
      receipt_number: TransID,
      notes: `M-Pesa C2B${senderName ? ' - ' + senderName : ''}${phone ? ' (' + phone + ')' : ''}`,
    });

    // Fire-and-forget: SMS + auto-provision/reactivate + Telegram alert
    notificationService.triggerSMS('payment_received', { customer, invoice, payment })
      .catch(e => console.error('[C2B] SMS error:', e.message));

    autoProvision.autoProvisionOnPayment(payment)
      .catch(e => console.error('[C2B] Auto-provision error:', e.message));

    alertSystem.sendPaymentReceived(customer.id, amount, invoice?.invoice_number || ref, TransID)
      .catch(e => console.error('[C2B] Alert error:', e.message));

    console.log(`[C2B] ✓ KES ${amount} from ${customer.name} (${phone}) receipt ${TransID}`);
  } catch (e) {
    console.error('[C2B] Confirm processing error:', e.message);
  }
});

// 3. Register C2B URLs with Safaricom (call once when going live)
router.post('/mpesa/c2b/register', async (req, res) => {
  try {
    const { baseUrl } = req.body;
    const serverUrl = (baseUrl || process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
    if (!serverUrl) {
      return res.status(400).json({ success: false, error: 'baseUrl is required (e.g. https://billing.yourisp.com)' });
    }

    const mpesaConfigured = await isMpesaConfigured();
    if (!mpesaConfigured) {
      return res.status(503).json({ success: false, error: 'M-Pesa is not configured. Save your Daraja credentials first.' });
    }

    const mpesaService = await getMpesaService();
    const validationUrl   = `${serverUrl}/api/payments/mpesa/c2b/validate`;
    const confirmationUrl = `${serverUrl}/api/payments/mpesa/c2b/confirm`;

    const result = await mpesaService.registerC2BUrls(validationUrl, confirmationUrl);

    res.json({
      success: true,
      message: 'C2B URLs registered with Safaricom',
      validationUrl,
      confirmationUrl,
      safaricomResponse: result,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ═══════════════════════════════════════
// BANK TRANSFER DETAILS
// ═══════════════════════════════════════
router.get('/bank-details', (req, res) => {
  const details = {
    bank_name: process.env.BANK_NAME || '',
    account_name: process.env.BANK_ACCOUNT_NAME || '',
    account_number: process.env.BANK_ACCOUNT_NUMBER || '',
    branch: process.env.BANK_BRANCH || '',
    swift_code: process.env.BANK_SWIFT || '',
  };
  res.json({
    ...details,
    is_configured: Boolean(
      details.bank_name && details.account_name && details.account_number,
    ),
    reference_format: 'Use your invoice number as reference',
    instructions: [
      'Transfer the exact invoice amount',
      'Use your invoice number as the reference',
      'Payment will be confirmed within 2-4 hours during business hours',
      'Send confirmation screenshot to our WhatsApp',
    ],
  });
});

// ═══════════════════════════════════════
// STRIPE PAYMENT INTENT
// ═══════════════════════════════════════
router.post('/stripe/create-intent', async (req, res) => {
  try {
    const { amount, customer_id, invoice_id, description, metadata } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'amount is required' });
    }

    const stripeConfigured = await isStripeConfigured();
    if (!stripeConfigured) {
      return res.status(503).json({ error: 'Stripe is not configured for production' });
    }

    const result = await stripeService.createPaymentIntent({
      amount: parseFloat(amount),
      customer_id,
      invoice_id,
      description,
      metadata,
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// STRIPE WEBHOOK
// ═══════════════════════════════════════
router.post('/stripe/webhook', async (req, res) => {
  if (!ensureWebhookSecretConfigured('stripe')) {
    return res.status(503).json({ error: 'Stripe webhook secret is not configured' });
  }

  const signature = req.headers['stripe-signature'];
  const payload = req.body;

  const event = stripeService.verifyWebhookSignature(payload, signature);
  if (!event) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  try {
    const result = await stripeService.handleWebhook(event);
    res.json(result);
  } catch (e) {
    console.error('Stripe webhook error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// PAYPAL CREATE ORDER
// ═══════════════════════════════════════
router.post('/paypal/create-order', async (req, res) => {
  try {
    const { amount, currency, customer_id, invoice_id, description, redirect_url, metadata } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'amount is required' });
    }

    const paypalConfigured = await isPaypalConfigured();
    if (!paypalConfigured) {
      return res.status(503).json({ error: 'PayPal is not configured for production' });
    }

    const result = await paypalService.createOrder({
      amount: parseFloat(amount),
      currency: currency || 'USD',
      customer_id,
      invoice_id,
      description,
      redirect_url,
      metadata,
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// PAYPAL CAPTURE PAYMENT
// ═══════════════════════════════════════
router.post('/paypal/capture', async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    const result = await paypalService.capturePayment(orderId);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// PAYPAL WEBHOOK
// ═══════════════════════════════════════
router.post('/paypal/webhook', async (req, res) => {
  if (!ensureWebhookSecretConfigured('paypal')) {
    return res.status(503).json({ error: 'PayPal webhook ID is not configured' });
  }

  const headers = req.headers;
  const body = req.body;

  if (!paypalService.verifyWebhook(headers, body)) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  try {
    const result = await paypalService.handleWebhook(body);
    res.json(result);
  } catch (e) {
    console.error('PayPal webhook error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// FLUTTERWAVE CREATE PAYMENT LINK
// ═══════════════════════════════════════
router.post('/flutterwave/create-link', async (req, res) => {
  try {
    const { amount, currency, customer_id, invoice_id, description, redirect_url, metadata } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'amount is required' });
    }

    if (!flutterwaveConfigured) {
      return res.status(503).json({ error: 'Flutterwave is not configured for production' });
    }

    const result = await flutterwaveService.createPaymentLink({
      amount: parseFloat(amount),
      currency: currency || 'KES',
      customer_id,
      invoice_id,
      description,
      redirect_url,
      metadata,
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// FLUTTERWAVE VERIFY TRANSACTION
// ═══════════════════════════════════════
router.post('/flutterwave/verify', async (req, res) => {
  try {
    const { transactionId } = req.body;

    if (!transactionId) {
      return res.status(400).json({ error: 'transactionId is required' });
    }

    const result = await flutterwaveService.verifyTransaction(transactionId);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// FLUTTERWAVE WEBHOOK
// ═══════════════════════════════════════
router.post('/flutterwave/webhook', async (req, res) => {
  if (!ensureWebhookSecretConfigured('flutterwave')) {
    return res.status(503).json({ error: 'Flutterwave webhook secret is not configured' });
  }

  const headers = req.headers;
  const body = req.body;

  if (!flutterwaveService.verifyWebhookSignature(headers, body)) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  try {
    const result = await flutterwaveService.handleWebhook(body);
    res.json(result);
  } catch (e) {
    console.error('Flutterwave webhook error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// AIRTEL MONEY STK PUSH
// ═══════════════════════════════════════
router.post('/airtel/stk', async (req, res) => {
  try {
    const { phone, amount, invoice_id, customer_id } = req.body;
    if (!phone || !amount) return res.status(400).json({ error: 'phone and amount are required' });

    const { customer, invoice, customerId } = await getCustomerAndInvoice(customer_id, invoice_id);
    if (!customerId) return res.status(404).json({ error: 'Customer not found' });

    const configured = await isAirtelMoneyConfigured();
    if (!configured) {
      return res.status(503).json({ error: 'Airtel Money is not configured. Add Client ID and Secret in Integrations → Airtel Money.' });
    }

    const accountRef = invoice?.invoice_number || `INV-${Date.now()}`;
    const airtel = await getAirtelService();
    const result = await airtel.stkPush(phone, amount, accountRef, `Payment for ${accountRef}`);

    if (result.success) {
      await paymentSessions.savePending({
        id: uuidv4(),
        invoice_id: invoice_id || null,
        customer_id: customerId,
        phone,
        amount: parseFloat(amount),
        method: 'airtel_money',
        status: 'pending',
        checkoutRequestId: result.transactionId,
        provider_response: result,
      });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Poll Airtel Money status
router.post('/airtel/stk/check', async (req, res) => {
  try {
    const { transactionId } = req.body;
    if (!transactionId) return res.status(400).json({ error: 'transactionId is required' });

    const pending = await paymentSessions.findByCheckoutRequestId(transactionId);
    if (pending?.payment_id) {
      const payment = await billing.getPaymentById(pending.payment_id);
      return res.json({ success: true, status: 'completed', payment });
    }

    const airtel = await getAirtelService();
    const result = await airtel.checkStatus(transactionId);

    if (result.success && result.status === 'completed' && pending) {
      const payment = await billing.createPayment({
        invoice_id: pending.invoice_id, customer_id: pending.customer_id,
        amount: pending.amount, method: 'airtel_money',
        reference: result.transactionId || transactionId,
        gateway_transaction_id: transactionId,
        notes: `Airtel Money STK - ${pending.phone}`,
      });
      await paymentSessions.markCompleted(transactionId, { payment_id: payment.id });
      const customer = await billing.getCustomerById(pending.customer_id).catch(() => null);
      const invoice = pending.invoice_id ? await billing.getInvoiceById(pending.invoice_id).catch(() => null) : null;
      if (customer?.phone) notificationService.triggerSMS('payment_received', { customer, invoice, payment }).catch(() => {});
      autoProvision.autoProvisionOnPayment(payment).catch(() => {});
      return res.json({ success: true, status: 'completed', payment });
    }

    if (result.status === 'failed' && pending) {
      await paymentSessions.markFailed(transactionId, { status: 'failed', provider_response: result });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Airtel Money Callback (webhook)
router.post('/airtel/callback', async (req, res) => {
  try {
    const body = req.body;
    const txId = body?.transaction?.id || body?.id;
    const status = body?.transaction?.status || body?.status;

    if (txId && (status === 'TS' || status === 'SUCCESS')) {
      const pending = await paymentSessions.findByCheckoutRequestId(txId);
      if (pending && !pending.payment_id) {
        const payment = await billing.createPayment({
          invoice_id: pending.invoice_id, customer_id: pending.customer_id,
          amount: body?.transaction?.amount || pending.amount,
          method: 'airtel_money', reference: txId, gateway_transaction_id: txId,
          notes: `Airtel Money - ${pending.phone}`,
        });
        await paymentSessions.markCompleted(txId, { payment_id: payment.id, provider_response: body });
        const customer = await billing.getCustomerById(pending.customer_id).catch(() => null);
        const invoice = pending.invoice_id ? await billing.getInvoiceById(pending.invoice_id).catch(() => null) : null;
        if (customer?.phone) notificationService.triggerSMS('payment_received', { customer, invoice, payment }).catch(() => {});
        autoProvision.autoProvisionOnPayment(payment).catch(() => {});
      }
    }
    res.status(200).json({ status: 'ok' }); // Always 200 to Airtel
  } catch (e) {
    console.error('Airtel callback error:', e);
    res.status(200).json({ status: 'ok' });
  }
});

// ═══════════════════════════════════════
// MTN MOBILE MONEY
// ═══════════════════════════════════════
router.post('/mtn/request-to-pay', async (req, res) => {
  try {
    const { phone, amount, invoice_id, customer_id } = req.body;
    if (!phone || !amount) return res.status(400).json({ error: 'phone and amount are required' });

    const { customer, invoice, customerId } = await getCustomerAndInvoice(customer_id, invoice_id);
    if (!customerId) return res.status(404).json({ error: 'Customer not found' });

    const configured = await isMtnMomoConfigured();
    if (!configured) {
      return res.status(503).json({ error: 'MTN MoMo is not configured. Add your credentials in Integrations → MTN Mobile Money.' });
    }

    const accountRef = invoice?.invoice_number || `INV-${Date.now()}`;
    const mtn = await getMtnService();
    const result = await mtn.requestToPay(phone, amount, accountRef, `Payment for ${accountRef}`);

    if (result.success) {
      await paymentSessions.savePending({
        id: uuidv4(),
        invoice_id: invoice_id || null,
        customer_id: customerId,
        phone,
        amount: parseFloat(amount),
        method: 'mtn_momo',
        status: 'pending',
        checkoutRequestId: result.referenceId,
        provider_response: result,
      });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Poll MTN MoMo status
router.post('/mtn/stk/check', async (req, res) => {
  try {
    const { referenceId } = req.body;
    if (!referenceId) return res.status(400).json({ error: 'referenceId is required' });

    const pending = await paymentSessions.findByCheckoutRequestId(referenceId);
    if (pending?.payment_id) {
      const payment = await billing.getPaymentById(pending.payment_id);
      return res.json({ success: true, status: 'completed', payment });
    }

    const mtn = await getMtnService();
    const result = await mtn.checkStatus(referenceId);

    if (result.success && result.status === 'completed' && pending) {
      const payment = await billing.createPayment({
        invoice_id: pending.invoice_id, customer_id: pending.customer_id,
        amount: pending.amount, method: 'mtn_momo',
        reference: result.transactionId || referenceId,
        gateway_transaction_id: referenceId,
        notes: `MTN MoMo - ${pending.phone}`,
      });
      await paymentSessions.markCompleted(referenceId, { payment_id: payment.id });
      const customer = await billing.getCustomerById(pending.customer_id).catch(() => null);
      const invoice = pending.invoice_id ? await billing.getInvoiceById(pending.invoice_id).catch(() => null) : null;
      if (customer?.phone) notificationService.triggerSMS('payment_received', { customer, invoice, payment }).catch(() => {});
      autoProvision.autoProvisionOnPayment(payment).catch(() => {});
      return res.json({ success: true, status: 'completed', payment });
    }

    if (result.status === 'failed' && pending) {
      await paymentSessions.markFailed(referenceId, { status: 'failed', provider_response: result });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// MTN Callback
router.post('/mtn/callback', async (req, res) => {
  try {
    // MTN sends a notification to this URL when status changes
    const body = req.body;
    const referenceId = body?.externalId || body?.financialTransactionId;
    if (referenceId) {
      const pending = await paymentSessions.findByCheckoutRequestId(referenceId).catch(() => null);
      if (pending && !pending.payment_id && body?.status === 'SUCCESSFUL') {
        const payment = await billing.createPayment({
          invoice_id: pending.invoice_id, customer_id: pending.customer_id,
          amount: pending.amount, method: 'mtn_momo',
          reference: body.financialTransactionId || referenceId,
          gateway_transaction_id: referenceId,
          notes: `MTN MoMo callback - ${pending.phone}`,
        });
        await paymentSessions.markCompleted(referenceId, { payment_id: payment.id, provider_response: body });
        const customer = await billing.getCustomerById(pending.customer_id).catch(() => null);
        const invoice = pending.invoice_id ? await billing.getInvoiceById(pending.invoice_id).catch(() => null) : null;
        if (customer?.phone) notificationService.triggerSMS('payment_received', { customer, invoice, payment }).catch(() => {});
        autoProvision.autoProvisionOnPayment(payment).catch(() => {});
      }
    }
    res.status(200).json({ status: 'ok' });
  } catch (e) {
    res.status(200).json({ status: 'ok' });
  }
});

// ═══════════════════════════════════════
// PAYSTACK
// ═══════════════════════════════════════
router.post('/paystack/initialize', async (req, res) => {
  try {
    const { amount, customer_id, invoice_id, email, description, currency } = req.body;
    if (!amount || !customer_id) return res.status(400).json({ error: 'amount and customer_id are required' });

    const configured = await isPaystackConfigured();
    if (!configured) {
      return res.status(503).json({ error: 'Paystack is not configured. Add your Secret Key in Integrations → Paystack.' });
    }

    const customer = await billing.getCustomerById(customer_id);
    const invoice = invoice_id ? await billing.getInvoiceById(invoice_id) : null;
    const customerEmail = email || customer?.email || `${customer_id}@billing.local`;
    const reference = `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const callbackUrl = `${process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || ''}/api/payments/paystack/verify?ref=${reference}`;

    const paystack = await getPaystackService();
    const result = await paystack.initializeTransaction({
      email: customerEmail,
      amount: parseFloat(amount),
      reference,
      callbackUrl,
      currency: currency || 'KES',
      metadata: { customer_id, invoice_id: invoice_id || null, invoice_number: invoice?.invoice_number || '' },
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Paystack verify after redirect
router.get('/paystack/verify', async (req, res) => {
  try {
    const { ref, reference } = req.query;
    const ref_ = ref || reference;
    if (!ref_) return res.status(400).json({ error: 'reference is required' });

    const paystack = await getPaystackService();
    const result = await paystack.verifyTransaction(ref_);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Paystack verify (POST version for frontend polling)
router.post('/paystack/verify', async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) return res.status(400).json({ error: 'reference is required' });

    const paystack = await getPaystackService();
    const result = await paystack.verifyTransaction(reference);

    // If verified successful, record the payment
    if (result.success && result.customerId) {
      const existing = await global.db?.query(
        "SELECT id FROM payments WHERE reference = $1 LIMIT 1", [reference]
      ).catch(() => ({ rows: [] }));
      if (!existing?.rows?.length) {
        const payment = await billing.createPayment({
          invoice_id: result.invoiceId || null,
          customer_id: result.customerId,
          amount: result.amount,
          method: 'paystack',
          reference: result.reference,
          gateway_transaction_id: result.reference,
          notes: `Paystack - ${result.channel || 'card'}`,
        });
        const customer = await billing.getCustomerById(result.customerId).catch(() => null);
        const invoice = result.invoiceId ? await billing.getInvoiceById(result.invoiceId).catch(() => null) : null;
        if (customer?.phone) notificationService.triggerSMS('payment_received', { customer, invoice, payment }).catch(() => {});
        autoProvision.autoProvisionOnPayment(payment).catch(() => {});
        result.payment = payment;
      }
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Paystack Webhook (HMAC-SHA512 verified)
router.post('/paystack/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    const paystack = await getPaystackService();

    // raw body needed for HMAC verification — express.json() already parsed it
    // We re-stringify to verify consistently
    if (signature) {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
      if (!paystack.verifyWebhookSignature(rawBody, signature)) {
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }
    }

    const result = await paystack.handleWebhookEvent(req.body, { billing, notificationService, autoProvision, alertSystem });
    res.json(result);
  } catch (e) {
    console.error('Paystack webhook error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// PESALINK
// ═══════════════════════════════════════
router.get('/pesalink/details', async (req, res) => {
  try {
    const { invoice_id, amount } = req.query;
    const invoice = invoice_id ? await billing.getInvoiceById(invoice_id).catch(() => null) : null;
    const pesalink = await getPesaLinkService();
    const details = pesalink.getPaymentDetails(invoice?.invoice_number || `INV-${Date.now()}`, amount || 0);
    details.banks = pesalink.getBanks();
    res.json(details);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/pesalink/banks', (req, res) => {
  res.json(PESALINK_BANKS);
});

router.post('/pesalink/confirm', async (req, res) => {
  try {
    const { reference, amount, invoice_id, customer_id, sender_name, sender_bank } = req.body;
    if (!reference || !amount || !customer_id) {
      return res.status(400).json({ error: 'reference, amount, and customer_id are required' });
    }

    const pesalink = await getPesaLinkService();
    const result = await pesalink.confirmPayment(
      { reference, amount: parseFloat(amount), invoiceId: invoice_id, customerId: customer_id, senderName: sender_name, senderBank: sender_bank },
      { billing, notificationService, autoProvision, alertSystem }
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.mpesaCallbackRouter = mpesaCallbackRouter;
router.getMpesaService = getMpesaService;
router.isMpesaConfigured = isMpesaConfigured;

module.exports = router;
