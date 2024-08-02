use anchor_lang::prelude::*;

declare_id!("F5JwgWNNaiKCYGNGejY8MK5n6qhThmjjfNjKrsbs7T2E");

#[program]
pub mod two_sided_marketplace {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
