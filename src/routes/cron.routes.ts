// src/routes/cron.routes.ts
import { Router } from 'express';
import {
  runInstallmentReminders,
  runOverdueNotices,
} from '../controllers/cron.controller';

const router = Router();

/**
 * GET /api/cron/installment-reminders
 * Vercel Cron: Daily at 9:00 AM
 */
router.get('/installment-reminders', runInstallmentReminders);

/**
 * GET /api/cron/overdue-notices
 * Vercel Cron: Daily at 10:00 AM
 */
router.get('/overdue-notices', runOverdueNotices);

export default router;
