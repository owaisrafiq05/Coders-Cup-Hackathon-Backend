use anchor_lang::prelude::*;

/// Main program state account
#[account]
pub struct LoanProgramState {
    pub authority: Pubkey,
    pub total_users: u64,
    pub total_loans: u64,
    pub total_volume: u64,
    pub fee_percentage: u16,
    pub paused: bool,
    pub bump: u8,
}

impl LoanProgramState {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 2 + 1 + 1;
}

/// User profile stored on-chain
#[account]
pub struct UserProfile {
    pub authority: Pubkey,
    pub full_name: String,
    pub monthly_income: u64,
    pub employment_type: EmploymentType,
    pub total_loans: u16,
    pub active_loans: u8,
    pub completed_loans: u16,
    pub defaulted_loans: u8,
    pub total_borrowed: u64,
    pub total_repaid: u64,
    pub on_time_payments: u16,
    pub late_payments: u16,
    pub missed_payments: u16,
    pub credit_score: u16,
    pub risk_level: RiskLevel,
    pub registration_timestamp: i64,
    pub last_updated: i64,
    pub bump: u8,
}

impl UserProfile {
    pub const MAX_NAME_LEN: usize = 100;
    pub const LEN: usize = 8 + 32 + (4 + Self::MAX_NAME_LEN) + 8 + 1 + 2 + 1 + 2 + 1 + 8 + 8 + 2 + 2 + 2 + 2 + 1 + 8 + 8 + 1;
}

/// Loan account storing loan details
#[account]
pub struct Loan {
    pub user: Pubkey,
    pub loan_id: u64,
    pub principal_amount: u64,
    pub interest_rate: u16,
    pub tenure_months: u8,
    pub monthly_installment: u64,
    pub total_amount: u64,
    pub outstanding_balance: u64,
    pub total_repaid: u64,
    pub total_fines: u64,
    pub start_timestamp: i64,
    pub end_timestamp: i64,
    pub status: LoanStatus,
    pub created_timestamp: i64,
    pub completed_timestamp: Option<i64>,
    pub defaulted_timestamp: Option<i64>,
    pub bump: u8,
}

impl Loan {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 2 + 1 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 8 + (1 + 8) + (1 + 8) + 1;
}

/// Payment record for tracking installment payments
#[account]
pub struct PaymentRecord {
    pub loan: Pubkey,
    pub user: Pubkey,
    pub installment_number: u8,
    pub amount: u64,
    pub fine_amount: u64,
    pub payment_timestamp: i64,
    pub payment_hash: String,
    pub on_time: bool,
    pub days_late: u16,
    pub bump: u8,
}

impl PaymentRecord {
    pub const MAX_HASH_LEN: usize = 100;
    pub const LEN: usize = 8 + 32 + 32 + 1 + 8 + 8 + 8 + (4 + Self::MAX_HASH_LEN) + 1 + 2 + 1;
}

/// Risk profile for a user
#[account]
pub struct RiskProfile {
    pub user: Pubkey,
    pub risk_score: u16,
    pub risk_level: RiskLevel,
    pub default_probability: u16,
    pub recommended_max_loan: u64,
    pub last_calculated: i64,
    pub factors_count: u8,
    pub bump: u8,
}

impl RiskProfile {
    pub const LEN: usize = 8 + 32 + 2 + 1 + 2 + 8 + 8 + 1 + 1;
}

/// Employment type enum
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum EmploymentType {
    Salaried,
    SelfEmployed,
    BusinessOwner,
    DailyWage,
    Unemployed,
}

/// Loan status enum
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum LoanStatus {
    Active,
    Completed,
    Defaulted,
    Cancelled,
}

/// Risk level enum
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}
