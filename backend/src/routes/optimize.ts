import { Router } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Get active rotation
router.get('/rotation', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { studioId, accountId } = req.query;

    let query = `
      SELECT ar.*, sa.name as account_name, s.name as studio_name 
      FROM active_rotation ar 
      JOIN shopee_accounts sa ON ar.account_id = sa.id 
      JOIN studios s ON ar.studio_id = s.id 
      WHERE ar.user_id = $1
    `;
    const params: any[] = [userId];
    let paramIndex = 2;

    if (studioId) {
      query += ` AND ar.studio_id = $${paramIndex}`;
      params.push(studioId);
      paramIndex++;
    }

    if (accountId) {
      query += ` AND ar.account_id = $${paramIndex}`;
      params.push(accountId);
      paramIndex++;
    }

    query += ' ORDER BY ar.product_name';

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Get rotation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Set active rotation
router.post('/rotation', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { studioId, accountId, products } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete existing rotation for this account
      await client.query(
        'DELETE FROM active_rotation WHERE user_id = $1 AND account_id = $2',
        [userId, accountId]
      );

      // Insert new rotation
      for (const productName of products) {
        await client.query(
          'INSERT INTO active_rotation (user_id, studio_id, account_id, product_name) VALUES ($1, $2, $3, $4)',
          [userId, studioId, accountId, productName]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Set rotation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Lock/unlock product in rotation
router.post('/rotation/:id/lock', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { locked } = req.body;

    const result = await pool.query(
      'UPDATE active_rotation SET locked_at = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [locked ? new Date().toISOString() : null, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rotation item not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Lock rotation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Run optimization
router.post('/run', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { studioId, accountId, productsToAdd, productsToRemove } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Remove products (that are not locked)
      if (productsToRemove && productsToRemove.length > 0) {
        for (const productName of productsToRemove) {
          await client.query(
            'DELETE FROM active_rotation WHERE user_id = $1 AND account_id = $2 AND product_name = $3 AND locked_at IS NULL',
            [userId, accountId, productName]
          );
        }
      }

      // Add new products
      if (productsToAdd && productsToAdd.length > 0) {
        for (const productName of productsToAdd) {
          // Check if already exists
          const existing = await client.query(
            'SELECT id FROM active_rotation WHERE user_id = $1 AND account_id = $2 AND product_name = $3',
            [userId, accountId, productName]
          );

          if (existing.rows.length === 0) {
            await client.query(
              'INSERT INTO active_rotation (user_id, studio_id, account_id, product_name) VALUES ($1, $2, $3, $4)',
              [userId, studioId, accountId, productName]
            );
          }
        }
      }

      // Record optimization history
      await client.query(
        'INSERT INTO optimization_history (user_id, studio_id, account_id, products_added, products_removed) VALUES ($1, $2, $3, $4, $5)',
        [userId, studioId, accountId, productsToAdd?.length || 0, productsToRemove?.length || 0]
      );

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Run optimization error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get optimization history
router.get('/history', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { studioId, accountId, limit = 50 } = req.query;

    let query = `
      SELECT oh.*, sa.name as account_name, s.name as studio_name 
      FROM optimization_history oh 
      JOIN shopee_accounts sa ON oh.account_id = sa.id 
      JOIN studios s ON oh.studio_id = s.id 
      WHERE oh.user_id = $1
    `;
    const params: any[] = [userId];
    let paramIndex = 2;

    if (studioId) {
      query += ` AND oh.studio_id = $${paramIndex}`;
      params.push(studioId);
      paramIndex++;
    }

    if (accountId) {
      query += ` AND oh.account_id = $${paramIndex}`;
      params.push(accountId);
      paramIndex++;
    }

    query += ` ORDER BY oh.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
