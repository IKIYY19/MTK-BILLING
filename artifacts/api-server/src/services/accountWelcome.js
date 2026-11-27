/**
 * Sends the automatic welcome/account-created message for a subscription.
 *
 * Everything in the message comes from real billing data (customer, plan,
 * subscription dates, router credentials) and the configurable settings table.
 * A subscription is claimed with welcome_sent_at so onboarding flows that
 * create a customer and a subscription in one request cannot send duplicates.
 */

const notificationService = require("./notificationService");
const validity = require("./validity");
const logger = require("../utils/logger");

function billingData() {
  return require("./billingData");
}

function formatDate(value, includeTime = false) {
  if (!value) {return "";}
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {return String(value);}
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
    timeZone: "Africa/Nairobi",
  }).format(date);
}

async function markWelcomeSent(subscriptionId) {
  if (global.dbAvailable && global.db) {
    const result = await global.db.query(
      `UPDATE subscriptions SET welcome_sent_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND welcome_sent_at IS NULL RETURNING id`,
      [subscriptionId],
    );
    return result.rowCount > 0;
  }

  const current = await billingData().getSubscriptionById(subscriptionId);
  if (!current || current.welcome_sent_at) {return false;}
  await billingData().updateSubscription(subscriptionId, {
    welcome_sent_at: new Date().toISOString(),
  });
  return true;
}

async function sendForSubscription(subscriptionId, options = {}) {
  const { event = "account_created", force = false } = options;
  if (!subscriptionId) {
    return { success: false, skipped: true, message: "Missing subscription" };
  }

  const billing = billingData();
  const sub = await billing.getSubscriptionById(subscriptionId);
  if (!sub) {
    return { success: false, skipped: true, message: "Subscription not found" };
  }

  if (!force) {
    const claimed = await markWelcomeSent(subscriptionId);
    if (!claimed) {
      return { success: false, skipped: true, message: "Welcome already sent" };
    }
  } else if (global.dbAvailable && global.db) {
    await global.db.query(
      `UPDATE subscriptions SET welcome_sent_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [subscriptionId],
    );
  } else {
    await billing.updateSubscription(subscriptionId, {
      welcome_sent_at: new Date().toISOString(),
    });
  }

  // The subscription join only exposes a slim customer object; fetch the full
  // record so the generated account number is available to the message.
  const customer =
    (await billing.getCustomerById(sub.customer_id)) || sub.customer;
  if (!customer?.phone) {
    return { success: false, skipped: true, message: "Customer has no phone number" };
  }

  // The plan joined onto a subscription is a slim reference without validity
  // fields, so load the full plan for expiry calculations.
  const plan =
    (sub.plan_id ? await billing.getPlanById(sub.plan_id) : null) || sub.plan;
  const validityMinutes = validity.totalMinutes(plan || {});
  const shortValidity = validityMinutes > 0 && validityMinutes <= 24 * 60;

  // start_date/end_date are DATE columns, so they lose the time of day. For
  // short plans derive the exact window from created_at + plan validity so the
  // customer sees useful times instead of the same date twice.
  const windowStart = shortValidity
    ? sub.created_at || new Date().toISOString()
    : sub.start_date || new Date().toISOString();
  const startDate = shortValidity ? windowStart : sub.start_date || windowStart;
  const endDate = shortValidity
    ? validity.endDate(plan || {}, windowStart) || sub.end_date || ""
    : sub.end_date || validity.endDate(plan || {}, startDate) || "";

  try {
    const result = await notificationService.triggerSMS(event, {
      customer,
      sub,
      plan,
      account_number: customer.account_number || "",
      start_date: formatDate(startDate, shortValidity),
      end_date: formatDate(endDate, shortValidity),
      pppoe_username: sub.pppoe_username || "",
      pppoe_password: sub.pppoe_password || "",
    });
    return { ...result, event, subscription_id: subscriptionId };
  } catch (error) {
    logger.error("[AccountWelcome] Failed to send message", {
      subscription_id: subscriptionId,
      error: error.message,
    });
    return {
      success: false,
      event,
      subscription_id: subscriptionId,
      message: error.message,
    };
  }
}

module.exports = { sendForSubscription, formatDate };
