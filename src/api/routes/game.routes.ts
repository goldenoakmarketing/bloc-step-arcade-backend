import { Router } from 'express';
import { gameSessionService } from '../../services/game/GameSessionService.js';
import { timeConsumptionService } from '../../services/game/TimeConsumptionService.js';
import { arcadeVaultService } from '../../services/blockchain/ArcadeVaultService.js';
import { extractWalletAddress, requireWallet, loadPlayer } from '../middleware/auth.js';
import { txRateLimit, standardRateLimit } from '../middleware/rateLimit.js';
import { asyncHandler, NotFoundError, ConflictError, InsufficientBalanceError } from '../middleware/errorHandler.js';
import { startSessionSchema, consumeTimeSchema } from '../../types/index.js';
import type { Address } from '../../types/index.js';

const router = Router();

// Apply middleware to all routes
router.use(extractWalletAddress);

// Start a new game session
router.post(
  '/sessions/start',
  standardRateLimit,
  requireWallet,
  loadPlayer,
  asyncHandler(async (req, res) => {
    const { walletAddress } = startSessionSchema.parse({
      walletAddress: req.walletAddress,
    });

    try {
      const session = await gameSessionService.startSession(walletAddress as Address);

      res.status(201).json({
        success: true,
        data: {
          id: session.id,
          walletAddress: session.walletAddress,
          status: session.status,
          startedAt: session.startedAt.toISOString(),
          totalTimeConsumed: session.totalTimeConsumed.toString(),
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Active session already exists')) {
          throw new ConflictError('Active session already exists');
        }
        if (error.message.includes('Insufficient time balance')) {
          throw new InsufficientBalanceError('Insufficient time balance to start session');
        }
      }
      throw error;
    }
  })
);

// Consume time during a session
router.post(
  '/sessions/:id/consume',
  txRateLimit,
  requireWallet,
  asyncHandler(async (req, res) => {
    const sessionId = req.params.id;
    const { seconds } = consumeTimeSchema.parse(req.body);

    if (!sessionId) {
      throw new NotFoundError('Session');
    }

    // Verify session belongs to wallet
    const session = await gameSessionService.getSession(sessionId);
    if (!session) {
      throw new NotFoundError('Session');
    }

    if (session.walletAddress.toLowerCase() !== req.walletAddress?.toLowerCase()) {
      throw new NotFoundError('Session');
    }

    try {
      const consumption = await timeConsumptionService.consumeTime(sessionId, seconds);

      res.json({
        success: true,
        data: {
          consumptionId: consumption.id,
          secondsConsumed: consumption.secondsConsumed.toString(),
          txHash: consumption.txHash,
          status: consumption.status,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Insufficient')) {
        throw new InsufficientBalanceError();
      }
      throw error;
    }
  })
);

// End a game session
router.post(
  '/sessions/:id/end',
  standardRateLimit,
  requireWallet,
  asyncHandler(async (req, res) => {
    const sessionId = req.params.id;

    if (!sessionId) {
      throw new NotFoundError('Session');
    }

    // Verify session belongs to wallet
    const session = await gameSessionService.getSession(sessionId);
    if (!session) {
      throw new NotFoundError('Session');
    }

    if (session.walletAddress.toLowerCase() !== req.walletAddress?.toLowerCase()) {
      throw new NotFoundError('Session');
    }

    const endedSession = await gameSessionService.endSession(sessionId);

    res.json({
      success: true,
      data: {
        id: endedSession.id,
        status: endedSession.status,
        startedAt: endedSession.startedAt.toISOString(),
        endedAt: endedSession.endedAt?.toISOString(),
        totalTimeConsumed: endedSession.totalTimeConsumed.toString(),
      },
    });
  })
);

// Get active session
router.get(
  '/sessions/active',
  standardRateLimit,
  requireWallet,
  asyncHandler(async (req, res) => {
    const session = await gameSessionService.getActiveSession(req.walletAddress!);

    if (!session) {
      res.json({
        success: true,
        data: null,
      });
      return;
    }

    // Get current balance
    const balance = await arcadeVaultService.getTimeBalance(req.walletAddress!);

    res.json({
      success: true,
      data: {
        id: session.id,
        walletAddress: session.walletAddress,
        status: session.status,
        startedAt: session.startedAt.toISOString(),
        totalTimeConsumed: session.totalTimeConsumed.toString(),
        lastConsumptionAt: session.lastConsumptionAt?.toISOString(),
        currentBalance: balance.toString(),
      },
    });
  })
);

// Get session by ID
router.get(
  '/sessions/:id',
  standardRateLimit,
  asyncHandler(async (req, res) => {
    const sessionId = req.params.id;

    if (!sessionId) {
      throw new NotFoundError('Session');
    }

    const session = await gameSessionService.getSession(sessionId);
    if (!session) {
      throw new NotFoundError('Session');
    }

    res.json({
      success: true,
      data: {
        id: session.id,
        walletAddress: session.walletAddress,
        status: session.status,
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt?.toISOString(),
        totalTimeConsumed: session.totalTimeConsumed.toString(),
        lastConsumptionAt: session.lastConsumptionAt?.toISOString(),
      },
    });
  })
);

// Get session history
router.get(
  '/sessions',
  standardRateLimit,
  requireWallet,
  asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const sessions = await gameSessionService.getSessionsByPlayer(
      req.walletAddress!,
      limit
    );

    res.json({
      success: true,
      data: sessions.map((session) => ({
        id: session.id,
        status: session.status,
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt?.toISOString(),
        totalTimeConsumed: session.totalTimeConsumed.toString(),
      })),
    });
  })
);

export default router;
