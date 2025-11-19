"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestInstallment = exports.refundPayment = exports.getPaymentHistory = exports.handleWebhook = exports.verifyPaymentSession = exports.createPaymentSession = void 0;
const paymentService_1 = require("../services/paymentService");
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * POST /api/payments/create-session
 * Create a Stripe checkout session for an installment payment
 * Protected (USER role)
 */
const createPaymentSession = async (req, res) => {
    try {
        const { installmentId } = req.body;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized',
            });
        }
        if (!installmentId) {
            return res.status(400).json({
                success: false,
                message: 'installmentId is required',
            });
        }
        // Get base URL from request or environment
        const protocol = req.protocol;
        const host = req.get('host');
        const baseUrl = process.env.FRONTEND_URL || `${protocol}://${host}`;
        const successUrl = `${baseUrl}/payment/success`;
        const cancelUrl = `${baseUrl}/payment/cancel`;
        const session = await paymentService_1.paymentService.createPaymentSession({
            installmentId,
            userId,
            successUrl,
            cancelUrl,
        });
        return res.status(201).json({
            success: true,
            message: 'Payment session created successfully',
            data: {
                sessionId: session.sessionId,
                sessionUrl: session.sessionUrl,
                amount: session.amount,
                currency: session.currency,
                expiresAt: new Date(session.expiresAt * 1000).toISOString(),
            },
        });
    }
    catch (error) {
        logger_1.default.error('Error creating payment session', {
            error: error.message,
            userId: req.user?.id,
        });
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to create payment session',
        });
    }
};
exports.createPaymentSession = createPaymentSession;
/**
 * GET /api/payments/verify/:sessionId
 * Verify payment session status
 * Protected (USER role)
 */
const verifyPaymentSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                message: 'sessionId is required',
            });
        }
        const verification = await paymentService_1.paymentService.verifyPaymentSession(sessionId);
        return res.json({
            success: true,
            data: {
                status: verification.status,
                paid: verification.paid,
                installmentId: verification.installmentId,
                paymentIntentId: verification.paymentIntentId,
                amount: verification.amount,
            },
        });
    }
    catch (error) {
        logger_1.default.error('Error verifying payment session', {
            error: error.message,
            sessionId: req.params.sessionId,
        });
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to verify payment session',
        });
    }
};
exports.verifyPaymentSession = verifyPaymentSession;
/**
 * POST /api/payments/webhook
 * Handle Stripe webhook events
 * Public endpoint (Stripe calls this)
 */
const handleWebhook = async (req, res) => {
    try {
        const signature = req.headers['stripe-signature'];
        if (!signature) {
            logger_1.default.warn('Webhook received without signature');
            return res.status(400).json({
                success: false,
                message: 'Missing stripe-signature header',
            });
        }
        // Get raw body (must be Buffer, not parsed JSON)
        const payload = req.body;
        const result = await paymentService_1.paymentService.handleWebhook(payload, signature);
        return res.json({
            success: true,
            received: result.received,
        });
    }
    catch (error) {
        logger_1.default.error('Webhook processing error', {
            error: error.message,
        });
        return res.status(400).json({
            success: false,
            message: error.message || 'Webhook processing failed',
        });
    }
};
exports.handleWebhook = handleWebhook;
/**
 * GET /api/payments/history
 * Get payment history for authenticated user
 * Protected (USER role)
 */
const getPaymentHistory = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { limit = '10' } = req.query;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized',
            });
        }
        const limitNum = Math.min(parseInt(limit, 10) || 10, 50);
        const history = await paymentService_1.paymentService.getPaymentHistory(userId, limitNum);
        return res.json({
            success: true,
            data: {
                transactions: history.map((tx) => ({
                    id: tx._id.toString(),
                    installment: tx.installmentId
                        ? {
                            id: tx.installmentId._id?.toString(),
                            number: tx.installmentId.installmentNumber,
                            amount: tx.installmentId.amount,
                            dueDate: tx.installmentId.dueDate,
                        }
                        : null,
                    loan: tx.loanId
                        ? {
                            id: tx.loanId._id?.toString(),
                            principalAmount: tx.loanId.principalAmount,
                        }
                        : null,
                    amount: tx.amount,
                    currency: tx.currency,
                    status: tx.status,
                    paymentMethod: tx.paymentMethod,
                    stripeReceiptUrl: tx.stripeReceiptUrl,
                    createdAt: tx.createdAt,
                })),
                count: history.length,
            },
        });
    }
    catch (error) {
        logger_1.default.error('Error fetching payment history', {
            error: error.message,
            userId: req.user?.id,
        });
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch payment history',
        });
    }
};
exports.getPaymentHistory = getPaymentHistory;
/**
 * POST /api/payments/refund/:paymentIntentId
 * Refund a payment (ADMIN only)
 * Protected (ADMIN role)
 */
