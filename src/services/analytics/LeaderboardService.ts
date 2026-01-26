import { supabase } from '../../config/supabase.js';
import { createChildLogger } from '../../utils/logger.js';
import { leaderboardRepository } from '../../repositories/LeaderboardRepository.js';
import { playerRepository } from '../../repositories/PlayerRepository.js';
import type { Address, LeaderboardEntry, LeaderboardType } from '../../types/index.js';

const logger = createChildLogger('LeaderboardService');

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export class LeaderboardService {
  async getYeetLeaderboard(limit = 100): Promise<LeaderboardEntry[]> {
    return this.getOrComputeLeaderboard('yeet', limit, () => this.computeYeetLeaderboard());
  }

  async getStakingLeaderboard(limit = 100): Promise<LeaderboardEntry[]> {
    return this.getOrComputeLeaderboard('staking', limit, () => this.computeStakingLeaderboard());
  }

  async getTimePlayedLeaderboard(limit = 100): Promise<LeaderboardEntry[]> {
    return this.getOrComputeLeaderboard('time_played', limit, () => this.computeTimePlayedLeaderboard());
  }

  async getTipsSentLeaderboard(limit = 100): Promise<LeaderboardEntry[]> {
    return this.getOrComputeLeaderboard('tips_sent', limit, () => this.computeTipsSentLeaderboard());
  }

  async getTipsReceivedLeaderboard(limit = 100): Promise<LeaderboardEntry[]> {
    return this.getOrComputeLeaderboard('tips_received', limit, () => this.computeTipsReceivedLeaderboard());
  }

  async getPlayerRank(type: LeaderboardType, walletAddress: Address): Promise<LeaderboardEntry | null> {
    // First check if cache needs refresh
    await this.refreshIfStale(type);
    return leaderboardRepository.getPlayerRank(type, walletAddress);
  }

  async refreshAllLeaderboards(): Promise<void> {
    logger.info('Refreshing all leaderboards');

    await Promise.all([
      this.computeAndSaveLeaderboard('yeet', () => this.computeYeetLeaderboard()),
      this.computeAndSaveLeaderboard('staking', () => this.computeStakingLeaderboard()),
      this.computeAndSaveLeaderboard('time_played', () => this.computeTimePlayedLeaderboard()),
      this.computeAndSaveLeaderboard('tips_sent', () => this.computeTipsSentLeaderboard()),
      this.computeAndSaveLeaderboard('tips_received', () => this.computeTipsReceivedLeaderboard()),
    ]);

    logger.info('All leaderboards refreshed');
  }

  private async getOrComputeLeaderboard(
    type: LeaderboardType,
    limit: number,
    computeFn: () => Promise<Array<{ walletAddress: Address; playerId?: string; score: bigint; metadata?: Record<string, unknown> }>>
  ): Promise<LeaderboardEntry[]> {
    await this.refreshIfStale(type);
    const cached = await leaderboardRepository.getLeaderboard(type, limit);

    // If cache is empty, compute directly as fallback
    if (cached.length === 0) {
      logger.info({ type }, 'Cache empty, computing leaderboard directly');
      try {
        const entries = await computeFn();
        return entries.slice(0, limit).map((entry, index) => ({
          rank: index + 1,
          walletAddress: entry.walletAddress,
          playerId: entry.playerId,
          score: entry.score,
          farcasterUsername: entry.metadata?.farcaster_username as string | undefined,
          metadata: entry.metadata || {},
        }));
      } catch (error) {
        logger.error({ error, type }, 'Error computing leaderboard directly');
        return [];
      }
    }

    return cached;
  }

  private async refreshIfStale(type: LeaderboardType): Promise<void> {
    const lastComputed = await leaderboardRepository.getLastComputedAt(type);
    const isStale = !lastComputed || Date.now() - lastComputed.getTime() > CACHE_DURATION_MS;

    logger.debug({ type, lastComputed, isStale }, 'Checking leaderboard cache staleness');

    if (isStale) {
      logger.info({ type }, 'Leaderboard cache stale, refreshing');
      await this.computeAndSaveLeaderboard(type, () => this.computeLeaderboardByType(type));
    }
  }

  private async computeLeaderboardByType(type: LeaderboardType) {
    switch (type) {
      case 'yeet':
        return this.computeYeetLeaderboard();
      case 'staking':
        return this.computeStakingLeaderboard();
      case 'time_played':
        return this.computeTimePlayedLeaderboard();
      case 'tips_sent':
        return this.computeTipsSentLeaderboard();
      case 'tips_received':
        return this.computeTipsReceivedLeaderboard();
      default:
        throw new Error(`Unknown leaderboard type: ${type}`);
    }
  }

  private async computeAndSaveLeaderboard(
    type: LeaderboardType,
    computeFn: () => Promise<Array<{ walletAddress: Address; playerId?: string; score: bigint; metadata?: Record<string, unknown> }>>
  ): Promise<void> {
    try {
      const entries = await computeFn();
      await leaderboardRepository.updateLeaderboard(type, entries);
    } catch (error) {
      logger.error({ error, type }, 'Error computing leaderboard');
    }
  }

  private async computeYeetLeaderboard() {
    const players = await playerRepository.getTopByYeet(100);

    return players.map((player) => ({
      walletAddress: player.walletAddress,
      playerId: player.id,
      score: player.totalYeeted,
      metadata: {
        farcaster_username: player.farcasterUsername,
        farcaster_fid: player.farcasterFid,
      },
    }));
  }

  private async computeStakingLeaderboard() {
    const players = await playerRepository.getTopByStaking(100);

    return players.map((player) => ({
      walletAddress: player.walletAddress,
      playerId: player.id,
      score: player.cachedStakedBalance,
      metadata: {
        farcaster_username: player.farcasterUsername,
        farcaster_fid: player.farcasterFid,
      },
    }));
  }

  private async computeTimePlayedLeaderboard() {
    const players = await playerRepository.getTopByTimePlayed(100);

    return players.map((player) => ({
      walletAddress: player.walletAddress,
      playerId: player.id,
      score: player.totalTimeConsumed,
      metadata: {
        farcaster_username: player.farcasterUsername,
        farcaster_fid: player.farcasterFid,
      },
    }));
  }

  private async computeTipsSentLeaderboard() {
    const { data } = await supabase
      .from('players')
      .select('*')
      .gt('total_tips_sent', 0)
      .order('total_tips_sent', { ascending: false })
      .limit(100);

    return (data || []).map((player) => ({
      walletAddress: player.wallet_address as Address,
      playerId: player.id,
      score: BigInt(player.total_tips_sent),
      metadata: {
        farcaster_username: player.farcaster_username,
        farcaster_fid: player.farcaster_fid,
      },
    }));
  }

  private async computeTipsReceivedLeaderboard() {
    const { data } = await supabase
      .from('players')
      .select('*')
      .gt('total_tips_received', 0)
      .order('total_tips_received', { ascending: false })
      .limit(100);

    return (data || []).map((player) => ({
      walletAddress: player.wallet_address as Address,
      playerId: player.id,
      score: BigInt(player.total_tips_received),
      metadata: {
        farcaster_username: player.farcaster_username,
        farcaster_fid: player.farcaster_fid,
      },
    }));
  }
}

export const leaderboardService = new LeaderboardService();
