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
 * GET /api/users/profile
 * Protected (USER role)
 */
router.get('/profile', getProfile);

/**
 * PUT /api/users/profile
 * Protected (USER role)
 */
router.put('/profile', updateProfile);

/**
 * GET /api/users/loan
 * Protected (USER role)
 */
router.get('/loan', getUserLoan);

/**
 * GET /api/users/installments
 * Protected (USER role)
 * Query params: ?status=PENDING&page=1&limit=10
 */
router.get('/installments', getUserInstallments);

/**
 * GET /api/users/installment/:id
 * Protected (USER role)
 */
router.get('/installment/:id', getUserInstallmentById);

/**
 * GET /api/users/risk-profile
 * Protected (USER role)
 */
router.get('/risk-profile', getUserRiskProfile);

/**
 * POST /api/users/loan-request
 * Protected (USER role)
 * Request a new loan
 */
router.post('/loan-request', requestLoan);

/**
 * GET /api/users/loan-requests
 * Protected (USER role)
 * Get user's loan request history
 */
router.get('/loan-requests', getUserLoanRequests);

export default router;
