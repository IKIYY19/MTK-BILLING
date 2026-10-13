const express = require('express');
const router = express.Router();
const db = global.db || require('../db/memory');
const { v4: uuidv4 } = require('uuid');

// Get all templates
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    let query = 'SELECT * FROM templates';
    const params = [];

    if (category) {
      query += ' WHERE category = $1';
      params.push(category);
    }

    query += ' ORDER BY name';
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single template
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM templates WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create template
router.post('/', async (req, res) => {
  try {
    const { name, description, category, content, is_public } = req.body;
    const id = uuidv4();

    const result = await db.query(
      `INSERT INTO templates (id, name, description, category, content, is_public)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, name, description, category, content, is_public || false]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update template
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, category, content, is_public } = req.body;

    const result = await db.query(
      `UPDATE templates 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           category = COALESCE($3, category),
           content = COALESCE($4, content),
           is_public = COALESCE($5, is_public),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 RETURNING *`,
      [name, description, category, content, is_public, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete template
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM templates WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
