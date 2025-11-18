// src/middlewares/roleCheck.middleware.ts
import { Request, Response, NextFunction } from 'express-serve-static-core';
import { AuthUser } from './auth.middleware';

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const user = req.user as AuthUser | undefined;

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: No authenticated user',
    });
  }

  if (user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: ADMIN role required',
    });
  }

  next();
};
