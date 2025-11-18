// src/routes/auth.route.ts
import { Router } from 'express';
import {
  register,
  login,
  refreshToken,
  logout,
  getMe,
  sendOtp,
  verifyOtp,
} from '../controllers/auth.controller';

const router = Router();

/**
 * POST /api/auth/register
 * Public endpoint for user registration
 */
router.post('/register', register);

/**
 * POST /api/auth/login
 * Public endpoint for user authentication
 */
router.post('/login', login);

/**
 * POST /api/auth/refresh
 * Public endpoint to refresh access token
 */
router.post('/refresh', refreshToken);

/**
 * POST /api/auth/logout
 * Protected endpoint to invalidate tokens
 * (Currently stateless; just responds success)
 */
router.post('/logout', logout);

/**
 * GET /api/auth/me
 * Protected endpoint to get current user info
 * This reads the Bearer token directly in controller
 */
router.get('/me', getMe);

/**
 * POST /api/auth/send-otp
 * Send OTP to user's email using Nodemailer
 */
router.post('/send-otp', sendOtp);

/**
 * POST /api/auth/verify-otp
 * Verify OTP sent to user's email
 */
router.post('/verify-otp', verifyOtp);

export default router;
