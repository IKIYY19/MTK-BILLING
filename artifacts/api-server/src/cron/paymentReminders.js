/**
 * Payment Reminders Cron
 * Runs daily to send payment reminders before due dates
 */

const repo = require("../db/billingRepository");
const axios = require("axios");
const notificationService = require("../services/notificationService");

const API_URL = process.env.API_URL || "http://localhost:5173";

async function runPaymentReminders() {
  try {
    console.log("[Cron] Running payment reminders check...");

    // 1. Get invoices due in 3, 7, and 14 days
    const reminderDays = [3, 7, 14];
    const reminders = [];

    for (const days of reminderDays) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + days);
      const dueDateStr = dueDate.toISOString().split("T")[0];

      const invoices = await repo.invoices.getByDueDate(dueDateStr);
      if (invoices.length > 0) {
        reminders.push({ days, invoices });
        console.log(
          `[Cron] Found ${invoices.length} invoices due in ${days} days`,
        );
      }
    }

    if (reminders.length === 0) {
      console.log("[Cron] No upcoming payment reminders");
      return;
    }

    // 2. Send reminders for each invoice
    for (const { days, invoices } of reminders) {
      for (const invoice of invoices) {
        await sendReminder(invoice, days);
      }
    }

    console.log("[Cron] Payment reminders completed");
  } catch (error) {
    console.error("[Cron] Payment reminders error:", error);
  }
}

async function sendReminder(invoice, daysUntilDue) {
  try {
    // Get notification settings
    const settings = await getNotificationSettings("invoice_due");
    if (!settings || !settings.enabled) {
      return;
    }

    // Get customer details
    const customer = await repo.customers.getById(invoice.customer_id);
    if (!customer) {
      console.log(
        `[Cron] Customer not found for invoice ${invoice.invoice_number}`,
      );
      return;
    }

    // Send email if enabled
    if (settings.email_enabled && settings.email_recipients) {
      await sendEmailReminder(
        customer,
        invoice,
        daysUntilDue,
        settings.email_recipients,
      );
    }

    // Send SMS if enabled
    if (settings.sms_enabled && settings.sms_recipients) {
      await sendSMSReminder(
        customer,
        invoice,
        daysUntilDue,
        settings.sms_recipients,
      );
    }

    // Send webhook if enabled
    if (settings.webhook_enabled && settings.webhook_url) {
      await sendWebhookReminder(
        customer,
        invoice,
        daysUntilDue,
        settings.webhook_url,
      );
    }

    console.log(`[Cron] Sent reminders for invoice ${invoice.invoice_number}`);
  } catch (error) {
    console.error(
      `[Cron] Error sending reminder for invoice ${invoice.invoice_number}:`,
      error,
    );
  }
}

async function getNotificationSettings(type) {
  try {
    if (!global.db) {
      return null;
    }
    const result = await global.db.query(
      "SELECT * FROM notification_settings WHERE notification_type = $1",
      [type],
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error("Error getting notification settings:", error);
    return null;
  }
}
async function sendEmailReminder(customer, invoice, daysUntilDue, recipients) {
  try {
    const { sendEmail } = require("../services/email");
    const recipientList = recipients.split(",").map(r => r.trim()).filter(Boolean);
    if (recipientList.length === 0 && customer.email) {recipientList.push(customer.email);}
    if (!recipientList[0]) {return;}

    const baseUrl = process.env.APP_URL || "http://localhost:5000";
    for (const to of recipientList) {
      await sendEmail({
        to,
        template: "payment_due",
        data: {
          customerName: customer.name || "Customer",
          invoiceNumber: invoice.invoice_number,
          amount: `${invoice.total || invoice.amount} KES`,
          dueDate: new Date(invoice.due_date).toLocaleDateString("en-KE"),
          paymentUrl: `${baseUrl}/pay/${invoice.id}`,
        },
      });
    }
    console.log(`[Cron] Email sent: ${invoice.invoice_number} to ${recipientList.join(", ")}`);
  } catch (error) {
    console.error("Email reminder error:", error.message);
  }
}

async function sendSMSReminder(customer, invoice, daysUntilDue, recipients) {
  try {
    const message = `Payment Reminder: Invoice ${invoice.invoice_number} for ${invoice.total} is due in ${daysUntilDue} days. Please pay to avoid service interruption.`;

    const recipientList = recipients.split(",").map((r) => r.trim()).filter(Boolean);
    if (recipientList.length === 0 && customer.phone) {
      recipientList.push(customer.phone);
    }

    for (const phone of recipientList) {
      await notificationService.triggerSMS("invoice_due_soon", {
        customer: { ...customer, phone },
        invoice,
        custom_message: message,
      });
    }

    console.log(
      `[Cron] SMS reminder sent for invoice ${invoice.invoice_number}`,
    );
  } catch (error) {
    console.error("Error sending SMS reminder:", error);
  }
}

async function sendWebhookReminder(
  customer,
  invoice,
  daysUntilDue,
  webhookUrl,
) {
  try {
    await axios.post(webhookUrl, {
      event: "payment_reminder",
      invoice: {
        id: invoice.id,
        number: invoice.invoice_number,
        amount: invoice.total,
        due_date: invoice.due_date,
        days_until_due: daysUntilDue,
      },
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
    });

    console.log(
      `[Cron] Webhook reminder sent for invoice ${invoice.invoice_number}`,
    );
  } catch (error) {
    console.error("Error sending webhook reminder:", error);
  }
}

// Start the cron
function startCron() {
  // Run every 24 hours
  const interval = 24 * 60 * 60 * 1000;
  console.log(`[Cron] Payment reminders cron started, runs every 24 hours`);

  // Run after 10 minutes on start (give database time to be ready)
  setTimeout(
    () => {
      runPaymentReminders();
    },
    10 * 60 * 1000,
  );

  setInterval(runPaymentReminders, interval);
}

module.exports = { runPaymentReminders, startCron };
