/**
 * User Management API
 * Admin-only endpoints for managing users and roles
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Lazy db getter & proxy
const getDb = () => global.dbAvailable ? global.db : require('../db/memory');
const db = { query: (...args) => getDb().query(...args) };

// Valid roles
const VALID_ROLES = ['admin', 'staff', 'technician', 'reseller', 'customer', 'customer_care', 'sales_team'];

// ─── LIST ALL USERS ───
router.get('/', async (req, res) => {
  try {
    const { role, status, search } = req.query;
    let query = 'SELECT id, email, name, role, is_active, last_login_at, last_seen, is_online, created_at FROM users WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (role) {
      query += ` AND role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }

    if (status) {
      const isActive = status === 'active';
      query += ` AND is_active = $${paramIndex}`;
      params.push(isActive);
      paramIndex++;
    }

    if (search) {
      query += ` AND (name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ' ORDER BY created_at DESC';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (e) {
    console.error('List users error:', e.message);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// ─── GET USER STATISTICS ───
router.get('/stats', async (req, res) => {
  try {
    const totalResult = await db.query('SELECT COUNT(*) as total FROM users');
    const activeResult = await db.query('SELECT COUNT(*) as total FROM users WHERE is_active = true');
    const roleStatsResult = await db.query('SELECT role, COUNT(*) as count FROM users GROUP BY role');

    const roleStats = {};
    roleStatsResult.rows.forEach(row => {
      roleStats[row.role] = parseInt(row.count);
    });

    res.json({
      total: parseInt(totalResult.rows[0].total),
      active: parseInt(activeResult.rows[0].total),
      disabled: parseInt(totalResult.rows[0].total) - parseInt(activeResult.rows[0].total),
      byRole: roleStats,
    });
  } catch (e) {
    console.error('User stats error:', e.message);
    res.status(500).json({ error: 'Failed to get user statistics' });
  }
});

// ─── GET USER BY ID ───
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, name, role, is_active, last_login_at, last_seen, is_online, created_at FROM users WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (e) {
    console.error('Get user error:', e.message);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// ─── CREATE USER ───
router.post('/', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password, and name are required' });
    }

    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
    }

    // Check if email already exists
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, name, role, is_active, created_at`,
      [uuidv4(), email, hash, name, role, true]
    );

    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error('Create user error:', e.message);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// ─── UPDATE USER ───
router.put('/:id', async (req, res) => {
  try {
    const { name, role, is_active } = req.body;
    const userId = req.params.id;

    // Validate role if provided
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
    }

    // Check if user exists
    const existing = await db.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Build update query dynamically
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      params.push(name);
      paramIndex++;
    }

    if (role !== undefined) {
      updates.push(`role = $${paramIndex}`);
      params.push(role);
      paramIndex++;
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      params.push(is_active);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(userId);

    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}
                   RETURNING id, email, name, role, is_active, last_login_at, updated_at`;

    const result = await db.query(query, params);
    res.json(result.rows[0]);
  } catch (e) {
    console.error('Update user error:', e.message);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ─── DELETE (DISABLE) USER ───
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    const result = await db.query(
      'UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, email, name',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User disabled successfully', user: result.rows[0] });
  } catch (e) {
    console.error('Disable user error:', e.message);
    res.status(500).json({ error: 'Failed to disable user' });
  }
});

// ─── PERMANENTLY DELETE USER ───
router.delete('/:id/permanent', async (req, res) => {
  try {
    const userId = req.params.id;

    const result = await db.query(
      'DELETE FROM users WHERE id = $1 RETURNING id, email, name',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully', user: result.rows[0] });
  } catch (e) {
    console.error('Delete user error:', e.message);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ─── ENABLE USER ───
router.post('/:id/enable', async (req, res) => {
  try {
    const userId = req.params.id;

    const result = await db.query(
      'UPDATE users SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, email, name, is_active',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User enabled successfully', user: result.rows[0] });
  } catch (e) {
    console.error('Enable user error:', e.message);
    res.status(500).json({ error: 'Failed to enable user' });
  }
});

// ─── RESET PASSWORD ───
router.post('/:id/reset-password', async (req, res) => {
  try {
    const { new_password } = req.body;
    const userId = req.params.id;

    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const hash = await bcrypt.hash(new_password, 10);
    const result = await db.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, email, name',
      [hash, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Password reset successfully', user: result.rows[0] });
  } catch (e) {
    console.error('Reset password error:', e.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ─── HEARTBEAT (update user activity) ───
router.post('/heartbeat', async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = getDb();
    const now = new Date();

    await db.query(
      `UPDATE users 
       SET last_seen = $1, is_online = true 
       WHERE id = $2`,
      [now.toISOString(), req.user.id]
    );

    res.json({ success: true, last_seen: now.toISOString() });
  } catch (e) {
    console.error('Heartbeat error:', e.message);
    res.status(500).json({ error: 'Failed to update activity' });
  }
});

module.exports = router;
