import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { StreamBurner } from "../target/types/stream_burner";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";

describe("stream-burner contract suite", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.StreamBurner as Program<StreamBurner>;
  const admin = provider.wallet;

  let streamMint: anchor.web3.PublicKey;
  let userTokenAccount: anchor.web3.PublicKey;
  let burnMetricsPda: anchor.web3.PublicKey;
  let metricsBump: number;

  const DECIMALS = 9;
  const INITIAL_MINT_AMOUNT = 1_000_000 * 10 ** DECIMALS;
  const BURN_AMOUNT = new anchor.BN(50_000 * 10 ** DECIMALS);

  before(async () => {
    // 1. Create Mock STREAM Mint
    streamMint = await createMint(
      provider.connection,
      (admin as any).payer,
      admin.publicKey,
      null,
      DECIMALS
    );

    // 2. Create User ATA and mint funds
    userTokenAccount = await createAccount(
      provider.connection,
      (admin as any).payer,
      streamMint,
      admin.publicKey
    );

    await mintTo(
      provider.connection,
      (admin as any).payer,
      streamMint,
      userTokenAccount,
      admin.publicKey,
      INITIAL_MINT_AMOUNT
    );

    // 3. Derive PDA
    [burnMetricsPda, metricsBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("stream_burn_metrics"), streamMint.toBuffer()],
      program.programId
    );
  });

  it("Initializes the Stream Burner Metrics Account", async () => {
    await program.methods
      .initialize(streamMint)
      .accounts({
        burnMetrics: burnMetricsPda,
        streamMint: streamMint,
        admin: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const metricsState = await program.account.burnMetrics.fetch(burnMetricsPda);
    expect(metricsState.adminAuthority.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(metricsState.streamMint.toBase58()).to.equal(streamMint.toBase58());
    expect(metricsState.totalBurnEvents.toNumber()).to.equal(0);
    expect(metricsState.totalAmountBurned.toNumber()).to.equal(0);
  });

  it("Executes a valid burn and verifies state accumulation", async () => {
    let listener = null;
    let eventReceived: any = null;

    listener = program.addEventListener("StreamBurnedEvent", (event, _slot) => {
      eventReceived = event;
    });

    const memoText = "Protocol buyback Q3";
    await program.methods
      .executeBurn(BURN_AMOUNT, memoText)
      .accounts({
        burnMetrics: burnMetricsPda,
        streamMint: streamMint,
        sourceTokenAccount: userTokenAccount,
        burnAuthority: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Small delay to ensure event propagation
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await program.removeEventListener(listener);

    // Validate account balance
    const postAccount = await getAccount(provider.connection, userTokenAccount);
    const expectedRemaining = BigInt(INITIAL_MINT_AMOUNT) - BigInt(BURN_AMOUNT.toString());
    expect(postAccount.amount).to.equal(expectedRemaining);

    // Validate global state
    const metricsState = await program.account.burnMetrics.fetch(burnMetricsPda);
    expect(metricsState.totalBurnEvents.toNumber()).to.equal(1);
    expect(metricsState.totalAmountBurned.toString()).to.equal(BURN_AMOUNT.toString());

    // Validate emitted event
    expect(eventReceived).to.not.be.null;
    expect(eventReceived.amountBurned.toString()).to.equal(BURN_AMOUNT.toString());
    expect(eventReceived.memo).to.equal(memoText);
  });

  it("Fails when attempting to burn 0 tokens", async () => {
    try {
      await program.methods
        .executeBurn(new anchor.BN(0), "Invalid Burn")
        .accounts({
          burnMetrics: burnMetricsPda,
          streamMint: streamMint,
          sourceTokenAccount: userTokenAccount,
          burnAuthority: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have failed with ZeroBurnAmount error");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("ZeroBurnAmount");
    }
  });

  it("Fails when passing a mismatched mint token account", async () => {
    const foreignMint = await createMint(
      provider.connection,
      (admin as any).payer,
      admin.publicKey,
      null,
      DECIMALS
    );
    const foreignAta = await createAccount(
      provider.connection,
      (admin as any).payer,
      foreignMint,
      admin.publicKey
    );

    try {
      await program.methods
        .executeBurn(new anchor.BN(100), "Malicious Mismatched Account")
        .accounts({
          burnMetrics: burnMetricsPda,
          streamMint: streamMint,
          sourceTokenAccount: foreignAta,
          burnAuthority: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have rejected invalid mint token account");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("InvalidMintAddress");
    }
  });
});