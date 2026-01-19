import { supabase } from '../../config/supabase.js';
import { createChildLogger } from '../../utils/logger.js';
import { arcadeVaultService } from '../blockchain/ArcadeVaultService.js';
import { gameSessionService } from './GameSessionService.js';
import type { Address, TimeConsumption } from '../../types/index.js';

const logger = createChildLogger('TimeConsumptionService');

export class TimeConsumptionService {
  async consumeTime(sessionId: string, seconds: number): Promise<TimeConsumption> {
    logger.info({ sessionId, seconds }, 'Processing time consumption');

    // Get and validate session
    const session = await gameSessionService.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status !== 'active') {
      throw new Error('Session is not active');
    }

    // Check balance first
    const balance = await arcadeVaultService.getTimeBalance(session.walletAddress);
    if (balance < BigInt(seconds)) {
      throw new Error('Insufficient time balance');
    }

    // Create pending consumption record
    const { data: consumption, error } = await supabase
      .from('time_consumptions')
      .insert({
        session_id: sessionId,
        player_id: session.playerId,
        wallet_address: session.walletAddress.toLowerCase(),
        seconds_consumed: seconds,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      logger.error({ error }, 'Failed to create consumption record');
      throw new Error('Failed to create consumption record');
    }

    try {
      // Submit on-chain transaction
      const txHash = await arcadeVaultService.consumeTime(
        session.walletAddress,
        BigInt(seconds)
      );

      // Update record with tx hash
      await supabase
        .from('time_consumptions')
        .update({ tx_hash: txHash, status: 'submitted' })
        .eq('id', consumption.id);

      logger.info({ sessionId, seconds, txHash }, 'Time consumption submitted');

      // Wait for confirmation
      const success = await arcadeVaultService.waitForConsumption(txHash);

      if (success) {
        // Update session time consumed
        await gameSessionService.updateSessionTimeConsumed(sessionId, seconds);

        // Update consumption status
        await supabase
          .from('time_consumptions')
          .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
          .eq('id', consumption.id);

        logger.info({ sessionId, seconds, txHash }, 'Time consumption confirmed');

        return this.mapToTimeConsumption({ ...consumption, tx_hash: txHash, status: 'confirmed' });
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Mark consumption as failed
      await supabase
        .from('time_consumptions')
        .update({ status: 'failed', error_message: errorMessage })
        .eq('id', consumption.id);

      logger.error({ sessionId, seconds, error: errorMessage }, 'Time consumption failed');
      throw error;
    }
  }

  async getConsumption(consumptionId: string): Promise<TimeConsumption | null> {
    const { data } = await supabase
      .from('time_consumptions')
      .select('*')
      .eq('id', consumptionId)
      .single();

    return data ? this.mapToTimeConsumption(data) : null;
  }

  async getConsumptionsBySession(sessionId: string): Promise<TimeConsumption[]> {
    const { data } = await supabase
      .from('time_consumptions')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    return (data || []).map(this.mapToTimeConsumption);
  }

  async getConsumptionsByPlayer(walletAddress: Address, limit = 50): Promise<TimeConsumption[]> {
    const { data } = await supabase
      .from('time_consumptions')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(limit);

    return (data || []).map(this.mapToTimeConsumption);
  }

  async getTotalConsumedBySession(sessionId: string): Promise<bigint> {
    const { data } = await supabase
      .from('time_consumptions')
      .select('seconds_consumed')
      .eq('session_id', sessionId)
      .eq('status', 'confirmed');

    const total = (data || []).reduce((sum, c) => sum + c.seconds_consumed, 0);
    return BigInt(total);
  }

  async getPendingConsumptions(): Promise<TimeConsumption[]> {
    const { data } = await supabase
      .from('time_consumptions')
      .select('*')
      .in('status', ['pending', 'submitted'])
      .order('created_at', { ascending: true });

    return (data || []).map(this.mapToTimeConsumption);
  }

  private mapToTimeConsumption(data: {
    id: string;
    session_id: string | null;
    player_id: string | null;
    wallet_address: string;
    seconds_consumed: number;
    tx_hash: string | null;
    status: string;
    error_message: string | null;
    created_at: string;
    confirmed_at: string | null;
  }): TimeConsumption {
    return {
      id: data.id,
      sessionId: data.session_id || undefined,
      playerId: data.player_id || undefined,
      walletAddress: data.wallet_address as Address,
      secondsConsumed: BigInt(data.seconds_consumed),
      txHash: data.tx_hash || undefined,
      status: data.status as TimeConsumption['status'],
      errorMessage: data.error_message || undefined,
      createdAt: new Date(data.created_at),
      confirmedAt: data.confirmed_at ? new Date(data.confirmed_at) : undefined,
    };
  }
}

export const timeConsumptionService = new TimeConsumptionService();
