import { formatUnits } from 'viem';
import { createChildLogger } from '../../utils/logger.js';
import { neynarClient } from './NeynarClient.js';
import { arcadeVaultService } from '../blockchain/ArcadeVaultService.js';
import type { Address } from '../../types/index.js';

const logger = createChildLogger('NotificationService');

export class NotificationService {
  async sendTipNotification(
    fromFid: number,
    toFid: number,
    amount: bigint,
    _txHash: string
  ): Promise<void> {
    logger.info({ fromFid, toFid, amount: amount.toString() }, 'Sending tip notification');

    try {
      const [fromUser, toUser] = await Promise.all([
        neynarClient.getUserByFid(fromFid),
        neynarClient.getUserByFid(toFid),
      ]);

      if (!fromUser || !toUser) {
        logger.warn({ fromFid, toFid }, 'Could not fetch users for notification');
        return;
      }

      const formattedAmount = formatUnits(amount, 18);
      const message = `@${toUser.username} received ${formattedAmount} $BLOC tip from @${fromUser.username}! 🎮`;

      await neynarClient.postCast(message);
      logger.info({ toFid, formattedAmount }, 'Tip notification sent');
    } catch (error) {
      logger.error({ error, fromFid, toFid }, 'Failed to send tip notification');
    }
  }

  async sendYeetNotification(
    walletAddress: Address,
    amount: bigint,
    _txHash: string
  ): Promise<void> {
    logger.info({ walletAddress, amount: amount.toString() }, 'Sending yeet notification');

    try {
      const users = await neynarClient.getUsersByAddresses([walletAddress]);
      const user = users[0];

      if (!user) {
        logger.debug({ walletAddress }, 'No Farcaster user found for address');
        return;
      }

      const formattedAmount = formatUnits(amount, 18);
      const message = `@${user.username} just yeeted ${formattedAmount} $BLOC! 🚀`;

      await neynarClient.postCast(message);
      logger.info({ username: user.username, formattedAmount }, 'Yeet notification sent');
    } catch (error) {
      logger.error({ error, walletAddress }, 'Failed to send yeet notification');
    }
  }

  async sendLowBalanceWarning(walletAddress: Address, balance: bigint): Promise<void> {
    logger.info({ walletAddress, balance: balance.toString() }, 'Sending low balance warning');

    try {
      const users = await neynarClient.getUsersByAddresses([walletAddress]);
      const user = users[0];

      if (!user) {
        logger.debug({ walletAddress }, 'No Farcaster user found for address');
        return;
      }

      const formattedBalance = balance.toString();
      const message = `@${user.username} your arcade time balance is low (${formattedBalance} seconds remaining). Top up to keep playing! ⏰`;

      await neynarClient.postCast(message);
      logger.info({ username: user.username, balance: formattedBalance }, 'Low balance warning sent');
    } catch (error) {
      logger.error({ error, walletAddress }, 'Failed to send low balance warning');
    }
  }

  async checkAndNotifyLowBalance(walletAddress: Address, threshold = 300n): Promise<void> {
    try {
      const balance = await arcadeVaultService.getTimeBalance(walletAddress);

      if (balance > 0n && balance < threshold) {
        await this.sendLowBalanceWarning(walletAddress, balance);
      }
    } catch (error) {
      logger.error({ error, walletAddress }, 'Failed to check balance for notification');
    }
  }

  async sendWelcomeNotification(fid: number, walletAddress: Address): Promise<void> {
    logger.info({ fid, walletAddress }, 'Sending welcome notification');

    try {
      const user = await neynarClient.getUserByFid(fid);
      if (!user) return;

      const message = `Welcome to Bloc Step Arcade, @${user.username}! 🎮 Your wallet has been linked. Time to play!`;

      await neynarClient.postCast(message);
      logger.info({ username: user.username }, 'Welcome notification sent');
    } catch (error) {
      logger.error({ error, fid }, 'Failed to send welcome notification');
    }
  }

  async sendGameSessionStartNotification(
    walletAddress: Address,
    sessionId: string
  ): Promise<void> {
    logger.info({ walletAddress, sessionId }, 'Sending game session start notification');

    try {
      const users = await neynarClient.getUsersByAddresses([walletAddress]);
      const user = users[0];

      if (!user) return;

      const balance = await arcadeVaultService.getTimeBalance(walletAddress);
      const message = `@${user.username} started a game session! ${balance.toString()} seconds of time available. Good luck! 🕹️`;

      await neynarClient.postCast(message);
    } catch (error) {
      logger.error({ error, walletAddress }, 'Failed to send session start notification');
    }
  }
}

export const notificationService = new NotificationService();
