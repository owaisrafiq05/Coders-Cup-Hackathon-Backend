import { Request, Response } from 'express-serve-static-core';
import mongoose from 'mongoose';

import User, { UserStatus } from '../models/User';
import Loan, { LoanStatus } from '../models/Loan';
import Installment, { InstallmentStatus } from '../models/Installment';
import RiskProfile from '../models/RiskProfile';
import PaymentTransaction from '../models/PaymentTransaction';
import LoanRequest, { LoanRequestStatus } from '../models/LoanRequest';

import { riskScoringEngine } from '../ai/riskScoringEngine';
import logger from '../utils/logger';
import { emailService } from '../services/emailService';
import { paymentService } from '../services/paymentService';
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-10-29.clover',
    })
  : null;

// --------------------
// Helpers
// --------------------

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

function getPagination(query: any) {
  const page = Math.max(parseInt(query.page as string, 10) || DEFAULT_PAGE, 1);
  const limit = Math.max(parseInt(query.limit as string, 10) || DEFAULT_LIMIT, 1);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

// --------------------
// Admin Controllers
// --------------------

/**
 * GET /api/admin/users
 * Query: ?status=PENDING&page=1&limit=20&search=john
 */
export const getUsers = async (req: Request, res: Response) => {
  try {
    const { status, search } = req.query as {
      status?: 'PENDING' | 'APPROVED' | 'REJECTED';
      search?: string;
      page?: string;
      limit?: string;
    };

    const { page, limit, skip } = getPagination(req.query);

    const filter: any = {};
    if (status) {
      filter.status = status;
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [
        { fullName: regex },
        { email: regex },
        { phone: regex },
        { city: regex },
      ];
    }

    const [users, totalCount] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    // fetch risk profiles for these users
    const userIds = users.map((u) => u._id);
    const riskProfiles = await RiskProfile.find({ userId: { $in: userIds } });
    const riskByUserId = new Map(
      riskProfiles.map((rp) => [rp.userId.toString(), rp])
    );

    return res.json({
      success: true,
      data: {
        users: users.map((u) => {
          const rp = riskByUserId.get(u._id.toString());
          return {
            id: u._id.toString(),
            fullName: u.fullName,
            email: u.email,
            phone: u.phone,
            city: u.city,
            province: u.province,
            monthlyIncome: u.monthlyIncome,
            employmentType: u.employmentType,
            status: u.status,
            createdAt: u.createdAt.toISOString(),
            riskLevel: rp?.riskLevel,
          };
        }),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
        },
      },
    });
  } catch (err) {
    console.error('getUsers error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * PATCH /api/admin/users/:id/approve
 */
export const approveUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.status === UserStatus.APPROVED) {
      return res.status(400).json({
        success: false,
        message: 'User is already approved',
      });
    }

    user.status = UserStatus.APPROVED;
    user.approvedAt = new Date();
    await user.save();

    // Send approval email
    try {
      await emailService.sendAccountApproved(user.email, {
        userName: user.fullName,
        approvalDate: user.approvedAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
      }, user._id.toString());
    } catch (emailError) {
      logger.error('Failed to send approval email', { error: emailError });
      // Don't fail the approval if email fails
    }

    // Auto-trigger AI risk scoring (best-effort, non-blocking)
    try {
      logger.info('Starting risk score calculation (auto after approval)', {
        userId: user._id.toString(),
      });

      await riskScoringEngine.calculateRiskScore(user._id.toString(), {
        recalculate: true,
        triggerSource: 'USER_APPROVAL',
      });
    } catch (e) {
      console.error('Failed to auto-trigger risk scoring after approval:', e);
      // do not fail response if AI part fails
    }

    return res.json({
      success: true,
      message: 'User approved successfully',
      data: {
        userId: user._id.toString(),
        status: 'APPROVED' as const,
        approvedAt: user.approvedAt?.toISOString() || new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('approveUser error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * PATCH /api/admin/users/:id/reject
 */
export const rejectUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body as { reason: string };

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required',
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    user.status = UserStatus.REJECTED;
    user.rejectionReason = reason;
    await user.save();

    // Send rejection email
    try {
      await emailService.sendAccountRejected(user.email, {
        userName: user.fullName,
        reason: reason,
      }, user._id.toString());
    } catch (emailError) {
      logger.error('Failed to send rejection email', { error: emailError });
      // Don't fail the rejection if email fails
    }

    return res.json({
      success: true,
      message: 'User rejected successfully',
      data: {
        userId: user._id.toString(),
        status: 'REJECTED' as const,
        rejectionReason: reason,
      },
    });
  } catch (err) {
    console.error('rejectUser error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * POST /api/admin/risk-score/:userId
 * Triggers AI risk assessment
 */
export const triggerRiskScore = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { recalculate } = req.body as { recalculate?: boolean };

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const result = await riskScoringEngine.calculateRiskScore(userId, {
      recalculate: !!recalculate,
      triggerSource: 'MANUAL_ADMIN',
    });

    return res.json({
      success: true,
      message: 'Risk score calculated successfully',
      data: {
        userId: user._id.toString(),
        riskLevel: result.riskLevel,
        riskScore: result.riskScore,
        riskReasons: result.riskReasons,
        recommendedMaxLoan: result.recommendedMaxLoan,
        recommendedTenure: result.recommendedTenure,
        defaultProbability: result.defaultProbability,
        calculatedAt: result.lastCalculated.toISOString(), // <-- uses lastCalculated from IRiskProfile
      },
    });
  } catch (err) {
    console.error('triggerRiskScore error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * GET /api/admin/risk-profile/:userId
 */
export const getRiskProfile = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const riskProfile = await RiskProfile.findOne({ userId });
    const loans = await Loan.find({ userId });

    const loanHistory = loans.map((loan) => ({
      loanId: loan._id.toString(),
      amount: loan.principalAmount,
      status: loan.status,
      onTimePayments: 0,    // you can compute from Installment later
      latePayments: 0,
      missedPayments: 0,
    }));

    return res.json({
      success: true,
      data: {
        userId: user._id.toString(),
        user: {
          fullName: user.fullName,
          email: user.email,
          city: user.city,
          monthlyIncome: user.monthlyIncome,
          employmentType: user.employmentType,
        },
        riskProfile: riskProfile
          ? {
              riskLevel: riskProfile.riskLevel,
              riskScore: riskProfile.riskScore,
              riskReasons: riskProfile.riskReasons,
              recommendedMaxLoan: riskProfile.recommendedMaxLoan,
              recommendedTenure: riskProfile.recommendedTenure,
              defaultProbability: riskProfile.defaultProbability,
              lastCalculated: riskProfile.lastCalculated.toISOString(),
              version: riskProfile.version,
            }
          : null,
        loanHistory,
      },
    });
  } catch (err) {
    console.error('getRiskProfile error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * POST /api/admin/loans/:userId
 * Create and assign a loan to an approved user
 * Also creates Installment documents
 */
// ================================
// CREATE LOAN FOR USER (FIXED)
// ================================
export const createLoanForUser = async (req: Request, res: Response) => {
    try {
      const adminId = req.user?.id;
  
      const { userId } = req.params;
      const { principalAmount, interestRate, tenureMonths, startDate, notes } =
        req.body;
  
      if (!principalAmount || !interestRate || !tenureMonths || !startDate) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
      }
  
      const start = new Date(startDate);
      if (isNaN(start.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid startDate format",
        });
      }
  
      // ================================
      // EMI CALCULATION
      // ================================
      const monthlyRate = interestRate / 12 / 100;
  
      const monthlyInstallment =
        (principalAmount *
          monthlyRate *
          Math.pow(1 + monthlyRate, tenureMonths)) /
        (Math.pow(1 + monthlyRate, tenureMonths) - 1);
  
      const roundedEMI = Math.round(monthlyInstallment);
      const totalAmount = roundedEMI * tenureMonths;
  
      const endDate = new Date(start);
      endDate.setMonth(endDate.getMonth() + tenureMonths);
  
      const outstandingBalance = totalAmount;
  
      // ================================
      // 2. Save LOAN
      // ================================
      const loan = await Loan.create({
        userId,
        principalAmount,
        interestRate,
        tenureMonths,
        monthlyInstallment: roundedEMI,
        totalAmount,
        outstandingBalance,
        startDate: start,
        endDate,
        status: "ACTIVE",
        notes,
        createdBy: adminId,
      });
  
      // ================================
      // 3. Generate Installments (UPDATED)
      // ================================
      const installmentDocs = [];
  
      for (let i = 1; i <= tenureMonths; i++) {
        const due = new Date(start);
        due.setMonth(start.getMonth() + i);
  
        // Grace period = 10 days after due date
        const grace = new Date(due);
        grace.setDate(grace.getDate() + 10);
  
        installmentDocs.push({
          loanId: loan._id,
          userId,
          installmentNumber: i,         // NEW REQUIRED FIELD hahahaha
          amount: roundedEMI,
          totalDue: roundedEMI,         // NEW REQUIRED FIELD
          dueDate: due,
          gracePeriodEndDate: grace,    // NEW REQUIRED FIELD
          status: "PENDING",
        });
      }
  
      await Installment.insertMany(installmentDocs);
  
      // ================================
      // Send Loan Created Email
      // ================================
      try {
        const user = await User.findById(userId);
        if (user) {
          await emailService.sendLoanCreated(user.email, {
            userName: user.fullName,
            loanAmount: principalAmount,
            interestRate,
            tenureMonths,
            monthlyInstallment: roundedEMI,
            firstPaymentDate: installmentDocs[0].dueDate.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }),
          }, user._id.toString());
        }
      } catch (emailError) {
        logger.error('Failed to send loan created email', { error: emailError });
        // Don't fail the loan creation if email fails
      }

      // ================================
      // Response
      // ================================
      return res.status(201).json({
        success: true,
        message: "Loan created successfully",
        data: {
          loanId: loan._id,
          userId,
          principalAmount,
          interestRate,
          tenureMonths,
          monthlyInstallment: roundedEMI,
          totalAmount,
          outstandingBalance,
          startDate: start,
          endDate,
          status: loan.status,
          installmentSchedule: installmentDocs.map((i) => ({
            month: i.installmentNumber,
            dueDate: i.dueDate,
            amount: i.amount,
            gracePeriodEndDate: i.gracePeriodEndDate,
          })),
        },
      });
  
    } catch (error) {
      console.error("createLoanForUser error:", error);
      return res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  };
    

/**
 * GET /api/admin/loans/:loanId
 * Get detailed loan information with installments and risk analysis
 */
export const getLoanById = async (req: Request, res: Response) => {
  try {
    const { loanId } = req.params;

    const loan = await Loan.findById(loanId).populate('userId');
    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found',
      });
    }

    const userDoc = loan.userId as any;

    // Get all installments for this loan
    const installments = await Installment.find({ loanId: loan._id }).sort({ installmentNumber: 1 });

    // Calculate installment statistics
    const totalInstallments = installments.length;
    const paidInstallments = installments.filter(i => i.status === InstallmentStatus.PAID).length;
    const pendingInstallments = installments.filter(i => i.status === InstallmentStatus.PENDING).length;
    const overdueInstallments = installments.filter(i => i.status === InstallmentStatus.OVERDUE).length;
    const defaultedInstallments = installments.filter(i => i.status === InstallmentStatus.DEFAULTED).length;

    // Get user's risk profile
    const riskProfile = await RiskProfile.findOne({ userId: loan.userId });

    // Calculate loan-specific risk metrics
    const paymentHistory = {
      onTimePayments: installments.filter(i => i.status === InstallmentStatus.PAID && i.daysOverdue === 0).length,
      latePayments: installments.filter(i => i.status === InstallmentStatus.PAID && i.daysOverdue > 0).length,
      missedPayments: overdueInstallments + defaultedInstallments,
    };

    const paymentSuccessRate = totalInstallments > 0 
      ? ((paidInstallments / totalInstallments) * 100).toFixed(1) 
      : '0.0';

    // Risk analysis for this specific loan
    const loanRiskAnalysis = {
      userRiskProfile: riskProfile ? {
        riskLevel: riskProfile.riskLevel,
        riskScore: riskProfile.riskScore,
        defaultProbability: riskProfile.defaultProbability,
        lastCalculated: riskProfile.lastCalculated,
      } : null,
      loanPerformance: {
        paymentSuccessRate: parseFloat(paymentSuccessRate),
        onTimePaymentRate: totalInstallments > 0 
          ? ((paymentHistory.onTimePayments / totalInstallments) * 100).toFixed(1) 
          : '0.0',
        missedPaymentCount: paymentHistory.missedPayments,
      },
      loanHealthScore: (() => {
        let score = 100;
        // Deduct points for overdue/defaulted installments
        score -= (overdueInstallments * 10);
        score -= (defaultedInstallments * 20);
        // Deduct points based on outstanding balance ratio
        const outstandingRatio = loan.outstandingBalance / loan.totalAmount;
        if (outstandingRatio > 0.7) score -= 10;
        return Math.max(0, Math.min(100, score));
      })(),
    };

    return res.json({
      success: true,
      data: {
        loan: {
          id: loan._id.toString(),
          principalAmount: loan.principalAmount,
          interestRate: loan.interestRate,
          tenureMonths: loan.tenureMonths,
          monthlyInstallment: loan.monthlyInstallment,
          totalAmount: loan.totalAmount,
          outstandingBalance: loan.outstandingBalance,
          totalRepaid: loan.totalRepaid,
          totalFines: loan.totalFines,
          startDate: loan.startDate,
          endDate: loan.endDate,
          status: loan.status,
          notes: loan.notes,
          createdAt: loan.createdAt,
        },
        user: {
          id: userDoc._id.toString(),
          fullName: userDoc.fullName,
          email: userDoc.email,
          phone: userDoc.phone,
          city: userDoc.city,
          province: userDoc.province,
          monthlyIncome: userDoc.monthlyIncome,
          employmentType: userDoc.employmentType,
        },
        installmentStats: {
          total: totalInstallments,
          paid: paidInstallments,
          pending: pendingInstallments,
          overdue: overdueInstallments,
          defaulted: defaultedInstallments,
        },
        installments: installments.map(i => ({
          id: i._id.toString(),
          installmentNumber: i.installmentNumber,
          amount: i.amount,
          fineAmount: i.fineAmount,
          totalDue: i.totalDue,
          dueDate: i.dueDate,
          paidDate: i.paidDate,
          status: i.status,
          daysOverdue: i.daysOverdue,
          gracePeriodEndDate: i.gracePeriodEndDate,
        })),
        paymentHistory,
        riskAnalysis: loanRiskAnalysis,
      },
    });
  } catch (err) {
    console.error('getLoanById error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * PUT /api/admin/loans/:loanId
 */
export const updateLoan = async (req: Request, res: Response) => {
  try {
    const { loanId } = req.params;
    const { notes, status } = req.body as {
      notes?: string;
      status?: LoanStatus;
    };

    const loan = await Loan.findById(loanId);
    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found',
      });
    }

    const updatedFields: string[] = [];

    if (typeof notes === 'string') {
      loan.notes = notes;
      updatedFields.push('notes');
    }

    if (status && status !== loan.status) {
      loan.status = status;
      updatedFields.push('status');
    }

    await loan.save();

    return res.json({
      success: true,
      message: 'Loan updated successfully',
      data: {
        loanId: loan._id.toString(),
        updatedFields,
      },
    });
  } catch (err) {
    console.error('updateLoan error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * GET /api/admin/loans
 * Query: ?status=ACTIVE&userId=xxx&page=1&limit=20
 */
export const getLoans = async (req: Request, res: Response) => {
  try {
    const { status, userId } = req.query as {
      status?: 'ACTIVE' | 'COMPLETED' | 'DEFAULTED';
      userId?: string;
    };

    const { page, limit, skip } = getPagination(req.query);

    const filter: any = {};
    if (status) filter.status = status;
    if (userId) filter.userId = userId;

    const [loans, totalCount] = await Promise.all([
      Loan.find(filter)
        .populate('userId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Loan.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        loans: loans.map((loan) => {
          const userDoc = loan.userId as any;
          return {
            id: loan._id.toString(),
            user: {
              id: userDoc?._id?.toString(),
              fullName: userDoc?.fullName,
              email: userDoc?.email,
            },
            principalAmount: loan.principalAmount,
            interestRate: loan.interestRate,
            tenureMonths: loan.tenureMonths,
            monthlyInstallment: loan.monthlyInstallment,
            outstandingBalance: loan.outstandingBalance,
            totalRepaid: loan.totalRepaid,
            status: loan.status,
            startDate: loan.startDate.toISOString(),
            endDate: loan.endDate?.toISOString(),
            createdAt: loan.createdAt.toISOString(),
          };
        }),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
        },
      },
    });
  } catch (err) {
    console.error('getLoans error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * GET /api/admin/installments
 * Query: ?status=OVERDUE&userId=xxx&loanId=xxx&page=1&limit=50
 */
export const getAllInstallments = async (req: Request, res: Response) => {
  try {
    const { status, userId, loanId } = req.query as {
      status?: 'PENDING' | 'PAID' | 'OVERDUE' | 'DEFAULTED';
      userId?: string;
      loanId?: string;
    };

    const { page, limit, skip } = getPagination(req.query);

    const filter: any = {};
    if (status) filter.status = status;
    if (userId) filter.userId = userId;
    if (loanId) filter.loanId = loanId;

    const [installments, totalCount] = await Promise.all([
      Installment.find(filter)
        .populate('loanId')
        .populate('userId')
        .sort({ dueDate: 1 })
        .skip(skip)
        .limit(limit),
      Installment.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        installments: installments.map((inst) => {
          const loanDoc = inst.loanId as any;
          const userDoc = inst.userId as any;
          return {
            id: inst._id.toString(),
            loan: {
              id: loanDoc?._id?.toString(),
              principalAmount: loanDoc?.principalAmount,
            },
            user: {
              id: userDoc?._id?.toString(),
              fullName: userDoc?.fullName,
              email: userDoc?.email,
              phone: userDoc?.phone,
            },
            installmentNumber: inst.installmentNumber,
            amount: inst.amount,
            fineAmount: inst.fineAmount,
            totalDue: inst.totalDue,
            dueDate: inst.dueDate.toISOString(),
            paidDate: inst.paidDate ? inst.paidDate.toISOString() : undefined,
            status: inst.status,
            daysOverdue: inst.daysOverdue,
          };
        }),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
        },
      },
    });
  } catch (err) {
    console.error('getAllInstallments error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * GET /api/admin/defaults
 * Get all defaulted loans with AI insights (simplified)
 */
export const getDefaults = async (req: Request, res: Response) => {
  try {
    const defaultedLoans = await Loan.find({
      status: LoanStatus.DEFAULTED,
    }).populate('userId');

    // Also load risk profiles for these users so we can include riskLevel
    const userIds = defaultedLoans.map((l) => (l.userId as any)._id);
    const riskProfiles = await RiskProfile.find({
      userId: { $in: userIds },
    });
    const riskByUserId = new Map(
      riskProfiles.map((rp) => [rp.userId.toString(), rp.riskLevel])
    );
    //reviewed
    const data = defaultedLoans.map((loan) => {
      const userDoc = loan.userId as any;
      const daysInDefault = loan.defaultedAt
        ? Math.floor(
            (Date.now() - loan.defaultedAt.getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : 0;

      const userIdStr = userDoc?._id?.toString();
      const riskLevel = userIdStr
        ? riskByUserId.get(userIdStr) || 'UNKNOWN'
        : 'UNKNOWN';

      return {
        id: loan._id.toString(),
        user: {
          id: userIdStr,
          fullName: userDoc?.fullName,
          email: userDoc?.email,
          phone: userDoc?.phone,
          riskLevel,
        },
        principalAmount: loan.principalAmount,
        outstandingBalance: loan.outstandingBalance,
        totalFines: loan.totalFines,
        defaultedAt: loan.defaultedAt?.toISOString(),
        daysInDefault,
        missedInstallments: 0,         // placeholder, can compute from Installment
        aiPredictedDefault: false,     // placeholder, can integrate with predictDefaultRisk
        recoveryProbability: undefined,
      };
    });

    const summary = {
      totalDefaulted: data.length,
      totalOutstanding: data.reduce(
        (sum, l) => sum + (l.outstandingBalance || 0),
        0,
      ),
      averageDefaultTime:
        data.length > 0
          ? data.reduce((sum, l) => sum + (l.daysInDefault || 0), 0) /
            data.length
          : 0,
    };

    return res.json({
      success: true,
      data: {
        defaultedLoans: data,
        summary,
      },
    });
  } catch (err) {
    console.error('getDefaults error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * GET /api/admin/dashboard/stats
 */
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const [
      userCounts,
      loanCounts,
      installmentCounts,
      riskCounts,
      recentPayments,
      pendingUsers,
      recentLoans,
    ] = await Promise.all([
      // Users
      (async () => {
        const [total, pending, approved, rejected] = await Promise.all([
          User.countDocuments(),
          User.countDocuments({ status: UserStatus.PENDING }),
          User.countDocuments({ status: UserStatus.APPROVED }),
          User.countDocuments({ status: UserStatus.REJECTED }),
        ]);
        return { total, pending, approved, rejected };
      })(),

      // Loans
      (async () => {
        const [total, active, completed, defaulted, sums] = await Promise.all([
          Loan.countDocuments(),
          Loan.countDocuments({ status: LoanStatus.ACTIVE }),
          Loan.countDocuments({ status: LoanStatus.COMPLETED }),
          Loan.countDocuments({ status: LoanStatus.DEFAULTED }),
          Loan.aggregate([
            {
              $group: {
                _id: null,
                totalDisbursed: { $sum: '$principalAmount' },
                totalCollected: { $sum: '$totalRepaid' },
                totalOutstanding: { $sum: '$outstandingBalance' },
              },
            },
          ]),
        ]);

        const sumsDoc = sums[0] || {
          totalDisbursed: 0,
          totalCollected: 0,
          totalOutstanding: 0,
        };

        return {
          total,
          active,
          completed,
          defaulted,
          totalDisbursed: sumsDoc.totalDisbursed,
          totalCollected: sumsDoc.totalCollected,
          totalOutstanding: sumsDoc.totalOutstanding,
        };
      })(),

      // Installments
      (async () => {
        const [pending, overdue, defaulted, dueThisMonthAgg] = await Promise.all(
          [
            Installment.countDocuments({ status: InstallmentStatus.PENDING }),
            Installment.countDocuments({ status: InstallmentStatus.OVERDUE }),
            Installment.countDocuments({ status: InstallmentStatus.DEFAULTED }),
            Installment.aggregate([
              {
                $match: {
                  status: InstallmentStatus.PENDING,
                },
              },
              {
                $group: {
                  _id: null,
                  dueThisMonth: { $sum: 1 },
                  expectedCollection: { $sum: '$totalDue' },
                },
              },
            ]),
          ]
        );

        const dueThisMonthDoc = dueThisMonthAgg[0] || {
          dueThisMonth: 0,
          expectedCollection: 0,
        };

        return {
          pending,
          overdue,
          defaulted,
          dueThisMonth: dueThisMonthDoc.dueThisMonth,
          expectedCollection: dueThisMonthDoc.expectedCollection,
        };
      })(),

      // Risk
      (async () => {
        const [lowRisk, mediumRisk, highRisk] = await Promise.all([
          RiskProfile.countDocuments({ riskLevel: 'LOW' }),
          RiskProfile.countDocuments({ riskLevel: 'MEDIUM' }),
          RiskProfile.countDocuments({ riskLevel: 'HIGH' }),
        ]);

        // If later you store aiPredictedDefault flags, you can count them here.
        const aiPredictedDefaults = 0;

        return {
          lowRisk,
          mediumRisk,
          highRisk,
          aiPredictedDefaults,
        };
      })(),

      // Recent activity (simplified: recent payment transactions)
      (async () => {
        const payments = await PaymentTransaction.find()
          .sort({ createdAt: -1 })
          .limit(10);

        return payments.map((p) => ({
          type: 'PAYMENT',
          description: `Payment ${p.status} for installment ${p.installmentId}`,
          timestamp: p.createdAt.toISOString(),
        }));
      })(),
      
      // Pending users (last 5)
      (async () => {
        const pendingUsers = await User.find({ status: UserStatus.PENDING })
          .sort({ createdAt: -1 })
          .limit(5)
          .lean();

        return pendingUsers.map((u) => ({
          id: u._id,
          fullName: u.fullName,
          email: u.email,
          phone: u.phone,
          city: u.city,
          monthlyIncome: u.monthlyIncome,
          createdAt: u.createdAt,
        }));
      })(),
      
      // Recent loans (last 5)
      (async () => {
        const recentLoans = await Loan.find()
          .sort({ createdAt: -1 })
          .limit(5)
          .populate('userId', 'fullName email')
          .lean();

        return recentLoans.map((loan: any) => ({
          id: loan._id,
          principalAmount: loan.principalAmount,
          interestRate: loan.interestRate,
          tenureMonths: loan.tenureMonths,
          status: loan.status,
          outstandingBalance: loan.outstandingBalance,
          totalRepaid: loan.totalRepaid,
          createdAt: loan.createdAt,
          user: {
            id: loan.userId._id,
            fullName: loan.userId.fullName,
            email: loan.userId.email,
          },
        }));
      })(),
    ]);

    return res.json({
      success: true,
      data: {
        users: userCounts,
        loans: loanCounts,
        installments: installmentCounts,
        risk: riskCounts,
        recentActivity: recentPayments,
        pendingUsers,
        recentLoans,
      },
    });
  } catch (err) {
    console.error('getDashboardStats error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * GET /api/admin/loan-requests
 * Get all loan requests with filters
 */
export const getLoanRequests = async (req: Request, res: Response) => {
  try {
    const { status, userId } = req.query as {
      status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
      userId?: string;
    };

    const { page, limit, skip } = getPagination(req.query);

    const filter: any = {};
    if (status) filter.status = status;
    if (userId) filter.userId = userId;

    const [loanRequests, totalCount] = await Promise.all([
      LoanRequest.find(filter)
        .populate('userId')
        .populate('loanId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      LoanRequest.countDocuments(filter),
    ]);

    // Fetch risk profiles for all users in parallel
    const userIds = loanRequests.map((req) => (req.userId as any)?._id).filter(Boolean);
    const riskProfiles = await RiskProfile.find({ userId: { $in: userIds } });
    const riskProfileMap = new Map(
      riskProfiles.map((rp) => [rp.userId.toString(), rp])
    );

    return res.json({
      success: true,
      data: {
        loanRequests: loanRequests.map((request) => {
          const userDoc = request.userId as any;
          const riskProfile = riskProfileMap.get(userDoc?._id?.toString());
          
          return {
            id: request._id.toString(),
            user: {
              id: userDoc?._id?.toString(),
              fullName: userDoc?.fullName,
              email: userDoc?.email,
              phone: userDoc?.phone,
            },
            requestedAmount: request.requestedAmount,
            requestedTenure: request.requestedTenure,
            purpose: request.purpose,
            status: request.status,
            rejectionReason: request.rejectionReason,
            approvedAt: request.approvedAt?.toISOString(),
            rejectedAt: request.rejectedAt?.toISOString(),
            loanId: request.loanId?.toString(),
            createdAt: request.createdAt.toISOString(),
            // User financial info
            monthlyIncome: userDoc?.monthlyIncome,
            employmentType: userDoc?.employmentType,
            // Risk profile data
            riskLevel: riskProfile?.riskLevel,
            riskScore: riskProfile?.riskScore,
            recommendedMaxLoan: riskProfile?.recommendedMaxLoan,
            recommendedTenure: riskProfile?.recommendedTenure,
            defaultProbability: riskProfile?.defaultProbability,
            riskReasons: riskProfile?.riskReasons || [],
          };
        }),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
        },
      },
    });
  } catch (err) {
    console.error('getLoanRequests error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * POST /api/admin/loan-requests/:requestId/approve
 * Approve a loan request and create loan with installments
 */
export const approveLoanRequest = async (req: Request, res: Response) => {
  try {
    const adminId = req.user?.id;
    const { requestId } = req.params;
    const { interestRate, startDate, notes } = req.body as {
      interestRate: number;
      startDate?: string;
      notes?: string;
    };

    if (!interestRate) {
      return res.status(400).json({
        success: false,
        message: 'Interest rate is required',
      });
    }

    // Find the loan request
    const loanRequest = await LoanRequest.findById(requestId).populate('userId');
    if (!loanRequest) {
      return res.status(404).json({
        success: false,
        message: 'Loan request not found',
      });
    }

    if (loanRequest.status !== LoanRequestStatus.PENDING) {
      return res.status(400).json({
        success: false,
        message: `Loan request is already ${loanRequest.status.toLowerCase()}`,
      });
    }

    const userDoc = loanRequest.userId as any;
    if (!userDoc) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if user already has an active loan
    const existingActiveLoan = await Loan.findOne({
      userId: userDoc._id,
      status: LoanStatus.ACTIVE,
    });

    if (existingActiveLoan) {
      return res.status(400).json({
        success: false,
        message: 'User already has an active loan',
      });
    }

    // Parse start date
    const start = startDate ? new Date(startDate) : new Date();
    if (isNaN(start.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid startDate format',
      });
    }

    // Calculate EMI
    const principalAmount = loanRequest.requestedAmount;
    const tenureMonths = loanRequest.requestedTenure;
    const monthlyRate = interestRate / 12 / 100;

    const monthlyInstallment =
      (principalAmount *
        monthlyRate *
        Math.pow(1 + monthlyRate, tenureMonths)) /
      (Math.pow(1 + monthlyRate, tenureMonths) - 1);

    const roundedEMI = Math.round(monthlyInstallment);
    const totalAmount = roundedEMI * tenureMonths;

    const endDate = new Date(start);
    endDate.setMonth(endDate.getMonth() + tenureMonths);

    // Create loan
    const loan = await Loan.create({
      userId: userDoc._id,
      principalAmount,
      interestRate,
      tenureMonths,
      monthlyInstallment: roundedEMI,
      totalAmount,
      outstandingBalance: totalAmount,
      startDate: start,
      endDate,
      status: LoanStatus.ACTIVE,
      notes,
      createdBy: adminId,
    });

    // Generate Installments
    const installmentDocs = [];

    for (let i = 1; i <= tenureMonths; i++) {
      const due = new Date(start);
      due.setMonth(start.getMonth() + i);

      const grace = new Date(due);
      grace.setDate(grace.getDate() + 10);

      installmentDocs.push({
        loanId: loan._id,
        userId: userDoc._id,
        installmentNumber: i,
        amount: roundedEMI,
        totalDue: roundedEMI,
        dueDate: due,
        gracePeriodEndDate: grace,
        status: InstallmentStatus.PENDING,
      });
    }

    await Installment.insertMany(installmentDocs);

    // Update loan request status
    loanRequest.status = LoanRequestStatus.APPROVED;
    loanRequest.approvedBy = adminId as any;
    loanRequest.approvedAt = new Date();
    loanRequest.loanId = loan._id;
    await loanRequest.save();

    // Send approval email
    try {
      await emailService.sendLoanApproved(userDoc.email, {
        userName: userDoc.fullName,
        loanAmount: principalAmount,
        interestRate,
        tenureMonths,
        monthlyInstallment: roundedEMI,
        firstPaymentDate: installmentDocs[0].dueDate.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        approvalDate: new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
      }, userDoc._id.toString());
    } catch (emailError) {
      logger.error('Failed to send loan approval email', { error: emailError });
      // Don't fail the approval if email fails
    }

    return res.status(201).json({
      success: true,
      message: 'Loan request approved and loan created successfully',
      data: {
        requestId: loanRequest._id.toString(),
        loanId: loan._id.toString(),
        userId: userDoc._id.toString(),
        principalAmount,
        interestRate,
        tenureMonths,
        monthlyInstallment: roundedEMI,
        totalAmount,
        startDate: start.toISOString(),
        endDate: endDate.toISOString(),
        installmentsCreated: installmentDocs.length,
      },
    });
  } catch (error) {
    console.error('approveLoanRequest error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * POST /api/admin/loan-requests/:requestId/reject
 * Reject a loan request
 */
export const rejectLoanRequest = async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body as { reason: string };

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required',
      });
    }

    const loanRequest = await LoanRequest.findById(requestId).populate('userId');
    if (!loanRequest) {
      return res.status(404).json({
        success: false,
        message: 'Loan request not found',
      });
    }

    if (loanRequest.status !== LoanRequestStatus.PENDING) {
      return res.status(400).json({
        success: false,
        message: `Loan request is already ${loanRequest.status.toLowerCase()}`,
      });
    }

    loanRequest.status = LoanRequestStatus.REJECTED;
    loanRequest.rejectionReason = reason;
    loanRequest.rejectedAt = new Date();
    await loanRequest.save();

    // Send rejection email (you can create a separate email template if needed)
    const userDoc = loanRequest.userId as any;
    if (userDoc) {
      try {
        await emailService.sendAccountRejected(userDoc.email, {
          userName: userDoc.fullName,
          reason: `Your loan request for PKR ${loanRequest.requestedAmount.toLocaleString()} has been rejected. Reason: ${reason}`,
        }, userDoc._id.toString());
      } catch (emailError) {
        logger.error('Failed to send loan rejection email', { error: emailError });
      }
    }

    return res.json({
      success: true,
      message: 'Loan request rejected',
      data: {
        requestId: loanRequest._id.toString(),
        status: loanRequest.status,
        rejectionReason: reason,
      },
    });
  } catch (error) {
    console.error('rejectLoanRequest error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * POST /api/admin/waive-fine/:installmentId
 */
export const waiveFine = async (req: Request, res: Response) => {
  try {
    const { installmentId } = req.params;
    const { reason } = req.body as { reason: string };

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Reason is required',
      });
    }

    const installment = await Installment.findById(installmentId);
    if (!installment) {
      return res.status(404).json({
        success: false,
        message: 'Installment not found',
      });
    }

    const oldFineAmount = installment.fineAmount;
    installment.fineAmount = 0;
    installment.totalDue = installment.amount;
    await installment.save();

    const waivedBy = req.user?.id || 'SYSTEM';

    return res.json({
      success: true,
      message: 'Fine waived successfully',
      data: {
        installmentId: installment._id.toString(),
        oldFineAmount,
        newFineAmount: installment.fineAmount,
        waivedBy,
        reason,
      },
    });
  } catch (err) {
    console.error('waiveFine error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * POST /api/admin/reminders/installments
 * Manually trigger installment reminder emails
 */
export const triggerInstallmentReminders = async (req: Request, res: Response) => {
  try {
    const { triggerInstallmentReminders } = require('../jobs/installmentReminderJob');
    
    logger.info('Admin triggered installment reminders manually');
    
    // Run in background
    triggerInstallmentReminders()
      .then(() => {
        logger.info('Manual installment reminders completed');
      })
      .catch((error: any) => {
        logger.error('Error in manual installment reminders:', error);
      });

    return res.json({
      success: true,
      message: 'Installment reminder job triggered successfully. Emails will be sent in the background.',
    });
  } catch (err) {
    console.error('triggerInstallmentReminders error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * POST /api/admin/reminders/overdue
 * Manually trigger overdue notice emails
 */
export const triggerOverdueNotices = async (req: Request, res: Response) => {
  try {
    const { triggerOverdueNotices } = require('../jobs/installmentReminderJob');
    
    logger.info('Admin triggered overdue notices manually');
    
    // Run in background
    triggerOverdueNotices()
      .then(() => {
        logger.info('Manual overdue notices completed');
      })
      .catch((error: any) => {
        logger.error('Error in manual overdue notices:', error);
      });

    return res.json({
      success: true,
      message: 'Overdue notice job triggered successfully. Emails will be sent in the background.',
    });
  } catch (err) {
    console.error('triggerOverdueNotices error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * GET /api/admin/analytics
 * Get comprehensive analytics data for charts and insights
 */
export const getAnalytics = async (req: Request, res: Response) => {
  try {
    // Get month names helper
    const getMonthName = (monthIndex: number) => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return months[monthIndex];
    };

    const [
      defaultRateByTenure,
      loanSizeDistribution,
      repaymentTrend,
      incomeVsDefault,
      paymentBehavior,
      insights,
    ] = await Promise.all([
      // 1. Default Rate by Tenure
      (async () => {
        const tenureGroups = [
          { range: '6 months', min: 0, max: 6 },
          { range: '12 months', min: 7, max: 12 },
          { range: '18 months', min: 13, max: 18 },
          { range: '24 months', min: 19, max: 30 },
        ];

        const results = await Promise.all(
          tenureGroups.map(async (group) => {
            const [totalLoans, defaultedLoans] = await Promise.all([
              Loan.countDocuments({
                tenureMonths: { $gte: group.min, $lte: group.max },
              }),
              Loan.countDocuments({
                tenureMonths: { $gte: group.min, $lte: group.max },
                status: LoanStatus.DEFAULTED,
              }),
            ]);

            return {
              tenure: group.range,
              defaultRate: totalLoans > 0 ? (defaultedLoans / totalLoans) * 100 : 0,
              totalLoans,
            };
          })
        );

        return results;
      })(),

      // 2. Loan Size Distribution
      (async () => {
        const sizeRanges = [
          { range: '< 50K', min: 0, max: 50000 },
          { range: '50K-100K', min: 50000, max: 100000 },
          { range: '100K-150K', min: 100000, max: 150000 },
          { range: '> 150K', min: 150000, max: Infinity },
        ];

        const results = await Promise.all(
          sizeRanges.map(async (sizeRange) => {
            const query: any = { principalAmount: { $gte: sizeRange.min } };
            if (sizeRange.max !== Infinity) {
              query.principalAmount.$lt = sizeRange.max;
            }
            const count = await Loan.countDocuments(query);
            return {
              range: sizeRange.range,
              count,
            };
          })
        );

        return results;
      })(),

      // 3. Repayment Trend (Last 6 Months)
      (async () => {
        const now = new Date();
        const trends = [];

        for (let i = 5; i >= 0; i--) {
          const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const nextMonthDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

          const [paidInstallments, allInstallments] = await Promise.all([
            Installment.aggregate([
              {
                $match: {
                  dueDate: { $gte: monthDate, $lt: nextMonthDate },
                  status: InstallmentStatus.PAID,
                },
              },
              {
                $group: {
                  _id: null,
                  collected: { $sum: '$amount' },
                },
              },
            ]),
            Installment.aggregate([
              {
                $match: {
                  dueDate: { $gte: monthDate, $lt: nextMonthDate },
                },
              },
              {
                $group: {
                  _id: null,
                  expected: { $sum: '$amount' },
                },
              },
            ]),
          ]);

          trends.push({
            month: getMonthName(monthDate.getMonth()),
            collected: paidInstallments[0]?.collected || 0,
            expected: allInstallments[0]?.expected || 0,
          });
        }

        return trends;
      })(),

      // 4. Income vs Default (using user monthly income)
      (async () => {
        const loans = await Loan.find().populate('userId').lean();
        
        return loans.map((loan: any) => {
          const userDoc = loan.userId;
          return {
            income: userDoc?.monthlyIncome || 0,
            loanAmount: loan.principalAmount,
            defaulted: loan.status === LoanStatus.DEFAULTED,
          };
        });
      })(),

      // 5. Payment Behavior
      (async () => {
        const [onTime, late, overdue, defaulted] = await Promise.all([
          Installment.countDocuments({
            status: InstallmentStatus.PAID,
            daysOverdue: 0,
          }),
          Installment.countDocuments({
            status: InstallmentStatus.PAID,
            daysOverdue: { $gt: 0 },
          }),
          Installment.countDocuments({ status: InstallmentStatus.OVERDUE }),
          Installment.countDocuments({ status: InstallmentStatus.DEFAULTED }),
        ]);

        return [
          { name: 'On-Time', value: onTime, color: '#10b981' },
          { name: 'Late Paid', value: late, color: '#f59e0b' },
          { name: 'Overdue', value: overdue, color: '#ef4444' },
          { name: 'Defaulted', value: defaulted, color: '#7c3aed' },
        ];
      })(),

      // 6. Key Insights
      (async () => {
        // Average days to default
        const defaultedInstallments = await Installment.find({
          status: InstallmentStatus.DEFAULTED,
        });
        const avgDaysToDefault =
          defaultedInstallments.length > 0
            ? defaultedInstallments.reduce((sum, i) => sum + i.daysOverdue, 0) /
              defaultedInstallments.length
            : 0;

        // Collection efficiency (from last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        const [collected, expected] = await Promise.all([
          Installment.aggregate([
            {
              $match: {
                dueDate: { $gte: sixMonthsAgo },
                status: InstallmentStatus.PAID,
              },
            },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ]),
          Installment.aggregate([
            {
              $match: {
                dueDate: { $gte: sixMonthsAgo },
              },
            },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ]),
        ]);

        const collectedAmount = collected[0]?.total || 0;
        const expectedAmount = expected[0]?.total || 0;
        const collectionEfficiency =
          expectedAmount > 0 ? (collectedAmount / expectedAmount) * 100 : 0;

        // Average loan-to-income ratio
        const loansWithUsers = await Loan.find().populate('userId').lean();
        let totalRatio = 0;
        let validLoans = 0;

        loansWithUsers.forEach((loan: any) => {
          const userDoc = loan.userId;
          if (userDoc?.monthlyIncome && userDoc.monthlyIncome > 0) {
            totalRatio += loan.principalAmount / userDoc.monthlyIncome;
            validLoans++;
          }
        });

        const avgLoanToIncome = validLoans > 0 ? totalRatio / validLoans : 0;

        // Early default rate (defaults within 12 months)
        const [earlyDefaults, shortTermLoans] = await Promise.all([
          Loan.countDocuments({
            tenureMonths: { $lte: 12 },
            status: LoanStatus.DEFAULTED,
          }),
          Loan.countDocuments({ tenureMonths: { $lte: 12 } }),
        ]);

        const earlyDefaultRate =
          shortTermLoans > 0 ? (earlyDefaults / shortTermLoans) * 100 : 0;

        return {
          avgDaysToDefault: Math.round(avgDaysToDefault),
          collectionEfficiency: Math.round(collectionEfficiency * 10) / 10,
          avgLoanToIncome: Math.round(avgLoanToIncome * 10) / 10,
          earlyDefaultRate: Math.round(earlyDefaultRate * 10) / 10,
        };
      })(),
    ]);

    return res.json({
      success: true,
      data: {
        insights,
        defaultRateByTenure,
        loanSizeDistribution,
        repaymentTrend,
        incomeVsDefault,
        paymentBehavior,
      },
    });
  } catch (err) {
    console.error('getAnalytics error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * Get User by ID with Loans and Risk Profile
 * GET /api/admin/users/:userId
 */
export const getUserById = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Find user
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Get all loans for this user
    const loans = await Loan.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    // Calculate loan statistics
    const loanStats = {
      total: loans.length,
      active: loans.filter((l) => l.status === LoanStatus.ACTIVE).length,
      completed: loans.filter((l) => l.status === LoanStatus.COMPLETED).length,
      defaulted: loans.filter((l) => l.status === LoanStatus.DEFAULTED).length,
      totalBorrowed: loans.reduce((sum, l) => sum + l.principalAmount, 0),
      totalOutstanding: loans.reduce((sum, l) => sum + l.outstandingBalance, 0),
      totalRepaid: loans.reduce((sum, l) => sum + l.totalRepaid, 0),
      totalFines: loans.reduce((sum, l) => sum + l.totalFines, 0),
    };

    // Get risk profile
    const riskProfile = await RiskProfile.findOne({ userId }).lean();

    // Get all installments for this user's loans
    const loanIds = loans.map((l) => l._id);
    const installments = await Installment.find({ loanId: { $in: loanIds } })
      .sort({ dueDate: -1 })
      .lean();

    // Calculate installment statistics
    const installmentStats = {
      total: installments.length,
      paid: installments.filter((i) => i.status === InstallmentStatus.PAID).length,
      pending: installments.filter((i) => i.status === InstallmentStatus.PENDING).length,
      overdue: installments.filter((i) => i.status === InstallmentStatus.OVERDUE).length,
      defaulted: installments.filter((i) => i.status === InstallmentStatus.DEFAULTED).length,
    };

    // Payment behavior analysis
    const paidInstallments = installments.filter((i) => i.status === InstallmentStatus.PAID);
    const onTimePayments = paidInstallments.filter((i) => {
      if (!i.paidAt) return false;
      const paidDate = new Date(i.paidAt);
      const dueDate = new Date(i.dueDate);
      return paidDate <= dueDate;
    }).length;

    const latePayments = paidInstallments.filter((i) => {
      if (!i.paidAt) return false;
      const paidDate = new Date(i.paidAt);
      const dueDate = new Date(i.dueDate);
      return paidDate > dueDate;
    }).length;

    const paymentBehavior = {
      totalPayments: paidInstallments.length,
      onTimePayments,
      latePayments,
      missedPayments: installmentStats.overdue + installmentStats.defaulted,
      onTimeRate: paidInstallments.length > 0 
        ? Math.round((onTimePayments / paidInstallments.length) * 100) 
        : 0,
    };

    // Recent payment history (last 10 payments)
    const recentPayments = await PaymentTransaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('loanId', 'principalAmount tenureMonths')
      .lean();

    return res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          cnic: user.cnic,
          address: user.address,
          city: user.city,
          province: user.province,
          monthlyIncome: user.monthlyIncome,
          employmentType: user.employmentType,
          employerName: user.employerName,
          status: user.status,
          role: user.role,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        loanStats,
        loans: loans.map((loan) => ({
          id: loan._id,
          principalAmount: loan.principalAmount,
          interestRate: loan.interestRate,
          tenureMonths: loan.tenureMonths,
          monthlyInstallment: loan.monthlyInstallment,
          totalAmount: loan.totalAmount,
          outstandingBalance: loan.outstandingBalance,
          totalRepaid: loan.totalRepaid,
          totalFines: loan.totalFines,
          status: loan.status,
          nextInstallmentDate: loan.nextInstallmentDate,
          createdAt: loan.createdAt,
        })),
        installmentStats,
        paymentBehavior,
        riskProfile: riskProfile ? {
          riskLevel: riskProfile.riskLevel,
          riskScore: riskProfile.riskScore,
          defaultProbability: riskProfile.defaultProbability,
          recommendedMaxLoan: riskProfile.recommendedMaxLoan,
          recommendedTenure: riskProfile.recommendedTenure,
          riskReasons: riskProfile.riskReasons,
          lastUpdated: riskProfile.updatedAt,
        } : null,
        recentPayments: recentPayments.map((payment: any) => ({
          id: payment._id,
          amount: payment.amount,
          type: payment.type,
          status: payment.status,
          loanId: payment.loanId?._id,
          loanAmount: payment.loanId?.principalAmount,
          createdAt: payment.createdAt,
        })),
      },
    });
  } catch (err) {
    console.error('getUserById error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * POST /api/admin/installments/:installmentId/send-payment-link
 * Send payment link to user for a specific installment
 */
export const sendPaymentLink = async (req: Request, res: Response) => {
  try {
    const { installmentId } = req.params;

    // Find the installment with populated user data
    const installment = await Installment.findById(installmentId).populate('userId');
    if (!installment) {
      return res.status(404).json({
        success: false,
        message: 'Installment not found',
      });
    }

    const user = installment.userId as any;
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found for this installment',
      });
    }

    // Check if installment is already paid
    if (installment.status === InstallmentStatus.PAID) {
      return res.status(400).json({
        success: false,
        message: 'This installment has already been paid',
      });
    }

    // Calculate days until due
    const now = new Date();
    const daysUntilDue = Math.ceil((installment.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Generate or retrieve payment URL
    let paymentUrl: string;
    
    // If there's an existing Stripe session, try to get the actual Stripe URL
    if (installment.stripeSessionId && stripe) {
      try {
        const session = await stripe.checkout.sessions.retrieve(installment.stripeSessionId);
        // Check if session is still valid (not expired)
        const sessionExpired = session.expires_at && session.expires_at * 1000 < Date.now();
        
        if (!sessionExpired && session.url) {
          paymentUrl = session.url;
        } else {
          // Session expired, create a new one
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
          const newSession = await paymentService.createPaymentSession({
            installmentId: installment._id.toString(),
            userId: user._id.toString(),
            successUrl: `${frontendUrl}/dashboard/installments/success`,
            cancelUrl: `${frontendUrl}/dashboard/installments/${installment._id}`,
          });
          paymentUrl = newSession.sessionUrl;
        }
      } catch (error) {
        logger.error('Failed to retrieve Stripe session, creating new one', { error });
        // Create new session if retrieval fails
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const newSession = await paymentService.createPaymentSession({
          installmentId: installment._id.toString(),
          userId: user._id.toString(),
          successUrl: `${frontendUrl}/dashboard/installments/success`,
          cancelUrl: `${frontendUrl}/dashboard/installments/${installment._id}`,
        });
        paymentUrl = newSession.sessionUrl;
      }
    } else {
      // No existing session, create a new Stripe session
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      try {
        const newSession = await paymentService.createPaymentSession({
          installmentId: installment._id.toString(),
          userId: user._id.toString(),
          successUrl: `${frontendUrl}/dashboard/installments/success`,
          cancelUrl: `${frontendUrl}/dashboard/installments/${installment._id}`,
        });
        paymentUrl = newSession.sessionUrl;
      } catch (error) {
        logger.error('Failed to create Stripe session, using fallback URL', { error });
        // Fallback to dashboard URL if Stripe fails
        paymentUrl = `${frontendUrl}/dashboard/installments/${installment._id}`;
      }
    }

    // Send email with payment link
    await emailService.sendInstallmentReminder(user.email, {
      userName: user.fullName,
      installmentNumber: installment.installmentNumber,
      amount: installment.totalDue,
      dueDate: installment.dueDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      daysUntilDue: Math.max(daysUntilDue, 0),
      paymentUrl,
    }, user._id.toString());

    // Update reminder count and last sent date
    installment.remindersSent += 1;
    installment.lastReminderSent = new Date();
    await installment.save();

    return res.json({
      success: true,
      message: 'Payment link sent successfully',
      data: {
        installmentId: installment._id,
        userEmail: user.email,
        remindersSent: installment.remindersSent,
      },
    });
  } catch (err) {
    console.error('sendPaymentLink error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to send payment link',
    });
  }
};

/**
 * POST /api/admin/send-legal-notice/:loanId
 * Send legal notice to user for defaulted loan
 */
export const sendLegalNotice = async (req: Request, res: Response) => {
  try {
    const { loanId } = req.params;

    // Find the loan with populated user data
    const loan = await Loan.findById(loanId).populate('userId');
    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found',
      });
    }

    const user = loan.userId as any;
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found for this loan',
      });
    }

    // Check if loan is defaulted
    if (loan.status !== LoanStatus.DEFAULTED) {
      return res.status(400).json({
        success: false,
        message: 'Loan is not in defaulted status',
      });
    }

    // Get defaulted installments
    const installments = await Installment.find({
      loanId: loan._id,
      status: InstallmentStatus.DEFAULTED,
    });

    const defaultedCount = installments.length;
    const totalOverdue = installments.reduce((sum, inst) => sum + inst.totalDue, 0);

    // Send legal notice email
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
          .warning-box { background: #fef2f2; border: 2px solid #dc2626; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .details { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .amount { font-size: 28px; color: #dc2626; font-weight: bold; text-align: center; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .legal-text { font-size: 12px; color: #666; margin-top: 20px; padding: 15px; background: #f3f4f6; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ LEGAL NOTICE</h1>
          </div>
          <div class="content">
            <p>Dear ${user.fullName},</p>
            
            <div class="warning-box">
              <h2 style="color: #dc2626; margin-top: 0;">FORMAL NOTICE OF LOAN DEFAULT</h2>
              <p><strong>This is an official legal notice regarding your defaulted loan with Coders Cup Microfinance.</strong></p>
            </div>

            <div class="details">
              <h3>Loan Details:</h3>
              <p><strong>Loan ID:</strong> ${loan._id}</p>
              <p><strong>Original Principal:</strong> PKR ${loan.principalAmount.toLocaleString()}</p>
              <p><strong>Defaulted Installments:</strong> ${defaultedCount}</p>
              <p><strong>Days in Default:</strong> ${installments[0]?.daysOverdue || 0}</p>
            </div>

            <div class="amount">
              Total Outstanding: PKR ${loan.outstandingBalance.toLocaleString()}
            </div>

            <div class="warning-box">
              <h3 style="margin-top: 0;">IMMEDIATE ACTION REQUIRED</h3>
              <p>You are hereby notified that your loan account is in default status. This constitutes a serious breach of your loan agreement.</p>
              
              <p><strong>Legal Consequences:</strong></p>
              <ul>
                <li>Legal proceedings may be initiated against you</li>
                <li>Your credit score will be severely impacted</li>
                <li>Asset seizure procedures may be commenced</li>
                <li>Court judgments may be obtained</li>
                <li>Additional legal fees and penalties will be applied</li>
              </ul>
            </div>

            <p><strong>SETTLEMENT DEADLINE: 7 DAYS FROM RECEIPT OF THIS NOTICE</strong></p>

            <p>To avoid legal action, you must:</p>
            <ol>
              <li>Contact our office immediately at the details below</li>
              <li>Arrange payment of the outstanding amount</li>
              <li>Provide a written explanation for the default</li>
            </ol>

            <div class="details">
              <h3>Contact Information:</h3>
              <p><strong>Email:</strong> legal@coderscup.com</p>
              <p><strong>Phone:</strong> +92-XXX-XXXXXXX</p>
              <p><strong>Office Hours:</strong> Monday-Friday, 9:00 AM - 5:00 PM</p>
            </div>

            <div class="legal-text">
              <p><strong>LEGAL DISCLAIMER:</strong></p>
              <p>This notice is sent in accordance with the applicable laws and regulations governing microfinance operations in Pakistan. Failure to respond to this notice within the specified timeframe will result in immediate legal action without further warning. This communication is from a debt collector and is an attempt to collect a debt. Any information obtained will be used for that purpose.</p>
            </div>

            <p style="margin-top: 30px;">We strongly urge you to take this matter seriously and contact us immediately to resolve this issue.</p>

            <p>Sincerely,<br>
            <strong>Legal Department</strong><br>
            Coders Cup Microfinance</p>
          </div>
          <div class="footer">
            <p>© 2025 Coders Cup Microfinance. All rights reserved.</p>
            <p>This is an automated legal notice. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await emailService.sendEmail({
      to: user.email,
      subject: '⚠️ URGENT: Legal Notice - Loan Default',
      html,
      userId: user._id.toString(),
      emailType: 'OTHER' as any,
      metadata: {
        loanId: loan._id.toString(),
        noticeType: 'LEGAL_NOTICE',
        outstandingAmount: loan.outstandingBalance,
        defaultedInstallments: defaultedCount,
      },
    });

    logger.info('Legal notice sent', {
      loanId,
      userId: user._id.toString(),
      userEmail: user.email,
    });

    return res.json({
      success: true,
      message: 'Legal notice sent successfully',
      data: {
        loanId: loan._id,
        userEmail: user.email,
        outstandingAmount: loan.outstandingBalance,
      },
    });
  } catch (err) {
    console.error('sendLegalNotice error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to send legal notice',
    });
  }
};
