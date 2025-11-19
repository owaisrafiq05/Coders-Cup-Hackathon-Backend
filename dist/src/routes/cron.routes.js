"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/cron.routes.ts
const express_1 = require("express");
const cron_controller_1 = require("../controllers/cron.controller");
const router = (0, express_1.Router)();
/**
 * GET /api/cron/installment-reminders
 * Vercel Cron: Daily at 9:00 AM
 */
router.get('/installment-reminders', cron_controller_1.runInstallmentReminders);
/**
 * GET /api/cron/overdue-notices
 * Vercel Cron: Daily at 10:00 AM
 */
router.get('/overdue-notices', cron_controller_1.runOverdueNotices);
exports.default = router;
