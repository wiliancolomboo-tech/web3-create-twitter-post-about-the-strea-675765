# 1. Clone repository
git clone https://github.com/sponsor/stream-burnpulse.git
cd stream-burnpulse

# 2. Configure environment credentials
cp .env.example .env
# Edit .env with Twitter v2 API Keys & RPC Endpoint

# 3. Install dependencies & run test suite
npm install
npm test

# 4. Perform a dry-run test against a known Solana transaction
npm run build
node dist/cli.js --dry-run --simulate-tx 5KkM9qC6W...

# 5. Launch in background via Docker
docker-compose up -d --build

# 6. Monitor streaming logs
docker logs -f stream-burnpulse-daemon