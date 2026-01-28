import { Router } from 'express';
import { playerRepository } from '../../repositories/PlayerRepository.js';
import { stakingService } from '../../services/blockchain/StakingService.js';
import { leaderboardService } from '../../services/analytics/LeaderboardService.js';
import { standardRateLimit } from '../middleware/rateLimit.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireApiKey } from '../middleware/auth.js';
import { config } from '../../config/index.js';

const router = Router();

// Get total donated quarters
router.get(
  '/total-donated',
  standardRateLimit,
  asyncHandler(async (_req, res) => {
    const totalDonated = await playerRepository.getTotalDonated();

    res.json({
      success: true,
      data: {
        totalDonated: Number(totalDonated),
      },
    });
  })
);

// Get general stats overview
router.get(
  '/',
  standardRateLimit,
  asyncHandler(async (_req, res) => {
    const [totalPlayers, totalDonated, totalStaked, totalTimePlayed] = await Promise.all([
      playerRepository.count(),
      playerRepository.getTotalDonated(),
      playerRepository.getTotalStaked(),
      playerRepository.getTotalTimePlayed(),
    ]);

    res.json({
      success: true,
      data: {
        totalPlayers,
        totalDonated: Number(totalDonated),
        totalStaked: Number(totalStaked),
        totalTimePlayed: Number(totalTimePlayed),
      },
    });
  })
);

// Sync staking balances from blockchain
router.post(
  '/sync-staking',
  requireApiKey(config.adminApiKey),
  standardRateLimit,
  asyncHandler(async (req, res) => {
    const resetFirst = req.query.reset === 'true';
    const result = await stakingService.syncAllStakingBalances(resetFirst);

    res.json({
      success: true,
      data: result,
    });
  })
);

// Refresh all leaderboard caches
router.post(
  '/refresh-leaderboards',
  requireApiKey(config.adminApiKey),
  standardRateLimit,
  asyncHandler(async (_req, res) => {
    await leaderboardService.refreshAllLeaderboards();

    res.json({
      success: true,
      message: 'All leaderboards refreshed',
    });
  })
);

// Full sync: sync staking + refresh leaderboards
router.post(
  '/full-sync',
  requireApiKey(config.adminApiKey),
  standardRateLimit,
  asyncHandler(async (_req, res) => {
    // First sync staking balances from blockchain
    const stakingResult = await stakingService.syncAllStakingBalances();

    // Then refresh all leaderboards
    await leaderboardService.refreshAllLeaderboards();

    res.json({
      success: true,
      data: {
        stakingSync: stakingResult,
        message: 'Full sync completed',
      },
    });
  })
);

export default router;
