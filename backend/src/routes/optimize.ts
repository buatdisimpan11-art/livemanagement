import { Router } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Schema for product UID validation
const productUidSchema = z.string().min(1, 'Product UID is required');

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

    query += ' ORDER BY ar.product_uid, ar.product_name';

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Get rotation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Set active rotation - now uses product_uid
router.post('/rotation', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { studioId, accountId, products } = req.body;

    // products should be array of { product_uid, product_name }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check for product_uid conflicts in same studio (different account)
      for (const product of products) {
        if (!product.product_uid) continue;
        
        const conflict = await client.query(
          `SELECT ar.id, sa.name as account_name 
           FROM active_rotation ar 
           JOIN shopee_accounts sa ON ar.account_id = sa.id
           WHERE ar.studio_id = $1 AND ar.product_uid = $2 AND ar.account_id != $3 AND ar.user_id = $4`,
          [studioId, product.product_uid, accountId, userId]
        );

        if (conflict.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            error: `Product UID ${product.product_uid} sudah di-assign ke akun "${conflict.rows[0].account_name}" dalam studio ini` 
          });
        }
      }

      // Delete existing rotation for this account
      await client.query(
        'DELETE FROM active_rotation WHERE user_id = $1 AND account_id = $2',
        [userId, accountId]
      );

      // Insert new rotation with product_uid
      for (const product of products) {
        const productName = typeof product === 'string' ? product : product.product_name;
        const productUid = typeof product === 'string' ? null : product.product_uid;
        
        await client.query(
          'INSERT INTO active_rotation (user_id, studio_id, account_id, product_name, product_uid) VALUES ($1, $2, $3, $4, $5)',
          [userId, studioId, accountId, productName, productUid]
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

// Run optimization - now uses product_uid
router.post('/run', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { studioId, accountId, productsToAdd, productsToRemove } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Remove products (that are not locked) - supports both product_uid and product_name
      if (productsToRemove && productsToRemove.length > 0) {
        for (const product of productsToRemove) {
          const productUid = typeof product === 'string' ? null : product.product_uid;
          const productName = typeof product === 'string' ? product : product.product_name;

          if (productUid) {
            await client.query(
              'DELETE FROM active_rotation WHERE user_id = $1 AND account_id = $2 AND product_uid = $3 AND locked_at IS NULL',
              [userId, accountId, productUid]
            );
          } else {
            await client.query(
              'DELETE FROM active_rotation WHERE user_id = $1 AND account_id = $2 AND product_name = $3 AND locked_at IS NULL',
              [userId, accountId, productName]
            );
          }
        }
      }

      // Add new products - with conflict check
      if (productsToAdd && productsToAdd.length > 0) {
        for (const product of productsToAdd) {
          const productUid = typeof product === 'string' ? null : product.product_uid;
          const productName = typeof product === 'string' ? product : product.product_name;

          // Check for conflict if product_uid exists
          if (productUid) {
            const conflict = await client.query(
              `SELECT ar.id FROM active_rotation ar 
               WHERE ar.studio_id = $1 AND ar.product_uid = $2 AND ar.account_id != $3 AND ar.user_id = $4`,
              [studioId, productUid, accountId, userId]
            );

            if (conflict.rows.length > 0) {
              // Skip this product, it's already assigned elsewhere in the studio
              continue;
            }

            // Check if already exists in current account
            const existing = await client.query(
              'SELECT id FROM active_rotation WHERE user_id = $1 AND account_id = $2 AND product_uid = $3',
              [userId, accountId, productUid]
            );

            if (existing.rows.length === 0) {
              await client.query(
                'INSERT INTO active_rotation (user_id, studio_id, account_id, product_name, product_uid) VALUES ($1, $2, $3, $4, $5)',
                [userId, studioId, accountId, productName, productUid]
              );
            }
          } else {
            // Fallback to product_name based check
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

// Analyze dead products and suggest replacements
router.post('/analyze-dead', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { studioId, accountId, daysThreshold = 7, minClicks = 10 } = req.body;

    // Get products in active rotation with their recent stats
    const query = `
      WITH recent_stats AS (
        SELECT 
          COALESCE(ps.product_uid, ps.product_name) as product_key,
          ps.product_name,
          ps.product_uid,
          SUM(ps.clicks) as total_clicks,
          SUM(ps.add_to_cart) as total_cart,
          SUM(ps.orders_created) as total_orders,
          SUM(ps.gmv_created) as total_gmv,
          COUNT(DISTINCT ps.data_date) as days_with_data,
          MAX(ps.data_date) as last_activity
        FROM product_statistics ps
        WHERE ps.user_id = $1 
          AND ps.account_id = $2
          AND ps.data_date >= CURRENT_DATE - INTERVAL '${daysThreshold} days'
        GROUP BY COALESCE(ps.product_uid, ps.product_name), ps.product_name, ps.product_uid
      ),
      active_products AS (
        SELECT 
          ar.id,
          ar.product_name,
          ar.product_uid,
          ar.locked_at,
          COALESCE(ar.product_uid, ar.product_name) as product_key
        FROM active_rotation ar
        WHERE ar.user_id = $1 AND ar.account_id = $2
      )
      SELECT 
        ap.id,
        ap.product_name,
        ap.product_uid,
        ap.locked_at,
        COALESCE(rs.total_clicks, 0) as total_clicks,
        COALESCE(rs.total_cart, 0) as total_cart,
        COALESCE(rs.total_orders, 0) as total_orders,
        COALESCE(rs.total_gmv, 0) as total_gmv,
        COALESCE(rs.days_with_data, 0) as days_with_data,
        rs.last_activity,
        CASE 
          WHEN ap.locked_at IS NOT NULL THEN 'locked'
          WHEN rs.total_clicks IS NULL OR rs.total_clicks = 0 THEN 'no_data'
          WHEN rs.total_orders = 0 AND rs.total_clicks < $3 THEN 'dead'
          WHEN rs.total_orders = 0 AND rs.total_clicks >= $3 THEN 'underperforming'
          WHEN rs.total_orders > 0 THEN 'active'
          ELSE 'unknown'
        END as status
      FROM active_products ap
      LEFT JOIN recent_stats rs ON ap.product_key = rs.product_key
      ORDER BY 
        CASE 
          WHEN ap.locked_at IS NOT NULL THEN 0
          WHEN rs.total_orders > 0 THEN 1
          WHEN rs.total_clicks >= $3 THEN 2
          ELSE 3
        END,
        rs.total_orders DESC NULLS LAST,
        rs.total_clicks DESC NULLS LAST
    `;

    const result = await pool.query(query, [userId, accountId, minClicks]);
    
    // Categorize products
    const deadProducts = result.rows.filter(p => p.status === 'dead' || p.status === 'no_data');
    const underperforming = result.rows.filter(p => p.status === 'underperforming');
    const activeProducts = result.rows.filter(p => p.status === 'active');
    const lockedProducts = result.rows.filter(p => p.status === 'locked');

    // Get potential replacements from product_master not in active rotation
    const replacementsQuery = `
      WITH active_uids AS (
        SELECT COALESCE(product_uid, product_name) as product_key 
        FROM active_rotation 
        WHERE user_id = $1 AND account_id = $2
      ),
      available_products AS (
        SELECT 
          pm.id,
          pm.product_name,
          pm.product_uid,
          pm.category
        FROM product_master pm
        WHERE pm.user_id = $1 
          AND pm.account_id = $2
          AND COALESCE(pm.product_uid, pm.product_name) NOT IN (SELECT product_key FROM active_uids)
      ),
      product_performance AS (
        SELECT 
          COALESCE(ps.product_uid, ps.product_name) as product_key,
          SUM(ps.clicks) as historical_clicks,
          SUM(ps.orders_created) as historical_orders,
          SUM(ps.gmv_created) as historical_gmv,
          COUNT(DISTINCT ps.data_date) as data_days,
          CASE WHEN SUM(ps.clicks) > 0 THEN 
            ROUND((SUM(ps.orders_created)::numeric / SUM(ps.clicks)) * 100, 2) 
          ELSE 0 END as conversion_rate
        FROM product_statistics ps
        WHERE ps.user_id = $1 AND ps.account_id = $2
        GROUP BY COALESCE(ps.product_uid, ps.product_name)
      )
      SELECT 
        ap.*,
        COALESCE(pp.historical_clicks, 0) as historical_clicks,
        COALESCE(pp.historical_orders, 0) as historical_orders,
        COALESCE(pp.historical_gmv, 0) as historical_gmv,
        COALESCE(pp.conversion_rate, 0) as conversion_rate
      FROM available_products ap
      LEFT JOIN product_performance pp ON COALESCE(ap.product_uid, ap.product_name) = pp.product_key
      ORDER BY pp.conversion_rate DESC NULLS LAST, pp.historical_orders DESC NULLS LAST
      LIMIT 20
    `;

    const replacements = await pool.query(replacementsQuery, [userId, accountId]);

    res.json({
      summary: {
        total_active: result.rows.length,
        dead: deadProducts.length,
        underperforming: underperforming.length,
        performing: activeProducts.length,
        locked: lockedProducts.length
      },
      deadProducts,
      underperforming,
      activeProducts,
      lockedProducts,
      suggestedReplacements: replacements.rows
    });
  } catch (error) {
    console.error('Analyze dead products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Auto-optimize: Replace dead products with suggestions
router.post('/auto-optimize', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { studioId, accountId, deadProductIds, replacementProducts } = req.body;

    if (!deadProductIds || !replacementProducts || deadProductIds.length !== replacementProducts.length) {
      return res.status(400).json({ error: 'Dead products and replacements must have same count' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const removed = [];
      const added = [];

      for (let i = 0; i < deadProductIds.length; i++) {
        const deadId = deadProductIds[i];
        const replacement = replacementProducts[i];

        // Remove dead product (only if not locked)
        const deleteResult = await client.query(
          'DELETE FROM active_rotation WHERE id = $1 AND user_id = $2 AND locked_at IS NULL RETURNING product_name, product_uid',
          [deadId, userId]
        );

        if (deleteResult.rows.length > 0) {
          removed.push(deleteResult.rows[0]);

          // Check for conflict before adding replacement
          if (replacement.product_uid) {
            const conflict = await client.query(
              `SELECT id FROM active_rotation 
               WHERE studio_id = $1 AND product_uid = $2 AND user_id = $3`,
              [studioId, replacement.product_uid, userId]
            );

            if (conflict.rows.length > 0) {
              continue; // Skip if already exists in studio
            }
          }

          // Add replacement
          await client.query(
            'INSERT INTO active_rotation (user_id, studio_id, account_id, product_name, product_uid) VALUES ($1, $2, $3, $4, $5)',
            [userId, studioId, accountId, replacement.product_name, replacement.product_uid || null]
          );
          added.push(replacement);
        }
      }

      // Record in history
      await client.query(
        'INSERT INTO optimization_history (user_id, studio_id, account_id, products_added, products_removed) VALUES ($1, $2, $3, $4, $5)',
        [userId, studioId, accountId, added.length, removed.length]
      );

      await client.query('COMMIT');
      res.json({ 
        success: true, 
        removed: removed.length,
        added: added.length,
        details: { removed, added }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Auto optimize error:', error);
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

// === TENANT MANAGEMENT ===

// Rent a product to an account
router.post('/tenant/rent', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { studioId, accountId, productUid } = req.body;

    // Validate product_uid
    productUidSchema.parse(productUid);

    // Check if product is already rented in this studio
    const existingRent = await pool.query(
      `SELECT t.id, sa.name as account_name 
       FROM tenants t 
       JOIN shopee_accounts sa ON t.account_id = sa.id
       WHERE t.studio_id = $1 AND t.product_uid = $2 AND t.returned_at IS NULL AND t.user_id = $3`,
      [studioId, productUid, userId]
    );

    if (existingRent.rows.length > 0) {
      return res.status(400).json({ 
        error: `Product UID ${productUid} sudah disewa oleh akun "${existingRent.rows[0].account_name}"` 
      });
    }

    // Create rental record
    const result = await pool.query(
      `INSERT INTO tenants (user_id, studio_id, account_id, product_uid) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, studioId, accountId, productUid]
    );

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Rent product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Return a rented product
router.post('/tenant/return', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { tenantId } = req.body;

    const result = await pool.query(
      `UPDATE tenants SET returned_at = NOW() 
       WHERE id = $1 AND user_id = $2 AND returned_at IS NULL RETURNING *`,
      [tenantId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rental record not found or already returned' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Return product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get active rentals
router.get('/tenant', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { studioId, accountId } = req.query;

    let query = `
      SELECT t.*, sa.name as account_name, s.name as studio_name 
      FROM tenants t 
      JOIN shopee_accounts sa ON t.account_id = sa.id 
      JOIN studios s ON t.studio_id = s.id 
      WHERE t.user_id = $1
    `;
    const params: any[] = [userId];
    let paramIndex = 2;

    if (studioId) {
      query += ` AND t.studio_id = $${paramIndex}`;
      params.push(studioId);
      paramIndex++;
    }

    if (accountId) {
      query += ` AND t.account_id = $${paramIndex}`;
      params.push(accountId);
      paramIndex++;
    }

    query += ' AND t.returned_at IS NULL ORDER BY t.rented_at DESC';

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Get tenants error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// === PRODUCT ALIASES ===

// Add product alias
router.post('/alias', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { productUid, aliasName, source = 'csv' } = req.body;

    productUidSchema.parse(productUid);

    const result = await pool.query(
      `INSERT INTO product_aliases (user_id, product_uid, alias_name, source) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, productUid, aliasName, source]
    );

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Add alias error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get aliases for matching CSV data
router.get('/alias', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { productUid, aliasName } = req.query;

    let query = 'SELECT * FROM product_aliases WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;

    if (productUid) {
      query += ` AND product_uid = $${paramIndex}`;
      params.push(productUid);
      paramIndex++;
    }

    if (aliasName) {
      query += ` AND alias_name ILIKE $${paramIndex}`;
      params.push(`%${aliasName}%`);
      paramIndex++;
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get aliases error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete alias
router.delete('/alias/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM product_aliases WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alias not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete alias error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Resolve alias to product_uid
router.post('/alias/resolve', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { names } = req.body; // Array of product names from CSV

    if (!Array.isArray(names)) {
      return res.status(400).json({ error: 'names must be an array' });
    }

    // Find matching aliases
    const result = await pool.query(
      `SELECT alias_name, product_uid FROM product_aliases 
       WHERE user_id = $1 AND alias_name = ANY($2)`,
      [userId, names]
    );

    // Create lookup map
    const aliasMap: Record<string, string> = {};
    for (const row of result.rows) {
      aliasMap[row.alias_name] = row.product_uid;
    }

    // Also check product_master for direct matches
    const directMatch = await pool.query(
      `SELECT product_name, product_uid FROM product_master 
       WHERE user_id = $1 AND product_name = ANY($2) AND product_uid IS NOT NULL`,
      [userId, names]
    );

    for (const row of directMatch.rows) {
      if (!aliasMap[row.product_name]) {
        aliasMap[row.product_name] = row.product_uid;
      }
    }

    res.json(aliasMap);
  } catch (error) {
    console.error('Resolve alias error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
