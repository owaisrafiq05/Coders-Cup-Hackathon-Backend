use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::LoanError;
use crate::events::LoanDefaulted;

#[derive(Accounts)]
pub struct MarkLoanDefaulted<'info> {
    #[account(
        mut,
        seeds = [b"loan", user_profile.authority.as_ref(), &loan.loan_id.to_le_bytes()],
        bump = loan.bump
    )]
    pub loan: Account<'info, Loan>,

    #[account(
        mut,
        seeds = [b"user-profile", loan.user.as_ref()],
        bump = user_profile.bump
    )]
    pub user_profile: Account<'info, UserProfile>,

    #[account(mut)]
    pub admin: Signer<'info>,
}

pub fn handler(ctx: Context<MarkLoanDefaulted>) -> Result<()> {
    let loan = &mut ctx.accounts.loan;
    let user_profile = &mut ctx.accounts.user_profile;
    let clock = Clock::get()?;

    require!(loan.status == LoanStatus::Active, LoanError::LoanNotActive);
    require!(loan.outstanding_balance > 0, LoanError::LoanAlreadyCompleted);

    // Mark as defaulted
    loan.status = LoanStatus::Defaulted;
    loan.defaulted_timestamp = Some(clock.unix_timestamp);

    // Update user profile
    user_profile.active_loans = user_profile.active_loans.saturating_sub(1);
    user_profile.defaulted_loans = user_profile.defaulted_loans.checked_add(1)
        .ok_or(LoanError::MathOverflow)?;
    
    // Severely impact credit score
    user_profile.credit_score = user_profile.credit_score.saturating_sub(100).max(300);
    user_profile.risk_level = RiskLevel::Critical;
    user_profile.last_updated = clock.unix_timestamp;

    emit!(LoanDefaulted {
        loan_id: loan.loan_id,
        user: loan.user,
        outstanding_balance: loan.outstanding_balance,
        total_fines: loan.total_fines,
        defaulted_timestamp: clock.unix_timestamp,
    });

    msg!("Loan {} marked as defaulted", loan.loan_id);

    Ok(())
}
