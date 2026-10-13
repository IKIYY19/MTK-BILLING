const billing = require("./billingData");
const radiusSync = require("./radiusSync");
const notificationService = require("./notificationService");
const logger = require("../utils/logger");
const crypto = require("crypto");

function generatePassword(length = 8) {
  return crypto.randomBytes(length).toString("hex").slice(0, length).toUpperCase();
}

function generateUsername(customer) {
  const name = (customer.name || "user").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  const suffix = crypto.randomBytes(2).toString("hex");
  return `${name}${suffix}`;
}

async function autoProvisionOnPayment(payment) {
  try {
    if (!payment || !payment.customer_id) return null;

    const customer = payment.customer || await billing.getCustomerById(payment.customer_id);
    if (!customer) return null;

    const subscriptions = await billing.listSubscriptions();
    const customerSubs = subscriptions.filter(s => s.customer_id === payment.customer_id && s.status === "active");

    let provisioned = 0;
    for (const sub of customerSubs) {
      if (sub.auto_provision === false) continue;
      if (sub.pppoe_username && sub.pppoe_password) continue;

      const username = sub.pppoe_username || generateUsername(customer);
      const password = generatePassword(8);

      const plan = sub.plan || (sub.plan_id ? await billing.getPlanById(sub.plan_id) : null);

      await billing.updateSubscription(sub.id, {
        pppoe_username: username,
        pppoe_password: password,
      });

      try {
        await radiusSync.upsertRadiusUser({
          ...sub,
          pppoe_username: username,
          pppoe_password: password,
          customer_id: customer.id,
          customer: { id: customer.id, name: customer.name },
          plan,
          status: "active",
        });
      } catch (e) {
        logger.error("[AutoProvision] RADIUS sync failed:", { error: e.message });
      }

      const planName = plan?.name || "Active";
      const speed = plan ? `${plan.speed_up}/${plan.speed_down}` : "N/A";
      const phone = customer.phone || "";

      if (phone) {
        try {
          await notificationService.triggerSMS("welcome", {
            customer,
            plan_name: planName,
            speed,
            pppoe_user: username,
            pppoe_pass: password,
            company_name: process.env.COMPANY_NAME || "Your ISP",
            support_phone: phone,
          });
        } catch (e) {
          logger.error("[AutoProvision] Welcome SMS failed:", { error: e.message });
        }
      }

      logger.info(`[AutoProvision] Provisioned ${customer.name}: ${username} on ${planName}`);
      provisioned++;
    }

    // Also reactivate any suspended subscriptions that already have credentials
    const reactivated = await reactivateOnPayment(payment);
    if (reactivated) {
      logger.info(`[AutoProvision] Reactivated ${reactivated.reactivated} sub(s) for ${reactivated.customer_name}`);
    }

    return provisioned > 0
      ? { provisioned, customer_name: customer.name }
      : (reactivated || null);
  } catch (e) {
    logger.error("[AutoProvision] Failed:", { error: e.message });
    return null;
  }
}

async function reactivateOnPayment(payment) {
  try {
    if (!payment || !payment.customer_id) return null;

    const customer = payment.customer || await billing.getCustomerById(payment.customer_id);
    if (!customer) return null;

    const subscriptions = await billing.listSubscriptions();
    const suspended = subscriptions.filter(
      s => s.customer_id === payment.customer_id &&
           s.status === 'suspended' &&
           s.pppoe_username
    );

    if (suspended.length === 0) return null;

    let reactivated = 0;
    for (const sub of suspended) {
      const plan = sub.plan || (sub.plan_id ? await billing.getPlanById(sub.plan_id) : null);
      const periodDays = plan?.billing_period_days || plan?.period_days || 30;
      const newExpiry = new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000);

      await billing.updateSubscription(sub.id, {
        status: 'active',
        expires_at: newExpiry.toISOString(),
      });

      try {
        await radiusSync.upsertRadiusUser({
          ...sub,
          status: 'active',
          customer_id: customer.id,
          customer: { id: customer.id, name: customer.name },
          plan,
        });
      } catch (e) {
        logger.error('[AutoProvision] RADIUS reactivation failed:', { error: e.message });
      }

      if (customer.phone) {
        try {
          await notificationService.triggerSMS('service_restored', {
            customer,
            amount: payment.amount,
            mpesa_receipt: payment.reference || payment.receipt_number || '',
            plan_name: plan?.name || 'Active',
            company_name: process.env.COMPANY_NAME || 'Your ISP',
          });
        } catch (e) {
          logger.error('[AutoProvision] Service restored SMS failed:', { error: e.message });
        }
      }

      logger.info(`[AutoProvision] Reactivated ${customer.name}: ${sub.pppoe_username}`);
      reactivated++;
    }

    return reactivated > 0 ? { reactivated, customer_name: customer.name } : null;
  } catch (e) {
    logger.error('[AutoProvision] Reactivation failed:', { error: e.message });
    return null;
  }
}

module.exports = { autoProvisionOnPayment, reactivateOnPayment };
