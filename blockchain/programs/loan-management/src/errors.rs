use anchor_lang::prelude::*;

#[error_code]
pub enum LoanError {
    #[msg("Unauthorized access")]
    Unauthorized,

    #[msg("Program is paused")]
    ProgramPaused,

    #[msg("User already registered")]
    UserAlreadyRegistered,

    #[msg("User not found")]
    UserNotFound,

    #[msg("Invalid loan amount")]
    InvalidLoanAmount,

    #[msg("Invalid interest rate")]
    InvalidInterestRate,

    #[msg("Invalid tenure")]
    InvalidTenure,

    #[msg("User already has an active loan")]
    ActiveLoanExists,

    #[msg("Loan not found")]
    LoanNotFound,

    #[msg("Loan not active")]
    LoanNotActive,

    #[msg("Invalid payment amount")]
    InvalidPaymentAmount,

    #[msg("Invalid installment number")]
    InvalidInstallmentNumber,

    #[msg("Installment already paid")]
    InstallmentAlreadyPaid,

    #[msg("Loan already completed")]
    LoanAlreadyCompleted,

    #[msg("Loan already defaulted")]
    LoanAlreadyDefaulted,

    #[msg("Insufficient payment amount")]
    InsufficientPayment,

    #[msg("Payment too early")]
    PaymentTooEarly,

    #[msg("Invalid risk score")]
    InvalidRiskScore,

    #[msg("Invalid default probability")]
    InvalidDefaultProbability,

    #[msg("Calculation overflow")]
    MathOverflow,

    #[msg("Name too long")]
    NameTooLong,

    #[msg("Invalid string format")]
    InvalidStringFormat,

    #[msg("Low credit score")]
    LowCreditScore,

    #[msg("High risk user")]
    HighRiskUser,

    #[msg("Income too low")]
    IncomeTooLow,
}
