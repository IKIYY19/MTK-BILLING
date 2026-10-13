/**
 * Captive Portal Builder
 * Create and manage hotspot captive portal pages and configurations
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const captiveHotspot = require('../services/captiveHotspot');
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getDb = () => global.dbAvailable ? global.db : require('../db/memory');

router.get('/hotspot-sessions', async (req, res) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({
        error: 'Select a tenant before reading captive hotspot sessions.',
      });
    }
    const requestedStatus = String(req.query.status || 'all');
    const validStatuses = new Set([
      'all', 'initiating', 'pending', 'payment_confirmed', 'provisioning',
      'authorization_failed', 'authorized', 'expiration_pending',
      'expiration_cleanup_failed', 'expired', 'failed', 'payment_review',
    ]);
    if (!validStatuses.has(requestedStatus)) {
      return res.status(400).json({ error: 'The requested session status is invalid.' });
    }
    const search = String(req.query.search || '').trim().slice(0, 100);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 25, 1), 100);
    const offset = Math.min(Math.max(Number.parseInt(req.query.offset, 10) || 0, 0), 1000000);
    const result = await captiveHotspot.listSessions({
      tenantId: req.tenantId,
      status: requestedStatus,
      search,
      limit,
      offset,
    });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/hotspot-sessions/:id/retry-authorization', async (req, res) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({
        error: 'Select a tenant before retrying hotspot authorization.',
      });
    }
    if (!UUID_PATTERN.test(req.params.id)) {
      return res.status(400).json({ error: 'The hotspot session identifier is invalid.' });
    }
    const session = await captiveHotspot.findSessionForAdminRetry(
      req.params.id,
      req.tenantId,
    );
    if (!session) {
      return res.status(404).json({ error: 'The hotspot session was not found.' });
    }
    if (!['payment_confirmed', 'authorization_failed'].includes(session.status)) {
      return res.status(409).json({
        error: 'Only paid sessions awaiting router authorization can be retried.',
      });
    }
    const updated = await captiveHotspot.authorizePaidSession(session);
    res.set('Cache-Control', 'no-store');
    return res.json({
      status: updated?.status || 'authorization_failed',
      error: updated?.error_message || null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/hotspot-events', async (req, res) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({
        error: 'Select a tenant before reading captive hotspot events.',
      });
    }
    const sessionId = req.query.session_id ? String(req.query.session_id) : null;
    if (sessionId && !UUID_PATTERN.test(sessionId)) {
      return res.status(400).json({ error: 'The hotspot session identifier is invalid.' });
    }
    const events = await captiveHotspot.listEvents(
      req.tenantId,
      req.query.limit,
      sessionId,
    );
    res.set('Cache-Control', 'no-store');
    return res.json({ events });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── PORTAL TEMPLATES ───

// Get all portal templates
router.get('/templates', async (req, res) => {
  try {
    if (!global.db) {
      return res.json([]);
    }

    const result = await getDb().query(
      `SELECT pt.*,
        (SELECT COUNT(*) FROM mikrotik_connections WHERE captive_portal_template_id = pt.id) as usage_count
       FROM captive_portal_templates pt
       ORDER BY pt.name ASC`
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get portal template by ID
router.get('/templates/:id', async (req, res) => {
  try {
    const result = await getDb().query(
      'SELECT * FROM captive_portal_templates WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Portal template not found' });
    }
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create portal template
router.post('/templates', async (req, res) => {
  try {
    const {
      name,
      description,
      theme,
      logo_url,
      background_image,
      primary_color,
      secondary_color,
      custom_css,
      custom_html,
      login_method,
      show_pricing,
      show_terms,
      terms_text,
      welcome_message
    } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    if (!global.db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const id = uuidv4();
    const result = await getDb().query(
      `INSERT INTO captive_portal_templates (id, name, description, theme, logo_url, background_image, primary_color, secondary_color, custom_css, custom_html, login_method, show_pricing, show_terms, terms_text, welcome_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [
        id,
        name,
        description || '',
        theme || 'default',
        logo_url || '',
        background_image || '',
        primary_color || '#3b82f6',
        secondary_color || '#1e40af',
        custom_css || '',
        custom_html || '',
        login_method || 'voucher',
        show_pricing || false,
        show_terms || false,
        terms_text || '',
        welcome_message || 'Welcome to our WiFi'
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error('Portal template creation error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Update portal template
router.put('/templates/:id', async (req, res) => {
  try {
    const {
      name,
      description,
      theme,
      logo_url,
      background_image,
      primary_color,
      secondary_color,
      custom_css,
      custom_html,
      login_method,
      show_pricing,
      show_terms,
      terms_text,
      welcome_message
    } = req.body || {};

    if (!global.db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const result = await getDb().query(
      `UPDATE captive_portal_templates
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           theme = COALESCE($3, theme),
           logo_url = COALESCE($4, logo_url),
           background_image = COALESCE($5, background_image),
           primary_color = COALESCE($6, primary_color),
           secondary_color = COALESCE($7, secondary_color),
           custom_css = COALESCE($8, custom_css),
           custom_html = COALESCE($9, custom_html),
           login_method = COALESCE($10, login_method),
           show_pricing = COALESCE($11, show_pricing),
           show_terms = COALESCE($12, show_terms),
           terms_text = COALESCE($13, terms_text),
           welcome_message = COALESCE($14, welcome_message),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $15 RETURNING *`,
      [
        name,
        description,
        theme,
        logo_url,
        background_image,
        primary_color,
        secondary_color,
        custom_css,
        custom_html,
        login_method,
        show_pricing,
        show_terms,
        terms_text,
        welcome_message,
        req.params.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Portal template not found' });
    }

    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete portal template
router.delete('/templates/:id', async (req, res) => {
  try {
    if (!global.db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    // Check if template is in use
    const checkResult = await getDb().query(
      'SELECT COUNT(*) FROM mikrotik_connections WHERE captive_portal_template_id = $1',
      [req.params.id]
    );

    if (parseInt(checkResult.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete portal template that is in use' });
    }

    const result = await getDb().query(
      'DELETE FROM captive_portal_templates WHERE id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Portal template not found' });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Generate portal HTML for a template
router.get('/templates/:id/preview', async (req, res) => {
  try {
    const result = await getDb().query(
      'SELECT * FROM captive_portal_templates WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Portal template not found' });
    }

    const template = result.rows[0];
    const html = generatePortalHTML(template);

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Generate MikroTik hotspot login page script
router.get('/templates/:id/mikrotik-script', async (req, res) => {
  try {
    const result = await getDb().query(
      'SELECT * FROM captive_portal_templates WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Portal template not found' });
    }

    const template = result.rows[0];
    const script = generateMikrotikScript(template);

    res.set('Content-Type', 'text/plain');
    res.set('Content-Disposition', 'attachment; filename="hotspot-login.rsc"');
    res.send(script);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Helper function to generate portal HTML
function generatePortalHTML(template) {
  const colors = {
    primary: template.primary_color || '#3b82f6',
    secondary: template.secondary_color || '#1e40af'
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hotspot Login</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${template.background_image ? `url(${template.background_image}) center/cover` : '#f3f4f6'};
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .login-container {
      background: white;
      padding: 2rem;
      border-radius: 1rem;
      box-shadow: 0 10px 25px rgba(0,0,0,0.1);
      max-width: 400px;
      width: 90%;
    }
    .logo {
      text-align: center;
      margin-bottom: 1.5rem;
    }
    .logo img {
      max-width: 120px;
      max-height: 60px;
    }
    h1 {
      text-align: center;
      color: #1f2937;
      margin-bottom: 0.5rem;
    }
    .welcome {
      text-align: center;
      color: #6b7280;
      margin-bottom: 1.5rem;
    }
    .form-group {
      margin-bottom: 1rem;
    }
    label {
      display: block;
      margin-bottom: 0.5rem;
      color: #374151;
      font-weight: 500;
    }
    input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 0.5rem;
      font-size: 1rem;
    }
    button {
      width: 100%;
      padding: 0.75rem;
      background: ${colors.primary};
      color: white;
      border: none;
      border-radius: 0.5rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover {
      background: ${colors.secondary};
    }
    .terms {
      margin-top: 1rem;
      font-size: 0.875rem;
      color: #6b7280;
    }
    ${template.custom_css || ''}
  </style>
</head>
<body>
  <div class="login-container">
    ${template.logo_url ? `<div class="logo"><img src="${template.logo_url}" alt="Logo"></div>` : ''}
    <h1>WiFi Login</h1>
    <p class="welcome">${template.welcome_message || 'Welcome to our WiFi'}</p>
    <form action="$(link-login-only)" method="post">
      <input type="hidden" name="dst" value="$(link-orig)">
      <input type="hidden" name="popup" value="true">
      <div class="form-group">
        <label>Username / Voucher</label>
        <input type="text" name="username" required>
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" name="password">
      </div>
      <button type="submit">Login</button>
      ${template.show_terms ? `<div class="terms">${template.terms_text || 'By logging in, you agree to our terms of service.'}</div>` : ''}
    </form>
  </div>
  ${template.custom_html || ''}
</body>
</html>`;
}

// Helper function to generate MikroTik script
function generateMikrotikScript(template) {
  return `# Hotspot Login Page Configuration
# Generated by MikroTik Billing System

/ip hotspot profile set default
  login-option=cookie
  http-cookie-lifetime=1d

/ip hotspot walled-garden
  add dst-host=www.google.com

# Copy this HTML to your hotspot login.html file
# or use the preview endpoint to get the full HTML`;
}

module.exports = router;
