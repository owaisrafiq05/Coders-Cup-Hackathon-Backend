// src/routes/admin.routes.ts
import { Router } from 'express';
import {
  getUsers,
  approveUser,
  rejectUser,
  triggerRiskScore,
  getRiskProfile,
  createLoanForUser,
  updateLoan,
  getLoans,
  getAllInstallments,
  getDefaults,
  getDashboardStats,
  waiveFine,
} from '../controllers/admin.controller';

// Adjust these imports to match your actual middleware filenames/exports
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireAdmin } from '../middlewares/roleCheck.middleware';

const router = Router();

// All routes here are ADMIN-only
router.use(authMiddleware, requireAdmin);

/**
 * GET /api/admin/users
 */
router.get('/users', getUsers);

/**
 * PATCH /api/admin/users/:id/approve
 */
router.patch('/users/:id/approve', approveUser);

/**
 * PATCH /api/admin/users/:id/reject
 */
router.patch('/users/:id/reject', rejectUser);

/**
 * POST /api/admin/risk-score/:userId
 */
router.post('/risk-score/:userId', triggerRiskScore);

/**
 * GET /api/admin/risk-profile/:userId
 */
router.get('/risk-profile/:userId', getRiskProfile);

/**
 * POST /api/admin/loans/:userId
 */
router.post('/loans/:userId', createLoanForUser);

/**
 * PUT /api/admin/loans/:loanId
 */
router.put('/loans/:loanId', updateLoan);

/**
 * GET /api/admin/loans
 */
router.get('/loans', getLoans);

/**
 * GET /api/admin/installments
 */
router.get('/installments', getAllInstallments);

/**
 * GET /api/admin/defaults
 */
router.get('/defaults', getDefaults);

/**
 * GET /api/admin/dashboard/stats
 */
router.get('/dashboard/stats', getDashboardStats);

/**
 * POST /api/admin/waive-fine/:installmentId
 */
router.post('/waive-fine/:installmentId', waiveFine);

export default router;
