use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::LoanError;

#[derive(Accounts)]
pub struct UpdateUserProfile<'info> {
    #[account(
        mut,
        seeds = [b"user-profile", authority.key().as_ref()],
        bump = user_profile.bump,
        has_one = authority @ LoanError::Unauthorized
    )]
    pub user_profile: Account<'info, UserProfile>,

    pub authority: Signer<'info>,
}

pub fn handler(
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

    msg!("User profile updated for: {}", user_profile.full_name);

    Ok(())
}
