const express = require('express');
const router = express.Router();
const db = global.dbAvailable ? global.db : require('../db/memory');
const { v4: uuidv4 } = require('uuid');

// ═══════════════════════════════════════
// TICKET CATEGORIES
// ═══════════════════════════════════════
router.get('/categories', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM ticket_categories ORDER BY name ASC');
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/categories', async (req, res) => {
  try {
    const { name, description, sla_hours, color } = req.body;

    // Validation
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO ticket_categories (id, name, description, sla_hours, color)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, name.trim(), description || null, sla_hours || 24, color || '#3b82f6']
    );
    res.status(201).json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════
// TICKETS
// ═══════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const { status = '', priority = '', assignee = '', customer_id = '' } = req.query;
    const where = [];
    const params = [];
    let paramIdx = 1;

    if (status && status !== 'all') {
      where.push(`t.status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }
    if (priority) {
      where.push(`t.priority = $${paramIdx}`);
      params.push(priority);
      paramIdx++;
    }
    if (assignee) {
      where.push(`t.assignee_id = $${paramIdx}`);
      params.push(assignee);
      paramIdx++;
    }
    if (customer_id) {
      where.push(`t.customer_id = $${paramIdx}`);
      params.push(customer_id);
      paramIdx++;
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const result = await db.query(
      `SELECT t.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
              u.name as assignee_name, tc.name as category_name, tc.color as category_color,
              (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = t.id) as reply_count,
              (SELECT MAX(created_at) FROM ticket_messages WHERE ticket_id = t.id) as last_reply_at
       FROM tickets t
       LEFT JOIN customers c ON c.id = t.customer_id
       LEFT JOIN users u ON u.id = t.assignee_id
       LEFT JOIN ticket_categories tc ON tc.id = t.category_id
       ${whereClause}
       ORDER BY t.created_at DESC`
    );
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════
// TICKET DASHBOARD STATS
// ═══════════════════════════════════════
router.get('/dashboard/stats', async (req, res) => {
  try {
    const [openRes, inProgressRes, resolvedRes, overdueRes, avgResponseRes] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM tickets WHERE status = 'open'`),
      db.query(`SELECT COUNT(*) FROM tickets WHERE status = 'in_progress'`),
      db.query(`SELECT COUNT(*) FROM tickets WHERE status = 'resolved'`),
      db.query(`SELECT COUNT(*) FROM tickets WHERE status != 'closed' AND sla_deadline < NOW()`),
      db.query(`SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (tm.created_at - t.created_at))/3600), 0) as avg_hours
                FROM tickets t
                JOIN ticket_messages tm ON tm.ticket_id = t.id AND tm.user_id IS NOT NULL
                WHERE tm.created_at > NOW() - INTERVAL '30 days'`),
    ]);

    res.json({
      open: parseInt(openRes.rows[0].count),
      in_progress: parseInt(inProgressRes.rows[0].count),
      resolved: parseInt(resolvedRes.rows[0].count),
      overdue: parseInt(overdueRes.rows[0].count),
      avg_response_hours: parseFloat(avgResponseRes.rows[0].avg_hours).toFixed(1),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════
// TECHNICIANS & STAFF (Users who can be assigned tickets)
// ═══════════════════════════════════════
router.get('/technicians', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, email, phone, role,
              (SELECT COUNT(*) FROM tickets WHERE assignee_id = users.id AND status != 'closed') as active_tickets
       FROM users WHERE is_active = true ORDER BY name ASC`
    );
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
              u.name as assignee_name, tc.name as category_name, tc.description as category_description, tc.color as category_color, tc.sla_hours
       FROM tickets t
       LEFT JOIN customers c ON c.id = t.customer_id
       LEFT JOIN users u ON u.id = t.assignee_id
       LEFT JOIN ticket_categories tc ON tc.id = t.category_id
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {return res.status(404).json({ error: 'Ticket not found' });}
    const ticket = result.rows[0];

    // Get messages
    const messages = await db.query(
      `SELECT tm.*, u.name as author_name, u.role as author_role
       FROM ticket_messages tm
       LEFT JOIN users u ON u.id = tm.user_id
       WHERE tm.ticket_id = $1
       ORDER BY tm.created_at ASC`,
      [req.params.id]
    );

    // Get attachments
    const attachments = await db.query(
      `SELECT * FROM ticket_attachments WHERE ticket_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );

    res.json({ ...ticket, messages: messages.rows, attachments: attachments.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { customer_id, category_id, subject, description, priority, assignee_id } = req.body;

    // Validation
    if (!subject || subject.trim() === '') {
      return res.status(400).json({ error: 'Subject is required' });
    }
    if (!description || description.trim() === '') {
      return res.status(400).json({ error: 'Description is required' });
    }

    const id = uuidv4();
    const ticketNumber = `TKT-${Date.now().toString().slice(-8)}`;

    const result = await db.query(
      `INSERT INTO tickets (id, ticket_number, customer_id, category_id, subject, description, priority, status, assignee_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8) RETURNING *`,
      [id, ticketNumber, customer_id || null, category_id || null, subject.trim(), description.trim(), priority || 'medium', assignee_id || null]
    );

    // Auto-message from customer
    await db.query(
      `INSERT INTO ticket_messages (ticket_id, user_id, message, is_internal) VALUES ($1, NULL, $2, false)`,
      [id, description.trim()]
    );

    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error('Ticket creation error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { status, priority, assignee_id, category_id, subject } = req.body;
    const result = await db.query(
      `UPDATE tickets SET status = COALESCE($1, status), priority = COALESCE($2, priority),
       assignee_id = COALESCE($3, assignee_id), category_id = COALESCE($4, category_id),
       subject = COALESCE($5, subject)
       WHERE id = $6 RETURNING *`,
      [status, priority, assignee_id, category_id, subject, req.params.id]
    );
    if (result.rows.length === 0) {return res.status(404).json({ error: 'Ticket not found' });}
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE TICKET
router.delete('/:id', async (req, res) => {
  try {
    const ticketId = req.params.id;

    // Delete related messages and attachments first
    await db.query('DELETE FROM ticket_messages WHERE ticket_id = $1', [ticketId]);
    await db.query('DELETE FROM ticket_attachments WHERE ticket_id = $1', [ticketId]);

    // Delete the ticket
    const result = await db.query('DELETE FROM tickets WHERE id = $1 RETURNING id, ticket_number', [ticketId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json({ message: 'Ticket deleted successfully', ticket: result.rows[0] });
  } catch (e) {
    console.error('Delete ticket error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// TICKET MESSAGES (Replies)
// ═══════════════════════════════════════
router.post('/:id/messages', async (req, res) => {
  try {
    const { user_id, message, is_internal, attachments } = req.body;
    const id = uuidv4();

    await db.query(
      `INSERT INTO ticket_messages (id, ticket_id, user_id, message, is_internal)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, req.params.id, user_id, message, is_internal || false]
    );

    // Update ticket status to in_progress only if it's currently open
    // If it's resolved or closed, keep it as is
    await db.query(
      `UPDATE tickets SET status = CASE 
         WHEN status = 'open' THEN 'in_progress' 
         ELSE status 
       END, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [req.params.id]
    );

    res.status(201).json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════
module.exports = router;
