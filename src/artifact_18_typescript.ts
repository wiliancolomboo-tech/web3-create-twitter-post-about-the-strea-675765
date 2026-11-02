import express from 'express';
import { CONFIG } from './config';
import { SolanaSentinel } from './services/solana';
import winston from 'winston';

const logger = winston.createLogger({
  transports: [new winston.transports.Console()],
});

const app = express();
app.use(express.json());

// Telemetry & Liveness endpoint
app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'HEALTHY',
    service: 'stream-burn-sentinel',
    timestamp: new Date().toISOString(),
  });
});

app.listen(CONFIG.PORT, () => {
  logger.info(`HTTP Telemetry server listening on port :${CONFIG.PORT}`);
  const sentinel = new SolanaSentinel();
  sentinel.start().catch((err) => {
    logger.error('Fatal Sentinel runtime error:', err);
    process.exit(1);
  });
});