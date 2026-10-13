/**
 * Email Notification Service
 * Supports multiple providers: SendGrid, Mailgun, SMTP, AWS SES
 */

const nodemailer = require('nodemailer');

// Email templates
const TEMPLATES = {
  payment_received: {
    subject: 'Payment Received - Thank You!',
    html: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10b981;">Payment Confirmed</h2>
        <p>Dear ${data.customerName},</p>
        <p>We have received your payment of <strong>${data.amount}</strong>.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px; border: 1px solid #ddd;">Invoice #</td><td style="padding: 8px; border: 1px solid #ddd;">${data.invoiceNumber}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;">Amount</td><td style="padding: 8px; border: 1px solid #ddd;">${data.amount}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;">Date</td><td style="padding: 8px; border: 1px solid #ddd;">${data.date}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;">Method</td><td style="padding: 8px; border: 1px solid #ddd;">${data.method}</td></tr>
        </table>
        <p>Your service will continue uninterrupted.</p>
        <p style="color: #6b7280; font-size: 12px;">This is an automated message. Please do not reply.</p>
      </div>
    `,
  },
  payment_due: {
    subject: 'Payment Due - Action Required',
    html: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f59e0b;">Payment Reminder</h2>
        <p>Dear ${data.customerName},</p>
        <p>Your invoice <strong>${data.invoiceNumber}</strong> is due on <strong>${data.dueDate}</strong>.</p>
        <p style="font-size: 24px; color: #f59e0b; font-weight: bold;">Amount: ${data.amount}</p>
        <p>To avoid service interruption, please make your payment before the due date.</p>
        <p style="margin-top: 30px;"><a href="${data.paymentUrl}" style="background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Pay Now</a></p>
        <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">Contact us if you have any questions.</p>
      </div>
    `,
  },
  service_suspended: {
    subject: 'Service Suspended - Immediate Action Required',
    html: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ef4444;">Service Suspended</h2>
        <p>Dear ${data.customerName},</p>
        <p>Your service has been <strong style="color: #ef4444;">suspended</strong> due to non-payment.</p>
        <p>Outstanding amount: <strong style="color: #ef4444; font-size: 20px;">${data.amount}</strong></p>
        <p>Please make payment immediately to restore your service.</p>
        <p style="margin-top: 30px;"><a href="${data.paymentUrl}" style="background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Restore Service</a></p>
        <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">Contact support if this is an error.</p>
      </div>
    `,
  },
  service_restored: {
    subject: 'Service Restored',
    html: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10b981;">Service Restored</h2>
        <p>Dear ${data.customerName},</p>
        <p>Your service has been <strong style="color: #10b981;">restored</strong> following your payment.</p>
        <p>You can now enjoy uninterrupted internet access.</p>
        <p style="color: #6b7280; font-size: 12px;">Thank you for being a valued customer!</p>
      </div>
    `,
  },
  welcome: {
    subject: 'Welcome to Our Service!',
    html: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3b82f6;">Welcome Aboard!</h2>
        <p>Dear ${data.customerName},</p>
        <p>Your account has been created successfully.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px; border: 1px solid #ddd;">Plan</td><td style="padding: 8px; border: 1px solid #ddd;">${data.plan}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;">Speed</td><td style="padding: 8px; border: 1px solid #ddd;">${data.speed}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;">Username</td><td style="padding: 8px; border: 1px solid #ddd;">${data.username}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;">Password</td><td style="padding: 8px; border: 1px solid #ddd;">Contact support or visit the customer portal to retrieve your password.</td></tr>
        </table>
        <p style="color: #6b7280; font-size: 12px;">Keep your credentials secure. Never share your password via email or phone.</p>
      </div>
    `,
  },
  password_reset: {
    subject: 'Reset Your Password',
    html: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3b82f6;">Password Reset Request</h2>
        <p>Click the button below to reset your password:</p>
        <p style="margin: 30px 0;"><a href="${data.resetUrl}" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Reset Password</a></p>
        <p style="color: #6b7280; font-size: 12px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
      </div>
    `,
  },
  ticket_created: {
    subject: 'Support Ticket Created',
    html: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3b82f6;">Ticket #${data.ticketNumber}</h2>
        <p>Dear ${data.customerName},</p>
        <p>Your support ticket has been created:</p>
        <p><strong>Subject:</strong> ${data.subject}</p>
        <p><strong>Status:</strong> ${data.status}</p>
        <p>Our team will respond within ${data.slaTime}.</p>
      </div>
    `,
  },
};

// Create email transporter
function createTransporter() {
  // Support multiple providers
  const provider = process.env.EMAIL_PROVIDER || 'smtp';

  if (provider === 'sendgrid') {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY,
      },
    });
  }

  if (provider === 'mailgun') {
    return nodemailer.createTransport({
      host: 'smtp.mailgun.org',
      port: 587,
      secure: false,
      auth: {
        user: process.env.MAILGUN_USER,
        pass: process.env.MAILGUN_PASSWORD,
      },
    });
  }

  if (provider === 'ses') {
    return nodemailer.createTransport({
      host: process.env.AWS_SES_HOST || 'email-smtp.us-east-1.amazonaws.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.AWS_SES_USER,
        pass: process.env.AWS_SES_PASSWORD,
      },
    });
  }

  // Default: Generic SMTP
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    } : undefined,
  });
}

// Send email
async function sendEmail({ to, subject, html, template, data }) {
  try {
    // If using template, generate html from template
    if (template && data) {
      const tmpl = TEMPLATES[template];
      if (tmpl) {
        subject = tmpl.subject;
        html = tmpl.html(data);
      }
    }

    if (!to || !subject || !html) {
      console.warn('Email missing required fields:', { to, subject, html: !!html });
      return false;
    }

    const transporter = createTransporter();
    const from = process.env.EMAIL_FROM;
    if (!from || from.includes('yourisp.com')) {
      console.warn('⚠️  EMAIL_FROM is not configured or still uses the placeholder value. Emails will not be sent.');
      return false;
    }

    await transporter.sendMail({
      from,
      to,
      subject,
      html,
    });

    console.log(`✅ Email sent to ${to}: ${subject}`);
    return true;
  } catch (error) {
    console.error('❌ Email send failed:', error.message);
    return false;
  }
}

// Send bulk emails
async function sendBulkEmails(emails) {
  console.log(`Sending ${emails.length} emails...`);
  const results = await Promise.allSettled(
    emails.map(email => sendEmail(email))
  );

  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value).length;
  const failed = results.length - succeeded;

  console.log(`Email batch complete: ${succeeded} succeeded, ${failed} failed`);
  return { succeeded, failed };
}

// Trigger email based on event
async function triggerEmail(event, data) {
  const emailMap = {
    'payment_received': { template: 'payment_received', to: data.customerEmail },
    'payment_due': { template: 'payment_due', to: data.customerEmail },
    'service_suspended': { template: 'service_suspended', to: data.customerEmail },
    'service_restored': { template: 'service_restored', to: data.customerEmail },
    'customer_welcome': { template: 'welcome', to: data.customerEmail },
    'password_reset': { template: 'password_reset', to: data.email },
    'ticket_created': { template: 'ticket_created', to: data.customerEmail },
  };

  const config = emailMap[event];
  if (!config) {
    console.warn(`Unknown email event: ${event}`);
    return false;
  }

  return sendEmail({ ...config, data });
}

module.exports = {
  sendEmail,
  sendBulkEmails,
  triggerEmail,
  TEMPLATES,
};
