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

    // PPPoE customers are reminded from their subscription end date, which is
    // their real service due date. Invoice reminders below are separate.
    await runSubscriptionDueReminders();

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
      console.log("[Cron] No upcoming invoice reminders");
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

const DEFAULT_PPPOE_REMINDER_DAYS = [6, 2, 1];

async function getPppoeReminderDays() {
  try {
    if (!global.db) {return DEFAULT_PPPOE_REMINDER_DAYS;}
    const result = await global.db.query(
      "SELECT value FROM settings WHERE key = 'pppoe_due_reminder_days'",
    );
    const days = String(result.rows[0]?.value || "")
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((day) => Number.isInteger(day) && day > 0);
    return days.length
      ? [...new Set(days)].sort((a, b) => b - a)
      : DEFAULT_PPPOE_REMINDER_DAYS;
  } catch {
    return DEFAULT_PPPOE_REMINDER_DAYS;
  }
}

function nairobiDate(daysFromNow = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(Date.now() + daysFromNow * 86400000));
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function readableDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {return String(value || "");}
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Nairobi",
  }).format(date);
}

async function runSubscriptionDueReminders() {
  if (!global.dbAvailable || !global.db) {return;}

  const daysList = await getPppoeReminderDays();
  for (const days of daysList) {
    const dueDate = nairobiDate(days);
    const result = await global.db.query(
      `SELECT s.id, s.end_date, s.pppoe_username,
              c.id AS customer_id, c.name AS customer_name, c.phone, c.account_number,
              sp.name AS plan_name
         FROM subscriptions s
         JOIN customers c ON c.id = s.customer_id
         LEFT JOIN service_plans sp ON sp.id = s.plan_id
        WHERE s.status = 'active'
          AND s.end_date = $1
          AND NULLIF(TRIM(COALESCE(s.pppoe_username, '')), '') IS NOT NULL
          AND NULLIF(TRIM(COALESCE(c.phone, '')), '') IS NOT NULL`,
      [dueDate],
    );

    for (const row of result.rows) {
      // One reminder per subscription / due date / window, even if the cron
      // runs more than once in a day.
      const claim = await global.db.query(
        `INSERT INTO subscription_due_reminders (subscription_id, due_date, days_before)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id`,
        [row.id, dueDate, days],
      );
      if (!claim.rowCount) {continue;}

      await notificationService.triggerSMS("subscription_due_soon", {
        customer: {
          id: row.customer_id,
          name: row.customer_name,
          phone: row.phone,
          account_number: row.account_number,
        },
        account_number: row.account_number,
        plan: { name: row.plan_name || "" },
        sub: { id: row.id, pppoe_username: row.pppoe_username, end_date: row.end_date },
        due_date: readableDate(row.end_date),
        days_left: days,
      });
    }
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

module.exports = { runPaymentReminders, runSubscriptionDueReminders, startCron };
