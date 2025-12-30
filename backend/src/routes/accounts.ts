import { Router } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

const accountSchema = z.object({
  name: z.string().min(1),
  studioId: z.string().uuid(),
  shopUrl: z.string().optional(),
});

// Get all accounts for current user
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { studioId } = req.query;

    let query = 'SELECT sa.*, s.name as studio_name FROM shopee_accounts sa JOIN studios s ON sa.studio_id = s.id WHERE sa.user_id = $1';
    const params: any[] = [userId];

    if (studioId) {
      query += ' AND sa.studio_id = $2';
      params.push(studioId);
    }

    query += ' ORDER BY sa.created_at DESC';

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single account
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await pool.query(
      'SELECT sa.*, s.name as studio_name FROM shopee_accounts sa JOIN studios s ON sa.studio_id = s.id WHERE sa.id = $1 AND sa.user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get account error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create account
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { name, studioId, shopUrl } = accountSchema.parse(req.body);

    // Verify studio belongs to user
    const studioCheck = await pool.query(
      'SELECT id FROM studios WHERE id = $1 AND user_id = $2',
      [studioId, userId]
    );

    if (studioCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Studio not found' });
    }

    const result = await pool.query(
      'INSERT INTO shopee_accounts (user_id, studio_id, name, shop_url) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, studioId, name, shopUrl || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create account error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update account
router.put('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { name, studioId, shopUrl } = accountSchema.parse(req.body);

    const result = await pool.query(
      'UPDATE shopee_accounts SET name = $1, studio_id = $2, shop_url = $3, updated_at = NOW() WHERE id = $4 AND user_id = $5 RETURNING *',
      [name, studioId, shopUrl || null, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Update account error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete account
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM shopee_accounts WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