const refundPayment = async (req, res) => {
    try {
        const { paymentIntentId } = req.params;
        const { reason } = req.body;
        if (!paymentIntentId) {
            return res.status(400).json({
                success: false,
                message: 'paymentIntentId is required',
            });
        }
        if (!reason || !reason.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Reason is required for refund',
            });
        }
        const result = await paymentService_1.paymentService.refundPayment(paymentIntentId, reason);
        return res.json({
            success: true,
            message: 'Payment refunded successfully',
            data: {
                refunded: result.refunded,
                refundId: result.refundId,
                amount: result.amount,
                processedBy: req.user?.id,
                reason,
            },
        });
    }
    catch (error) {
        logger_1.default.error('Error processing refund', {
            error: error.message,
            paymentIntentId: req.params.paymentIntentId,
            adminId: req.user?.id,
        });
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to process refund',
        });
    }
};
exports.refundPayment = refundPayment;
/**
 * GET /api/payments/test/create-test-installment
 * Create a test installment for payment testing
 * Protected (USER/ADMIN role) - For testing purposes only
 */
const createTestInstallment = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized',
            });
        }
        // Import models here to avoid circular dependencies
        const User = (await Promise.resolve().then(() => __importStar(require('../models/User')))).default;
        const Loan = (await Promise.resolve().then(() => __importStar(require('../models/Loan')))).default;
        const Installment = (await Promise.resolve().then(() => __importStar(require('../models/Installment')))).default;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }
        // Find an active loan or create one
        let loan = await Loan.findOne({
            userId,
            status: 'ACTIVE',
        });
        if (!loan) {
            // Create a test loan
            const startDate = new Date();
            loan = await Loan.create({
                userId,
                createdBy: userId,
                principalAmount: 50000,
                interestRate: 15,
                tenureMonths: 12,
                monthlyInstallment: 4500,
                totalAmount: 54000,
                outstandingBalance: 54000,
                totalRepaid: 0,
                totalFines: 0,
                startDate,
                endDate: new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000),
                status: 'ACTIVE',
                installmentSchedule: [
                    {
                        month: 1,
                        dueDate: new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000),
                        amount: 4500,
                    },
                ],
                notes: 'Test loan for payment integration',
            });
        }
        // Create a test installment
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 5); // Due in 5 days
        const installment = await Installment.create({
            loanId: loan._id,
            userId: userId,
            installmentNumber: 1,
            amount: 4500,
            fineAmount: 0,
            totalDue: 4500,
            dueDate,
            status: 'PENDING',
            gracePeriodDays: 2,
            gracePeriodEndDate: new Date(dueDate.getTime() + 2 * 24 * 60 * 60 * 1000),
            daysOverdue: 0,
            remindersSent: 0,
            notes: 'Test installment for payment testing',
        });
        return res.status(201).json({
            success: true,
            message: 'Test installment created successfully',
            data: {
                installmentId: installment._id.toString(),
                loanId: loan._id.toString(),
                amount: installment.amount,
                fineAmount: installment.fineAmount,
                totalDue: installment.totalDue,
                dueDate: installment.dueDate.toISOString(),
                status: installment.status,
            },
        });
    }
    catch (error) {
        logger_1.default.error('Error creating test installment', {
            error: error.message,
            userId: req.user?.id,
        });
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to create test installment',
        });
    }
};
exports.createTestInstallment = createTestInstallment;
