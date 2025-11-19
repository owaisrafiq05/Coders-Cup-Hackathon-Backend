use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::LoanError;
use crate::events::FineWaived;

#[derive(Accounts)]
#[instruction(installment_number: u8)]
pub struct WaiveFine<'info> {
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

    #[account(
        mut,
        seeds = [
            b"payment",
            loan.key().as_ref(),
            &installment_number.to_le_bytes()
        ],
        bump = payment_record.bump
    )]
    pub payment_record: Account<'info, PaymentRecord>,

    pub admin: Signer<'info>,
}

pub fn handler(
    ctx: Context<WaiveFine>,
    installment_number: u8,
    waived_amount: u64,
) -> Result<()> {
    let loan = &mut ctx.accounts.loan;
    let payment_record = &ctx.accounts.payment_record;
    let clock = Clock::get()?;

    require!(waived_amount <= payment_record.fine_amount, LoanError::InvalidPaymentAmount);

    // Update loan to reduce outstanding and fines
    loan.outstanding_balance = loan.outstanding_balance.saturating_sub(waived_amount);
    loan.total_fines = loan.total_fines.saturating_sub(waived_amount);

    emit!(FineWaived {
        loan: loan.key(),
        user: loan.user,
        installment_number,
        waived_amount,
        waived_by: ctx.accounts.admin.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Fine waived: Loan={}, Installment={}, Amount={}", 
        loan.loan_id, installment_number, waived_amount);

    Ok(())
}
