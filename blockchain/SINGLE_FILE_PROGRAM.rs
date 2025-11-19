// ============================================================================
// SOLANA LOAN MANAGEMENT SMART CONTRACT - SINGLE FILE VERSION
// ============================================================================
// This is a complete Anchor program combined into a single file for easy
// deployment on Solana Playground (https://beta.solpg.io/)
//
// Features:
// - User registration and profile management
// - Loan creation and tracking
// - Payment recording with fine calculation
// - Credit scoring and risk assessment
// - Admin controls and program state management
// ============================================================================

use anchor_lang::prelude::*;

declare_id!("FLoan1111111111111111111111111111111111111");

// ============================================================================
// PROGRAM MODULE
// ============================================================================

#[program]
pub mod loan_management {
    use super::*;

    /// Initialize the loan management program
    pub fn initialize(ctx: Context<Initialize>, fee_percentage: u16) -> Result<()> {
        require!(fee_percentage <= 1000, LoanError::InvalidInterestRate);

        let program_state = &mut ctx.accounts.program_state;
        program_state.authority = ctx.accounts.authority.key();
        program_state.total_users = 0;
        program_state.total_loans = 0;
        program_state.total_volume = 0;
        program_state.fee_percentage = fee_percentage;
        program_state.paused = false;
        program_state.bump = ctx.bumps.program_state;

        msg!("Loan management program initialized with fee: {}%", fee_percentage as f64 / 100.0);
        Ok(())
    }

    /// Register a new user on the blockchain
    pub fn register_user(
        ctx: Context<RegisterUser>,
        full_name: String,
        monthly_income: u64,
        employment_type: EmploymentType,
    ) -> Result<()> {
        require!(!ctx.accounts.program_state.paused, LoanError::ProgramPaused);
        require!(full_name.len() <= UserProfile::MAX_NAME_LEN, LoanError::NameTooLong);
        require!(monthly_income > 0, LoanError::IncomeTooLow);

        let user_profile = &mut ctx.accounts.user_profile;
        let clock = Clock::get()?;

        user_profile.authority = ctx.accounts.authority.key();
        user_profile.full_name = full_name.clone();
        user_profile.monthly_income = monthly_income;
        user_profile.employment_type = employment_type.clone();
        user_profile.total_loans = 0;
        user_profile.active_loans = 0;
        user_profile.completed_loans = 0;
        user_profile.defaulted_loans = 0;
        user_profile.total_borrowed = 0;
        user_profile.total_repaid = 0;
        user_profile.on_time_payments = 0;
        user_profile.late_payments = 0;
        user_profile.missed_payments = 0;
        user_profile.credit_score = 500;
        user_profile.risk_level = RiskLevel::Medium;
        user_profile.registration_timestamp = clock.unix_timestamp;
        user_profile.last_updated = clock.unix_timestamp;
        user_profile.bump = ctx.bumps.user_profile;

        let program_state = &mut ctx.accounts.program_state;
        program_state.total_users = program_state.total_users.checked_add(1)
            .ok_or(LoanError::MathOverflow)?;

        emit!(UserRegistered {
            user: ctx.accounts.authority.key(),
            full_name,
            monthly_income,
            employment_type,
            timestamp: clock.unix_timestamp,
        });

        msg!("User registered: {}", user_profile.full_name);
        Ok(())
    }

    /// Update user profile information
    pub fn update_user_profile(
        ctx: Context<UpdateUserProfile>,
        monthly_income: Option<u64>,
        employment_type: Option<EmploymentType>,
    ) -> Result<()> {
        let user_profile = &mut ctx.accounts.user_profile;
        let clock = Clock::get()?;

        if let Some(income) = monthly_income {
            require!(income > 0, LoanError::IncomeTooLow);
            user_profile.monthly_income = income;
        }

        if let Some(emp_type) = employment_type {
            user_profile.employment_type = emp_type;
        }

        user_profile.last_updated = clock.unix_timestamp;
        msg!("User profile updated");
        Ok(())
    }

