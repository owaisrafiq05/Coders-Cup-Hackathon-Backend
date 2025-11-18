// src/controllers/admin.controller.ts
import { Request, Response } from 'express-serve-static-core';
import mongoose from 'mongoose';
import User, { IUser, UserStatus, UserRole } from '../models/User';
import RiskProfile, { IRiskProfile, RiskLevel } from '../models/RiskProfile';
import Loan, { ILoan, LoanStatus } from '../models/Loan';
import Installment from '../models/Installment';
import { riskScoringEngine } from '../ai/riskScoringEngine';
import { calculateMonthlyInstallment } from '../utils/calculations';

// Extend Request to include authenticated user info
interface AuthRequest extends Request {
  user?: {
    id: string;
    role: UserRole;
    email?: string;
  };
}

/**
 * GET /api/admin/users
 * Query: ?status=&page=&limit=&search=
 */
export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    const {
      status,
      page = '1',
      limit = '20',
      search,
    } = req.query as {
      status?: string;
      page?: string;
      limit?: string;
      search?: string;
    };

    const pageNum = Math.max(parseInt(page || '1', 10), 1);
    const limitNum = Math.max(parseInt(limit || '20', 10), 1);

    const filter: any = { role: UserRole.USER };
    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      filter.status = status;
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { fullName: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { city: searchRegex },
      ];
    }

    const totalCount = await User.countDocuments(filter);

    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    // Attach latest riskLevel if exists
    const userIds = users.map((u) => u._id);
    const riskProfiles = await RiskProfile.find({
      userId: { $in: userIds },
    }).lean();

    const riskMap = new Map<string, IRiskProfile>();
    riskProfiles.forEach((rp) => {
      riskMap.set(rp.userId.toString(), rp as unknown as IRiskProfile);
    });

    const responseUsers = users.map((u) => ({
      id: u._id.toString(),
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      city: u.city,
      province: u.province,
      monthlyIncome: u.monthlyIncome,
      employmentType: u.employmentType,
      status: u.status,
      createdAt: u.createdAt,
      riskLevel: riskMap.get(u._id.toString())?.riskLevel,
    }));

    return res.json({
      success: true,
      data: {
        users: responseUsers,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalCount / limitNum),
          totalCount,
        },
      },
    });
  } catch (error: any) {
    console.error('Error in getUsers:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
    });
  }
};

/**
 * PATCH /api/admin/users/:id/approve
 */
export const approveUser = async (req: AuthRequest, res: Response) => {
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
    user.approvedBy = req.user ? new mongoose.Types.ObjectId(req.user.id) : undefined;
    user.rejectionReason = undefined;

    await user.save();

    // NOTE: According to the doc, approval should automatically trigger risk scoring.
    // We fire-and-forget here; the explicit risk-score endpoint is still available.
    try {
      await riskScoringEngine.calculateRiskScore(user._id.toString(), {
        recalculate: true,
      });
    } catch (err) {
      console.error('Failed to auto-trigger risk scoring after approval:', err);
      // Do not fail the main request because of AI error.
    }

    return res.json({
      success: true,
      message: 'User approved successfully',
      data: {
        userId: user._id.toString(),
        status: UserStatus.APPROVED,
        approvedAt: user.approvedAt?.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error in approveUser:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to approve user',
    });
  }
};

/**
 * PATCH /api/admin/users/:id/reject
 */
export const rejectUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body as { reason?: string };

    if (!reason || !reason.trim()) {
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
    user.approvedAt = undefined;
    user.approvedBy = undefined;

    await user.save();

    return res.json({
      success: true,
      message: 'User rejected successfully',
      data: {
        userId: user._id.toString(),
        status: UserStatus.REJECTED,
        rejectionReason: reason,
      },
    });
  } catch (error: any) {
    console.error('Error in rejectUser:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reject user',
    });
  }
};

/**
 * POST /api/admin/risk-score/:userId
 * Triggers AI risk assessment via Gemini
 */
