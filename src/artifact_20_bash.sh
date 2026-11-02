# 1. Clone repository and install dependencies
git clone https://github.com/your-org/streampulse-sentinel.git
cd streampulse-sentinel
npm install

# 2. Run simulation test to verify syntax and rendering
npx ts-node src/cli.ts simulate -a 250000

# 3. Configure credentials
cp .env.example .env
nano .env

# 4. Launch in isolated Docker container with health monitoring
docker-compose up -d --build

# 5. Verify daemon status
curl http://localhost:8080/healthz
docker logs -f streampulse-sentinel