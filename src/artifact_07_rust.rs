use crate::decoder::BurnEventDecoder;
use crate::models::{BurnTelemetry, FormattedTweetPayload};
use anyhow::{Context, Result};
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Signature;
use solana_transaction_status::UiTransactionEncoding;
use std::str::FromStr;

pub struct SolanaBurnVerifier {
    rpc_client: RpcClient,
    target_mint: Pubkey,
}

impl SolanaBurnVerifier {
    pub fn new(rpc_url: &str, target_mint: &str) -> Result<Self> {
        let rpc_client = RpcClient::new_with_commitment(
            rpc_url.to_string(),
            CommitmentConfig::finalized(),
        );
        let mint_pubkey = Pubkey::from_str(target_mint)
            .context("Failed to parse target token mint address")?;

        Ok(Self {
            rpc_client,
            target_mint: mint_pubkey,
        })
    }

    pub fn verify_and_telemetry(&self, signature_str: &str) -> Result<BurnTelemetry> {
        let signature = Signature::from_str(signature_str)
            .context("Invalid transaction signature format")?;

        let tx = self
            .rpc_client
            .get_transaction(&signature, UiTransactionEncoding::JsonParsed)
            .context("Failed to query transaction from Solana RPC")?;

        let slot = tx.slot;
        let timestamp = tx.block_time.unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64
        });

        let (raw_amount, burner, decimals) =
            BurnEventDecoder::extract_burn_amount(&tx, &self.target_mint)?;

        let divisor = 10_f64.powi(decimals as i32);
        let ui_burned = (raw_amount as f64) / divisor;

        // Query current mint supply from RPC
        let supply_resp = self
            .rpc_client
            .get_token_supply(&self.target_mint)
            .context("Failed to retrieve token supply for mint")?;

        let post_supply = supply_resp.ui_amount.unwrap_or(0.0);
        let pre_supply = post_supply + ui_burned;
        let pct_supply_burned = if pre_supply > 0.0 {
            (ui_burned / pre_supply) * 100.0
        } else {
            0.0
        };

        Ok(BurnTelemetry {
            signature: signature_str.to_string(),
            slot,
            timestamp,
            mint: self.target_mint.to_string(),
            burner: burner.to_string(),
            raw_amount,
            ui_amount: ui_burned,
            decimals,
            pre_supply,
            post_supply,
            pct_supply_burned,
            explorer_url: format!("https://solscan.io/tx/{}", signature_str),
        })
    }

    pub fn format_twitter_content(telemetry: &BurnTelemetry) -> FormattedTweetPayload {
        let short_burner = format!(
            "{}...{}",
            &telemetry.burner[0..4],
            &telemetry.burner[telemetry.burner.len() - 4..]
        );

        let main_tweet = format!(
            "🔥 PROOF OF BURN: {amount:,.2} $STREAM Deflated Permanently\n\n\
            The protocol has finalized a supply reduction on @solana.\n\n\
            📊 Metrics:\n\
            • Tokens Burned: {amount:,.2} $STREAM\n\
            • Circulating Supply Impact: -{pct:.4}%\n\
            • Slot: #{slot}\n\
            • Executing Authority: {burner}\n\n\
            On-chain cryptographic proof below 🧵👇\n\
            #Solana #Streamflow #DeFi #TokenBurn",
            amount = telemetry.ui_amount,
            pct = telemetry.pct_supply_burned,
            slot = telemetry.slot,
            burner = short_burner
        );

        let reply_1 = format!(
            "🔍 Cryptographic Verification & State Telemetry:\n\n\
            • Target Mint: {mint}\n\
            • Pre-Burn Supply: {pre:,.2}\n\
            • Post-Burn Supply: {post:,.2}\n\
            • Program: SPL Token / Token-2022\n\n\
            Immutable Ledger Record: {explorer}",
            mint = telemetry.mint,
            pre = telemetry.pre_supply,
            post = telemetry.post_supply,
            explorer = telemetry.explorer_url
        );

        let reply_2 = format!(
            "💡 Why this matters for the $STREAM Ecosystem:\n\n\
            Streamflow’s tokenomics model leverages dynamic fee accrual and automated lock-up primitives.\n\n\
            Every token burned directly increases non-inflationary scarcity for long-term governance participants.\n\n\
            Track real-time streaming allocations and vesting transparency at streamflow.finance 🌊"
        );

        FormattedTweetPayload {
            main_tweet,
            replies: vec![reply_1, reply_2],
        }
    }
}