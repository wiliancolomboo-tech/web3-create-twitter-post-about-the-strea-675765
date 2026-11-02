# 1. Clone repository and install dependencies
git clone https://github.com/sponsor-streamflow/streamburn-sentinel.git
cd streamburn-sentinel
npm install

# 2. Configure Environment Variables
cp .env.example .env
# Edit .env with Solana RPC endpoints & X (Twitter) API Keys

# 3. Compile and Run Comprehensive Test Suite
npm test

# 4. Dry-run verify a known historic burn signature
npm run start -- verify-tx 5VERv8NMvQbJgyW5vKzWJzF1rE6iJgQn4mPqJ8kLrS7uV3wX9yZ2aB4cD6eF8gH1 --dry-run

# 5. Launch turnkey 24/7 background service via Docker
docker-compose up -d --build
docker-compose logs -f streamburn-sentinel