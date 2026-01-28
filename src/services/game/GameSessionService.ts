import { supabase } from '../../config/supabase.js';
import { createChildLogger } from '../../utils/logger.js';
import { arcadeVaultService } from '../blockchain/ArcadeVaultService.js';
import type { Address, GameSession, GameSessionStatus } from '../../types/index.js';

const logger = createChildLogger('GameSessionService');

export class GameSessionService {
  async startSession(walletAddress: Address): Promise<GameSession> {
    logger.info({ walletAddress }, 'Starting new game session');

    // Check for existing active session
    const existingSession = await this.getActiveSession(walletAddress);
    if (existingSession) {
      logger.warn({ walletAddress, sessionId: existingSession.id }, 'Active session already exists');
      throw new Error('Active session already exists');
    }

    // Check time balance
    const balance = await arcadeVaultService.getTimeBalance(walletAddress);
    if (balance <= 0n) {
      logger.warn({ walletAddress }, 'Insufficient time balance');
      throw new Error('Insufficient time balance');
    }

    // Ensure player exists
    const player = await this.ensurePlayer(walletAddress);

    // Create session
    const { data, error } = await supabase
      .from('game_sessions')
      .insert({
        player_id: player.id,
        wallet_address: walletAddress.toLowerCase(),
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      logger.error({ error }, 'Failed to create session');
      throw new Error('Failed to create session');
    }

    logger.info({ walletAddress, sessionId: data.id }, 'Game session started');

    return this.mapToGameSession(data);
  }

  async getSession(sessionId: string): Promise<GameSession | null> {
    const { data } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    return data ? this.mapToGameSession(data) : null;
  }

  async getActiveSession(walletAddress: Address): Promise<GameSession | null> {
    const { data } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase())
      .eq('status', 'active')
      .single();

    return data ? this.mapToGameSession(data) : null;
  }

  async endSession(sessionId: string): Promise<GameSession> {
    logger.info({ sessionId }, 'Ending game session');

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status !== 'active') {
      throw new Error('Session is not active');
    }

    const { data, error } = await supabase
      .from('game_sessions')
      .update({
        status: 'completed',
        ended_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      logger.error({ error }, 'Failed to end session');
      throw new Error('Failed to end session');
    }

    logger.info({ sessionId }, 'Game session ended');

    return this.mapToGameSession(data);
  }

  async pauseSession(sessionId: string): Promise<GameSession> {
    logger.info({ sessionId }, 'Pausing game session');

    const { data, error } = await supabase
      .from('game_sessions')
      .update({ status: 'paused' })
      .eq('id', sessionId)
      .eq('status', 'active')
      .select()
      .single();

    if (error) {
      throw new Error('Failed to pause session');
    }

    return this.mapToGameSession(data);
  }

  async resumeSession(sessionId: string): Promise<GameSession> {
    logger.info({ sessionId }, 'Resuming game session');

    const { data, error } = await supabase
      .from('game_sessions')
      .update({ status: 'active' })
      .eq('id', sessionId)
      .eq('status', 'paused')
      .select()
      .single();

    if (error) {
      throw new Error('Failed to resume session');
    }

    return this.mapToGameSession(data);
  }

  async updateSessionTimeConsumed(sessionId: string, additionalSeconds: number): Promise<void> {
    // Fetch current session to get current time consumed
    const session = await this.getSession(sessionId);
    if (!session) return;

    const newTotal = Number(session.totalTimeConsumed) + additionalSeconds;

    await supabase
      .from('game_sessions')
      .update({
        total_time_consumed: newTotal,
        last_consumption_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
  }

  async getSessionsByPlayer(walletAddress: Address, limit = 20): Promise<GameSession[]> {
    const { data } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(limit);

    return (data || []).map(this.mapToGameSession);
  }

  private async ensurePlayer(walletAddress: Address) {
    const { data, error } = await supabase
      .from('players')
      .upsert(
        { wallet_address: walletAddress.toLowerCase() },
        { onConflict: 'wallet_address' }
      )
      .select()
      .single();

    if (error) {
      logger.error({ error, walletAddress }, 'Error upserting player');
      throw new Error('Failed to ensure player exists');
    }
    return data;
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

export const gameSessionService = new GameSessionService();