    /// Create a new loan on-chain
    pub fn create_loan(
        ctx: Context<CreateLoan>,
        principal_amount: u64,
        interest_rate: u16,
        tenure_months: u8,
        start_timestamp: i64,
    ) -> Result<()> {
        require!(!ctx.accounts.program_state.paused, LoanError::ProgramPaused);
        require!(
            principal_amount >= 5_000_000_000 && principal_amount <= 500_000_000_000,
            LoanError::InvalidLoanAmount
        );
        require!(interest_rate > 0 && interest_rate <= 3000, LoanError::InvalidInterestRate);
        require!(tenure_months >= 3 && tenure_months <= 60, LoanError::InvalidTenure);
        require!(ctx.accounts.user_profile.active_loans == 0, LoanError::ActiveLoanExists);

        let user_profile = &mut ctx.accounts.user_profile;
        let loan = &mut ctx.accounts.loan;
        let program_state = &mut ctx.accounts.program_state;
        let clock = Clock::get()?;

        let monthly_rate = (interest_rate as f64) / 12.0 / 10000.0;
        let n = tenure_months as f64;
        
        let monthly_installment = if monthly_rate == 0.0 {
            principal_amount / (tenure_months as u64)
        } else {
            let numerator = (principal_amount as f64) * monthly_rate * (1.0 + monthly_rate).powf(n);
            let denominator = (1.0 + monthly_rate).powf(n) - 1.0;
            (numerator / denominator) as u64
        };

        let total_amount = monthly_installment
            .checked_mul(tenure_months as u64)
            .ok_or(LoanError::MathOverflow)?;

        let end_timestamp = start_timestamp + ((tenure_months as i64) * 30 * 24 * 60 * 60);

        loan.user = ctx.accounts.user_authority.key();
        loan.loan_id = program_state.total_loans;
        loan.principal_amount = principal_amount;
        loan.interest_rate = interest_rate;
        loan.tenure_months = tenure_months;
        loan.monthly_installment = monthly_installment;
        loan.total_amount = total_amount;
        loan.outstanding_balance = total_amount;
        loan.total_repaid = 0;
        loan.total_fines = 0;
        loan.start_timestamp = start_timestamp;
        loan.end_timestamp = end_timestamp;
        loan.status = LoanStatus::Active;
        loan.created_timestamp = clock.unix_timestamp;
        loan.completed_timestamp = None;
        loan.defaulted_timestamp = None;
        loan.bump = ctx.bumps.loan;

        user_profile.total_loans = user_profile.total_loans.checked_add(1)
            .ok_or(LoanError::MathOverflow)?;
        user_profile.active_loans = user_profile.active_loans.checked_add(1)
            .ok_or(LoanError::MathOverflow)?;
        user_profile.total_borrowed = user_profile.total_borrowed.checked_add(principal_amount)
            .ok_or(LoanError::MathOverflow)?;
        user_profile.last_updated = clock.unix_timestamp;

        program_state.total_loans = program_state.total_loans.checked_add(1)
            .ok_or(LoanError::MathOverflow)?;
        program_state.total_volume = program_state.total_volume.checked_add(principal_amount)
            .ok_or(LoanError::MathOverflow)?;

        emit!(LoanCreated {
            loan_id: loan.loan_id,
            user: loan.user,
            principal_amount,
            interest_rate,
            tenure_months,
            monthly_installment,
            total_amount,
            start_timestamp,
            end_timestamp,
        });

        msg!("Loan created: ID={}, Amount={}", loan.loan_id, principal_amount);
        Ok(())
    }

