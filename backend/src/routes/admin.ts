import { Router } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Apply auth and admin middleware to all routes
router.use(authMiddleware);
router.use(adminMiddleware);

// Get all users with profiles and roles
router.get('/users', async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.email, u.created_at, p.full_name, ur.role
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      ORDER BY u.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single user details
router.get('/users/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const userResult = await pool.query(`
      SELECT u.id, u.email, u.created_at, p.full_name, ur.role
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      WHERE u.id = $1
    `, [id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's studios count
    const studiosResult = await pool.query(
      'SELECT COUNT(*) FROM studios WHERE user_id = $1',
      [id]
    );

    // Get user's accounts count
    const accountsResult = await pool.query(
      'SELECT COUNT(*) FROM shopee_accounts WHERE user_id = $1',
      [id]
    );

    res.json({
      ...userResult.rows[0],
      studios_count: parseInt(studiosResult.rows[0].count),
      accounts_count: parseInt(accountsResult.rows[0].count),
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user role
router.put('/users/:id/role', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['admin', 'mitra'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Check if user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update or insert role
    await pool.query(`
      INSERT INTO user_roles (user_id, role) VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET role = $2
    `, [id, role]);

    res.json({ success: true });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user
router.delete('/users/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user!.id;

    // Prevent self-deletion
    if (id === adminId) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all studios (admin view)
router.get('/studios', async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, u.email as user_email, p.full_name as user_name,
        (SELECT COUNT(*) FROM shopee_accounts WHERE studio_id = s.id) as accounts_count
      FROM studios s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN profiles p ON s.user_id = p.user_id
      ORDER BY s.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Get studios error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all accounts (admin view)
router.get('/accounts', async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`
      SELECT sa.*, s.name as studio_name, u.email as user_email, p.full_name as user_name
      FROM shopee_accounts sa
      JOIN studios s ON sa.studio_id = s.id
      JOIN users u ON sa.user_id = u.id
      LEFT JOIN profiles p ON sa.user_id = p.user_id
      ORDER BY sa.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get dashboard stats
router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    const studiosCount = await pool.query('SELECT COUNT(*) FROM studios');
    const accountsCount = await pool.query('SELECT COUNT(*) FROM shopee_accounts');
    const productsCount = await pool.query('SELECT COUNT(*) FROM product_master');

    res.json({
      users: parseInt(usersCount.rows[0].count),
      studios: parseInt(studiosCount.rows[0].count),
      accounts: parseInt(accountsCount.rows[0].count),
      products: parseInt(productsCount.rows[0].count),
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
