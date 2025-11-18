import { Router } from 'express';
import {
  createPaymentSession,
  verifyPaymentSession,
  handleWebhook,
  getPaymentHistory,
  refundPayment,
  createTestInstallment,
} from '../controllers/payment.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireAdmin } from '../middlewares/roleCheck.middleware';

const router = Router();

/**
 * POST /api/payments/webhook
 * Public endpoint for Stripe webhooks
 * Must be BEFORE body parsing middleware to get raw body
 */
router.post('/webhook', handleWebhook);

/**
 * POST /api/payments/create-session
 * Create a Stripe checkout session
 * Protected (USER role)
 */
router.post('/create-session', authMiddleware, createPaymentSession);

/**
 * GET /api/payments/verify/:sessionId
 * Verify payment session status
 * Protected (USER role)
 */
router.get('/verify/:sessionId', authMiddleware, verifyPaymentSession);

/**
 * GET /api/payments/history
 * Get payment history for authenticated user
 * Protected (USER role)
 */
router.get('/history', authMiddleware, getPaymentHistory);

/**
 * POST /api/payments/refund/:paymentIntentId
 * Refund a payment (ADMIN only)
 * Protected (ADMIN role)
 */
router.post('/refund/:paymentIntentId', authMiddleware, requireAdmin, refundPayment);

/**
 * GET /api/payments/test/create-test-installment
 * Create a test installment for payment testing
 * Protected (any authenticated user)
 * FOR TESTING PURPOSES ONLY - Remove in production
 */
router.get('/test/create-test-installment', authMiddleware, createTestInstallment);

export default router;
