use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
pub struct GetCreditScore<'info> {
    #[account(
        seeds = [b"user-profile", user.key().as_ref()],
        bump = user_profile.bump
    )]
    pub user_profile: Account<'info, UserProfile>,

    /// CHECK: User authority
    pub user: AccountInfo<'info>,
}

pub fn handler(ctx: Context<GetCreditScore>) -> Result<u16> {
    let user_profile = &ctx.accounts.user_profile;
    
    msg!("Credit score for {}: {}", user_profile.full_name, user_profile.credit_score);
    
    Ok(user_profile.credit_score)
}
