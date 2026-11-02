use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};

declare_id!("StrMBurnVerifier111111111111111111111111111111");

#[program]
pub mod stream_burn_verifier {
    use super::*;

    /// Initializes the protocol-wide burn telemetry tracker PDA.
    pub fn initialize_tracker(
        ctx: Context<InitializeTracker>,
        bump: u8,
    ) -> Result<()> {
        let tracker = &mut ctx.accounts.burn_tracker;
        tracker.authority = ctx.accounts.authority.key();
        tracker.stream_mint = ctx.accounts.stream_mint.key();
        tracker.total_burned = 0;
        tracker.burn_count = 0;
        tracker.last_burn_timestamp = 0;
        tracker.bump = bump;

        emit!(TrackerInitialized {
            authority: tracker.authority,
            stream_mint: tracker.stream_mint,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Executes an SPL token burn and immutably records the burn receipt on-chain.
    pub fn execute_and_record_burn(
        ctx: Context<ExecuteAndRecordBurn>,
        amount: u64,
        memo: String,
    ) -> Result<()> {
        require!(amount > 0, BurnError::InvalidBurnAmount);
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

        // 2. Mutate Global Burn Tracker State
        let tracker = &mut ctx.accounts.burn_tracker;
        let clock = Clock::get()?;
        
        tracker.total_burned = tracker
            .total_burned
            .checked_add(amount)
            .ok_or(BurnError::MathOverflow)?;
        tracker.burn_count = tracker
            .burn_count
            .checked_add(1)
            .ok_or(BurnError::MathOverflow)?;
        tracker.last_burn_timestamp = clock.unix_timestamp;

        // 3. Populate Unique Per-Burn Receipt PDA
        let receipt = &mut ctx.accounts.burn_receipt;
        receipt.burner = ctx.accounts.burner.key();
        receipt.stream_mint = ctx.accounts.stream_mint.key();
        receipt.amount = amount;
        receipt.sequence_number = tracker.burn_count;
        receipt.timestamp = clock.unix_timestamp;
        receipt.memo = memo.clone();
        receipt.bump = ctx.bumps.burn_receipt;

        // 4. Emit Audit Event for Real-Time Indexers
        emit!(StreamBurnEvent {
            burner: ctx.accounts.burner.key(),
            stream_mint: ctx.accounts.stream_mint.key(),
            amount,
            cumulative_burned: tracker.total_burned,
            sequence_number: tracker.burn_count,
            timestamp: clock.unix_timestamp,
            memo,
        });

        Ok(())
    }
}

// -----------------------------------------------------------------------------
// ACCOUNT VALIDATION STRUCTS
// -----------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct InitializeTracker<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub stream_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
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
        constraint = burner_token_account.mint == stream_mint.key() @ BurnError::InvalidTokenMint,
        constraint = burner_token_account.owner == burner.key() @ BurnError::UnauthorizedBurner
    )]
    pub burner_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = stream_mint.key() == burn_tracker.stream_mint @ BurnError::InvalidTokenMint
    )]
    pub stream_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"stream_burn_tracker", stream_mint.key().as_ref()],
        bump = burn_tracker.bump
    )]
    pub burn_tracker: Account<'info, BurnTracker>,

    #[account(
        init,
        payer = burner,
        space = 8 + BurnReceipt::INIT_SPACE,
        seeds = [
            b"burn_receipt",
            stream_mint.key().as_ref(),
            (burn_tracker.burn_count + 1).to_le_bytes().as_ref()
        ],
        bump
    )]
    pub burn_receipt: Account<'info, BurnReceipt>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// -----------------------------------------------------------------------------
// STATE ENTITIES
// -----------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct BurnTracker {
    pub authority: Pubkey,
    pub stream_mint: Pubkey,
    pub total_burned: u64,
    pub burn_count: u64,
    pub last_burn_timestamp: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct BurnReceipt {
    pub burner: Pubkey,
    pub stream_mint: Pubkey,
    pub amount: u64,
    pub sequence_number: u64,
    pub timestamp: i64,
    #[max_len(128)]
    pub memo: String,
    pub bump: u8,
}

// -----------------------------------------------------------------------------
// EVENTS & ERRORS
// -----------------------------------------------------------------------------

#[event]
pub struct TrackerInitialized {
    pub authority: Pubkey,
    pub stream_mint: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct StreamBurnEvent {
    pub burner: Pubkey,
    pub stream_mint: Pubkey,
    pub amount: u64,
    pub cumulative_burned: u64,
    pub sequence_number: u64,
    pub timestamp: i64,
    pub memo: String,
}

#[error_code]
pub enum BurnError {
    #[msg("Burn amount must be greater than zero.")]
    InvalidBurnAmount,
    #[msg("Token account mint does not match the registered STREAM mint.")]
    InvalidTokenMint,
    #[msg("Signer is not authorized to burn from this token account.")]
    UnauthorizedBurner,
    #[msg("Memo string exceeds 128 characters.")]
    MemoTooLong,
    #[msg("Arithmetic overflow occurred during calculation.")]
    MathOverflow,
}