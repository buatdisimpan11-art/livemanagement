import { Router } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

const studioSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

// Get all studios for current user
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    const result = await pool.query(
      'SELECT * FROM studios WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get studios error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single studio
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM studios WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get studio error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create studio
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { name, description } = studioSchema.parse(req.body);

    const result = await pool.query(
      'INSERT INTO studios (user_id, name, description) VALUES ($1, $2, $3) RETURNING *',
      [userId, name, description || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create studio error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update studio
router.put('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { name, description } = studioSchema.parse(req.body);

    const result = await pool.query(
      'UPDATE studios SET name = $1, description = $2, updated_at = NOW() WHERE id = $3 AND user_id = $4 RETURNING *',
      [name, description || null, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Update studio error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete studio
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM studios WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete studio error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
