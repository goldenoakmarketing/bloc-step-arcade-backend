import { notificationRepository, NotificationToken } from '../../repositories/NotificationRepository.js';
import { createChildLogger } from '../../utils/logger.js';

const logger = createChildLogger('NotificationService');

// Rate limiting: max 1 notification per 30 seconds per token, 100 per day
const NOTIFICATION_COOLDOWN_MS = 30 * 1000;
const lastNotificationTime = new Map<string, number>();

interface SendNotificationResult {
  success: boolean;
  successfulTokens?: string[];
  invalidTokens?: string[];
  rateLimitedTokens?: string[];
  error?: string;
}

export class NotificationService {
  /**
   * Send a notification to a specific Farcaster user by FID
   */
  async sendToFid(
    fid: number,
    notification: {
      title: string; // max 32 chars
      body: string; // max 128 chars
      targetUrl: string; // max 1024 chars, must be same domain as app
    }
  ): Promise<SendNotificationResult> {
    const token = await notificationRepository.findByFid(fid);
    if (!token) {
      logger.warn({ fid }, 'No notification token found for FID');
      return { success: false, error: 'User has not enabled notifications' };
    }

    return this.sendNotification(token, notification);
  }

  /**
   * Send a notification to a user by wallet address
   */
  async sendToWallet(
    walletAddress: string,
    notification: {
      title: string;
      body: string;
      targetUrl: string;
    }
  ): Promise<SendNotificationResult> {
    const token = await notificationRepository.findByWallet(walletAddress);
    if (!token) {
      logger.warn({ walletAddress }, 'No notification token found for wallet');
      return { success: false, error: 'User has not enabled notifications' };
    }

    return this.sendNotification(token, notification);
  }

  /**
   * Send notification using the token details
   */
  private async sendNotification(
    token: NotificationToken,
    notification: {
      title: string;
      body: string;
      targetUrl: string;
    }
  ): Promise<SendNotificationResult> {
    // Check rate limiting
    const lastTime = lastNotificationTime.get(token.notificationToken);
    if (lastTime && Date.now() - lastTime < NOTIFICATION_COOLDOWN_MS) {
      logger.warn({ fid: token.farcasterFid }, 'Rate limited - too soon since last notification');
      return { success: false, error: 'Rate limited', rateLimitedTokens: [token.notificationToken] };
    }

    // Validate lengths
    if (notification.title.length > 32) {
      notification.title = notification.title.slice(0, 32);
    }
    if (notification.body.length > 128) {
      notification.body = notification.body.slice(0, 128);
    }
    if (notification.targetUrl.length > 1024) {
      logger.error({ targetUrl: notification.targetUrl }, 'Target URL too long');
      return { success: false, error: 'Target URL too long' };
    }

    try {
      const notificationId = `${token.farcasterFid}-${Date.now()}`;

      const response = await fetch(token.notificationUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notificationId,
          title: notification.title,
          body: notification.body,
          targetUrl: notification.targetUrl,
          tokens: [token.notificationToken],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ status: response.status, error: errorText, fid: token.farcasterFid }, 'Notification API error');
        return { success: false, error: `API error: ${response.status}` };
      }

      const result = await response.json() as {
        successfulTokens?: string[];
        invalidTokens?: string[];
        rateLimitedTokens?: string[];
      };

      // Update rate limit tracking
      lastNotificationTime.set(token.notificationToken, Date.now());

      // Handle invalid tokens by disabling them
      if (result.invalidTokens && result.invalidTokens.length > 0) {
        logger.warn({ fid: token.farcasterFid }, 'Token is invalid, disabling');
        await notificationRepository.disable(token.farcasterFid);
      }

      const success = result.successfulTokens && result.successfulTokens.length > 0;

      logger.info({
        fid: token.farcasterFid,
        success,
        title: notification.title,
      }, 'Notification sent');

      return {
        success,
        successfulTokens: result.successfulTokens,
        invalidTokens: result.invalidTokens,
        rateLimitedTokens: result.rateLimitedTokens,
      };
    } catch (error) {
      logger.error({ error, fid: token.farcasterFid }, 'Failed to send notification');
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Send cooldown expired notification
   */
  async sendCooldownExpiredNotification(walletAddress: string): Promise<SendNotificationResult> {
    return this.sendToWallet(walletAddress, {
      title: 'Quarter Ready!',
      body: 'Your free quarter is ready! Claim it now in Bloc Step Arcade',
      targetUrl: 'https://blocsteparcade.netlify.app',
    });
  }
}

export const notificationService = new NotificationService();
