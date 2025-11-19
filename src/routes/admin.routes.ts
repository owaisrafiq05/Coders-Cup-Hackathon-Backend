// src/routes/admin.routes.ts
import { Router } from 'express';
import {
  getUsers,
  getUserById,
  approveUser,
  rejectUser,
  triggerRiskScore,
  getRiskProfile,
  createLoanForUser,
  getLoanById,
  updateLoan,
  getLoans,
  getAllInstallments,
  getDefaults,
  getDashboardStats,
  waiveFine,
  getLoanRequests,
  approveLoanRequest,
  rejectLoanRequest,
  triggerInstallmentReminders,
  triggerOverdueNotices,
  getAnalytics,
  sendPaymentLink,
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
 * GET /api/admin/users/:userId
 */
router.get('/users/:userId', getUserById);

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
 * GET /api/admin/loans
 */
router.get('/loans', getLoans);

/**
 * GET /api/admin/loans/:loanId
 * Get detailed loan information
 */
router.get('/loans/:loanId', getLoanById);

/**
 * POST /api/admin/loans/:userId
 */
router.post('/loans/:userId', createLoanForUser);

/**
 * PUT /api/admin/loans/:loanId
 */
router.put('/loans/:loanId', updateLoan);

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

/**
 * POST /api/admin/installments/:installmentId/send-payment-link
 * Send payment link to user for a specific installment
 */
router.post('/installments/:installmentId/send-payment-link', sendPaymentLink);

/**
 * GET /api/admin/loan-requests
 */
router.get('/loan-requests', getLoanRequests);

/**
 * POST /api/admin/loan-requests/:requestId/approve
 */
router.post('/loan-requests/:requestId/approve', approveLoanRequest);

/**
 * POST /api/admin/loan-requests/:requestId/reject
 */
router.post('/loan-requests/:requestId/reject', rejectLoanRequest);

/**
 * POST /api/admin/reminders/installments
 * Manually trigger installment reminder emails
 */
router.post('/reminders/installments', triggerInstallmentReminders);

/**
 * POST /api/admin/reminders/overdue
 * Manually trigger overdue notice emails
 */
router.post('/reminders/overdue', triggerOverdueNotices);

/**
 * GET /api/admin/analytics
 * Get comprehensive analytics data
 */
router.get('/analytics', getAnalytics);

export default router;
