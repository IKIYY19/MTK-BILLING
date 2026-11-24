/**
 * Keep RADIUS accounting rows aligned with live RouterOS PPPoE sessions.
 *
 * FreeRADIUS normally writes radacct. When that service is unavailable (or a
 * container is stuck), this reconciler uses the router as the source of truth
 * so NAS session counts and accounting views still show real data.
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const onlineStatus = require('../services/onlineStatus');

const INTERVAL_MS = 5 * 60 * 1000;
const STALE_MINUTES = 15;

function db() {
  return global.dbAvailable && global.db ? global.db : null;
}

function sessionId(routerId, username) {
  // radacct.acctuniqueid is VARCHAR(32); keep ids deterministic and short.
  return crypto.createHash('md5')
    .update(`${routerId}:${username}`)
    .digest('hex');
}

async function reconcileRadiusAccounting() {
  const database = db();
  if (!database) {return { skipped: 'database_unavailable' };}

  const status = await onlineStatus.getOnlineStatus();
  const connections = await database.query(
    'SELECT id, ip_address, name FROM mikrotik_connections',
  );
  const routerById = new Map(connections.rows.map((row) => [row.id, row]));
  const seen = new Set();
  let created = 0;
  let updated = 0;

  for (const session of status.pppoe) {
    const id = sessionId(session.router_id, session.username);
    seen.add(id);
    const nas = routerById.get(session.router_id);
    const existing = await database.query(
      'SELECT acctsessionid FROM radacct WHERE acctsessionid = $1 LIMIT 1', [id],
    );
    if (existing.rows.length) {
      await database.query(
        `UPDATE radacct SET acctupdatetime = NOW(), framedipaddress = $2,
         acctsessiontime = $3, acctstoptime = NULL, acctterminatecause = ''
         WHERE acctsessionid = $1`,
        [id, session.address || '', session.uptime_seconds || 0],
      );
      updated += 1;
      continue;
    }
    await database.query(
      `INSERT INTO radacct (
         acctsessionid, acctuniqueid, username, realm, nasipaddress, nasportid,
         nasporttype, acctstarttime, acctupdatetime, acctstoptime, acctsessiontime,
         acctauthentic, connectinfo_start, acctinputoctets, acctoutputoctets,
         calledstationid, callingstationid, acctterminatecause, servicetype,
         framedprotocol, framedipaddress
       ) VALUES ($1,$2,$3,'',$4,'','Ethernet',$5,NOW(),NULL,$6,'','',0,0,'','','Live-Router','','',$7)`,
      [
        id,
        id,
        session.username,
        nas?.ip_address || '',
        new Date(Date.now() - (session.uptime_seconds || 0) * 1000).toISOString(),
        session.uptime_seconds || 0,
        session.address || '',
      ],
    );
    created += 1;
  }

  if (seen.size) {
    await database.query(
      `UPDATE radacct SET acctstoptime = NOW(), acctterminatecause = 'Router-Reconcile'
       WHERE acctsessionid LIKE 'live-%' AND acctstoptime IS NULL
         AND NOT (acctsessionid = ANY($1::text[]))`,
      [Array.from(seen)],
    );
  } else {
    await database.query(
      `UPDATE radacct SET acctstoptime = NOW(), acctterminatecause = 'Router-Reconcile'
       WHERE acctsessionid LIKE 'live-%' AND acctstoptime IS NULL`,
    );
  }

  await database.query(
    `UPDATE radacct SET acctstoptime = NOW(), acctterminatecause = 'Stale-Router-Session'
     WHERE acctsessionid LIKE 'live-%' AND acctstoptime IS NULL
       AND acctupdatetime < NOW() - ($1 * INTERVAL '1 minute')`,
    [STALE_MINUTES],
  );

  return { created, updated, sessions: status.pppoe.length, errors: status.errors };
}

function startCron() {
  const timer = setInterval(() => {
    reconcileRadiusAccounting().catch((error) => {
      logger.error('[RADIUS reconcile] failed', { error: error.message });
    });
  }, INTERVAL_MS);
  timer.unref();
  setTimeout(() => {
    reconcileRadiusAccounting().catch((error) => {
      logger.error('[RADIUS reconcile] initial run failed', { error: error.message });
    });
  }, 30 * 1000).unref();
  return timer;
}

module.exports = { reconcileRadiusAccounting, startCron };
