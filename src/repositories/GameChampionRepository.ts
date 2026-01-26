import { supabase } from '../config/supabase.js';
import { createChildLogger } from '../utils/logger.js';
import type { Address, GameId } from '../types/index.js';

const logger = createChildLogger('GameChampionRepository');

export interface GameChampion {
  gameId: GameId;
  walletAddress: Address;
  farcasterFid?: number;
  farcasterUsername?: string;
  farcasterPfp?: string;
  score: bigint;
  updatedAt: Date;
}

export class GameChampionRepository {
  async getChampion(gameId: GameId): Promise<GameChampion | null> {
    const { data, error } = await supabase
      .from('game_champions')
      .select('*')
      .eq('game_id', gameId)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error({ error, gameId }, 'Error fetching game champion');
    }

    return data ? this.mapToGameChampion(data) : null;
  }

  async updateChampion(
    gameId: GameId,
    walletAddress: Address,
    score: bigint,
    farcasterFid?: number,
    farcasterUsername?: string,
    farcasterPfp?: string
  ): Promise<void> {
    const { error } = await supabase
      .from('game_champions')
      .upsert(
        {
          game_id: gameId,
          wallet_address: walletAddress.toLowerCase(),
          farcaster_fid: farcasterFid,
          farcaster_username: farcasterUsername,
          farcaster_pfp: farcasterPfp,
          score: Number(score),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'game_id' }
      );

    if (error) {
      logger.error({ error, gameId, walletAddress, score: score.toString() }, 'Error updating game champion');
    } else {
      logger.info({ gameId, walletAddress, farcasterUsername, score: score.toString() }, 'Updated game champion');
    }
  }

  async fetchAndStorePfp(fid: number): Promise<string | null> {
    try {
      const apiKey = process.env.NEYNAR_API_KEY;
      if (!apiKey) {
        logger.warn('NEYNAR_API_KEY not set');
        return null;
      }

      const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
        headers: {
          api_key: apiKey,
        },
      });

      if (!response.ok) {
        logger.warn({ fid, status: response.status }, 'Failed to fetch Farcaster user');
        return null;
      }

      const data = (await response.json()) as { users?: Array<{ pfp_url?: string }> };
      return data.users?.[0]?.pfp_url || null;
    } catch (error) {
      logger.warn({ error, fid }, 'Failed to fetch Farcaster PFP');
      return null;
    }
  }

  private mapToGameChampion(data: {
    game_id: string;
    wallet_address: string;
    farcaster_fid: number | null;
    farcaster_username: string | null;
    farcaster_pfp: string | null;
    score: number;
    updated_at: string;
  }): GameChampion {
    return {
      gameId: data.game_id as GameId,
      walletAddress: data.wallet_address as Address,
      farcasterFid: data.farcaster_fid || undefined,
      farcasterUsername: data.farcaster_username || undefined,
      farcasterPfp: data.farcaster_pfp || undefined,
      score: BigInt(data.score),
      updatedAt: new Date(data.updated_at),
    };
  }
}

export const gameChampionRepository = new GameChampionRepository();
