// src/jobs/installmentReminderJob.ts
import cron from 'node-cron';
import Installment, { InstallmentStatus } from '../models/Installment';
import User from '../models/User';
import { emailService } from '../services/emailService';
import { paymentService } from '../services/paymentService';
import logger from '../utils/logger';

/**
 * Installment Reminder Job
 * Sends reminder emails for pending installments based on due date proximity
 */

interface ReminderConfig {
  daysBeforeDue: number;
  maxReminders: number;
  minHoursBetweenReminders: number;
}

const REMINDER_CONFIG: ReminderConfig = {
  daysBeforeDue: 3, // Send reminder 3 days before due date
  maxReminders: 3, // Maximum 3 reminders per installment
  minHoursBetweenReminders: 24, // Minimum 24 hours between reminders
};

/**
 * Send reminder emails for installments that are due soon
 */
async function sendInstallmentReminders() {
  try {
    logger.info('Starting installment reminder job');

    const now = new Date();
    const reminderDate = new Date();
    reminderDate.setDate(reminderDate.getDate() + REMINDER_CONFIG.daysBeforeDue);

    // Find PENDING installments that:
    // 1. Are due within the next X days
    // 2. Haven't exceeded max reminders
    // 3. Haven't been reminded in the last 24 hours (or never reminded)
    const minTimeBetweenReminders = new Date(
      now.getTime() - REMINDER_CONFIG.minHoursBetweenReminders * 60 * 60 * 1000
    );

    const installments = await Installment.find({
      status: InstallmentStatus.PENDING,
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

    logger.info(`Found ${installments.length} installments for reminders`);

    let successCount = 0;
    let failureCount = 0;

    for (const installment of installments) {
      try {
        const user = installment.userId as any;
        if (!user || !user.email) {
          logger.warn(`No user found for installment ${installment._id}`);
          failureCount++;
          continue;
        }

        // Calculate days until due
        const daysUntilDue = Math.ceil(
          (installment.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Generate payment URL
        let paymentUrl: string | undefined;
        try {
          const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
          const paymentSession = await paymentService.createPaymentSession({
            installmentId: installment._id.toString(),
            userId: user._id.toString(),
            successUrl: `${baseUrl}/payment/success`,
            cancelUrl: `${baseUrl}/payment/cancel`,
          });
          paymentUrl = paymentSession.sessionUrl;
          logger.info(`Payment URL generated for installment ${installment._id}`);
        } catch (paymentError) {
          logger.warn(`Failed to create payment session for installment ${installment._id}:`, paymentError);
          // Continue sending reminder even if payment URL generation fails
        }

        // Send reminder email
        const emailSent = await emailService.sendInstallmentReminder(
          user.email,
          {
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
          },
          user._id.toString()
        );

        if (emailSent) {
          // Update installment reminder tracking
          installment.remindersSent += 1;
          installment.lastReminderSent = now;
          await installment.save();

          successCount++;
          logger.info(
            `Reminder sent for installment ${installment._id} (${installment.remindersSent}/${REMINDER_CONFIG.maxReminders})${paymentUrl ? ' with payment URL' : ''}`
          );
        } else {
          failureCount++;
          logger.error(`Failed to send reminder for installment ${installment._id}`);
        }

        // Add small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        failureCount++;
        logger.error(`Error processing installment ${installment._id}:`, error);
      }
    }

    logger.info(
      `Installment reminder job completed: ${successCount} sent, ${failureCount} failed`
    );
  } catch (error) {
    logger.error('Error in installment reminder job:', error);
  }
}

/**
 * Send overdue notices for installments past grace period
 */
async function sendOverdueNotices() {
  try {
    logger.info('Starting overdue notice job');

    const now = new Date();

    // Find installments that are overdue (past grace period)
    const overdueInstallments = await Installment.find({
      status: { $in: [InstallmentStatus.PENDING, InstallmentStatus.OVERDUE] },
      gracePeriodEndDate: { $lt: now },
      remindersSent: { $lt: REMINDER_CONFIG.maxReminders * 2 }, // Allow more reminders for overdue
    })
      .populate('userId')
      .populate('loanId');

    logger.info(`Found ${overdueInstallments.length} overdue installments`);

    let successCount = 0;
    let failureCount = 0;

    for (const installment of overdueInstallments) {
      try {
        const user = installment.userId as any;
        if (!user || !user.email) {
          logger.warn(`No user found for installment ${installment._id}`);
          failureCount++;
          continue;
        }

        // Update status to OVERDUE if still PENDING
        if (installment.status === InstallmentStatus.PENDING) {
          installment.status = InstallmentStatus.OVERDUE;
        }

        // Calculate days overdue
        const daysOverdue = Math.ceil(
          (now.getTime() - installment.gracePeriodEndDate.getTime()) /
            (1000 * 60 * 60 * 24)
        );

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
        let paymentUrl: string | undefined;
        try {
          const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
          const paymentSession = await paymentService.createPaymentSession({
            installmentId: installment._id.toString(),
            userId: user._id.toString(),
            successUrl: `${baseUrl}/payment/success`,
            cancelUrl: `${baseUrl}/payment/cancel`,
          });
          paymentUrl = paymentSession.sessionUrl;
          logger.info(`Payment URL generated for overdue installment ${installment._id}`);
        } catch (paymentError) {
          logger.warn(`Failed to create payment session for overdue installment ${installment._id}:`, paymentError);
          // Continue sending notice even if payment URL generation fails
        }

        // Send overdue notice
        const emailSent = await emailService.sendOverdueNotice(
          user.email,
          {
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
          },
          user._id.toString()
        );

        if (emailSent) {
          installment.remindersSent += 1;
          installment.lastReminderSent = now;
        }

        await installment.save();

        if (emailSent) {
          successCount++;
          logger.info(`Overdue notice sent for installment ${installment._id}${paymentUrl ? ' with payment URL' : ''}`);
        } else {
          failureCount++;
        }

        // Add small delay
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        failureCount++;
        logger.error(`Error processing overdue installment ${installment._id}:`, error);
      }
    }

    logger.info(
      `Overdue notice job completed: ${successCount} sent, ${failureCount} failed`
    );
  } catch (error) {
    logger.error('Error in overdue notice job:', error);
  }
}

/**
 * Initialize and start cron jobs
 */
export function startInstallmentReminderJobs() {
  // Run reminder job daily at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    logger.info('Triggered: Daily installment reminder job at 9:00 AM');
    await sendInstallmentReminders();
  });

  // Run overdue notice job daily at 10:00 AM
  cron.schedule('0 10 * * *', async () => {
    logger.info('Triggered: Daily overdue notice job at 10:00 AM');
    await sendOverdueNotices();
  });

  logger.info('✅ Installment reminder cron jobs initialized');
  logger.info('📧 Reminder emails: Daily at 9:00 AM');
  logger.info('⚠️  Overdue notices: Daily at 10:00 AM');
}

/**
 * Manual trigger for testing
 */
export async function triggerInstallmentReminders() {
  logger.info('Manual trigger: Sending installment reminders');
  await sendInstallmentReminders();
}

export async function triggerOverdueNotices() {
  logger.info('Manual trigger: Sending overdue notices');
  await sendOverdueNotices();
}
