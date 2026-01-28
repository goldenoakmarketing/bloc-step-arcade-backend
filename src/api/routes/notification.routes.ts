import { Router } from 'express';
import { notificationRepository } from '../../repositories/NotificationRepository.js';
import { notificationService } from '../../services/notifications/NotificationService.js';
import { extractWalletAddress, requireWallet, requireApiKey } from '../middleware/auth.js';
import { standardRateLimit } from '../middleware/rateLimit.js';
import { asyncHandler, ValidationError } from '../middleware/errorHandler.js';
import { addressSchema } from '../../types/index.js';
import { createChildLogger } from '../../utils/logger.js';
import { config } from '../../config/index.js';

const logger = createChildLogger('NotificationRoutes');

const router = Router();

router.use(extractWalletAddress);

/**
 * Register notification token for a user
 * Called by frontend after user enables notifications via addMiniApp()
 */
router.post(
  '/register',
  standardRateLimit,
  requireWallet,
  asyncHandler(async (req, res) => {
    const walletAddress = req.walletAddress!;
    const { fid, notificationUrl, notificationToken } = req.body;

    if (!fid || typeof fid !== 'number') {
      throw new ValidationError('Invalid Farcaster FID');
    }

    if (!notificationUrl || typeof notificationUrl !== 'string') {
      throw new ValidationError('Invalid notification URL');
    }

    if (!notificationToken || typeof notificationToken !== 'string') {
      throw new ValidationError('Invalid notification token');
    }

    logger.info({ walletAddress, fid }, 'Registering notification token');

    const token = await notificationRepository.upsert({
      walletAddress,
      farcasterFid: fid,
      notificationUrl,
      notificationToken,
    });

    res.json({
      success: true,
      data: {
        id: token.id,
        enabled: token.enabled,
      },
    });
  })
);

/**
 * Check if user has notifications enabled
 */
router.get(
  '/status/:wallet',
  standardRateLimit,
  asyncHandler(async (req, res) => {
    const wallet = req.params.wallet;

    if (!wallet || !addressSchema.safeParse(wallet).success) {
      throw new ValidationError('Invalid wallet address');
    }

    const token = await notificationRepository.findByWallet(wallet.toLowerCase());

    res.json({
      success: true,
      data: {
        enabled: !!token?.enabled,
      },
    });
  })
);

/**
 * Admin endpoint to send a notification to a specific user
 * Requires ADMIN_API_KEY
 */
router.post(
  '/send',
  standardRateLimit,
  requireApiKey(config.adminApiKey),
  asyncHandler(async (req, res) => {
    const { fid, walletAddress, title, body, targetUrl } = req.body;

    if (!title || typeof title !== 'string') {
      throw new ValidationError('Title is required');
    }

    if (!body || typeof body !== 'string') {
      throw new ValidationError('Body is required');
    }

    const url = targetUrl || 'https://blocsteparcade.netlify.app';

    let result;
    if (fid) {
      result = await notificationService.sendToFid(fid, { title, body, targetUrl: url });
    } else if (walletAddress) {
      result = await notificationService.sendToWallet(walletAddress, { title, body, targetUrl: url });
    } else {
      throw new ValidationError('Either fid or walletAddress is required');
    }

    res.json({
      success: result.success,
      data: result,
    });
  })
);

export default router;
