// File: src/engine/StreamBurnEngine.ts

import { Connection, PublicKey, ParsedTransactionWithMeta } from "@solana/web3.js";
import { TwitterApi } from "twitter-api-v2";
import axios from "axios";

export interface StreamBurnConfig {
    solanaRpcWsUrl: string;
    solanaRpcHttpUrl: string;
    streamMintAddress: string;
    twitterAppKey: string;
    twitterAppSecret: string;
    twitterAccessToken: string;
    twitterAccessSecret: string;
    discordWebhookUrl?: string;
    minBurnThresholdTokens: number;
}

export interface BurnEvent {
    signature: string;
    slot: number;
    burnedAmountRaw: bigint;
    burnedAmountFormatted: number;
    tokenDecimals: number;
    usdValue: number;
    newTotalSupply: number;
    burnPercentage: number;
    authority: string;
    timestamp: number;
}

export class StreamBurnEngine {
    private connection: Connection;
    private twitterClient: TwitterApi;
    private config: StreamBurnConfig;
    private isRunning: boolean = false;
    private subscriptionId: number | null = null;

    constructor(config: StreamBurnConfig) {
        this.config = config;
        this.connection = new Connection(config.solanaRpcHttpUrl, {
            wsEndpoint: config.solanaRpcWsUrl,
            commitment: "confirmed",
        });

        this.twitterClient = new TwitterApi({
            appKey: config.twitterAppKey,
            appSecret: config.twitterAppSecret,
            accessToken: config.twitterAccessToken,
            accessSecret: config.twitterAccessSecret,
        });
    }

    /**
     * Resolves live token price in USDC via Jupiter Price API v2
     */
    public async fetchTokenPrice(mintAddress: string): Promise<number> {
        try {
            const url = `https://api.jup.ag/price/v2?ids=${mintAddress}`;
            const response = await axios.get(url, { timeout: 5000 });
            if (response.data && response.data.data && response.data.data[mintAddress]) {
                return parseFloat(response.data.data[mintAddress].price) || 0;
            }
            return 0;
        } catch (error) {
            console.warn(`[WARN] Failed to fetch price from Jupiter API: ${(error as Error).message}`);
            return 0;
        }
    }

