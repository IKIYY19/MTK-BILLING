const express = require("express");
const { getDb } = require("../db");
const router = express.Router();
const provisioningQueue = require("../services/provisioningQueue");



// Get all queued tasks
router.get("/", async (req, res) => {
  try {
    const db = getDb();
    let tasks = [];

    if (global.dbAvailable) {
      const result = await db.query(
        "SELECT * FROM provisioning_queue ORDER BY created_at DESC LIMIT 100"
      );
      tasks = result.rows;
    } else {
      tasks = [...provisioningQueue.memoryQueue].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      ).slice(0, 100);
    }

    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Retry a specific task
router.post("/:id/retry", async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();
    
    if (global.dbAvailable) {
      await db.query(
        "UPDATE provisioning_queue SET status = 'pending', attempts = 0 WHERE id = $1",
        [id]
      );
    } else {
      const task = provisioningQueue.memoryQueue.find(t => t.id === id);
      if (task) {
        task.status = "pending";
        task.attempts = 0;
      }
    }

    // Trigger processing asynchronously without awaiting it
    provisioningQueue.processQueue().catch(e => console.error(e));

    res.json({ success: true, message: "Task scheduled for immediate retry" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a task from queue
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();
    
    if (global.dbAvailable) {
      await db.query("DELETE FROM provisioning_queue WHERE id = $1", [id]);
    } else {
      const idx = provisioningQueue.memoryQueue.findIndex(t => t.id === id);
      if (idx !== -1) {
        provisioningQueue.memoryQueue.splice(idx, 1);
      }
    }

    res.json({ success: true, message: "Task deleted from queue" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
