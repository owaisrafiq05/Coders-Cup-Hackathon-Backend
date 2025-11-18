// src/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from 'express-serve-static-core';
import jwt from 'jsonwebtoken';

// Shape of the JWT payload (must match signAccessToken in auth.controller.ts)
interface JwtPayload {
  sub: string;                 // user id
  role: 'USER' | 'ADMIN';
  email?: string;
  iat?: number;
  exp?: number;
}

// What we attach to req.user
export interface AuthUser {
  id: string;
  role: 'USER' | 'ADMIN';
  email?: string;
}

// Extend Express Request type globally
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Missing or invalid Authorization header',
      });
    }

    const token = authHeader.split(' ')[1];

    // Use the same secret that was used to sign the access token
    const accessSecret = process.env.JWT_ACCESS_SECRET;
    if (!accessSecret) {
      console.error('JWT_ACCESS_SECRET is not defined in environment variables');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error',
      });
    }

    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, accessSecret) as JwtPayload;
    } catch (err) {
      console.error('JWT verification error:', err);
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Invalid or expired token',
      });
    }

    // Validate payload (we expect "sub" and "role")
    if (!decoded || !decoded.sub || !decoded.role) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Invalid token payload',
      });
    }

    // Attach user info to request
    req.user = {
      id: decoded.sub,
      role: decoded.role,
      email: decoded.email,
    };

    next();
  } catch (error) {
    console.error('authMiddleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};
