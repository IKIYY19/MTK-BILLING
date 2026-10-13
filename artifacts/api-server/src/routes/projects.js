const express = require('express');
const router = express.Router();
const db = global.db || require('../db/memory');
const dbAvailable = global.dbAvailable !== undefined ? global.dbAvailable : false;
const { v4: uuidv4 } = require('uuid');

// Get all projects
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM projects ORDER BY updated_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single project
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM projects WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get project modules
    const modules = await db.query(
      'SELECT * FROM project_modules WHERE project_id = $1 ORDER BY created_at',
      [id]
    );

    res.json({
      ...result.rows[0],
      modules: modules.rows,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create project
router.post('/', async (req, res) => {
  try {
    const { name, description, routeros_version } = req.body;
    const id = uuidv4();

    const result = await db.query(
      'INSERT INTO projects (id, name, description, routeros_version) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, name, description || '', routeros_version || 'v7']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update project
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, routeros_version } = req.body;

    const result = await db.query(
      `UPDATE projects 
       SET name = COALESCE($1, name), 
           description = COALESCE($2, description),
           routeros_version = COALESCE($3, routeros_version),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING *`,
      [name, description, routeros_version, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete project
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM projects WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
