"use strict";
// src/utils/calculations.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateMonthlyInstallment = calculateMonthlyInstallment;
/**
 * Calculate monthly installment (EMI) and total payable amount
 * for a loan using standard amortization formula.
 *
 * principalAmount: total principal (PKR)
 * interestRate: annual interest rate in percent (e.g. 24 for 24%)
 * tenureMonths: total tenure in months
 */
function calculateMonthlyInstallment(principalAmount, interestRate, tenureMonths) {
    if (tenureMonths <= 0) {
        throw new Error('tenureMonths must be greater than 0');
    }
    if (principalAmount <= 0) {
        throw new Error('principalAmount must be greater than 0');
    }
    const n = tenureMonths;
    const monthlyRate = interestRate / 12 / 100; // convert to monthly decimal rate
    let monthlyInstallment;
    // If interest rate is 0, simple division
    if (monthlyRate === 0) {
        monthlyInstallment = principalAmount / n;
    }
    else {
        // EMI formula:
        // EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)
        const factor = Math.pow(1 + monthlyRate, n);
        monthlyInstallment =
            (principalAmount * monthlyRate * factor) / (factor - 1);
    }
    // Round to nearest whole PKR (as per doc)
    monthlyInstallment = Math.round(monthlyInstallment);
    const totalAmount = monthlyInstallment * n;
    return {
        monthlyInstallment,
        totalAmount,
    };
}
