// src/routes/index.ts
import { Router } from 'express';
import authRoutes from './auth.route';
import userRoutes from './user.routes';
import adminRoutes from './admin.routes';
import paymentRoutes from './payment.routes';

const router = Router();

// All Authentication Routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/payments', paymentRoutes);

// Add other module routes here (example):
// router.use('/loans', loanRoutes);

export default router;
