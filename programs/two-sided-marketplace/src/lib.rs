use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;

declare_id!("F5JwgWNNaiKCYGNGejY8MK5n6qhThmjjfNjKrsbs7T2E");

#[program]
pub mod two_sided_marketplace {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, marketplace_fee: u64) -> Result<()> {
        let marketplace = &mut ctx.accounts.marketplace;
        marketplace.authority = ctx.accounts.authority.key();
        marketplace.fee = marketplace_fee;
        Ok(())
    }

    pub fn create_service(ctx: Context<CreateService>, name: String, description: String, price: u64, is_soulbound: bool) -> Result<()> {
        let service = &mut ctx.accounts.service;
        service.vendor = ctx.accounts.vendor.key();
        service.name = name;
        service.description = description;
        service.price = price;
        service.is_soulbound = is_soulbound;
        service.is_active = true;
        Ok(())
    }

    pub fn purchase_service(ctx: Context<PurchaseService>) -> Result<()> {
        let service = &ctx.accounts.service;
        let marketplace = &ctx.accounts.marketplace;

        // Transfer tokens from buyer to vendor
        let transfer_instruction = token::Transfer {
            from: ctx.accounts.buyer_token_account.to_account_info(),
            to: ctx.accounts.vendor_token_account.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_instruction,
        );
        token::transfer(cpi_ctx, service.price - marketplace.fee)?;

        // Transfer marketplace fee
        let fee_transfer_instruction = token::Transfer {
            from: ctx.accounts.buyer_token_account.to_account_info(),
            to: ctx.accounts.marketplace_token_account.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        };
        let fee_cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            fee_transfer_instruction,
        );
        token::transfer(fee_cpi_ctx, marketplace.fee)?;

        // Mint NFT to buyer
        // Note: This is a simplified version. You'd need to implement actual NFT minting logic here.
        
        Ok(())
    }

    pub fn resell_service(ctx: Context<ResellService>, new_price: u64) -> Result<()> {
        let service = &mut ctx.accounts.service;
        require!(!service.is_soulbound, ErrorCode::SoulboundNFTCannotBeResold);
        
        service.price = new_price;
        // Transfer NFT ownership
        // Note: This is a simplified version. You'd need to implement actual NFT transfer logic here.
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + 32 + 8)]
    pub marketplace: Account<'info, Marketplace>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateService<'info> {
    #[account(init, payer = vendor, space = 8 + 32 + 64 + 256 + 8 + 1 + 1)]
    pub service: Account<'info, Service>,
    #[account(mut)]
    pub vendor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PurchaseService<'info> {
    #[account(mut)]
    pub service: Account<'info, Service>,
    #[account(mut)]
    pub marketplace: Account<'info, Marketplace>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(mut)]
    /// CHECK: 
    pub vendor: AccountInfo<'info>,
    #[account(mut)]
    pub buyer_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vendor_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub marketplace_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResellService<'info> {
    #[account(mut)]
    pub service: Account<'info, Service>,
    #[account(mut)]
    pub seller: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Marketplace {
    pub authority: Pubkey,
    pub fee: u64,
}

#[account]
pub struct Service {
    pub vendor: Pubkey,
    pub name: String,
    pub description: String,
    pub price: u64,
    pub is_soulbound: bool,
    pub is_active: bool,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Soulbound NFTs cannot be resold")]
    SoulboundNFTCannotBeResold,
}