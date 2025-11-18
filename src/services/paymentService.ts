import Stripe from 'stripe';
import logger from '../utils/logger';
import Installment, { InstallmentStatus } from '../models/Installment';
import Loan, { LoanStatus } from '../models/Loan';
import PaymentTransaction, { PaymentStatus, PaymentMethod } from '../models/PaymentTransaction';
import User from '../models/User';
import { emailService } from './emailService';

if (!process.env.STRIPE_SECRET_KEY) {
  logger.warn('STRIPE_SECRET_KEY is not set. Payment functionality will be disabled.');
}

// Initialize Stripe with API version
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-10-29.clover',
    })
  : null;

interface CreatePaymentSessionParams {
  installmentId: string;
  userId: string;
  successUrl: string;
  cancelUrl: string;
}

interface PaymentSessionResponse {
  sessionId: string;
  sessionUrl: string;
  paymentIntentId?: string;
  amount: number;
  currency: string;
  expiresAt: number;
}

class PaymentService {
  /**
   * Create a Stripe Checkout Session for an installment payment
   */
  async createPaymentSession(
    params: CreatePaymentSessionParams
  ): Promise<PaymentSessionResponse> {
    if (!stripe) {
      throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY.');
    }

    const { installmentId, userId, successUrl, cancelUrl } = params;

    // 1. Fetch installment details
    const installment = await Installment.findById(installmentId)
      .populate('loanId')
      .populate('userId');

    if (!installment) {
      throw new Error('Installment not found');
    }

    // 2. Verify ownership
    if (installment.userId._id.toString() !== userId) {
      throw new Error('Unauthorized: Installment does not belong to this user');
    }

    // 3. Check if already paid
    if (installment.status === InstallmentStatus.PAID) {
      throw new Error('Installment already paid');
    }

    // 4. Check if installment is waived
    if (installment.status === InstallmentStatus.WAIVED) {
      throw new Error('Installment has been waived');
    }

    const user = installment.userId as any;
    const loan = installment.loanId as any;

    // 5. Calculate amount (in smallest currency unit - paisa for PKR)
    const amountInPKR = installment.totalDue;
    const amountInPaisa = Math.round(amountInPKR * 100); // Convert to paisa

    try {
      // 6. Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: user.email,
        client_reference_id: installmentId,
        line_items: [
          {
            price_data: {
              currency: 'pkr',
              product_data: {
                name: `Loan Installment #${installment.installmentNumber}`,
                description: `Payment for loan principal: PKR ${loan.principalAmount}`,
                metadata: {
                  loanId: loan._id.toString(),
                  installmentId: installment._id.toString(),
                  userId: userId,
                },
              },
              unit_amount: amountInPaisa,
            },
            quantity: 1,
          },
        ],
        metadata: {
          installmentId: installment._id.toString(),
          loanId: loan._id.toString(),
          userId: userId,
          installmentNumber: installment.installmentNumber.toString(),
        },
        success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
        expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiry
      });

      // 7. Update installment with session ID
      installment.stripeSessionId = session.id;
      await installment.save();

      // 8. Create pending payment transaction
      await PaymentTransaction.create({
        installmentId: installment._id,
        loanId: loan._id,
        userId: userId,
        amount: amountInPKR,
        currency: 'PKR',
        status: PaymentStatus.PENDING,
        paymentMethod: PaymentMethod.STRIPE_CARD,
        stripeSessionId: session.id,
        stripePaymentIntentId: session.payment_intent as string | undefined,
        metadata: {
          installmentNumber: installment.installmentNumber,
        },
      });

      logger.info('Payment session created', {
        sessionId: session.id,
        installmentId,
        amount: amountInPKR,
      });

