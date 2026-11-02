# 1. Clone repository and install dependencies
git clone https://github.com/sponsor/streampulse-oracle.git
cd streampulse-oracle
npm install

# 2. Run deterministic test suite
npm test

# 3. Configure Production Environment
cp .env.example .env
# Populate TWITTER_API_KEY, TWITTER_API_SECRET, etc.

# 4. Launch via Docker Compose (Turnkey Deployment)
docker-compose up -d --build

# 5. Verify live metrics & health
curl http://localhost:8080/healthz