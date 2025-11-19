"use strict";
// src/ai/riskScoringEngine.ts
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
exports.riskScoringEngine = void 0;
const geminiClient_1 = require("./geminiClient");
const geminiPrompts_1 = require("./geminiPrompts");
const dataAnonymizer_1 = require("./dataAnonymizer");
const User_1 = __importDefault(require("../models/User"));
const Loan_1 = __importStar(require("../models/Loan"));
const Installment_1 = __importStar(require("../models/Installment"));
const RiskProfile_1 = __importDefault(require("../models/RiskProfile"));
const logger_1 = __importDefault(require("../utils/logger"));
class RiskScoringEngine {
    /**
     * Calculate risk score for a user.
     *
     * - Uses cached RiskProfile if calculated in last 24 hours
     *   (unless forceRecalculate / recalculate = true)
     * - Builds anonymized input (no PII) from user + loan history
     * - Calls Gemini via geminiClient with structured prompt
     * - Validates and persists RiskProfile in DB
     */
    async calculateRiskScore(userId, options) {
        logger_1.default.info('Starting risk score calculation', { userId, options });
        // Support both "forceRecalculate" (from doc) and "recalculate" (from admin.controller.ts)
        const force = options?.forceRecalculate ?? options?.recalculate ?? false;
        // 1) Check for existing risk profile
        if (!force) {
            const existing = await RiskProfile_1.default.findOne({ userId });
            if (existing) {
                const hoursSinceCalculation = (Date.now() - existing.lastCalculated.getTime()) /
                    (1000 * 60 * 60);
                // Use cached risk profile if calculated within last 24 hours
                if (hoursSinceCalculation < 24) {
                    logger_1.default.info('Using cached risk profile', {
                        userId,
                        ageHours: hoursSinceCalculation,
                    });
                    return existing;
                }
            }
        }
        // 2) Fetch user data
        const user = await User_1.default.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }
        // 3) Build anonymized input (no PII)
        const input = await this.buildRiskScoringInput(user, {
            requestedAmount: options?.requestedAmount,
            requestedTenure: options?.requestedTenure,
        });
        // 4) Generate prompt
        const prompt = geminiPrompts_1.GeminiPrompts.buildRiskScoringPrompt(input);
        // 5) Call Gemini (expects a structured JSON-like response)
        const geminiResponse = await geminiClient_1.geminiClient.generateStructuredContent(prompt);
        // 6) Validate Gemini response
        this.validateRiskScoringOutput(geminiResponse);
        // 7) Save or update risk profile in DB
        const riskProfile = await RiskProfile_1.default.findOneAndUpdate({ userId }, {
            userId,
            riskLevel: geminiResponse.riskLevel,
            riskScore: geminiResponse.riskScore,
            riskReasons: geminiResponse.riskReasons,
            recommendedMaxLoan: geminiResponse.recommendedMaxLoan,
            recommendedTenure: geminiResponse.recommendedTenure,
            defaultProbability: geminiResponse.defaultProbability,
            geminiResponse: {
                raw: JSON.stringify(geminiResponse),
                model: 'gemini-1.5-flash',
                tokensUsed: geminiResponse.tokensUsed ?? 0,
                timestamp: new Date(),
            },
            lastCalculated: new Date(),
        }, { upsert: true, new: true });
        logger_1.default.info('Risk score calculated successfully', {
            userId,
            riskLevel: riskProfile.riskLevel,
            riskScore: riskProfile.riskScore,
        });
        return riskProfile;
    }
    /**
     * Build anonymized input for Gemini.
     *
     * Uses:
     * - user.getAnonymizedProfile() (no CNIC, phone, email, etc.)
     * - aggregate loan history + installment behavior
     */
    async buildRiskScoringInput(user, options) {
        // Get anonymized financial/profile data from User model
        const anonymizedProfile = user.getAnonymizedProfile();
        // Fetch loan history for the user
        const loans = await Loan_1.default.find({ userId: user._id });
        let loanHistory;
        if (loans.length > 0) {
            const loanIds = loans.map((l) => l._id);
            const installments = await Installment_1.default.find({
                loanId: { $in: loanIds },
            });
            const completed = loans.filter((l) => l.status === Loan_1.LoanStatus.COMPLETED).length;
            const defaulted = loans.filter((l) => l.status === Loan_1.LoanStatus.DEFAULTED).length;
            const paid = installments.filter((i) => i.status === Installment_1.InstallmentStatus.PAID);
            const overdue = installments.filter((i) => i.status === Installment_1.InstallmentStatus.OVERDUE);
            const missed = installments.filter((i) => i.status === Installment_1.InstallmentStatus.DEFAULTED);
            const totalDelay = paid.reduce((sum, inst) => {
                if (inst.paidDate && inst.dueDate) {
                    const delay = Math.max(0, Math.floor((inst.paidDate.getTime() - inst.dueDate.getTime()) /
                        (1000 * 60 * 60 * 24)));
                    return sum + delay;
                }
                return sum;
            }, 0);
            loanHistory = {
                totalLoans: loans.length,
                completedLoans: completed,
                defaultedLoans: defaulted,
                onTimePayments: paid.length - overdue.length,
                latePayments: overdue.length,
                missedPayments: missed.length,
                averagePaymentDelay: paid.length > 0 ? Math.round(totalDelay / paid.length) : 0,
            };
        }
        // Optional: pass through dataAnonymizer if you want an extra safety layer
        const sanitizedProfile = dataAnonymizer_1.dataAnonymizer.anonymizeUser(anonymizedProfile);
        return {
            ...sanitizedProfile,
            requestedAmount: options?.requestedAmount,
            requestedTenure: options?.requestedTenure,
            loanHistory,
        };
    }
    /**
     * Validate Gemini response and ensure it meets constraints.
     */
    validateRiskScoringOutput(output) {
        if (!output.riskLevel ||
            !['LOW', 'MEDIUM', 'HIGH'].includes(output.riskLevel)) {
            throw new Error('Invalid riskLevel in Gemini response');
        }
        if (typeof output.riskScore !== 'number' ||
            output.riskScore < 0 ||
            output.riskScore > 100) {
            throw new Error('Invalid riskScore in Gemini response');
        }
        if (!Array.isArray(output.riskReasons) ||
            output.riskReasons.length === 0) {
            throw new Error('Invalid riskReasons in Gemini response');
        }
    }
    /**
     * Predict default risk for a specific ACTIVE loan.
     *
     * This is separate from applicant-level risk scoring and is focused
     * on payment behavior for that loan.
     */
    async predictDefaultRisk(loanId) {
        const loan = await Loan_1.default.findById(loanId).populate('userId');
        if (!loan) {
            throw new Error('Loan not found');
        }
        const installments = await Installment_1.default.find({ loanId });
        const paid = installments.filter((i) => i.status === Installment_1.InstallmentStatus.PAID);
        const overdue = installments.filter((i) => i.status === Installment_1.InstallmentStatus.OVERDUE);
        const totalDelay = paid.reduce((sum, inst) => {
            if (inst.paidDate && inst.dueDate) {
                const delay = Math.max(0, Math.floor((inst.paidDate.getTime() - inst.dueDate.getTime()) /
                    (1000 * 60 * 60 * 24)));
                return sum + delay;
            }
            return sum;
        }, 0);
        const input = {
            currentLoan: {
                principalAmount: loan.principalAmount,
                outstandingBalance: loan.outstandingBalance,
                monthsRemaining: loan.tenureMonths - paid.length,
            },
            paymentBehavior: {
                totalInstallments: installments.length,
                paidInstallments: paid.length,
                overdueInstallments: overdue.length,
                averageDelayDays: paid.length > 0 ? Math.round(totalDelay / paid.length) : 0,
            },
            financialProfile: loan.userId.getAnonymizedProfile(),
        };
        const prompt = geminiPrompts_1.GeminiPrompts.buildDefaultPredictionPrompt(input);
        const response = await geminiClient_1.geminiClient.generateStructuredContent(prompt);
        // You can optionally validate shape of response here too.
        return response;
    }
}
exports.riskScoringEngine = new RiskScoringEngine();
