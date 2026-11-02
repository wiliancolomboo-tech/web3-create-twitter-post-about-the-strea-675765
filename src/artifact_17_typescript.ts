import { Connection, PublicKey } from '@solana/web3.js';
import { BorshCoder, EventParser } from '@coral-xyz/anchor';
import { CONFIG } from '../config';
import { TwitterService } from './twitter';
import { WebhookService } from './webhook';
import { formatTokenAmount } from '../utils/formatter';
import winston from 'winston';

const logger = winston.createLogger({
  transports: [new winston.transports.Console()],
});

// Minimal IDL matching the StreamBurnedEvent
const PROGRAM_IDL: any = {
  version: '0.1.0',
  name: 'stream_burner',
  events: [
    {
      name: 'StreamBurnedEvent',
      fields: [
        { name: 'burner', type: 'publicKey', index: false },
        { name: 'mint', type: 'publicKey', index: false },
        { name: 'amountBurned', type: 'u64', index: false },
        { name: 'totalCumulativeBurned', type: 'u64', index: false },
        { name: 'burnCount', type: 'u64', index: false },
        { name: 'timestamp', type: 'i64', index: false },
        { name: 'memo', type: 'string', index: false },
      ],
    },
  ],
};

export class SolanaSentinel {
  private connection: Connection;
  private twitterService: TwitterService;
  private coder: BorshCoder;
  private processedSignatures: Set<string> = new Set();

  constructor() {
    this.connection = new Connection(CONFIG.SOLANA_RPC_URL, {
      wsEndpoint: CONFIG.SOLANA_WS_URL,
      commitment: 'confirmed',
    });
    this.twitterService = new TwitterService();
    this.coder = new BorshCoder(PROGRAM_IDL);
  }

  public async start() {
    logger.info(`Listening for $STREAM burns on Program ID: ${CONFIG.BURN_PROGRAM_ID}...`);
    const programId = new PublicKey(CONFIG.BURN_PROGRAM_ID);

    this.connection.onLogs(
      programId,
      async (logs, ctx) => {
        if (logs.err) return;
        const signature = logs.signature;

        if (this.processedSignatures.has(signature)) return;
        this.processedSignatures.add(signature);

        // Keep set size managed
        if (this.processedSignatures.size > 10000) {
          const firstItem = this.processedSignatures.values().next().value;
          if (firstItem) this.processedSignatures.delete(firstItem);
        }

        const parser = new EventParser(programId, this.coder);
        const events = parser.parseLogs(logs.logs);

        for (const event of events) {
          if (event.name === 'StreamBurnedEvent') {
            await this.handleBurnEvent(event.data, signature);
          }
        }
      },
      'confirmed'
    );
  }

  private async handleBurnEvent(data: any, signature: string) {
    const rawAmount = BigInt(data.amountBurned.toString());
    const rawTotal = BigInt(data.totalCumulativeBurned.toString());
    const burnCount = Number(data.burnCount.toString());
    const memo = data.memo;

    const burnAmountFormatted = formatTokenAmount(rawAmount, CONFIG.DECIMALS);
    const totalBurnedFormatted = formatTokenAmount(rawTotal, CONFIG.DECIMALS);

    logger.info(`[DETECTED BURN] ${burnAmountFormatted} $STREAM incinerated in Tx: ${signature}`);

    try {
      // 1. Post to Twitter API v2
      await this.twitterService.publishBurnThread({
        burnAmountFormatted,
        totalBurnedFormatted,
        signature,
        burnCount,
        memo,
      });

      // 2. Broadcast to Slack / Discord
      await WebhookService.broadcast({
        burnAmountFormatted,
        totalBurnedFormatted,
        signature,
        burnCount,
      });
    } catch (error) {
      logger.error('Failed to process burn notification pipeline:', error);
    }
  }
}