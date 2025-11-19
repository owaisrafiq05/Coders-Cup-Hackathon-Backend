"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runOverdueNotices = exports.runInstallmentReminders = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * GET /api/cron/installment-reminders
 * Vercel Cron endpoint for installment reminders
 */
const runInstallmentReminders = async (req, res) => {
    try {
        // Verify the request is from Vercel Cron
        const authHeader = req.headers.authorization;
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            logger_1.default.warn('Unauthorized cron job attempt - installment reminders');
            return res.status(401).json({
                success: false,
                message: 'Unauthorized',
            });
        }
        logger_1.default.info('Vercel Cron: Starting installment reminders job');
        // Import and run the job
        const { triggerInstallmentReminders } = require('../jobs/installmentReminderJob');
        // Run in background (non-blocking)
        triggerInstallmentReminders()
            .then(() => {
            logger_1.default.info('Vercel Cron: Installment reminders completed');
        })
            .catch((error) => {
            logger_1.default.error('Vercel Cron: Error in installment reminders:', error);
        });
        // Respond immediately
        return res.status(200).json({
            success: true,
            message: 'Installment reminder job started',
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        logger_1.default.error('Vercel Cron: Failed to start installment reminders:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to start cron job',
        });
    }
};
exports.runInstallmentReminders = runInstallmentReminders;
/**
 * GET /api/cron/overdue-notices
 * Vercel Cron endpoint for overdue notices
 */
const runOverdueNotices = async (req, res) => {
    try {
        // Verify the request is from Vercel Cron
        const authHeader = req.headers.authorization;
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            logger_1.default.warn('Unauthorized cron job attempt - overdue notices');
            return res.status(401).json({
                success: false,
                message: 'Unauthorized',
            });
        }
        logger_1.default.info('Vercel Cron: Starting overdue notices job');
        // Import and run the job
        const { triggerOverdueNotices } = require('../jobs/installmentReminderJob');
        // Run in background (non-blocking)
        triggerOverdueNotices()
            .then(() => {
            logger_1.default.info('Vercel Cron: Overdue notices completed');
        })
            .catch((error) => {
            logger_1.default.error('Vercel Cron: Error in overdue notices:', error);
        });
        // Respond immediately
        return res.status(200).json({
            success: true,
            message: 'Overdue notice job started',
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        logger_1.default.error('Vercel Cron: Failed to start overdue notices:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to start cron job',
        });
    }
};
exports.runOverdueNotices = runOverdueNotices;
