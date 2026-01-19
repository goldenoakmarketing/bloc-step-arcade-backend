import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { createChildLogger } from '../../utils/logger.js';

const logger = createChildLogger('RateLimitMiddleware');

// Key generator that uses wallet address if available
const keyGenerator = (req: Request): string => {
  return req.walletAddress || req.ip || 'unknown';
};

// Standard rate limit for most endpoints
export const standardRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  keyGenerator,
  handler: (req: Request, res: Response) => {
    logger.warn({ key: keyGenerator(req), path: req.path }, 'Rate limit exceeded');
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      message: 'Please slow down and try again later',
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limit for expensive operations
export const strictRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  keyGenerator,
  handler: (req: Request, res: Response) => {
    logger.warn({ key: keyGenerator(req), path: req.path }, 'Strict rate limit exceeded');
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      message: 'This operation is rate limited. Please try again later.',
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Very strict rate limit for blockchain transactions
export const txRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 transactions per minute
  keyGenerator,
  handler: (req: Request, res: Response) => {
    logger.warn({ key: keyGenerator(req), path: req.path }, 'Transaction rate limit exceeded');
    res.status(429).json({
      success: false,
      error: 'Transaction rate limit exceeded',
      message: 'Too many transactions. Please wait before submitting more.',
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Webhook rate limit (based on IP only)
export const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  keyGenerator: (req: Request) => req.ip || 'unknown',
  handler: (req: Request, res: Response) => {
    logger.warn({ ip: req.ip, path: req.path }, 'Webhook rate limit exceeded');
    res.status(429).json({
      success: false,
      error: 'Webhook rate limit exceeded',
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});
