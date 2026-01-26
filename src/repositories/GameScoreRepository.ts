import { supabase } from '../config/supabase.js';
import { createChildLogger } from '../utils/logger.js';
import { gameChampionRepository } from './GameChampionRepository.js';
import type { Address, GameId, GameScore } from '../types/index.js';

const logger = createChildLogger('GameScoreRepository');

export interface GameLeaderboardEntry {
  rank: number;
  walletAddress: Address;
  playerId?: string;
  score: bigint;
  farcasterUsername?: string;
  farcasterFid?: number;
}

export class GameScoreRepository {
  async submitScore(
    walletAddress: Address,
    gameId: GameId,
    score: number,
    playerId?: string,
    farcasterUsername?: string,
    farcasterFid?: number
  ): Promise<GameScore> {
    const { data, error } = await supabase
      .from('game_scores')
      .insert({
        wallet_address: walletAddress.toLowerCase(),
        game_id: gameId,
        score,
        player_id: playerId,
        farcaster_username: farcasterUsername,
        farcaster_fid: farcasterFid,
      })
      .select()
      .single();

    if (error) {
      logger.error({ error, walletAddress, gameId, score }, 'Error submitting score');
      throw new Error('Failed to submit score');
    }

    // Check if this score makes them #1 and update the champion
    await this.checkAndUpdateChampion(gameId, walletAddress, score, farcasterFid, farcasterUsername);

    return this.mapToGameScore(data);
  }

  private async checkAndUpdateChampion(
    gameId: GameId,
    walletAddress: Address,
    score: number,
    farcasterFid?: number,
    farcasterUsername?: string
  ): Promise<void> {
    try {
      // Get current champion
      const currentChampion = await gameChampionRepository.getChampion(gameId);

      // Check if this score beats the current champion
      if (!currentChampion || BigInt(score) > currentChampion.score) {
        logger.info({ gameId, walletAddress, score, previousScore: currentChampion?.score?.toString() }, 'New champion!');

        // Fetch PFP if they have a Farcaster account
        let pfpUrl: string | undefined;
        if (farcasterFid) {
          pfpUrl = (await gameChampionRepository.fetchAndStorePfp(farcasterFid)) || undefined;
        }

        await gameChampionRepository.updateChampion(
          gameId,
          walletAddress,
          BigInt(score),
          farcasterFid,
          farcasterUsername,
          pfpUrl
        );
      }
    } catch (error) {
      logger.error({ error, gameId, walletAddress, score }, 'Error checking/updating champion');
      // Don't throw - this is non-critical
    }
  }

  async getTopScores(gameId: GameId, limit = 10): Promise<GameLeaderboardEntry[]> {
    // Get top scores for a game, grouping by wallet to get each player's best score
    const { data, error } = await supabase
      .from('game_scores')
      .select('*')
      .eq('game_id', gameId)
      .order('score', { ascending: false })
      .limit(limit * 3); // Get more to filter duplicates

    if (error) {
      logger.error({ error, gameId }, 'Error fetching top scores');
      return [];
    }

    // Group by wallet address, keep only highest score per player
    const playerBestScores = new Map<string, typeof data[0]>();
    for (const row of data || []) {
      const wallet = row.wallet_address.toLowerCase();
      const existing = playerBestScores.get(wallet);
      if (!existing || row.score > existing.score) {
        playerBestScores.set(wallet, row);
      }
    }

    // Convert to array and sort by score
    const sortedScores = Array.from(playerBestScores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return sortedScores.map((row, index) => ({
      rank: index + 1,
      walletAddress: row.wallet_address as Address,
      playerId: row.player_id || undefined,
      score: BigInt(row.score),
      farcasterUsername: row.farcaster_username || undefined,
      farcasterFid: row.farcaster_fid || undefined,
    }));
  }

  async getPlayerBestScore(walletAddress: Address, gameId: GameId): Promise<GameScore | null> {
    const { data, error } = await supabase
      .from('game_scores')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase())
      .eq('game_id', gameId)
      .order('score', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error({ error, walletAddress, gameId }, 'Error fetching player best score');
    }

    return data ? this.mapToGameScore(data) : null;
  }

  async getPlayerRank(walletAddress: Address, gameId: GameId): Promise<number | null> {
    // Get all unique player best scores
    const leaderboard = await this.getTopScores(gameId, 1000);
    const entry = leaderboard.find(
      (e) => e.walletAddress.toLowerCase() === walletAddress.toLowerCase()
    );
    return entry?.rank || null;
  }

  private mapToGameScore(data: {
    id: string;
    player_id: string | null;
    wallet_address: string;
    game_id: string;
    score: number;
    farcaster_username: string | null;
    farcaster_fid: number | null;
    created_at: string;
  }): GameScore {
    return {
      id: data.id,
      playerId: data.player_id || undefined,
      walletAddress: data.wallet_address as Address,
      gameId: data.game_id as GameId,
      score: BigInt(data.score),
      farcasterUsername: data.farcaster_username || undefined,
      farcasterFid: data.farcaster_fid || undefined,
      createdAt: new Date(data.created_at),
    };
  }
}

export const gameScoreRepository = new GameScoreRepository();
