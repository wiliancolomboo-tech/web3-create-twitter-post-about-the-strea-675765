# 1. Build and verify the Anchor program
anchor build

# 2. Deploy to Solana Devnet or Mainnet-Beta
anchor deploy --provider.cluster mainnet --program-keypair ./target/deploy/stream_burn-keypair.json

# 3. Initialize the PDA state tracking
npx ts-node scripts/initialize-engine.ts --mint <STREAM_MINT_ADDRESS>

# 4. Run the full unit/integration test suite
anchor test