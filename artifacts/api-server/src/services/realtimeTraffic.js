/**
 * Real-time traffic rates from RouterOS byte counters.
 *
 * RouterOS /ppp/active and /interface expose cumulative counters. We sample
 * them on an interval and compute bits-per-second deltas, giving genuine live
 * RX/TX for each PPPoE session and for each router's uplink.
 */

const routerConnectionManager = require('./routerConnectionManager');
const onlineStatus = require('./onlineStatus');
const logger = require('../utils/logger');

const SAMPLE_INTERVAL_MS = 10 * 1000;
const previous = new Map();
let latest = {
  sessions: [],
  routers: [],
  sampled_at: null,
  interval_seconds: SAMPLE_INTERVAL_MS / 1000,
  warming: true,
  errors: [],
};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function rate(before, after, seconds, field = 'bytesIn') {
  if (!before || seconds <= 0) {return 0;}
  const delta = Math.max(0, after - Number(before[field] || 0));
  return Math.round((delta * 8) / seconds);
}

function db() {
  return global.dbAvailable && global.db ? global.db : null;
}

async function sample() {
  const database = db();
  if (!database) {
    latest = { ...latest, errors: ['database_unavailable'] };
    return latest;
  }
  const connections = await database.query('SELECT * FROM mikrotik_connections ORDER BY name');
  const now = Date.now();
  const errors = [];
  const sessions = [];
  const routers = [];

  for (const connection of connections.rows) {
    try {
      const [active, interfaces, queues] = await Promise.all([
        routerConnectionManager.print(
          connection,
          '/ppp/active',
          '.id,name,address,uptime,caller-id',
        ),
        routerConnectionManager.print(
          connection,
          '/interface',
          'name,type,running,rx-byte,tx-byte',
        ),
        routerConnectionManager.print(
          connection,
          '/queue/simple',
          '.id,name,target,rate,max-limit',
        ).catch(() => []),
      ]);
      const interfaceList = Array.isArray(interfaces) ? interfaces : [];

      for (const entry of (Array.isArray(active) ? active : [])) {
        const username = entry.name || entry.user;
        if (!username) {continue;}
        const key = `${connection.id}:${username}`;
        // RouterOS exposes cumulative counters on the dynamic PPPoE interface
        // (<pppoe-username>) and an instantaneous rate on its simple queue.
        const iface = interfaceList.find((item) =>
          String(item.name || '') === `<pppoe-${username}>` ||
          String(item.type || '') === 'pppoe-in' && String(item.name || '').includes(username),
        );
        const queue = (Array.isArray(queues) ? queues : []).find((item) =>
          String(item.name || '').includes(username) ||
          String(item.target || '').includes(username),
        );
        const bytesIn = toNumber(iface?.['rx-byte']);
        const bytesOut = toNumber(iface?.['tx-byte']);
        const previousSample = previous.get(key);
        previous.set(key, { bytesIn, bytesOut, at: now });
        const seconds = previousSample ? (now - previousSample.at) / 1000 : 0;
        const queueRate = String(queue?.rate || '0/0').split('/').map(toNumber);
        sessions.push({
          key,
          username,
          router_id: connection.id,
          router_name: connection.name,
          address: entry.address || '',
          rx_bps: previousSample && iface ? rate(previousSample, bytesIn, seconds) : queueRate[0] || 0,
          tx_bps: previousSample && iface ? rate(previousSample, bytesOut, seconds, 'bytesOut') : queueRate[1] || 0,
          rate_limit: queue?.['max-limit'] || '',
          current_rate: queue?.rate || '',
          bytes_in: bytesIn,
          bytes_out: bytesOut,
          uptime: entry.uptime || '',
        });
      }

      // Router uplink: prefer the physical interface with the busiest running
      // counter (normally the WAN); pppoe/bridge/loopback are excluded.
      const uplink = interfaceList
        .filter((item) =>
          (item.running === 'true' || item.running === true) &&
          !['pppoe-in', 'bridge', 'loopback', 'tunnel'].includes(String(item.type || '')),
        )
        .sort((a, b) => (toNumber(b['rx-byte']) + toNumber(b['tx-byte'])) - (toNumber(a['rx-byte']) + toNumber(a['tx-byte'])))[0];
      if (uplink) {
        const rx = toNumber(uplink['rx-byte']);
        const tx = toNumber(uplink['tx-byte']);
        const key = `router:${connection.id}`;
        const previousSample = previous.get(key);
        previous.set(key, { bytesIn: rx, bytesOut: tx, at: now });
        const seconds = previousSample ? (now - previousSample.at) / 1000 : 0;
        routers.push({
          id: connection.id,
          name: connection.name,
          interface: uplink.name,
          rx_bps: previousSample ? rate(previousSample, rx, seconds) : 0,
          tx_bps: previousSample ? rate(previousSample, tx, seconds, 'bytesOut') : 0,
        });
      }
    } catch (error) {
      errors.push(`Router ${connection.name}: ${error.message}`);
    }
  }

  const activeKeys = new Set(sessions.map((session) => session.key));
  for (const key of previous.keys()) {
    if (key.startsWith('router:')) {continue;}
    if (!activeKeys.has(key)) {previous.delete(key);}
  }

  // Attach customer identity from the authoritative presence service.
  const presence = await onlineStatus.getOnlineStatus().catch(() => ({ pppoe: [] }));
  const customerByUsername = new Map(presence.pppoe.map((session) => [session.username, session]));
  for (const session of sessions) {
    const owner = customerByUsername.get(session.username);
    if (owner) {
      session.customer_id = owner.customer_id;
      session.customer_name = owner.customer_name === 'Unknown' ? '' : owner.customer_name;
      session.subscription_id = owner.subscription_id;
    }
  }

  latest = {
    sessions,
    routers,
    sampled_at: new Date(now).toISOString(),
    interval_seconds: SAMPLE_INTERVAL_MS / 1000,
    warming: !previous.size,
    errors,
  };
  return latest;
}

function getLatest() {
  return latest;
}

function startCron() {
  const timer = setInterval(() => {
    sample().catch((error) => logger.warn('[Realtime traffic] sample failed', { error: error.message }));
  }, SAMPLE_INTERVAL_MS);
  timer.unref();
  setTimeout(() => {
    sample().catch((error) => logger.warn('[Realtime traffic] initial sample failed', { error: error.message }));
  }, 3000).unref();
  return timer;
}

module.exports = { sample, getLatest, startCron, SAMPLE_INTERVAL_MS };
