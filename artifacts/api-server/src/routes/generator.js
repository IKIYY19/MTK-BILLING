const express = require('express');
const router = express.Router();
const ScriptGenerator = require('../generators');
const db = global.db || require('../db/memory');

// Generate script from module configs
router.post('/generate', (req, res) => {
  try {
    const { modules, routeros_version } = req.body;
    
    const generator = new ScriptGenerator({}, routeros_version || 'v7');
    const script = generator.generate(modules);

    // Validate
    const validationErrors = [];
    for (const [moduleType, config] of Object.entries(modules)) {
      const errors = ScriptGenerator.validateModule(moduleType, config);
      validationErrors.push(...errors.map(e => ({ module: moduleType, error: e })));
    }

    res.json({
      script,
      validation: {
        valid: validationErrors.length === 0,
        errors: validationErrors,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate script from project
router.post('/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    // Get project
    const project = await db.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get modules
    const modules = await db.query(
      'SELECT * FROM project_modules WHERE project_id = $1 AND is_active = true',
      [projectId]
    );

    // Build config
    const moduleConfigs = {};
    modules.rows.forEach(mod => {
      moduleConfigs[mod.module_type] = mod.config_data;
    });

    const generator = new ScriptGenerator({}, project.rows[0].routeros_version);
    const script = generator.generate(moduleConfigs);

    // Save to history
    await db.query(
      `INSERT INTO script_history (project_id, module_types, full_script)
       VALUES ($1, $2, $3)`,
      [projectId, modules.rows.map(m => m.module_type), script]
    );

    res.json({ script, project: project.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
