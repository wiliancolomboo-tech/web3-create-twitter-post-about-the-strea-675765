# 1. Clone repository and install dependencies
git clone https://github.com/sponsor-org/stream-burn-oracle.git
cd stream-burn-oracle
npm install

# 2. Execute Test Matrix
npm run test

# 3. Build & Run locally
npm run build
npm start

# 4. Turnkey Docker Deployment
docker-compose up -d --build

# 5. Verify Health & Telemetry
curl -i http://localhost:8080/healthz

# 6. Simulate a Test Burn on Mainnet
curl -X POST http://localhost:8080/api/v1/simulate-burn \
  -H "Content-Type: application/json" \
  -d '{"signature":"4sVwP65tXm89vL...INSERT_BURN_TX_HERE..."}'