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
exports.verifyOtp = exports.sendOtp = exports.getMe = exports.logout = exports.refreshToken = exports.login = exports.register = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importStar(require("../models/User"));
const emailService_1 = require("../services/emailService");
// =========================
// JWT Helpers
// =========================
const ACCESS_TOKEN_EXPIRES_IN = '7d';
const REFRESH_TOKEN_EXPIRES_IN = '7d';
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
if (!JWT_ACCESS_SECRET || !JWT_REFRESH_SECRET) {
    // You can switch this to a logger if you have one
    console.warn('JWT secrets are not set in environment variables');
}
function signAccessToken(user) {
    return jsonwebtoken_1.default.sign({
        sub: user._id.toString(),
        role: user.role,
        userId: user._id.toString(),
    }, JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
}
function signRefreshToken(user) {
    return jsonwebtoken_1.default.sign({
        sub: user._id.toString(),
        role: user.role,
        type: 'refresh',
    }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
}
function verifyAccessToken(token) {
    return jsonwebtoken_1.default.verify(token, JWT_ACCESS_SECRET);
}
function verifyRefreshToken(token) {
    return jsonwebtoken_1.default.verify(token, JWT_REFRESH_SECRET);
}
// =========================
// OTP helpers
// =========================
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const otpStore = new Map();
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
// =========================
// Controllers
// =========================
// POST /api/auth/register
const register = async (req, res) => {
    try {
        const { fullName, cnic, phone, email, password, address, city, province, monthlyIncome, employmentType, employerName, } = req.body;
        // Basic validation (format-level – Mongoose will also validate)
        if (!fullName || !cnic || !phone || !email || !password || !address || !city || !province || monthlyIncome == null || !employmentType) {
            return res.status(400).json({
                success: false,
                message: 'All required fields must be provided.',
            });
        }
        // Normalize CNIC: remove non-digits, expect 13 digits
        const cnicDigits = cnic.replace(/\D/g, '');
        if (cnicDigits.length !== 13) {
            return res.status(400).json({
                success: false,
                message: 'CNIC must contain 13 digits.',
            });
        }
        // Check duplicates
        const existingEmail = await User_1.default.findOne({ email: email.toLowerCase() });
        if (existingEmail) {
            return res.status(400).json({
                success: false,
                message: 'Email already in use.',
            });
        }
        const existingPhone = await User_1.default.findOne({ phone });
        if (existingPhone) {
            return res.status(400).json({
                success: false,
                message: 'Phone number already in use.',
            });
        }
        const existingCnic = await User_1.default.findOne({ cnicNumber: cnicDigits });
        if (existingCnic) {
            return res.status(400).json({
                success: false,
                message: 'CNIC already in use.',
            });
        }
        // Create user (password will be hashed by pre-save hook)
        const user = new User_1.default({
            fullName,
            cnicNumber: cnicDigits,
            phone,
            email: email.toLowerCase(),
            passwordHash: password,
            address,
            city,
            province,
            monthlyIncome,
            employmentType,
            employerName,
            status: User_1.UserStatus.PENDING, // as per spec
            role: User_1.UserRole.USER,
        });
        await user.save();
        // Send OTP for verification
        try {
            const code = generateOtp();
            otpStore.set(user.email, {
                code,
                expiresAt: Date.now() + OTP_EXPIRY_MS,
            });
            await emailService_1.emailService.sendOTP(user.email, {
                userName: user.fullName,
                otpCode: code,
                expiryMinutes: 10,
            }, user._id.toString());
        }
        catch (emailError) {
            console.error('Failed to send OTP email on registration:', emailError);
            // Do NOT fail registration if email fails; just log
        }
        return res.status(201).json({
            success: true,
            message: 'Registration successful. Your account is pending approval.',
            data: {
                userId: user._id.toString(),
                email: user.email,
                status: 'PENDING',
            },
        });
    }
    catch (err) {
        console.error('Register error:', err);
        // Handle validation errors
        if (err.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: err.message,
            });
        }
        return res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
exports.register = register;
// POST /api/auth/login
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required.',
            });
        }
        // Find user including passwordHash
        const user = await User_1.default.findOne({ email: email.toLowerCase() }).select('+passwordHash');
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials.',
            });
        }
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials.',
            });
        }
        // Check status
        if (user.status === User_1.UserStatus.PENDING) {
            return res.status(403).json({
                success: false,
                message: 'Account is pending approval.',
            });
        }
        if (user.status === User_1.UserStatus.REJECTED) {
            return res.status(403).json({
                success: false,
                message: 'Account has been rejected.',
            });
        }
        // Update lastLogin
        user.lastLoginAt = new Date();
        await user.save();
        const accessToken = signAccessToken(user);
        const refreshToken = signRefreshToken(user);
        return res.json({
            success: true,
            message: 'Login successful.',
            data: {
                accessToken,
                refreshToken,
                user: {
                    id: user._id.toString(),
                    fullName: user.fullName,
                    email: user.email,
                    role: user.role,
                    status: user.status,
                },
            },
        });
    }
    catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
