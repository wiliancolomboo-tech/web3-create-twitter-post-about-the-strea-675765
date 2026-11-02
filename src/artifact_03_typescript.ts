export interface BurnEvent {
  signature: string;
  slot: number;
  blockTime: number | null;
  mint: string;
  burner: string;
  amount: bigint;
  decimals: number;
  formattedAmount: string;
  previousSupply?: bigint;
  remainingSupply?: bigint;
  burnPercentageOfSupply?: number;
}

export interface TwitterPostResult {
  tweetId: string;
  text: string;
  timestamp: string;
}

export interface AppConfig {
  solanaRpcUrl: string;
  solanaWsUrl: string;
  streamMintAddress: string;
  twitterApiKey: string;
  twitterApiKeySecret: string;
  twitterAccessToken: string;
  twitterAccessTokenSecret: string;
  discordWebhookUrl?: string;
  slackWebhookUrl?: string;
  dryRun: boolean;
}