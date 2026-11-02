import { TwitterDispatcher } from '../src/services/twitter';
import { SolanaBurnWatcher } from '../src/services/solana';
import { BurnEvent } from '../src/types';

describe('STREAM Burn Oracle Verification Suite', () => {
  const dummyConfig = {
    apiKey: 'mock_api_key',
    apiSecret: 'mock_api_secret',
    token: 'mock_token',
    secret: 'mock_secret',
  };

  const sampleBurn: BurnEvent = {
    signature: '5wHubE4zXvKzH5eNnU8Q7bL3ZtQj8jY9X2mW1kR4vC6P7qT5vL8xY3uK2mN1bV4c',
    slot: 250100200,
    blockTime: 1712000000,
    burner: 'TreasuryLockAuthority111111111111111111111111',
    mint: 'STREAMribRwybzpXoohqHwS5q65qCq96KqD1E5E7Y9B4',
    amountRaw: 5000000000000000n,
    amountUi: 5000000,
    usdValue: 0.125,
    newTotalSupplyUi: 995000000,
  };

  test('Thread generation outputs 3 valid tweets within Twitter character limits', () => {
    const dispatcher = new TwitterDispatcher(
      dummyConfig.apiKey,
      dummyConfig.apiSecret,
      dummyConfig.token,
      dummyConfig.secret
    );

    const thread = dispatcher.generateThreadPayloads(sampleBurn);

    expect(thread).toHaveLength(3);
    for (let i = 0; i < thread.length; i++) {
      const tweetLength = thread[i].length;
      expect(tweetLength).toBeLessThanOrEqual(280);
      expect(tweetLength).toBeGreaterThan(40);
    }

    expect(thread[0]).toContain('5,000,000.00 $STREAM');
    expect(thread[0]).toContain('~$625,000.00 USD');
    expect(thread[0]).toContain(sampleBurn.signature);
    expect(thread[1]).toContain('SUPPLY COMPRESSION METRICS');
    expect(thread[2]).toContain('https://streamflow.finance');
  });

  test('Handles edge cases with zero USD valuation gracefully', () => {
    const dispatcher = new TwitterDispatcher(
      dummyConfig.apiKey,
      dummyConfig.apiSecret,
      dummyConfig.token,
      dummyConfig.secret
    );

    const zeroUsdBurn: BurnEvent = {
      ...sampleBurn,
      usdValue: 0,
    };

    const thread = dispatcher.generateThreadPayloads(zeroUsdBurn);
    expect(thread[0]).not.toContain('~$');
    expect(thread[0]).toContain('🔥 STREAM BURN CONFIRMED 🔥');
  });

  test('SPL Burn instruction parser handles null transaction metadata safely', () => {
    const watcher = new SolanaBurnWatcher(
      'https://api.mainnet-beta.solana.com',
      'wss://api.mainnet-beta.solana.com',
      sampleBurn.mint,
      9
    );

    const invalidTx: any = { meta: { err: { InstructionError: [0, 'Custom'] } } };
    const result = watcher.parseBurnFromTx(invalidTx, 'sig123');
    expect(result).toBeNull();
  });
});