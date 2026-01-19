import type { Request, Response, NextFunction } from 'express';
import { createChildLogger } from '../../utils/logger.js';
import { playerRepository } from '../../repositories/PlayerRepository.js';
import type { Address } from '../../types/index.js';

const logger = createChildLogger('AuthMiddleware');

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      walletAddress?: Address;
      playerId?: string;
    }
  }
}

export function extractWalletAddress(req: Request, _res: Response, next: NextFunction): void {
  // Try to get wallet from header first
  const walletHeader = req.headers['x-wallet-address'] as string | undefined;

  // Or from query param
  const walletQuery = req.query.wallet as string | undefined;

  // Or from route param
  const walletParam = req.params.wallet as string | undefined;

  const wallet = walletHeader || walletQuery || walletParam;

  if (wallet && /^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    req.walletAddress = wallet.toLowerCase() as Address;
  }

  next();
}

export function requireWallet(req: Request, res: Response, next: NextFunction): void {
  if (!req.walletAddress) {
    res.status(401).json({
      success: false,
      error: 'Wallet address required',
      message: 'Provide wallet address via X-Wallet-Address header or wallet query parameter',
    });
    return;
  }

  next();
}

export async function loadPlayer(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.walletAddress) {
    next();
    return;
  }

  try {
    const player = await playerRepository.findByWallet(req.walletAddress);
    if (player) {
      req.playerId = player.id;
    }
  } catch (error) {
    logger.error({ error, wallet: req.walletAddress }, 'Error loading player');
  }

  next();
}

export function requirePlayer(req: Request, res: Response, next: NextFunction): void {
  if (!req.playerId) {
    res.status(404).json({
      success: false,
      error: 'Player not found',
      message: 'No player found for the provided wallet address',
    });
    return;
  }

  next();
}

// Basic API key auth for webhook endpoints
export function requireApiKey(apiKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const providedKey = req.headers['x-api-key'] as string | undefined;

    if (!providedKey || providedKey !== apiKey) {
      res.status(401).json({
        success: false,
        error: 'Invalid API key',
      });
      return;
    }

    next();
  };
}
