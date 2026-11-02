import express, { Request, Response } from 'express';
import { config } from './config';
import { logger } from './logger';
import { StreamBurnWatcher } from './burnWatcher';

const app = express();
app.use(express.json());

const watcher = new StreamBurnWatcher(config);

// Liveness & Telemetry Endpoint
app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    monitoredMint: config.streamMintAddress,
    twitterConfigured: config.twitter.enabled,
    minThresholdTokens: config.minBurnThresholdTokens,
  });
});

// Manual Simulation / Replay Trigger Endpoint
app.post('/api/v1/simulate-burn', async (req: Request, res: Response) => {
  const { signature } = req.body;
  if (!signature) {
    return res.status(400).json({ error: 'Missing signature string in payload.' });
  }

  logger.info(`Received manual simulation request for signature: ${signature}`);
  const result = await watcher.processBurnSignature(signature);

  if (!result) {
    return res.status(422).json({ error: 'Signature processed but no valid burn qualified.' });
  }

  return res.status(200).json({ success: true, report: result });
});

const server = app.listen(config.port, async () => {
  logger.info(`Stream Burn Oracle Telemetry server running on port ${config.port}`);
  await watcher.start();
});

// Graceful Shutdown
const shutdown = async () => {
  logger.info('Initiating graceful shutdown...');
  await watcher.stop();
  server.close(() => {
    logger.info('HTTP server closed. Exiting process.');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);