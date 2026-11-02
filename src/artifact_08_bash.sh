# 1. Clone repository and install dependencies
git clone https://github.com/sponsor-org/stream-burn-sentinel.git
cd stream-burn-sentinel
npm install

# 2. Configure Environment Secrets
cp .env.example .env
# Fill in TWITTER_API_KEY, HELIUS_API_KEY, and STREAM_MINT_ADDRESS

# 3. Execute deterministic test suite
npm run test

# 4. Trigger manual verification run for any known burn signature
npx ts-node src/cli/StreamBurnDispatcher.ts 5xTzK89pQ1YwLmN4sP7r9Vb2JkLmNoPqRsTuVwXyZ1234567890abcdef1234567890

# 5. Launch turnkey daemon via Docker Compose
docker-compose up -d --build