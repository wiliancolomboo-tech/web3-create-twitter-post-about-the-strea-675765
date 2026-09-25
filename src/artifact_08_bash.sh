# Build the program binaries and generate the IDL
anchor build

# Retrieve your newly generated Program ID
solana address -k target/deploy/stream_burner-keypair.json