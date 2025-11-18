import { Request, Response } from 'express-serve-static-core';
import { paymentService } from '../services/paymentService';
import logger from '../utils/logger';

interface AuthRequest extends Request {
  user?: {
    id: string;
    role: 'USER' | 'ADMIN';
    email?: string;
  };
}

/**
 * POST /api/payments/create-session
 * Create a Stripe checkout session for an installment payment
 * Protected (USER role)
 */
export const createPaymentSession = async (req: AuthRequest, res: Response) => {
  try {
    const { installmentId } = req.body as { installmentId: string };
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

    const session = await paymentService.createPaymentSession({
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
  } catch (error: any) {
    logger.error('Error creating payment session', {
      error: error.message,
      userId: req.user?.id,
    });

    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create payment session',
    });
  }
};

/**
 * GET /api/payments/verify/:sessionId
 * Verify payment session status
 * Protected (USER role)
 */
export const verifyPaymentSession = async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'sessionId is required',
      });
    }

    const verification = await paymentService.verifyPaymentSession(sessionId);

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
  } catch (error: any) {
    logger.error('Error verifying payment session', {
      error: error.message,
      sessionId: req.params.sessionId,
    });

    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to verify payment session',
    });
  }
};

/**
 * POST /api/payments/webhook
 * Handle Stripe webhook events
 * Public endpoint (Stripe calls this)
 */
export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      logger.warn('Webhook received without signature');
      return res.status(400).json({
        success: false,
        message: 'Missing stripe-signature header',
      });
    }

    // Get raw body (must be Buffer, not parsed JSON)
    const payload = req.body as Buffer;

    const result = await paymentService.handleWebhook(payload, signature);

    return res.json({
      success: true,
      received: result.received,
    });
  } catch (error: any) {
    logger.error('Webhook processing error', {
      error: error.message,
    });

    return res.status(400).json({
      success: false,
      message: error.message || 'Webhook processing failed',
    });
  }
};

/**
 * GET /api/payments/history
 * Get payment history for authenticated user
 * Protected (USER role)
 */
export const getPaymentHistory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { limit = '10' } = req.query as { limit?: string };

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const limitNum = Math.min(parseInt(limit, 10) || 10, 50);

    const history = await paymentService.getPaymentHistory(userId, limitNum);

    return res.json({
      success: true,
      data: {
        transactions: history.map((tx: any) => ({
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
  } catch (error: any) {
    logger.error('Error fetching payment history', {
      error: error.message,
      userId: req.user?.id,
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history',
    });
  }
};

/**
 * POST /api/payments/refund/:paymentIntentId
 * Refund a payment (ADMIN only)
 * Protected (ADMIN role)
 */
export const refundPayment = async (req: AuthRequest, res: Response) => {
  try {
    const { paymentIntentId } = req.params;
    const { reason } = req.body as { reason?: string };

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

    const result = await paymentService.refundPayment(paymentIntentId, reason);

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
  } catch (error: any) {
    logger.error('Error processing refund', {
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

/**
 * GET /api/payments/test/create-test-installment
 * Create a test installment for payment testing
 * Protected (USER/ADMIN role) - For testing purposes only
 */
export const createTestInstallment = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    // Import models here to avoid circular dependencies
    const User = (await import('../models/User')).default;
    const Loan = (await import('../models/Loan')).default;
    const Installment = (await import('../models/Installment')).default;

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
  } catch (error: any) {
    logger.error('Error creating test installment', {
      error: error.message,
      userId: req.user?.id,
    });

    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create test installment',
    });
  }
};