    /// Record a payment for an installment
    pub fn record_payment(
        ctx: Context<RecordPayment>,
        installment_number: u8,
        amount: u64,
        payment_hash: String,
    ) -> Result<()> {
        require!(ctx.accounts.loan.status == LoanStatus::Active, LoanError::LoanNotActive);
        require!(installment_number > 0 && installment_number <= ctx.accounts.loan.tenure_months, 
            LoanError::InvalidInstallmentNumber);
        require!(amount >= ctx.accounts.loan.monthly_installment, LoanError::InsufficientPayment);

        // Capture values before mutable borrows
        let loan_key = ctx.accounts.loan.key();
        let user_key = ctx.accounts.user_authority.key();
        
        let loan = &mut ctx.accounts.loan;
        let user_profile = &mut ctx.accounts.user_profile;
        let payment_record = &mut ctx.accounts.payment_record;
        let clock = Clock::get()?;

        let due_date = loan.start_timestamp + ((installment_number as i64) * 30 * 24 * 60 * 60);
        let days_late = if clock.unix_timestamp > due_date {
            ((clock.unix_timestamp - due_date) / (24 * 60 * 60)) as u16
        } else {
            0
        };

        let fine_amount = if days_late > 0 {
            (loan.monthly_installment * (days_late as u64) / 100).min(loan.monthly_installment / 10)
        } else {
            0
        };

        let on_time = days_late == 0;

        payment_record.loan = loan_key;
        payment_record.user = user_key;
        payment_record.installment_number = installment_number;
        payment_record.amount = amount;
        payment_record.fine_amount = fine_amount;
        payment_record.payment_timestamp = clock.unix_timestamp;
        payment_record.payment_hash = payment_hash;
        payment_record.on_time = on_time;
        payment_record.days_late = days_late;
        payment_record.bump = ctx.bumps.payment_record;

        let total_payment = amount.checked_add(fine_amount).ok_or(LoanError::MathOverflow)?;
        
        loan.outstanding_balance = loan.outstanding_balance.checked_sub(amount)
            .ok_or(LoanError::MathOverflow)?;
        loan.total_repaid = loan.total_repaid.checked_add(total_payment)
            .ok_or(LoanError::MathOverflow)?;
        loan.total_fines = loan.total_fines.checked_add(fine_amount)
            .ok_or(LoanError::MathOverflow)?;

        user_profile.total_repaid = user_profile.total_repaid.checked_add(total_payment)
            .ok_or(LoanError::MathOverflow)?;
        
        if on_time {
            user_profile.on_time_payments = user_profile.on_time_payments.checked_add(1)
                .ok_or(LoanError::MathOverflow)?;
        } else {
            user_profile.late_payments = user_profile.late_payments.checked_add(1)
                .ok_or(LoanError::MathOverflow)?;
        }

        user_profile.last_updated = clock.unix_timestamp;

        emit!(PaymentRecorded {
            loan: loan_key,
            user: user_key,
            installment_number,
            amount,
            fine_amount,
            payment_timestamp: clock.unix_timestamp,
            on_time,
            days_late,
        });

        msg!("Payment recorded: Installment {}, Amount {}", installment_number, amount);
        Ok(())
    }

    /// Calculate and update risk score for a user
    pub fn update_risk_score(
        ctx: Context<UpdateRiskScore>,
        risk_score: u16,
        risk_level: RiskLevel,
        default_probability: u16,
    ) -> Result<()> {
        require!(risk_score <= 1000, LoanError::InvalidRiskScore);
        require!(default_probability <= 10000, LoanError::InvalidDefaultProbability);

        let user_profile = &mut ctx.accounts.user_profile;
        let risk_profile = &mut ctx.accounts.risk_profile;
        let clock = Clock::get()?;

        let old_score = user_profile.credit_score;

        user_profile.credit_score = risk_score;
        user_profile.risk_level = risk_level.clone();
        user_profile.last_updated = clock.unix_timestamp;

        risk_profile.user = ctx.accounts.user_authority.key();
        risk_profile.risk_score = risk_score;
        risk_profile.risk_level = risk_level.clone();
        risk_profile.default_probability = default_probability;
        risk_profile.recommended_max_loan = (user_profile.monthly_income * 10).min(500_000_000_000);
        risk_profile.last_calculated = clock.unix_timestamp;
        risk_profile.factors_count = 5;
        risk_profile.bump = ctx.bumps.risk_profile;

        emit!(RiskScoreUpdated {
            user: ctx.accounts.user_authority.key(),
            old_score,
            new_score: risk_score,
            risk_level,
            default_probability,
            timestamp: clock.unix_timestamp,
        });

        msg!("Risk score updated: {} -> {}", old_score, risk_score);
        Ok(())
    }

    /// Mark a loan as defaulted
    pub fn mark_loan_defaulted(ctx: Context<MarkLoanDefaulted>) -> Result<()> {
        require!(ctx.accounts.loan.status == LoanStatus::Active, LoanError::LoanNotActive);

        let loan = &mut ctx.accounts.loan;
        let user_profile = &mut ctx.accounts.user_profile;
        let clock = Clock::get()?;

        loan.status = LoanStatus::Defaulted;
        loan.defaulted_timestamp = Some(clock.unix_timestamp);

        user_profile.active_loans = user_profile.active_loans.checked_sub(1)
            .ok_or(LoanError::MathOverflow)?;
        user_profile.defaulted_loans = user_profile.defaulted_loans.checked_add(1)
            .ok_or(LoanError::MathOverflow)?;
        user_profile.credit_score = user_profile.credit_score.saturating_sub(200);
        user_profile.risk_level = RiskLevel::Critical;
        user_profile.last_updated = clock.unix_timestamp;

        emit!(LoanDefaulted {
            loan_id: loan.loan_id,
            user: loan.user,
            outstanding_balance: loan.outstanding_balance,
            total_fines: loan.total_fines,
            defaulted_timestamp: clock.unix_timestamp,
        });

        msg!("Loan marked as defaulted: ID={}", loan.loan_id);
        Ok(())
    }

