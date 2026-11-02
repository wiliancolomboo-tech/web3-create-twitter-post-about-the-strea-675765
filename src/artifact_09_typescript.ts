import axios from 'axios';
import { logger } from './logger';

export class PriceOracle {
  private static cachedPrice: number = 0.05; // Fallback estimate
  private static lastFetchTime: number = 0;
  private static CACHE_TTL_MS = 30000; // 30 seconds

  public static async getStreamPriceUsd(mintAddress: string): Promise<number> {
    const now = Date.now();
    if (now - this.lastFetchTime < this.CACHE_TTL_MS && this.cachedPrice > 0) {
      return this.cachedPrice;
    }

    try {
      // Fetch spot price from Jupiter Price API v2
      const url = `https://api.jup.ag/price/v2?ids=${mintAddress}`;
      const response = await axios.get(url, { timeout: 3000 });
      const priceData = response.data?.data?.[mintAddress];

      if (priceData && priceData.price) {
        this.cachedPrice = parseFloat(priceData.price);
        this.lastFetchTime = now;
        logger.info(`Fetched live STREAM price from Jupiter: $${this.cachedPrice}`);
        return this.cachedPrice;
      }
    } catch (err: any) {
      logger.warn(`Failed to fetch Jupiter price: ${err.message}. Using cached price: $${this.cachedPrice}`);
    }

    return this.cachedPrice;
  }
}