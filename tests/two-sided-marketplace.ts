import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TwoSidedMarketplace } from "../target/types/two_sided_marketplace";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo } from "@solana/spl-token";
import { assert } from "chai";
import fs from "fs"

const loadKeypair = () => {
  let path = "/home/sudhan/.config/solana/id.json"
  let data = fs.readFileSync(path)
  let json = JSON.parse(data.toString())
  return Keypair.fromSecretKey(Uint8Array.from(json))
}

describe("two-sided-marketplace", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.TwoSidedMarketplace as Program<TwoSidedMarketplace>;

  const marketplaceKeypair = Keypair.generate();
  const vendorKeypair = Keypair.generate();
  const buyerKeypair = Keypair.generate();
  const payer = loadKeypair();

  //Airdrop SOL to the buyer and vendor accounts
  it("Airdrops SOL to the buyer and vendor accounts", async () => {
    await provider.connection.requestAirdrop(payer.publicKey, 5 * LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(buyerKeypair.publicKey, 5 * LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(vendorKeypair.publicKey, 5 * LAMPORTS_PER_SOL);
  });

  let mint: PublicKey;
  let buyerTokenAccount: PublicKey;
  let vendorTokenAccount: PublicKey;
  let marketplaceTokenAccount: PublicKey;

  it("Initializes the marketplace", async () => {
    const marketplaceFee = new anchor.BN(100);

    await program.methods
      .initialize(marketplaceFee)
      .accounts({
        marketplace: marketplaceKeypair.publicKey,
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([marketplaceKeypair])
      .rpc();

    const marketplaceAccount = await program.account.marketplace.fetch(marketplaceKeypair.publicKey);
    assert.ok(marketplaceAccount.authority.equals(provider.wallet.publicKey));
    assert.ok(marketplaceAccount.fee.eq(marketplaceFee));
  });

  it("Creates a service", async () => {
    const serviceName = "Test Service";
    const serviceDescription = "This is a test service";
    const servicePrice = new anchor.BN(1000);
    const isSoulbound = false;

    const serviceKeypair = Keypair.generate();

    await program.methods
      .createService(serviceName, serviceDescription, servicePrice, isSoulbound)
      .accounts({
        service: serviceKeypair.publicKey,
        vendor: vendorKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([serviceKeypair, vendorKeypair])
      .rpc();

    const serviceAccount = await program.account.service.fetch(serviceKeypair.publicKey);
    assert.equal(serviceAccount.name, serviceName);
    assert.equal(serviceAccount.description, serviceDescription);
    assert.ok(serviceAccount.price.eq(servicePrice));
    assert.equal(serviceAccount.isSoulbound, isSoulbound);
    assert.equal(serviceAccount.isActive, true);
    assert.ok(serviceAccount.vendor.equals(vendorKeypair.publicKey));
  });

  it("Purchases a service", async () => {
    mint = await createMint(provider.connection, buyerKeypair, buyerKeypair.publicKey, null, 6);
    console.log("Minted Token");
    buyerTokenAccount = await createAccount(provider.connection, buyerKeypair, mint, buyerKeypair.publicKey);
    console.log("Created Account for Buyer");
    vendorTokenAccount = await createAccount(provider.connection, vendorKeypair, mint, vendorKeypair.publicKey);
    console.log("Created Account for Vendor");
    marketplaceTokenAccount = await createAccount(provider.connection, marketplaceKeypair, mint, marketplaceKeypair.publicKey);
    console.log("Created Account for Marketplace");

    await mintTo(provider.connection, payer, mint, buyerTokenAccount, payer, 2000, [payer]);
    console.log("Minted To Buyer");
    const serviceKeypair = Keypair.generate();
    const serviceName = "Test Service";
    const serviceDescription = "This is a test service";
    const servicePrice = new anchor.BN(1000);
    const isSoulbound = false;

    await program.methods
      .createService(serviceName, serviceDescription, servicePrice, isSoulbound)
      .accounts({
        service: serviceKeypair.publicKey,
        vendor: vendorKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([serviceKeypair, vendorKeypair])
      .rpc();
    console.log("Created Service");

    await program.methods
      .purchaseService()
      .accounts({
        service: serviceKeypair.publicKey,
        marketplace: marketplaceKeypair.publicKey,
        buyer: buyerKeypair.publicKey,
        vendor: vendorKeypair.publicKey,
        buyerTokenAccount: buyerTokenAccount,
        vendorTokenAccount: vendorTokenAccount,
        marketplaceTokenAccount: marketplaceTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyerKeypair])
      .rpc();
    console.log("Purchased Service");

    const buyerBalance = await provider.connection.getTokenAccountBalance(buyerTokenAccount);
    const vendorBalance = await provider.connection.getTokenAccountBalance(vendorTokenAccount);
    const marketplaceBalance = await provider.connection.getTokenAccountBalance(marketplaceTokenAccount);

    assert.equal(buyerBalance.value.amount, "1000");
    assert.equal(vendorBalance.value.amount, "900");
    assert.equal(marketplaceBalance.value.amount, "100");
  });

  it("Resells a service", async () => {
    const serviceKeypair = Keypair.generate();
    const serviceName = "Resellable Service";
    const serviceDescription = "This is a resellable service";
    const initialPrice = new anchor.BN(1000);
    const isSoulbound = false;

    await program.methods
      .createService(serviceName, serviceDescription, initialPrice, isSoulbound)
      .accounts({
        service: serviceKeypair.publicKey,
        vendor: vendorKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([serviceKeypair, vendorKeypair])
      .rpc();

    const newPrice = new anchor.BN(1500);

    await program.methods
      .resellService(newPrice)
      .accounts({
        service: serviceKeypair.publicKey,
        seller: vendorKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([vendorKeypair])
      .rpc();

    const updatedService = await program.account.service.fetch(serviceKeypair.publicKey);
    assert.ok(updatedService.price.eq(newPrice));
  });

  it("Fails to resell a soulbound service", async () => {
    const serviceKeypair = Keypair.generate();
    const serviceName = "Soulbound Service";
    const serviceDescription = "This is a soulbound service";
    const initialPrice = new anchor.BN(1000);
    const isSoulbound = true;

    await program.methods
      .createService(serviceName, serviceDescription, initialPrice, isSoulbound)
      .accounts({
        service: serviceKeypair.publicKey,
        vendor: vendorKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([serviceKeypair, vendorKeypair])
      .rpc();

    const newPrice = new anchor.BN(1500);

    try {
      await program.methods
        .resellService(newPrice)
        .accounts({
          service: serviceKeypair.publicKey,
          seller: vendorKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([vendorKeypair])
        .rpc();
      assert.fail("Expected an error but none was thrown");
    } catch (error) {
      assert.equal(error.error.errorMessage, "Soulbound NFTs cannot be resold");
    }
  });
});