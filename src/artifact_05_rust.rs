use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};

declare_id!("StrBurn111111111111111111111111111111111111");

#[program]
pub mod stream_burn_verifier {
    use super::*;

    pub fn initialize_burn_vault(
        ctx: Context<InitializeBurnVault>,
        expected_mint: Pubkey,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.burn_vault;
        vault.authority = ctx.accounts.authority.key();
        vault.mint = expected_mint;
        vault.total_burned = 0;
        vault.burn_count = 0;
        vault.bump = ctx.bumps.burn_vault;

        msg!(
            "Burn Vault initialized for Mint: {} with Authority: {}",
            vault.mint,
            vault.authority
        );
        Ok(())
    }

    pub fn execute_stream_burn(
        ctx: Context<ExecuteStreamBurn>,
        amount: u64,
        memo: String,
    ) -> Result<()> {
        require!(amount > 0, BurnError::ZeroBurnAmount);
        require!(
            ctx.accounts.burn_source.amount >= amount,
            BurnError::InsufficientFundsForBurn
        );
        require!(memo.len() <= 128, BurnError::MemoTooLong);

        // Execute CPI to SPL Token program
        let cpi_accounts = Burn {
            mint: ctx.accounts.stream_mint.to_account_info(),
            from: ctx.accounts.burn_source.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        token::burn(cpi_ctx, amount)?;

        // Update tracking PDA
        let vault = &mut ctx.accounts.burn_vault;
        vault.total_burned = vault
            .total_burned
            .checked_add(amount)
            .ok_or(BurnError::MathOverflow)?;
        vault.burn_count = vault
            .burn_count
            .checked_add(1)
            .ok_or(BurnError::MathOverflow)?;

        // Fetch remaining supply post-burn
        let remaining_supply = ctx.accounts.stream_mint.supply;

        // Emit typed event for off-chain indexing and social broadcast
        emit!(TokensBurnedEvent {
            mint: ctx.accounts.stream_mint.key(),
            initiator: ctx.accounts.authority.key(),
            amount_burned: amount,
            remaining_supply,
            total_historical_burned: vault.total_burned,
            burn_epoch: Clock::get()?.epoch,
            timestamp: Clock::get()?.unix_timestamp,
            memo,
        });

        msg!(
            "Successfully burned {} raw STREAM tokens. Cumulative burned: {}",
            amount,
            vault.total_burned
        );

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeBurnVault<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + BurnVault::INIT_SPACE,
        seeds = [b"stream_burn_vault", expected_mint.as_ref()],
        bump
    )]
    pub burn_vault: Account<'info, BurnVault>,

    /// CHECK: Target mint to associate with this vault
    pub expected_mint: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteStreamBurn<'info> {
    #[account(
        mut,
        seeds = [b"stream_burn_vault", stream_mint.key().as_ref()],
        bump = burn_vault.bump,
        has_one = authority @ BurnError::UnauthorizedBurner,
        has_one = stream_mint @ BurnError::MintMismatch,
    )]
    pub burn_vault: Account<'info, BurnVault>,

    #[account(mut)]
    pub stream_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = burn_source.mint == stream_mint.key() @ BurnError::MintMismatch,
        constraint = burn_source.owner == authority.key() @ BurnError::UnauthorizedBurner,
    )]
    pub burn_source: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct BurnVault {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub total_burned: u64,
    pub burn_count: u64,
    pub bump: u8,
}

#[event]
pub struct TokensBurnedEvent {
    pub mint: Pubkey,
    pub initiator: Pubkey,
    pub amount_burned: u64,
    pub remaining_supply: u64,
    pub total_historical_burned: u64,
    pub burn_epoch: u64,
    pub timestamp: i64,
    pub memo: String,
}

#[error_code]
pub enum BurnError {
    #[msg("Burn amount must be greater than zero.")]
    ZeroBurnAmount,
    #[msg("Insufficient balance in the burn source token account.")]
    InsufficientFundsForBurn,
    #[msg("Unauthorized burner attempted to initiate transaction.")]
    UnauthorizedBurner,
    #[msg("Supplied mint does not match vault configuration.")]
    MintMismatch,
    #[msg("Mathematical overflow occurred during accounting.")]
    MathOverflow,
    #[msg("Memo metadata exceeds maximum allowed length of 128 bytes.")]
    MemoTooLong,
}