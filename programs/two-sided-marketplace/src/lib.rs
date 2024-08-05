use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint};
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

        let nft = &mut ctx.accounts.nft;
        nft.owner = ctx.accounts.buyer.key();
        nft.service = ctx.accounts.service.key();
        nft.is_soulbound = service.is_soulbound;

        let cpi_accounts = token::MintTo {
            mint: ctx.accounts.nft_mint.to_account_info(),
            to: ctx.accounts.buyer_nft_token_account.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::mint_to(cpi_ctx, 1)?;

        Ok(())
    }

    pub fn resell_service(ctx: Context<ResellService>, new_price: u64) -> Result<()> {
        let service = &mut ctx.accounts.service;
        let nft = &mut ctx.accounts.nft;
        
        if nft.is_soulbound {
            return Err(ErrorCode::SoulboundNFTCannotBeResold.into());
        }
        
        if nft.owner != ctx.accounts.seller.key() {
            return Err(ErrorCode::NotNFTOwner.into());
        }
        
        service.price = new_price;
        nft.owner = ctx.accounts.buyer.key();

        let cpi_accounts = token::Transfer {
            from: ctx.accounts.seller_nft_token_account.to_account_info(),
            to: ctx.accounts.buyer_nft_token_account.to_account_info(),
            authority: ctx.accounts.seller.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, 1)?;
        
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
    /// CHECK: This is safe because we don't read or write from this account
    pub vendor: AccountInfo<'info>,
    #[account(mut)]
    pub buyer_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vendor_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub marketplace_token_account: Account<'info, TokenAccount>,
    #[account(init, payer = payer, space = 8 + 32 + 32 + 1)]
    pub nft: Account<'info, NFT>,
    #[account(mut)]
    pub nft_mint: Account<'info, Mint>,
    #[account(init_if_needed, payer = payer, associated_token::mint = nft_mint, associated_token::authority = buyer)]
    pub buyer_nft_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ResellService<'info> {
    #[account(mut)]
    pub service: Account<'info, Service>,
    #[account(mut)]
    pub nft: Account<'info, NFT>,
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(mut)]
    pub seller_nft_token_account: Account<'info, TokenAccount>,
    #[account(init_if_needed, payer = buyer, associated_token::mint = nft_mint, associated_token::authority = buyer)]
    pub buyer_nft_token_account: Account<'info, TokenAccount>,
    pub nft_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
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

#[account]
pub struct NFT {
    pub owner: Pubkey,
    pub service: Pubkey,
    pub is_soulbound: bool,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Soulbound NFTs cannot be resold")]
    SoulboundNFTCannotBeResold,
    #[msg("Only the NFT owner can resell")]
    NotNFTOwner,
}