      return {
        sessionId: session.id,
        sessionUrl: session.url!,
        paymentIntentId: session.payment_intent as string | undefined,
        amount: amountInPKR,
        currency: 'PKR',
        expiresAt: session.expires_at,
      };
    } catch (error: any) {
      logger.error('Failed to create Stripe session', {
        error: error.message,
        installmentId,
      });
      throw new Error(`Stripe error: ${error.message}`);
    }
  }

  /**
   * Verify payment session status
   */
  async verifyPaymentSession(sessionId: string): Promise<{
    status: string;
    paid: boolean;
    installmentId?: string;
    paymentIntentId?: string;
    amount?: number;
  }> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      logger.info('Payment session retrieved', {
        sessionId,
        status: session.payment_status,
      });

      return {
        status: session.payment_status,
        paid: session.payment_status === 'paid',
        installmentId: session.metadata?.installmentId,
        paymentIntentId: session.payment_intent as string | undefined,
        amount: session.amount_total ? session.amount_total / 100 : undefined,
      };
    } catch (error: any) {
      logger.error('Failed to verify payment session', {
        error: error.message,
        sessionId,
      });
      throw new Error(`Stripe verification error: ${error.message}`);
    }
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(
    payload: Buffer,
    signature: string
  ): Promise<{ received: boolean; processed?: boolean }> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.warn('STRIPE_WEBHOOK_SECRET not configured, skipping signature verification');
    }

    let event: Stripe.Event;

    try {
      // Verify webhook signature
      if (webhookSecret) {
        event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      } else {
        event = JSON.parse(payload.toString());
      }
    } catch (error: any) {
      logger.error('Webhook signature verification failed', {
        error: error.message,
      });
      throw new Error(`Webhook Error: ${error.message}`);
    }

    logger.info('Webhook event received', {
      type: event.type,
      id: event.id,
    });

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'payment_intent.succeeded':
        await this.handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case 'charge.refunded':
        await this.handleChargeRefunded(event.data.object as Stripe.Charge);
        break;

      default:
        logger.info('Unhandled webhook event type', { type: event.type });
    }

    return { received: true, processed: true };
  }

  /**
   * Handle successful checkout session
   */
  private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
    const installmentId = session.metadata?.installmentId;
    const loanId = session.metadata?.loanId;

    if (!installmentId || !loanId) {
      logger.error('Missing metadata in checkout session', { sessionId: session.id });
      return;
    }

    try {
      const installment = await Installment.findById(installmentId);
      if (!installment) {
        logger.error('Installment not found', { installmentId });
        return;
      }

      // Update installment status
      installment.status = InstallmentStatus.PAID;
      installment.paidDate = new Date();
      installment.stripePaymentIntentId = session.payment_intent as string;
      await installment.save();

      // Update payment transaction
      await PaymentTransaction.findOneAndUpdate(
        {
          stripeSessionId: session.id,
          status: PaymentStatus.PENDING,
        },
        {
          status: PaymentStatus.SUCCESS,
          stripePaymentIntentId: session.payment_intent as string,
          stripeChargeId: (session as any).latest_charge,
          metadata: {
            paymentStatus: session.payment_status,
            completedAt: new Date(),
          },
        }
      );

      // Update loan balances
      const loan = await Loan.findById(loanId);
      if (loan) {
        loan.totalRepaid += installment.amount;
        loan.outstandingBalance = Math.max(0, loan.outstandingBalance - installment.totalDue);
        loan.totalFines += installment.fineAmount;

        // Check if loan is completed
        if (loan.outstandingBalance <= 0) {
          loan.status = LoanStatus.COMPLETED;
          loan.completedAt = new Date();
        }

        await loan.save();
      }

      // Send payment confirmation email
      try {
        const user = await User.findById(installment.userId);
        if (user) {
          await emailService.sendPaymentConfirmation(user.email, {
            userName: user.fullName,
            installmentNumber: installment.installmentNumber,
            amount: installment.amount,
            paidDate: installment.paidDate!.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }),
            receiptUrl: (session as any).receipt_url,
            remainingBalance: loan?.outstandingBalance || 0,
          }, user._id.toString());
        }
      } catch (emailError: any) {
        logger.error('Failed to send payment confirmation email', {
          error: emailError.message,
          installmentId,
        });
      }

      logger.info('Payment processed successfully', {
        installmentId,
        loanId,
        amount: installment.totalDue,
      });
    } catch (error: any) {
      logger.error('Error processing checkout session', {
        error: error.message,
        sessionId: session.id,
      });
    }
  }

  /**
   * Handle successful payment intent
   */
  private async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    logger.info('Payment intent succeeded', {
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount / 100,
    });

    // Update transaction if exists
    await PaymentTransaction.findOneAndUpdate(
      {
        stripePaymentIntentId: paymentIntent.id,
      },
      {
        status: PaymentStatus.SUCCESS,
        stripeReceiptUrl: (paymentIntent as any).charges?.data?.[0]?.receipt_url,
      }
    );
  }

  /**
   * Handle failed payment intent
   */
  private async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
    logger.warn('Payment intent failed', {
      paymentIntentId: paymentIntent.id,
      failureMessage: paymentIntent.last_payment_error?.message,
    });

    // Update transaction
    const transaction = await PaymentTransaction.findOneAndUpdate(
      {
        stripePaymentIntentId: paymentIntent.id,
      },
      {
        status: PaymentStatus.FAILED,
        failureReason: paymentIntent.last_payment_error?.message || 'Payment failed',
      },
      { new: true }
    );

    // Send payment failure email
    if (transaction) {
      try {
        const installment = await Installment.findById(transaction.installmentId);
        const user = await User.findById(transaction.userId);
        
        if (user && installment) {
          const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
          const retryUrl = `${baseUrl}/payments/retry/${installment._id}`;

          await emailService.sendPaymentFailed(user.email, {
            userName: user.fullName,
            installmentNumber: installment.installmentNumber,
            amount: installment.totalDue,
            failureReason: paymentIntent.last_payment_error?.message || 'Payment failed',
            retryUrl,
          }, user._id.toString());
        }
      } catch (emailError: any) {
        logger.error('Failed to send payment failure email', {
          error: emailError.message,
          paymentIntentId: paymentIntent.id,
        });
      }
    }
  }

  /**
   * Handle refunded charge
   */
  private async handleChargeRefunded(charge: Stripe.Charge) {
    logger.info('Charge refunded', {
      chargeId: charge.id,
      amount: charge.amount_refunded / 100,
    });

    // Update transaction
    await PaymentTransaction.findOneAndUpdate(
      {
        stripeChargeId: charge.id,
      },
      {
        status: PaymentStatus.REFUNDED,
        refundedAmount: charge.amount_refunded / 100,
        refundedAt: new Date(),
      }
    );
  }

  /**
   * Get payment history for a user
   */
  async getPaymentHistory(userId: string, limit: number = 10) {
    const transactions = await PaymentTransaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('installmentId', 'installmentNumber amount dueDate')
      .populate('loanId', 'principalAmount')
      .lean();

    return transactions;
  }

  /**
   * Refund a payment (admin only)
   */
  async refundPayment(paymentIntentId: string, reason: string): Promise<{
    refunded: boolean;
    refundId?: string;
    amount?: number;
  }> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    try {
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        reason: 'requested_by_customer',
        metadata: {
          adminReason: reason,
        },
      });

      logger.info('Refund processed', {
        paymentIntentId,
        refundId: refund.id,
        amount: refund.amount / 100,
      });

      return {
        refunded: true,
        refundId: refund.id,
        amount: refund.amount / 100,
      };
    } catch (error: any) {
      logger.error('Refund failed', {
        error: error.message,
        paymentIntentId,
      });
      throw new Error(`Refund error: ${error.message}`);
    }
  }
}

export const paymentService = new PaymentService();
export default paymentService;
