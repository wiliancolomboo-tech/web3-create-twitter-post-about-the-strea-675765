#[cfg(test)]
mod tests {
    use stream_burn_core::{StreamBurnEngine, STREAM_TOKEN_MINT, ValidationError};

    #[test]
    fn test_valid_burn_event_creation() {
        let sig = "4Nm7a3ZtE9bBvH6kLp1xY8wQ2rC5vF8tG7jK3mN1pQ9sT2wX4yZ6aB8cE0gH2jK4mN6pQ8sT0wV2xY4z";
        let raw_amount = 1_000_000_000_000; // 1,000 STREAM with 9 decimals
        let pre_supply = 10_000_000_000_000; // 10,000 STREAM

        let event = StreamBurnEngine::validate_and_create_event(
            sig,
            245120300,
            1710000000,
            STREAM_TOKEN_MINT,
            "AuthorityAddr111111111111111111111111111111",
            raw_amount,
            pre_supply,
        ).expect("Event creation should succeed");

        assert_eq!(event.ui_amount, 1000.0);
        assert_eq!(event.post_burn_supply, 9_000_000_000_000);

        let metrics = StreamBurnEngine::compute_metrics(&event, 5_000_000_000_000).unwrap();
        assert_eq!(metrics.percentage_of_supply_burned, 10.0);
        assert_eq!(metrics.total_burned_to_date, 6000.0);
    }

    #[test]
    fn test_zero_amount_burn_fails() {
        let sig = "4Nm7a3ZtE9bBvH6kLp1xY8wQ2rC5vF8tG7jK3mN1pQ9sT2wX4yZ6aB8cE0gH2jK4mN6pQ8sT0wV2xY4z";
        let res = StreamBurnEngine::validate_and_create_event(
            sig,
            1,
            1,
            STREAM_TOKEN_MINT,
            "Auth",
            0,
            10000,
        );
        assert_eq!(res.unwrap_err(), ValidationError::ZeroAmount);
    }
}