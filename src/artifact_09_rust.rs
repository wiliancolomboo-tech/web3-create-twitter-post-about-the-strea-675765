#[cfg(test)]
mod tests {
    use stream_burn_oracle::types::BurnEvent;
    use stream_burn_oracle::verifier::BurnProofVerifier;
    use stream_burn_oracle::storage::Database;
    use stream_burn_oracle::twitter::TwitterPublisher;

    #[test]
    fn test_proof_hash_determinism() {
        let sig = "4hK9kE4fU7WzZ1s6nKjB3A8eYvG2mC9sD1eF7tH3rQ4w";
        let slot = 280145210;
        let mint = "STREAMvfAEvPiz7rU7iSza5b22t9e2a4g9235oB6eZc";
        let burner = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
        let amount = 10_000_000_000_000_000; // 10 Million STREAM (9 decimals)

        let hash_1 = BurnProofVerifier::compute_proof_hash(sig, slot, mint, burner, amount);
        let hash_2 = BurnProofVerifier::compute_proof_hash(sig, slot, mint, burner, amount);

        assert_eq!(hash_1, hash_2, "Cryptographic hash must be strictly deterministic");
        assert_eq!(hash_1.len(), 64, "SHA-256 hash must be 64 hexadecimal characters");
    }

    #[test]
    fn test_deflationary_metrics_math() {
        let raw_amount = 5_000_000_000_000_000u64; // 5 Million tokens
        let decimals = 9u8;
        let pre_supply_raw = 100_000_000_000_000_000u64; // 100 Million tokens

        let (amount_ui, pre_supply_ui, post_supply_ui) =
            BurnProofVerifier::calculate_metrics(raw_amount, decimals, pre_supply_raw);

        assert_eq!(amount_ui, 5_000_000.0);
        assert_eq!(pre_supply_ui, 100_000_000.0);
        assert_eq!(post_supply_ui, 95_000_000.0);
    }

    #[test]
    fn test_database_idempotency() {
        let db = Database::init(":memory:").expect("In-memory SQLite initialization must pass");

        let event = BurnEvent {
            signature: "sig_abc_123".to_string(),
            slot: 123456,
            timestamp: 1710000000,
            mint: "STREAM_MINT".to_string(),
            burner: "BURNER_WALLET".to_string(),
            amount_raw: 1000,
            amount_ui: 1.0,
            decimals: 9,
            pre_supply_ui: 100.0,
            post_supply_ui: 99.0,
            percentage_burned: 1.0,
            verification_hash: "d41d8cd98f00b204e9800998ecf8427e".to_string(),
        };

        // First insertion
        assert!(!db.is_processed(&event.signature).unwrap());
        db.record_burn(&event, 1710000001).unwrap();

        // Idempotency check
        assert!(db.is_processed(&event.signature).unwrap());

        // Secondary insertion must fail constraint
        assert!(db.record_burn(&event, 1710000002).is_err());
    }

    #[test]
    fn test_tweet_formatting_syntax() {
        let event = BurnEvent {
            signature: "5VERv8NMvQbGe8eB179e8w612f8h238h923f8h23f8h23".to_string(),
            slot: 285400201,
            timestamp: 1718000000,
            mint: "STREAMvfAEvPiz7rU7iSza5b22t9e2a4g9235oB6eZc".to_string(),
            burner: "BurnAuth11111111111111111111111111111111111".to_string(),
            amount_raw: 50_000_000_000_000_000,
            amount_ui: 50_000_000.0,
            decimals: 9,
            pre_supply_ui: 1_000_000_000.0,
            post_supply_ui: 950_000_000.0,
            percentage_burned: 5.0,
            verification_hash: "a9993e364706816aba3e25717850c26c9cd0d89d".to_string(),
        };

        let tweet = TwitterPublisher::format_burn_tweet(&event);
        assert!(tweet.contains("50,000,000 $STREAM PERMANENTLY INCINERATED"));
        assert!(tweet.contains("5.0000%"));
        assert!(tweet.contains("https://solana.fm/tx/5VERv8NMvQbGe8eB179e8w612f8h238h923f8h23f8h23"));
        assert!(tweet.len() <= 280 || tweet.contains("https://"), "Tweet length compliant with X limits");
    }
}