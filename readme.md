# Two-Sided Marketplace

A Solana-based smart contract for a two-sided marketplace where vendors can create and sell services, and buyers can purchase these services. The marketplace supports both regular and soulbound NFTs.

## Table of Contents

1. [Features](#features)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Usage](#usage)
   - [Initialize the Marketplace](#initialize-the-marketplace)
   - [Create a Service](#create-a-service)
   - [Purchase a Service](#purchase-a-service)
   - [Resell a Service](#resell-a-service)
5. [Running Tests](#running-tests)
6. [Smart Contract Structure](#smart-contract-structure)

## Features

- Create and manage a marketplace with customizable fees
- Vendors can create and list services
- Buyers can purchase services and receive NFTs as proof of purchase
- Support for both regular and soulbound NFTs
- Reselling of non-soulbound NFTs

## Prerequisites

Before you begin, ensure you have the following installed:

- [Rust](https://www.rust-lang.org/tools/install)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)
- [Anchor](https://project-serum.github.io/anchor/getting-started/installation.html)
- [Node.js](https://nodejs.org/) (for running tests)

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/SudhanPlayz/Two-Sided-Marketplace.git
   cd Two-Sided-Marketplace
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Build the project:
   ```
   anchor build
   ```

## Usage

### Initialize the Marketplace

To initialize the marketplace, you need to specify the marketplace fee. This can be done programmatically or through a CLI command.

Example (using Anchor's JavaScript library):

```javascript
const marketplaceFee = new anchor.BN(100); // Fee in lamports
const marketplaceKeypair = anchor.web3.Keypair.generate();

await program.methods
  .initialize(marketplaceFee)
  .accounts({
    marketplace: marketplaceKeypair.publicKey,
    authority: provider.wallet.publicKey,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .signers([marketplaceKeypair])
  .rpc();
```

### Create a Service

Vendors can create a service by specifying the name, description, price, and whether it's soulbound.

Example:

```javascript
const serviceName = "Premium Consulting";
const serviceDescription = "One-hour consulting session with an expert";
const servicePrice = new anchor.BN(1000000); // Price in lamports
const isSoulbound = false;
const serviceKeypair = anchor.web3.Keypair.generate();

await program.methods
  .createService(serviceName, serviceDescription, servicePrice, isSoulbound)
  .accounts({
    service: serviceKeypair.publicKey,
    vendor: vendorKeypair.publicKey,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .signers([serviceKeypair, vendorKeypair])
  .rpc();
```

### Purchase a Service

Buyers can purchase a service, which will mint an NFT to their account.

Example:

```javascript
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
    payer: payerKeypair.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: anchor.web3.SystemProgram.programId,
    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  })
  .signers([buyerKeypair, nftKeypair, payerKeypair])
  .rpc();
```

### Resell a Service

Non-soulbound NFTs can be resold to new buyers.

Example:

```javascript
const newPrice = new anchor.BN(1500000); // New price in lamports

await program.methods
  .resellService(newPrice)
  .accounts({
    service: serviceKeypair.publicKey,
    nft: nftKeypair.publicKey,
    seller: sellerKeypair.publicKey,
    buyer: newBuyerKeypair.publicKey,
    sellerNftTokenAccount: sellerNftTokenAccount,
    buyerNftTokenAccount: buyerNftTokenAccount,
    nftMint: nftMint,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: anchor.web3.SystemProgram.programId,
    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  })
  .signers([sellerKeypair, newBuyerKeypair])
  .rpc();
```

## Running Tests

To run the provided tests:

1. Start a local Solana test validator:
   ```
   solana-test-validator
   ```

2. In a new terminal, run the tests:
   ```
   anchor test
   ```

## Smart Contract Structure

The smart contract consists of the following main components:

- `Marketplace`: Stores the marketplace authority and fee
- `Service`: Represents a service with its details and vendor
- `NFT`: Represents the NFT minted when a service is purchased

Key functions:
- `initialize`: Set up the marketplace
- `create_service`: Create a new service
- `purchase_service`: Purchase a service and mint an NFT
- `resell_service`: Resell a non-soulbound NFT
