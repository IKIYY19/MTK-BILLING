const routerConnectionManager = require("./routerConnectionManager");
const provisioningQueue = require("./provisioningQueue");

const db = global.db || require("../db/memory");

function getDb() {
  return global.db || db;
}

async function getConnectionById(connectionId) {
  if (!connectionId) {return null;}

  const result = await getDb().query(
    "SELECT * FROM mikrotik_connections WHERE id = $1",
    [connectionId],
  );
  if (result.rows.length === 0) {
    return null;
  }

  const connection = result.rows[0];
  return {
    ...connection,
    password: routerConnectionManager.decryptPassword(connection.password_encrypted),
  };
}

async function execute(connectionId, command, args = {}) {
  return routerConnectionManager.executeCommand(connectionId, command, args);
}

async function print(connectionId, path, properties = null) {
  return routerConnectionManager.print(connectionId, path, properties);
}

function buildRateLimit(plan) {
  if (!plan?.speed_down || !plan?.speed_up) {
    return "";
  }

  return `${plan.speed_down}/${plan.speed_up}`;
}

function buildComment(subscription) {
  const customerName = subscription.customer?.name || "Unknown";
  const planName = subscription.plan?.name || "N/A";
  return `Customer: ${customerName} | Plan: ${planName} | Billing Sync`;
}

async function findSecret(connectionId, username) {
  const secrets = await print(
    connectionId,
    "/ppp/secret",
    ".id,name,disabled,profile,service,comment",
  );
  return secrets.find((secret) => secret.name === username) || null;
}

async function executeUpsertSecretDirectly(subscription) {
  if (!subscription.mikrotik_connection_id) {
    return {
      success: false,
      status: "skipped",
      error: "No MikroTik connection linked to subscription",
    };
  }
  if (!subscription.pppoe_username) {
    return {
      success: false,
      status: "skipped",
      error: "PPPoE username is required to provision the subscription",
    };
  }

  const existing = await findSecret(
    subscription.mikrotik_connection_id,
    subscription.pppoe_username,
  );
  const args = {
    name: subscription.pppoe_username,
    password: subscription.pppoe_password || subscription.pppoe_username,
    service: "pppoe",
    disabled: subscription.status === "active" ? "no" : "yes",
    comment: buildComment(subscription),
  };

  if (subscription.pppoe_profile) {
    args.profile = subscription.pppoe_profile;
  }

  if (subscription.mac_binding_enabled && subscription.mac_address) {
    args["caller-id"] = subscription.mac_address;
  }

  const rateLimit = buildRateLimit(subscription.plan);
  if (rateLimit) {
    args["rate-limit"] = rateLimit;
  }

  if (existing) {
    await execute(subscription.mikrotik_connection_id, "/ppp/secret/set", {
      numbers: existing[".id"] || existing.name,
      ...args,
    });
  } else {
    await execute(subscription.mikrotik_connection_id, "/ppp/secret/add", args);
  }

  if (subscription.status !== "active") {
    await disconnectActiveSession(
      subscription.mikrotik_connection_id,
      subscription.pppoe_username,
    );
  }

  return {
    success: true,
    status: "synced",
    action: existing ? "updated" : "created",
    message: existing
      ? "PPPoE secret updated on MikroTik"
      : "PPPoE secret created on MikroTik",
  };
}

async function disconnectActiveSession(connectionId, username) {
  const activeSessions = await print(connectionId, "/ppp/active", ".id,name");
  const activeSession = activeSessions.find(
    (session) => session.name === username,
  );
  if (!activeSession) {
    return false;
  }

  await execute(connectionId, "/ppp/active/remove", {
    numbers: activeSession[".id"] || activeSession.name,
  });
  return true;
}

async function executeSuspendSecretDirectly(subscription) {
  if (!subscription.mikrotik_connection_id || !subscription.pppoe_username) {
    return {
      success: false,
      status: "skipped",
      error:
        "Subscription is missing a linked MikroTik connection or PPPoE username",
    };
  }

  const existing = await findSecret(
    subscription.mikrotik_connection_id,
    subscription.pppoe_username,
  );
  if (!existing) {
    return {
      success: false,
      status: "not_found",
      error: "PPPoE secret was not found on MikroTik",
    };
  }

  await execute(subscription.mikrotik_connection_id, "/ppp/secret/set", {
    numbers: existing[".id"] || existing.name,
    disabled: "yes",
  });
  await disconnectActiveSession(
    subscription.mikrotik_connection_id,
    subscription.pppoe_username,
  );

  return {
    success: true,
    status: "synced",
    action: "suspended",
    message: "PPPoE secret suspended on MikroTik",
  };
}

async function executeDeleteSecretDirectly(subscription) {
  if (!subscription.mikrotik_connection_id || !subscription.pppoe_username) {
    return {
      success: false,
      status: "skipped",
      error:
        "Subscription is missing a linked MikroTik connection or PPPoE username",
    };
  }

  const existing = await findSecret(
    subscription.mikrotik_connection_id,
    subscription.pppoe_username,
  );
  if (!existing) {
    return {
      success: true,
      status: "synced",
      action: "not_found",
      message: "PPPoE secret already absent on MikroTik",
    };
  }

  await disconnectActiveSession(
    subscription.mikrotik_connection_id,
    subscription.pppoe_username,
  );
  await execute(subscription.mikrotik_connection_id, "/ppp/secret/remove", {
    numbers: existing[".id"] || existing.name,
  });

  return {
    success: true,
    status: "synced",
    action: "deleted",
    message: "PPPoE secret removed from MikroTik",
  };
}

async function upsertSubscriptionSecret(subscription) {
  try {
    return await executeUpsertSecretDirectly(subscription);
  } catch (error) {
    if (subscription.mikrotik_connection_id) {
      await provisioningQueue.queueTask(subscription.mikrotik_connection_id, "upsert_secret", subscription, "pending", error.message);
      return { success: true, status: "queued", action: "queued_upsert", message: "Router offline. Task queued for retry." };
    }
    throw error;
  }
}

async function suspendSubscriptionSecret(subscription) {
  try {
    return await executeSuspendSecretDirectly(subscription);
  } catch (error) {
    if (subscription.mikrotik_connection_id) {
      await provisioningQueue.queueTask(subscription.mikrotik_connection_id, "suspend_secret", subscription, "pending", error.message);
      return { success: true, status: "queued", action: "queued_suspend", message: "Router offline. Task queued for retry." };
    }
    throw error;
  }
}

async function deleteSubscriptionSecret(subscription) {
  try {
    return await executeDeleteSecretDirectly(subscription);
  } catch (error) {
    if (subscription.mikrotik_connection_id) {
      await provisioningQueue.queueTask(subscription.mikrotik_connection_id, "delete_secret", subscription, "pending", error.message);
      return { success: true, status: "queued", action: "queued_delete", message: "Router offline. Task queued for retry." };
    }
    throw error;
  }
}

async function reconcileSubscription(subscription) {
  if (subscription.status === "active") {
    return upsertSubscriptionSecret(subscription);
  }

  return suspendSubscriptionSecret(subscription);
}

module.exports = {
  getConnectionById,
  print,
  execute,
  findSecret,
  buildRateLimit,
  upsertSubscriptionSecret,
  suspendSubscriptionSecret,
  deleteSubscriptionSecret,
  reconcileSubscription,
  executeUpsertSecretDirectly,
  executeSuspendSecretDirectly,
  executeDeleteSecretDirectly,
};
