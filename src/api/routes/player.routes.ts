import { Router } from 'express';
import { playerRepository } from '../../repositories/PlayerRepository.js';
import { arcadeVaultService } from '../../services/blockchain/ArcadeVaultService.js';
import { stakingService } from '../../services/blockchain/StakingService.js';
import { extractWalletAddress, loadPlayer } from '../middleware/auth.js';
import { standardRateLimit, strictRateLimit } from '../middleware/rateLimit.js';
import { asyncHandler, NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import { linkFarcasterSchema, addressSchema } from '../../types/index.js';
import type { Address } from '../../types/index.js';

const router = Router();

router.use(extractWalletAddress);
router.use(loadPlayer);

// Get player profile by wallet
router.get(
  '/:wallet',
  standardRateLimit,
  asyncHandler(async (req, res) => {
    const wallet = req.params.wallet;

    if (!wallet || !addressSchema.safeParse(wallet).success) {
      throw new ValidationError('Invalid wallet address');
    }

    const player = await playerRepository.findOrCreate(wallet.toLowerCase() as Address);

    // Get fresh balances from chain
    const [timeBalance, stakedBalance] = await Promise.all([
      arcadeVaultService.getTimeBalance(player.walletAddress),
      stakingService.getStakedBalance(player.walletAddress),
    ]);

    // Update cached staked balance if it changed
    if (stakedBalance !== player.cachedStakedBalance) {
      await playerRepository.updateCachedStakedBalance(player.walletAddress, stakedBalance);
    }

    res.json({
      success: true,
      data: {
        id: player.id,
        walletAddress: player.walletAddress,
        farcasterFid: player.farcasterFid,
        farcasterUsername: player.farcasterUsername,
        timeBalance: timeBalance.toString(),
        cachedStakedBalance: stakedBalance.toString(),
        stats: {
          totalTimePurchased: player.totalTimePurchased.toString(),
          totalTimeConsumed: player.totalTimeConsumed.toString(),
          totalYeeted: player.totalYeeted.toString(),
          totalTipsSent: player.totalTipsSent.toString(),
          totalTipsReceived: player.totalTipsReceived.toString(),
        },
        createdAt: player.createdAt.toISOString(),
      },
    });
  })
);

// Get player time balance
router.get(
  '/:wallet/balance',
  standardRateLimit,
  asyncHandler(async (req, res) => {
    const wallet = req.params.wallet;

    if (!wallet || !addressSchema.safeParse(wallet).success) {
      throw new ValidationError('Invalid wallet address');
    }

    const balance = await arcadeVaultService.getTimeBalance(wallet.toLowerCase() as Address);

    res.json({
      success: true,
      data: {
        walletAddress: wallet.toLowerCase(),
        timeBalance: balance.toString(),
        timeBalanceSeconds: Number(balance),
        timeBalanceFormatted: formatDuration(Number(balance)),
      },
    });
  })
);

// Link Farcaster account to wallet
router.post(
  '/link-farcaster',
  strictRateLimit,
  asyncHandler(async (req, res) => {
    const { walletAddress, fid, username } = linkFarcasterSchema.parse(req.body);

    // Check if FID is already linked to another wallet
    const existingByFid = await playerRepository.findByFid(fid);
    if (existingByFid && existingByFid.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new ValidationError('Farcaster account already linked to another wallet');
    }

    const player = await playerRepository.linkFarcaster(
      walletAddress as Address,
      fid,
      username
    );

    res.json({
      success: true,
      data: {
        id: player.id,
        walletAddress: player.walletAddress,
        farcasterFid: player.farcasterFid,
        farcasterUsername: player.farcasterUsername,
      },
      message: 'Farcaster account linked successfully',
    });
  })
);

// Get player stats
router.get(
  '/:wallet/stats',
  standardRateLimit,
  asyncHandler(async (req, res) => {
    const wallet = req.params.wallet;

    if (!wallet || !addressSchema.safeParse(wallet).success) {
      throw new ValidationError('Invalid wallet address');
    }

    const player = await playerRepository.findOrCreate(wallet.toLowerCase() as Address);

    // Get fresh balances from chain
    const [timeBalance, stakedBalance] = await Promise.all([
      arcadeVaultService.getTimeBalance(player.walletAddress),
      stakingService.getStakedBalance(player.walletAddress),
    ]);

    // Update cached staked balance if it changed
    if (stakedBalance !== player.cachedStakedBalance) {
      await playerRepository.updateCachedStakedBalance(player.walletAddress, stakedBalance);
    }

    res.json({
      success: true,
      data: {
        walletAddress: player.walletAddress,
        timeBalance: timeBalance.toString(),
        stakedBalance: stakedBalance.toString(),
        totalTimePurchased: player.totalTimePurchased.toString(),
        totalTimeConsumed: player.totalTimeConsumed.toString(),
        totalYeeted: player.totalYeeted.toString(),
        totalTipsSent: player.totalTipsSent.toString(),
        totalTipsReceived: player.totalTipsReceived.toString(),
        memberSince: player.createdAt.toISOString(),
      },
    });
  })
);

// Helper function to format duration
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
