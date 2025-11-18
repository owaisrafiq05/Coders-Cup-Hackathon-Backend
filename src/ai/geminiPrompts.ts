// src/ai/geminiPrompts.ts

// Matches what riskScoringEngine expects
export interface RiskScoringInput {
    // From user.getAnonymizedProfile() + our added fields
    ageBracket?: string;
    incomeRange?: string;
    employmentType?: string;
    city?: string;
    province?: string;
    accountAge?: number;
  
    requestedAmount?: number;
    requestedTenure?: number;
  
    loanHistory?: {
      totalLoans: number;
      completedLoans: number;
      defaultedLoans: number;
      onTimePayments: number;
      latePayments: number;
      missedPayments: number;
      averagePaymentDelay: number;
    };
  }
  
  export interface RiskScoringOutput {
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    riskScore: number; // 0–100
    riskReasons: string[];
    recommendedMaxLoan?: number;
    recommendedTenure?: number;
    defaultProbability?: number; // 0–1
    tokensUsed?: number;
  }
  
  export const GeminiPrompts = {
    /**
     * Build the prompt for applicant-level risk scoring.
     *
     * We explicitly ask Gemini to return ONLY valid JSON
     * conforming to RiskScoringOutput.
     */
    buildRiskScoringPrompt(input: RiskScoringInput): string {
      return `
  You are an AI risk analyst for a microfinance institution in Pakistan.
  
  You will receive an anonymized user profile and loan history. 
  You must assess their credit risk for a new microfinance loan.
  
  The input JSON:
  
  ${JSON.stringify(input, null, 2)}
  
  Based on this:
  
  1. Analyze repayment behavior (if loanHistory exists).
  2. Use income bracket, employment type, and region to reason about stability.
  3. Consider accountAge as a proxy for relationship length with institution.
  
  Respond with STRICT JSON ONLY, no explanations, in the following shape:
  
  {
    "riskLevel": "LOW" | "MEDIUM" | "HIGH",
    "riskScore": number between 0 and 100,
    "riskReasons": string array (3-8 concise reasons),
    "recommendedMaxLoan": optional number (PKR),
    "recommendedTenure": optional number (months),
    "defaultProbability": optional number between 0 and 1,
    "tokensUsed": optional number
  }
  
  Rules:
  - riskScore 0–100 where higher = riskier borrower.
  - riskLevel must be consistent with riskScore.
  - riskReasons must be high-level, anonymized explanations (no names or CNIC).
  - DO NOT include any text outside of the JSON object.
  `;
    },
  
    /**
     * Build the prompt for predicting default risk on a specific active loan.
     * Used by riskScoringEngine.predictDefaultRisk.
     */
    buildDefaultPredictionPrompt(input: any): string {
      return `
  You are an AI model evaluating the default risk of a specific active microfinance loan.
  
  The input contains:
  - "currentLoan": principal, outstandingBalance, monthsRemaining
  - "paymentBehavior": totals and delays for installments
  - "financialProfile": anonymized user profile (no PII)
  
  Input JSON:
  
  ${JSON.stringify(input, null, 2)}
  
  Using this information, infer:
  
  1. Probability that this loan will default in the next 12 months.
  2. Main warning signals or risk factors.
  3. Practical recommendations for mitigation (e.g., rescheduling, outreach, counseling).
  
  Respond with STRICT JSON ONLY in this structure:
  
  {
    "defaultProbability": number between 0 and 1,
    "defaultRisk": "LOW" | "MEDIUM" | "HIGH",
    "warningSignals": string[],
    "recommendations": string[]
  }
  
  Do NOT include any free-text explanation outside the JSON.
  `;
    },
  };
  