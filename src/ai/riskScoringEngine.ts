// src/ai/riskScoringEngine.ts

import { geminiClient } from './geminiClient';
import {
  GeminiPrompts,
  RiskScoringInput,
  RiskScoringOutput,
} from './geminiPrompts';
import { dataAnonymizer } from './dataAnonymizer';
import User, { IUser } from '../models/User';
import Loan, { LoanStatus } from '../models/Loan';
import Installment, {
  InstallmentStatus,
} from '../models/Installment';
import RiskProfile, {
  IRiskProfile,
  RiskLevel,
} from '../models/RiskProfile';
import logger from '../utils/logger';

interface CalculateRiskScoreOptions {
  requestedAmount?: number;
  requestedTenure?: number;
  // From technical doc:
  forceRecalculate?: boolean;
  // From admin.controller.ts (for compatibility):
  recalculate?: boolean;
}

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
  async calculateRiskScore(
    userId: string,
    options?: CalculateRiskScoreOptions,
  ): Promise<IRiskProfile> {
    logger.info('Starting risk score calculation', { userId, options });

    // Support both "forceRecalculate" (from doc) and "recalculate" (from admin.controller.ts)
    const force =
      options?.forceRecalculate ?? options?.recalculate ?? false;

    // 1) Check for existing risk profile
    if (!force) {
      const existing = await RiskProfile.findOne({ userId });
      if (existing) {
        const hoursSinceCalculation =
          (Date.now() - existing.lastCalculated.getTime()) /
          (1000 * 60 * 60);

        // Use cached risk profile if calculated within last 24 hours
        if (hoursSinceCalculation < 24) {
          logger.info('Using cached risk profile', {
            userId,
            ageHours: hoursSinceCalculation,
          });
          return existing;
        }
      }
    }

    // 2) Fetch user data
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // 3) Build anonymized input (no PII)
    const input = await this.buildRiskScoringInput(user, {
      requestedAmount: options?.requestedAmount,
      requestedTenure: options?.requestedTenure,
    });

    // 4) Generate prompt
    const prompt = GeminiPrompts.buildRiskScoringPrompt(input);

    // 5) Call Gemini (expects a structured JSON-like response)
    const geminiResponse =
      await geminiClient.generateStructuredContent<RiskScoringOutput>(
        prompt,
      );

    // 6) Validate Gemini response
    this.validateRiskScoringOutput(geminiResponse);

    // 7) Save or update risk profile in DB
    const riskProfile = await RiskProfile.findOneAndUpdate(
      { userId },
      {
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
      },
      { upsert: true, new: true },
    );

    logger.info('Risk score calculated successfully', {
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
  private async buildRiskScoringInput(
    user: IUser,
    options?: { requestedAmount?: number; requestedTenure?: number },
  ): Promise<RiskScoringInput> {
    // Get anonymized financial/profile data from User model
    const anonymizedProfile = user.getAnonymizedProfile();

    // Fetch loan history for the user
    const loans = await Loan.find({ userId: user._id });

    let loanHistory:
      | {
          totalLoans: number;
          completedLoans: number;
          defaultedLoans: number;
          onTimePayments: number;
          latePayments: number;
          missedPayments: number;
          averagePaymentDelay: number;
        }
      | undefined;

    if (loans.length > 0) {
      const loanIds = loans.map((l) => l._id);
      const installments = await Installment.find({
        loanId: { $in: loanIds },
      });

      const completed = loans.filter(
        (l) => l.status === LoanStatus.COMPLETED,
      ).length;
      const defaulted = loans.filter(
        (l) => l.status === LoanStatus.DEFAULTED,
      ).length;

      const paid = installments.filter(
        (i) => i.status === InstallmentStatus.PAID,
      );
      const overdue = installments.filter(
        (i) => i.status === InstallmentStatus.OVERDUE,
      );
      const missed = installments.filter(
        (i) => i.status === InstallmentStatus.DEFAULTED,
      );

      const totalDelay = paid.reduce((sum, inst) => {
        if (inst.paidDate && inst.dueDate) {
          const delay = Math.max(
            0,
            Math.floor(
              (inst.paidDate.getTime() - inst.dueDate.getTime()) /
                (1000 * 60 * 60 * 24),
            ),
          );
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
        averagePaymentDelay:
          paid.length > 0 ? Math.round(totalDelay / paid.length) : 0,
      };
    }

    // Optional: pass through dataAnonymizer if you want an extra safety layer
    const sanitizedProfile = dataAnonymizer.anonymizeUser(anonymizedProfile);

    return {
      ...(sanitizedProfile as RiskScoringInput),
      requestedAmount: options?.requestedAmount,
      requestedTenure: options?.requestedTenure,
      loanHistory,
    };
  }

  /**
   * Validate Gemini response and ensure it meets constraints.
   */
  private validateRiskScoringOutput(output: any): void {
    if (
      !output.riskLevel ||
      !['LOW', 'MEDIUM', 'HIGH'].includes(output.riskLevel)
    ) {
      throw new Error('Invalid riskLevel in Gemini response');
    }

    if (
      typeof output.riskScore !== 'number' ||
      output.riskScore < 0 ||
      output.riskScore > 100
    ) {
      throw new Error('Invalid riskScore in Gemini response');
    }

    if (
      !Array.isArray(output.riskReasons) ||
      output.riskReasons.length === 0
    ) {
      throw new Error('Invalid riskReasons in Gemini response');
    }
  }

  /**
   * Predict default risk for a specific ACTIVE loan.
   *
   * This is separate from applicant-level risk scoring and is focused
   * on payment behavior for that loan.
   */
  async predictDefaultRisk(loanId: string): Promise<{
    defaultProbability: number;
    defaultRisk: string;
    warningSignals: string[];
    recommendations: string[];
  }> {
    const loan = await Loan.findById(loanId).populate('userId');
    if (!loan) {
      throw new Error('Loan not found');
    }

    const installments = await Installment.find({ loanId });

    const paid = installments.filter(
      (i) => i.status === InstallmentStatus.PAID,
    );
    const overdue = installments.filter(
      (i) => i.status === InstallmentStatus.OVERDUE,
    );

    const totalDelay = paid.reduce((sum, inst) => {
      if (inst.paidDate && inst.dueDate) {
        const delay = Math.max(
          0,
          Math.floor(
            (inst.paidDate.getTime() - inst.dueDate.getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        );
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
        averageDelayDays:
          paid.length > 0 ? Math.round(totalDelay / paid.length) : 0,
      },
      financialProfile: (loan.userId as unknown as IUser).getAnonymizedProfile() as RiskScoringInput,
    };

    const prompt =
      GeminiPrompts.buildDefaultPredictionPrompt(input);

    const response =
      await geminiClient.generateStructuredContent<any>(prompt);

    // You can optionally validate shape of response here too.
    return response;
  }
}

export const riskScoringEngine = new RiskScoringEngine();
