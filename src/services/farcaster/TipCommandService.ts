import { parseUnits } from 'viem';
import { supabase } from '../../config/supabase.js';
import { createChildLogger } from '../../utils/logger.js';
import { tipBotService } from '../blockchain/TipBotService.js';
import { neynarClient } from './NeynarClient.js';
import { notificationService } from './NotificationService.js';
import type { Address, TipCommand, Tip } from '../../types/index.js';

const logger = createChildLogger('TipCommandService');

// Regex to match tip commands: /tip @username 100 $BLOC
const TIP_COMMAND_REGEX = /\/tip\s+@(\w+)\s+(\d+(?:\.\d+)?)\s*\$?BLOC/i;

export class TipCommandService {
  async parseTipCommand(text: string): Promise<TipCommand | null> {
    const match = text.match(TIP_COMMAND_REGEX);
    if (!match) return null;

    const [, username, amountStr] = match;
    if (!username || !amountStr) return null;

    const amount = parseUnits(amountStr, 18);

    // Fetch the target user
    const targetUser = await neynarClient.getUserByUsername(username);
    if (!targetUser) {
      logger.warn({ username }, 'Target user not found');
      return null;
    }

    return {
      fromFid: 0, // Will be set from the cast author
      toFid: targetUser.fid,
      amount,
      castHash: '',
    };
  }

  async processTipFromCast(castHash: string): Promise<Tip | null> {
    logger.info({ castHash }, 'Processing tip from cast');

    // Get the cast
    const cast = await neynarClient.getCast(castHash);
    if (!cast) {
      logger.warn({ castHash }, 'Cast not found');
      return null;
    }

    // Parse the tip command
    const command = await this.parseTipCommand(cast.text);
    if (!command) {
      logger.debug({ castHash }, 'No tip command found in cast');
      return null;
    }

    command.fromFid = cast.author.fid;
    command.castHash = castHash;

    return this.executeTip(command);
  }

  async executeTip(command: TipCommand): Promise<Tip | null> {
    logger.info(
      { fromFid: command.fromFid, toFid: command.toFid, amount: command.amount.toString() },
      'Executing tip'
    );

    // Get sender user
    const fromUser = await neynarClient.getUserByFid(command.fromFid);
    if (!fromUser || fromUser.verifiedAddresses.length === 0) {
      logger.warn({ fid: command.fromFid }, 'Sender has no verified address');
      return null;
    }

    // Get recipient user
    const toUser = await neynarClient.getUserByFid(command.toFid);
    if (!toUser || toUser.verifiedAddresses.length === 0) {
      logger.warn({ fid: command.toFid }, 'Recipient has no verified address');
      return null;
    }

    const fromWallet = fromUser.verifiedAddresses[0]!;
    const toWallet = toUser.verifiedAddresses[0]!;

    // Create tip record
    const { data: tipRecord, error } = await supabase
      .from('tips')
      .insert({
        from_wallet: fromWallet.toLowerCase(),
        to_wallet: toWallet.toLowerCase(),
        from_fid: command.fromFid,
        to_fid: command.toFid,
        amount_wei: command.amount.toString(),
        status: 'pending',
        farcaster_cast_hash: command.castHash,
      })
      .select()
      .single();

    if (error) {
      logger.error({ error }, 'Failed to create tip record');
      return null;
    }

    try {
      // Execute on-chain tip
      const txHash = await tipBotService.executeTip(fromWallet, toWallet, command.amount);

      // Update with tx hash
      await supabase
        .from('tips')
        .update({ tx_hash: txHash, status: 'submitted' })
        .eq('id', tipRecord.id);

      // Wait for confirmation
      const success = await tipBotService.waitForTip(txHash);

      if (success) {
        await supabase
          .from('tips')
          .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
          .eq('id', tipRecord.id);

        // Update player stats
        await this.updatePlayerTipStats(fromWallet, toWallet, command.amount);

        // Send notification
        await notificationService.sendTipNotification(
          command.fromFid,
          command.toFid,
          command.amount,
          txHash
        );

        logger.info({ tipId: tipRecord.id, txHash }, 'Tip confirmed');

        return this.mapToTip({ ...tipRecord, tx_hash: txHash, status: 'confirmed' });
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await supabase
        .from('tips')
        .update({ status: 'failed', error_message: errorMessage })
        .eq('id', tipRecord.id);

      logger.error({ tipId: tipRecord.id, error: errorMessage }, 'Tip failed');
      return null;
    }
  }

  async getTipsByFrom(walletAddress: Address, limit = 50): Promise<Tip[]> {
    const { data } = await supabase
      .from('tips')
      .select('*')
      .eq('from_wallet', walletAddress.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(limit);

    return (data || []).map(this.mapToTip);
  }

  async getTipsByTo(walletAddress: Address, limit = 50): Promise<Tip[]> {
    const { data } = await supabase
      .from('tips')
      .select('*')
      .eq('to_wallet', walletAddress.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(limit);

    return (data || []).map(this.mapToTip);
  }

  private async updatePlayerTipStats(fromWallet: Address, toWallet: Address, amount: bigint) {
    // Update sender stats
    const { data: fromPlayer } = await supabase
      .from('players')
      .select('*')
      .eq('wallet_address', fromWallet.toLowerCase())
      .single();

    if (fromPlayer) {
      await supabase
        .from('players')
        .update({ total_tips_sent: fromPlayer.total_tips_sent + Number(amount) })
        .eq('id', fromPlayer.id);
    }

    // Update recipient stats
    const { data: toPlayer } = await supabase
      .from('players')
      .select('*')
      .eq('wallet_address', toWallet.toLowerCase())
      .single();

    if (toPlayer) {
      await supabase
        .from('players')
        .update({ total_tips_received: toPlayer.total_tips_received + Number(amount) })
        .eq('id', toPlayer.id);
    }
  }

  private mapToTip(data: {
    id: string;
    from_player_id: string | null;
    to_player_id: string | null;
    from_wallet: string;
    to_wallet: string;
    from_fid: number | null;
    to_fid: number | null;
    amount_wei: string;
    tx_hash: string | null;
    status: string;
    farcaster_cast_hash: string | null;
    error_message: string | null;
    created_at: string;
    confirmed_at: string | null;
  }): Tip {
    return {
      id: data.id,
      fromPlayerId: data.from_player_id || undefined,
      toPlayerId: data.to_player_id || undefined,
      fromWallet: data.from_wallet as Address,
      toWallet: data.to_wallet as Address,
      fromFid: data.from_fid || undefined,
      toFid: data.to_fid || undefined,
      amountWei: BigInt(data.amount_wei),
      txHash: data.tx_hash || undefined,
      status: data.status as Tip['status'],
      farcasterCastHash: data.farcaster_cast_hash || undefined,
      errorMessage: data.error_message || undefined,
      createdAt: new Date(data.created_at),
      confirmedAt: data.confirmed_at ? new Date(data.confirmed_at) : undefined,
    };
  }
}

export const tipCommandService = new TipCommandService();
