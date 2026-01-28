import { Router } from 'express';
import { leaderboardService } from '../../services/analytics/LeaderboardService.js';
import { leaderboardImageService } from '../../services/images/LeaderboardImageService.js';
import { gameScoreRepository } from '../../repositories/GameScoreRepository.js';
import { playerRepository } from '../../repositories/PlayerRepository.js';
import { extractWalletAddress, requireWallet, loadPlayer } from '../middleware/auth.js';
import { standardRateLimit, txRateLimit } from '../middleware/rateLimit.js';
import { asyncHandler, ValidationError } from '../middleware/errorHandler.js';
import { paginationSchema, addressSchema, submitScoreSchema, VALID_GAME_IDS } from '../../types/index.js';
import type { Address, LeaderboardType, GameId } from '../../types/index.js';

const router = Router();

// Debug endpoint to check game_scores table
router.get(
  '/debug/game-scores/:gameId',
  standardRateLimit,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const { supabase } = await import('../../config/supabase.js');

    // Direct query to see what's in the table
    const { data, error, count } = await supabase
      .from('game_scores')
      .select('*', { count: 'exact' })
      .eq('game_id', gameId)
      .order('score', { ascending: false })
      .limit(10);

    res.json({
      success: true,
      debug: {
        gameId,
        error: error ? { code: error.code, message: error.message, details: error.details } : null,
        rowCount: count,
        rows: data?.map(r => ({
          id: r.id,
          wallet: r.wallet_address?.slice(0, 10) + '...',
          score: r.score,
          gameId: r.game_id,
          createdAt: r.created_at,
        })) || [],
      },
    });
  })
);

// Debug endpoint to test direct insert (no auth)
router.post(
  '/debug/test-insert/:gameId',
  standardRateLimit,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const { score, wallet } = req.body;
    const { supabase } = await import('../../config/supabase.js');

    // Try direct insert WITHOUT player_id - schema cache issue
    const { data, error } = await supabase
      .from('game_scores')
      .insert({
        wallet_address: (wallet || '0x0000000000000000000000000000000000000001').toLowerCase(),
        game_id: gameId,
        score: score || 100,
        farcaster_username: null,
        farcaster_fid: null,
      })
      .select()
      .single();

    res.json({
      success: !error,
      debug: {
        gameId,
        inserted: data,
        error: error ? { code: error.code, message: error.message, details: error.details, hint: error.hint } : null,
      },
    });
  })
);

// Game-specific image endpoint - no auth needed, cached for sharing
router.get(
  '/image/:gameId',
  standardRateLimit,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;

    // Validate gameId
    if (!gameId || !VALID_GAME_IDS.includes(gameId as GameId)) {
      throw new ValidationError(`Invalid game ID. Valid games: ${VALID_GAME_IDS.join(', ')}`);
    }

    const imageBuffer = await leaderboardImageService.generateImage(gameId as GameId);

    // Set cache headers for CDN/browser caching
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300', // 5 minute cache
    });

    res.send(imageBuffer);
  })
);

// Get game-specific leaderboard - no auth needed
router.get(
  '/game/:gameId',
  standardRateLimit,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const { limit } = paginationSchema.parse(req.query);

    // Validate gameId
    if (!gameId || !VALID_GAME_IDS.includes(gameId as GameId)) {
      throw new ValidationError(`Invalid game ID. Valid games: ${VALID_GAME_IDS.join(', ')}`);
    }

    const entries = await gameScoreRepository.getTopScores(gameId as GameId, limit);

    res.json({
      success: true,
      data: entries.map((entry) => ({
        rank: entry.rank,
        walletAddress: entry.walletAddress,
        farcasterUsername: entry.farcasterUsername,
        score: entry.score.toString(),
      })),
    });
  })
);

// Submit a game score - requires auth
router.post(
  '/game/:gameId/score',
  txRateLimit,
  extractWalletAddress,
  requireWallet,
  loadPlayer,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const { score, farcasterUsername, farcasterFid } = submitScoreSchema.parse({ ...req.body, gameId });

    // Validate gameId
    if (!gameId || !VALID_GAME_IDS.includes(gameId as GameId)) {
      throw new ValidationError(`Invalid game ID. Valid games: ${VALID_GAME_IDS.join(', ')}`);
    }

    // Get player info for Farcaster details
    const player = await playerRepository.findByWallet(req.walletAddress!);

    // Use request body Farcaster data as fallback if player record doesn't have it
    const finalFarcasterUsername = player?.farcasterUsername || farcasterUsername;
    const finalFarcasterFid = player?.farcasterFid || farcasterFid;

    const gameScore = await gameScoreRepository.submitScore(
      req.walletAddress! as Address,
      gameId as GameId,
      score,
      player?.id,
      finalFarcasterUsername,
      finalFarcasterFid
    );

    // Get player's rank after submission
    const rank = await gameScoreRepository.getPlayerRank(req.walletAddress! as Address, gameId as GameId);

    // Log the response for debugging
    const responseData = {
      id: gameScore.id,
      gameId: gameScore.gameId,
      score: gameScore.score.toString(),
      rank,
    };

    res.json({
      success: true,
      data: responseData,
    });
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
