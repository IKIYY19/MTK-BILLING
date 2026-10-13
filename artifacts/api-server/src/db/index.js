const { Pool } = require("pg");
const { loadEnv } = require("../config/loadEnv");
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

module.exports = {
  query: async (text, params) => {
    try {
      return await pool.query(text, params);
    } catch (err) {
      console.error("⚠️  Database query error:", err.message);
      throw err;
    }
  },
  pool,
  /**
   * Returns the active database (PostgreSQL or in-memory fallback).
   * Use this in route files instead of copy-pasting the same function.
   *
   * @returns {object} db instance with a .query() method
   */
  getDb: () => (global.dbAvailable ? global.db : require("./memory")),
};

