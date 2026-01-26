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
    const [totalPlayers, totalDonated] = await Promise.all([
      playerRepository.count(),
      playerRepository.getTotalDonated(),
    ]);

    res.json({
      success: true,
      data: {
        totalPlayers,
        totalDonated: Number(totalDonated),
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

// Debug: Get staked balance for a wallet
router.get(
  '/debug/staked/:wallet',
  standardRateLimit,
  asyncHandler(async (req, res) => {
    const wallet = req.params.wallet;
    const balance = await stakingService.getStakedBalance(wallet as `0x${string}`);

    res.json({
      success: true,
      data: {
        wallet,
        stakedBalance: balance.toString(),
        stakedBalanceFormatted: (Number(balance) / 1e18).toFixed(2),
      },
    });
  })
);

export default router;
