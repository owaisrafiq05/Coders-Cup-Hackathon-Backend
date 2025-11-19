"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const payment_controller_1 = require("../controllers/payment.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const roleCheck_middleware_1 = require("../middlewares/roleCheck.middleware");
const router = (0, express_1.Router)();
/**
 * POST /api/payments/webhook
 * Public endpoint for Stripe webhooks
 * Must be BEFORE body parsing middleware to get raw body
 */
router.post('/webhook', payment_controller_1.handleWebhook);
/**
 * POST /api/payments/create-session
 * Create a Stripe checkout session
 * Protected (USER role)
 */
router.post('/create-session', auth_middleware_1.authMiddleware, payment_controller_1.createPaymentSession);
/**
 * GET /api/payments/verify/:sessionId
 * Verify payment session status
 * Protected (USER role)
 */
router.get('/verify/:sessionId', auth_middleware_1.authMiddleware, payment_controller_1.verifyPaymentSession);
/**
 * GET /api/payments/history
 * Get payment history for authenticated user
 * Protected (USER role)
 */
router.get('/history', auth_middleware_1.authMiddleware, payment_controller_1.getPaymentHistory);
/**
 * POST /api/payments/refund/:paymentIntentId
 * Refund a payment (ADMIN only)
 * Protected (ADMIN role)
 */
router.post('/refund/:paymentIntentId', auth_middleware_1.authMiddleware, roleCheck_middleware_1.requireAdmin, payment_controller_1.refundPayment);
/**
 * GET /api/payments/test/create-test-installment
 * Create a test installment for payment testing
 * Protected (any authenticated user)
 * FOR TESTING PURPOSES ONLY - Remove in production
 */
router.get('/test/create-test-installment', auth_middleware_1.authMiddleware, payment_controller_1.createTestInstallment);
exports.default = router;
