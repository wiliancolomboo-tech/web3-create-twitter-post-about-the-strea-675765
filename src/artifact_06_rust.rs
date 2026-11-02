use anyhow::{bail, Context, Result};
use solana_sdk::pubkey::Pubkey;
use solana_transaction_status::{
    EncodedConfirmedTransactionWithStatusMeta, UiInstruction, UiParsedInstruction,
    UiTransactionEncoding,
};
use std::str::FromStr;

pub struct BurnEventDecoder;

impl BurnEventDecoder {
    /// Inspects transaction instructions and inner instructions for SPL Token Burn or BurnChecked
    pub fn extract_burn_amount(
        tx: &EncodedConfirmedTransactionWithStatusMeta,
        target_mint: &Pubkey,
    ) -> Result<(u64, Pubkey, u8)> {
        let meta = tx
            .transaction
            .meta
            .as_ref()
            .context("Missing transaction metadata")?;

        if let Some(err) = &meta.err {
            bail!("Transaction executed with error: {:?}", err);
        }

        let target_mint_str = target_mint.to_string();

        // 1. Scan primary parsed instructions
        if let solana_transaction_status::EncodedTransaction::Json(ui_tx) = &tx.transaction.transaction {
            if let solana_transaction_status::UiMessage::Parsed(parsed_msg) = &ui_tx.message {
                for instr in &parsed_msg.instructions {
                    if let UiInstruction::Parsed(UiParsedInstruction::Parsed(parsed_obj)) = instr {
                        if parsed_obj.program == "spl-token" || parsed_obj.program == "spl-token-2022" {
                            if let Some((amount, burner, decimals)) =
                                Self::parse_parsed_json_burn(&parsed_obj.parsed, &target_mint_str)?
                            {
                                return Ok((amount, burner, decimals));
                            }
                        }
                    }
                }
            }
        }

        // 2. Scan inner instructions if burn was executed via CPI (e.g. Streamflow Treasury / Staking)
        if let Some(inner_ix_sets) = &meta.inner_instructions {
            for inner_set in inner_ix_sets {
                for inner_ix in &inner_set.instructions {
                    if let UiInstruction::Parsed(UiParsedInstruction::Parsed(parsed_obj)) = inner_ix {
                        if parsed_obj.program == "spl-token" || parsed_obj.program == "spl-token-2022" {
                            if let Some((amount, burner, decimals)) =
                                Self::parse_parsed_json_burn(&parsed_obj.parsed, &target_mint_str)?
                            {
                                return Ok((amount, burner, decimals));
                            }
                        }
                    }
                }
            }
        }

        bail!("No qualifying Burn or BurnChecked instruction found for mint {}", target_mint_str);
    }

    fn parse_parsed_json_burn(
        val: &serde_json::Value,
        target_mint: &str,
    ) -> Result<Option<(u64, Pubkey, u8)>> {
        let ix_type = val.get("type").and_then(|t| t.as_str()).unwrap_or_default();
        if ix_type != "burn" && ix_type != "burnChecked" {
            return Ok(None);
        }

        let info = match val.get("info") {
            Some(i) => i,
            None => return Ok(None),
        };

        let mint_val = info.get("mint").and_then(|m| m.as_str()).unwrap_or_default();
        if mint_val != target_mint {
            return Ok(None);
        }

        let authority_str = info
            .get("authority")
            .or_else(|| info.get("multisigAuthority"))
            .and_then(|a| a.as_str())
            .context("Missing burner authority")?;

        let authority = Pubkey::from_str(authority_str)?;

        let raw_amount = if let Some(amount_str) = info.get("amount").and_then(|a| a.as_str()) {
            amount_str.parse::<u64>().context("Invalid raw amount")?
        } else if let Some(token_amount) = info.get("tokenAmount") {
            token_amount
                .get("amount")
                .and_then(|a| a.as_str())
                .context("Missing tokenAmount.amount")?
                .parse::<u64>()?
        } else {
            bail!("Unrecognized amount payload in burn instruction");
        };

        let decimals = info
            .get("decimals")
            .and_then(|d| d.as_u64())
            .unwrap_or(9) as u8;

        Ok(Some((raw_amount, authority, decimals)))
    }
}