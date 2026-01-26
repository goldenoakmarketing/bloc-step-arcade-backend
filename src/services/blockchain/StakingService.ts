import { getContract } from 'viem';
import { publicClient } from '../../config/blockchain.js';
import { stakingPoolAbi, contractAddresses } from '../../config/contracts.js';
import { supabase } from '../../config/supabase.js';
import { createChildLogger } from '../../utils/logger.js';
import type { Address } from '../../types/index.js';

const logger = createChildLogger('StakingService');

export class StakingService {
  private contract;

  constructor() {
    this.contract = getContract({
      address: contractAddresses.stakingPool,
      abi: stakingPoolAbi,
      client: publicClient,
    });
  }

  async getStakedBalance(player: Address): Promise<bigint> {
    try {
      const balance = await this.contract.read.stakedBalance([player]);
      return balance;
    } catch (error) {
      logger.warn({ player, error }, 'Failed to fetch staked balance');
      return BigInt(0);
    }
  }

  async syncAllStakingBalances(): Promise<{ synced: number; errors: number }> {
    logger.info('Starting staking balance sync for all players');

    // Get all players
    const { data: players, error } = await supabase
      .from('players')
      .select('id, wallet_address');

    if (error || !players) {
      logger.error({ error }, 'Failed to fetch players for staking sync');
      return { synced: 0, errors: 1 };
    }

    let synced = 0;
    let errors = 0;

    for (const player of players) {
      try {
        const balance = await this.getStakedBalance(player.wallet_address as Address);

        await supabase
          .from('players')
          .update({ cached_staked_balance: Number(balance) })
          .eq('id', player.id);

        if (balance > 0) {
          logger.debug({ wallet: player.wallet_address, balance: balance.toString() }, 'Updated staking balance');
        }
        synced++;
      } catch (err) {
        logger.error({ wallet: player.wallet_address, error: err }, 'Failed to sync staking balance');
        errors++;
      }
    }

    logger.info({ synced, errors }, 'Staking balance sync completed');
    return { synced, errors };
  }
}

export const stakingService = new StakingService();
