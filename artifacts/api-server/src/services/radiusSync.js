const logger = require("../utils/logger");

function getDb() {
  return global.dbAvailable ? global.db : require("../db/memory");
}

async function ensureRadiusTables() {
  const db = getDb();
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS radcheck (
        id SERIAL PRIMARY KEY,
        username VARCHAR(64) NOT NULL,
        attribute VARCHAR(64) NOT NULL,
        op CHAR(2) NOT NULL DEFAULT '==',
        value VARCHAR(253) NOT NULL,
        customer_id UUID,
        subscription_id UUID,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS radreply (
        id SERIAL PRIMARY KEY,
        username VARCHAR(64) NOT NULL,
        attribute VARCHAR(64) NOT NULL,
        op CHAR(2) NOT NULL DEFAULT '=',
        value VARCHAR(253) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS radusergroup (
        id SERIAL PRIMARY KEY,
        username VARCHAR(64) NOT NULL,
        groupname VARCHAR(64) NOT NULL,
        priority INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS radgroupcheck (
        id SERIAL PRIMARY KEY,
        groupname VARCHAR(64) NOT NULL,
        attribute VARCHAR(64) NOT NULL,
        op CHAR(2) NOT NULL DEFAULT '==',
        value VARCHAR(253) NOT NULL
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS radgroupreply (
        id SERIAL PRIMARY KEY,
        groupname VARCHAR(64) NOT NULL,
        attribute VARCHAR(64) NOT NULL,
        op CHAR(2) NOT NULL DEFAULT '=',
        value VARCHAR(253) NOT NULL
      )
    `);
  } catch (e) {
    logger.warn("RADIUS tables may already exist or could not be created", { error: e.message });
  }
}

async function ensureRadiusNas(router, secret = process.env.RADIUS_SECRET) {
  if (!router || !router.ip_address || !secret) {
    return { success: false, status: "skipped", error: "Router address or RADIUS secret missing" };
  }

  const db = getDb();
  await db.query(`
    CREATE TABLE IF NOT EXISTS nas (
      id SERIAL PRIMARY KEY,
      nasname VARCHAR(128) NOT NULL,
      shortname VARCHAR(32),
      type VARCHAR(30) DEFAULT 'other',
      ports INTEGER,
      secret VARCHAR(60) NOT NULL,
      server VARCHAR(64),
      community VARCHAR(50),
      description VARCHAR(200) DEFAULT 'RADIUS Client',
      connection_id UUID,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const existing = await db.query(
    "SELECT id FROM nas WHERE nasname = $1 OR connection_id = $2 LIMIT 1",
    [router.ip_address, router.connection_id || null],
  );

  if (existing.rows.length > 0) {
    await db.query(
      `UPDATE nas SET nasname = $1, shortname = $2, secret = $3, type = 'mikrotik',
       description = $4, connection_id = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6`,
      [router.ip_address, router.name || router.ip_address, secret,
        `MikroTik ${router.name || router.ip_address}`, router.connection_id || null, existing.rows[0].id],
    );
    return { success: true, status: "updated", id: existing.rows[0].id };
  }

  const result = await db.query(
    `INSERT INTO nas (nasname, shortname, type, secret, description, connection_id)
     VALUES ($1, $2, 'mikrotik', $3, $4, $5) RETURNING id`,
    [router.ip_address, router.name || router.ip_address, secret,
      `MikroTik ${router.name || router.ip_address}`, router.connection_id || null],
  );
  return { success: true, status: "created", id: result.rows[0].id };
}
async function ensurePlanRadiusGroup(plan) {
  if (!plan || !plan.name) {return;}
  const db = getDb();
  const groupName = plan.name.replace(/\s+/g, "_");

  const existing = await db.query(
    "SELECT id FROM radgroupcheck WHERE groupname = $1 LIMIT 1",
    [groupName]
  );
  if (existing.rows.length > 0) {return;}

  if (plan.speed_up && plan.speed_down) {
    await db.query(
      `INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES ($1, 'Mikrotik-Rate-Limit', '=', $2)`,
      [groupName, `${plan.speed_down}/${plan.speed_up}`]
    );
  }

  if (plan.priority) {
    await db.query(
      `INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES ($1, 'Mikrotik-Priority', '=', $2)`,
      [groupName, String(plan.priority)]
    );
  }
}

async function upsertRadiusUser(subscription) {
  await ensureRadiusTables();

  if (!subscription || !subscription.pppoe_username) {
    return { success: false, status: "skipped", error: "No PPPoE username" };
  }

  const db = getDb();
  const username = subscription.pppoe_username;
  const password = subscription.pppoe_password || username;
  const customerId = subscription.customer_id || subscription.customer?.id;
  const plan = subscription.plan;
  const isActive = subscription.status === "active";

  if (isActive) {
    const existing = await db.query(
      "SELECT id FROM radcheck WHERE username = $1 AND attribute = 'Cleartext-Password'",
      [username]
    );

    if (existing.rows.length > 0) {
      await db.query(
        "UPDATE radcheck SET value = $1, subscription_id = $2, customer_id = $3 WHERE username = $4 AND attribute = 'Cleartext-Password'",
        [password, subscription.id, customerId, username]
      );
    } else {
      await db.query(
        `INSERT INTO radcheck (username, attribute, op, value, customer_id, subscription_id) VALUES ($1, 'Cleartext-Password', ':=', $2, $3, $4)`,
        [username, password, customerId, subscription.id]
      );
    }

    if (plan && plan.speed_up && plan.speed_down) {
      const rateLimit = `${plan.speed_down}/${plan.speed_up}`;
      const existingReply = await db.query(
        "SELECT id FROM radreply WHERE username = $1 AND attribute = 'Mikrotik-Rate-Limit'",
        [username]
      );
      if (existingReply.rows.length > 0) {
        await db.query(
          "UPDATE radreply SET value = $1 WHERE username = $2 AND attribute = 'Mikrotik-Rate-Limit'",
          [rateLimit, username]
        );
      } else {
        await db.query(
          `INSERT INTO radreply (username, attribute, op, value) VALUES ($1, 'Mikrotik-Rate-Limit', '=', $2)`,
          [username, rateLimit]
        );
      }
    }

    if (plan && plan.name) {
      await ensurePlanRadiusGroup(plan);
      const groupName = plan.name.replace(/\s+/g, "_");
      const existingGroup = await db.query(
        "SELECT id FROM radusergroup WHERE username = $1 AND groupname = $2",
        [username, groupName]
      );
      if (existingGroup.rows.length === 0) {
        await db.query(
          `INSERT INTO radusergroup (username, groupname, priority) VALUES ($1, $2, 1)`,
          [username, groupName]
        );
      }
    }

    if (subscription.pppoe_profile) {
      const existingProfile = await db.query(
        "SELECT id FROM radreply WHERE username = $1 AND attribute = 'Mikrotik-Group'",
        [username]
      );
      if (existingProfile.rows.length > 0) {
        await db.query(
          "UPDATE radreply SET value = $1 WHERE username = $2 AND attribute = 'Mikrotik-Group'",
          [subscription.pppoe_profile, username]
        );
      } else {
        await db.query(
          `INSERT INTO radreply (username, attribute, op, value) VALUES ($1, 'Mikrotik-Group', '=', $2)`,
          [username, subscription.pppoe_profile]
        );
      }
    }

    await db.query(
      "DELETE FROM radcheck WHERE username = $1 AND attribute = 'Auth-Type' AND value = 'Reject'",
      [username]
    );

    logger.info(`RADIUS user synced: ${username} (active)`, { subscriptionId: subscription.id });
    return { success: true, status: "synced", action: "upserted" };
  } else {
    const disabled = await db.query(
      "SELECT id FROM radcheck WHERE username = $1 AND attribute = 'Auth-Type' AND value = 'Reject'",
      [username]
    );
    if (disabled.rows.length === 0) {
      await db.query(
        `INSERT INTO radcheck (username, attribute, op, value, customer_id, subscription_id) VALUES ($1, 'Auth-Type', ':=', 'Reject', $2, $3)`,
        [username, customerId, subscription.id]
      );
    }

    logger.info(`RADIUS user disabled: ${username}`, { subscriptionId: subscription.id });
    return { success: true, status: "synced", action: "disabled" };
  }
}

async function deleteRadiusUser(subscription) {
  if (!subscription || !subscription.pppoe_username) {
    return { success: false, status: "skipped", error: "No PPPoE username" };
  }

  await ensureRadiusTables();
  const db = getDb();
  const username = subscription.pppoe_username;

  await db.query("DELETE FROM radcheck WHERE username = $1", [username]);
  await db.query("DELETE FROM radreply WHERE username = $1", [username]);
  await db.query("DELETE FROM radusergroup WHERE username = $1", [username]);

  logger.info(`RADIUS user deleted: ${username}`, { subscriptionId: subscription.id });
  return { success: true, status: "synced", action: "deleted" };
}

async function reconcileRadiusUser(subscription) {
  if (!subscription || !subscription.pppoe_username) {
    return { success: false, status: "skipped", error: "No PPPoE username" };
  }

  if (subscription.status === "active") {
    return upsertRadiusUser(subscription);
  }

  const db = getDb();
  const disabled = await db.query(
    "SELECT id FROM radcheck WHERE username = $1 AND attribute = 'Auth-Type' AND value = 'Reject'",
    [subscription.pppoe_username]
  );
  if (disabled.rows.length === 0) {
    return upsertRadiusUser(subscription);
  }

  return { success: true, status: "synced", action: "already_disabled" };
}

async function updateThrottle(username, rateLimit) {
  await ensureRadiusTables();
  const db = getDb();
  const existing = await db.query(
    "SELECT id FROM radreply WHERE username = $1 AND attribute = 'Mikrotik-Rate-Limit'",
    [username]
  );
  if (existing.rows.length > 0) {
    await db.query(
      "UPDATE radreply SET value = $1 WHERE username = $2 AND attribute = 'Mikrotik-Rate-Limit'",
      [rateLimit, username]
    );
  } else {
    await db.query(
      "INSERT INTO radreply (username, attribute, op, value) VALUES ($1, 'Mikrotik-Rate-Limit', '=', $2)",
      [username, rateLimit]
    );
  }
  logger.info(`[FUP] Throttle updated: ${username} → ${rateLimit}`);
  return { success: true };
}

async function isRadiusEnabled() {
  try {
    const db = getDb();
    const result = await db.query(
      "SELECT value FROM settings WHERE key = $1",
      ["radius_provisioning_enabled"]
    );
    return result.rows[0]?.value === "true";
  } catch {
    return false;
  }
}

module.exports = {
  ensureRadiusTables,
  ensureRadiusNas,
  ensurePlanRadiusGroup,
  upsertRadiusUser,
  suspendRadiusUser: upsertRadiusUser,
  deleteRadiusUser,
  reconcileRadiusUser,
  updateThrottle,
  isRadiusEnabled,
};
