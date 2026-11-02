> token::burn(
>     CpiContext::new_with_signer(
>         ctx.accounts.token_program.to_account_info(),
>         token::Burn {
>             mint: ctx.accounts.stream_mint.to_account_info(),
>             from: ctx.accounts.vault_token_account.to_account_info(),
>             authority: ctx.accounts.burn_auth_pda.to_account_info(),
>         },
>         signer_seeds,
>     ),
>     burn_amount,
> )?;
>