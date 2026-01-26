import { Router } from 'express';
import { leaderboardService } from '../../services/analytics/LeaderboardService.js';
import { leaderboardImageService } from '../../services/images/LeaderboardImageService.js';
import { extractWalletAddress } from '../middleware/auth.js';
import { standardRateLimit } from '../middleware/rateLimit.js';
import { asyncHandler, ValidationError } from '../middleware/errorHandler.js';
import { paginationSchema, addressSchema } from '../../types/index.js';
import type { Address, LeaderboardType } from '../../types/index.js';

const router = Router();

// Image endpoint - no auth needed, cached for sharing
router.get(
  '/image',
  standardRateLimit,
  asyncHandler(async (req, res) => {
    const imageBuffer = await leaderboardImageService.generateImage('yeet');

    // Set cache headers for CDN/browser caching
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300', // 5 minute cache
    });

    res.send(imageBuffer);
  })
);

router.use(extractWalletAddress);

// Get yeet leaderboard
router.get(
  '/yeet',
  standardRateLimit,
  asyncHandler(async (req, res) => {
    const { limit } = paginationSchema.parse(req.query);

    const entries = await leaderboardService.getYeetLeaderboard(limit);

    res.json({
      success: true,
      data: entries.map((entry) => ({
        rank: entry.rank,
        walletAddress: entry.walletAddress,
        farcasterUsername: entry.farcasterUsername,
        score: entry.score.toString(),
        metadata: entry.metadata,
      })),
    });
  })
);

// Get staking leaderboard
router.get(
  '/staking',
  standardRateLimit,
  asyncHandler(async (req, res) => {
    const { limit } = paginationSchema.parse(req.query);

    const entries = await leaderboardService.getStakingLeaderboard(limit);

    res.json({
      success: true,
      data: entries.map((entry) => ({
        rank: entry.rank,
        walletAddress: entry.walletAddress,
        farcasterUsername: entry.farcasterUsername,
        score: entry.score.toString(),
        metadata: entry.metadata,
      })),
    });
  })
);

// Get time played leaderboard
router.get(
  '/time-played',
  standardRateLimit,
  asyncHandler(async (req, res) => {
    const { limit } = paginationSchema.parse(req.query);

    const entries = await leaderboardService.getTimePlayedLeaderboard(limit);

    res.json({
      success: true,
      data: entries.map((entry) => ({
        rank: entry.rank,
        walletAddress: entry.walletAddress,
        farcasterUsername: entry.farcasterUsername,
        score: entry.score.toString(),
        scoreFormatted: formatDuration(Number(entry.score)),
        metadata: entry.metadata,
      })),
    });
  })
);

// Get tips sent leaderboard
router.get(
  '/tips-sent',
  standardRateLimit,
  asyncHandler(async (req, res) => {
    const { limit } = paginationSchema.parse(req.query);

    const entries = await leaderboardService.getTipsSentLeaderboard(limit);

    res.json({
      success: true,
      data: entries.map((entry) => ({
        rank: entry.rank,
        walletAddress: entry.walletAddress,
        farcasterUsername: entry.farcasterUsername,
        score: entry.score.toString(),
        metadata: entry.metadata,
      })),
    });
  })
);

// Get tips received leaderboard
router.get(
  '/tips-received',
  standardRateLimit,
  asyncHandler(async (req, res) => {
    const { limit } = paginationSchema.parse(req.query);

    const entries = await leaderboardService.getTipsReceivedLeaderboard(limit);

    res.json({
      success: true,
      data: entries.map((entry) => ({
        rank: entry.rank,
        walletAddress: entry.walletAddress,
        farcasterUsername: entry.farcasterUsername,
        score: entry.score.toString(),
        metadata: entry.metadata,
      })),
    });
  })
);

// Get player rank in a specific leaderboard
router.get(
  '/:type/rank/:wallet',
  standardRateLimit,
  asyncHandler(async (req, res) => {
    const { type, wallet } = req.params;

    if (!wallet || !addressSchema.safeParse(wallet).success) {
      throw new ValidationError('Invalid wallet address');
    }

    const validTypes: LeaderboardType[] = ['yeet', 'staking', 'time_played', 'tips_sent', 'tips_received'];
    if (!type || !validTypes.includes(type as LeaderboardType)) {
      throw new ValidationError('Invalid leaderboard type');
    }

    const entry = await leaderboardService.getPlayerRank(
      type as LeaderboardType,
      wallet.toLowerCase() as Address
    );

    if (!entry) {
      res.json({
        success: true,
        data: null,
        message: 'Player not ranked in this leaderboard',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        rank: entry.rank,
        walletAddress: entry.walletAddress,
        farcasterUsername: entry.farcasterUsername,
        score: entry.score.toString(),
        leaderboardType: type,
      },
    });
  })
);

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export default router;
