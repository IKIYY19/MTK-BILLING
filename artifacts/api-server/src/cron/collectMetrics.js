/**
 * Metrics Collection Cron
 * Runs every 5 minutes to collect PPPoE sessions, bandwidth usage, and online/offline status
 * Stores data in usage_records table for real monitoring dashboards
 */

const db = global.db || require('../db/memory');
const { v4: uuidv4 } = require('uuid');
const outageDetection = require('../services/outageDetection');

// Connect to MikroTik and get both active sessions and simple queues
async function getRouterMetrics(connection) {
  try {
    const routerConnectionManager = require('../services/routerConnectionManager');
    
    // Get active sessions
    const sessions = await routerConnectionManager.print(connection, '/ppp/active');
    
    // Get simple queues
    const queues = await routerConnectionManager.executeCommand(connection, '/queue/simple/print', {
      '.proplist': '.id,name,target,max-limit,bytes,packet,rate'
    });
    
    return {
      success: true,
      sessions: Array.isArray(sessions) ? sessions : [],
      queues: Array.isArray(queues) ? queues : []
    };
  } catch (error) {
    console.warn(`[Metrics] MikroTik connection failed for ${connection.name} (${connection.ip_address}): ${error.message}`);
    return {
      success: false,
      sessions: [],
      queues: [],
      error: error.message
    };
  }
}

// Parse MikroTik bytes string (e.g., "1.5GiB" or "123456") to integer
function parseBytes(bytesStr) {
  if (!bytesStr) {return 0;}
  const str = String(bytesStr);
  // If it's already a number
  if (/^\d+$/.test(str)) {return parseInt(str);}
  // Parse MikroTik format like "1.5GiB", "500MiB", "100KiB"
  const match = str.match(/^([\d.]+)\s*([KMGTP]i?B)?$/i);
  if (!match) {return 0;}
  const value = parseFloat(match[1]);
  const unit = (match[2] || '').toLowerCase().replace('ib', '');
  const multipliers = { '': 1, k: 1024, m: 1048576, g: 1073741824, t: 1099511627776, p: 1125899906842624 };
  return Math.round(value * (multipliers[unit] || 1));
}

// Parse MikroTik uptime string (e.g., "2d3h4m5s") to seconds
function parseUptime(uptimeStr) {
  if (!uptimeStr) {return 0;}
  const str = String(uptimeStr);
  let totalSeconds = 0;
  const daysMatch = str.match(/(\d+)d/);
  const hoursMatch = str.match(/(\d+)h/);
  const minsMatch = str.match(/(\d+)m/);
  const secsMatch = str.match(/(\d+)s/);
  if (daysMatch) {totalSeconds += parseInt(daysMatch[1]) * 86400;}
  if (hoursMatch) {totalSeconds += parseInt(hoursMatch[1]) * 3600;}
  if (minsMatch) {totalSeconds += parseInt(minsMatch[1]) * 60;}
  if (secsMatch) {totalSeconds += parseInt(secsMatch[1]);}
  return totalSeconds;
}

