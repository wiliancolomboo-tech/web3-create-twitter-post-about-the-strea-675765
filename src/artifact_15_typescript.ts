import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { TwitterBroadcaster } from '../twitter.js';
import { StorageEngine } from '../storage.js';
import fs from 'fs';

const TEST_DB = './data/test_burns.db';

describe('STREAM Burn Oracle Test Suite', () => {
  let storage: StorageEngine;

  beforeEach(() => {
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
    storage = new StorageEngine(TEST_DB);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
  });

  it('correctly tracks and accumulates burned amounts idempotently', () => {
    const record = {
      signature: 'sig_alpha_123',
      slot: 290000100,
      blockTime: 1720000000,
      amount: 50000,
      burnSigner: 'Authority1111111111111111111111111111111111',
      sourceAccount: 'Source111111111111111111111111111111111111',
      usdValue: 2500,
      processedAt: new Date().toISOString()
    };

    expect(storage.isProcessed(record.signature)).toBe(false);
    storage.recordBurn(record);
    expect(storage.isProcessed(record.signature)).toBe(true);

    const record2 = { ...record, signature: 'sig_beta_456', amount: 75000 };
    storage.recordBurn(record2);

    expect(storage.getTotalBurned()).toBe(125000);
  });

  it('renders verified Twitter broadcast threads within character limits and with correct links', () => {
    const broadcaster = new TwitterBroadcaster();
    const payload = {
      burn: {
        signature: '4h9qVz2rRkHj3Nn9P7sYvU8xL2tK1mJ6wF5dE4cB3aA2zZ1yX0wV9uT8sR7qP6oN',
        slot: 298410292,
        blockTime: 1729000000,
        amount: 250000.5,
        burnSigner: '7Y4vP5N8zH7vQ3mK1jL9xU2tK1mJ6wF5dE4cB3aA2zZ1',
        sourceAccount: '3kLvQ8mR2jT1yX0wV9uT8sR7qP6oN4h9qVz2rRkHj3N'
      },
      usdValue: 12500.025,
      totalCumulativeBurned: 1500000.5
    };

    const tweets = broadcaster.buildThreadTweets(payload);

    expect(tweets.length).toBe(2);
    // Twitter character count verification
    for (const tweet of tweets) {
      expect(tweet.length).toBeLessThanOrEqual(280);
    }

    // Integrity checks
    expect(tweets[0]).toContain('250,000.5 $STREAM');
    expect(tweets[0]).toContain('https://solscan.io/tx/4h9qVz2r');
    expect(tweets[1]).toContain('1,500,000.5 $STREAM');
  });
});