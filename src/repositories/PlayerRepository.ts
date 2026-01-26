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
    const existing = await this.findByWallet(walletAddress);
    if (existing) return existing;
    return this.create(walletAddress);
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

  async updateCachedStakedBalance(walletAddress: Address, stakedBalance: bigint): Promise<void> {
    await supabase
      .from('players')
      .update({ cached_staked_balance: Number(stakedBalance) })
      .eq('wallet_address', walletAddress.toLowerCase());
  }

  async incrementYeeted(walletAddress: Address, quarters: number): Promise<void> {
    const player = await this.findOrCreate(walletAddress);
    const { error } = await supabase
      .from('players')
      .update({ total_yeeted: Number(player.totalYeeted) + quarters })
      .eq('id', player.id);
    if (error) {
      logger.error({ error, walletAddress, quarters }, 'Error incrementing yeeted');
    }
  }

  async getTopByYeet(limit = 100): Promise<Player[]> {
    const { data } = await supabase
      .from('players')
      .select('*')
      .gt('total_yeeted', 0)
      .order('total_yeeted', { ascending: false })
      .limit(limit);

    return (data || []).map(this.mapToPlayer);
  }

  async getTopByStaking(limit = 100): Promise<Player[]> {
    const { data } = await supabase
      .from('players')
      .select('*')
      .gt('cached_staked_balance', 0)
      .order('cached_staked_balance', { ascending: false })
      .limit(limit);

    return (data || []).map(this.mapToPlayer);
  }

  async getTopByTimePlayed(limit = 100): Promise<Player[]> {
    const { data } = await supabase
      .from('players')
      .select('*')
      .gt('total_time_consumed', 0)
      .order('total_time_consumed', { ascending: false })
      .limit(limit);

    return (data || []).map(this.mapToPlayer);
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

    // Sum all total_yeeted values
    const total = (data || []).reduce((sum, player) => sum + (player.total_yeeted || 0), 0);
    return BigInt(total);
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
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }
}

export const playerRepository = new PlayerRepository();