exports.login = login;
// POST /api/auth/refresh
const refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'Refresh token is required.',
            });
        }
        let payload;
        try {
            payload = verifyRefreshToken(refreshToken);
        }
        catch (err) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired refresh token.',
            });
        }
        if (!payload || payload.type !== 'refresh') {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token type.',
            });
        }
        const user = await User_1.default.findById(payload.sub);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User no longer exists.',
            });
        }
        const newAccessToken = signAccessToken(user);
        return res.json({
            success: true,
            data: {
                accessToken: newAccessToken,
            },
        });
    }
    catch (err) {
        console.error('Refresh token error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
exports.refreshToken = refreshToken;
// POST /api/auth/logout
const logout = async (req, res) => {
    // Stateless JWT logout – usually handled on client side by deleting tokens.
    // If you want token blacklisting, you can add that here.
    return res.json({
        success: true,
        message: 'Logged out successfully.',
    });
};
exports.logout = logout;
// GET /api/auth/me
const getMe = async (req, res) => {
    try {
        // Extract token from Authorization header (Bearer <token>)
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized.',
            });
        }
        const token = authHeader.split(' ')[1];
        let payload;
        try {
            payload = verifyAccessToken(token);
        }
        catch (err) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token.',
            });
        }
        const user = await User_1.default.findById(payload.sub);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.',
            });
        }
        return res.json({
            success: true,
            data: {
                id: user._id.toString(),
                fullName: user.fullName,
                email: user.email,
                phone: user.phone,
                role: user.role,
                status: user.status,
                city: user.city,
                province: user.province,
                monthlyIncome: user.monthlyIncome,
                employmentType: user.employmentType,
                createdAt: user.createdAt.toISOString(),
                lastLoginAt: user.lastLoginAt
                    ? user.lastLoginAt.toISOString()
                    : undefined,
            },
        });
    }
    catch (err) {
        console.error('GetMe error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
exports.getMe = getMe;
// =========================
// OTP Endpoints
// =========================
// POST /api/auth/send-otp
const sendOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required.',
            });
        }
        const user = await User_1.default.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.',
            });
        }
        const code = generateOtp();
        otpStore.set(user.email, {
            code,
            expiresAt: Date.now() + OTP_EXPIRY_MS,
        });
        await emailService_1.emailService.sendOTP(user.email, {
            userName: user.fullName,
            otpCode: code,
            expiryMinutes: 10,
        }, user._id.toString());
        return res.json({
            success: true,
            message: 'OTP sent successfully.',
        });
    }
    catch (err) {
        console.error('Send OTP error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
exports.sendOtp = sendOtp;
// POST /api/auth/verify-otp
const verifyOtp = async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) {
            return res.status(400).json({
                success: false,
                message: 'Email and code are required.',
            });
        }
        const entry = otpStore.get(email.toLowerCase());
        if (!entry) {
            return res.status(400).json({
                success: false,
                message: 'No OTP found for this email.',
            });
        }
        if (Date.now() > entry.expiresAt) {
            otpStore.delete(email.toLowerCase());
            return res.status(400).json({
                success: false,
                message: 'OTP has expired.',
            });
        }
        if (entry.code !== code) {
            return res.status(400).json({
                success: false,
                message: 'Invalid OTP code.',
            });
        }
        // OTP is valid
        otpStore.delete(email.toLowerCase());
        // Send welcome email after successful OTP verification
        const user = await User_1.default.findOne({ email: email.toLowerCase() });
        if (user) {
            try {
                await emailService_1.emailService.sendWelcome(user.email, {
                    userName: user.fullName,
                    email: user.email,
                }, user._id.toString());
            }
            catch (emailError) {
                console.error('Failed to send welcome email:', emailError);
                // Don't fail the verification if email fails
            }
        }
        return res.json({
            success: true,
            message: 'OTP verified successfully.',
        });
    }
    catch (err) {
        console.error('Verify OTP error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
exports.verifyOtp = verifyOtp;
