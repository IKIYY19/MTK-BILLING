/**
 * Multi-Feature Store: Branches, Agents, Vouchers, Monitoring, Grace Periods
 * Unified store: PostgreSQL when available, in-memory fallback.
 * Extends billingStore with production-ready features
 */

const { v4: uuidv4 } = require("uuid");

// ─── Helpers ───
function getDb() {
  return global.dbAvailable ? global.db : null;
}

function pgNow() {
  return new Date().toISOString();
}

// ─── In-memory fallback store ───
const _branches = [];

const _agents = [];

const _graceConfig = {
  warn_days: 7, // Send warning SMS
  throttle_days: 14, // Throttle speed
  suspend_days: 30, // Full suspension
  throttle_speed_up: "1M",
  throttle_speed_down: "1M",
};

// ─── Ephemeral in-memory-only data ───
const vouchers = [];
const deviceMetrics = [];
const pppoeSessions = [];

// ─── Default seed data ───
const DEFAULT_BRANCHES = [];

const DEFAULT_AGENTS = [];

const DEFAULT_GRACE_CONFIG = {
  warn_days: 7,
  throttle_days: 14,
  suspend_days: 30,
  throttle_speed_up: "1M",
  throttle_speed_down: "1M",
};

// ─── Seed PG defaults ───
let pgSeeded = false;
async function seedPgDefaults(db) {
  if (pgSeeded) {return;}
  try {
    // Seed branches
    const branchResult = await db.query("SELECT COUNT(*) as c FROM branches");
    if (parseInt(branchResult.rows[0].c) === 0) {
      for (const b of DEFAULT_BRANCHES) {
        await db.query(
          `INSERT INTO branches (id, name, city, address, contact, status, lat, lng)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
          [b.id, b.name, b.city, b.address, b.contact, b.status, b.lat, b.lng],
        );
      }
    }

    // Seed agents
    const agentResult = await db.query("SELECT COUNT(*) as c FROM agents");
    if (parseInt(agentResult.rows[0].c) === 0) {
      for (const a of DEFAULT_AGENTS) {
        await db.query(
          `INSERT INTO agents (id, name, phone, email, branch_id, commission_rate, balance, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
          [
            a.id,
            a.name,
            a.phone,
            a.email,
            a.branch_id,
            a.commission_rate,
            a.balance,
            a.status,
          ],
        );
      }
    }

    // Seed grace config
    const graceResult = await db.query(
      "SELECT COUNT(*) as c FROM grace_period_config",
    );
    if (parseInt(graceResult.rows[0].c) === 0) {
      await db.query(
        `INSERT INTO grace_period_config (warn_days, throttle_days, suspend_days, throttle_speed_up, throttle_speed_down)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          DEFAULT_GRACE_CONFIG.warn_days,
          DEFAULT_GRACE_CONFIG.throttle_days,
          DEFAULT_GRACE_CONFIG.suspend_days,
          DEFAULT_GRACE_CONFIG.throttle_speed_up,
          DEFAULT_GRACE_CONFIG.throttle_speed_down,
        ],
      );
    }

    pgSeeded = true;
  } catch (e) {
    console.error("MultiFeature PG seed error (non-fatal):", e.message);
  }
}

// ─── Branches ───
async function getBranches() {
  const db = getDb();
  if (db) {
    await seedPgDefaults(db);
    const result = await db.query("SELECT * FROM branches ORDER BY name");
    return result.rows;
  }
  return [..._branches];
}

async function createBranch(data) {
  const db = getDb();
  if (db) {
    await seedPgDefaults(db);
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO branches (id, name, city, address, contact, status, lat, lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        id,
        data.name,
        data.city || null,
        data.address || null,
        data.contact || null,
        data.status || "active",
        data.lat || null,
        data.lng || null,
      ],
    );
    return result.rows[0];
  }
  const branch = {
    id: uuidv4(),
    ...data,
    created_at: pgNow(),
    status: data.status || "active",
  };
  _branches.push(branch);
  return branch;
}

async function updateBranch(id, data) {
  const db = getDb();
  if (db) {
    const existing = await db.query("SELECT * FROM branches WHERE id = $1", [
      id,
    ]);
    if (existing.rows.length === 0) {return null;}
    const merged = { ...existing.rows[0], ...data, updated_at: pgNow() };
    const result = await db.query(
      `UPDATE branches SET name=$1, city=$2, address=$3, contact=$4, status=$5, lat=$6, lng=$7, updated_at=$8
       WHERE id=$9 RETURNING *`,
      [
        merged.name,
        merged.city,
        merged.address,
        merged.contact,
        merged.status,
        merged.lat,
        merged.lng,
        merged.updated_at,
        id,
      ],
    );
    return result.rows[0];
  }
  const idx = _branches.findIndex((b) => b.id === id);
  if (idx === -1) {return null;}
  _branches[idx] = { ..._branches[idx], ...data, updated_at: pgNow() };
  return _branches[idx];
}

// ─── Agents ───
async function getAgents() {
  const db = getDb();
  if (db) {
    await seedPgDefaults(db);
    const result = await db.query("SELECT * FROM agents ORDER BY name");
    return result.rows;
  }
  return [..._agents];
}

async function createAgent(data) {
  const db = getDb();
  if (db) {
    await seedPgDefaults(db);
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO agents (id, name, phone, email, branch_id, commission_rate, balance, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        id,
        data.name,
        data.phone || null,
        data.email || null,
        data.branch_id || null,
        parseFloat(data.commission_rate) || 10,
        parseFloat(data.balance) || 0,
        data.status || "active",
      ],
    );
    return result.rows[0];
  }
  const agent = {
    id: uuidv4(),
    ...data,
    balance: parseFloat(data.balance) || 0,
    status: data.status || "active",
    created_at: pgNow(),
  };
  _agents.push(agent);
  return agent;
}

async function updateAgent(id, data) {
  const db = getDb();
  if (db) {
    const existing = await db.query("SELECT * FROM agents WHERE id = $1", [id]);
    if (existing.rows.length === 0) {return null;}
    const merged = { ...existing.rows[0], ...data, updated_at: pgNow() };
    const result = await db.query(
      `UPDATE agents SET name=$1, phone=$2, email=$3, branch_id=$4, commission_rate=$5, balance=$6, status=$7, updated_at=$8
       WHERE id=$9 RETURNING *`,
      [
        merged.name,
        merged.phone,
        merged.email,
        merged.branch_id,
        merged.commission_rate,
        merged.balance,
        merged.status,
        merged.updated_at,
        id,
      ],
    );
    return result.rows[0];
  }
  const idx = _agents.findIndex((a) => a.id === id);
  if (idx === -1) {return null;}
  _agents[idx] = { ..._agents[idx], ...data, updated_at: pgNow() };
  return _agents[idx];
}

async function deleteAgent(id) {
  const db = getDb();
  if (db) {
    const result = await db.query(
      "DELETE FROM agents WHERE id = $1 RETURNING *",
      [id],
    );
    return result.rows[0] || null;
  }
  const idx = _agents.findIndex((a) => a.id === id);
  if (idx === -1) {return null;}
  return _agents.splice(idx, 1)[0];
}

// ─── Grace Period Config ───
async function getGraceConfig() {
  const db = getDb();
  if (db) {
    await seedPgDefaults(db);
    const result = await db.query(
      "SELECT * FROM grace_period_config ORDER BY id LIMIT 1",
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        warn_days: row.warn_days,
        throttle_days: row.throttle_days,
        suspend_days: row.suspend_days,
        throttle_speed_up: row.throttle_speed_up,
        throttle_speed_down: row.throttle_speed_down,
      };
    }
  }
  return { ..._graceConfig };
}

async function updateGraceConfig(data) {
  const db = getDb();
  if (db) {
    const current = await db.query(
      "SELECT id FROM grace_period_config ORDER BY id LIMIT 1",
    );
    const merged = { ...DEFAULT_GRACE_CONFIG, ...data };
    if (current.rows.length > 0) {
      const result = await db.query(
        `UPDATE grace_period_config SET warn_days=$1, throttle_days=$2, suspend_days=$3,
         throttle_speed_up=$4, throttle_speed_down=$5, updated_at=$6
         WHERE id=$7 RETURNING *`,
        [
          merged.warn_days,
          merged.throttle_days,
          merged.suspend_days,
          merged.throttle_speed_up,
          merged.throttle_speed_down,
          pgNow(),
          current.rows[0].id,
        ],
      );
      const row = result.rows[0];
      return {
        warn_days: row.warn_days,
        throttle_days: row.throttle_days,
        suspend_days: row.suspend_days,
        throttle_speed_up: row.throttle_speed_up,
        throttle_speed_down: row.throttle_speed_down,
      };
    }
    // No row exists yet, insert one
    const result = await db.query(
      `INSERT INTO grace_period_config (warn_days, throttle_days, suspend_days, throttle_speed_up, throttle_speed_down)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [
        merged.warn_days,
        merged.throttle_days,
        merged.suspend_days,
        merged.throttle_speed_up,
        merged.throttle_speed_down,
      ],
    );
    const row = result.rows[0];
    return {
      warn_days: row.warn_days,
      throttle_days: row.throttle_days,
      suspend_days: row.suspend_days,
      throttle_speed_up: row.throttle_speed_up,
      throttle_speed_down: row.throttle_speed_down,
    };
  }
  Object.assign(_graceConfig, data);
  return { ..._graceConfig };
}

// ─── Seed sample vouchers ───
const seedVouchers = () => {};
seedVouchers();

// ─── Seed network metrics ───
// Real metrics are collected from MikroTik API via realMonitoringService.
// The in-memory fallback starts empty; data populates once routers connect.
const seedMetrics = () => {};
seedMetrics();

// ─── Seed PPPoE sessions ───
// Real PPPoE sessions are fetched from the MikroTik router via the API.
// The in-memory fallback starts empty when no real router is connected.
const seedPPPoE = () => {};
seedPPPoE();

module.exports = {
  getBranches,
  getAgents,
  getGraceConfig,
  createAgent,
  updateAgent,
  deleteAgent,
  createBranch,
  updateBranch,
  updateGraceConfig,
  // Ephemeral in-memory-only exports
  vouchers,
  deviceMetrics,
  pppoeSessions,
};
