import { Router } from 'express';
import { lostFoundPoolService } from '../../services/blockchain/LostFoundPoolService.js';
import { playerRepository } from '../../repositories/PlayerRepository.js';
import { extractWalletAddress, requireWallet } from '../middleware/auth.js';
import { strictRateLimit, standardRateLimit } from '../middleware/rateLimit.js';
import { asyncHandler, ValidationError } from '../middleware/errorHandler.js';
import { addressSchema } from '../../types/index.js';

const router = Router();

router.use(extractWalletAddress);

// Get pool stats (public)
router.get(
  '/stats',
  standardRateLimit,
  asyncHandler(async (_req, res) => {
    const stats = await lostFoundPoolService.getPoolStats();

    res.json({
      success: true,
      data: {
        balance: stats.balance,
        totalReceived: stats.totalReceived,
        totalClaimed: stats.totalClaimed,
        totalOverflow: stats.totalOverflow,
        contractBalance: stats.contractBalance,
        contractQuarters: stats.contractQuarters,
      },
    });
  })
);

// Get claim info for a wallet
router.get(
  '/claim-info/:wallet',
  standardRateLimit,
  asyncHandler(async (req, res) => {
    const wallet = req.params.wallet;

    if (!wallet || !addressSchema.safeParse(wallet).success) {
      throw new ValidationError('Invalid wallet address');
    }

    const claimInfo = await lostFoundPoolService.getClaimInfo(wallet.toLowerCase());

    res.json({
      success: true,
      data: {
        canClaim: claimInfo.canClaim,
        nextClaimTime: claimInfo.nextClaimTime?.toISOString(),
        streak: claimInfo.streak,
        maxClaimable: claimInfo.maxClaimable,
        totalClaimed: claimInfo.totalClaimed,
      },
    });
  })
);

// Claim from pool (requires wallet)
router.post(
  '/claim',
  strictRateLimit,
  requireWallet,
  asyncHandler(async (req, res) => {
    const walletAddress = req.walletAddress!;

    const result = await lostFoundPoolService.claimFromPool(walletAddress);

    if (result.cooldownActive) {
      res.status(429).json({
        success: false,
        error: 'Cooldown active',
        data: {
          claimed: 0,
          poolBalanceAfter: result.poolBalanceAfter,
          streak: result.streak,
          nextClaimTime: result.nextClaimTime.toISOString(),
          cooldownActive: true,
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        claimed: result.claimed,
        poolBalanceAfter: result.poolBalanceAfter,
        streak: result.streak,
        nextClaimTime: result.nextClaimTime.toISOString(),
        txHash: result.txHash,
      },
    });
  })
);

// Deposit to pool (voluntary donation)
router.post(
  '/deposit',
  standardRateLimit,
  asyncHandler(async (req, res) => {
    const { walletAddress, quarters, txHash } = req.body;

    if (!walletAddress || !addressSchema.safeParse(walletAddress).success) {
      throw new ValidationError('Invalid wallet address');
    }

    if (!quarters || typeof quarters !== 'number' || quarters < 1) {
      throw new ValidationError('Invalid quarters amount');
    }

    if (!txHash || typeof txHash !== 'string') {
      throw new ValidationError('Invalid transaction hash');
    }

    const result = await lostFoundPoolService.processVoluntaryDonation(quarters);

    // Track donation in player stats
    await playerRepository.incrementYeeted(walletAddress.toLowerCase(), quarters);

    res.json({
      success: true,
      data: {
        addedToPool: result.addedToPool,
        overflowToStaking: result.overflowToStaking,
        overflowToProfit: result.overflowToProfit,
        walletAddress: walletAddress.toLowerCase(),
        txHash,
      },
    });
  })
);

export default router;
