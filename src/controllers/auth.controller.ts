import { Request, Response } from 'express-serve-static-core';
import jwt from 'jsonwebtoken';
import User, { IUser, UserRole, UserStatus } from '../models/User';
import { emailService } from '../services/emailService';
import { riskScoringEngine } from '../ai/riskScoringEngine';

// =========================
// JWT Helpers
// =========================
const ACCESS_TOKEN_EXPIRES_IN = '7d';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET as string;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET as string;

if (!JWT_ACCESS_SECRET || !JWT_REFRESH_SECRET) {
  // You can switch this to a logger if you have one
  console.warn('JWT secrets are not set in environment variables');
}

function signAccessToken(user: IUser): string {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      userId: user._id.toString(),
    },
    JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );
}

function signRefreshToken(user: IUser): string {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      type: 'refresh',
    },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
}

function verifyAccessToken(token: string) {
  return jwt.verify(token, JWT_ACCESS_SECRET) as { sub: string; role: string };
}

function verifyRefreshToken(token: string) {
  return jwt.verify(token, JWT_REFRESH_SECRET) as {
    sub: string;
    role: string;
    type: string;
  };
}

// =========================
// OTP helpers
// =========================
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

const otpStore = new Map<
  string,
  {
    code: string;
    expiresAt: number;
  }
>();

function generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

// =========================
// Controllers
// =========================

// POST /api/auth/register
export const register = async (req: Request, res: Response) => {
  try {
    const {
      fullName,
      cnic,
      phone,
      email,
      password,
      address,
      city,
      province,
      monthlyIncome,
      employmentType,
      employerName,
    } = req.body as {
      fullName: string;
      cnic: string;
      phone: string;
      email: string;
      password: string;
      address: string;
      city: string;
      province: string;
      monthlyIncome: number;
      employmentType:
        | 'SALARIED'
        | 'SELF_EMPLOYED'
        | 'BUSINESS_OWNER'
        | 'DAILY_WAGE'
        | 'UNEMPLOYED';
      employerName?: string;
    };

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
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email already in use.',
      });
    }

    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number already in use.',
      });
    }

    const existingCnic = await User.findOne({ cnicNumber: cnicDigits });
    if (existingCnic) {
      return res.status(400).json({
        success: false,
        message: 'CNIC already in use.',
      });
    }

    // Create user (password will be hashed by pre-save hook)
    const user = new User({
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
      status: UserStatus.PENDING, // as per spec
      role: UserRole.USER,
    });

    await user.save();

    // Create initial risk profile for the user
    try {
      await riskScoringEngine.calculateRiskScore(user._id.toString(), {
        forceRecalculate: true,
      });
      console.log('Initial risk profile created for user:', user._id.toString());
    } catch (riskError) {
      console.error('Failed to create initial risk profile on registration:', riskError);
      // Do NOT fail registration if risk profile creation fails; just log
    }

    // Send OTP for verification
    try {
      const code = generateOtp();
      otpStore.set(user.email, {
        code,
        expiresAt: Date.now() + OTP_EXPIRY_MS,
      });
      await emailService.sendOTP(user.email, {
        userName: user.fullName,
        otpCode: code,
        expiryMinutes: 10,
      }, user._id.toString());
    } catch (emailError) {
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
    } as {
      success: boolean;
      message: string;
      data: {
        userId: string;
        email: string;
        status: 'PENDING';
      };
    });
  } catch (err: any) {
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

// POST /api/auth/login
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as {
      email: string;
      password: string;
    };

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
    }

    // Find user including passwordHash
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+passwordHash'
    );

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
    if (user.status === UserStatus.PENDING) {
      return res.status(403).json({
        success: false,
        message: 'Account is pending approval.',
      });
    }

    if (user.status === UserStatus.REJECTED) {
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
    } as {
      success: boolean;
      message: string;
      data: {
        accessToken: string;
        refreshToken: string;
        user: {
          id: string;
          fullName: string;
          email: string;
          role: 'USER' | 'ADMIN';
          status: 'PENDING' | 'APPROVED' | 'REJECTED';
        };
      };
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// POST /api/auth/refresh
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body as { refreshToken: string };

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required.',
      });
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (err) {
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

    const user = await User.findById(payload.sub);
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
    } as {
      success: boolean;
      data: {
        accessToken: string;
      };
    });
  } catch (err) {
    console.error('Refresh token error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// POST /api/auth/logout
export const logout = async (req: Request, res: Response) => {
  // Stateless JWT logout – usually handled on client side by deleting tokens.
  // If you want token blacklisting, you can add that here.
  return res.json({
    success: true,
    message: 'Logged out successfully.',
  } as {
    success: boolean;
    message: string;
  });
};

// GET /api/auth/me
export const getMe = async (req: Request, res: Response) => {
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
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token.',
      });
    }

    const user = await User.findById(payload.sub);
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
    } as {
      success: boolean;
      data: {
        id: string;
        fullName: string;
        email: string;
        phone: string;
        role: string;
        status: string;
        city: string;
        province: string;
        monthlyIncome: number;
        employmentType: string;
        createdAt: string;
        lastLoginAt?: string;
      };
    });
  } catch (err) {
    console.error('GetMe error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// =========================
// OTP Endpoints
// =========================

// POST /api/auth/send-otp
export const sendOtp = async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email: string };

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required.',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
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

    await emailService.sendOTP(user.email, {
      userName: user.fullName,
      otpCode: code,
      expiryMinutes: 10,
    }, user._id.toString());

    return res.json({
      success: true,
      message: 'OTP sent successfully.',
    });
  } catch (err) {
    console.error('Send OTP error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// POST /api/auth/verify-otp
export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body as { email: string; code: string };

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
    const user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      try {
        await emailService.sendWelcome(user.email, {
          userName: user.fullName,
          email: user.email,
        }, user._id.toString());
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
        // Don't fail the verification if email fails
      }
    }

    return res.json({
      success: true,
      message: 'OTP verified successfully.',
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};
