const express = require('express');
const router = express.Router();
const db = global.db || require('../db/memory');
const { v4: uuidv4 } = require('uuid');

// Get all modules for a project
router.get('/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const result = await db.query(
      'SELECT * FROM project_modules WHERE project_id = $1 ORDER BY module_type',
      [projectId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create or update module
router.post('/', async (req, res) => {
  try {
    const { project_id, module_type, config_data, generated_script } = req.body;
    const id = uuidv4();

    // Check if module exists
    const existing = await db.query(
      'SELECT id FROM project_modules WHERE project_id = $1 AND module_type = $2',
      [project_id, module_type]
    );

    let result;
    if (existing.rows.length > 0) {
      // Update existing
      result = await db.query(
        `UPDATE project_modules 
         SET config_data = $1, 
             generated_script = COALESCE($2, generated_script),
             updated_at = CURRENT_TIMESTAMP
         WHERE project_id = $3 AND module_type = $4 RETURNING *`,
        [config_data, generated_script, project_id, module_type]
      );
    } else {
      // Create new
      result = await db.query(
        `INSERT INTO project_modules (id, project_id, module_type, config_data, generated_script)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [id, project_id, module_type, config_data, generated_script]
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete module
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'DELETE FROM project_modules WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Module not found' });
    }

    res.json({ message: 'Module deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
