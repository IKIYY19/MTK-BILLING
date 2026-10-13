/**
 * RADIUS Accounting Store
 * Unified store: PostgreSQL when available, in-memory fallback.
 * Tracks bandwidth usage per session and per customer
 * Enforces quotas and auto-throttles
 */

const { v4: uuidv4 } = require("uuid");

// ─── Helpers ───
function getDb() {
  return global.dbAvailable ? global.db : null;
}

function pgNow() {
  return new Date().toISOString();
}

function getBillingData() {
  return require("../services/billingData");
}

// ─── In-memory fallback store ───
const radiusStore = {
  sessions: [],
  daily_usage: [],
  quota_enforcement_log: [],
};

// ─── RADIUS Accounting Packet Handler ───
async function handleAccounting(data) {
  const {
    username,
    session_id,
    acct_status_type, // Start=1, Stop=2, Interim-Update=3
    acct_input_octets,
    acct_output_octets,
    acct_session_time,
    framed_ip_address,
    nas_ip_address,
    calling_station_id, // MAC address
    acct_terminate_cause,
  } = data;

  // Find customer by PPPoE username
  const billingData = getBillingData();
  const lookup = await billingData.findCustomerByPppoeUsername(username);

  if (!lookup) {
    return {
      accepted: true,
      message: "Unknown user",
      reply: { "Reply-Message": "User not found in billing system" },
    };
  }

  const customer = lookup.customer;
  const subscription = lookup.subscription;
  const plan = lookup.plan;

  const db = getDb();

  if (acct_status_type === "Start" || acct_status_type === 1) {
    // Session started
    const sessionId = uuidv4();
    const startTime = pgNow();
    const session = {
      id: sessionId,
      session_id,
      username,
      customer_id: customer.id,
      start_time: startTime,
      end_time: null,
      bytes_in: 0,
      bytes_out: 0,
      session_time: 0,
      framed_ip: framed_ip_address,
      nas_ip: nas_ip_address,
      mac_address: calling_station_id,
      status: "active",
    };

    if (db) {
      try {
        await db.query(
          `INSERT INTO radius_sessions (id, session_id, username, customer_id, start_time, end_time, bytes_in, bytes_out, session_time, framed_ip, nas_ip, mac_address, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            sessionId,
            session_id,
            username,
            customer.id,
            startTime,
            null,
            0,
            0,
            0,
            framed_ip_address,
            nas_ip_address,
            calling_station_id,
            "active",
          ],
        );
      } catch (e) {
        console.error("Radius PG session start error (non-fatal):", e.message);
      }
    }
    radiusStore.sessions.push(session);

    return {
      accepted: true,
      reply: {
        "Reply-Message": "Session started",
        "Mikrotik-Rate-Limit": plan
          ? `${plan.speed_down}/${plan.speed_up}`
          : "1M/1M",
      },
    };
  }

  if (acct_status_type === "Interim-Update" || acct_status_type === 3) {
    // Update session
    const bytesIn = parseInt(acct_input_octets) || 0;
    const bytesOut = parseInt(acct_output_octets) || 0;
    const sessionTime = parseInt(acct_session_time) || 0;

    if (db) {
      try {
        await db.query(
          `UPDATE radius_sessions SET bytes_in=$1, bytes_out=$2, session_time=$3
           WHERE session_id=$4 AND status='active'`,
          [bytesIn, bytesOut, sessionTime, session_id],
        );
      } catch (e) {
        console.error("Radius PG session update error (non-fatal):", e.message);
      }
    }

    const session = radiusStore.sessions.find(
      (s) => s.session_id === session_id && s.status === "active",
    );
    if (session) {
      session.bytes_in = bytesIn;
      session.bytes_out = bytesOut;
      session.session_time = sessionTime;

      // Record interim usage to billingData
      try {
        const billing = getBillingData();
        await billing.recordUsage({
          customer_id: customer.id,
          subscription_id: subscription?.id || null,
          bytes_in: bytesIn,
          bytes_out: bytesOut,
          session_time: sessionTime,
          session_id,
        });
      } catch (e) {
        console.error("Billing interim usage record error (non-fatal):", e.message);
      }

      // Check quota
      if (plan?.quota_gb) {
        const totalUsage = await getTotalCustomerUsage(customer.id);
        const quotaBytes = plan.quota_gb * 1024 * 1024 * 1024;
        const usedPercent = (totalUsage / quotaBytes) * 100;

        if (usedPercent >= 100 && !subscription.throttled) {
          // Quota exceeded - throttle
          await billingData.updateSubscription(subscription.id, {
            throttled: true,
            throttle_reason: "quota_exceeded",
          });

          const logEntry = {
            id: uuidv4(),
            customer_id: customer.id,
            action: "throttled",
            reason: `Quota exceeded: ${(totalUsage / (1024 * 1024 * 1024)).toFixed(1)}GB / ${plan.quota_gb}GB`,
            created_at: new Date().toISOString(),
          };

          if (db) {
            try {
              await db.query(
                `INSERT INTO radius_quota_enforcement_log (id, customer_id, action, reason)
                 VALUES ($1,$2,$3,$4)`,
                [logEntry.id, customer.id, logEntry.action, logEntry.reason],
              );
            } catch (e) {
              console.error(
                "Radius PG quota log error (non-fatal):",
                e.message,
              );
            }
          }
          radiusStore.quota_enforcement_log.push(logEntry);

          return {
            accepted: true,
            reply: {
              "Reply-Message": "Quota exceeded - throttled",
              "Mikrotik-Rate-Limit": "1M/1M",
            },
          };
        }

        if (usedPercent >= 80 && usedPercent < 100) {
          // Warning at 80%
          return {
            accepted: true,
            reply: {
              "Reply-Message": `Usage warning: ${usedPercent.toFixed(0)}% of quota used`,
              "Mikrotik-Rate-Limit": plan
                ? `${plan.speed_down}/${plan.speed_up}`
                : "1M/1M",
            },
          };
        }
      }

      return {
        accepted: true,
        reply: {
          "Mikrotik-Rate-Limit": subscription.throttled
            ? "1M/1M"
            : plan
              ? `${plan.speed_down}/${plan.speed_up}`
              : "1M/1M",
        },
      };
    }
  }

  if (acct_status_type === "Stop" || acct_status_type === 2) {
    // Session ended
    const endTime = pgNow();
    const bytesIn = parseInt(acct_input_octets) || 0;
    const bytesOut = parseInt(acct_output_octets) || 0;
    const sessionTime = parseInt(acct_session_time) || 0;

    if (db) {
      try {
        await db.query(
          `UPDATE radius_sessions SET end_time=$1, bytes_in=$2, bytes_out=$3, session_time=$4, status='completed', terminate_cause=$5
           WHERE session_id=$6 AND status='active'`,
          [
            endTime,
            bytesIn,
            bytesOut,
            sessionTime,
            acct_terminate_cause || null,
            session_id,
          ],
        );
      } catch (e) {
        console.error("Radius PG session stop error (non-fatal):", e.message);
      }
    }

    const session = radiusStore.sessions.find(
      (s) => s.session_id === session_id && s.status === "active",
    );
    if (session) {
      session.end_time = endTime;
      session.bytes_in = bytesIn || session.bytes_in;
      session.bytes_out = bytesOut || session.bytes_out;
      session.session_time = sessionTime || session.session_time;
      session.status = "completed";
      session.terminate_cause = acct_terminate_cause;
    }

    // Record daily usage
    const today = new Date().toISOString().split("T")[0];

    if (db) {
      try {
        await db.query(
          `INSERT INTO radius_daily_usage (id, date, customer_id, bytes_in, bytes_out, sessions)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (date, customer_id) DO UPDATE
           SET bytes_in = radius_daily_usage.bytes_in + $4,
               bytes_out = radius_daily_usage.bytes_out + $5,
               sessions = radius_daily_usage.sessions + 1`,
          [uuidv4(), today, customer.id, bytesIn, bytesOut],
        );
      } catch (e) {
        console.error("Radius PG daily usage error (non-fatal):", e.message);
      }
    }

    const dailyRecord = radiusStore.daily_usage.find(
      (d) => d.date === today && d.customer_id === customer.id,
    );
    if (dailyRecord) {
      dailyRecord.bytes_in += bytesIn;
      dailyRecord.bytes_out += bytesOut;
      dailyRecord.sessions += 1;
    } else {
      radiusStore.daily_usage.push({
        id: uuidv4(),
        date: today,
        customer_id: customer.id,
        bytes_in: bytesIn,
        bytes_out: bytesOut,
        sessions: 1,
      });
    }

    // Record to billingData for usage tracking and quota enforcement
    try {
      const billing = getBillingData();
      await billing.recordUsage({
        customer_id: customer.id,
        subscription_id: subscription?.id || null,
        bytes_in: bytesIn,
        bytes_out: bytesOut,
        session_time: sessionTime,
        session_id,
      });
    } catch (e) {
      console.error("Billing usage record error (non-fatal):", e.message);
    }

    return { accepted: true, reply: { "Reply-Message": "Session stopped" } };
  }

  return { accepted: true, reply: {} };
}

// ─── Get Total Customer Usage (current billing cycle) ───
async function getTotalCustomerUsage(customerId) {
  const billingData = getBillingData();
  const customer = await billingData.getCustomerById(customerId);
  if (!customer) {return 0;}

  // Find active subscription
  const subscriptions = await billingData.listSubscriptions();
  const subscription = subscriptions.find(
    (s) => s.customer_id === customerId && s.status === "active",
  );
  if (!subscription) {return 0;}

  // Calculate usage from current billing cycle start date
  const cycleStart =
    subscription.start_date || new Date().toISOString().split("T")[0];
  const cycleStartTs = new Date(cycleStart).getTime();

  const db = getDb();
  if (db) {
    try {
      const result = await db.query(
        `SELECT COALESCE(SUM(bytes_in), 0) + COALESCE(SUM(bytes_out), 0) as total_bytes
         FROM radius_sessions
         WHERE customer_id = $1 AND start_time >= $2`,
        [customerId, cycleStart],
      );
      const total = parseInt(result.rows[0]?.total_bytes) || 0;
      return total;
    } catch (e) {
      console.error("Radius PG usage query error (non-fatal):", e.message);
      // Fall through to in-memory
    }
  }

  const totalBytes = radiusStore.sessions
    .filter(
      (s) =>
        s.customer_id === customerId &&
        new Date(s.start_time).getTime() >= cycleStartTs,
    )
    .reduce((sum, s) => sum + s.bytes_in + s.bytes_out, 0);

  return totalBytes;
}

// ─── Reset Quotas for New Billing Cycle ───
async function resetQuotas() {
  const billingData = getBillingData();
  const db = getDb();
  const now = new Date();

  const subscriptions = await billingData.listSubscriptions();
  for (const sub of subscriptions) {
    if (
      sub.status === "active" &&
      sub.throttled &&
      sub.throttle_reason === "quota_exceeded"
    ) {
      // Check if billing cycle has renewed
      // Simple check: if start_date is in current month
      const startDate = new Date(sub.start_date);
      if (
        now.getMonth() !== startDate.getMonth() ||
        now.getFullYear() !== startDate.getFullYear()
      ) {
        // New billing cycle - reset throttle
        await billingData.updateSubscription(sub.id, {
          throttled: false,
          throttle_reason: null,
        });

        const logEntry = {
          id: uuidv4(),
          customer_id: sub.customer_id,
          action: "quota_reset",
          reason: "New billing cycle",
          created_at: new Date().toISOString(),
        };

        if (db) {
          try {
            await db.query(
              `INSERT INTO radius_quota_enforcement_log (id, customer_id, action, reason)
               VALUES ($1,$2,$3,$4)`,
              [logEntry.id, sub.customer_id, logEntry.action, logEntry.reason],
            );
          } catch (e) {
            console.error(
              "Radius PG quota reset log error (non-fatal):",
              e.message,
            );
          }
        }
        radiusStore.quota_enforcement_log.push(logEntry);
      }
    }
  }
}

// ─── Get Usage Report ───
async function getUsageReport(customerId, period = "month") {
  const now = new Date();
  let startDate;

  if (period === "day") {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === "week") {
    startDate = new Date(now);
    startDate.setDate(now.getDate() - 7);
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const db = getDb();

  if (db) {
    try {
      const result = await db.query(
        `SELECT id, session_id, start_time, end_time, bytes_in, bytes_out, session_time, framed_ip, status
         FROM radius_sessions
         WHERE customer_id = $1 AND start_time >= $2
         ORDER BY start_time DESC
         LIMIT 50`,
        [customerId, startDate.toISOString()],
      );

      const sessions = result.rows;
      const totalIn = sessions.reduce(
        (sum, s) => sum + (parseInt(s.bytes_in) || 0),
        0,
      );
      const totalOut = sessions.reduce(
        (sum, s) => sum + (parseInt(s.bytes_out) || 0),
        0,
      );

      return {
        period,
        start_date: startDate.toISOString(),
        end_date: now.toISOString(),
        total_bytes_in: totalIn,
        total_bytes_out: totalOut,
        total_bytes: totalIn + totalOut,
        total_gb: ((totalIn + totalOut) / (1024 * 1024 * 1024)).toFixed(2),
        session_count: sessions.length,
        avg_session_time:
          sessions.length > 0
            ? (
                sessions.reduce((sum, s) => sum + (s.session_time || 0), 0) /
                sessions.length /
                3600
              ).toFixed(1) + "h"
            : "0h",
        sessions: sessions.map((s) => ({
          start_time: s.start_time,
          end_time: s.end_time,
          bytes_in: parseInt(s.bytes_in) || 0,
          bytes_out: parseInt(s.bytes_out) || 0,
          session_time: s.session_time || 0,
          ip: s.framed_ip,
        })),
      };
    } catch (e) {
      console.error("Radius PG usage report error (non-fatal):", e.message);
      // Fall through to in-memory
    }
  }

  const sessions = radiusStore.sessions.filter(
    (s) => s.customer_id === customerId && new Date(s.start_time) >= startDate,
  );

  const totalIn = sessions.reduce((sum, s) => sum + s.bytes_in, 0);
  const totalOut = sessions.reduce((sum, s) => sum + s.bytes_out, 0);

  return {
    period,
    start_date: startDate.toISOString(),
    end_date: now.toISOString(),
    total_bytes_in: totalIn,
    total_bytes_out: totalOut,
    total_bytes: totalIn + totalOut,
    total_gb: ((totalIn + totalOut) / (1024 * 1024 * 1024)).toFixed(2),
    session_count: sessions.length,
    avg_session_time:
      sessions.length > 0
        ? (
            sessions.reduce((sum, s) => sum + s.session_time, 0) /
            sessions.length /
            3600
          ).toFixed(1) + "h"
        : "0h",
    sessions: sessions.slice(-50).map((s) => ({
      start_time: s.start_time,
      end_time: s.end_time,
      bytes_in: s.bytes_in,
      bytes_out: s.bytes_out,
      session_time: s.session_time,
      ip: s.framed_ip,
    })),
  };
}

module.exports = {
  radiusStore,
  handleAccounting,
  getTotalCustomerUsage,
  resetQuotas,
  getUsageReport,
};
