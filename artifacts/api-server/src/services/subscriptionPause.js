/**
 * Vacation pause support for PPPoE subscriptions.
 *
 * Pausing disables the subscriber in RADIUS and on the MikroTik router, keeps
 * the account intact, and records when the pause started. Resuming re-enables
 * the subscriber and extends the paid end_date by the number of whole days the
 * service was paused, so travel time does not consume subscription validity.
 */
const logger = require("../utils/logger");
const billing = require("./billingData");
const radiusSync = require("./radiusSync");
const mikrotikProvisioning = require("./mikrotikProvisioning");
const notificationService = require("./notificationService");
const opsAlertService = require("./opsAlertService");
const { audit } = require("../utils/audit");

const MAX_PAUSE_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function parsePauseUntil(value) {
  if (!value) {throw httpError("Choose the date the service should resume.");}
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {throw httpError("The resume date is invalid.");}
  if (date.getTime() <= Date.now() + 60 * 60 * 1000) {
    throw httpError("The resume date must be at least one hour from now.");
  }
  if (date.getTime() > Date.now() + MAX_PAUSE_DAYS * DAY_MS) {
    throw httpError(`A pause cannot be longer than ${MAX_PAUSE_DAYS} days.`);
  }
  return date;
}

function addDaysToDate(value, days) {
  if (!value || !days) {return value || null;}
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {return value;}
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function pausedDays(sub) {
  const startedAt = new Date(sub.paused_at || sub.pause_until || Date.now());
  if (Number.isNaN(startedAt.getTime())) {return 0;}
  return Math.max(0, Math.ceil(Math.max(0, Date.now() - startedAt.getTime()) / DAY_MS));
}

async function expand(sub) {
  const customer = sub.customer || (await billing.getCustomerById(sub.customer_id));
  const plan = sub.plan || (sub.plan_id ? await billing.getPlanById(sub.plan_id) : null);
  return { ...sub, customer, plan };
}

async function syncSubscriptionStatus(subscription, targetStatus) {
  const expanded = await expand({ ...subscription, status: targetStatus });
  let radiusResult = null;
  let routerResult = null;

  if (await radiusSync.isRadiusEnabled()) {
    try {
      radiusResult = await radiusSync.reconcileRadiusUser(expanded);
    } catch (error) {
      radiusResult = { success: false, status: "failed", error: error.message };
    }
  }

  if (expanded.mikrotik_connection_id && expanded.auto_provision !== false) {
    try {
      routerResult = await mikrotikProvisioning.reconcileSubscription(expanded);
    } catch (error) {
      routerResult = { success: false, status: "failed", error: error.message };
    }
  }

  const required = [radiusResult, routerResult].filter(Boolean);
  const allSuccess = required.length > 0 && required.every((r) => r?.success);
  const anySuccess = required.some((r) => r?.success);

  await billing.updateSubscription(expanded.id, {
    last_synced_at: new Date().toISOString(),
    last_sync_status: allSuccess
      ? "synced"
      : anySuccess
        ? "partial"
        : required.some((r) => r?.status === "failed") ? "failed" : "skipped",
    last_sync_error: required.map((r) => r?.error).filter(Boolean).join(" | ") || null,
    last_radius_sync_status: radiusResult?.status || null,
    last_radius_sync_error: radiusResult?.error || null,
  });

  return {
    radius_sync: radiusResult,
    mikrotik_sync: routerResult,
  };
}

function notify(event, expanded, extra = {}) {
  if (!expanded.customer?.phone) {return;}
  notificationService
    .triggerSMS(event, {
      customer: expanded.customer,
      sub: expanded,
      plan: expanded.plan,
      pppoe_username: expanded.pppoe_username,
      pppoe_password: expanded.pppoe_password,
      ...extra,
    })
    .catch((error) => logger.warn(`Pause notification failed (${event}): ${error.message}`));
}

async function pause(subscriptionId, pauseUntilInput, reasonInput, userId = null) {
  const before = await billing.getSubscriptionById(subscriptionId);
  if (!before) {throw httpError("Subscription not found.", 404);}
  if (!["active", "paused"].includes(before.status)) {
    throw httpError("Only an active subscription can be paused. Activate a suspended subscription first.");
  }

  const pauseUntil = parsePauseUntil(pauseUntilInput);
  const reason = String(reasonInput || "Customer travel").trim().slice(0, 200);
  const wasPaused = before.status === "paused";

  const updated = await billing.updateSubscription(subscriptionId, {
    status: "paused",
    paused_at: wasPaused ? before.paused_at || before.updated_at || new Date().toISOString() : new Date().toISOString(),
    pause_until: pauseUntil.toISOString(),
    pause_reason: reason,
  });
  if (!updated) {throw httpError("Subscription not found.", 404);}

  const sync = wasPaused
    ? { radius_sync: null, mikrotik_sync: null }
    : await syncSubscriptionStatus(updated, "paused");

  const expanded = await expand(updated);
  const after = await billing.getSubscriptionById(subscriptionId);

  if (userId) {
    await audit.custom({
      action: "SUBSCRIPTION_PAUSED",
      entityType: "subscription",
      entityId: subscriptionId,
      userId,
      before,
      after,
      details: { pause_until: pauseUntil.toISOString(), pause_reason: reason },
    });
  }

  notify("service_paused", expanded, {
    pause_until: pauseUntil.toISOString(),
    pause_reason: reason,
  });
  opsAlertService
    .subscriptionEvent(
      "paused",
      expanded.pppoe_username || expanded.customer?.name || "Unknown",
      `${expanded.plan?.name || "No plan"} · resumes ${pauseUntil.toISOString()} · ${reason}`,
    )
    .catch(() => {});

  return { ...expanded, ...sync };
}

async function resume(subscriptionId, reason = "manual", userId = null) {
  const before = await billing.getSubscriptionById(subscriptionId);
  if (!before) {throw httpError("Subscription not found.", 404);}
  if (before.status !== "paused") {throw httpError("This subscription is not paused.");}

  const days = pausedDays(before);
  const newEndDate = addDaysToDate(before.end_date, days);

  const updated = await billing.updateSubscription(subscriptionId, {
    status: "active",
    paused_at: null,
    pause_until: null,
    pause_reason: null,
    end_date: newEndDate,
  });
  if (!updated) {throw httpError("Subscription not found.", 404);}

  const sync = await syncSubscriptionStatus(updated, "active");
  const expanded = await expand(updated);
  const after = await billing.getSubscriptionById(subscriptionId);

  if (userId) {
    await audit.custom({
      action: "SUBSCRIPTION_RESUMED",
      entityType: "subscription",
      entityId: subscriptionId,
      userId,
      before,
      after,
      details: { reason, paused_days: days },
    });
  }

  notify("service_resumed", expanded, { resumed_reason: reason, paused_days: days });
  opsAlertService
    .subscriptionEvent(
      "resumed",
      expanded.pppoe_username || expanded.customer?.name || "Unknown",
      `${expanded.plan?.name || "No plan"} · validity extended by ${days} day(s)`,
    )
    .catch(() => {});

  if (days > 0) {
    logger.info("Subscription resumed and validity extended", {
      subscriptionId,
      pausedDays: days,
      reason,
    });
  }

  return { ...expanded, ...sync };
}

async function autoResumeExpired() {
  let due = [];
  if (global.dbAvailable && global.db) {
    const result = await global.db.query(
      `SELECT id FROM subscriptions
       WHERE status = 'paused' AND pause_until IS NOT NULL AND pause_until <= CURRENT_TIMESTAMP`,
    );
    due = result.rows;
  } else {
    const subscriptions = await billing.listSubscriptions();
    due = subscriptions
      .filter((s) => s.status === "paused" && s.pause_until && new Date(s.pause_until) <= new Date())
      .map((s) => ({ id: s.id }));
  }

  let resumed = 0;
  let failed = 0;
  for (const row of due) {
    try {
      await resume(row.id, "auto");
      resumed += 1;
    } catch (error) {
      failed += 1;
      logger.error("Auto-resume failed for subscription", {
        subscriptionId: row.id,
        error: error.message,
      });
    }
  }
  return { checked: due.length, resumed, failed };
}

module.exports = { pause, resume, autoResumeExpired };
