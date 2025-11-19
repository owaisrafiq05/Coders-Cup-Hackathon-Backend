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
exports.triggerOverdueNotices = exports.triggerInstallmentReminders = exports.waiveFine = exports.rejectLoanRequest = exports.approveLoanRequest = exports.getLoanRequests = exports.getDashboardStats = exports.getDefaults = exports.getAllInstallments = exports.getLoans = exports.updateLoan = exports.createLoanForUser = exports.getRiskProfile = exports.triggerRiskScore = exports.rejectUser = exports.approveUser = exports.getUsers = void 0;
const User_1 = __importStar(require("../models/User"));
const Loan_1 = __importStar(require("../models/Loan"));
const Installment_1 = __importStar(require("../models/Installment"));
const RiskProfile_1 = __importDefault(require("../models/RiskProfile"));
const PaymentTransaction_1 = __importDefault(require("../models/PaymentTransaction"));
const LoanRequest_1 = __importStar(require("../models/LoanRequest"));
const riskScoringEngine_1 = require("../ai/riskScoringEngine");
const logger_1 = __importDefault(require("../utils/logger"));
const emailService_1 = require("../services/emailService");
// --------------------
// Helpers
// --------------------
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
function getPagination(query) {
    const page = Math.max(parseInt(query.page, 10) || DEFAULT_PAGE, 1);
    const limit = Math.max(parseInt(query.limit, 10) || DEFAULT_LIMIT, 1);
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
const getUsers = async (req, res) => {
    try {
        const { status, search } = req.query;
        const { page, limit, skip } = getPagination(req.query);
        const filter = {};
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
            User_1.default.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            User_1.default.countDocuments(filter),
        ]);
        // fetch risk profiles for these users
        const userIds = users.map((u) => u._id);
        const riskProfiles = await RiskProfile_1.default.find({ userId: { $in: userIds } });
        const riskByUserId = new Map(riskProfiles.map((rp) => [rp.userId.toString(), rp]));
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
    }
    catch (err) {
        console.error('getUsers error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
exports.getUsers = getUsers;
/**
 * PATCH /api/admin/users/:id/approve
 */
const approveUser = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User_1.default.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }
        if (user.status === User_1.UserStatus.APPROVED) {
            return res.status(400).json({
                success: false,
                message: 'User is already approved',
            });
        }
        user.status = User_1.UserStatus.APPROVED;
        user.approvedAt = new Date();
        await user.save();
        // Send approval email
        try {
            await emailService_1.emailService.sendAccountApproved(user.email, {
                userName: user.fullName,
                approvalDate: user.approvedAt.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                }),
            }, user._id.toString());
        }
        catch (emailError) {
            logger_1.default.error('Failed to send approval email', { error: emailError });
            // Don't fail the approval if email fails
        }
        // Auto-trigger AI risk scoring (best-effort, non-blocking)
        try {
            logger_1.default.info('Starting risk score calculation (auto after approval)', {
                userId: user._id.toString(),
            });
            await riskScoringEngine_1.riskScoringEngine.calculateRiskScore(user._id.toString(), {
                recalculate: true,
                triggerSource: 'USER_APPROVAL',
            });
        }
        catch (e) {
            console.error('Failed to auto-trigger risk scoring after approval:', e);
            // do not fail response if AI part fails
        }
        return res.json({
            success: true,
            message: 'User approved successfully',
            data: {
                userId: user._id.toString(),
                status: 'APPROVED',
                approvedAt: user.approvedAt?.toISOString() || new Date().toISOString(),
            },
        });
    }
    catch (err) {
        console.error('approveUser error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
exports.approveUser = approveUser;
/**
 * PATCH /api/admin/users/:id/reject
 */
const rejectUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        if (!reason) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required',
            });
        }
        const user = await User_1.default.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }
        user.status = User_1.UserStatus.REJECTED;
        user.rejectionReason = reason;
        await user.save();
        // Send rejection email
        try {
            await emailService_1.emailService.sendAccountRejected(user.email, {
                userName: user.fullName,
                reason: reason,
            }, user._id.toString());
        }
        catch (emailError) {
            logger_1.default.error('Failed to send rejection email', { error: emailError });
            // Don't fail the rejection if email fails
        }
        return res.json({
            success: true,
            message: 'User rejected successfully',
            data: {
                userId: user._id.toString(),
                status: 'REJECTED',
                rejectionReason: reason,
            },
        });
    }
    catch (err) {
        console.error('rejectUser error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
exports.rejectUser = rejectUser;
/**
 * POST /api/admin/risk-score/:userId
 * Triggers AI risk assessment
 */
const triggerRiskScore = async (req, res) => {
    try {
        const { userId } = req.params;
        const { recalculate } = req.body;
        const user = await User_1.default.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }
        const result = await riskScoringEngine_1.riskScoringEngine.calculateRiskScore(userId, {
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
    }
    catch (err) {
        console.error('triggerRiskScore error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
exports.triggerRiskScore = triggerRiskScore;
/**
 * GET /api/admin/risk-profile/:userId
 */
const getRiskProfile = async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User_1.default.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }
        const riskProfile = await RiskProfile_1.default.findOne({ userId });
        const loans = await Loan_1.default.find({ userId });
        const loanHistory = loans.map((loan) => ({
            loanId: loan._id.toString(),
            amount: loan.principalAmount,
            status: loan.status,
            onTimePayments: 0, // you can compute from Installment later
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
    }
    catch (err) {
        console.error('getRiskProfile error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
exports.getRiskProfile = getRiskProfile;
/**
 * POST /api/admin/loans/:userId
 * Create and assign a loan to an approved user
 * Also creates Installment documents
 */
// ================================
// CREATE LOAN FOR USER (FIXED)
// ================================
const createLoanForUser = async (req, res) => {
    try {
        const adminId = req.user?.id;
        const { userId } = req.params;
        const { principalAmount, interestRate, tenureMonths, startDate, notes } = req.body;
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
        const monthlyInstallment = (principalAmount *
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
        const loan = await Loan_1.default.create({
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
                installmentNumber: i, // NEW REQUIRED FIELD
                amount: roundedEMI,
                totalDue: roundedEMI, // NEW REQUIRED FIELD
                dueDate: due,
                gracePeriodEndDate: grace, // NEW REQUIRED FIELD
                status: "PENDING",
            });
        }
        await Installment_1.default.insertMany(installmentDocs);
        // ================================
        // Send Loan Created Email
        // ================================
        try {
            const user = await User_1.default.findById(userId);
            if (user) {
                await emailService_1.emailService.sendLoanCreated(user.email, {
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
        }
        catch (emailError) {
            logger_1.default.error('Failed to send loan created email', { error: emailError });
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
    }
    catch (error) {
        console.error("createLoanForUser error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message,
        });
    }
};
exports.createLoanForUser = createLoanForUser;
/**
 * PUT /api/admin/loans/:loanId
 */
const updateLoan = async (req, res) => {
    try {
        const { loanId } = req.params;
        const { notes, status } = req.body;
        const loan = await Loan_1.default.findById(loanId);
        if (!loan) {
            return res.status(404).json({
                success: false,
                message: 'Loan not found',
            });
        }
        const updatedFields = [];
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
    }
    catch (err) {
        console.error('updateLoan error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
exports.updateLoan = updateLoan;
/**
 * GET /api/admin/loans
 * Query: ?status=ACTIVE&userId=xxx&page=1&limit=20
 */
const getLoans = async (req, res) => {
    try {
        const { status, userId } = req.query;
        const { page, limit, skip } = getPagination(req.query);
        const filter = {};
        if (status)
            filter.status = status;
        if (userId)
            filter.userId = userId;
        const [loans, totalCount] = await Promise.all([
            Loan_1.default.find(filter)
                .populate('userId')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Loan_1.default.countDocuments(filter),
        ]);
        return res.json({
            success: true,
            data: {
                loans: loans.map((loan) => {
                    const userDoc = loan.userId;
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
    }
    catch (err) {
        console.error('getLoans error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
exports.getLoans = getLoans;
/**
 * GET /api/admin/installments
 * Query: ?status=OVERDUE&userId=xxx&loanId=xxx&page=1&limit=50
 */
const getAllInstallments = async (req, res) => {
    try {
        const { status, userId, loanId } = req.query;
        const { page, limit, skip } = getPagination(req.query);
        const filter = {};
        if (status)
            filter.status = status;
        if (userId)
            filter.userId = userId;
        if (loanId)
            filter.loanId = loanId;
        const [installments, totalCount] = await Promise.all([
            Installment_1.default.find(filter)
                .populate('loanId')
                .populate('userId')
                .sort({ dueDate: 1 })
                .skip(skip)
                .limit(limit),
            Installment_1.default.countDocuments(filter),
        ]);
        return res.json({
            success: true,
            data: {
                installments: installments.map((inst) => {
                    const loanDoc = inst.loanId;
                    const userDoc = inst.userId;
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
    }
    catch (err) {
        console.error('getAllInstallments error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
exports.getAllInstallments = getAllInstallments;
/**
 * GET /api/admin/defaults
 * Get all defaulted loans with AI insights (simplified)
 */
const getDefaults = async (req, res) => {
    try {
        const defaultedLoans = await Loan_1.default.find({
            status: Loan_1.LoanStatus.DEFAULTED,
        }).populate('userId');
        // Also load risk profiles for these users so we can include riskLevel
        const userIds = defaultedLoans.map((l) => l.userId._id);
        const riskProfiles = await RiskProfile_1.default.find({
            userId: { $in: userIds },
        });
        const riskByUserId = new Map(riskProfiles.map((rp) => [rp.userId.toString(), rp.riskLevel]));
        const data = defaultedLoans.map((loan) => {
            const userDoc = loan.userId;
            const daysInDefault = loan.defaultedAt
                ? Math.floor((Date.now() - loan.defaultedAt.getTime()) /
                    (1000 * 60 * 60 * 24))
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
                missedInstallments: 0, // placeholder, can compute from Installment
                aiPredictedDefault: false, // placeholder, can integrate with predictDefaultRisk
                recoveryProbability: undefined,
            };
        });
        const summary = {
            totalDefaulted: data.length,
            totalOutstanding: data.reduce((sum, l) => sum + (l.outstandingBalance || 0), 0),
            averageDefaultTime: data.length > 0
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
    }
    catch (err) {
        console.error('getDefaults error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
exports.getDefaults = getDefaults;
/**
 * GET /api/admin/dashboard/stats
 */
const getDashboardStats = async (req, res) => {
    try {
        const [userCounts, loanCounts, installmentCounts, riskCounts, recentPayments,] = await Promise.all([
            // Users
            (async () => {
                const [total, pending, approved, rejected] = await Promise.all([
                    User_1.default.countDocuments(),
                    User_1.default.countDocuments({ status: User_1.UserStatus.PENDING }),
                    User_1.default.countDocuments({ status: User_1.UserStatus.APPROVED }),
                    User_1.default.countDocuments({ status: User_1.UserStatus.REJECTED }),
                ]);
                return { total, pending, approved, rejected };
            })(),
            // Loans
            (async () => {
                const [total, active, completed, defaulted, sums] = await Promise.all([
                    Loan_1.default.countDocuments(),
                    Loan_1.default.countDocuments({ status: Loan_1.LoanStatus.ACTIVE }),
                    Loan_1.default.countDocuments({ status: Loan_1.LoanStatus.COMPLETED }),
                    Loan_1.default.countDocuments({ status: Loan_1.LoanStatus.DEFAULTED }),
                    Loan_1.default.aggregate([
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
                const [pending, overdue, defaulted, dueThisMonthAgg] = await Promise.all([
                    Installment_1.default.countDocuments({ status: Installment_1.InstallmentStatus.PENDING }),
                    Installment_1.default.countDocuments({ status: Installment_1.InstallmentStatus.OVERDUE }),
                    Installment_1.default.countDocuments({ status: Installment_1.InstallmentStatus.DEFAULTED }),
                    Installment_1.default.aggregate([
                        {
                            $match: {
                                status: Installment_1.InstallmentStatus.PENDING,
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
                ]);
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
                    RiskProfile_1.default.countDocuments({ riskLevel: 'LOW' }),
                    RiskProfile_1.default.countDocuments({ riskLevel: 'MEDIUM' }),
                    RiskProfile_1.default.countDocuments({ riskLevel: 'HIGH' }),
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
                const payments = await PaymentTransaction_1.default.find()
                    .sort({ createdAt: -1 })
                    .limit(10);
                return payments.map((p) => ({
                    type: 'PAYMENT',
                    description: `Payment ${p.status} for installment ${p.installmentId}`,
                    timestamp: p.createdAt.toISOString(),
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
            },
        });
    }
    catch (err) {
        console.error('getDashboardStats error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
exports.getDashboardStats = getDashboardStats;
/**
 * GET /api/admin/loan-requests
 * Get all loan requests with filters
 */
const getLoanRequests = async (req, res) => {
    try {
        const { status, userId } = req.query;
        const { page, limit, skip } = getPagination(req.query);
        const filter = {};
        if (status)
            filter.status = status;
        if (userId)
            filter.userId = userId;
        const [loanRequests, totalCount] = await Promise.all([
            LoanRequest_1.default.find(filter)
                .populate('userId')
                .populate('loanId')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            LoanRequest_1.default.countDocuments(filter),
        ]);
        return res.json({
            success: true,
            data: {
                loanRequests: loanRequests.map((request) => {
                    const userDoc = request.userId;
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
                    };
                }),
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalCount / limit),
                    totalCount,
                },
            },
        });
    }
    catch (err) {
        console.error('getLoanRequests error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
exports.getLoanRequests = getLoanRequests;
/**
 * POST /api/admin/loan-requests/:requestId/approve
 * Approve a loan request and create loan with installments
 */
const approveLoanRequest = async (req, res) => {
    try {
        const adminId = req.user?.id;
        const { requestId } = req.params;
        const { interestRate, startDate, notes } = req.body;
        if (!interestRate) {
            return res.status(400).json({
                success: false,
                message: 'Interest rate is required',
            });
        }
        // Find the loan request
        const loanRequest = await LoanRequest_1.default.findById(requestId).populate('userId');
        if (!loanRequest) {
            return res.status(404).json({
                success: false,
                message: 'Loan request not found',
            });
        }
        if (loanRequest.status !== LoanRequest_1.LoanRequestStatus.PENDING) {
            return res.status(400).json({
                success: false,
                message: `Loan request is already ${loanRequest.status.toLowerCase()}`,
            });
        }
        const userDoc = loanRequest.userId;
        if (!userDoc) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }
        // Check if user already has an active loan
        const existingActiveLoan = await Loan_1.default.findOne({
            userId: userDoc._id,
            status: Loan_1.LoanStatus.ACTIVE,
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
        const monthlyInstallment = (principalAmount *
            monthlyRate *
            Math.pow(1 + monthlyRate, tenureMonths)) /
            (Math.pow(1 + monthlyRate, tenureMonths) - 1);
        const roundedEMI = Math.round(monthlyInstallment);
        const totalAmount = roundedEMI * tenureMonths;
        const endDate = new Date(start);
        endDate.setMonth(endDate.getMonth() + tenureMonths);
        // Create loan
        const loan = await Loan_1.default.create({
            userId: userDoc._id,
            principalAmount,
            interestRate,
            tenureMonths,
            monthlyInstallment: roundedEMI,
            totalAmount,
            outstandingBalance: totalAmount,
            startDate: start,
            endDate,
            status: Loan_1.LoanStatus.ACTIVE,
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
                status: Installment_1.InstallmentStatus.PENDING,
            });
        }
        await Installment_1.default.insertMany(installmentDocs);
        // Update loan request status
        loanRequest.status = LoanRequest_1.LoanRequestStatus.APPROVED;
        loanRequest.approvedBy = adminId;
        loanRequest.approvedAt = new Date();
        loanRequest.loanId = loan._id;
        await loanRequest.save();
        // Send approval email
        try {
            await emailService_1.emailService.sendLoanApproved(userDoc.email, {
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
        }
        catch (emailError) {
            logger_1.default.error('Failed to send loan approval email', { error: emailError });
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
    }
    catch (error) {
        console.error('approveLoanRequest error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
exports.approveLoanRequest = approveLoanRequest;
/**
 * POST /api/admin/loan-requests/:requestId/reject
 * Reject a loan request
 */
const rejectLoanRequest = async (req, res) => {
    try {
        const { requestId } = req.params;
        const { reason } = req.body;
        if (!reason) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required',
            });
        }
        const loanRequest = await LoanRequest_1.default.findById(requestId).populate('userId');
        if (!loanRequest) {
            return res.status(404).json({
                success: false,
                message: 'Loan request not found',
            });
        }
        if (loanRequest.status !== LoanRequest_1.LoanRequestStatus.PENDING) {
            return res.status(400).json({
                success: false,
                message: `Loan request is already ${loanRequest.status.toLowerCase()}`,
            });
        }
        loanRequest.status = LoanRequest_1.LoanRequestStatus.REJECTED;
        loanRequest.rejectionReason = reason;
        loanRequest.rejectedAt = new Date();
        await loanRequest.save();
        // Send rejection email (you can create a separate email template if needed)
        const userDoc = loanRequest.userId;
        if (userDoc) {
            try {
                await emailService_1.emailService.sendAccountRejected(userDoc.email, {
                    userName: userDoc.fullName,
                    reason: `Your loan request for PKR ${loanRequest.requestedAmount.toLocaleString()} has been rejected. Reason: ${reason}`,
                }, userDoc._id.toString());
            }
            catch (emailError) {
                logger_1.default.error('Failed to send loan rejection email', { error: emailError });
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
    }
    catch (error) {
        console.error('rejectLoanRequest error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
exports.rejectLoanRequest = rejectLoanRequest;
/**
 * POST /api/admin/waive-fine/:installmentId
 */
const waiveFine = async (req, res) => {
    try {
        const { installmentId } = req.params;
        const { reason } = req.body;
        if (!reason) {
            return res.status(400).json({
                success: false,
                message: 'Reason is required',
            });
        }
        const installment = await Installment_1.default.findById(installmentId);
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
    }
    catch (err) {
        console.error('waiveFine error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
exports.waiveFine = waiveFine;
/**
 * POST /api/admin/reminders/installments
 * Manually trigger installment reminder emails
 */
const triggerInstallmentReminders = async (req, res) => {
    try {
        const { triggerInstallmentReminders } = require('../jobs/installmentReminderJob');
        logger_1.default.info('Admin triggered installment reminders manually');
        // Run in background
        triggerInstallmentReminders()
            .then(() => {
            logger_1.default.info('Manual installment reminders completed');
        })
            .catch((error) => {
            logger_1.default.error('Error in manual installment reminders:', error);
        });
        return res.json({
            success: true,
            message: 'Installment reminder job triggered successfully. Emails will be sent in the background.',
        });
    }
    catch (err) {
        console.error('triggerInstallmentReminders error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
exports.triggerInstallmentReminders = triggerInstallmentReminders;
/**
 * POST /api/admin/reminders/overdue
 * Manually trigger overdue notice emails
 */
const triggerOverdueNotices = async (req, res) => {
    try {
        const { triggerOverdueNotices } = require('../jobs/installmentReminderJob');
        logger_1.default.info('Admin triggered overdue notices manually');
        // Run in background
        triggerOverdueNotices()
            .then(() => {
            logger_1.default.info('Manual overdue notices completed');
        })
            .catch((error) => {
            logger_1.default.error('Error in manual overdue notices:', error);
        });
        return res.json({
            success: true,
            message: 'Overdue notice job triggered successfully. Emails will be sent in the background.',
        });
    }
    catch (err) {
        console.error('triggerOverdueNotices error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
exports.triggerOverdueNotices = triggerOverdueNotices;