    /**
     * Validates and parses a transaction signature to extract SPL Token Burn instructions
     */
    public async parseBurnTransaction(signature: string): Promise<BurnEvent | null> {
        const tx: ParsedTransactionWithMeta | null = await this.connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
        });

        if (!tx || !tx.meta || tx.meta.err) {
            return null;
        }

        const mintPubkey = this.config.streamMintAddress;
        let burnedAmountRaw: bigint = BigInt(0);
        let tokenDecimals = 9;
        let authority = "Unknown";

        // Parse outer and inner instructions for Token Program burns
        const instructions = tx.transaction.message.instructions;
        for (const ix of instructions) {
            if ("program" in ix && ix.program === "spl-token") {
                const parsed = (ix as any).parsed;
                if (parsed && (parsed.type === "burn" || parsed.type === "burnChecked")) {
                    if (parsed.info.mint === mintPubkey) {
                        burnedAmountRaw += BigInt(parsed.info.amount);
                        authority = parsed.info.authority || parsed.info.multisigAuthority || authority;
                        if (parsed.info.decimals !== undefined) {
                            tokenDecimals = parsed.info.decimals;
                        }
                    }
                }
            }
        }

        // Inner instructions parse for CPI-based burns (e.g. from Streamflow contracts)
        if (tx.meta.innerInstructions) {
            for (const inner of tx.meta.innerInstructions) {
                for (const innerIx of inner.instructions) {
                    if ("program" in innerIx && innerIx.program === "spl-token") {
                        const parsed = (innerIx as any).parsed;
                        if (parsed && (parsed.type === "burn" || parsed.type === "burnChecked")) {
                            if (parsed.info.mint === mintPubkey) {
                                burnedAmountRaw += BigInt(parsed.info.amount);
                                authority = parsed.info.authority || authority;
                                if (parsed.info.decimals !== undefined) {
                                    tokenDecimals = parsed.info.decimals;
                                }
                            }
                        }
                    }
                }
            }
        }

        if (burnedAmountRaw === BigInt(0)) {
            return null;
        }

        const burnedAmountFormatted = Number(burnedAmountRaw) / Math.pow(10, tokenDecimals);

        if (burnedAmountFormatted < this.config.minBurnThresholdTokens) {
            console.log(`[INFO] Burn ${burnedAmountFormatted} is below threshold ${this.config.minBurnThresholdTokens}. Skipping.`);
            return null;
        }

        // Fetch current on-chain supply
        const supplyInfo = await this.connection.getTokenSupply(new PublicKey(mintPubkey));
        const currentSupplyFormatted = supplyInfo.value.uiAmount || 0;
        const priceUsd = await this.fetchTokenPrice(mintPubkey);
        const usdValue = burnedAmountFormatted * priceUsd;
        const burnPercentage = (burnedAmountFormatted / (currentSupplyFormatted + burnedAmountFormatted)) * 100;

        return {
            signature,
            slot: tx.slot,
            burnedAmountRaw,
            burnedAmountFormatted,
            tokenDecimals,
            usdValue,
            newTotalSupply: currentSupplyFormatted,
            burnPercentage,
            authority,
            timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
        };
    }

    /**
     * Formats Twitter thread payloads based on the verified burn event
     */
    public formatTweetThread(event: BurnEvent): string[] {
        const explorerUrl = `https://solscan.io/tx/${event.signature}`;
        const formattedTokens = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(event.burnedAmountFormatted);
        const formattedUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(event.usdValue);
        const formattedSupply = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(event.newTotalSupply);

        // Tweet 1: Breaking Alert + Core Impact
        const tweet1 = 
`🚨 ON-CHAIN CONFIRMATION: $STREAM BURN DETECTED 🔥

A total of ${formattedTokens} $STREAM (${formattedUsd}) has been permanently incinerated and removed from circulation.

📊 Burn Statistics:
• Burned: ${formattedTokens} $STREAM
• USD Value: ${formattedUsd}
• Supply Deflated: ${event.burnPercentage.toFixed(4)}%
• Block Slot: ${event.slot}

🔗 Verified On-Chain Proof:
${explorerUrl}

#Solana #STREAM #TokenBurn #Deflation $STREAM`;

        // Tweet 2: Macro Tokenomics Analysis
        const tweet2 = 
`2/ The programmatic removal of these tokens impacts the global $STREAM velocity:

📉 Updated Total Supply: ${formattedSupply} $STREAM
🛡️ Authority: ${event.authority.slice(0, 6)}...${event.authority.slice(-6)}
⚡ Solana Speed: Confirmed at slot ${event.slot}

By reducing the active supply pool, circulating float contracts, strengthening the economic foundation of decentralized streaming on Solana.`;

        // Tweet 3: Verifiability & Ecosystem Call to Action
        const tweet3 = 
`3/ Every $STREAM burn is fully deterministic, trustless, and irreversible on @solana.

Track the real-time supply dynamics directly:
🌐 https://streamflow.finance
🔍 https://solana.fm/tx/${event.signature}

Automation powered by StreamBurn-Sentinel. 🤖🔥`;

        return [tweet1, tweet2, tweet3];
    }

    /**
     * Publishes a validated multi-tweet thread
     */
    public async publishTweetThread(tweets: string[]): Promise<string[]> {
        const publishedIds: string[] = [];
        let inReplyTo: string | undefined = undefined;

        for (const tweetText of tweets) {
            try {
                const response = await this.twitterClient.v2.tweet(
                    inReplyTo ? { text: tweetText, reply: { in_reply_to_tweet_id: inReplyTo } } : { text: tweetText }
                );
                const tweetId = response.data.id;
                publishedIds.push(tweetId);
                inReplyTo = tweetId;
                console.log(`[X/TWITTER] Published tweet ID: ${tweetId}`);
            } catch (err) {
                console.error(`[ERROR] Failed to post tweet segment: ${(err as Error).message}`);
                break;
            }
        }

        return publishedIds;
    }

    /**
     * Sends enterprise backup notification to Discord
     */
    public async broadcastDiscordNotification(event: BurnEvent, tweetIds: string[]): Promise<void> {
        if (!this.config.discordWebhookUrl) return;

        const payload = {
            username: "StreamBurn Sentinel",
            avatar_url: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
            embeds: [
                {
                    title: "🔥 Verified $STREAM Token Burn Executed",
                    color: 16729871, // Fire Orange
                    fields: [
                        { name: "Tokens Burned", value: `${event.burnedAmountFormatted.toLocaleString()} $STREAM`, inline: true },
                        { name: "USD Valuation", value: `$${event.usdValue.toLocaleString()}`, inline: true },
                        { name: "Supply Reduction", value: `${event.burnPercentage.toFixed(4)}%`, inline: true },
                        { name: "Solscan Proof", value: `[Inspect Transaction](https://solscan.io/tx/${event.signature})`, inline: false },
                        { name: "X Dispatch", value: tweetIds.length > 0 ? `[View Tweet](https://twitter.com/i/web/status/${tweetIds[0]})` : "Skipped", inline: false }
                    ],
                    footer: { text: "Solana Mainnet Verification Engine • StreamBurn-Sentinel" },
                    timestamp: new Date(event.timestamp).toISOString(),
                }
            ]
        };

        try {
            await axios.post(this.config.discordWebhookUrl, payload, { timeout: 5000 });
            console.log(`[DISCORD] Broadcast notification sent.`);
        } catch (error) {
            console.warn(`[WARN] Discord webhook failed: ${(error as Error).message}`);
        }
    }

    /**
     * Start live on-chain websocket monitoring
     */
    public async startListener(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;
        const mintPubkey = new PublicKey(this.config.streamMintAddress);

        console.log(`[ENGINE] Listening for SPL Token Burns on mint: ${mintPubkey.toBase58()}`);

        this.subscriptionId = this.connection.onLogs(
            mintPubkey,
            async (logs, ctx) => {
                if (logs.err) return;
                const hasBurnLog = logs.logs.some(log => 
                    log.includes("Instruction: Burn") || log.includes("Instruction: BurnChecked")
                );

                if (hasBurnLog) {
                    console.log(`[EVENT] Burn instruction detected in tx: ${logs.signature} at slot: ${ctx.slot}`);
                    try {
                        const event = await this.parseBurnTransaction(logs.signature);
                        if (event) {
                            console.log(`[PROCESSING] Verified burn: ${event.burnedAmountFormatted} $STREAM ($${event.usdValue})`);
                            const tweets = this.formatTweetThread(event);
                            const publishedTweetIds = await this.publishTweetThread(tweets);
                            await this.broadcastDiscordNotification(event, publishedTweetIds);
                        }
                    } catch (error) {
                        console.error(`[ERROR] Failed to process burn tx ${logs.signature}: ${(error as Error).message}`);
                    }
                }
            },
            "confirmed"
        );
    }

    public async stopListener(): Promise<void> {
        if (this.subscriptionId !== null) {
            await this.connection.removeOnLogsListener(this.subscriptionId);
            this.subscriptionId = null;
            this.isRunning = false;
            console.log(`[ENGINE] Stopped on-chain listener.`);
        }
    }
}