const { v4: uuidv4 } = require("uuid");
const logger = require("../utils/logger");

function getDb() {
  return global.dbAvailable ? global.db : require("../db/memory");
}

class ProvisioningQueue {
  constructor() {
    this.memoryQueue = [];
    this.isProcessing = false;
  }

  async queueTask(connectionId, action, payload, status = "pending", lastError = null) {
    try {
      const db = getDb();
      if (global.dbAvailable) {
        const id = uuidv4();
        await db.query(
          `INSERT INTO provisioning_queue 
          (id, connection_id, action, payload, status, attempts, last_error) 
          VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, connectionId, action, JSON.stringify(payload), status, 1, lastError]
        );
        logger.info(`[ProvisioningQueue] Task queued for router ${connectionId}: ${action}`);
        return { id, status };
      } else {
        const task = {
          id: uuidv4(),
          connection_id: connectionId,
          action,
          payload: typeof payload === "string" ? JSON.parse(payload) : payload,
          status,
          attempts: 1,
          max_attempts: 5,
          last_attempt_at: new Date().toISOString(),
          last_error: lastError,
          created_at: new Date().toISOString()
        };
        this.memoryQueue.push(task);
        if (db.store && db.store.provisioning_queue) {
          db.store.provisioning_queue.push(task);
        }
        logger.info(`[ProvisioningQueue] Task queued in memory for router ${connectionId}: ${action}`);
        return { id: task.id, status };
      }
    } catch (error) {
      logger.error(`[ProvisioningQueue] Failed to queue task: ${error.message}`);
      return null;
    }
  }

  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const db = getDb();
      let pendingTasks = [];

      if (global.dbAvailable) {
        const result = await db.query(
          `SELECT * FROM provisioning_queue 
           WHERE status IN ('pending', 'failed') AND attempts < max_attempts 
           ORDER BY created_at ASC LIMIT 50`
        );
        pendingTasks = result.rows;
      } else {
        pendingTasks = this.memoryQueue.filter(t => 
          (t.status === "pending" || t.status === "failed") && t.attempts < t.max_attempts
        ).slice(0, 50);
      }

      if (pendingTasks.length > 0) {
        logger.info(`[ProvisioningQueue] Processing ${pendingTasks.length} queued tasks`);
        // Import here to avoid circular dependencies
        const mikrotikProvisioning = require("./mikrotikProvisioning");

        for (const task of pendingTasks) {
          try {
            let result = null;
            const payload = typeof task.payload === "string" ? JSON.parse(task.payload) : task.payload;

            // Reconstruct a simplified subscription object for execution
            const subscription = {
              mikrotik_connection_id: task.connection_id,
              ...payload
            };

            if (task.action === "upsert_secret") {
              result = await mikrotikProvisioning.executeUpsertSecretDirectly(subscription);
            } else if (task.action === "suspend_secret") {
              result = await mikrotikProvisioning.executeSuspendSecretDirectly(subscription);
            } else if (task.action === "delete_secret") {
              result = await mikrotikProvisioning.executeDeleteSecretDirectly(subscription);
            }

            if (result && result.success) {
              await this.updateTaskStatus(task.id, "completed", null);
              logger.info(`[ProvisioningQueue] Task ${task.id} (${task.action}) completed successfully.`);
            } else {
              const errMsg = result ? result.error : "Unknown failure";
              await this.updateTaskStatus(task.id, "failed", errMsg, task.attempts + 1);
              logger.warn(`[ProvisioningQueue] Task ${task.id} failed: ${errMsg}`);
            }
          } catch (e) {
            await this.updateTaskStatus(task.id, "failed", e.message, task.attempts + 1);
            logger.error(`[ProvisioningQueue] Exception processing task ${task.id}: ${e.message}`);
          }
        }
      }
    } catch (error) {
      logger.error(`[ProvisioningQueue] Queue processing error: ${error.message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  async updateTaskStatus(taskId, status, errorMsg, newAttempts = null) {
    const db = getDb();
    if (global.dbAvailable) {
      if (newAttempts !== null) {
        await db.query(
          `UPDATE provisioning_queue SET status = $1, last_error = $2, attempts = $3, last_attempt_at = NOW() WHERE id = $4`,
          [status, errorMsg, newAttempts, taskId]
        );
      } else {
        await db.query(
          `UPDATE provisioning_queue SET status = $1, last_error = $2, last_attempt_at = NOW() WHERE id = $3`,
          [status, errorMsg, taskId]
        );
      }
    } else {
      const task = this.memoryQueue.find(t => t.id === taskId);
      if (task) {
        task.status = status;
        task.last_error = errorMsg;
        task.last_attempt_at = new Date().toISOString();
        if (newAttempts !== null) task.attempts = newAttempts;
      }
    }
  }
}

const queue = new ProvisioningQueue();

// Run queue processor every 5 minutes automatically
setInterval(() => {
  queue.processQueue();
}, 5 * 60 * 1000);

module.exports = queue;
