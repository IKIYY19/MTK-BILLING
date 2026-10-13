/**
 * Alert System Service
 * Automated notification system for sending alerts via Telegram
 */

const TelegramService = require('./telegram');
const { decryptObject } = require('../utils/encryption');

class AlertSystem {
  constructor() {
    this.telegram = null;
    this.enabled = false;
  }

  async init() {
    try {
      if (!global.db) {
        console.warn('Alert system: Database not available');
        return;
      }

      const result = await global.db.query(
        'SELECT config_data, is_active FROM integrations WHERE service_name = $1 AND is_active = true LIMIT 1',
        ['telegram']
      );

      if (result.rows.length === 0) {
        console.log('Alert system: Telegram integration not active');
        return;
      }

      const config = decryptObject(result.rows[0].config_data);
      this.telegram = new TelegramService({
        botToken: config.bot_token,
      });
      this.enabled = true;
      console.log('Alert system: Initialized with Telegram');
    } catch (error) {
      console.error('Alert system initialization error:', error);
    }
  }

  async sendPaymentReceived(customerId, amount, invoiceNumber, receiptNumber) {
    if (!this.enabled || !this.telegram) {return;}

    try {
      const customer = await global.db.query(
        'SELECT name, telegram_chat_id FROM customers WHERE id = $1 AND telegram_chat_id IS NOT NULL',
        [customerId]
      );

      if (customer.rows.length === 0) {return;}

      const { name, telegram_chat_id } = customer.rows[0];
      const result = await this.telegram.sendPaymentConfirmation(
        telegram_chat_id,
        name,
        amount,
        invoiceNumber,
        receiptNumber
      );

      console.log(`Alert sent to ${name}: Payment received`, result.success ? '✅' : '❌');
    } catch (error) {
      console.error('Alert system error (payment received):', error);
    }
  }

  async sendPaymentReminder(customerId, amount, dueDate, invoiceNumber) {
    if (!this.enabled || !this.telegram) {return;}

    try {
      const customer = await global.db.query(
        'SELECT name, telegram_chat_id FROM customers WHERE id = $1 AND telegram_chat_id IS NOT NULL',
        [customerId]
      );

      if (customer.rows.length === 0) {return;}

      const { name, telegram_chat_id } = customer.rows[0];
      const result = await this.telegram.sendPaymentReminder(
        telegram_chat_id,
        name,
        amount,
        dueDate,
        invoiceNumber
      );

      console.log(`Alert sent to ${name}: Payment reminder`, result.success ? '✅' : '❌');
    } catch (error) {
      console.error('Alert system error (payment reminder):', error);
    }
  }

  async sendOverdueNotice(customerId, amount, daysOverdue) {
    if (!this.enabled || !this.telegram) {return;}

    try {
      const customer = await global.db.query(
        'SELECT name, telegram_chat_id FROM customers WHERE id = $1 AND telegram_chat_id IS NOT NULL',
        [customerId]
      );

      if (customer.rows.length === 0) {return;}

      const { name, telegram_chat_id } = customer.rows[0];
      const result = await this.telegram.sendOverdueNotice(
        telegram_chat_id,
        name,
        amount,
        daysOverdue
      );

      console.log(`Alert sent to ${name}: Overdue notice`, result.success ? '✅' : '❌');
    } catch (error) {
      console.error('Alert system error (overdue notice):', error);
    }
  }

  async sendServiceAlert(customerId, alertType, message) {
    if (!this.enabled || !this.telegram) {return;}

    try {
      const customer = await global.db.query(
        'SELECT name, telegram_chat_id FROM customers WHERE id = $1 AND telegram_chat_id IS NOT NULL',
        [customerId]
      );

      if (customer.rows.length === 0) {return;}

      const { name, telegram_chat_id } = customer.rows[0];
      const result = await this.telegram.sendServiceAlert(
        telegram_chat_id,
        alertType,
        message
      );

      console.log(`Alert sent to ${name}: Service alert (${alertType})`, result.success ? '✅' : '❌');
    } catch (error) {
      console.error('Alert system error (service alert):', error);
    }
  }

  async sendServiceSuspension(customerId, planName) {
    if (!this.enabled || !this.telegram) {return;}

    try {
      const customer = await global.db.query(
        'SELECT name, telegram_chat_id FROM customers WHERE id = $1 AND telegram_chat_id IS NOT NULL',
        [customerId]
      );

      if (customer.rows.length === 0) {return;}

      const { name, telegram_chat_id } = customer.rows[0];
      const message = `Your internet service (${planName}) has been suspended due to non-payment. Please make a payment to restore your service.`;
      
      const result = await this.telegram.sendServiceAlert(
        telegram_chat_id,
        'error',
        message
      );

      console.log(`Alert sent to ${name}: Service suspension`, result.success ? '✅' : '❌');
    } catch (error) {
      console.error('Alert system error (service suspension):', error);
    }
  }

  async sendNewInvoice(customerId, invoiceNumber, amount, dueDate) {
    if (!this.enabled || !this.telegram) {return;}

    try {
      const customer = await global.db.query(
        'SELECT name, telegram_chat_id FROM customers WHERE id = $1 AND telegram_chat_id IS NOT NULL',
        [customerId]
      );

      if (customer.rows.length === 0) {return;}

      const { name, telegram_chat_id } = customer.rows[0];
      const message = `📄 New Invoice: ${invoiceNumber}\n\nAmount: KES ${amount}\nDue Date: ${dueDate}\n\nPlease make payment before the due date to avoid service interruption.`;
      
      const result = await this.telegram.sendMessage(
        telegram_chat_id,
        message
      );

      console.log(`Alert sent to ${name}: New invoice`, result.success ? '✅' : '❌');
    } catch (error) {
      console.error('Alert system error (new invoice):', error);
    }
  }

  async sendBulkOverdueReminders() {
    if (!this.enabled || !this.telegram) {return;}

    try {
      const result = await global.db.query(`
        SELECT 
          c.id, c.name, c.telegram_chat_id,
          i.invoice_number, i.total, i.due_date,
          EXTRACT(DAY FROM (CURRENT_DATE - i.due_date)) as days_overdue
        FROM customers c
        JOIN invoices i ON c.id = i.customer_id
        WHERE c.telegram_chat_id IS NOT NULL
          AND i.status != 'paid'
          AND i.due_date < CURRENT_DATE
          AND EXTRACT(DAY FROM (CURRENT_DATE - i.due_date)) IN (1, 3, 7, 14)
      `);

      for (const row of result.rows) {
        await this.sendOverdueNotice(
          row.id,
          row.total,
          row.days_overdue
        );
      }

      console.log(`Bulk overdue reminders sent: ${result.rows.length} customers`);
    } catch (error) {
      console.error('Alert system error (bulk overdue):', error);
    }
  }
}

// Singleton instance
const alertSystem = new AlertSystem();

module.exports = alertSystem;
