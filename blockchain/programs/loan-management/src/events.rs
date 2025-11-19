use anchor_lang::prelude::*;
use crate::state::*;

/// Event emitted when a user is registered
#[event]
pub struct UserRegistered {
    pub user: Pubkey,
    pub full_name: String,
    pub monthly_income: u64,
    pub employment_type: EmploymentType,
    pub timestamp: i64,
}

/// Event emitted when a loan is created
#[event]
pub struct LoanCreated {
    pub loan_id: u64,
    pub user: Pubkey,
    pub principal_amount: u64,
    pub interest_rate: u16,
    pub tenure_months: u8,
    pub monthly_installment: u64,
    pub total_amount: u64,
    pub start_timestamp: i64,
    pub end_timestamp: i64,
}

/// Event emitted when a payment is recorded
#[event]
pub struct PaymentRecorded {
    pub loan: Pubkey,
    pub user: Pubkey,
    pub installment_number: u8,
    pub amount: u64,
    pub fine_amount: u64,
    pub payment_timestamp: i64,
    pub on_time: bool,
    pub days_late: u16,
}

/// Event emitted when risk score is updated
#[event]
pub struct RiskScoreUpdated {
    pub user: Pubkey,
    pub old_score: u16,
    pub new_score: u16,
    pub risk_level: RiskLevel,
    pub default_probability: u16,
    pub timestamp: i64,
}

/// Event emitted when a loan is marked as defaulted
#[event]
pub struct LoanDefaulted {
    pub loan_id: u64,
    pub user: Pubkey,
    pub outstanding_balance: u64,
    pub total_fines: u64,
    pub defaulted_timestamp: i64,
}

/// Event emitted when a loan is completed
#[event]
pub struct LoanCompleted {
    pub loan_id: u64,
    pub user: Pubkey,
    pub total_repaid: u64,
    pub completed_timestamp: i64,
}

/// Event emitted when a fine is waived
#[event]
pub struct FineWaived {
    pub loan: Pubkey,
    pub user: Pubkey,
    pub installment_number: u8,
    pub waived_amount: u64,
    pub waived_by: Pubkey,
    pub timestamp: i64,
}
