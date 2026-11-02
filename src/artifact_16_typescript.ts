import axios from 'axios';
import { CONFIG } from '../config';

export class WebhookService {
  public static async broadcast(payload: {
    burnAmountFormatted: string;
    signature: string;
    totalBurnedFormatted: string;
    burnCount: number;
  }) {
    const explorerUrl = `https://solscan.io/tx/${payload.signature}`;
    
    // Dispatch to Discord
    if (CONFIG.DISCORD_WEBHOOK_URL) {
      await axios.post(CONFIG.DISCORD_WEBHOOK_URL, {
        username: 'STREAM Burn Sentinel',
        embeds: [
          {
            title: '🔥 Token Burn Event Detected & Published',
            color: 0xff4500,
            fields: [
              { name: 'Amount Burned', value: `${payload.burnAmountFormatted} $STREAM`, inline: true },
              { name: 'Total Burned to Date', value: `${payload.totalBurnedFormatted} $STREAM`, inline: true },
              { name: 'Burn Event #', value: `${payload.burnCount}`, inline: true },
              { name: 'On-Chain Signature', value: `[Solscan Explorer](${explorerUrl})` },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      }).catch(() => null);
    }

    // Dispatch to Slack
    if (CONFIG.SLACK_WEBHOOK_URL) {
      await axios.post(CONFIG.SLACK_WEBHOOK_URL, {
        text: `🔥 *STREAM Token Burn Detected!*\n*Amount:* ${payload.burnAmountFormatted} $STREAM\n*Tx:* ${explorerUrl}`,
      }).catch(() => null);
    }
  }
}