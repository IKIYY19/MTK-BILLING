const pg = require("pg");
const { Pool } = pg;
const { loadEnv } = require("../config/loadEnv");
const { getTenantId } = require("./tenantScope");

// PostgreSQL superusers and BYPASSRLS roles ignore RLS policies. Scoped
// requests therefore run as a dedicated non-superuser role; system work
// (migrations, startup, background jobs) keeps the configured connection role.
const APP_ROLE = "mtk_billing_app";
let appRoleAvailable = false;

pg.types.setTypeParser(1114, (value) => (value ? new Date(`${value}Z`) : null));
loadEnv();

// Support multiple database URL formats (Railway, Render, etc.)
let dbConfig;
const isProductionEnv = process.env.NODE_ENV === "production";

function getFirstDefined(...values) {
  return values.find(
    (value) => value !== undefined && value !== null && value !== "",
  );
}

function requireProductionValue(label, ...values) {
  const value = getFirstDefined(...values);
  if (!value && isProductionEnv) {
    throw new Error(`${label} must be configured in production`);
  }
  return value;
}

if (process.env.DATABASE_URL) {
  // Railway, Heroku, Render style
  dbConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
    max: 30,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 5000,
  };
} else if (process.env.DB_HOST || process.env.PGHOST) {
  // Manual config or Dokploy style
  dbConfig = {
    host:
      requireProductionValue(
        "DB host",
        process.env.DB_HOST,
        process.env.PGHOST,
      ) || "localhost",
    port:
      requireProductionValue(
        "DB port",
        process.env.DB_PORT,
        process.env.PGPORT,
      ) || 5432,
    database:
      requireProductionValue(
        "DB name",
        process.env.DB_NAME,
        process.env.PGDATABASE,
      ) || "mikrotik_config_builder",
    user:
      requireProductionValue(
        "DB user",
        process.env.DB_USER,
        process.env.PGUSER,
      ) || "postgres",
    password:
      requireProductionValue(
        "DB password",
        process.env.DB_PASSWORD,
        process.env.PGPASSWORD,
      ) || "postgres",
    max: 30,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 5000,
  };
} else {
  if (isProductionEnv) {
    throw new Error(
      "DATABASE_URL or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD are required in production",
    );
  }
  // Fallback to localhost for local development
  dbConfig = {
    host: "localhost",
    port: 5432,
    database: "mikrotik_config_builder",
    user: "postgres",
    password: "postgres",
    max: 30,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 2000,
  };
}

const pool = new Pool(dbConfig);

pool.on("connect", () => {
  console.log("Database connected successfully");
});

// Handle pool errors gracefully (don't crash the server)
pool.on("error", (err) => {
  console.error("⚠️  Database pool error:", err.message);
});

/**
 * Runs a query on a dedicated client inside a transaction whose tenant
 * setting matches the current request context. `set_config(..., true)` is
 * transaction-local, so the setting cannot leak between pooled connections.
 */
async function scopedQuery(text, params) {
  const tenantId = getTenantId();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (tenantId && appRoleAvailable) {
      await client.query(`SET LOCAL ROLE ${APP_ROLE}`);
    }
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [
      tenantId,
    ]);
    const result = await client.query(text, params);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The connection may already be closed; release() still returns it.
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Creates (if needed) and grants privileges to the non-superuser role used
 * for tenant-scoped queries. Must be called after migrations so that tables
 * created by this startup are covered by the grants.
 */
async function ensureAppRole() {
  try {
    const existing = await pool.query(
      "SELECT 1 FROM pg_roles WHERE rolname = $1",
      [APP_ROLE],
    );
    if (existing.rows.length === 0) {
      await pool.query(
        `CREATE ROLE ${APP_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`,
      );
    }
    await pool.query(`GRANT ${APP_ROLE} TO CURRENT_USER`);
    await pool.query(`
      DO $$
      DECLARE t record;
      BEGIN
        FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
          EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO ${APP_ROLE}', t.tablename);
        END LOOP;
        FOR t IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
          EXECUTE format('GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.%I TO ${APP_ROLE}', t.sequencename);
        END LOOP;
      END $$;
    `);
    appRoleAvailable = true;
    console.log("Tenant isolation role ready:", APP_ROLE);
  } catch (err) {
    appRoleAvailable = false;
    console.error(
      "WARNING: could not configure tenant isolation role. Scoped requests will run as the connection role;",
      "if it is a superuser, RLS will not isolate tenants.",
      err.message,
    );
  }
}

module.exports = {
  query: async (text, params) => {
    try {
      return await scopedQuery(text, params);
    } catch (err) {
      console.error("⚠️  Database query error:", err.message);
      throw err;
    }
  },
  scopedQuery,
  ensureAppRole,
  pool,
  /**
   * Returns the active database (PostgreSQL or in-memory fallback).
   * Use this in route files instead of copy-pasting the same function.
   *
   * @returns {object} db instance with a .query() method
   */
  getDb: () => (global.dbAvailable ? global.db : require("./memory")),
};