export const triggerRiskScore = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { recalculate } = req.body as { recalculate?: boolean };

    const user = await User.findById(userId);
    if (!user || user.role !== UserRole.USER) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Use existing risk profile if not recalc requested
    let existing = await RiskProfile.findOne({ userId: user._id });
    if (existing && !recalculate) {
      return res.json({
        success: true,
        message: 'Existing risk profile returned',
        data: {
          userId: user._id.toString(),
          riskLevel: existing.riskLevel,
          riskScore: existing.riskScore,
          riskReasons: existing.riskReasons,
          recommendedMaxLoan: existing.recommendedMaxLoan,
          recommendedTenure: existing.recommendedTenure,
          defaultProbability: existing.defaultProbability,
          calculatedAt: existing.lastCalculated.toISOString(),
        },
      });
    }

    // Call Gemini-based risk engine
    const profile = await riskScoringEngine.calculateRiskScore(user._id.toString(), {
      recalculate: !!recalculate,
    });

    return res.json({
      success: true,
      message: 'Risk score calculated successfully',
      data: {
        userId: user._id.toString(),
        riskLevel: profile.riskLevel,
        riskScore: profile.riskScore,
        riskReasons: profile.riskReasons,
        recommendedMaxLoan: profile.recommendedMaxLoan,
        recommendedTenure: profile.recommendedTenure,
        defaultProbability: profile.defaultProbability,
        calculatedAt: profile.lastCalculated.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error in triggerRiskScore:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to calculate risk score',
    });
  }
};

/**
 * GET /api/admin/risk-profile/:userId
 */
export const getRiskProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const riskProfile = await RiskProfile.findOne({ userId: user._id }).lean();
    const loans = await Loan.find({ userId: user._id }).lean();

    const loanHistory = loans.map((loan) => ({
      loanId: loan._id.toString(),
      amount: loan.principalAmount,
      status: loan.status,
      onTimePayments: 0, // Could be derived from Installment history if needed
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
  } catch (error: any) {
    console.error('Error in getRiskProfile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch risk profile',
    });
  }
};

/**
 * POST /api/admin/loans/:userId
 * Create and assign a loan to an approved user
 */
export const createLoanForUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { principalAmount, interestRate, tenureMonths, startDate, notes } =
      req.body as {
        principalAmount: number;
        interestRate: number;
        tenureMonths: number;
        startDate: string;
        notes?: string;
      };

    const user = await User.findById(userId);
    if (!user || user.status !== UserStatus.APPROVED) {
      return res.status(400).json({
        success: false,
        message: 'User must exist and be APPROVED before creating a loan',
      });
    }

    const start = new Date(startDate);
    if (isNaN(start.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid startDate',
      });
    }

    // Calculate EMI and schedule
    const { monthlyInstallment, totalAmount } = calculateMonthlyInstallment(
      principalAmount,
      interestRate,
      tenureMonths
    );

    const schedule = [];
    const startMonth = new Date(start);
    for (let i = 1; i <= tenureMonths; i++) {
      const due = new Date(
        startMonth.getFullYear(),
        startMonth.getMonth() + i,
        startMonth.getDate()
      );
      schedule.push({
        month: i,
        dueDate: due,
        amount: monthlyInstallment,
      });
    }

    const loan = await Loan.create({
      userId: user._id,
      createdBy: req.user ? req.user.id : undefined,
      principalAmount,
      interestRate,
      tenureMonths,
      monthlyInstallment,
      totalAmount,
      outstandingBalance: totalAmount,
      totalRepaid: 0,
      totalFines: 0,
      startDate: start,
      endDate: schedule[schedule.length - 1].dueDate,
      status: LoanStatus.ACTIVE,
      installmentSchedule: schedule,
      notes: notes || undefined,
    });

    return res.status(201).json({
      success: true,
      message: 'Loan created successfully',
      data: {
        loanId: loan._id.toString(),
        userId: user._id.toString(),
        principalAmount: loan.principalAmount,
        interestRate: loan.interestRate,
        tenureMonths: loan.tenureMonths,
        monthlyInstallment: loan.monthlyInstallment,
        totalAmount: loan.totalAmount,
        startDate: loan.startDate.toISOString(),
        endDate: loan.endDate.toISOString(),
        status: loan.status,
        installmentSchedule: loan.installmentSchedule.map((i) => ({
          month: i.month,
          dueDate: i.dueDate,
          amount: i.amount,
        })),
      },
    });
  } catch (error: any) {
    console.error('Error in createLoanForUser:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create loan',
    });
  }
};

