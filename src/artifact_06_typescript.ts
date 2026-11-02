import dotenv from 'dotenv';
dotenv.config();

export interface EngineConfig {
  solanaRpcUrl: string;
  solanaWsUrl: string;
  streamMintAddress: string;
  streamDecimals: number;
  minBurnThresholdTokens: number;
  twitter: {
    appKey: string;
    appSecret: string;
    accessToken: string;
    accessSecret: string;
    enabled: boolean;
  };
  discordWebhookUrl?: string;
  slackWebhookUrl?: string;
  port: number;
}

export const config: EngineConfig = {
  solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  solanaWsUrl: process.env.SOLANA_WS_URL || 'wss://api.mainnet-beta.solana.com',
  streamMintAddress: process.env.STREAM_MINT_ADDRESS || 'STREAMribRwybzpKq5x9bqwPz5B4i1Xv1qFz5q8Gk8vU',
  streamDecimals: parseInt(process.env.STREAM_DECIMALS || '9', 10),
  minBurnThresholdTokens: parseFloat(process.env.MIN_BURN_THRESHOLD || '100'),
  twitter: {
    appKey: process.env.TWITTER_API_KEY || '',
    appSecret: process.env.TWITTER_API_SECRET || '',
    accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
    accessSecret: process.env.TWITTER_ACCESS_SECRET || '',
    enabled: process.env.TWITTER_BROADCAST_ENABLED === 'true',
  },
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  port: parseInt(process.env.PORT || '8080', 10),
};