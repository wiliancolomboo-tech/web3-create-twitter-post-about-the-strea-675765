use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};

declare_id!("StrMBurnEngine1111111111111111111111111111");

#[program]
pub mod stream_burner {
    use super::*;

    /// Initialize the Burn Configuration and Vault PDA
    pub fn initialize(ctx: Context<Initialize>, crank_reward_bps: u16) -> Result<()> {
        require!(crank_reward_bps <= 500, BurnEngineError::RewardTooHigh); // Max 5% reward

        let config = &mut ctx.accounts.burn_config;
        config.admin = ctx.accounts.admin.key();
        config.mint = ctx.accounts.mint.key();
        config.vault = ctx.accounts.vault.key();
        config.total_burned = 0;
        config.total_burn_events = 0;
        config.crank_reward_bps = crank_reward_bps;
        config.bump = ctx.bumps.burn_config;
        config.vault_bump = ctx.bumps.vault;

        emit!(InitializedEvent {
            admin: config.admin,
            mint: config.mint,
            vault: config.vault,
        });

        Ok(())
    }

    /// Deposits STREAM tokens into the burn vault
    pub fn deposit_tokens(ctx: Context<DepositTokens>, amount: u64) -> Result<()> {
        require!(amount > 0, BurnEngineError::ZeroAmount);

        let cpi_accounts = token::Transfer {
            from: ctx.accounts.depositor_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        emit!(TokensDepositedEvent {
            depositor: ctx.accounts.depositor.key(),
            amount,
        });

        Ok(())
    }

    /// Executes the burn CPI from the vault PDA and dispatches a verifiable on-chain event
    pub fn execute_burn(ctx: Context<ExecuteBurn>, min_burn_threshold: u64) -> Result<()> {
        let vault_balance = ctx.accounts.vault.amount;
        require!(
            vault_balance >= min_burn_threshold && vault_balance > 0,
            BurnEngineError::InsufficientVaultBalance
        );

        let mint_key = ctx.accounts.mint.key();
        let config_seeds: &[&[u8]] = &[
            b"burn_config",
            mint_key.as_ref(),
            &[ctx.accounts.burn_config.bump],
        ];
        let signer_seeds = &[config_seeds];

        // 1. Calculate Crank Fee (if configured to incentivize decentralized keepers)
        let crank_fee = if ctx.accounts.burn_config.crank_reward_bps > 0 {
            (vault_balance as u128 * ctx.accounts.burn_config.crank_reward_bps as u128 / 10000) as u64
        } else {
            0
        };

        let net_burn_amount = vault_balance
            .checked_sub(crank_fee)
            .ok_or(BurnEngineError::MathOverflow)?;

        if crank_fee > 0 {
            let reward_accounts = token::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.crank_token_account.to_account_info(),
                authority: ctx.accounts.burn_config.to_account_info(),
            };
            let reward_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                reward_accounts,
                signer_seeds,
            );
            token::transfer(reward_ctx, crank_fee)?;
        }

        // 2. Perform SPL Token Burn CPI
        let burn_accounts = Burn {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.burn_config.to_account_info(),
        };
        let burn_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            burn_accounts,
            signer_seeds,
        );
        token::burn(burn_ctx, net_burn_amount)?;

        // 3. State update
        let config = &mut ctx.accounts.burn_config;
        config.total_burned = config
            .total_burned
            .checked_add(net_burn_amount)
            .ok_or(BurnEngineError::MathOverflow)?;
        config.total_burn_events = config
            .total_burn_events
            .checked_add(1)
            .ok_or(BurnEngineError::MathOverflow)?;

        // 4. Emit verifiable log for indexers and social media bots
        emit!(StreamBurnedEvent {
            mint: config.mint,
            burner: ctx.accounts.crank.key(),
            amount_burned: net_burn_amount,
            crank_reward: crank_fee,
            total_burned_to_date: config.total_burned,
            burn_sequence_id: config.total_burn_events,
            clock_timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

// -----------------------------------------------------------------------------
// Account Contexts
// -----------------------------------------------------------------------------

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = admin,
        space = 8 + BurnConfig::LEN,
        seeds = [b"burn_config", mint.key().as_ref()],
        bump
    )]
    pub burn_config: Account<'info, BurnConfig>,

    #[account(
        init,
        payer = admin,
        seeds = [b"burn_vault", mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = burn_config
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct DepositTokens<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        mut,
        constraint = depositor_token_account.mint == burn_config.mint @ BurnEngineError::InvalidMintMatch
    )]
    pub depositor_token_account: Account<'info, TokenAccount>,

    #[account(
        seeds = [b"burn_config", burn_config.mint.as_ref()],
        bump = burn_config.bump
    )]
    pub burn_config: Account<'info, BurnConfig>,

    #[account(
        mut,
        seeds = [b"burn_vault", burn_config.mint.as_ref()],
        bump = burn_config.vault_bump
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ExecuteBurn<'info> {
    #[account(mut)]
    pub crank: Signer<'info>,

    #[account(
        mut,
        constraint = crank_token_account.mint == burn_config.mint @ BurnEngineError::InvalidMintMatch
    )]
    pub crank_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"burn_config", mint.key().as_ref()],
        bump = burn_config.bump
    )]
    pub burn_config: Account<'info, BurnConfig>,

    #[account(
        mut,
        address = burn_config.mint
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"burn_vault", mint.key().as_ref()],
        bump = burn_config.vault_bump
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// -----------------------------------------------------------------------------
// State Structures & Events
// -----------------------------------------------------------------------------

#[account]
pub struct BurnConfig {
    pub admin: Pubkey,            // 32
    pub mint: Pubkey,             // 32
    pub vault: Pubkey,            // 32
    pub total_burned: u64,        // 8
    pub total_burn_events: u64,   // 8
    pub crank_reward_bps: u16,    // 2
    pub bump: u8,                 // 1
    pub vault_bump: u8,           // 1
}

impl BurnConfig {
    pub const LEN: usize = 32 + 32 + 32 + 8 + 8 + 2 + 1 + 1;
}

#[event]
pub struct InitializedEvent {
    pub admin: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
}

#[event]
pub struct TokensDepositedEvent {
    pub depositor: Pubkey,
    pub amount: u64,
}

#[event]
pub struct StreamBurnedEvent {
    pub mint: Pubkey,
    pub burner: Pubkey,
    pub amount_burned: u64,
    pub crank_reward: u64,
    pub total_burned_to_date: u64,
    pub burn_sequence_id: u64,
    pub clock_timestamp: i64,
}

#[error_code]
pub enum BurnEngineError {
    #[msg("Reward basis points exceeds maximum allowance (500 bps = 5%)")]
    RewardTooHigh,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Vault does not satisfy minimum burn threshold")]
    InsufficientVaultBalance,
    #[msg("Arithmetic overflow occurred")]
    MathOverflow,
    #[msg("Token account mint does not match the configured burn mint")]
    InvalidMintMatch,
}