/**
 * PUT /api/admin/loans/:loanId
 * Update loan notes and/or status (ACTIVE | CANCELLED)
 */
export const updateLoan = async (req: AuthRequest, res: Response) => {
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

    if (status && [LoanStatus.ACTIVE, LoanStatus.CANCELLED].includes(status)) {
      loan.status = status;
      updatedFields.push('status');
    }

    if (!updatedFields.length) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update',
      });
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
  } catch (error: any) {
    console.error('Error in updateLoan:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update loan',
    });
  }
};

/**
 * GET /api/admin/loans
 * Query: ?status=&userId=&page=&limit=
 */
export const getLoans = async (req: AuthRequest, res: Response) => {
  try {
    const {
      status,
      userId,
      page = '1',
      limit = '20',
    } = req.query as {
      status?: string;
      userId?: string;
      page?: string;
      limit?: string;
    };

    const pageNum = Math.max(parseInt(page || '1', 10), 1);
    const limitNum = Math.max(parseInt(limit || '20', 10), 1);

    const filter: any = {};
    if (status && ['ACTIVE', 'COMPLETED', 'DEFAULTED'].includes(status)) {
      filter.status = status;
    }
    if (userId && mongoose.isValidObjectId(userId)) {
      filter.userId = userId;
    }

    const totalCount = await Loan.countDocuments(filter);

    const loans = await Loan.find(filter)
      .populate('userId', 'fullName email')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const responseLoans = loans.map((loan: any) => ({
      id: loan._id.toString(),
      user: {
        id: loan.userId?._id?.toString(),
        fullName: loan.userId?.fullName,
        email: loan.userId?.email,
      },
      principalAmount: loan.principalAmount,
      interestRate: loan.interestRate,
      tenureMonths: loan.tenureMonths,
      monthlyInstallment: loan.monthlyInstallment,
      outstandingBalance: loan.outstandingBalance,
      totalRepaid: loan.totalRepaid,
      status: loan.status,
      startDate: loan.startDate,
      endDate: loan.endDate,
      createdAt: loan.createdAt,
    }));

    return res.json({
      success: true,
      data: {
        loans: responseLoans,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalCount / limitNum),
          totalCount,
        },
      },
    });
  } catch (error: any) {
    console.error('Error in getLoans:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch loans',
    });
  }
};

/**
 * GET /api/admin/installments
 * Query: ?status=&userId=&loanId=&page=&limit=
 */
export const getAllInstallments = async (req: AuthRequest, res: Response) => {
  try {
    const {
      status,
      userId,
      loanId,
      page = '1',
      limit = '50',
    } = req.query as {
      status?: string;
      userId?: string;
      loanId?: string;
      page?: string;
      limit?: string;
    };

    const pageNum = Math.max(parseInt(page || '1', 10), 1);
    const limitNum = Math.max(parseInt(limit || '50', 10), 1);

    const filter: any = {};
    if (status && ['PENDING', 'PAID', 'OVERDUE', 'DEFAULTED'].includes(status)) {
      filter.status = status;
    }
    if (loanId && mongoose.isValidObjectId(loanId)) {
      filter.loanId = loanId;
    }

    // We need user filter via loan -> user
    let loanIdsFilter: mongoose.Types.ObjectId[] | undefined;
    if (userId && mongoose.isValidObjectId(userId)) {
      const userLoans = await Loan.find({ userId }).select('_id').lean();
      loanIdsFilter = userLoans.map((l) => l._id);
      filter.loanId = { $in: loanIdsFilter };
    }

    const totalCount = await Installment.countDocuments(filter);

    const installments = await Installment.find(filter)
      .sort({ dueDate: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate({
        path: 'loanId',
        select: 'principalAmount userId',
        populate: {
          path: 'userId',
          select: 'fullName email phone',
        },
      })
      .lean();

    const responseInstallments = installments.map((inst: any) => {
      const loan = inst.loanId;
      const user = loan?.userId;
      const dueDate = new Date(inst.dueDate);
      const now = new Date();
      const daysOverdue =
        inst.status === 'PENDING' || inst.status === 'OVERDUE' || inst.status === 'DEFAULTED'
          ? Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))
          : 0;

      return {
        id: inst._id.toString(),
        loan: loan
          ? {
              id: loan._id.toString(),
              principalAmount: loan.principalAmount,
            }
          : null,
        user: user
          ? {
              id: user._id.toString(),
              fullName: user.fullName,
              email: user.email,
              phone: user.phone,
            }
          : null,
        installmentNumber: inst.installmentNumber,
        amount: inst.amount,
        fineAmount: inst.fineAmount,
        totalDue: (inst.amount || 0) + (inst.fineAmount || 0),
        dueDate: inst.dueDate,
        paidDate: inst.paidDate,
        status: inst.status,
        daysOverdue,
      };
    });

    return res.json({
      success: true,
      data: {
        installments: responseInstallments,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalCount / limitNum),
          totalCount,
        },
      },
    });
  } catch (error: any) {
    console.error('Error in getAllInstallments:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch installments',
    });
  }
};

