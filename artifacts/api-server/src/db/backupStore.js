/**
 * MikroTik Auto Backup System
 * Schedules and stores device configuration backups
 * Unified store: PostgreSQL when available, in-memory fallback.
 */

const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");

const backupStore = {
  schedules: [],
  backups: [],
};

// ─── Helpers ───
function getDb() {
  return global.dbAvailable ? global.db : null;
}

// No seed data — backup schedules are created by operators via the UI.
// Pre-seeding fake routers would show false entries on every fresh install.


// ─── Create Backup Schedule ───
async function createSchedule(data) {
  const db = getDb();
  if (db) {
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO backup_schedules (id, name, device_type, ip_address, api_port, username, password_encrypted, schedule, "time", enabled, last_run, last_status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, 'never', NOW()) RETURNING *`,
      [
        id,
        data.name,
        data.device_type || "routeros",
        data.ip_address,
        data.api_port || 8728,
        data.username,
        crypto.randomBytes(16).toString("hex"),
        data.schedule || "daily",
        data.time || "02:00",
        data.enabled !== false,
      ],
    );
    return result.rows[0];
  }

  const schedule = {
    id: uuidv4(),
    name: data.name,
    device_type: data.device_type || "routeros",
    ip_address: data.ip_address,
    api_port: data.api_port || 8728,
    username: data.username,
    password_encrypted: crypto.randomBytes(16).toString("hex"), // Encrypt in production
    schedule: data.schedule || "daily",
    time: data.time || "02:00",
    enabled: data.enabled !== false,
    last_run: null,
    last_status: "never",
    created_at: new Date().toISOString(),
  };
  backupStore.schedules.push(schedule);
  return schedule;
}

// ─── Run Backup ───
async function runBackup(scheduleId) {
  const db = getDb();
  const startTime = new Date().toISOString();

  // Fetch schedule from DB or in-memory store
  let schedule = null;
  if (db) {
    const schedResult = await db.query(
      "SELECT * FROM backup_schedules WHERE id = $1",
      [scheduleId],
    );
    schedule = schedResult.rows[0];
  } else {
    schedule = backupStore.schedules.find((s) => s.id === scheduleId);
  }
  if (!schedule) {return { success: false, message: "Schedule not found" };}

  let configContent = null;
  let exportError = null;

  // Attempt real MikroTik /export via RouterOS API
  try {
    const routerConnectionManager = require('../services/routerConnectionManager');
    const device = {
      ip_address: schedule.ip_address,
      api_port: schedule.api_port || 8728,
      username: schedule.username,
      // password is stored encrypted — decrypt before use
      password: schedule.password_plain || schedule.password_encrypted,
      connection_type: 'api',
    };

    const exportResult = await routerConnectionManager.executeCommand(
      device, '/export', {}
    );

    if (exportResult && (exportResult.output || exportResult.data || typeof exportResult === 'string')) {
      configContent = typeof exportResult === 'string'
        ? exportResult
        : (exportResult.output || JSON.stringify(exportResult.data || exportResult));
    } else {
      throw new Error('Empty export response from router');
    }
  } catch (err) {
    exportError = err.message;
  }

  const success = !!configContent && !exportError;
  const fileSize = configContent ? Buffer.byteLength(configContent, 'utf8') : 0;
  const errorMsg = exportError || null;

  if (db) {
    try {
      const backupId = uuidv4();
      const backupResult = await db.query(
        `INSERT INTO backups (id, schedule_id, device_name, ip_address, config_content, file_size, status, error, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          backupId,
          schedule.id,
          schedule.name,
          schedule.ip_address,
          configContent || '',
          fileSize,
          success ? 'success' : 'failed',
          errorMsg,
          startTime,
        ],
      );

      await db.query(
        `UPDATE backup_schedules SET last_run = $1, last_status = $2 WHERE id = $3`,
        [startTime, success ? 'success' : 'failed', schedule.id],
      );

      return success
        ? { success: true, backup: backupResult.rows[0] }
        : { success: false, message: errorMsg };
    } catch (dbErr) {
      return { success: false, message: dbErr.message };
    }
  }

  // In-memory fallback
  const backup = {
    id: uuidv4(),
    schedule_id: schedule.id,
    device_name: schedule.name,
    ip_address: schedule.ip_address,
    config_content: configContent || '',
    file_size: fileSize,
    status: success ? 'success' : 'failed',
    error: errorMsg,
    created_at: startTime,
  };

  backupStore.backups.unshift(backup);
  schedule.last_run = startTime;
  schedule.last_status = success ? 'success' : 'failed';

  return success
    ? { success: true, backup }
    : { success: false, message: errorMsg };
}

// ─── Run All Enabled Backups ───
async function runAllBackups() {
  const db = getDb();

  if (db) {
    const results = { total: 0, success: 0, failed: 0, errors: [] };
    const schedResult = await db.query(
      `SELECT * FROM backup_schedules WHERE enabled = true`,
    );

    for (const schedule of schedResult.rows) {
      results.total++;
      const result = await runBackup(schedule.id);
      if (result.success) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push({ schedule: schedule.name, error: result.message });
      }
    }

    return results;
  }

  // In-memory fallback
  const results = { total: 0, success: 0, failed: 0, errors: [] };

  for (const schedule of backupStore.schedules) {
    if (!schedule.enabled) {continue;}
    results.total++;

    const result = await runBackup(schedule.id);
    if (result.success) {
      results.success++;
    } else {
      results.failed++;
      results.errors.push({ schedule: schedule.name, error: result.message });
    }
  }

  return results;
}

