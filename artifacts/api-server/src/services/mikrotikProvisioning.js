const routerConnectionManager = require("./routerConnectionManager");
const provisioningQueue = require("./provisioningQueue");
const rateLimitUtil = require("./rateLimit");
const logger = require("../utils/logger");

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

const { buildRateLimit } = require("./rateLimit");

function buildRateLimitProfileName(rateLimit) {
  return `billing_${String(rateLimit).replace(/[^A-Za-z0-9]/g, "_")}`;
}

async function ensureRateLimitProfile(connectionId, rateLimit, baseProfileName) {
  const name = buildRateLimitProfileName(rateLimit);
  const profiles = await print(
    connectionId,
    "/ppp/profile",
    ".id,name,rate-limit,local-address,remote-address,dns-server,only-one,change-tcp-mss,use-encryption,use-compression,session-timeout,idle-timeout,parent-queue,queue-type,insert-queue-before",
  );
  const existing = profiles.find((profile) => profile.name === name);
  const args = { name, "rate-limit": rateLimit };
  const inherited = [
    "local-address",
    "remote-address",
    "dns-server",
    "only-one",
    "change-tcp-mss",
    "use-encryption",
    "use-compression",
    "session-timeout",
    "idle-timeout",
    "parent-queue",
    "queue-type",
    "insert-queue-before",
  ];

  if (baseProfileName && baseProfileName !== name) {
    const base = profiles.find((profile) => profile.name === baseProfileName);
    if (base) {
      for (const key of inherited) {
        const value = base[key];
        if (value !== undefined && value !== "" && value !== "default") {
          args[key] = value;
        }
      }
    }
  }

  if (existing) {
    await execute(connectionId, "/ppp/profile/set", {
      numbers: existing[".id"] || existing.name,
      ...args,
    });
  } else {
    await execute(connectionId, "/ppp/profile/add", args);
  }

  return name;
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

/**
 * Apply a rate limit to an already-connected PPPoE session.
 * PPPoE profiles only take effect on the next login, so the dynamic simple
 * queue must be updated in place for plan changes to apply immediately.
 */
async function applyRateLimitToActiveSession(connectionId, username, rateLimitString) {
  const params = rateLimitUtil.toQueueParams(rateLimitString);
  if (!params) {return null;}
  const active = await print(connectionId, "/ppp/active", ".id,name");
  if (!active.some((session) => session.name === username)) {return null;}
  const queues = await print(
    connectionId,
    "/queue/simple",
    ".id,name,target,max-limit",
  );
  const queue = queues.find((item) =>
    String(item.name || "") === `<pppoe-${username}>` ||
    String(item.target || "") === `<pppoe-${username}>` ||
    String(item.name || "").includes(username),
  );
  if (!queue) {return null;}
  if (String(queue['max-limit'] || '') === params['max-limit']) {
    return { username, queue: queue.name, rate_limit: rateLimitString, unchanged: true };
  }
  try {
    await execute(connectionId, "/queue/simple/set", {
      numbers: queue[".id"] || queue.name,
      ...params,
    });
    return {
      username,
      queue: queue.name,
      rate_limit: rateLimitString,
      applied: params,
    };
  } catch (error) {
    if (!/dynamic/i.test(error.message)) {throw error;}
    // RouterOS forbids editing dynamic PPPoE queues. Disconnect the session so
    // it reconnects using the updated PPP profile and picks up the new rate.
    await disconnectActiveSession(connectionId, username);
    return {
      username,
      rate_limit: rateLimitString,
      kicked: true,
      message: 'Session disconnected to apply the new speed on reconnect',
    };
  }
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

  const rateLimitString = buildRateLimit(subscription.plan);
  if (rateLimitString) {
    args.profile = await ensureRateLimitProfile(
      subscription.mikrotik_connection_id,
      rateLimitString,
      subscription.pppoe_profile,
    );
  } else if (subscription.pppoe_profile) {
    args.profile = subscription.pppoe_profile;
  }

  if (subscription.mac_binding_enabled && subscription.mac_address) {
    args["caller-id"] = subscription.mac_address;
  }

  if (existing) {
    await execute(subscription.mikrotik_connection_id, "/ppp/secret/set", {
      numbers: existing[".id"] || existing.name,
      ...args,
    });
  } else {
    await execute(subscription.mikrotik_connection_id, "/ppp/secret/add", args);
  }

  let liveRate = null;
  if (subscription.status === "active" && rateLimitString) {
    try {
      liveRate = await applyRateLimitToActiveSession(
        subscription.mikrotik_connection_id,
        subscription.pppoe_username,
        rateLimitString,
      );
    } catch (error) {
      logger.warn("[Provisioning] live rate update failed", {
        username: subscription.pppoe_username, error: error.message,
      });
    }
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
    live_rate: liveRate,
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
  buildRateLimitProfileName,
  ensureRateLimitProfile,
  upsertSubscriptionSecret,
  suspendSubscriptionSecret,
  deleteSubscriptionSecret,
  reconcileSubscription,
  executeUpsertSecretDirectly,
  applyRateLimitToActiveSession,
  executeSuspendSecretDirectly,
  executeDeleteSecretDirectly,
};
