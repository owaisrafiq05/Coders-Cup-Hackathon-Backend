"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/admin.routes.ts
const express_1 = require("express");
const admin_controller_1 = require("../controllers/admin.controller");
// Adjust these imports to match your actual middleware filenames/exports
const auth_middleware_1 = require("../middlewares/auth.middleware");
const roleCheck_middleware_1 = require("../middlewares/roleCheck.middleware");
const router = (0, express_1.Router)();
// All routes here are ADMIN-only
router.use(auth_middleware_1.authMiddleware, roleCheck_middleware_1.requireAdmin);
/**
 * GET /api/admin/users
 */
router.get('/users', admin_controller_1.getUsers);
/**
 * PATCH /api/admin/users/:id/approve
 */
router.patch('/users/:id/approve', admin_controller_1.approveUser);
/**
 * PATCH /api/admin/users/:id/reject
 */
router.patch('/users/:id/reject', admin_controller_1.rejectUser);
/**
 * POST /api/admin/risk-score/:userId
 */
router.post('/risk-score/:userId', admin_controller_1.triggerRiskScore);
/**
 * GET /api/admin/risk-profile/:userId
 */
router.get('/risk-profile/:userId', admin_controller_1.getRiskProfile);
/**
 * POST /api/admin/loans/:userId
 */
router.post('/loans/:userId', admin_controller_1.createLoanForUser);
/**
 * PUT /api/admin/loans/:loanId
 */
router.put('/loans/:loanId', admin_controller_1.updateLoan);
/**
 * GET /api/admin/loans
 */
router.get('/loans', admin_controller_1.getLoans);
/**
 * GET /api/admin/installments
 */
router.get('/installments', admin_controller_1.getAllInstallments);
/**
 * GET /api/admin/defaults
 */
router.get('/defaults', admin_controller_1.getDefaults);
/**
 * GET /api/admin/dashboard/stats
 */
router.get('/dashboard/stats', admin_controller_1.getDashboardStats);
/**
 * POST /api/admin/waive-fine/:installmentId
 */
router.post('/waive-fine/:installmentId', admin_controller_1.waiveFine);
/**
 * GET /api/admin/loan-requests
 */
router.get('/loan-requests', admin_controller_1.getLoanRequests);
/**
 * POST /api/admin/loan-requests/:requestId/approve
 */
router.post('/loan-requests/:requestId/approve', admin_controller_1.approveLoanRequest);
/**
 * POST /api/admin/loan-requests/:requestId/reject
 */
router.post('/loan-requests/:requestId/reject', admin_controller_1.rejectLoanRequest);
/**
 * POST /api/admin/reminders/installments
 * Manually trigger installment reminder emails
 */
router.post('/reminders/installments', admin_controller_1.triggerInstallmentReminders);
/**
 * POST /api/admin/reminders/overdue
 * Manually trigger overdue notice emails
 */
router.post('/reminders/overdue', admin_controller_1.triggerOverdueNotices);
exports.default = router;
