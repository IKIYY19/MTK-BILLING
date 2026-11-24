/**
 * IPAM sync: import real RouterOS PPPoE pools and track live client IPs.
 *
 * RouterOS assigns PPPoE addresses from /ip/pool; this service mirrors those
 * ranges into ipam_subnets and marks the addresses actually in use by live
 * /ppp/active sessions in ipam_ips.
 */

const routerConnectionManager = require('./routerConnectionManager');
const onlineStatus = require('./onlineStatus');
const logger = require('../utils/logger');

const RELEASE_AFTER_MINUTES = 10;

function database() {
  return global.dbAvailable && global.db ? global.db : null;
}

function ipToInt(ip) {
  const parts = String(ip || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {return null;}
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function intToIp(value) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

function cidrForRange(start, end) {
  const first = ipToInt(start);
  const last = ipToInt(end);
  if (first === null || last === null || first > last) {return null;}
  let prefix = 32;
  while (prefix > 0) {
    const size = 2 ** (32 - prefix);
    const base = Math.floor(first / size) * size;
    if (base <= first && base + size - 1 >= last) {
      return { network: intToIp(base), mask: prefix };
    }
    prefix -= 1;
  }
  return { network: intToIp(first), mask: 32 };
}

function contains(subnet, address) {
  const network = ipToInt(subnet.network);
  const ip = ipToInt(address);
  if (network === null || ip === null) {return false;}
  const size = 2 ** (32 - Number(subnet.mask));
  return ip >= network && ip < network + size;
}

function sessionKey(session) {
  return `${session.router_id}:${session.username}`;
}

async function importPools() {
  const db = database();
  if (!db) {return { imported: 0, error: 'database_unavailable' };}
  const connections = await db.query('SELECT * FROM mikrotik_connections ORDER BY name');
  let imported = 0;

  for (const connection of connections.rows) {
    try {
      const pools = await routerConnectionManager.print(connection.id, '/ip/pool', '.id,name,ranges');
      const profiles = await routerConnectionManager.print(
        connection.id,
        '/ppp/profile',
        '.id,name,local-address,remote-address',
      );
      const usedPoolNames = new Set(
        profiles
          .map((profile) => profile['remote-address'])
          .filter((name) => name && name !== 'none'),
      );
      for (const pool of pools) {
        if (!usedPoolNames.has(pool.name)) {continue;}
        const [start, end] = String(pool.ranges || '').split('-').map((part) => part.trim());
        const cidr = end ? cidrForRange(start, end) : null;
        if (!cidr) {continue;}
        const profile = profiles.find((item) => item['remote-address'] === pool.name);
        const gateway = profile?.['local-address'] || intToIp(ipToInt(cidr.network) + 1);
        await db.query(
          `INSERT INTO ipam_subnets (id, name, network, mask, gateway, description, router_id, pool_name, tenant_id, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (network, mask) DO UPDATE SET
             name = EXCLUDED.name, gateway = EXCLUDED.gateway,
             router_id = EXCLUDED.router_id, pool_name = EXCLUDED.pool_name,
             tenant_id = EXCLUDED.tenant_id, updated_at = CURRENT_TIMESTAMP`,
          [
            pool.name, cidr.network, cidr.mask, gateway,
            `RouterOS PPPoE pool on ${connection.name}`, connection.id, pool.name,
            connection.tenant_id || null,
          ],
        );
        imported += 1;
      }
    } catch (error) {
      logger.warn('[IPAM] pool import failed for router', {
        router: connection.name, error: error.message,
      });
    }
  }
  return { imported };
}

async function syncLiveSessions() {
  const db = database();
  if (!db) {return { synced: 0, error: 'database_unavailable' };}
  const status = await onlineStatus.getOnlineStatus();
  const subnetsResult = await db.query('SELECT * FROM ipam_subnets');
  const subnets = subnetsResult.rows;

  let assigned = 0;
  let unmanaged = 0;
  const activeKeys = [];

  for (const session of status.pppoe) {
    const address = session.address;
    if (!address) {continue;}
    const key = sessionKey(session);
    activeKeys.push(key);
    const subnet = subnets.find((item) => contains(item, address));
    if (!subnet) {
      unmanaged += 1;
      continue;
    }
    const row = await db.query(
      'SELECT id FROM ipam_ips WHERE subnet_id = $1 AND ip_address = $2 LIMIT 1',
      [subnet.id, address],
    );
    const assignedTo = session.customer_name && session.customer_name !== 'Unknown'
      ? session.customer_name
      : session.username;
    const values = [
      subnet.id,
      address,
      assignedTo,
      session.customer_id || null,
      session.subscription_id || null,
      session.username,
      session.router_id,
      key,
      `PPPoE: ${session.username} on ${session.router_name}`,
      subnet.tenant_id || null,
    ];
    if (row.rows.length) {
      await db.query(
        `UPDATE ipam_ips SET status='used', assigned_to=$2, customer_id=$3,
         subscription_id=$4, username=$5, router_id=$6, session_key=$7,
         description=$8, tenant_id=$9, last_seen_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
         WHERE id=$1`,
        [row.rows[0].id, ...values.slice(2)],
      );
    } else {
      await db.query(
        `INSERT INTO ipam_ips (id, subnet_id, ip_address, status, assigned_to,
         customer_id, subscription_id, username, router_id, session_key, description, tenant_id,
         last_seen_at, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'used', $3, $4, $5, $6, $7, $8, $9, $10,
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        values,
      );
    }
    assigned += 1;
  }

  if (activeKeys.length) {
    await db.query(
      `UPDATE ipam_ips SET status='free', assigned_to=NULL, customer_id=NULL,
       subscription_id=NULL, username=NULL, session_key=NULL,
       description='Released by IPAM sync', updated_at=CURRENT_TIMESTAMP
       WHERE session_key IS NOT NULL
         AND NOT (session_key = ANY($1::text[]))
         AND last_seen_at < NOW() - ($2 * INTERVAL '1 minute')`,
      [activeKeys, RELEASE_AFTER_MINUTES],
    );
  } else {
    await db.query(
      `UPDATE ipam_ips SET status='free', assigned_to=NULL, customer_id=NULL,
       subscription_id=NULL, username=NULL, session_key=NULL,
       description='Released by IPAM sync', updated_at=CURRENT_TIMESTAMP
       WHERE session_key IS NOT NULL AND last_seen_at < NOW() - ($1 * INTERVAL '1 minute')`,
      [RELEASE_AFTER_MINUTES],
    );
  }

  return {
    assigned,
    unmanaged,
    sessions: status.pppoe.length,
    errors: status.errors,
  };
}

async function syncAll() {
  const pools = await importPools();
  const sessions = await syncLiveSessions();
  return { pools, sessions };
}

function startCron() {
  const timer = setInterval(() => {
    syncAll().catch((error) => logger.error('[IPAM] sync failed', { error: error.message }));
  }, 2 * 60 * 1000);
  timer.unref();
  setTimeout(() => {
    syncAll().catch((error) => logger.error('[IPAM] initial sync failed', { error: error.message }));
  }, 45 * 1000).unref();
  return timer;
}

module.exports = {
  syncAll,
  importPools,
  syncLiveSessions,
  startCron,
  cidrForRange,
  ipToInt,
  intToIp,
};
