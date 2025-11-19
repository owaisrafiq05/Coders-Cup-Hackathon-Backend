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
exports.paymentService = void 0;
const stripe_1 = __importDefault(require("stripe"));
const logger_1 = __importDefault(require("../utils/logger"));
const Installment_1 = __importStar(require("../models/Installment"));
const Loan_1 = __importStar(require("../models/Loan"));
const PaymentTransaction_1 = __importStar(require("../models/PaymentTransaction"));
const User_1 = __importDefault(require("../models/User"));
const emailService_1 = require("./emailService");
if (!process.env.STRIPE_SECRET_KEY) {
    logger_1.default.warn('STRIPE_SECRET_KEY is not set. Payment functionality will be disabled.');
}
// Initialize Stripe with API version
const stripe = process.env.STRIPE_SECRET_KEY
    ? new stripe_1.default(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2025-10-29.clover',
    })
    : null;
class PaymentService {
    /**
     * Create a Stripe Checkout Session for an installment payment
     */
    async createPaymentSession(params) {
        if (!stripe) {
            throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY.');
        }
        const { installmentId, userId, successUrl, cancelUrl } = params;
        // 1. Fetch installment details
        const installment = await Installment_1.default.findById(installmentId)
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
        if (installment.status === Installment_1.InstallmentStatus.PAID) {
            throw new Error('Installment already paid');
        }
        // 4. Check if installment is waived
        if (installment.status === Installment_1.InstallmentStatus.WAIVED) {
            throw new Error('Installment has been waived');
        }
        const user = installment.userId;
        const loan = installment.loanId;
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
            await PaymentTransaction_1.default.create({
                installmentId: installment._id,
                loanId: loan._id,
                userId: userId,
                amount: amountInPKR,
                currency: 'PKR',
                status: PaymentTransaction_1.PaymentStatus.PENDING,
                paymentMethod: PaymentTransaction_1.PaymentMethod.STRIPE_CARD,
                stripeSessionId: session.id,
                stripePaymentIntentId: session.payment_intent,
                metadata: {
                    installmentNumber: installment.installmentNumber,
                },
            });
            logger_1.default.info('Payment session created', {
                sessionId: session.id,
                installmentId,
                amount: amountInPKR,
            });
            return {
                sessionId: session.id,
                sessionUrl: session.url,
                paymentIntentId: session.payment_intent,
                amount: amountInPKR,
                currency: 'PKR',
                expiresAt: session.expires_at,
            };
        }
        catch (error) {
            logger_1.default.error('Failed to create Stripe session', {
                error: error.message,
                installmentId,
            });
            throw new Error(`Stripe error: ${error.message}`);
        }
    }
    /**
     * Verify payment session status
     */
    async verifyPaymentSession(sessionId) {
        if (!stripe) {
            throw new Error('Stripe is not configured');
        }
        try {
            const session = await stripe.checkout.sessions.retrieve(sessionId);
            logger_1.default.info('Payment session retrieved', {
                sessionId,
                status: session.payment_status,
            });
            return {
                status: session.payment_status,
                paid: session.payment_status === 'paid',
                installmentId: session.metadata?.installmentId,
                paymentIntentId: session.payment_intent,
                amount: session.amount_total ? session.amount_total / 100 : undefined,
            };
        }
        catch (error) {
            logger_1.default.error('Failed to verify payment session', {
                error: error.message,
                sessionId,
            });
            throw new Error(`Stripe verification error: ${error.message}`);
        }
    }
    /**
     * Handle Stripe webhook events
     */
    async handleWebhook(payload, signature) {
        if (!stripe) {
            throw new Error('Stripe is not configured');
        }
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) {
            logger_1.default.warn('STRIPE_WEBHOOK_SECRET not configured, skipping signature verification');
        }
        let event;
        try {
            // Verify webhook signature
            if (webhookSecret) {
                event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
            }
            else {
                event = JSON.parse(payload.toString());
            }
        }
        catch (error) {
            logger_1.default.error('Webhook signature verification failed', {
                error: error.message,
            });
            throw new Error(`Webhook Error: ${error.message}`);
        }
        logger_1.default.info('Webhook event received', {
            type: event.type,
            id: event.id,
        });
        // Handle the event
        switch (event.type) {
            case 'checkout.session.completed':
                await this.handleCheckoutSessionCompleted(event.data.object);
                break;
            case 'payment_intent.succeeded':
                await this.handlePaymentIntentSucceeded(event.data.object);
                break;
            case 'payment_intent.payment_failed':
                await this.handlePaymentIntentFailed(event.data.object);
                break;
            case 'charge.refunded':
                await this.handleChargeRefunded(event.data.object);
                break;
            default:
                logger_1.default.info('Unhandled webhook event type', { type: event.type });
        }
        return { received: true, processed: true };
    }
    /**
     * Handle successful checkout session
     */
    async handleCheckoutSessionCompleted(session) {
        const installmentId = session.metadata?.installmentId;
        const loanId = session.metadata?.loanId;
        if (!installmentId || !loanId) {
            logger_1.default.error('Missing metadata in checkout session', { sessionId: session.id });
            return;
        }
        try {
            const installment = await Installment_1.default.findById(installmentId);
            if (!installment) {
                logger_1.default.error('Installment not found', { installmentId });
                return;
            }
            // Update installment status
            installment.status = Installment_1.InstallmentStatus.PAID;
            installment.paidDate = new Date();
            installment.stripePaymentIntentId = session.payment_intent;
            await installment.save();
            // Update payment transaction
            await PaymentTransaction_1.default.findOneAndUpdate({
                stripeSessionId: session.id,
                status: PaymentTransaction_1.PaymentStatus.PENDING,
            }, {
                status: PaymentTransaction_1.PaymentStatus.SUCCESS,
                stripePaymentIntentId: session.payment_intent,
                stripeChargeId: session.latest_charge,
                metadata: {
                    paymentStatus: session.payment_status,
                    completedAt: new Date(),
                },
            });
            // Update loan balances
            const loan = await Loan_1.default.findById(loanId);
            if (loan) {
                loan.totalRepaid += installment.amount;
                loan.outstandingBalance = Math.max(0, loan.outstandingBalance - installment.totalDue);
                loan.totalFines += installment.fineAmount;
                // Check if loan is completed
                if (loan.outstandingBalance <= 0) {
                    loan.status = Loan_1.LoanStatus.COMPLETED;
                    loan.completedAt = new Date();
                }
                await loan.save();
            }
            // Send payment confirmation email
            try {
                const user = await User_1.default.findById(installment.userId);
                if (user) {
                    await emailService_1.emailService.sendPaymentConfirmation(user.email, {
                        userName: user.fullName,
                        installmentNumber: installment.installmentNumber,
                        amount: installment.amount,
                        paidDate: installment.paidDate.toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                        }),
                        receiptUrl: session.receipt_url,
                        remainingBalance: loan?.outstandingBalance || 0,
                    }, user._id.toString());
                }
            }
            catch (emailError) {
                logger_1.default.error('Failed to send payment confirmation email', {
                    error: emailError.message,
                    installmentId,
                });
            }
            logger_1.default.info('Payment processed successfully', {
                installmentId,
                loanId,
                amount: installment.totalDue,
            });
        }
        catch (error) {
            logger_1.default.error('Error processing checkout session', {
                error: error.message,
                sessionId: session.id,
            });
        }
    }
    /**
     * Handle successful payment intent
     */
    async handlePaymentIntentSucceeded(paymentIntent) {
        logger_1.default.info('Payment intent succeeded', {
            paymentIntentId: paymentIntent.id,
            amount: paymentIntent.amount / 100,
        });
        // Update transaction if exists
        await PaymentTransaction_1.default.findOneAndUpdate({
            stripePaymentIntentId: paymentIntent.id,
        }, {
            status: PaymentTransaction_1.PaymentStatus.SUCCESS,
            stripeReceiptUrl: paymentIntent.charges?.data?.[0]?.receipt_url,
        });
    }
    /**
     * Handle failed payment intent
     */
    async handlePaymentIntentFailed(paymentIntent) {
        logger_1.default.warn('Payment intent failed', {
            paymentIntentId: paymentIntent.id,
            failureMessage: paymentIntent.last_payment_error?.message,
        });
        // Update transaction
        const transaction = await PaymentTransaction_1.default.findOneAndUpdate({
            stripePaymentIntentId: paymentIntent.id,
        }, {
            status: PaymentTransaction_1.PaymentStatus.FAILED,
            failureReason: paymentIntent.last_payment_error?.message || 'Payment failed',
        }, { new: true });
        // Send payment failure email
        if (transaction) {
            try {
                const installment = await Installment_1.default.findById(transaction.installmentId);
                const user = await User_1.default.findById(transaction.userId);
                if (user && installment) {
                    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
                    const retryUrl = `${baseUrl}/payments/retry/${installment._id}`;
                    await emailService_1.emailService.sendPaymentFailed(user.email, {
                        userName: user.fullName,
                        installmentNumber: installment.installmentNumber,
                        amount: installment.totalDue,
                        failureReason: paymentIntent.last_payment_error?.message || 'Payment failed',
                        retryUrl,
                    }, user._id.toString());
                }
            }
            catch (emailError) {
                logger_1.default.error('Failed to send payment failure email', {
                    error: emailError.message,
                    paymentIntentId: paymentIntent.id,
                });
            }
        }
    }
    /**
     * Handle refunded charge
     */
    async handleChargeRefunded(charge) {
        logger_1.default.info('Charge refunded', {
            chargeId: charge.id,
            amount: charge.amount_refunded / 100,
        });
        // Update transaction
        await PaymentTransaction_1.default.findOneAndUpdate({
            stripeChargeId: charge.id,
        }, {
            status: PaymentTransaction_1.PaymentStatus.REFUNDED,
            refundedAmount: charge.amount_refunded / 100,
            refundedAt: new Date(),
        });
    }
    /**
     * Get payment history for a user
     */
    async getPaymentHistory(userId, limit = 10) {
        const transactions = await PaymentTransaction_1.default.find({ userId })
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
    async refundPayment(paymentIntentId, reason) {
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
            logger_1.default.info('Refund processed', {
                paymentIntentId,
                refundId: refund.id,
                amount: refund.amount / 100,
            });
            return {
                refunded: true,
                refundId: refund.id,
                amount: refund.amount / 100,
            };
        }
        catch (error) {
            logger_1.default.error('Refund failed', {
                error: error.message,
                paymentIntentId,
            });
            throw new Error(`Refund error: ${error.message}`);
        }
    }
}
exports.paymentService = new PaymentService();
exports.default = exports.paymentService;
