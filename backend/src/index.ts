import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth';
import studiosRoutes from './routes/studios';
import accountsRoutes from './routes/accounts';
import productsRoutes from './routes/products';
import statisticsRoutes from './routes/statistics';
import optimizeRoutes from './routes/optimize';
import adminRoutes from './routes/admin';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/studios', studiosRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/optimize', optimizeRoutes);
app.use('/api/admin', adminRoutes);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
