/**
 * Single authoritative presence source: live sessions read from RouterOS.
 *
 * RADIUS accounting (radacct) can lag or be unavailable, so customer/PPPoE/
 * operations views all use this service instead of derived or cached state.
 */

const routerConnectionManager = require("./routerConnectionManager");
const billingData = require("./billingData");

function db() {
  return global.db || require("../db/memory");
}

function parseUptime(value) {
  const text = String(value || "").trim();
  let seconds = 0;
  const day = text.match(/(\d+)d/);
  const hour = text.match(/(\d+)[h:]/);
  const minute = text.match(/(\d+)[m:]/);
  const second = text.match(/(\d+)s/);
  if (day) {seconds += Number(day[1]) * 86400;}
  if (hour) {seconds += Number(hour[1]) * 3600;}
  if (minute) {seconds += Number(minute[1]) * 60;}
  if (second) {seconds += Number(second[1]);}
  return seconds;
}

async function getOnlineStatus(connectionId = null) {
  let connections = [];
  if (connectionId) {
    const result = await db().query(
      "SELECT * FROM mikrotik_connections WHERE id = $1", [connectionId],
    );
    connections = result.rows;
  } else {
    const result = await db().query(
      "SELECT * FROM mikrotik_connections ORDER BY name ASC",
    );
    connections = result.rows;
  }

  const subscriptions = await billingData.listSubscriptions();
  const customers = await billingData.listCustomers();
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const subByPppoe = new Map(
    subscriptions.filter((sub) => sub.pppoe_username).map((sub) => [sub.pppoe_username, sub]),
  );
  const subByHotspot = new Map(
    subscriptions.filter((sub) => sub.hotspot_username).map((sub) => [sub.hotspot_username, sub]),
  );

  const online = {};
  const pppoe = [];
  const hotspot = [];
  const errors = [];

  for (const connection of connections) {
    let activePppoe = [];
    let activeHotspot = [];
    try {
      activePppoe = await routerConnectionManager.print(connection.id, "/ppp/active");
    } catch (error) {
      errors.push({ connection_id: connection.id, error: error.message });
    }
    try {
      activeHotspot = await routerConnectionManager.print(connection.id, "/ip/hotspot/active");
    } catch {
      // A router without hotspot configured is not an error worth surfacing.
    }

    for (const session of activePppoe) {
      const username = session.name || session.user;
      if (!username) {continue;}
      const sub = subByPppoe.get(username);
      const customer = sub ? customerById.get(sub.customer_id) : null;
      const entry = {
        type: "pppoe",
        username,
        customer_id: sub?.customer_id || null,
        customer_name: customer?.name || "Unknown",
        subscription_id: sub?.id || null,
        router_id: connection.id,
        router_name: connection.name,
        address: session.address || "",
        uptime: session.uptime || "",
        uptime_seconds: parseUptime(session.uptime),
        connected_at: new Date(Date.now() - parseUptime(session.uptime) * 1000).toISOString(),
      };
      pppoe.push(entry);
      if (entry.customer_id) {online[entry.customer_id] = entry;}
    }

    for (const session of activeHotspot) {
      const username = session.user;
      if (!username) {continue;}
      const sub = subByHotspot.get(username);
      const customer = sub ? customerById.get(sub.customer_id) : null;
      const entry = {
        type: "hotspot",
        username,
        customer_id: sub?.customer_id || null,
        customer_name: customer?.name || "Unknown",
        subscription_id: sub?.id || null,
        router_id: connection.id,
        router_name: connection.name,
        address: session.address || "",
        uptime: session.uptime || "",
        uptime_seconds: parseUptime(session.uptime),
        connected_at: new Date(Date.now() - parseUptime(session.uptime) * 1000).toISOString(),
      };
      hotspot.push(entry);
      if (entry.customer_id && !online[entry.customer_id]) {online[entry.customer_id] = entry;}
    }
  }

  return {
    online,
    pppoe,
    hotspot,
    total: pppoe.length + hotspot.length,
    pppoe_count: pppoe.length,
    hotspot_count: hotspot.length,
    errors,
  };
}

const STALE_SECONDS = 15 * 60;

/** RADIUS accounting joined by username (FreeRADIUS never writes customer_id). */
async function getRadiusPresence(customerId = null) {
  if (!global.dbAvailable || !global.db) {
    return { rows: [], source: "radius", staleAfterSeconds: STALE_SECONDS, error: "database_unavailable" };
  }
  const params = [STALE_SECONDS];
  let where = "";
  if (customerId) {
    params.push(customerId);
    where = "AND c.id = $2";
  }
  const result = await global.db.query(
    `SELECT c.id AS customer_id,
            COALESCE(EXISTS (
              SELECT 1 FROM radacct r
              WHERE r.username = s.pppoe_username
                AND r.acctstoptime IS NULL
                AND GREATEST(COALESCE(r.acctupdatetime, r.acctstarttime), r.acctstarttime)
                    > NOW() - ($1 * INTERVAL '1 second')
            ), false) AS is_online,
            (
              SELECT r2.acctstarttime FROM radacct r2
              WHERE r2.username = s.pppoe_username AND r2.acctstoptime IS NULL
              ORDER BY r2.acctstarttime DESC LIMIT 1
            ) AS session_started_at,
            (
              SELECT r3.framedipaddress FROM radacct r3
              WHERE r3.username = s.pppoe_username AND r3.acctstoptime IS NULL
              ORDER BY r3.acctstarttime DESC LIMIT 1
            ) AS ip_address,
            (
              SELECT r4.acctstoptime FROM radacct r4
              WHERE r4.username = s.pppoe_username AND r4.acctstoptime IS NOT NULL
              ORDER BY r4.acctstoptime DESC LIMIT 1
            ) AS last_offline_at
     FROM customers c
     JOIN subscriptions s ON s.customer_id = c.id AND s.status = 'active'
     WHERE 1 = 1 ${where}`,
    params,
  );
  return { rows: result.rows, source: "radius", staleAfterSeconds: STALE_SECONDS };
}

/**
 * Presence map for the customers UI. Live RouterOS sessions are authoritative;
 * RADIUS accounting is merged for sessions the router API cannot show.
 */
async function getPresence(customerId = null, connectionId = null) {
  const radius = await getRadiusPresence(customerId);
  const presence = {};
  for (const row of radius.rows) {
    presence[row.customer_id] = {
      is_online: Boolean(row.is_online),
      session_started_at: row.session_started_at || null,
      last_offline_at: row.last_offline_at || null,
      ip_address: row.ip_address || null,
    };
  }

  let routerSessions = { online: {}, pppoe: [], hotspot: [], errors: [] };
  try {
    routerSessions = await getOnlineStatus(connectionId);
  } catch (error) {
    routerSessions.errors = [{ error: error.message }];
  }
  for (const [customerIdKey, session] of Object.entries(routerSessions.online)) {
    presence[customerIdKey] = {
      is_online: true,
      session_started_at: session.connected_at,
      last_offline_at: null,
      ip_address: session.address,
      router_name: session.router_name,
      username: session.username,
    };
  }

  return {
    presence,
    source: routerSessions.errors.length ? "radius" : "router+radius",
    staleAfterSeconds: STALE_SECONDS,
    online_count: Object.values(presence).filter((item) => item.is_online).length,
    router_sessions: routerSessions.total,
    errors: routerSessions.errors,
  };
}

module.exports = {
  getOnlineStatus,
  getPresence,
  getRadiusPresence,
  parseUptime,
  STALE_SECONDS,
};
