// src/routes/index.ts
import { Router } from 'express';
import authRoutes from './auth.route';

const router = Router();

// All Authentication Routes
router.use('/auth', authRoutes);

// Add other module routes here (example):
// router.use('/users', userRoutes);
// router.use('/loans', loanRoutes);

export default router;
