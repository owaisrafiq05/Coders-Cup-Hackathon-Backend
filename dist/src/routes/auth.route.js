"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/auth.route.ts
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const router = (0, express_1.Router)();
/**
 * POST /api/auth/register
 * Public endpoint for user registration
 */
router.post('/register', auth_controller_1.register);
/**
 * POST /api/auth/login
 * Public endpoint for user authentication
 */
router.post('/login', auth_controller_1.login);
/**
 * POST /api/auth/refresh
 * Public endpoint to refresh access token
 */
router.post('/refresh', auth_controller_1.refreshToken);
/**
 * POST /api/auth/logout
 * Protected endpoint to invalidate tokens
 * (Currently stateless; just responds success)
 */
router.post('/logout', auth_controller_1.logout);
/**
 * GET /api/auth/me
 * Protected endpoint to get current user info
 * This reads the Bearer token directly in controller
 */
router.get('/me', auth_controller_1.getMe);
/**
 * POST /api/auth/send-otp
 * Send OTP to user's email using Nodemailer
 */
router.post('/send-otp', auth_controller_1.sendOtp);
/**
 * POST /api/auth/verify-otp
 * Verify OTP sent to user's email
 */
router.post('/verify-otp', auth_controller_1.verifyOtp);
exports.default = router;
