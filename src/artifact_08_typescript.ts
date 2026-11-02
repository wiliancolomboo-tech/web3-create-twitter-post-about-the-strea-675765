export interface BurnReport {
  signature: string;
  burner: string;
  burnedAmount: number;
  totalRemainingSupply: number;
  burnPercentageOfSupply: number;
  estimatedUsdValue: number;
  timestamp: Date;
  solanaExplorerUrl: string;
}

export class BurnFormatter {
  public static formatTwitterPost(report: BurnReport): string {
    const formattedAmount = report.burnedAmount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const formattedUsd = report.estimatedUsdValue.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
    const truncatedBurner = `${report.burner.slice(0, 4)}...${report.burner.slice(-4)}`;
    const shortSig = `${report.signature.slice(0, 6)}...${report.signature.slice(-6)}`;

    return [
      `🔥 IMMUTABLE BURN CONFIRMED: $STREAM 🔥`,
      ``,
      `A permanent supply reduction just settled on @Solana!`,
      ``,
      `📉 Burned Amount: ${formattedAmount} $STREAM (~${formattedUsd})`,
      `👤 Burner PDA: ${truncatedBurner}`,
      `📊 Supply Impact: -${report.burnPercentageOfSupply.toFixed(4)}%`,
      `🔍 Proof Hash: ${shortSig}`,
      ``,
      `Verify on-chain: ${report.solanaExplorerUrl}`,
      ``,
      `#Solana #Streamflow #DeFi #TokenBurn #Crypto`
    ].join('\n');
  }

  public static formatDiscordPayload(report: BurnReport): object {
    return {
      embeds: [
        {
          title: '🔥 STREAM Burn Event Verified on Solana',
          url: report.solanaExplorerUrl,
          color: 16728064, // Fire orange
          fields: [
            {
              name: 'Tokens Burned',
              value: `\`${report.burnedAmount.toLocaleString()} STREAM\``,
              inline: true,
            },
            {
              name: 'Estimated Value',
              value: `\`$${report.estimatedUsdValue.toLocaleString()}\``,
              inline: true,
            },
            {
              name: 'Supply Reduction',
              value: `\`-${report.burnPercentageOfSupply.toFixed(5)}%\``,
              inline: true,
            },
            {
              name: 'Transaction Signature',
              value: `[\`${report.signature}\`](${report.solanaExplorerUrl})`,
              inline: false,
            },
            {
              name: 'Burner Address',
              value: `\`${report.burner}\``,
              inline: false,
            },
          ],
          footer: {
            text: 'Streamflow Telemetry Engine | Solana Mainnet-Beta',
          },
          timestamp: report.timestamp.toISOString(),
        },
      ],
    };
  }
}