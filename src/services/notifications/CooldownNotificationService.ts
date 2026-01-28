import { supabase } from '../../config/supabase.js';
import { notificationRepository } from '../../repositories/NotificationRepository.js';
import { notificationService } from './NotificationService.js';
import { createChildLogger } from '../../utils/logger.js';

const logger = createChildLogger('CooldownNotificationService');

// Check interval: every 15 minutes
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

// Track which users we've already notified this session (to avoid duplicates)
const notifiedThisSession = new Set<string>();

export class CooldownNotificationService {
  private intervalId: NodeJS.Timeout | null = null;

  /**
   * Start the periodic check for expired cooldowns
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('Cooldown notification service already running');
      return;
    }

    logger.info('Starting cooldown notification service');

    // Run immediately on start
    this.checkExpiredCooldowns().catch((error) => {
      logger.error({ error }, 'Error in initial cooldown check');
    });

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.checkExpiredCooldowns().catch((error) => {
        logger.error({ error }, 'Error in periodic cooldown check');
      });
    }, CHECK_INTERVAL_MS);
  }

  /**
   * Stop the periodic check
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Stopped cooldown notification service');
    }
  }

  /**
   * Check for users whose cooldowns have expired and send notifications
   */
  private async checkExpiredCooldowns(): Promise<void> {
    const now = new Date();
    // Look for claims where last_claim_time + 24 hours is between (now - 1 hour) and now
    // This catches anyone whose cooldown expired in the last hour
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const cooldownMs = 24 * 60 * 60 * 1000;

    // Calculate the claim times that would have expired between 1 hour ago and now
    const earliestClaimTime = new Date(oneHourAgo.getTime() - cooldownMs);
    const latestClaimTime = new Date(now.getTime() - cooldownMs);

    logger.debug({
      now: now.toISOString(),
      checkingClaimsBetween: {
        earliest: earliestClaimTime.toISOString(),
        latest: latestClaimTime.toISOString(),
      },
    }, 'Checking for expired cooldowns');

    // Get claims that expired recently
    const { data: claims, error } = await supabase
      .from('pool_claims')
      .select('wallet_address, last_claim_time')
      .gte('last_claim_time', earliestClaimTime.toISOString())
      .lte('last_claim_time', latestClaimTime.toISOString());

    if (error) {
      logger.error({ error }, 'Error fetching expired cooldowns');
      return;
    }

    if (!claims || claims.length === 0) {
      logger.debug('No expired cooldowns found');
      return;
    }

    logger.info({ count: claims.length }, 'Found claims with expired cooldowns');

    // Send notifications to each user
    for (const claim of claims) {
      const walletAddress = claim.wallet_address;

      // Skip if already notified this session
      if (notifiedThisSession.has(walletAddress)) {
        continue;
      }

      // Check if user has notifications enabled
      const token = await notificationRepository.findByWallet(walletAddress);
      if (!token) {
        logger.debug({ walletAddress }, 'User has no notification token, skipping');
        continue;
      }

      // Send the notification
      const result = await notificationService.sendCooldownExpiredNotification(walletAddress);

      if (result.success) {
        notifiedThisSession.add(walletAddress);
        logger.info({ walletAddress }, 'Sent cooldown notification');
      } else {
        logger.warn({ walletAddress, error: result.error }, 'Failed to send cooldown notification');
      }
    }
  }

  /**
   * Clear the notified set (useful for daily reset)
   */
  clearNotifiedSet(): void {
    notifiedThisSession.clear();
    logger.info('Cleared cooldown notification tracking');
  }
}

export const cooldownNotificationService = new CooldownNotificationService();
