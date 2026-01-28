import { supabase } from '../config/supabase.js';
import { createChildLogger } from '../utils/logger.js';
import type { Address, LeaderboardEntry, LeaderboardType } from '../types/index.js';

const logger = createChildLogger('LeaderboardRepository');

export class LeaderboardRepository {
  async getLeaderboard(
    type: LeaderboardType,
    limit = 100
  ): Promise<LeaderboardEntry[]> {
    const { data, error } = await supabase
      .from('leaderboard_cache')
      .select('*')
      .eq('leaderboard_type', type)
      .order('rank', { ascending: true })
      .limit(limit);

    if (error) {
      logger.error({ error, type }, 'Error fetching leaderboard');
      return [];
    }

    return (data || []).map(this.mapToLeaderboardEntry);
  }

  async getPlayerRank(
    type: LeaderboardType,
    walletAddress: Address
  ): Promise<LeaderboardEntry | null> {
    const { data, error } = await supabase
      .from('leaderboard_cache')
      .select('*')
      .eq('leaderboard_type', type)
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error({ error, type, walletAddress }, 'Error fetching player rank');
    }

    return data ? this.mapToLeaderboardEntry(data) : null;
  }

  async updateLeaderboard(
    type: LeaderboardType,
    entries: Array<{
      walletAddress: Address;
      playerId?: string;
      score: bigint;
      metadata?: Record<string, unknown>;
    }>
  ): Promise<void> {
    logger.info({ type, count: entries.length }, 'Updating leaderboard');

    // Delete old entries
    await supabase
      .from('leaderboard_cache')
      .delete()
      .eq('leaderboard_type', type);

    // Insert new entries with ranks
    const inserts = entries.map((entry, index) => ({
      leaderboard_type: type,
      wallet_address: entry.walletAddress.toLowerCase(),
      player_id: entry.playerId,
      rank: index + 1,
      score: entry.score.toString(),
      farcaster_username: (entry.metadata?.farcaster_username as string) || null,
      metadata: entry.metadata || {},
      computed_at: new Date().toISOString(),
    }));

    if (inserts.length > 0) {
      const { error } = await supabase.from('leaderboard_cache').insert(inserts);

      if (error) {
        logger.error({ error, type }, 'Error inserting leaderboard entries');
      }
    }

    logger.info({ type, count: entries.length }, 'Leaderboard updated');
  }

  async getLastComputedAt(type: LeaderboardType): Promise<Date | null> {
    const { data } = await supabase
      .from('leaderboard_cache')
      .select('computed_at')
      .eq('leaderboard_type', type)
      .order('computed_at', { ascending: false })
      .limit(1)
      .single();

    return data ? new Date(data.computed_at) : null;
  }

  private mapToLeaderboardEntry(data: {
    rank: number;
    wallet_address: string;
    player_id: string | null;
    score: string;
    farcaster_username: string | null;
    metadata: unknown;
  }): LeaderboardEntry {
    const metadata = data.metadata as Record<string, unknown>;
    return {
      rank: data.rank,
      walletAddress: data.wallet_address as Address,
      playerId: data.player_id || undefined,
      score: BigInt(data.score),
      // Read from dedicated column first, fallback to metadata for backwards compatibility
      farcasterUsername: data.farcaster_username || (metadata.farcaster_username as string | undefined),
      metadata,
    };
  }
}

export const leaderboardRepository = new LeaderboardRepository();
