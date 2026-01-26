import { getContract, parseAbiItem } from 'viem';
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
      // Use stakedBalances mapping from StakingPool contract (selector 0x3a02a42d)
      const balance = await this.contract.read.stakedBalances([player]);
      logger.info({ player, balance: balance.toString() }, 'Fetched staked balance');
      return balance;
    } catch (error) {
      logger.error({ player, error }, 'Failed to fetch staked balance');
      return BigInt(0);
    }
  }

  async getStakersFromBlockchain(): Promise<string[]> {
    logger.info('Fetching stakers from blockchain events');

    try {
      // Fetch Staked events from the StakingPool contract
      const logs = await publicClient.getLogs({
        address: contractAddresses.stakingPool,
        event: parseAbiItem('event Staked(address indexed player, uint256 amount)'),
        fromBlock: 'earliest',
        toBlock: 'latest',
      });

      const uniqueAddresses = [...new Set(logs.map(log => (log.args as { player: string }).player.toLowerCase()))];
      logger.info({ count: uniqueAddresses.length }, 'Found stakers from blockchain');
      return uniqueAddresses;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch staking events from blockchain');
      return [];
    }
  }

  async syncAllStakingBalances(): Promise<{ synced: number; errors: number; created: number }> {
    logger.info('Starting staking balance sync for all players');

    // First, get unique wallet addresses from blockchain staking events
    const blockchainStakers = await this.getStakersFromBlockchain();

    // Also check staking_events table as backup
    const { data: stakingEvents } = await supabase
      .from('staking_events')
      .select('wallet_address')
      .eq('event_type', 'stake');

    const dbStakers = (stakingEvents || []).map(e => e.wallet_address.toLowerCase());
    const uniqueStakerAddresses = [...new Set([...blockchainStakers, ...dbStakers])];
    let created = 0;

    // Ensure all stakers have player records
    for (const walletAddress of uniqueStakerAddresses) {
      const { data: existing } = await supabase
        .from('players')
        .select('id')
        .eq('wallet_address', walletAddress)
        .single();

      if (!existing) {
        const { error: createError } = await supabase
          .from('players')
          .insert({ wallet_address: walletAddress });

        if (!createError) {
          logger.info({ walletAddress }, 'Created player record for staker');
          created++;
        }
      }
    }

    // Get all players
    const { data: players, error } = await supabase
      .from('players')
      .select('id, wallet_address');

    if (error || !players) {
      logger.error({ error }, 'Failed to fetch players for staking sync');
      return { synced: 0, errors: 1, created };
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
          logger.info({ wallet: player.wallet_address, balance: balance.toString() }, 'Updated staking balance');
        }
        synced++;
      } catch (err) {
        logger.error({ wallet: player.wallet_address, error: err }, 'Failed to sync staking balance');
        errors++;
      }
    }

    logger.info({ synced, errors, created }, 'Staking balance sync completed');
    return { synced, errors, created };
  }
}

export const stakingService = new StakingService();
