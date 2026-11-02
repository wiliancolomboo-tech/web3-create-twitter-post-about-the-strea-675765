import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TweetFormatter } from '../src/tweetFormatter';
import { SolanaWatcher } from '../src/solanaWatcher';
import { BurnEvent, SentinelConfig } from '../src/types';
import { ParsedTransactionWithMeta } from '@solana/web3.js';

describe('StreamBurn Sentinel QA Matrix', () => {
  const mockConfig: SentinelConfig = {
    solanaRpcUrl: 'http://localhost:8899',
    solanaWsUrl: 'ws://localhost:8900',
    streamMintAddress: 'STREAMmP2XjXFqV8i4g6j2uLq5C8wF4rUoVqM7hR3d5e',
    minBurnThreshold: 100,
    twitterApiKey: 'mock',
    twitterApiSecret: 'mock',
    twitterAccessToken: 'mock',
    twitterAccessSecret: 'mock',
  };

  const sampleBurnEvent: BurnEvent = {
    signature: '5K2bW7XnC7q4pQJ9t3sZ8y1vU5rN2mP8kL4wA6xY9t1sZ8y1vU5rN2mP8kL4wA6x',
    slot: 284102910,
    blockTime: 1729000000,
    burner: '8rZp...9K2m',
    mint: 'STREAMmP2XjXFqV8i4g6j2uLq5C8wF4rUoVqM7hR3d5e',
    rawAmount: 25000000000000n,
    formattedAmount: 25000,
    tokenDecimals: 9,
    burnedUsdValue: 12500,
    newTotalSupply: 975000000000000n,
    burnedPercentageOfSupply: 2.5,
  };

  it('correctly constructs tweet formatting with verified metrics', () => {
    const tweet = TweetFormatter.formatBurnTweet(sampleBurnEvent);

    expect(tweet).toContain('🔥 $STREAM TOKEN BURN CONFIRMED 🔥');
    expect(tweet).toContain('25,000 $STREAM');
    expect(tweet).toContain('$12,500.00');
    expect(tweet).toContain('-2.5000%');
    expect(tweet).toContain('https://solscan.io/tx/5K2bW7XnC7q4pQJ9t3sZ8y1vU5rN2mP8kL4wA6xY9t1sZ8y1vU5rN2mP8kL4wA6x');
  });

  it('creates an informative 3-part thread structure', () => {
    const thread = TweetFormatter.formatDeepDiveThread(sampleBurnEvent);

    expect(thread).toHaveLength(3);
    expect(thread[0]).toContain('$STREAM TOKEN BURN CONFIRMED');
    expect(thread[1]).toContain('Tokenomics Deep Dive:');
    expect(thread[1]).toContain('#284102910');
    expect(thread[2]).toContain('Cryptographic Proof & Verification:');
    expect(thread[2]).toContain('solana confirm -v');
  });

  it('deterministically rejects non-burn or unrelated mint transactions', async () => {
    const watcher = new SolanaWatcher(mockConfig);

    const nonBurnTx: ParsedTransactionWithMeta = {
      slot: 123456,
      transaction: {
        signatures: ['dummySig'],
        message: {
          instructions: [
            {
              programId: { toBase58: () => 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' } as any,
              parsed: {
                type: 'transfer',
                info: {
                  amount: '1000000',
                  authority: 'SomeUser',
                  destination: 'OtherUser',
                },
              },
            } as any,
          ],
          accountKeys: [],
          recentBlockhash: 'hash',
        },
      },
      meta: {
        err: null,
        fee: 5000,
        preBalances: [],
        postBalances: [],
      },
    };

    const parsed = await watcher.parseTransactionForBurn(nonBurnTx, 'dummySig');
    expect(parsed).toBeNull();
  });
});