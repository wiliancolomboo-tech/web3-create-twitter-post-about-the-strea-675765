# 1. Clone repository
git clone https://github.com/sponsor-org/streamburn-sentinel.git
cd streamburn-sentinel

# 2. Configure credentials
cp .env.example .env
# Fill in your Twitter API v2 Keys and RPC endpoints

# 3. Execute deterministic test suite
npm install
npm test

# 4. Launch daemon via Docker Compose
docker-compose up -d --build

# 5. Verify Prometheus telemetry & readiness
curl http://localhost:8080/healthz
curl http://localhost:8080/metrics