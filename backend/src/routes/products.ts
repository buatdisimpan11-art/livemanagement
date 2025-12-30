import { Router } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

const productSchema = z.object({
  productName: z.string().min(1),
  accountId: z.string().uuid().optional(),
  affiliateLink: z.string().optional(),
  category: z.string().optional(),
});

const bulkProductSchema = z.object({
  accountId: z.string().uuid(),
  products: z.array(z.object({
    productName: z.string().min(1),
    affiliateLink: z.string().optional(),
    category: z.string().optional(),
  })),
});

// Get all products for current user
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { accountId } = req.query;

    let query = 'SELECT pm.*, sa.name as account_name FROM product_master pm LEFT JOIN shopee_accounts sa ON pm.account_id = sa.id WHERE pm.user_id = $1';
    const params: any[] = [userId];

    if (accountId) {
      query += ' AND pm.account_id = $2';
      params.push(accountId);
    }

    query += ' ORDER BY pm.created_at DESC';

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create single product
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { productName, accountId, affiliateLink, category } = productSchema.parse(req.body);

    const result = await pool.query(
      'INSERT INTO product_master (user_id, account_id, product_name, affiliate_link, category) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, accountId || null, productName, affiliateLink || null, category || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk create products
router.post('/bulk', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { accountId, products } = bulkProductSchema.parse(req.body);

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

      const insertedProducts = [];
      for (const product of products) {
        const result = await client.query(
          'INSERT INTO product_master (user_id, account_id, product_name, affiliate_link, category) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [userId, accountId, product.productName, product.affiliateLink || null, product.category || null]
        );
        insertedProducts.push(result.rows[0]);
      }

      await client.query('COMMIT');
      res.status(201).json(insertedProducts);
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
    console.error('Bulk create products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update product
router.put('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { productName, accountId, affiliateLink, category } = productSchema.parse(req.body);

    const result = await pool.query(
      'UPDATE product_master SET product_name = $1, account_id = $2, affiliate_link = $3, category = $4 WHERE id = $5 AND user_id = $6 RETURNING *',
      [productName, accountId || null, affiliateLink || null, category || null, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete product
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM product_master WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete all products for an account
router.delete('/account/:accountId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { accountId } = req.params;

    await pool.query(
      'DELETE FROM product_master WHERE account_id = $1 AND user_id = $2',
      [accountId, userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Delete account products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
