import { Router } from 'express';
import authRoutes from './auth.routes.js';
import donorRoutes from './donor.routes.js';
import requestRoutes from './request.routes.js';
import recommendationRoutes from './recommendation.routes.js';
import chatRoutes from './chat.routes.js';
import adminRoutes from './admin.routes.js';

const router = Router();

router.get('/health', (_req, res) =>
  res.json({ success: true, service: 'lifelink-api', time: new Date().toISOString() })
);

router.use('/auth', authRoutes);
router.use('/donors', donorRoutes);
router.use('/requests', requestRoutes);
router.use('/recommendations', recommendationRoutes);
router.use('/chat', chatRoutes);
router.use('/admin', adminRoutes);

export default router;
