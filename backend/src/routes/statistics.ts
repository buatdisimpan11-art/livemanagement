import { Router } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

const statisticSchema = z.object({
  studioId: z.string().uuid(),
  accountId: z.string().uuid(),
  productName: z.string().min(1),
  dataDate: z.string(),
  ranking: z.number().optional(),
  clicks: z.number().optional(),
  addToCart: z.number().optional(),
  ordersCreated: z.number().optional(),
  ordersShipped: z.number().optional(),
  productsSoldCreated: z.number().optional(),
  productsSoldShipped: z.number().optional(),
  gmvCreated: z.number().optional(),
  gmvShipped: z.number().optional(),
});

const bulkStatisticsSchema = z.object({
  studioId: z.string().uuid(),
  accountId: z.string().uuid(),
  statistics: z.array(z.object({
    productName: z.string().min(1),
    dataDate: z.string(),
    ranking: z.number().optional(),
    clicks: z.number().optional(),
    addToCart: z.number().optional(),
    ordersCreated: z.number().optional(),
    ordersShipped: z.number().optional(),
    productsSoldCreated: z.number().optional(),
    productsSoldShipped: z.number().optional(),
    gmvCreated: z.number().optional(),
    gmvShipped: z.number().optional(),
  })),
});

// Get statistics with filters
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { studioId, accountId, startDate, endDate } = req.query;

    let query = `
      SELECT ps.*, sa.name as account_name, s.name as studio_name 
      FROM product_statistics ps 
      JOIN shopee_accounts sa ON ps.account_id = sa.id 
      JOIN studios s ON ps.studio_id = s.id 
      WHERE ps.user_id = $1
    `;
    const params: any[] = [userId];
    let paramIndex = 2;

    if (studioId) {
      query += ` AND ps.studio_id = $${paramIndex}`;
      params.push(studioId);
      paramIndex++;
    }

    if (accountId) {
      query += ` AND ps.account_id = $${paramIndex}`;
      params.push(accountId);
      paramIndex++;
    }

    if (startDate) {
      query += ` AND ps.data_date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND ps.data_date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query += ' ORDER BY ps.data_date DESC, ps.ranking ASC';

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get unique upload dates
router.get('/dates', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { accountId } = req.query;

    let query = 'SELECT DISTINCT data_date FROM product_statistics WHERE user_id = $1';
    const params: any[] = [userId];

    if (accountId) {
      query += ' AND account_id = $2';
      params.push(accountId);
    }

    query += ' ORDER BY data_date DESC';

    const result = await pool.query(query, params);

    res.json(result.rows.map(r => r.data_date));
  } catch (error) {
    console.error('Get dates error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk insert statistics (from CSV)
router.post('/bulk', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { studioId, accountId, statistics } = bulkStatisticsSchema.parse(req.body);

    // Verify account belongs to user
    const accountCheck = await pool.query(
      'SELECT id FROM shopee_accounts WHERE id = $1 AND user_id = $2',
      [accountId, userId]
    );

    if (accountCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Account not found' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete existing data for same date(s)
      const dates = [...new Set(statistics.map(s => s.dataDate))];
      for (const date of dates) {
        await client.query(
          'DELETE FROM product_statistics WHERE user_id = $1 AND account_id = $2 AND data_date = $3',
          [userId, accountId, date]
        );
      }

      // Insert new statistics
      const insertedStats = [];
      for (const stat of statistics) {
        const result = await client.query(
          `INSERT INTO product_statistics (
            user_id, studio_id, account_id, product_name, data_date,
            ranking, clicks, add_to_cart, orders_created, orders_shipped,
            products_sold_created, products_sold_shipped, gmv_created, gmv_shipped
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
          [
            userId, studioId, accountId, stat.productName, stat.dataDate,
            stat.ranking || null, stat.clicks || 0, stat.addToCart || 0,
            stat.ordersCreated || 0, stat.ordersShipped || 0,
            stat.productsSoldCreated || 0, stat.productsSoldShipped || 0,
            stat.gmvCreated || 0, stat.gmvShipped || 0
          ]
        );
        insertedStats.push(result.rows[0]);
      }

      await client.query('COMMIT');
      res.status(201).json({ count: insertedStats.length });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Bulk insert statistics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete statistics for a date
router.delete('/date/:date', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { date } = req.params;
    const { accountId } = req.query;

    let query = 'DELETE FROM product_statistics WHERE user_id = $1 AND data_date = $2';
    const params: any[] = [userId, date];

    if (accountId) {
      query += ' AND account_id = $3';
      params.push(accountId);
    }

    await pool.query(query, params);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete statistics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
