use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};

declare_id!("StrMBurn11111111111111111111111111111111111");

#[program]
pub mod stream_burn_registry {
    use super::*;

    /// Initialize the global telemetry state for STREAM token burns
    pub fn initialize_registry(
        ctx: Context<InitializeRegistry>,
        stream_mint: Pubkey,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        registry.admin = ctx.accounts.admin.key();
        registry.stream_mint = stream_mint;
        registry.total_burned = 0;
        registry.burn_count = 0;
        registry.bump = ctx.bumps.registry;
        
        msg!("StreamBurn Registry Initialized for Mint: {}", stream_mint);
        Ok(())
    }

    /// Executes an SPL token burn through CPI, updates registry state, and emits verifiable log
    pub fn record_and_verify_burn(
        ctx: Context<RecordAndVerifyBurn>,
        amount: u64,
        memo: String,
    ) -> Result<()> {
        require!(amount > 0, StreamBurnError::InvalidBurnAmount);
        require!(memo.len() <= 128, StreamBurnError::MemoTooLong);

        // 1. Execute SPL Token Burn via CPI
        let cpi_accounts = Burn {
            mint: ctx.accounts.stream_mint.to_account_info(),
            from: ctx.accounts.burner_token_account.to_account_info(),
            authority: ctx.accounts.burner.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::burn(cpi_ctx, amount)?;

        // 2. Mutate on-chain registry counters
        let registry = &mut ctx.accounts.registry;
        registry.total_burned = registry
            .total_burned
            .checked_add(amount)
            .ok_or(StreamBurnError::NumericalOverflow)?;
        registry.burn_count = registry
            .burn_count
            .checked_add(1)
            .ok_or(StreamBurnError::NumericalOverflow)?;

        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp;
        let current_slot = clock.slot;

        // 3. Emit structured deterministic event for indexers
        emit!(StreamBurnedEvent {
            burner: ctx.accounts.burner.key(),
            mint: ctx.accounts.stream_mint.key(),
            amount,
            total_burned_cumulative: registry.total_burned,
            burn_count: registry.burn_count,
            timestamp: current_timestamp,
            slot: current_slot,
            memo,
        });

        msg!(
            "Burn Verified: Amount={} Cumulative={} Slot={}",
            amount,
            registry.total_burned,
            current_slot
        );

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeRegistry<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + BurnRegistry::LEN,
        seeds = [b"stream_burn_registry", stream_mint.key().as_ref()],
        bump
    )]
    pub registry: Account<'info, BurnRegistry>,

    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: Stream token mint verified in seed
    pub stream_mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordAndVerifyBurn<'info> {
    #[account(
        mut,
        seeds = [b"stream_burn_registry", stream_mint.key().as_ref()],
        bump = registry.bump,
        has_one = stream_mint @ StreamBurnError::MintMismatch
    )]
    pub registry: Account<'info, BurnRegistry>,

    #[account(mut)]
    pub stream_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = burner_token_account.mint == stream_mint.key() @ StreamBurnError::InvalidTokenAccount,
        constraint = burner_token_account.owner == burner.key() @ StreamBurnError::UnauthorizedBurner
    )]
    pub burner_token_account: Account<'info, TokenAccount>,

    pub burner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct BurnRegistry {
    pub admin: Pubkey,          // 32
    pub stream_mint: Pubkey,    // 32
    pub total_burned: u64,      // 8
    pub burn_count: u64,        // 8
    pub bump: u8,               // 1
}

impl BurnRegistry {
    pub const LEN: usize = 32 + 32 + 8 + 8 + 1;
}

#[event]
pub struct StreamBurnedEvent {
    pub burner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub total_burned_cumulative: u64,
    pub burn_count: u64,
    pub timestamp: i64,
    pub slot: u64,
    pub memo: String,
}

#[error_code]
pub enum StreamBurnError {
    #[msg("Burn amount must be strictly greater than zero.")]
    InvalidBurnAmount,
    #[msg("Provided token account does not match the Stream mint.")]
    InvalidTokenAccount,
    #[msg("Caller does not own the provided token account.")]
    UnauthorizedBurner,
    #[msg("Arithmetic overflow during burn tally.")]
    NumericalOverflow,
    #[msg("Provided mint does not match the registry target.")]
    MintMismatch,
    #[msg("Memo message exceeds maximum length of 128 characters.")]
    MemoTooLong,
}