// Find customer by PPPoE username
async function findCustomerByUsername(username) {
  try {
    const result = await db.query(
      `SELECT c.*, s.id as subscription_id, s.plan_id, sp.name as plan_name, sp.speed_up, sp.speed_down
       FROM subscriptions s
       JOIN customers c ON c.id = s.customer_id
       LEFT JOIN service_plans sp ON sp.id = s.plan_id
       WHERE s.pppoe_username = $1 AND s.status = 'active'
       LIMIT 1`,
      [username]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (e) {
    // In-memory fallback
    const billingStore = require('../db/billingStore');
    const sub = billingStore.store.subscriptions.find(s => s.pppoe_username === username && s.status === 'active');
    if (!sub) {return null;}
    const customer = billingStore.store.customers.find(c => c.id === sub.customer_id);
    const plan = billingStore.store.service_plans.find(p => p.id === sub.plan_id);
    return customer ? { ...customer, subscription_id: sub.id, plan_id: sub.plan_id, plan_name: plan?.name } : null;
  }
}

// Bulk record bandwidth usage to database
async function recordUsageBatch(records) {
  if (!records || records.length === 0) {return 0;}
  let totalInserted = 0;
  
  // Chunk records to prevent exceeding PostgreSQL parameter limit (65535)
  const chunkSize = 1000;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    try {
      if (global.dbAvailable && db) {
        const values = [];
        const placeholders = [];
        let index = 1;
        
        for (const rec of chunk) {
          const id = uuidv4();
          placeholders.push(`($${index}, $${index + 1}, $${index + 2}, $${index + 3}, $${index + 4}, $${index + 5})`);
          values.push(id, rec.customerId, rec.sessionId || null, rec.bytesIn, rec.bytesOut, rec.sessionTime);
          index += 6;
        }
        
        const queryText = `
          INSERT INTO usage_records (id, customer_id, session_id, bytes_in, bytes_out, session_time)
          VALUES ${placeholders.join(', ')}
        `;
        
        await db.query(queryText, values);
        totalInserted += chunk.length;
      } else {
        // In-memory fallback
        const billingStore = require('../db/billingStore');
        for (const rec of chunk) {
          await billingStore.recordUsage({
            customer_id: rec.customerId,
            bytes_in: rec.bytesIn,
            bytes_out: rec.bytesOut,
            session_time: rec.sessionTime,
          });
          totalInserted++;
        }
      }
    } catch (e) {
      console.error(`[Metrics] Failed to write chunk of ${chunk.length} usage records:`, e.message);
    }
  }
  return totalInserted;
}

// Store router online status
async function updateRouterStatus(routerId, status, details = {}) {
  try {
    if (global.dbAvailable && db) {
      await db.query(
        `UPDATE mikrotik_connections SET last_seen = $1, status = $2 WHERE id = $3`,
        [new Date().toISOString(), status, routerId]
      );
    }
    // Also store in device metrics table if available
    try {
      if (global.dbAvailable && db) {
        const id = uuidv4();
        await db.query(
          `INSERT INTO device_metrics (id, router_id, status, cpu_usage, memory_usage, active_pppoe, bandwidth_in, bandwidth_out, recorded_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [id, routerId, status, details.cpu || 0, details.memory || 0, details.activePPPoE || 0,
           details.bandwidthIn || 0, details.bandwidthOut || 0, new Date().toISOString()]
        );
      }
    } catch (e) {
      // Table might not exist, just skip
    }
  } catch (e) {
    console.warn(`[Metrics] Failed to update router status for ${routerId}:`, e.message);
  }
}

// Main collection function
async function collectMetrics() {
  const startTime = Date.now();
  console.log('[Metrics] Starting metrics collection...');

  let connections = [];

  // Get all MikroTik connections
  try {
    if (global.dbAvailable && db) {
      const result = await db.query('SELECT * FROM mikrotik_connections');
      connections = result.rows;
    } else {
      // In-memory fallback - try to get from billingStore routers
      const billingStore = require('../db/billingStore');
      if (billingStore.store.routers) {
        connections = billingStore.store.routers;
      }
    }
  } catch (e) {
    console.warn('[Metrics] Could not fetch MikroTik connections:', e.message);
    return { collected: 0, errors: 1 };
  }

  if (connections.length === 0) {
    console.log('[Metrics] No MikroTik connections configured');
    return { collected: 0, routers: 0 };
  }

  let totalSessions = 0;
  let totalRecords = 0;
  let errors = 0;

  // Poll all connections in parallel
  const results = await Promise.allSettled(
    connections.map(async (connection) => {
      // Decrypt password
      const device = { ...connection };
      const routerConnectionManager = require('../services/routerConnectionManager');
      if (device.password_encrypted) {
        device.password = routerConnectionManager.decryptPassword(device.password_encrypted);
      }

      if (!device.password) {
        console.warn(`[Metrics] Skipping ${device.name} - no password available`);
        return { sessionsCount: 0, records: [], success: false, isError: true };
      }

      // Fetch sessions and queues in a single connection
      const data = await getRouterMetrics(device);
      const sessionCount = data.sessions.length;

      // Update router status based on success of connection
      await updateRouterStatus(device.id, data.success ? 'online' : 'offline', {
        activePPPoE: sessionCount,
      });

      if (!data.success) {
        return { sessionsCount: 0, records: [], success: false, isError: true };
      }

      const activeSessionNames = data.sessions
        .map((session) => session.name || session.username)
        .filter(Boolean);
      try {
        const outageResult = await outageDetection.detectCustomerOutage(device, activeSessionNames);
        if (outageResult?.status === 'created') {
          console.warn(`[Outage] Created alert for ${device.name}: ${outageResult.outage.offlineCount}/${outageResult.outage.totalCustomers} customers offline`);
        } else if (outageResult?.status === 'resolved') {
          console.log(`[Outage] Resolved alert for ${device.name}`);
        }
      } catch (error) {
        console.warn(`[Outage] Detection failed for ${device.name}: ${error.message}`);
      }

      const recordsToInsert = [];

      // Process each PPPoE session
      for (const session of data.sessions) {
        const username = session.name || session.username;
        if (!username) {
          continue;
        }

        // Find matching customer
        const customer = await findCustomerByUsername(username);
        if (!customer) {
          continue;
        }

        const bytesIn = parseBytes(session['bytes-in'] || session.bytes_in);
        const bytesOut = parseBytes(session['bytes-out'] || session.bytes_out);
        const sessionTime = parseUptime(session.uptime || session['uptime']);
        const sessionId = session['.id'] || session.id;

        recordsToInsert.push({
          customerId: customer.id,
          bytesIn,
          bytesOut,
          sessionTime,
          sessionId
        });
      }

      // Also record queue-based usage for customers with active queues
      for (const queue of data.queues) {
        const queueName = queue.name || '';
        // Queue names often match PPPoE usernames
        const customer = await findCustomerByUsername(queueName);
        if (!customer) {
          continue;
        }

        // Parse queue bytes (format: "in-bytes/out-bytes" or total)
        const queueBytes = queue.bytes || '';
        const byteParts = queueBytes.split('/');
        const bytesIn = byteParts[0] ? parseBytes(byteParts[0]) : 0;
        const bytesOut = byteParts[1] ? parseBytes(byteParts[1]) : 0;

        // Only record if we haven't already recorded for this customer in this cycle
        const exists = recordsToInsert.some(r => r.customerId === customer.id);
        if (!exists) {
          recordsToInsert.push({
            customerId: customer.id,
            bytesIn,
            bytesOut,
            sessionTime: 0,
            sessionId: `queue-${queueName}`
          });
        }
      }

      return {
        sessionsCount: sessionCount,
        records: recordsToInsert,
        success: true
      };
    })
  );

  // Aggregate results and collect all records for bulk insertion
  let allRecords = [];
  for (const res of results) {
    if (res.status === 'fulfilled') {
      const val = res.value;
      if (val.isError) {
        errors++;
      } else {
        totalSessions += val.sessionsCount;
        if (val.records && val.records.length > 0) {
          allRecords = allRecords.concat(val.records);
        }
      }
    } else {
      errors++;
      console.error('[Metrics] Error during parallel metrics collection task:', res.reason);
    }
  }

  // Bulk insert all collected records in chunks
  if (allRecords.length > 0) {
    totalRecords = await recordUsageBatch(allRecords);
  }

  const duration = Date.now() - startTime;
  console.log(`[Metrics] Collection complete: ${totalSessions} sessions, ${totalRecords} records stored (${duration}ms)`);

  return {
    collected: totalRecords,
    sessions: totalSessions,
    routers: connections.length,
    errors,
    duration_ms: duration,
  };
}

// Start the cron
function startCron() {
  const interval = 5 * 60 * 1000; // 5 minutes
  console.log(`[Metrics] Metrics collection cron started, runs every 5 minutes`);

  // Run after 30 seconds on start (give database and MikroTik connections time to be ready)
  setTimeout(() => {
    collectMetrics().catch(err => {
      console.error('[Metrics] Initial collection failed:', err.message);
    });
  }, 30 * 1000);

  setInterval(() => {
    collectMetrics().catch(err => {
      console.error('[Metrics] Scheduled collection failed:', err.message);
    });
  }, interval);
}

module.exports = { collectMetrics, startCron };
