use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::LoanError;
use crate::events::PaymentRecorded;

#[derive(Accounts)]
#[instruction(installment_number: u8)]
pub struct RecordPayment<'info> {
    #[account(
        mut,
        seeds = [b"loan", user_profile.authority.as_ref(), &loan.loan_id.to_le_bytes()],
        bump = loan.bump,
        has_one = user
    )]
    pub loan: Account<'info, Loan>,

    #[account(
        mut,
        seeds = [b"user-profile", user.key().as_ref()],
        bump = user_profile.bump
    )]
    pub user_profile: Account<'info, UserProfile>,

    #[account(
        init,
        payer = payer,
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
    pub user: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RecordPayment>,
    installment_number: u8,
    amount: u64,
    payment_hash: String,
) -> Result<()> {
    let loan = &mut ctx.accounts.loan;
    let user_profile = &mut ctx.accounts.user_profile;
    let payment_record = &mut ctx.accounts.payment_record;
    let clock = Clock::get()?;

    require!(loan.status == LoanStatus::Active, LoanError::LoanNotActive);
    require!(installment_number > 0 && installment_number <= loan.tenure_months, LoanError::InvalidInstallmentNumber);
    require!(amount > 0, LoanError::InvalidPaymentAmount);
    require!(payment_hash.len() <= PaymentRecord::MAX_HASH_LEN, LoanError::InvalidStringFormat);

    // Calculate due date for this installment
    let due_date = loan.start_timestamp + ((installment_number as i64) * 30 * 24 * 60 * 60);
    let grace_period = 2 * 24 * 60 * 60; // 2 days in seconds
    let grace_end = due_date + grace_period;

    let on_time = clock.unix_timestamp <= grace_end;
    let days_late = if !on_time {
        ((clock.unix_timestamp - grace_end) / (24 * 60 * 60)) as u16
    } else {
        0
    };

    // Calculate fine if late
    let fine_amount = if days_late > 0 {
        let daily_fine_rate = 50; // 0.5% per day
        let fine = (loan.monthly_installment as u128)
            .checked_mul(daily_fine_rate as u128)
            .ok_or(LoanError::MathOverflow)?
            .checked_mul(days_late as u128)
            .ok_or(LoanError::MathOverflow)?
            / 10000;
        fine as u64
    } else {
        0
    };

    let total_due = loan.monthly_installment + fine_amount;
    require!(amount >= total_due, LoanError::InsufficientPayment);

    // Record payment
    payment_record.loan = loan.key();
    payment_record.user = ctx.accounts.user.key();
    payment_record.installment_number = installment_number;
    payment_record.amount = amount;
    payment_record.fine_amount = fine_amount;
    payment_record.payment_timestamp = clock.unix_timestamp;
    payment_record.payment_hash = payment_hash;
    payment_record.on_time = on_time;
    payment_record.days_late = days_late;
    payment_record.bump = ctx.bumps.payment_record;

    // Update loan
    loan.total_repaid = loan.total_repaid.checked_add(amount)
        .ok_or(LoanError::MathOverflow)?;
    loan.outstanding_balance = loan.outstanding_balance.saturating_sub(amount);
    loan.total_fines = loan.total_fines.checked_add(fine_amount)
        .ok_or(LoanError::MathOverflow)?;

    // Update user profile
    user_profile.total_repaid = user_profile.total_repaid.checked_add(amount)
        .ok_or(LoanError::MathOverflow)?;
    
    if on_time {
        user_profile.on_time_payments = user_profile.on_time_payments.checked_add(1)
            .ok_or(LoanError::MathOverflow)?;
        // Improve credit score for on-time payment
        user_profile.credit_score = user_profile.credit_score.saturating_add(2).min(850);
    } else {
        user_profile.late_payments = user_profile.late_payments.checked_add(1)
            .ok_or(LoanError::MathOverflow)?;
        // Reduce credit score for late payment
        user_profile.credit_score = user_profile.credit_score.saturating_sub(5).max(300);
    }

    user_profile.last_updated = clock.unix_timestamp;

    emit!(PaymentRecorded {
        loan: loan.key(),
        user: ctx.accounts.user.key(),
        installment_number,
        amount,
        fine_amount,
        payment_timestamp: clock.unix_timestamp,
        on_time,
        days_late,
    });

    msg!("Payment recorded: Loan={}, Installment={}, Amount={}, OnTime={}", 
        loan.loan_id, installment_number, amount, on_time);

    Ok(())
}
