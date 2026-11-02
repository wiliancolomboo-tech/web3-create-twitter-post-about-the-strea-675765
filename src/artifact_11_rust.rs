#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use solana_transaction_status::{
        EncodedConfirmedTransactionWithStatusMeta,
        UiTransactionStatusMeta,
        EncodedTransaction,
        UiInstruction,
        UiParsedInstruction,
        UiInnerInstructions,
    };

    #[test]
    fn test_burn_event_parsing_success() {
        let target_mint = "STRMXXxxXXxxXXxxXXxxXXxxXXxxXXxxXXxxXXxxXX";
        
        let sample_parsed_ix = UiInstruction::Parsed(UiParsedInstruction::Parsed(
            solana_transaction_status::ParsedInstruction {
                program: "spl-token".to_string(),
                program_id: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA".to_string(),
                parsed: json!({
                    "type": "burnChecked",
                    "info": {
                        "amount": "2500000000000",
                        "tokenAmount": {
                            "amount": "2500000000000",
                            "decimals": 9,
                            "uiAmount": 2500.0,
                            "uiAmountString": "2500"
                        },
                        "mint": target_mint,
                        "authority": "Auth111111111111111111111111111111111111111"
                    }
                }),
            }
        ));

        let mock_inner = UiInnerInstructions {
            index: 0,
            instructions: vec![sample_parsed_ix],
        };

        let meta = UiTransactionStatusMeta {
            err: None,
            status: Ok(()),
            fee: 5000,
            pre_balances: vec![],
            post_balances: vec![],
            inner_instructions: Some(vec![mock_inner]),
            log_messages: None,
            pre_token_balances: None,
            post_token_balances: None,
            rewards: None,
            loaded_addresses: None,
            return_data: None,
            compute_units_consumed: None,
        };

        let tx = EncodedConfirmedTransactionWithStatusMeta {
            slot: 284910291,
            transaction: solana_transaction_status::EncodedTransactionWithStatusMeta {
                transaction: EncodedTransaction::LegacyBinary("mock".to_string()),
                meta: Some(meta),
                version: None,
            },
            block_time: Some(1710920000),
        };

        let parsed = stream_burnwatch::burn_parser::BurnParser::parse_transaction(
            &tx,
            "4jKx1sZSignature111111111111111111111111111111111111111111111111111111111111111111111",
            target_mint,
            9,
        );

        assert!(parsed.is_some(), "Burn parser failed to extract valid burnChecked");
        let event = parsed.unwrap();
        assert_eq!(event.formatted_amount, 2500.0);
        assert_eq!(event.raw_amount, 2500000000000);
        assert_eq!(event.burn_authority, "Auth111111111111111111111111111111111111111");
        assert_eq!(event.mint, target_mint);
    }

    #[test]
    fn test_failed_tx_ignored() {
        let meta = UiTransactionStatusMeta {
            err: Some(solana_sdk::transaction::TransactionError::InstructionError(
                0,
                solana_sdk::instruction::InstructionError::Custom(1),
            )),
            status: Err(solana_sdk::transaction::TransactionError::InstructionError(
                0,
                solana_sdk::instruction::InstructionError::Custom(1),
            )),
            fee: 5000,
            pre_balances: vec![],
            post_balances: vec![],
            inner_instructions: None,
            log_messages: None,
            pre_token_balances: None,
            post_token_balances: None,
            rewards: None,
            loaded_addresses: None,
            return_data: None,
            compute_units_consumed: None,
        };

        let tx = EncodedConfirmedTransactionWithStatusMeta {
            slot: 284910291,
            transaction: solana_transaction_status::EncodedTransactionWithStatusMeta {
                transaction: EncodedTransaction::LegacyBinary("mock".to_string()),
                meta: Some(meta),
                version: None,
            },
            block_time: Some(1710920000),
        };

        let parsed = stream_burnwatch::burn_parser::BurnParser::parse_transaction(
            &tx,
            "sig_fail",
            "dummy_mint",
            9,
        );

        assert!(parsed.is_none(), "Failed transactions must be rejected");
    }
}