"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const user_controller_1 = require("../controllers/user.controller");
const router = (0, express_1.Router)();
/**
 * GET /api/users/profile
 * Protected (USER role)
 */
router.get('/profile', user_controller_1.getProfile);
/**
 * PUT /api/users/profile
 * Protected (USER role)
 */
router.put('/profile', user_controller_1.updateProfile);
/**
 * GET /api/users/loan
 * Protected (USER role)
 */
router.get('/loan', user_controller_1.getUserLoan);
/**
 * GET /api/users/installments
 * Protected (USER role)
 * Query params: ?status=PENDING&page=1&limit=10
 */
router.get('/installments', user_controller_1.getUserInstallments);
/**
 * GET /api/users/installment/:id
 * Protected (USER role)
 */
router.get('/installment/:id', user_controller_1.getUserInstallmentById);
/**
 * GET /api/users/risk-profile
 * Protected (USER role)
 */
router.get('/risk-profile', user_controller_1.getUserRiskProfile);
/**
 * POST /api/users/loan-request
 * Protected (USER role)
 * Request a new loan
 */
router.post('/loan-request', user_controller_1.requestLoan);
/**
 * GET /api/users/loan-requests
 * Protected (USER role)
 * Get user's loan request history
 */
router.get('/loan-requests', user_controller_1.getUserLoanRequests);
exports.default = router;
