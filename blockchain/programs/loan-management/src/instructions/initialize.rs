use anchor_lang::prelude::*;
use crate::state::*;

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

pub fn handler(ctx: Context<Initialize>, fee_percentage: u16) -> Result<()> {
    require!(fee_percentage <= 1000, crate::errors::LoanError::InvalidInterestRate);

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
