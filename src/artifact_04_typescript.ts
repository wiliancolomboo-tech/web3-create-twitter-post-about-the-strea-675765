import { ParsedTransactionWithMeta, PartiallyDecodedInstruction } from "@solana/web3.js";
import { BurnEvent } from "./types";

export class StreamBurnParser {
  private targetMint: string;
  private tokenProgramId = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  private token2022ProgramId = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

  constructor(targetMint: string) {
    this.targetMint = targetMint;
  }

  public parseTransaction(
    tx: ParsedTransactionWithMeta,
    signature: string
  ): BurnEvent | null {
    if (!tx || !tx.meta || tx.meta.err !== null) {
      return null;
    }

    const blockTime = tx.blockTime;
    const slot = tx.slot;
    const instructions = tx.transaction.message.instructions;

    for (const ix of instructions) {
      const parsedIx = ix as PartiallyDecodedInstruction & { parsed?: any };
      
      // Verify program is standard SPL Token or Token-2022
      const programId = ix.programId.toBase58();
      if (
        programId !== this.tokenProgramId &&
        programId !== this.token2022ProgramId
      ) {
        continue;
      }

      if (!parsedIx.parsed) continue;

      const type = parsedIx.parsed.type;
      const info = parsedIx.parsed.info;

      if ((type === "burn" || type === "burnChecked") && info) {
        const mint = info.mint;
        if (mint !== this.targetMint) {
          continue;
        }

        const burner = info.authority || info.multisigAuthority || "Unknown";
        let amountRaw: bigint = BigInt(0);
        let decimals: number = 6; // Standard STREAM decimals fallback

        if (type === "burnChecked" && info.tokenAmount) {
          amountRaw = BigInt(info.tokenAmount.amount);
          decimals = info.tokenAmount.decimals;
        } else if (info.amount) {
          amountRaw = BigInt(info.amount);
        }

        const divisor = BigInt(10 ** decimals);
        const integerPart = amountRaw / divisor;
        const remainder = amountRaw % divisor;
        const remainderStr = remainder.toString().padStart(decimals, "0");
        const formattedAmount = `${integerPart.toLocaleString()}.${remainderStr.slice(0, 4)}`;

        return {
          signature,
          slot,
          blockTime,
          mint,
          burner,
          amount: amountRaw,
          decimals,
          formattedAmount,
        };
      }
    }

    return null;
  }
}