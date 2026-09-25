import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
  getMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";

describe("stream-burner test suite", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Access loaded program definition
  const program = anchor.workspace.StreamBurner as Program<any>;

  const admin = Keypair.generate();
  const user = Keypair.generate();
  const crank = Keypair.generate();

  let mint: PublicKey;
  let userTokenAccount: PublicKey;
  let crankTokenAccount: PublicKey;
  let burnConfigPda: PublicKey;
  let burnConfigBump: number;
  let burnVaultPda: PublicKey;
  let burnVaultBump: number;

  const DECIMALS = 9;
  const INITIAL_SUPPLY = 10_000_000 * 10 ** DECIMALS; // 10 Million $STREAM

  before(async () => {
    // Airdrop SOL to test actors
    for (const actor of [admin, user, crank]) {
      const sig = await provider.connection.requestAirdrop(
        actor.publicKey,
        5 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }

    // Create STREAM SPL Token Mint
    mint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      DECIMALS
    );

    // Derive PDAs
    [burnConfigPda, burnConfigBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("burn_config"), mint.toBuffer()],
      program.programId
    );

    [burnVaultPda, burnVaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("burn_vault"), mint.toBuffer()],
      program.programId
    );

    // Create associated token accounts
    userTokenAccount = await createAccount(
      provider.connection,
      user,
      mint,
      user.publicKey
    );

    crankTokenAccount = await createAccount(
      provider.connection,
      crank,
      mint,
      crank.publicKey
    );

    // Mint test supply to user
    await mintTo(
      provider.connection,
      admin,
      mint,
      userTokenAccount,
      admin.publicKey,
      INITIAL_SUPPLY
    );
  });

  it("1. Initializes Burn Config PDA and Vault PDA", async () => {
    const crankRewardBps = 100; // 1%

    await program.methods
      .initialize(crankRewardBps)
      .accounts({
        admin: admin.publicKey,
        mint: mint,
        burnConfig: burnConfigPda,
        vault: burnVaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([admin])
      .rpc();

    const configAccount = await program.account.burnConfig.fetch(burnConfigPda);
    expect(configAccount.admin.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(configAccount.mint.toBase58()).to.equal(mint.toBase58());
    expect(configAccount.crankRewardBps).to.equal(crankRewardBps);
    expect(configAccount.totalBurned.toNumber()).to.equal(0);
    expect(configAccount.totalBurnEvents.toNumber()).to.equal(0);
  });

  it("2. Deposits tokens into Burn Vault PDA", async () => {
    const depositAmount = new anchor.BN(100_000 * 10 ** DECIMALS);

    await program.methods
      .depositTokens(depositAmount)
      .accounts({
        depositor: user.publicKey,
        depositorTokenAccount: userTokenAccount,
        burnConfig: burnConfigPda,
        vault: burnVaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    const vaultToken = await getAccount(provider.connection, burnVaultPda);
    expect(vaultToken.amount.toString()).to.equal(depositAmount.toString());
  });

  it("3. Executes Burn CPI, destroys tokens, and rewards Keeper crank", async () => {
    const mintBefore = await getMint(provider.connection, mint);
    const supplyBefore = mintBefore.supply;

    const minThreshold = new anchor.BN(50_000 * 10 ** DECIMALS);

    // Execute Burn via Crank
    const tx = await program.methods
      .executeBurn(minThreshold)
      .accounts({
        crank: crank.publicKey,
        crankTokenAccount: crankTokenAccount,
        burnConfig: burnConfigPda,
        mint: mint,
        vault: burnVaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([crank])
      .rpc();

    expect(tx).to.be.a("string");

    // Check balances
    const vaultTokenAfter = await getAccount(provider.connection, burnVaultPda);
    expect(vaultTokenAfter.amount.toString()).to.equal("0");

    const crankToken = await getAccount(provider.connection, crankTokenAccount);
    // 1% of 100,000 = 1,000 tokens
    const expectedCrankReward = 1_000 * 10 ** DECIMALS;
    expect(crankToken.amount.toString()).to.equal(expectedCrankReward.toString());

    // Check Total Supply on Mint
    const mintAfter = await getMint(provider.connection, mint);
    const netBurned = 99_000 * 10 ** DECIMALS;
    expect(mintAfter.supply.toString()).to.equal(
      (supplyBefore - BigInt(netBurned)).toString()
    );

    // Verify Program Account State
    const configAccount = await program.account.burnConfig.fetch(burnConfigPda);
    expect(configAccount.totalBurned.toNumber()).to.equal(netBurned);
    expect(configAccount.totalBurnEvents.toNumber()).to.equal(1);
  });

  it("4. Rejects execute_burn if vault balance < min_burn_threshold", async () => {
    try {
      await program.methods
        .executeBurn(new anchor.BN(1000))
        .accounts({
          crank: crank.publicKey,
          crankTokenAccount: crankTokenAccount,
          burnConfig: burnConfigPda,
          mint: mint,
          vault: burnVaultPda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([crank])
        .rpc();
      expect.fail("Should have thrown InsufficientVaultBalance");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("InsufficientVaultBalance");
    }
  });
});