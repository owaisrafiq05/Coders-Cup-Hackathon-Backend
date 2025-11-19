use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::LoanError;
use crate::events::RiskScoreUpdated;

#[derive(Accounts)]
pub struct UpdateRiskScore<'info> {
    #[account(
        mut,
        seeds = [b"user-profile", user.key().as_ref()],
        bump = user_profile.bump
    )]
    pub user_profile: Account<'info, UserProfile>,

    #[account(
        init_if_needed,
        payer = admin,
        space = RiskProfile::LEN,
        seeds = [b"risk-profile", user.key().as_ref()],
        bump
    )]
    pub risk_profile: Account<'info, RiskProfile>,

    /// CHECK: User authority
    pub user: AccountInfo<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
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

    // Update user profile
    user_profile.credit_score = risk_score;
    user_profile.risk_level = risk_level.clone();
    user_profile.last_updated = clock.unix_timestamp;

    // Update risk profile
    risk_profile.user = ctx.accounts.user.key();
    risk_profile.risk_score = risk_score;
    risk_profile.risk_level = risk_level.clone();
    risk_profile.default_probability = default_probability;
    
    // Calculate recommended max loan based on income and risk
    let income_multiplier = match risk_level {
        RiskLevel::Low => 10,
        RiskLevel::Medium => 6,
        RiskLevel::High => 3,
        RiskLevel::Critical => 1,
    };
    risk_profile.recommended_max_loan = user_profile.monthly_income
        .checked_mul(income_multiplier)
        .ok_or(LoanError::MathOverflow)?;
    
    risk_profile.last_calculated = clock.unix_timestamp;
    risk_profile.factors_count = 5; // Placeholder
    risk_profile.bump = ctx.bumps.risk_profile;

    emit!(RiskScoreUpdated {
        user: ctx.accounts.user.key(),
        old_score,
        new_score: risk_score,
        risk_level,
        default_probability,
        timestamp: clock.unix_timestamp,
    });

    msg!("Risk score updated for user: score={}, level={:?}", risk_score, risk_level);

    Ok(())
}
