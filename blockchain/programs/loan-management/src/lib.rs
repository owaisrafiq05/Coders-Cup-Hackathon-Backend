use anchor_lang::prelude::*;

declare_id!("FLoan1111111111111111111111111111111111111");

pub mod state;
pub mod instructions;
pub mod errors;
pub mod events;

use instructions::*;
use state::*;

#[program]
pub mod loan_management {
    use super::*;

    /// Initialize the loan management program
    pub fn initialize(ctx: Context<Initialize>, fee_percentage: u16) -> Result<()> {
        instructions::initialize::handler(ctx, fee_percentage)
    }

    /// Register a new user on the blockchain
    pub fn register_user(
        ctx: Context<RegisterUser>,
        full_name: String,
        monthly_income: u64,
        employment_type: EmploymentType,
    ) -> Result<()> {
        instructions::register_user::handler(ctx, full_name, monthly_income, employment_type)
    }

    /// Update user profile information
    pub fn update_user_profile(
        ctx: Context<UpdateUserProfile>,
        monthly_income: Option<u64>,
        employment_type: Option<EmploymentType>,
    ) -> Result<()> {
        instructions::update_user_profile::handler(ctx, monthly_income, employment_type)
    }

    /// Create a new loan on-chain
    pub fn create_loan(
        ctx: Context<CreateLoan>,
        principal_amount: u64,
        interest_rate: u16,
        tenure_months: u8,
        start_timestamp: i64,
    ) -> Result<()> {
        instructions::create_loan::handler(
            ctx,
            principal_amount,
            interest_rate,
            tenure_months,
            start_timestamp,
        )
    }

    /// Record a payment for an installment
    pub fn record_payment(
        ctx: Context<RecordPayment>,
        installment_number: u8,
        amount: u64,
        payment_hash: String,
    ) -> Result<()> {
        instructions::record_payment::handler(ctx, installment_number, amount, payment_hash)
    }

    /// Calculate and update risk score for a user
    pub fn update_risk_score(
        ctx: Context<UpdateRiskScore>,
        risk_score: u16,
        risk_level: RiskLevel,
        default_probability: u16,
    ) -> Result<()> {
        instructions::update_risk_score::handler(ctx, risk_score, risk_level, default_probability)
    }

    /// Mark a loan as defaulted
    pub fn mark_loan_defaulted(ctx: Context<MarkLoanDefaulted>) -> Result<()> {
        instructions::mark_loan_defaulted::handler(ctx)
    }

    /// Mark a loan as completed
    pub fn mark_loan_completed(ctx: Context<MarkLoanCompleted>) -> Result<()> {
        instructions::mark_loan_completed::handler(ctx)
    }

    /// Waive fine for an installment
    pub fn waive_fine(
        ctx: Context<WaiveFine>,
        installment_number: u8,
        waived_amount: u64,
    ) -> Result<()> {
        instructions::waive_fine::handler(ctx, installment_number, waived_amount)
    }

    /// Get user's credit score
    pub fn get_credit_score(ctx: Context<GetCreditScore>) -> Result<u16> {
        instructions::get_credit_score::handler(ctx)
    }
}
