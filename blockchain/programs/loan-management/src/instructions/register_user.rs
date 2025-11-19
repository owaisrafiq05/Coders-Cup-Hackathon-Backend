use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::LoanError;
use crate::events::UserRegistered;

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

pub fn handler(
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
    user_profile.credit_score = 500; // Starting credit score
    user_profile.risk_level = RiskLevel::Medium;
    user_profile.registration_timestamp = clock.unix_timestamp;
    user_profile.last_updated = clock.unix_timestamp;
    user_profile.bump = ctx.bumps.user_profile;

    // Update program state
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
