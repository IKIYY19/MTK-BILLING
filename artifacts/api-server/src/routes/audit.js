/**
 * Audit Log API Routes
 * Reads from BOTH audit_logs (auth/system events) and billing_audit_logs
 * (billing events) and merges them into a single sorted stream.
 */

const express = require("express");
const { getDb } = require("../db");
const router = express.Router();

// GET /api/audit/logs?action=&entity_type=&user_id=&search=&limit=50&offset=0
router.get("/logs", async (req, res) => {
  try {
    const {
      action,
      entity_type,
      user_id,
      search,
      limit = 50,
      offset = 0,
    } = req.query;

    const limitInt = Math.max(1, Math.min(Number.parseInt(limit, 10) || 50, 500));
    const offsetInt = Math.max(0, Number.parseInt(offset, 10) || 0);
    const storage = global.dbAvailable && global.db ? "postgresql" : "memory";

    if (storage === "memory") {
      const memory = require("../db/memory")._getStore();
      const allLogs = memory.audit_logs || [];
      const normalizedSearch = String(search || "").trim().toLowerCase();
      const filtered = allLogs.filter((log) => {
        if (action && log.action !== action) return false;
        if (entity_type && log.entity_type !== entity_type) return false;
        if (user_id && log.user_id !== user_id) return false;
        if (!normalizedSearch) return true;

        return [
          log.action,
          log.entity_type,
          log.user_name,
          JSON.stringify(log.details || {}),
        ].some((value) =>
          String(value || "").toLowerCase().includes(normalizedSearch),
        );
      });
      const logs = filtered
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(offsetInt, offsetInt + limitInt);
      const facetRows = allLogs.reduce(
        (facets, log) => {
          if (log.action) facets.actions.add(log.action);
          if (log.entity_type) facets.entityTypes.add(log.entity_type);
          return facets;
        },
        { actions: new Set(), entityTypes: new Set() },
      );

      return res.json({
        logs,
        total: filtered.length,
        actions: [...facetRows.actions].sort(),
        entityTypes: [...facetRows.entityTypes].sort(),
        storage,
      });
    }

    const db = getDb();
    const buildConditions = (tableAlias, startIdx, userNameSql) => {
      const conds  = [];
      const params = [];
      let   idx    = startIdx;

      if (action?.trim()) {
        conds.push(`${tableAlias}.action = $${idx++}`);
        params.push(action.trim());
      }
      if (entity_type?.trim()) {
        conds.push(`${tableAlias}.entity_type = $${idx++}`);
        params.push(entity_type.trim());
      }
      if (user_id?.trim()) {
        conds.push(`${tableAlias}.user_id = $${idx++}`);
        params.push(user_id.trim());
      }
      if (search?.trim()) {
        conds.push(
          `(${tableAlias}.action ILIKE $${idx} OR ${tableAlias}.entity_type ILIKE $${idx} OR ${userNameSql} ILIKE $${idx})`,
        );
        params.push(`%${search.trim()}%`);
        idx++;
      }
      const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
      return { where, params, nextIdx: idx };
    };

    const tableCheck = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('audit_logs', 'billing_audit_logs')
    `);
    const existingTables = new Set(tableCheck.rows.map((r) => r.table_name));

    const unionParts = [];
    const countParts = [];
    const facetParts = [];
    const allParams = [];
    let paramOffset = 1;

    if (existingTables.has("audit_logs")) {
      const { where, params, nextIdx } = buildConditions(
        "al",
        paramOffset,
        "COALESCE(al.user_name, '')",
      );
      unionParts.push(`
        SELECT
          al.id,
          al.user_id,
          al.action,
          al.entity_type,
          al.entity_id,
          al.before_data,
          al.after_data,
          al.ip_address,
          al.user_agent,
          al.created_at,
          COALESCE(al.user_name, 'System') AS user_name,
          al.user_role
        FROM audit_logs al
        ${where}
      `);
      countParts.push(`SELECT COUNT(*) FROM audit_logs al ${where}`);
      facetParts.push(
        "SELECT action, entity_type FROM audit_logs",
      );
      allParams.push(...params);
      paramOffset = nextIdx;
    }

    if (existingTables.has("billing_audit_logs")) {
      const { where, params, nextIdx } = buildConditions(
        "al",
        paramOffset,
        "COALESCE(u.name, '')",
      );

      unionParts.push(`
        SELECT
          al.id,
          al.user_id,
          al.action,
          al.entity_type,
          al.entity_id,
          al.old_values  AS before_data,
          al.new_values  AS after_data,
          al.ip_address,
          al.user_agent,
          al.created_at,
          COALESCE(u.name, 'System') AS user_name,
          u.role AS user_role
        FROM billing_audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        ${where}
      `);
      countParts.push(`
        SELECT COUNT(*)
        FROM billing_audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        ${where}
      `);
      facetParts.push(
        "SELECT action, entity_type FROM billing_audit_logs",
      );
      allParams.push(...params);
      paramOffset = nextIdx;
    }

    if (unionParts.length === 0) {
      return res.json({
        logs: [],
        total: 0,
        actions: [],
        entityTypes: [],
        storage,
      });
    }

    const limitParam = paramOffset++;
    const offsetParam = paramOffset++;
    const dataParams = [...allParams, limitInt, offsetInt];

    const dataQuery = `
      SELECT * FROM (
        ${unionParts.join(" UNION ALL ")}
      ) combined
      ORDER BY created_at DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    const countQuery = `
      SELECT (${countParts.map((q) => `(${q})`).join(" + ")}      ) AS total
    `;

    const facetQuery = `
      SELECT
        COALESCE(ARRAY_AGG(DISTINCT action ORDER BY action), '{}') AS actions,
        COALESCE(ARRAY_AGG(DISTINCT entity_type ORDER BY entity_type), '{}') AS entity_types
      FROM (${facetParts.join(" UNION ALL ")}) facets
    `;

    const [result, countResult, facetResult] = await Promise.all([
      db.query(dataQuery, dataParams),
      db.query(countQuery, allParams),
      db.query(facetQuery),
    ]);

    const total = parseInt(countResult.rows[0]?.total || 0);
    res.json({
      logs: result.rows,
      total,
      actions: facetResult.rows[0]?.actions || [],
      entityTypes: facetResult.rows[0]?.entity_types || [],
      storage,
    });
  } catch (error) {
    console.error("Audit logs error:", error);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

module.exports = router;
