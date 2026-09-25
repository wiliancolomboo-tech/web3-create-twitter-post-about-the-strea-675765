import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import { TwitterApi } from "twitter-api-v2";
import * as dotenv from "dotenv";

dotenv.config();

// Initialize Twitter V2 Client
const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY || "",
  appSecret: process.env.TWITTER_API_SECRET || "",
  accessToken: process.env.TWITTER_ACCESS_TOKEN || "",
  accessSecret: process.env.TWITTER_ACCESS_SECRET || "",
});

const PROGRAM_ID = new PublicKey("StrMBurnEngine1111111111111111111111111111");

interface StreamBurnedEvent {
  mint: PublicKey;
  burner: PublicKey;
  amountBurned: anchor.BN;
  crankReward: anchor.BN;
  totalBurnedToDate: anchor.BN;
  burnSequenceId: anchor.BN;
  clockTimestamp: anchor.BN;
}

/**
 * Format raw SPL units into human readable localized string
 */
function formatUnits(amount: anchor.BN, decimals: number): string {
  const divisor = new anchor.BN(10).pow(new anchor.BN(decimals));
  const integerPart = amount.div(divisor);
  const remainderPart = amount.mod(divisor).toString().padStart(decimals, "0").slice(0, 2);
  return `${Number(integerPart.toString()).toLocaleString()}.${remainderPart}`;
}

/**
 * Generates an optimized, viral, and cryptographically verified technical post
 */
function buildTweetContent(
  event: StreamBurnedEvent,
  txSignature: string,
  decimals: number,
  currentSupply: bigint
): string {
  const formattedBurned = formatUnits(event.amountBurned, decimals);
  const formattedTotal = formatUnits(event.totalBurnedToDate, decimals);
  const burnPctOfRemaining = (
    (Number(event.amountBurned.toString()) / Number(currentSupply.toString())) *
    100
  ).toFixed(4);

  return `🔥 [ON-CHAIN BURN CONFIRMED] ${formattedBurned} $STREAM Obliterated!

Programmatic burn #${event.burnSequenceId.toString()} executed via Solana Anchor CPI.

📊 Proof & Metrics:
• Burned this batch: ${formattedBurned} STREAM
• Total incinerated to date: ${formattedTotal} STREAM
• Supply destroyed this tx: ${burnPctOfRemaining}%
• Keeper Incentive: ${formatUnits(event.crankReward, decimals)} STREAM

🔍 Cryptographic Tx Receipt:
https://solscan.io/tx/${txSignature}

$STREAM #Solana #Deflation #TokenBurn #Web3 #ProofOfBurn`;
}

export async function runBurnListener(connection: Connection, program: Program) {
  console.log("🚀 Starting STREAM Token Burn Social Oracle...");

  // Subscribe to Anchor Program Logs
  program.addEventListener("StreamBurnedEvent", async (event: any, slot: number, signature: string) => {
    try {
      console.log(`\n🔔 Intercepted StreamBurnedEvent in tx: ${signature} (Slot: ${slot})`);

      // 1. Fetch current mint status from chain
      const mintInfo = await getMint(connection, event.mint);
      
      // 2. Format Tweet Payload
      const tweetText = buildTweetContent(event, signature, mintInfo.decimals, mintInfo.supply);
      console.log("📝 Prepared Tweet Payload:\n----------------------------\n" + tweetText + "\n----------------------------");

      // 3. Post to Twitter/X
      if (process.env.DRY_RUN === "true") {
        console.log("🛡️ DRY_RUN=true: Tweet posting skipped.");
      } else {
        const response = await twitterClient.v2.tweet(tweetText);
        console.log(`✅ Tweet successfully published! Tweet ID: ${response.data.id}`);
      }
    } catch (err) {
      console.error("❌ Failed to process burn event or dispatch tweet:", err);
    }
  });

  console.log("🎧 Listening for on-chain burn events on Program:", PROGRAM_ID.toBase58());
}