/**
 * GET /api/admin/defaults
 * Get all defaulted loans with AI insights
 */
export const getDefaults = async (req: AuthRequest, res: Response) => {
  try {
    const defaultedLoans = await Loan.find({ status: LoanStatus.DEFAULTED })
      .populate('userId', 'fullName email phone')
      .lean();

    const userIds = defaultedLoans.map((l) => l.userId?._id).filter(Boolean);
    const riskProfiles = await RiskProfile.find({
      userId: { $in: userIds },
    }).lean();

    const riskMap = new Map<string, IRiskProfile>();
    riskProfiles.forEach((rp) => riskMap.set(rp.userId.toString(), rp as unknown as IRiskProfile));

    const now = new Date();

    const defaultedLoansResponse = defaultedLoans.map((loan: any) => {
      const user = loan.userId;
      const rp = riskMap.get(user?._id?.toString());
      const defaultedAt = loan.defaultedAt ? new Date(loan.defaultedAt) : now;
      const daysInDefault = Math.max(
        0,
        Math.floor((now.getTime() - defaultedAt.getTime()) / (1000 * 60 * 60 * 24))
      );

      // Simple heuristic for aiPredictedDefault: if defaultProbability > 0.5
      const aiPredictedDefault = !!rp && (rp.defaultProbability || 0) > 0.5;

      return {
        id: loan._id.toString(),
        user: user
          ? {
              id: user._id.toString(),
              fullName: user.fullName,
              email: user.email,
              phone: user.phone,
              riskLevel: rp?.riskLevel || RiskLevel.MEDIUM,
            }
          : null,
        principalAmount: loan.principalAmount,
        outstandingBalance: loan.outstandingBalance,
        totalFines: loan.totalFines,
        defaultedAt: loan.defaultedAt,
        daysInDefault,
        missedInstallments: 0, // could be derived from installments history if needed
        aiPredictedDefault,
        recoveryProbability: rp?.defaultProbability
          ? 1 - rp.defaultProbability
          : undefined,
      };
    });

    const summary = {
      totalDefaulted: defaultedLoansResponse.length,
      totalOutstanding: defaultedLoansResponse.reduce(
        (sum, l) => sum + (l.outstandingBalance || 0),
        0
      ),
      averageDefaultTime:
        defaultedLoansResponse.length > 0
          ? defaultedLoansResponse.reduce((sum, l) => sum + l.daysInDefault, 0) /
            defaultedLoansResponse.length
          : 0,
    };

    return res.json({
      success: true,
      data: {
        defaultedLoans: defaultedLoansResponse,
        summary,
      },
    });
  } catch (error: any) {
    console.error('Error in getDefaults:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch defaulted loans',
    });
  }
};

/**
 * GET /api/admin/dashboard/stats
 */
