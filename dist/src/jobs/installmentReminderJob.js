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
exports.startInstallmentReminderJobs = startInstallmentReminderJobs;
exports.triggerInstallmentReminders = triggerInstallmentReminders;
exports.triggerOverdueNotices = triggerOverdueNotices;
// src/jobs/installmentReminderJob.ts
const node_cron_1 = __importDefault(require("node-cron"));
const Installment_1 = __importStar(require("../models/Installment"));
const emailService_1 = require("../services/emailService");
const paymentService_1 = require("../services/paymentService");
const logger_1 = __importDefault(require("../utils/logger"));
const REMINDER_CONFIG = {
    daysBeforeDue: 3, // Send reminder 3 days before due date
    maxReminders: 3, // Maximum 3 reminders per installment
    minHoursBetweenReminders: 24, // Minimum 24 hours between reminders
};
/**
 * Send reminder emails for installments that are due soon
 */
async function sendInstallmentReminders() {
    try {
        logger_1.default.info('Starting installment reminder job');
        const now = new Date();
        const reminderDate = new Date();
        reminderDate.setDate(reminderDate.getDate() + REMINDER_CONFIG.daysBeforeDue);
        // Find PENDING installments that:
        // 1. Are due within the next X days
        // 2. Haven't exceeded max reminders
        // 3. Haven't been reminded in the last 24 hours (or never reminded)
        const minTimeBetweenReminders = new Date(now.getTime() - REMINDER_CONFIG.minHoursBetweenReminders * 60 * 60 * 1000);
        const installments = await Installment_1.default.find({
            status: Installment_1.InstallmentStatus.PENDING,
            dueDate: {
                $gte: now, // Due date is in the future
                $lte: reminderDate, // But within reminder window
            },
            remindersSent: { $lt: REMINDER_CONFIG.maxReminders },
            $or: [
                { lastReminderSent: { $exists: false } }, // Never sent reminder
                { lastReminderSent: { $lt: minTimeBetweenReminders } }, // Last reminder was long ago
            ],
        })
            .populate('userId')
            .populate('loanId');
        logger_1.default.info(`Found ${installments.length} installments for reminders`);
        let successCount = 0;
        let failureCount = 0;
        for (const installment of installments) {
            try {
                const user = installment.userId;
                if (!user || !user.email) {
                    logger_1.default.warn(`No user found for installment ${installment._id}`);
                    failureCount++;
                    continue;
                }
                // Calculate days until due
                const daysUntilDue = Math.ceil((installment.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                // Generate payment URL
                let paymentUrl;
                try {
                    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
                    const paymentSession = await paymentService_1.paymentService.createPaymentSession({
                        installmentId: installment._id.toString(),
                        userId: user._id.toString(),
                        successUrl: `${baseUrl}/payment/success`,
                        cancelUrl: `${baseUrl}/payment/cancel`,
                    });
                    paymentUrl = paymentSession.sessionUrl;
                    logger_1.default.info(`Payment URL generated for installment ${installment._id}`);
                }
                catch (paymentError) {
                    logger_1.default.warn(`Failed to create payment session for installment ${installment._id}:`, paymentError);
                    // Continue sending reminder even if payment URL generation fails
                }
                // Send reminder email
                const emailSent = await emailService_1.emailService.sendInstallmentReminder(user.email, {
                    userName: user.fullName,
                    installmentNumber: installment.installmentNumber,
                    amount: installment.totalDue,
                    dueDate: installment.dueDate.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                    }),
                    daysUntilDue,
                    paymentUrl,
                }, user._id.toString());
                if (emailSent) {
                    // Update installment reminder tracking
                    installment.remindersSent += 1;
                    installment.lastReminderSent = now;
                    await installment.save();
                    successCount++;
                    logger_1.default.info(`Reminder sent for installment ${installment._id} (${installment.remindersSent}/${REMINDER_CONFIG.maxReminders})${paymentUrl ? ' with payment URL' : ''}`);
                }
                else {
                    failureCount++;
                    logger_1.default.error(`Failed to send reminder for installment ${installment._id}`);
                }
                // Add small delay to avoid rate limiting
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            catch (error) {
                failureCount++;
                logger_1.default.error(`Error processing installment ${installment._id}:`, error);
            }
        }
        logger_1.default.info(`Installment reminder job completed: ${successCount} sent, ${failureCount} failed`);
    }
    catch (error) {
        logger_1.default.error('Error in installment reminder job:', error);
    }
}
/**
 * Send overdue notices for installments past grace period
 */
async function sendOverdueNotices() {
    try {
        logger_1.default.info('Starting overdue notice job');
        const now = new Date();
        // Find installments that are overdue (past grace period)
        const overdueInstallments = await Installment_1.default.find({
            status: { $in: [Installment_1.InstallmentStatus.PENDING, Installment_1.InstallmentStatus.OVERDUE] },
            gracePeriodEndDate: { $lt: now },
            remindersSent: { $lt: REMINDER_CONFIG.maxReminders * 2 }, // Allow more reminders for overdue
        })
            .populate('userId')
            .populate('loanId');
        logger_1.default.info(`Found ${overdueInstallments.length} overdue installments`);
        let successCount = 0;
        let failureCount = 0;
        for (const installment of overdueInstallments) {
            try {
                const user = installment.userId;
                if (!user || !user.email) {
                    logger_1.default.warn(`No user found for installment ${installment._id}`);
                    failureCount++;
                    continue;
                }
                // Update status to OVERDUE if still PENDING
                if (installment.status === Installment_1.InstallmentStatus.PENDING) {
                    installment.status = Installment_1.InstallmentStatus.OVERDUE;
                }
                // Calculate days overdue
                const daysOverdue = Math.ceil((now.getTime() - installment.gracePeriodEndDate.getTime()) /
                    (1000 * 60 * 60 * 24));
                // Calculate fine (example: 1% of amount per day, max 10%)
                const dailyFineRate = 0.01; // 1% per day
                const maxFineRate = 0.1; // 10% max
                const fineRate = Math.min(daysOverdue * dailyFineRate, maxFineRate);
                const newFine = Math.round(installment.amount * fineRate);
                if (newFine > installment.fineAmount) {
                    installment.fineAmount = newFine;
                    installment.totalDue = installment.amount + installment.fineAmount;
                }
                installment.daysOverdue = daysOverdue;
                // Generate payment URL
                let paymentUrl;
                try {
                    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
                    const paymentSession = await paymentService_1.paymentService.createPaymentSession({
                        installmentId: installment._id.toString(),
                        userId: user._id.toString(),
                        successUrl: `${baseUrl}/payment/success`,
                        cancelUrl: `${baseUrl}/payment/cancel`,
                    });
                    paymentUrl = paymentSession.sessionUrl;
                    logger_1.default.info(`Payment URL generated for overdue installment ${installment._id}`);
                }
                catch (paymentError) {
                    logger_1.default.warn(`Failed to create payment session for overdue installment ${installment._id}:`, paymentError);
                    // Continue sending notice even if payment URL generation fails
                }
                // Send overdue notice
                const emailSent = await emailService_1.emailService.sendOverdueNotice(user.email, {
                    userName: user.fullName,
                    installmentNumber: installment.installmentNumber,
                    amount: installment.amount,
                    dueDate: installment.dueDate.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                    }),
                    daysOverdue,
                    fineAmount: installment.fineAmount,
                    totalDue: installment.totalDue,
                    paymentUrl,
                }, user._id.toString());
                if (emailSent) {
                    installment.remindersSent += 1;
                    installment.lastReminderSent = now;
                }
                await installment.save();
                if (emailSent) {
                    successCount++;
                    logger_1.default.info(`Overdue notice sent for installment ${installment._id}${paymentUrl ? ' with payment URL' : ''}`);
                }
                else {
                    failureCount++;
                }
                // Add small delay
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            catch (error) {
                failureCount++;
                logger_1.default.error(`Error processing overdue installment ${installment._id}:`, error);
            }
        }
        logger_1.default.info(`Overdue notice job completed: ${successCount} sent, ${failureCount} failed`);
    }
    catch (error) {
        logger_1.default.error('Error in overdue notice job:', error);
    }
}
/**
 * Initialize and start cron jobs
 */
function startInstallmentReminderJobs() {
    // Run reminder job daily at 9:00 AM
    node_cron_1.default.schedule('0 9 * * *', async () => {
        logger_1.default.info('Triggered: Daily installment reminder job at 9:00 AM');
        await sendInstallmentReminders();
    });
    // Run overdue notice job daily at 10:00 AM
    node_cron_1.default.schedule('0 10 * * *', async () => {
        logger_1.default.info('Triggered: Daily overdue notice job at 10:00 AM');
        await sendOverdueNotices();
    });
    logger_1.default.info('✅ Installment reminder cron jobs initialized');
    logger_1.default.info('📧 Reminder emails: Daily at 9:00 AM');
    logger_1.default.info('⚠️  Overdue notices: Daily at 10:00 AM');
}
/**
 * Manual trigger for testing
 */
async function triggerInstallmentReminders() {
    logger_1.default.info('Manual trigger: Sending installment reminders');
    await sendInstallmentReminders();
}
async function triggerOverdueNotices() {
    logger_1.default.info('Manual trigger: Sending overdue notices');
    await sendOverdueNotices();
}
