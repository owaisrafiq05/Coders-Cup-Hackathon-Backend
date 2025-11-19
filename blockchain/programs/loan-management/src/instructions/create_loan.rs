use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::LoanError;
use crate::events::LoanCreated;

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

pub fn handler(
    ctx: Context<CreateLoan>,
    principal_amount: u64,
    interest_rate: u16,
    tenure_months: u8,
    start_timestamp: i64,
) -> Result<()> {
    require!(!ctx.accounts.program_state.paused, LoanError::ProgramPaused);
    
    // Validate inputs
    require!(
        principal_amount >= 5_000_000_000 && principal_amount <= 500_000_000_000,
        LoanError::InvalidLoanAmount
    ); // 5k to 500k PKR (in lamports equivalent)
    
    require!(interest_rate > 0 && interest_rate <= 3000, LoanError::InvalidInterestRate); // 0-30%
    require!(tenure_months >= 3 && tenure_months <= 60, LoanError::InvalidTenure);
    require!(ctx.accounts.user_profile.active_loans == 0, LoanError::ActiveLoanExists);

    let user_profile = &mut ctx.accounts.user_profile;
    let loan = &mut ctx.accounts.loan;
    let program_state = &mut ctx.accounts.program_state;
    let clock = Clock::get()?;

    // Calculate loan details
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

    // Populate loan account
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

    // Update user profile
    user_profile.total_loans = user_profile.total_loans.checked_add(1)
        .ok_or(LoanError::MathOverflow)?;
    user_profile.active_loans = user_profile.active_loans.checked_add(1)
        .ok_or(LoanError::MathOverflow)?;
    user_profile.total_borrowed = user_profile.total_borrowed.checked_add(principal_amount)
        .ok_or(LoanError::MathOverflow)?;
    user_profile.last_updated = clock.unix_timestamp;

    // Update program state
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

    msg!("Loan created: ID={}, Amount={}, Tenure={} months", loan.loan_id, principal_amount, tenure_months);

    Ok(())
}