export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const [usersCounts, loansAgg, installmentsAgg, risksAgg, recentLoans] = await Promise.all([
      // User stats
      (async () => {
        const total = await User.countDocuments({ role: UserRole.USER });
        const pending = await User.countDocuments({
          role: UserRole.USER,
          status: UserStatus.PENDING,
        });
        const approved = await User.countDocuments({
          role: UserRole.USER,
          status: UserStatus.APPROVED,
        });
        const rejected = await User.countDocuments({
          role: UserRole.USER,
          status: UserStatus.REJECTED,
        });
        return { total, pending, approved, rejected };
      })(),

      // Loan aggregates
      (async () => {
        const loans = await Loan.aggregate([
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              totalDisbursed: { $sum: '$principalAmount' },
              totalCollected: { $sum: '$totalRepaid' },
              totalOutstanding: { $sum: '$outstandingBalance' },
            },
          },
        ]);
        const base = {
          total: 0,
          active: 0,
          completed: 0,
          defaulted: 0,
          totalDisbursed: 0,
          totalCollected: 0,
          totalOutstanding: 0,
        };
        loans.forEach((l) => {
          base.total += l.count;
          if (l._id === LoanStatus.ACTIVE) base.active = l.count;
          if (l._id === LoanStatus.COMPLETED) base.completed = l.count;
          if (l._id === LoanStatus.DEFAULTED) base.defaulted = l.count;
          base.totalDisbursed += l.totalDisbursed || 0;
          base.totalCollected += l.totalCollected || 0;
          base.totalOutstanding += l.totalOutstanding || 0;
        });
        return base;
      })(),

      // Installments aggregates (basic)
      (async () => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const pending = await Installment.countDocuments({ status: 'PENDING' });
        const overdue = await Installment.countDocuments({ status: 'OVERDUE' });
        const def = await Installment.countDocuments({ status: 'DEFAULTED' });

        const dueThisMonth = await Installment.countDocuments({
          dueDate: { $gte: startOfMonth, $lte: endOfMonth },
        });

        const agg = await Installment.aggregate([
          {
            $match: {
              dueDate: { $gte: startOfMonth, $lte: endOfMonth },
            },
          },
          {
            $group: {
              _id: null,
              expectedCollection: {
                $sum: {
                  $add: ['$amount', '$fineAmount'],
                },
              },
            },
          },
        ]);

        return {
          pending,
          overdue,
          defaulted: def,
          dueThisMonth,
          expectedCollection: agg[0]?.expectedCollection || 0,
        };
      })(),

      // Risk distribution
      (async () => {
        const aggregation = await RiskProfile.aggregate([
          {
            $group: {
              _id: '$riskLevel',
              count: { $sum: 1 },
              aiPredictedDefaults: {
                $sum: {
                  $cond: [{ $gt: ['$defaultProbability', 0.5] }, 1, 0],
                },
              },
            },
          },
        ]);
        const base = {
          lowRisk: 0,
          mediumRisk: 0,
          highRisk: 0,
          aiPredictedDefaults: 0,
        };
        aggregation.forEach((r) => {
          if (r._id === RiskLevel.LOW) base.lowRisk = r.count;
          if (r._id === RiskLevel.MEDIUM) base.mediumRisk = r.count;
          if (r._id === RiskLevel.HIGH) base.highRisk = r.count;
          base.aiPredictedDefaults += r.aiPredictedDefaults || 0;
        });
        return base;
      })(),

      // Recent activity: just some last 10 loans for now
      (async () => {
        const loans = await Loan.find()
          .sort({ createdAt: -1 })
          .limit(10)
          .lean();
        return loans.map((loan) => ({
          type: 'LOAN_CREATED',
          description: `Loan of PKR ${loan.principalAmount} created for user ${loan.userId}`,
          timestamp: loan.createdAt,
        }));
      })(),
    ]);

    return res.json({
      success: true,
      data: {
        users: usersCounts,
        loans: loansAgg,
        installments: installmentsAgg,
        risk: risksAgg,
        recentActivity: recentLoans,
      },
    });
  } catch (error: any) {
    console.error('Error in getDashboardStats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats',
    });
  }
};

/**
 * POST /api/admin/waive-fine/:installmentId
 */
export const waiveFine = async (req: AuthRequest, res: Response) => {
  try {
    const { installmentId } = req.params;
    const { reason } = req.body as { reason?: string };

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Reason is required to waive fine',
      });
    }

    const installment = await Installment.findById(installmentId);
    if (!installment) {
      return res.status(404).json({
        success: false,
        message: 'Installment not found',
      });
    }

    const oldFineAmount = installment.fineAmount || 0;
    installment.fineAmount = 0;

    await installment.save();

    return res.json({
      success: true,
      message: 'Fine waived successfully',
      data: {
        installmentId: installment._id.toString(),
        oldFineAmount,
        newFineAmount: 0,
        waivedBy: req.user?.id || '',
        reason,
      },
    });
  } catch (error: any) {
    console.error('Error in waiveFine:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to waive fine',
    });
  }
};
