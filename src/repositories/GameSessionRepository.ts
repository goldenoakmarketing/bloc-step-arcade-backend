import { supabase } from '../config/supabase.js';
import { createChildLogger } from '../utils/logger.js';
import type { Address, GameSession, GameSessionStatus } from '../types/index.js';

const logger = createChildLogger('GameSessionRepository');

export class GameSessionRepository {
  async findById(id: string): Promise<GameSession | null> {
    const { data, error } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error({ error, id }, 'Error fetching session');
    }

    return data ? this.mapToGameSession(data) : null;
  }

  async findActiveByWallet(walletAddress: Address): Promise<GameSession | null> {
    const { data, error } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase())
      .eq('status', 'active')
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error({ error, walletAddress }, 'Error fetching active session');
    }

    return data ? this.mapToGameSession(data) : null;
  }

  async findByPlayer(
    walletAddress: Address,
    options: { limit?: number; offset?: number; status?: GameSessionStatus } = {}
  ): Promise<GameSession[]> {
    let query = supabase
      .from('game_sessions')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase())
      .order('created_at', { ascending: false });

    if (options.status) {
      query = query.eq('status', options.status);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error, walletAddress }, 'Error fetching player sessions');
      return [];
    }

    return (data || []).map(this.mapToGameSession);
  }

  async create(playerId: string, walletAddress: Address): Promise<GameSession> {
    const { data, error } = await supabase
      .from('game_sessions')
      .insert({
        player_id: playerId,
        wallet_address: walletAddress.toLowerCase(),
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      logger.error({ error }, 'Error creating session');
      throw new Error('Failed to create session');
    }

    return this.mapToGameSession(data);
  }

  async updateStatus(id: string, status: GameSessionStatus): Promise<GameSession> {
    const updateData: Record<string, unknown> = { status };

    if (status === 'completed' || status === 'expired') {
      updateData.ended_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('game_sessions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error({ error, id, status }, 'Error updating session status');
      throw new Error('Failed to update session');
    }

    return this.mapToGameSession(data);
  }

  async addTimeConsumed(id: string, seconds: number): Promise<void> {
    const session = await this.findById(id);
    if (!session) throw new Error('Session not found');

    await supabase
      .from('game_sessions')
      .update({
        total_time_consumed: Number(session.totalTimeConsumed) + seconds,
        last_consumption_at: new Date().toISOString(),
      })
      .eq('id', id);
  }

  async countActiveSessions(): Promise<number> {
    const { count, error } = await supabase
      .from('game_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    if (error) {
      logger.error({ error }, 'Error counting active sessions');
      return 0;
    }

    return count || 0;
  }

  async getTotalSessionCount(): Promise<number> {
    const { count, error } = await supabase
      .from('game_sessions')
      .select('*', { count: 'exact', head: true });

    if (error) {
      logger.error({ error }, 'Error counting total sessions');
      return 0;
    }

    return count || 0;
  }

  async getRecentSessions(limit = 20): Promise<GameSession[]> {
    const { data, error } = await supabase
      .from('game_sessions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ error }, 'Error fetching recent sessions');
      return [];
    }

    return (data || []).map(this.mapToGameSession);
  }

  private mapToGameSession(data: {
    id: string;
    player_id: string;
    wallet_address: string;
    status: string;
    started_at: string;
    ended_at: string | null;
    total_time_consumed: number;
    last_consumption_at: string | null;
    metadata: unknown;
  }): GameSession {
    return {
      id: data.id,
      playerId: data.player_id,
      walletAddress: data.wallet_address as Address,
      status: data.status as GameSessionStatus,
      startedAt: new Date(data.started_at),
      endedAt: data.ended_at ? new Date(data.ended_at) : undefined,
      totalTimeConsumed: BigInt(data.total_time_consumed),
      lastConsumptionAt: data.last_consumption_at ? new Date(data.last_consumption_at) : undefined,
      metadata: data.metadata as Record<string, unknown>,
    };
  }
}

export const gameSessionRepository = new GameSessionRepository();
