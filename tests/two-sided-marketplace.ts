import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TwoSidedMarketplace } from "../target/types/two_sided_marketplace";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo, getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
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

  it("Airdrops SOL to the buyer and vendor accounts", async () => {
    await provider.connection.requestAirdrop(payer.publicKey, 10 * LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(buyerKeypair.publicKey, 10 * LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(vendorKeypair.publicKey, 10 * LAMPORTS_PER_SOL);
    
  });

  let mint: PublicKey;
  let buyerTokenAccount: PublicKey;
  let vendorTokenAccount: PublicKey;
  let marketplaceTokenAccount: PublicKey;
  let nftMint: PublicKey;
  let buyerNftTokenAccount: PublicKey;

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
    mint = await createMint(provider.connection, payer, payer.publicKey, null, 6);
    nftMint = await createMint(provider.connection, payer, payer.publicKey, null, 0);

    buyerTokenAccount = await createAccount(provider.connection, payer, mint, buyerKeypair.publicKey);
    vendorTokenAccount = await createAccount(provider.connection, payer, mint, vendorKeypair.publicKey);
    marketplaceTokenAccount = await createAccount(provider.connection, payer, mint, marketplaceKeypair.publicKey);
    buyerNftTokenAccount = await getAssociatedTokenAddress(nftMint, buyerKeypair.publicKey);

    await mintTo(provider.connection, payer, mint, buyerTokenAccount, payer, 2000);
    
    const serviceKeypair = Keypair.generate();
    const nftKeypair = Keypair.generate();
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
        nft: nftKeypair.publicKey,
        nftMint: nftMint,
        buyerNftTokenAccount: buyerNftTokenAccount,
        payer: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([buyerKeypair, nftKeypair, payer])
      .rpc();

    const buyerBalance = await provider.connection.getTokenAccountBalance(buyerTokenAccount);
    const vendorBalance = await provider.connection.getTokenAccountBalance(vendorTokenAccount);
    const marketplaceBalance = await provider.connection.getTokenAccountBalance(marketplaceTokenAccount);
    const nftBalance = await provider.connection.getTokenAccountBalance(buyerNftTokenAccount);

    assert.equal(buyerBalance.value.amount, "1000");
    assert.equal(vendorBalance.value.amount, "900");
    assert.equal(marketplaceBalance.value.amount, "100");
    assert.equal(nftBalance.value.amount, "1");

    const nftAccount = await program.account.nft.fetch(nftKeypair.publicKey);
    assert.ok(nftAccount.owner.equals(buyerKeypair.publicKey));
    assert.ok(nftAccount.service.equals(serviceKeypair.publicKey));
    assert.equal(nftAccount.isSoulbound, isSoulbound);
  });

  it("Resells a service", async () => {
    const serviceKeypair = Keypair.generate();
    const nftKeypair = Keypair.generate();
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
        nft: nftKeypair.publicKey,
        nftMint: nftMint,
        buyerNftTokenAccount: buyerNftTokenAccount,
        payer: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([buyerKeypair, nftKeypair, payer])
      .rpc();

    const newPrice = new anchor.BN(1500);
    const newBuyerKeypair = Keypair.generate();

    await provider.connection.requestAirdrop(newBuyerKeypair.publicKey, 2 * LAMPORTS_PER_SOL);

    const newBuyerNftTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      nftMint,
      newBuyerKeypair.publicKey
    );

    await program.methods
      .resellService(newPrice)
      .accounts({
        service: serviceKeypair.publicKey,
        nft: nftKeypair.publicKey,
        seller: buyerKeypair.publicKey,
        buyer: newBuyerKeypair.publicKey,
        sellerNftTokenAccount: buyerNftTokenAccount,
        buyerNftTokenAccount: newBuyerNftTokenAccount.address,
        nftMint: nftMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([buyerKeypair, newBuyerKeypair])
      .rpc();

    const updatedService = await program.account.service.fetch(serviceKeypair.publicKey);
    assert.ok(updatedService.price.eq(newPrice));

    const updatedNft = await program.account.nft.fetch(nftKeypair.publicKey);
    assert.ok(updatedNft.owner.equals(newBuyerKeypair.publicKey));
  });

  it("Fails to resell a soulbound service", async () => {
    const serviceKeypair = Keypair.generate();
    const nftKeypair = Keypair.generate();
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

    await mintTo(provider.connection, payer, mint, buyerTokenAccount, payer, 2000);

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
        nft: nftKeypair.publicKey,
        nftMint: nftMint,
        buyerNftTokenAccount: buyerNftTokenAccount,
        payer: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([buyerKeypair, nftKeypair, payer])
      .rpc();

    const newPrice = new anchor.BN(1500);
    const newBuyerKeypair = Keypair.generate();
    const newBuyerNftTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      nftMint,
      newBuyerKeypair.publicKey
    );

    try {
      await program.methods
        .resellService(newPrice)
        .accounts({
          service: serviceKeypair.publicKey,
          nft: nftKeypair.publicKey,
          seller: buyerKeypair.publicKey,
          buyer: newBuyerKeypair.publicKey,
          sellerNftTokenAccount: buyerNftTokenAccount,
          buyerNftTokenAccount: newBuyerNftTokenAccount.address,
          nftMint: nftMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([buyerKeypair, newBuyerKeypair])
        .rpc();
      assert.fail("Expected an error but none was thrown");
    } catch (error) {
      assert.include(error.message, "Soulbound NFTs cannot be resold");
    }
  });
});