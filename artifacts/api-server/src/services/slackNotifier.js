const axios = require("axios");

let webhookUrl = process.env.SLACK_WEBHOOK_URL || "";

function configure(url) {
  webhookUrl = url;
}

async function notify(message, color = "#3b82f6") {
  if (!webhookUrl) {return false;}
  try {
    await axios.post(webhookUrl, {
      attachments: [{
        color,
        text: message,
        footer: "MikroTik Billing",
        ts: Math.floor(Date.now() / 1000)
      }]
    }, { timeout: 5000 });
    return true;
  } catch (e) {
    console.error("Slack notify error:", e.message);
    return false;
  }
}

// Specific event notifiers
async function paymentReceived(customerName, amount, invoiceNumber) {
  return notify(`💰 *Payment Received*\n*${customerName}* paid KES ${amount.toLocaleString()}\nInvoice: ${invoiceNumber}`, "#22c55e");
}

async function customerCreated(customerName, planName, phone) {
  return notify(`🆕 *New Customer*\n*${customerName}* signed up\nPlan: ${planName || 'None'}\nPhone: ${phone || 'N/A'}`, "#3b82f6");
}

async function customerSuspended(customerName, daysOverdue) {
  return notify(`🚫 *Customer Suspended*\n*${customerName}* — ${daysOverdue} days overdue`, "#ef4444");
}

async function routerProvisioned(routerName, wanPort, lanPorts) {
  return notify(`🔧 *Router Provisioned*\n*${routerName}* — WAN: ${wanPort}, LAN: ${lanPorts}`, "#8b5cf6");
}

module.exports = { configure, notify, paymentReceived, customerCreated, customerSuspended, routerProvisioned };
