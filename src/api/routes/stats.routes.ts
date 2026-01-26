import { Router } from 'express';
import { playerRepository } from '../../repositories/PlayerRepository.js';
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

// Debug endpoint to check top donors
router.get(
  '/debug/top-donors',
  standardRateLimit,
  asyncHandler(async (_req, res) => {
    const topDonors = await playerRepository.getTopByYeet(10);

    res.json({
      success: true,
      data: topDonors.map(p => ({
        walletAddress: p.walletAddress,
        totalYeeted: p.totalYeeted.toString(),
        farcasterUsername: p.farcasterUsername,
      })),
    });
  })
);

export default router;