    /// Mark a loan as completed
    pub fn mark_loan_completed(ctx: Context<MarkLoanCompleted>) -> Result<()> {
        require!(ctx.accounts.loan.status == LoanStatus::Active, LoanError::LoanNotActive);
        require!(ctx.accounts.loan.outstanding_balance == 0, LoanError::InsufficientPayment);

        let loan = &mut ctx.accounts.loan;
        let user_profile = &mut ctx.accounts.user_profile;
        let clock = Clock::get()?;

        loan.status = LoanStatus::Completed;
        loan.completed_timestamp = Some(clock.unix_timestamp);

        user_profile.active_loans = user_profile.active_loans.checked_sub(1)
            .ok_or(LoanError::MathOverflow)?;
        user_profile.completed_loans = user_profile.completed_loans.checked_add(1)
            .ok_or(LoanError::MathOverflow)?;
        user_profile.credit_score = (user_profile.credit_score + 50).min(1000);
        user_profile.last_updated = clock.unix_timestamp;

        emit!(LoanCompleted {
            loan_id: loan.loan_id,
            user: loan.user,
            total_repaid: loan.total_repaid,
            completed_timestamp: clock.unix_timestamp,
        });

        msg!("Loan completed: ID={}", loan.loan_id);
        Ok(())
    }

    /// Waive fine for an installment
    pub fn waive_fine(
        ctx: Context<WaiveFine>,
        installment_number: u8,
        waived_amount: u64,
    ) -> Result<()> {
        // Capture values before mutable borrow
        let loan_key = ctx.accounts.loan.key();
        let loan_user = ctx.accounts.loan.user;
        
        let loan = &mut ctx.accounts.loan;
        let clock = Clock::get()?;

        require!(waived_amount <= loan.total_fines, LoanError::InvalidPaymentAmount);

        loan.total_fines = loan.total_fines.checked_sub(waived_amount)
            .ok_or(LoanError::MathOverflow)?;

        emit!(FineWaived {
            loan: loan_key,
            user: loan_user,
            installment_number,
            waived_amount,
            waived_by: ctx.accounts.admin.key(),
            timestamp: clock.unix_timestamp,
        });

        msg!("Fine waived: {} for installment {}", waived_amount, installment_number);
        Ok(())
    }

    /// Get user's credit score
    pub fn get_credit_score(ctx: Context<GetCreditScore>) -> Result<u16> {
        Ok(ctx.accounts.user_profile.credit_score)
    }
}

// ============================================================================
// STATE STRUCTS
// ============================================================================

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

// ============================================================================
// ENUMS
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum EmploymentType {
    Salaried,
    SelfEmployed,
    BusinessOwner,
    DailyWage,
    Unemployed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum LoanStatus {
    Active,
    Completed,
    Defaulted,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

// ============================================================================
// ACCOUNT CONTEXTS
// ============================================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = LoanProgramState::LEN,
        seeds = [b"program-state"],
        bump
    )]
    pub program_state: Account<'info, LoanProgramState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterUser<'info> {
    #[account(
        init,
        payer = authority,
        space = UserProfile::LEN,
        seeds = [b"user-profile", authority.key().as_ref()],
        bump
    )]
    pub user_profile: Account<'info, UserProfile>,
    #[account(
        mut,
        seeds = [b"program-state"],
        bump = program_state.bump
    )]
    pub program_state: Account<'info, LoanProgramState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateUserProfile<'info> {
    #[account(
        mut,
        seeds = [b"user-profile", authority.key().as_ref()],
        bump = user_profile.bump,
        has_one = authority
    )]
    pub user_profile: Account<'info, UserProfile>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(principal_amount: u64)]
pub struct CreateLoan<'info> {
    #[account(
        mut,
        seeds = [b"user-profile", user_authority.key().as_ref()],
        bump = user_profile.bump
    )]
    pub user_profile: Account<'info, UserProfile>,
    #[account(
        init,
        payer = admin,
        space = Loan::LEN,
        seeds = [
            b"loan",
            user_authority.key().as_ref(),
            &program_state.total_loans.to_le_bytes()
        ],
        bump
    )]
    pub loan: Account<'info, Loan>,
    #[account(
        mut,
        seeds = [b"program-state"],
        bump = program_state.bump
    )]
    pub program_state: Account<'info, LoanProgramState>,
    /// CHECK: User authority
    pub user_authority: AccountInfo<'info>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(installment_number: u8)]
