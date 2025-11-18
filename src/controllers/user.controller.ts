// src/controllers/user.controller.ts
import { Request, Response } from 'express-serve-static-core';
import jwt from 'jsonwebtoken';


import User from '../models/User';
import Loan, { LoanStatus } from '../models/Loan';
import Installment, { InstallmentStatus } from '../models/Installment';
import RiskProfile from '../models/RiskProfile';

interface JwtPayload {
  userId: string;
  role: string;
  iat?: number;
  exp?: number;
}

function getAuthUser(req: Request, res: Response): { userId: string; role: string } | null {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Unauthorized: Missing token' });
    return null;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || '') as JwtPayload;
    if (!decoded?.userId || !decoded?.role) {
      res.status(401).json({ success: false, message: 'Unauthorized: Invalid token' });
      return null;
    }
    if (decoded.role !== 'USER') {
      res.status(403).json({ success: false, message: 'Forbidden: USER role required' });
      return null;
    }
    return { userId: decoded.userId, role: decoded.role };
  } catch (err) {
    console.error('JWT verify error:', err);
    res.status(401).json({ success: false, message: 'Unauthorized: Invalid or expired token' });
    return null;
  }
}

/**
 * GET /api/user/profile
 * Protected (USER role)
 */
export const getProfile = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req, res);
  if (!authUser) return;

  try {
    const user = await User.findById(authUser.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const responseData = {
      id: user._id.toString(),
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      address: user.address,
      city: user.city,
      province: user.province,
      monthlyIncome: user.monthlyIncome,
      employmentType: user.employmentType,
      employerName: user.employerName,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
    };

    return res.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error('Error in getProfile:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * PUT /api/user/profile
 * Protected (USER role)
 * Allows updating limited fields
 */
export const updateProfile = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req, res);
  if (!authUser) return;

  try {
    const allowedFields: Array<'phone' | 'address' | 'monthlyIncome' | 'employerName'> = [
      'phone',
      'address',
      'monthlyIncome',
      'employerName',
    ];

    const updates: any = {};
    for (const field of allowedFields) {
      if (typeof req.body[field] !== 'undefined') {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields provided for update',
      });
    }

    // Basic phone validation (same pattern as model)
    if (updates.phone) {
      const phoneRegex = /^(\+92|0)?3\d{9}$/;
      if (!phoneRegex.test(updates.phone)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid Pakistani phone number',
        });
      }
    }

    const user = await User.findByIdAndUpdate(
      authUser.userId,
      { $set: updates },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const responseData = {
      id: user._id.toString(),
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      address: user.address,
      city: user.city,
      province: user.province,
      monthlyIncome: user.monthlyIncome,
      employmentType: user.employmentType,
      employerName: user.employerName,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
    };

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      data: responseData,
    });
  } catch (error) {
    console.error('Error in updateProfile:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * GET /api/user/loan
 * Protected (USER role)
 * Get user's active loan details
 */
export const getUserLoan = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req, res);
  if (!authUser) return;

  try {
    const loan = await Loan.findOne({
      userId: authUser.userId,
      status: LoanStatus.ACTIVE,
    });

    if (!loan) {
      return res.json({
        success: true,
        data: null, // No active loan
      });
    }

    const data = {
      id: loan._id.toString(),
      principalAmount: loan.principalAmount,
      interestRate: loan.interestRate,
      tenureMonths: loan.tenureMonths,
      monthlyInstallment: loan.monthlyInstallment,
      totalAmount: loan.totalAmount,
      outstandingBalance: loan.outstandingBalance,
      totalRepaid: loan.totalRepaid,
      totalFines: loan.totalFines,
      startDate: loan.startDate.toISOString(),
      endDate: loan.endDate.toISOString(),
      status: loan.status,
      installmentSchedule: loan.installmentSchedule.map((item) => ({
        month: item.month,
        dueDate: item.dueDate.toISOString(),
        amount: item.amount,
      })),
      createdAt: loan.createdAt.toISOString(),
    };

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error in getUserLoan:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * GET /api/user/installments
 * Protected (USER role)
 * Query params: ?status=PENDING&page=1&limit=10
 */
export const getUserInstallments = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req, res);
  if (!authUser) return;

  try {
    const { status, page = '1', limit = '10' } = req.query;

    const pageNum = Math.max(parseInt(page as string, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit as string, 10) || 10, 1), 100);

    const filter: any = {
      userId: authUser.userId,
    };

    if (status && typeof status === 'string') {
      if (!Object.values(InstallmentStatus).includes(status as InstallmentStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status filter',
        });
      }
      filter.status = status;
    }

    const skip = (pageNum - 1) * limitNum;

    const [installments, totalCount] = await Promise.all([
      Installment.find(filter)
        .sort({ dueDate: 1, installmentNumber: 1 })
        .skip(skip)
        .limit(limitNum),
      Installment.countDocuments(filter),
    ]);

    const installmentsData = installments.map((inst) => ({
      id: inst._id.toString(),
      installmentNumber: inst.installmentNumber,
      amount: inst.amount,
      fineAmount: inst.fineAmount,
      totalDue: inst.totalDue,
      dueDate: inst.dueDate.toISOString(),
      paidDate: inst.paidDate ? inst.paidDate.toISOString() : undefined,
      status: inst.status,
      daysOverdue: inst.daysOverdue,
      gracePeriodEndDate: inst.gracePeriodEndDate.toISOString(),
    }));

    const totalPages = Math.ceil(totalCount / limitNum) || 1;

    return res.json({
      success: true,
      data: {
        installments: installmentsData,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalCount,
          limit: limitNum,
        },
      },
    });
  } catch (error) {
    console.error('Error in getUserInstallments:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * GET /api/user/installment/:id
 * Protected (USER role)
 */
export const getUserInstallmentById = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req, res);
  if (!authUser) return;

  try {
    const { id } = req.params;

    const installment = await Installment.findOne({
      _id: id,
      userId: authUser.userId,
    });

    if (!installment) {
      return res.status(404).json({
        success: false,
        message: 'Installment not found',
      });
    }

    let paymentLink: string | undefined;

    if (
      installment.status !== InstallmentStatus.PAID &&
      installment.stripeSessionId
    ) {
      // Frontend URL-based payment link; adjust as per your frontend route
      const baseUrl = process.env.FRONTEND_URL || '';
      paymentLink = `${baseUrl}/pay/${installment.stripeSessionId}`;
    }

    const data = {
      id: installment._id.toString(),
      loanId: installment.loanId.toString(),
      installmentNumber: installment.installmentNumber,
      amount: installment.amount,
      fineAmount: installment.fineAmount,
      totalDue: installment.totalDue,
      dueDate: installment.dueDate.toISOString(),
      paidDate: installment.paidDate ? installment.paidDate.toISOString() : undefined,
      status: installment.status,
      daysOverdue: installment.daysOverdue,
      gracePeriodEndDate: installment.gracePeriodEndDate.toISOString(),
      stripeSessionId: installment.stripeSessionId,
      paymentLink,
    };

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error in getUserInstallmentById:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * GET /api/user/risk-profile
 * Protected (USER role)
 */
export const getUserRiskProfile = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req, res);
  if (!authUser) return;

  try {
    const riskProfile = await RiskProfile.findOne({
      userId: authUser.userId,
    });

    if (!riskProfile) {
      return res.json({
        success: true,
        data: null,
      });
    }

    const data = {
      riskLevel: riskProfile.riskLevel,
      riskScore: riskProfile.riskScore,
      riskReasons: riskProfile.riskReasons,
      recommendedMaxLoan: riskProfile.recommendedMaxLoan,
      lastCalculated: riskProfile.lastCalculated.toISOString(),
    };

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error in getUserRiskProfile:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};