// ─── Get Backups ───
async function getBackups(scheduleId, limit = 50) {
  const db = getDb();
  if (db) {
    let result;
    if (scheduleId) {
      result = await db.query(
        "SELECT * FROM backups WHERE schedule_id = $1 ORDER BY created_at DESC LIMIT $2",
        [scheduleId, limit],
      );
    } else {
      result = await db.query(
        "SELECT * FROM backups ORDER BY created_at DESC LIMIT $1",
        [limit],
      );
    }
    return result.rows;
  }

  let backups = backupStore.backups;
  if (scheduleId) {backups = backups.filter((b) => b.schedule_id === scheduleId);}
  return backups.slice(0, limit);
}

// ─── Get Schedule ───
async function getSchedule(id) {
  const db = getDb();
  if (db) {
    const result = await db.query(
      "SELECT * FROM backup_schedules WHERE id = $1",
      [id],
    );
    return result.rows[0] || null;
  }
  return backupStore.schedules.find((s) => s.id === id);
}

// ─── Get All Schedules ───
async function getAllSchedules() {
  const db = getDb();
  if (db) {
    const result = await db.query(
      "SELECT * FROM backup_schedules ORDER BY created_at DESC",
    );
    return result.rows;
  }
  return backupStore.schedules;
}

// ─── Update Schedule ───
async function updateSchedule(id, data) {
  const db = getDb();
  if (db) {
    const existing = await db.query(
      "SELECT * FROM backup_schedules WHERE id = $1",
      [id],
    );
    if (existing.rows.length === 0) {return null;}

    const current = existing.rows[0];
    const merged = {
      name: data.name !== undefined ? data.name : current.name,
      device_type:
        data.device_type !== undefined ? data.device_type : current.device_type,
      ip_address:
        data.ip_address !== undefined ? data.ip_address : current.ip_address,
      api_port: data.api_port !== undefined ? data.api_port : current.api_port,
      username: data.username !== undefined ? data.username : current.username,
      password_encrypted:
        data.password_encrypted !== undefined
          ? data.password_encrypted
          : current.password_encrypted,
      schedule: data.schedule !== undefined ? data.schedule : current.schedule,
      time: data.time !== undefined ? data.time : current.time,
      enabled: data.enabled !== undefined ? data.enabled : current.enabled,
      last_run: data.last_run !== undefined ? data.last_run : current.last_run,
      last_status:
        data.last_status !== undefined ? data.last_status : current.last_status,
    };

    const result = await db.query(
      `UPDATE backup_schedules SET name = $1, device_type = $2, ip_address = $3, api_port = $4, username = $5, password_encrypted = $6, schedule = $7, "time" = $8, enabled = $9, last_run = $10, last_status = $11, updated_at = NOW() WHERE id = $12 RETURNING *`,
      [
        merged.name,
        merged.device_type,
        merged.ip_address,
        merged.api_port,
        merged.username,
        merged.password_encrypted,
        merged.schedule,
        merged.time,
        merged.enabled,
        merged.last_run,
        merged.last_status,
        id,
      ],
    );
    return result.rows[0];
  }

  const idx = backupStore.schedules.findIndex((s) => s.id === id);
  if (idx === -1) {return null;}
  backupStore.schedules[idx] = { ...backupStore.schedules[idx], ...data };
  return backupStore.schedules[idx];
}

// ─── Delete Schedule ───
async function deleteSchedule(id) {
  const db = getDb();
  if (db) {
    const result = await db.query(
      "DELETE FROM backup_schedules WHERE id = $1 RETURNING *",
      [id],
    );
    return result.rows[0] || null;
  }

  const idx = backupStore.schedules.findIndex((s) => s.id === id);
  if (idx === -1) {return null;}
  return backupStore.schedules.splice(idx, 1)[0];
}

// ─── Get Backup Content ───
async function getBackupContent(backupId) {
  const db = getDb();
  if (db) {
    const result = await db.query(
      "SELECT id, device_name, ip_address, config_content, created_at FROM backups WHERE id = $1",
      [backupId],
    );
    if (result.rows.length === 0) {return null;}
    const b = result.rows[0];
    return {
      id: b.id,
      device_name: b.device_name,
      ip_address: b.ip_address,
      content: b.config_content,
      created_at: b.created_at,
    };
  }

  const backup = backupStore.backups.find((b) => b.id === backupId);
  if (!backup) {return null;}
  return {
    id: backup.id,
    device_name: backup.device_name,
    ip_address: backup.ip_address,
    content: backup.config_content,
    created_at: backup.created_at,
  };
}

// ─── Create Uploaded Backup ───
async function createUploadedBackup(data) {
  const db = getDb();
  if (db) {
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO backups (id, schedule_id, device_name, ip_address, config_content, file_size, status, created_at)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
      [
        id,
        data.device_name,
        data.ip_address,
        data.config_content,
        data.file_size,
        data.status || "success",
      ],
    );
    return result.rows[0];
  }

  const backup = {
    id: uuidv4(),
    schedule_id: null,
    device_name: data.device_name,
    ip_address: data.ip_address,
    config_content: data.config_content,
    file_size: data.file_size,
    status: data.status || "success",
    created_at: new Date().toISOString(),
  };
  backupStore.backups.unshift(backup);
  return backup;
}

module.exports = {
  backupStore,
  createSchedule,
  runBackup,
  runAllBackups,
  getBackups,
  getSchedule,
  getAllSchedules,
  updateSchedule,
  deleteSchedule,
  getBackupContent,
  createUploadedBackup,
};
