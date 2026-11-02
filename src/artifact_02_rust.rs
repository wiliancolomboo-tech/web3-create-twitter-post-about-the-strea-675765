use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};

declare_id!("StrMBurn11111111111111111111111111111111111");

#[program]
pub mod stream_burn_verifier {
    use super::*;

    /// Initialize the global tracker PDA for the STREAM burn registry
    pub fn initialize_tracker(
        ctx: Context<InitializeTracker>,
        decimals: u8,
    ) -> Result<()> {
        let tracker = &mut ctx.accounts.burn_tracker;
        tracker.admin = ctx.accounts.admin.key();
        tracker.stream_mint = ctx.accounts.stream_mint.key();
        tracker.total_burned_native = 0;
        tracker.burn_count = 0;
        tracker.decimals = decimals;
        tracker.bump = ctx.bumps.burn_tracker;

        msg!("StreamBurn Registry Initialized for Mint: {}", tracker.stream_mint);
        Ok(())
    }

    /// Execute and verify an SPL burn of STREAM tokens while updating immutable on-chain tallies
    pub fn execute_and_record_burn(
        ctx: Context<ExecuteAndRecordBurn>,
        amount: u64,
        memo: String,
    ) -> Result<()> {
        require!(amount > 0, BurnError::ZeroBurnAmount);
        require!(memo.len() <= 128, BurnError::MemoTooLong);

        // 1. Execute SPL Token Burn via CPI
        let cpi_accounts = Burn {
            mint: ctx.accounts.stream_mint.to_account_info(),
            from: ctx.accounts.burner_token_account.to_account_info(),
            authority: ctx.accounts.burner.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::burn(cpi_ctx, amount)?;

        // 2. Update PDA Aggregate State
        let tracker = &mut ctx.accounts.burn_tracker;
        tracker.total_burned_native = tracker
            .total_burned_native
            .checked_add(amount)
            .ok_or(BurnError::ArithmeticOverflow)?;
        tracker.burn_count = tracker
            .burn_count
            .checked_add(1)
            .ok_or(BurnError::ArithmeticOverflow)?;

        // 3. Emit Deterministic Event for Off-Chain Social Dispatchers
        emit!(StreamBurnedEvent {
            burner: ctx.accounts.burner.key(),
            mint: ctx.accounts.stream_mint.key(),
            amount,
            total_burned_to_date: tracker.total_burned_native,
            burn_count: tracker.burn_count,
            timestamp: Clock::get()?.unix_timestamp,
            memo,
        });

        msg!(
            "Burn successful: {} native units burned. Cumulative total: {}",
            amount,
            tracker.total_burned_native
        );

        Ok(())
    }
}

// -----------------------------------------------------------------------------
// Account Contexts
// -----------------------------------------------------------------------------

#[derive(Accounts)]
pub struct InitializeTracker<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    pub stream_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = admin,
        space = 8 + BurnTracker::INIT_SPACE,
        seeds = [b"stream_burn_tracker", stream_mint.key().as_ref()],
        bump
    )]
    pub burn_tracker: Account<'info, BurnTracker>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteAndRecordBurn<'info> {
    #[account(mut)]
    pub burner: Signer<'info>,

    #[account(
        mut,
        address = burn_tracker.stream_mint @ BurnError::InvalidMint
    )]
    pub stream_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = burner_token_account.mint == stream_mint.key() @ BurnError::MismatchedTokenAccount,
        constraint = burner_token_account.owner == burner.key() @ BurnError::UnauthorizedOwner
    )]
    pub burner_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"stream_burn_tracker", stream_mint.key().as_ref()],
        bump = burn_tracker.bump
    )]
    pub burn_tracker: Account<'info, BurnTracker>,

    pub token_program: Program<'info, Token>,
}

// -----------------------------------------------------------------------------
// State Structs
// -----------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct BurnTracker {
    pub admin: Pubkey,
    pub stream_mint: Pubkey,
    pub total_burned_native: u64,
    pub burn_count: u64,
    pub decimals: u8,
    pub bump: u8,
}

// -----------------------------------------------------------------------------
// Events
// -----------------------------------------------------------------------------

#[event]
pub struct StreamBurnedEvent {
    pub burner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub total_burned_to_date: u64,
    pub burn_count: u64,
    pub timestamp: i64,
    pub memo: String,
}

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

#[error_code]
pub enum BurnError {
    #[msg("Burn amount must be greater than zero.")]
    ZeroBurnAmount,
    #[msg("Memo string exceeds 128 characters.")]
    MemoTooLong,
    #[msg("Arithmetic overflow occurred during aggregation.")]
    ArithmeticOverflow,
    #[msg("Supplied mint does not match the registered STREAM mint.")]
    InvalidMint,
    #[msg("Token account mint does not match target mint.")]
    MismatchedTokenAccount,
    #[msg("Signer does not own the source token account.")]
    UnauthorizedOwner,
}