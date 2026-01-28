import { supabase } from '../config/supabase.js';
import { createChildLogger } from '../utils/logger.js';
import type { Address, Player } from '../types/index.js';

const logger = createChildLogger('PlayerRepository');

export class PlayerRepository {
  async findByWallet(walletAddress: Address): Promise<Player | null> {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error({ error, walletAddress }, 'Error fetching player');
    }

    return data ? this.mapToPlayer(data) : null;
  }

  async findByFid(fid: number): Promise<Player | null> {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('farcaster_fid', fid)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error({ error, fid }, 'Error fetching player by FID');
    }

    return data ? this.mapToPlayer(data) : null;
  }

  async findById(id: string): Promise<Player | null> {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error({ error, id }, 'Error fetching player by ID');
    }

    return data ? this.mapToPlayer(data) : null;
  }

  async create(walletAddress: Address): Promise<Player> {
    const { data, error } = await supabase
      .from('players')
      .insert({ wallet_address: walletAddress.toLowerCase() })
      .select()
      .single();

    if (error) {
      logger.error({ error, walletAddress }, 'Error creating player');
      throw new Error('Failed to create player');
    }

    return this.mapToPlayer(data);
  }

  async findOrCreate(walletAddress: Address): Promise<Player> {
    const { data, error } = await supabase
      .from('players')
      .upsert(
        { wallet_address: walletAddress.toLowerCase() },
        { onConflict: 'wallet_address' }
      )
      .select()
      .single();

    if (error) {
      logger.error({ error, walletAddress }, 'Error in findOrCreate');
      throw new Error('Failed to find or create player');
    }

    return this.mapToPlayer(data);
  }

  async linkFarcaster(
    walletAddress: Address,
    fid: number,
    username: string
  ): Promise<Player> {
    logger.info({ walletAddress, fid, username }, 'Linking Farcaster account');

    const player = await this.findOrCreate(walletAddress);

    const { data, error } = await supabase
      .from('players')
      .update({
        farcaster_fid: fid,
        farcaster_username: username,
      })
      .eq('id', player.id)
      .select()
      .single();

    if (error) {
      logger.error({ error }, 'Error linking Farcaster');
      throw new Error('Failed to link Farcaster account');
    }

    return this.mapToPlayer(data);
  }

  async updateCachedBalance(walletAddress: Address, timeBalance: bigint): Promise<void> {
    await supabase
      .from('players')
      .update({ cached_time_balance: Number(timeBalance) })
      .eq('wallet_address', walletAddress.toLowerCase());
  }

  async updateCachedStakedBalance(walletAddress: Address, stakedBalanceWei: bigint): Promise<void> {
    // Convert from wei (18 decimals) to tokens for storage
    const balanceTokens = stakedBalanceWei / (10n ** 18n);
    await supabase
      .from('players')
      .update({ cached_staked_balance: Number(balanceTokens) })
      .eq('wallet_address', walletAddress.toLowerCase());
  }

  async incrementYeeted(walletAddress: Address, quarters: number): Promise<void> {
    await this.findOrCreate(walletAddress);
    const { data: current } = await supabase
      .from('players')
      .select('total_yeeted')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();

    if (current) {
      const { error } = await supabase
        .from('players')
        .update({ total_yeeted: (current.total_yeeted || 0) + quarters })
        .eq('wallet_address', walletAddress.toLowerCase());
      if (error) {
        logger.error({ error, walletAddress, quarters }, 'Error incrementing yeeted');
      }
    }
  }

  async getTopByYeet(limit = 100): Promise<Player[]> {
    const { data } = await supabase
      .from('players')
      .select('*')
      .gt('total_yeeted', 0);

    if (!data || data.length === 0) return [];

    // Sort in application code to ensure numeric comparison
    const sorted = data
      .sort((a, b) => Number(b.total_yeeted || 0) - Number(a.total_yeeted || 0))
      .slice(0, limit);

    return sorted.map(this.mapToPlayer);
  }

  async getTopByStaking(limit = 100): Promise<Player[]> {
    const { data } = await supabase
      .from('players')
      .select('*')
      .gt('cached_staked_balance', 0);

    if (!data || data.length === 0) return [];

    // Sort in application code to ensure numeric comparison
    // (Supabase may do string comparison if column is TEXT)
    const sorted = data
      .sort((a, b) => Number(b.cached_staked_balance || 0) - Number(a.cached_staked_balance || 0))
      .slice(0, limit);

    return sorted.map(this.mapToPlayer);
  }

  async getTopByTimePlayed(limit = 100): Promise<Player[]> {
    const { data } = await supabase
      .from('players')
      .select('*')
      .gt('total_time_consumed', 0);

    if (!data || data.length === 0) return [];

    // Sort in application code to ensure numeric comparison
    const sorted = data
      .sort((a, b) => Number(b.total_time_consumed || 0) - Number(a.total_time_consumed || 0))
      .slice(0, limit);

    return sorted.map(this.mapToPlayer);
  }

  async count(): Promise<number> {
    const { count, error } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true });

    if (error) {
      logger.error({ error }, 'Error counting players');
      return 0;
    }

    return count || 0;
  }

  async getTotalDonated(): Promise<bigint> {
    const { data, error } = await supabase
      .from('players')
      .select('total_yeeted');

    if (error) {
      logger.error({ error }, 'Error getting total donated');
      return BigInt(0);
    }

    // Sum all total_yeeted values (convert to number in case stored as string)
    const total = (data || []).reduce((sum, player) => sum + Number(player.total_yeeted || 0), 0);
    return BigInt(total);
  }

  async getTotalStaked(): Promise<bigint> {
    const { data, error } = await supabase
      .from('players')
      .select('cached_staked_balance');

    if (error) {
      logger.error({ error }, 'Error getting total staked');
      return BigInt(0);
    }

    // Convert string values to numbers before summing
    const total = (data || []).reduce((sum, player) => sum + Number(player.cached_staked_balance || 0), 0);
    return BigInt(total);
  }

  async getTotalTimePlayed(): Promise<bigint> {
    const { data, error } = await supabase
      .from('players')
      .select('total_time_consumed');

    if (error) {
      logger.error({ error }, 'Error getting total time played');
      return BigInt(0);
    }

    // Convert to number in case stored as string
    const total = (data || []).reduce((sum, player) => sum + Number(player.total_time_consumed || 0), 0);
    return BigInt(total);
  }

  async addTimeConsumed(walletAddress: Address, seconds: number): Promise<void> {
    await this.findOrCreate(walletAddress);
    const { data: current } = await supabase
      .from('players')
      .select('total_time_consumed')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();

    if (current) {
      const { error } = await supabase
        .from('players')
        .update({ total_time_consumed: (current.total_time_consumed || 0) + seconds })
        .eq('wallet_address', walletAddress.toLowerCase());
      if (error) {
        logger.error({ error, walletAddress, seconds }, 'Error adding time consumed');
      }
    }
  }

  async getPlayerRankByYeet(walletAddress: Address): Promise<number | null> {
    const { data } = await supabase
      .from('players')
      .select('wallet_address, total_yeeted')
      .gt('total_yeeted', 0);

    if (!data) return null;

    // Sort in application code to ensure numeric comparison
    const sorted = data.sort((a, b) => Number(b.total_yeeted || 0) - Number(a.total_yeeted || 0));
    const index = sorted.findIndex(p => p.wallet_address.toLowerCase() === walletAddress.toLowerCase());
    return index >= 0 ? index + 1 : null;
  }

  async getPlayerRankByStaking(walletAddress: Address): Promise<number | null> {
    const { data } = await supabase
      .from('players')
      .select('wallet_address, cached_staked_balance')
      .gt('cached_staked_balance', 0);

    if (!data) return null;

    // Sort in application code to ensure numeric comparison
    const sorted = data.sort((a, b) => Number(b.cached_staked_balance || 0) - Number(a.cached_staked_balance || 0));
    const index = sorted.findIndex(p => p.wallet_address.toLowerCase() === walletAddress.toLowerCase());
    return index >= 0 ? index + 1 : null;
  }

  async getPlayerRankByTimePlayed(walletAddress: Address): Promise<number | null> {
    const { data } = await supabase
      .from('players')
      .select('wallet_address, total_time_consumed')
      .gt('total_time_consumed', 0);

    if (!data) return null;

    // Sort in application code to ensure numeric comparison
    const sorted = data.sort((a, b) => Number(b.total_time_consumed || 0) - Number(a.total_time_consumed || 0));
    const index = sorted.findIndex(p => p.wallet_address.toLowerCase() === walletAddress.toLowerCase());
    return index >= 0 ? index + 1 : null;
  }

  async setStakeStartedAt(walletAddress: Address, startedAt: Date | null): Promise<void> {
    await supabase
      .from('players')
      .update({ stake_started_at: startedAt?.toISOString() || null })
      .eq('wallet_address', walletAddress.toLowerCase());
  }

  private mapToPlayer(data: {
    id: string;
    wallet_address: string;
    farcaster_fid: number | null;
    farcaster_username: string | null;
    cached_time_balance: number;
    cached_staked_balance: number;
    total_time_purchased: number;
    total_time_consumed: number;
    total_yeeted: number;
    total_tips_sent: number;
    total_tips_received: number;
    stake_started_at: string | null;
    created_at: string;
    updated_at: string;
  }): Player {
    return {
      id: data.id,
      walletAddress: data.wallet_address as Address,
      farcasterFid: data.farcaster_fid || undefined,
      farcasterUsername: data.farcaster_username || undefined,
      cachedTimeBalance: BigInt(data.cached_time_balance || 0),
      cachedStakedBalance: BigInt(data.cached_staked_balance || 0),
      totalTimePurchased: BigInt(data.total_time_purchased || 0),
      totalTimeConsumed: BigInt(data.total_time_consumed || 0),
      totalYeeted: BigInt(data.total_yeeted || 0),
      totalTipsSent: BigInt(data.total_tips_sent || 0),
      totalTipsReceived: BigInt(data.total_tips_received || 0),
      stakeStartedAt: data.stake_started_at ? new Date(data.stake_started_at) : undefined,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }
}

export const playerRepository = new PlayerRepository();
