use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::LoanError;
use crate::events::LoanCompleted;

#[derive(Accounts)]
pub struct MarkLoanCompleted<'info> {
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

    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<MarkLoanCompleted>) -> Result<()> {
    let loan = &mut ctx.accounts.loan;
    let user_profile = &mut ctx.accounts.user_profile;
    let clock = Clock::get()?;

    require!(loan.status == LoanStatus::Active, LoanError::LoanNotActive);
    require!(loan.outstanding_balance == 0, LoanError::InsufficientPayment);

    // Mark as completed
    loan.status = LoanStatus::Completed;
    loan.completed_timestamp = Some(clock.unix_timestamp);

    // Update user profile
    user_profile.active_loans = user_profile.active_loans.saturating_sub(1);
    user_profile.completed_loans = user_profile.completed_loans.checked_add(1)
        .ok_or(LoanError::MathOverflow)?;
    
    // Improve credit score for completing loan
    user_profile.credit_score = user_profile.credit_score.saturating_add(20).min(850);
    user_profile.last_updated = clock.unix_timestamp;

    emit!(LoanCompleted {
        loan_id: loan.loan_id,
        user: loan.user,
        total_repaid: loan.total_repaid,
        completed_timestamp: clock.unix_timestamp,
    });

    msg!("Loan {} marked as completed", loan.loan_id);

    Ok(())
}
