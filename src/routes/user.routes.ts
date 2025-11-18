// src/routes/user.routes.ts
import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  getUserLoan,
  getUserInstallments,
  getUserInstallmentById,
  getUserRiskProfile,
} from '../controllers/user.controller';

const router = Router();

/**
 * GET /api/user/profile
 * Protected (USER role)
 */
router.get('/profile', getProfile);

/**
 * PUT /api/user/profile
 * Protected (USER role)
 */
router.put('/profile', updateProfile);

/**
 * GET /api/user/loan
 * Protected (USER role)
 */
router.get('/loan', getUserLoan);

/**
 * GET /api/user/installments
 * Protected (USER role)
 * Query params: ?status=PENDING&page=1&limit=10
 */
router.get('/installments', getUserInstallments);

/**
 * GET /api/user/installment/:id
 * Protected (USER role)
 */
router.get('/installment/:id', getUserInstallmentById);

/**
 * GET /api/user/risk-profile
 * Protected (USER role)
 */
router.get('/risk-profile', getUserRiskProfile);

export default router;
