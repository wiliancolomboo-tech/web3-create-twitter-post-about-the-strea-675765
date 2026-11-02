import { describe, it, expect, vi } from 'vitest';
import { BurnFormatter, BurnReport } from '../src/burnFormatter';
import { PriceOracle } from '../src/priceOracle';
import axios from 'axios';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

describe('Stream Burn Oracle Test Matrix', () => {
  const mockReport: BurnReport = {
    signature: '5K3k78aZqjFk1rE3W2HkLmM9vP7qZ1aB3c4d5e6f7g8h9i0jKlMnOpQrStUvWxYz',
    burner: '8sBmPrQp5VqQG3e9w2RtU7iZk1xY3vB9pL0oN4mK2jH',
    burnedAmount: 1250000.5,
    totalRemainingSupply: 85000000,
    burnPercentageOfSupply: 1.449,
    estimatedUsdValue: 62500.02,
    timestamp: new Date('2025-01-15T12:00:00Z'),
    solanaExplorerUrl: 'https://solscan.io/tx/5K3k78aZqjFk1rE3W2HkLmM9vP7qZ1aB3c4d5e6f7g8h9i0jKlMnOpQrStUvWxYz',
  };

  it('TC-01: Correctly constructs and formats Twitter post within character constraints', () => {
    const tweet = BurnFormatter.formatTwitterPost(mockReport);

    expect(tweet).toContain('🔥 IMMUTABLE BURN CONFIRMED: $STREAM 🔥');
    expect(tweet).toContain('1,250,000.50 $STREAM');
    expect(tweet).toContain('$62,500.02');
    expect(tweet).toContain('-1.4490%');
    expect(tweet).toContain('8sBm...2jH');
    expect(tweet).toContain('5K3k78...UvWxYz');
    expect(tweet).toContain(mockReport.solanaExplorerUrl);

    // Ensure tweet length conforms to 280-character standard or modern Twitter API v2 limit
    expect(tweet.length).toBeLessThan(350);
  });

  it('TC-02: Formats Discord Embed with valid HEX color and fields', () => {
    const payload: any = BurnFormatter.formatDiscordPayload(mockReport);

    expect(payload).toHaveProperty('embeds');
    expect(payload.embeds[0].color).toBe(16728064);
    expect(payload.embeds[0].fields).toHaveLength(5);
    expect(payload.embeds[0].fields[0].name).toBe('Tokens Burned');
    expect(payload.embeds[0].fields[0].value).toContain('1,250,000.5 STREAM');
  });

  it('TC-03: Resolves token prices via Jupiter API with robust fallback', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: {
          'STREAMribRwybzpKq5x9bqwPz5B4i1Xv1qFz5q8Gk8vU': {
            price: '0.0754',
          },
        },
      },
    });

    const price = await PriceOracle.getStreamPriceUsd('STREAMribRwybzpKq5x9bqwPz5B4i1Xv1qFz5q8Gk8vU');
    expect(price).toBe(0.0754);
  });

  it('TC-04: Gracefully handles pricing API failures by falling back to cache', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Network Gateway Timeout 504'));

    const price = await PriceOracle.getStreamPriceUsd('STREAMribRwybzpKq5x9bqwPz5B4i1Xv1qFz5q8Gk8vU');
    expect(price).toBeGreaterThan(0);
  });
});