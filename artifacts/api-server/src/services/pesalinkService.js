/**
 * PesaLink Service — Kenya Bank-to-Bank Transfers
 *
 * PesaLink is managed by Kenya Bankers Association (KBA) and operates as
 * an interbank transfer rail. It does NOT have a public merchant API for
 * ISPs to initiate STK pushes. Businesses receive PesaLink payments when
 * customers initiate from their banking app.
 *
 * This service implements:
 *   1. Display bank account details for the ISP (customer pays from their bank app)
 *   2. Manual confirmation flow (admin enters the reference number after payment)
 *   3. Validation of common PesaLink reference number formats
 *
 * PesaLink member banks: Equity, KCB, Co-op, NCBA, Absa, Standard Chartered,
 *   DTB, I&M, Family, Prime, SBM, GT Bank, HF, Gulf, etc.
 */

const PESALINK_BANKS = [
  { code: 'EQUITY', name: 'Equity Bank', shortcode: '68' },
  { code: 'KCB', name: 'KCB Bank', shortcode: '01' },
  { code: 'COOP', name: 'Co-operative Bank', shortcode: '11' },
  { code: 'NCBA', name: 'NCBA Bank', shortcode: '07' },
  { code: 'ABSA', name: 'Absa Bank Kenya', shortcode: '03' },
  { code: 'STANCHART', name: 'Standard Chartered', shortcode: '02' },
  { code: 'DTB', name: 'Diamond Trust Bank', shortcode: '63' },
  { code: 'IM', name: 'I&M Bank', shortcode: '57' },
  { code: 'FAMILY', name: 'Family Bank', shortcode: '70' },
  { code: 'PRIME', name: 'Prime Bank', shortcode: '10' },
  { code: 'HF', name: 'Housing Finance (HF Group)', shortcode: '61' },
  { code: 'GULF', name: 'Gulf African Bank', shortcode: '72' },
  { code: 'SBM', name: 'SBM Bank Kenya', shortcode: '80' },
  { code: 'SIDIAN', name: 'Sidian Bank', shortcode: '66' },
  { code: 'VICTORIA', name: 'Victoria Commercial Bank', shortcode: '54' },
];

class PesaLinkService {
  constructor(config) {
    // Receiving bank details (the ISP's bank account)
    this.bankName = config.bank_name || '';
    this.accountName = config.account_name || '';
    this.accountNumber = config.account_number || '';
    this.bankCode = config.bank_code || '';
    this.branchCode = config.branch_code || '';
    this.referencePrefix = config.reference_prefix || 'INV';
  }

  /**
   * Get display details for the customer to initiate the PesaLink transfer
   */
  getPaymentDetails(invoiceNumber, amount) {
    return {
      gateway: 'pesalink',
      bank_name: this.bankName,
      account_name: this.accountName,
      account_number: this.accountNumber,
      bank_code: this.bankCode,
      amount,
      reference: invoiceNumber,
      instructions: [
        `Open your mobile banking app (Equity, KCB, Co-op, NCBA, etc.)`,
        `Select "Send Money" → "PesaLink" or "Bank Transfer"`,
        `Enter receiving bank: ${this.bankName}`,
        `Enter account number: ${this.accountNumber}`,
        `Enter amount: KES ${amount}`,
        `Enter reference/narration: ${invoiceNumber}`,
        `Confirm and complete the transfer`,
        `Share the transaction reference with us to confirm your payment`,
      ],
      note: 'PesaLink transfers are instant and available 24/7 including weekends',
    };
  }

  /**
   * Get list of PesaLink member banks (for customer to select their bank)
   */
  getBanks() {
    return PESALINK_BANKS;
  }

  /**
   * Validate a PesaLink reference number format
   * PesaLink refs are typically alphanumeric, 6-30 characters
   */
  validateReference(reference) {
    if (!reference || reference.trim().length < 4) {
      return { valid: false, message: 'Reference number too short (min 4 characters)' };
    }
    if (reference.trim().length > 50) {
      return { valid: false, message: 'Reference number too long' };
    }
    // Allow letters, numbers, hyphens, slashes
    if (!/^[A-Za-z0-9\-\/\s]+$/.test(reference.trim())) {
      return { valid: false, message: 'Invalid characters in reference number' };
    }
    return { valid: true };
  }

  /**
   * Record a manually confirmed PesaLink payment
   * Called by admin or customer when they provide the transaction reference
   */
  async confirmPayment({ reference, amount, invoiceId, customerId, senderName, senderBank }, { billing, notificationService, autoProvision, alertSystem }) {
    const validation = this.validateReference(reference);
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    const payment = await billing.createPayment({
      invoice_id: invoiceId || null,
      customer_id: customerId,
      amount: parseFloat(amount),
      method: 'pesalink',
      reference: reference.trim().toUpperCase(),
      notes: `PesaLink transfer${senderName ? ` from ${senderName}` : ''}${senderBank ? ` (${senderBank})` : ''}`,
    });

    const customer = await billing.getCustomerById(customerId).catch(() => null);
    const invoice = invoiceId ? await billing.getInvoiceById(invoiceId).catch(() => null) : null;

    if (customer?.phone) {
      notificationService.triggerSMS('payment_received', { customer, invoice, payment }).catch(() => {});
    }

    autoProvision.autoProvisionOnPayment(payment).catch(() => {});

    if (invoice?.invoice_number) {
      alertSystem.sendPaymentReceived(customerId, parseFloat(amount), invoice.invoice_number, reference).catch(() => {});
    }

    return { success: true, payment };
  }
}

module.exports = { PesaLinkService, PESALINK_BANKS };
