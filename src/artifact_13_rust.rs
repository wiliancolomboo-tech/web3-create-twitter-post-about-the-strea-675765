#[cfg(test)]
mod tests {
    use stream_burn_indexer::models::BurnTelemetry;
    use stream_burn_indexer::verifier::SolanaBurnVerifier;

    #[test]
    fn test_tweet_formatting_determinism() {
        let telemetry = BurnTelemetry {
            signature: "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNmbznPyFiGSR9g89Mh".to_string(),
            slot: 284192000,
            timestamp: 1711929600,
            mint: "STREAMribCwybE6ZqM96uL6xQhG6MvFp2fGj9a5q2Pj".to_string(),
            burner: "73xQv8yK9817X1111111111111111111111111111111".to_string(),
            raw_amount: 1_000_000_000_000_000,
            ui_amount: 1_000_000.0,
            decimals: 9,
            pre_supply: 1_000_000_000.0,
            post_supply: 999_000_000.0,
            pct_supply_burned: 0.10,
            explorer_url: "https://solscan.io/tx/3J98t1WpEZ73CNmQviecrnyiWrnqRhWNmbznPyFiGSR9g89Mh".to_string(),
        };

        let formatted = SolanaBurnVerifier::format_twitter_content(&telemetry);

        assert!(formatted.main_tweet.contains("1,000,000.00 $STREAM"));
        assert!(formatted.main_tweet.contains("#Solana"));
        assert!(formatted.main_tweet.contains("#Streamflow"));
        assert_eq!(formatted.replies.len(), 2);
        assert!(formatted.replies[0].contains("Pre-Burn Supply: 1,000,000,000.00"));
        assert!(formatted.replies[1].contains("app.streamflow.finance"));
    }
}