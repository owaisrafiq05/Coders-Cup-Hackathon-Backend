import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  getUserLoan,
  getUserInstallments,
  getUserInstallmentById,
  getUserRiskProfile,
  requestLoan,
  getUserLoanRequests,
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

/**
 * POST /api/user/loan-request
 * Protected (USER role)
 * Request a new loan
 */
router.post('/loan-request', requestLoan);

/**
 * GET /api/user/loan-requests
 * Protected (USER role)
 * Get user's loan request history
 */
router.get('/loan-requests', getUserLoanRequests);

export default router;
