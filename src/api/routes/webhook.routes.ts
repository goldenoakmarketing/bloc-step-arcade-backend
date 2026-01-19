import { Router } from 'express';
import { createChildLogger } from '../../utils/logger.js';
import { neynarClient } from '../../services/farcaster/NeynarClient.js';
import { tipCommandService } from '../../services/farcaster/TipCommandService.js';
import { webhookRateLimit } from '../middleware/rateLimit.js';
import { asyncHandler, UnauthorizedError } from '../middleware/errorHandler.js';

const router = Router();
const logger = createChildLogger('WebhookRoutes');

// Neynar webhook types
interface NeynarWebhookPayload {
  type: string;
  data: {
    hash: string;
    author: {
      fid: number;
      username: string;
    };
    text: string;
    timestamp: string;
    mentioned_profiles?: Array<{
      fid: number;
      username: string;
    }>;
    parent_hash?: string;
  };
}

// Farcaster webhook (Neynar)
router.post(
  '/farcaster',
  webhookRateLimit,
  asyncHandler(async (req, res) => {
    // Verify webhook signature
    const signature = req.headers['x-neynar-signature'] as string | undefined;
    const rawBody = JSON.stringify(req.body);

    if (signature && !neynarClient.verifyWebhookSignature(rawBody, signature)) {
      logger.warn('Invalid webhook signature');
      throw new UnauthorizedError('Invalid webhook signature');
    }

    const payload = req.body as NeynarWebhookPayload;

    logger.info(
      { type: payload.type, castHash: payload.data?.hash },
      'Received Farcaster webhook'
    );

    // Handle different webhook types
    switch (payload.type) {
      case 'cast.created':
        await handleCastCreated(payload);
        break;

      case 'cast.mention':
        await handleMention(payload);
        break;

      default:
        logger.debug({ type: payload.type }, 'Unhandled webhook type');
    }

    res.json({ success: true, message: 'Webhook processed' });
  })
);

async function handleCastCreated(payload: NeynarWebhookPayload): Promise<void> {
  const { data } = payload;

  // Check if it's a tip command
  if (data.text.includes('/tip')) {
    logger.info({ castHash: data.hash, author: data.author.username }, 'Processing tip command');

    try {
      const tip = await tipCommandService.processTipFromCast(data.hash);

      if (tip) {
        logger.info({ tipId: tip.id, txHash: tip.txHash }, 'Tip processed successfully');
      } else {
        logger.debug({ castHash: data.hash }, 'Tip command not valid or failed');
      }
    } catch (error) {
      logger.error({ error, castHash: data.hash }, 'Error processing tip command');
    }
  }
}

async function handleMention(payload: NeynarWebhookPayload): Promise<void> {
  const { data } = payload;

  logger.info(
    { castHash: data.hash, author: data.author.username },
    'Bot mentioned in cast'
  );

  // Check for tip command in mentions
  if (data.text.includes('/tip')) {
    try {
      const tip = await tipCommandService.processTipFromCast(data.hash);

      if (tip) {
        logger.info({ tipId: tip.id }, 'Tip from mention processed');
      }
    } catch (error) {
      logger.error({ error, castHash: data.hash }, 'Error processing tip from mention');
    }
  }
}

// Health check for webhooks
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
      },
    });
  })
);

export default router;
