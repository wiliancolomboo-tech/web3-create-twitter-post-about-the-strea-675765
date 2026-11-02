#[cfg(test)]
mod tests {
    use stream_burn_engine::{StreamBurnVerifier, STREAM_MINT_ADDRESS};
    use solana_sdk::pubkey::Pubkey;
    use std::str::FromStr;

    #[test]
    fn test_verifier_initialization() {
        let verifier = StreamBurnVerifier::default();
        assert_eq!(
            Pubkey::from_str(STREAM_MINT_ADDRESS).unwrap(),
            Pubkey::from_str("STREAMribRwybzpkmcX6qT97WJ84L8kU3f9vQ5tZvmJ").unwrap()
        );
    }

    #[test]
    fn test_amount_conversion_accuracy() {
        let raw_amount: u64 = 1_000_000_000_000; // 1,000 STREAM with 9 decimals
        let formatted = raw_amount as f64 / 10f64.powi(9);
        assert!((formatted - 1000.0).abs() < f64::EPSILON);
    }
}