pub struct RecordPayment<'info> {
    #[account(
        mut,
        seeds = [b"loan", user_authority.key().as_ref(), &loan.loan_id.to_le_bytes()],
        bump = loan.bump,
        has_one = user
    )]
    pub loan: Account<'info, Loan>,
    #[account(
        mut,
        seeds = [b"user-profile", user_authority.key().as_ref()],
        bump = user_profile.bump
    )]
    pub user_profile: Account<'info, UserProfile>,
    #[account(
        init,
        payer = admin,
        space = PaymentRecord::LEN,
        seeds = [
            b"payment",
            loan.key().as_ref(),
            &installment_number.to_le_bytes()
        ],
        bump
    )]
    pub payment_record: Account<'info, PaymentRecord>,
    /// CHECK: User authority
    pub user_authority: AccountInfo<'info>,
    pub user: Signer<'info>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateRiskScore<'info> {
    #[account(
        mut,
        seeds = [b"user-profile", user_authority.key().as_ref()],
        bump = user_profile.bump
    )]
    pub user_profile: Account<'info, UserProfile>,
    #[account(
        init_if_needed,
        payer = admin,
        space = RiskProfile::LEN,
        seeds = [b"risk-profile", user_authority.key().as_ref()],
        bump
    )]
    pub risk_profile: Account<'info, RiskProfile>,
    /// CHECK: User authority
    pub user_authority: AccountInfo<'info>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MarkLoanDefaulted<'info> {
    #[account(
        mut,
        seeds = [b"loan", user_authority.key().as_ref(), &loan.loan_id.to_le_bytes()],
        bump = loan.bump,
        has_one = user
    )]
    pub loan: Account<'info, Loan>,
    #[account(
        mut,
        seeds = [b"user-profile", user_authority.key().as_ref()],
        bump = user_profile.bump
    )]
    pub user_profile: Account<'info, UserProfile>,
    /// CHECK: User authority
    pub user_authority: AccountInfo<'info>,
    pub user: Signer<'info>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct MarkLoanCompleted<'info> {
    #[account(
        mut,
        seeds = [b"loan", user_authority.key().as_ref(), &loan.loan_id.to_le_bytes()],
        bump = loan.bump,
        has_one = user
    )]
    pub loan: Account<'info, Loan>,
    #[account(
        mut,
        seeds = [b"user-profile", user_authority.key().as_ref()],
        bump = user_profile.bump
    )]
    pub user_profile: Account<'info, UserProfile>,
    /// CHECK: User authority
    pub user_authority: AccountInfo<'info>,
    pub user: Signer<'info>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct WaiveFine<'info> {
    #[account(
        mut,
        seeds = [b"loan", loan.user.as_ref(), &loan.loan_id.to_le_bytes()],
        bump = loan.bump
    )]
    pub loan: Account<'info, Loan>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetCreditScore<'info> {
    #[account(
        seeds = [b"user-profile", authority.key().as_ref()],
        bump = user_profile.bump
    )]
    pub user_profile: Account<'info, UserProfile>,
    pub authority: Signer<'info>,
}

// ============================================================================
// ERRORS
// ============================================================================

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

// ============================================================================
// EVENTS
// ============================================================================

#[event]
pub struct UserRegistered {
    pub user: Pubkey,
    pub full_name: String,
    pub monthly_income: u64,
    pub employment_type: EmploymentType,
    pub timestamp: i64,
}

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

#[event]
pub struct RiskScoreUpdated {
    pub user: Pubkey,
    pub old_score: u16,
    pub new_score: u16,
    pub risk_level: RiskLevel,
    pub default_probability: u16,
    pub timestamp: i64,
}

#[event]
pub struct LoanDefaulted {
    pub loan_id: u64,
    pub user: Pubkey,
    pub outstanding_balance: u64,
    pub total_fines: u64,
    pub defaulted_timestamp: i64,
}

#[event]
pub struct LoanCompleted {
    pub loan_id: u64,
    pub user: Pubkey,
    pub total_repaid: u64,
    pub completed_timestamp: i64,
}

#[event]
pub struct FineWaived {
    pub loan: Pubkey,
    pub user: Pubkey,
    pub installment_number: u8,
    pub waived_amount: u64,
    pub waived_by: Pubkey,
    pub timestamp: i64,
}
