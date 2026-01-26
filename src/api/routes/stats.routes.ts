import { Router } from 'express';
import { playerRepository } from '../../repositories/PlayerRepository.js';
import { stakingService } from '../../services/blockchain/StakingService.js';
import { standardRateLimit } from '../middleware/rateLimit.js';
import { asyncHandler } from '../middleware/errorHandler.js';

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
  standardRateLimit,
  asyncHandler(async (_req, res) => {
    const result = await stakingService.syncAllStakingBalances();

    res.json({
      success: true,
      data: result,
    });
  })
);

export default router;
