import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { TwitterApi } from 'twitter-api-v2';
import axios from 'axios';
import { EngineConfig } from './config';
import { logger } from './logger';
import { BurnFormatter, BurnReport } from './burnFormatter';
import { PriceOracle } from './priceOracle';

export class StreamBurnWatcher {
  private connection: Connection;
  private twitterClient: TwitterApi | null = null;
  private processedSignatures: Set<string> = new Set();
  private isRunning: boolean = false;
  private subscriptionId: number | null = null;

  constructor(private config: EngineConfig) {
    this.connection = new Connection(config.solanaRpcUrl, {
      wsEndpoint: config.solanaWsUrl,
      commitment: 'confirmed',
    });

    if (config.twitter.enabled && config.twitter.appKey) {
      this.twitterClient = new TwitterApi({
        appKey: config.twitter.appKey,
        appSecret: config.twitter.appSecret,
        accessToken: config.twitter.accessToken,
        accessSecret: config.twitter.accessSecret,
      });
      logger.info('Twitter API v2 client initialized.');
    } else {
      logger.warn('Twitter broadcasting disabled or credentials missing. Operating in dry-run/webhook mode.');
    }
  }

  public async start(): Promise<void> {
    this.isRunning = true;
    const mintPubkey = new PublicKey(this.config.streamMintAddress);
    logger.info(`Starting STREAM burn watcher for Mint: ${mintPubkey.toBase58()}`);

    // Subscribe to all logs involving the target STREAM token mint
    this.subscriptionId = this.connection.onLogs(
      mintPubkey,
      async (logsInfo) => {
        if (logsInfo.err) return;

        // Check if logs contain Burn or BurnChecked
        const hasBurnLog = logsInfo.logs.some(
          (line) => line.includes('Instruction: Burn') || line.includes('Instruction: BurnChecked')
        );

        if (hasBurnLog) {
          const sig = logsInfo.signature;
          if (this.processedSignatures.has(sig)) return;
          this.processedSignatures.add(sig);

          // Clean up cache periodically
          if (this.processedSignatures.size > 2000) {
            const arr = Array.from(this.processedSignatures);
            this.processedSignatures = new Set(arr.slice(1000));
          }

          logger.info(`Detected burn log signature: ${sig}`);
          await this.processBurnSignature(sig);
        }
      },
      'confirmed'
    );

    logger.info('Connected to Solana WebSocket. Live monitoring active.');
  }

  public async processBurnSignature(signature: string): Promise<BurnReport | null> {
    try {
      const tx: ParsedTransactionWithMeta | null = await this.connection.getParsedTransaction(
        signature,
        {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed',
        }
      );

      if (!tx || !tx.meta) {
        logger.warn(`Could not fetch parsed metadata for transaction: ${signature}`);
        return null;
      }

      let totalBurnedRaw = 0;
      let burnerAddress = tx.transaction.message.accountKeys[0].pubkey.toBase58();

      // Inspect inner instructions and top-level instructions for Token program burns
      const instructions = [
        ...tx.transaction.message.instructions,
        ...(tx.meta.innerInstructions?.flatMap((i) => i.instructions) || []),
      ];

      for (const ix of instructions) {
        if ('program' in ix && ix.program === 'spl-token') {
          const parsed = (ix as any).parsed;
          if (parsed && (parsed.type === 'burn' || parsed.type === 'burnChecked')) {
            const info = parsed.info;
            if (info.mint === this.config.streamMintAddress) {
              const rawAmt = info.tokenAmount?.amount || info.amount;
              totalBurnedRaw += parseInt(rawAmt, 10);
              if (info.authority) {
                burnerAddress = info.authority;
              }
            }
          }
        }
      }

      if (totalBurnedRaw <= 0) {
        logger.debug(`No matching STREAM mint burns found in tx ${signature}`);
        return null;
      }

      const burnedAmountTokens = totalBurnedRaw / Math.pow(10, this.config.streamDecimals);

      if (burnedAmountTokens < this.config.minBurnThresholdTokens) {
        logger.info(
          `Burn amount ${burnedAmountTokens} below minimum threshold ${this.config.minBurnThresholdTokens}. Skipping post.`
        );
        return null;
      }

      // Query current remaining supply
      const supplyResp = await this.connection.getTokenSupply(new PublicKey(this.config.streamMintAddress));
      const remainingSupply = supplyResp.value.uiAmount || 0;
      const burnPercentage = (burnedAmountTokens / (remainingSupply + burnedAmountTokens)) * 100;

      // Query live USD value
      const spotPrice = await PriceOracle.getStreamPriceUsd(this.config.streamMintAddress);
      const estimatedUsd = burnedAmountTokens * spotPrice;

      const report: BurnReport = {
        signature,
        burner: burnerAddress,
        burnedAmount: burnedAmountTokens,
        totalRemainingSupply: remainingSupply,
        burnPercentageOfSupply: burnPercentage,
        estimatedUsdValue: estimatedUsd,
        timestamp: new Date(),
        solanaExplorerUrl: `https://solscan.io/tx/${signature}`,
      };

      await this.broadcastReport(report);
      return report;
    } catch (err: any) {
      logger.error(`Error processing burn signature ${signature}: ${err.message}`);
      return null;
    }
  }

  private async broadcastReport(report: BurnReport): Promise<void> {
    const tweetText = BurnFormatter.formatTwitterPost(report);
    logger.info(`Generated Social Post:\n---\n${tweetText}\n---`);

    // 1. Dispatch to Twitter / X
    if (this.twitterClient) {
      try {
        const tweetRes = await this.twitterClient.v2.tweet(tweetText);
        logger.info(`Successfully published tweet ID: ${tweetRes.data.id}`);
      } catch (err: any) {
        logger.error(`Failed to dispatch to Twitter API: ${err.message}`);
      }
    }

    // 2. Dispatch to Discord Webhook
    if (this.config.discordWebhookUrl) {
      try {
        const discordPayload = BurnFormatter.formatDiscordPayload(report);
        await axios.post(this.config.discordWebhookUrl, discordPayload, { timeout: 4000 });
        logger.info('Dispatched burn notification to Discord Webhook.');
      } catch (err: any) {
        logger.error(`Discord dispatch failed: ${err.message}`);
      }
    }

    // 3. Dispatch to Slack Webhook
    if (this.config.slackWebhookUrl) {
      try {
        const slackPayload = {
          text: `🔥 *STREAM Token Burn Detected*\n*Amount:* ${report.burnedAmount.toLocaleString()} STREAM (~$${report.estimatedUsdValue.toFixed(2)})\n*Tx:* <${report.solanaExplorerUrl}|${report.signature.slice(0, 10)}...>`,
        };
        await axios.post(this.config.slackWebhookUrl, slackPayload, { timeout: 4000 });
        logger.info('Dispatched burn notification to Slack.');
      } catch (err: any) {
        logger.error(`Slack dispatch failed: ${err.message}`);
      }
    }
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.subscriptionId !== null) {
      await this.connection.removeOnLogsListener(this.subscriptionId);
      logger.info('Deregistered Solana log listener.');
    }
  }
}