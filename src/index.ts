import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './api/middleware/errorHandler.js';
import { eventListenerService } from './services/blockchain/EventListenerService.js';
import { leaderboardService } from './services/analytics/LeaderboardService.js';
import { supabase } from './config/supabase.js';
import { publicClient } from './config/blockchain.js';

// Import routes
import gameRoutes from './api/routes/game.routes.js';
import playerRoutes from './api/routes/player.routes.js';
import leaderboardRoutes from './api/routes/leaderboard.routes.js';
import webhookRoutes from './api/routes/webhook.routes.js';
import poolRoutes from './api/routes/pool.routes.js';
import statsRoutes from './api/routes/stats.routes.js';
import notificationRoutes from './api/routes/notification.routes.js';
import { cooldownNotificationService } from './services/notifications/CooldownNotificationService.js';

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = config.isDev
  ? '*'
  : process.env.ALLOWED_ORIGINS?.split(',') || [
      'https://blocsteparcade.netlify.app',
      'https://bloc-step-arcade.netlify.app',
    ];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
    }, 'Request completed');
  });
  next();
});

// Health check
app.get('/health', async (_req, res) => {
  let dbOk = false;
  let rpcOk = false;
  let rpcBlockNumber: string | undefined;

  try {
    const { error } = await supabase.from('players').select('id').limit(1);
    dbOk = !error;
  } catch {
    dbOk = false;
  }

  try {
    const blockNumber = await publicClient.getBlockNumber();
    rpcOk = true;
    rpcBlockNumber = blockNumber.toString();
  } catch {
    rpcOk = false;
  }

  const status = dbOk && rpcOk ? 'healthy' : 'degraded';

  res.status(status === 'healthy' ? 200 : 503).json({
    success: true,
    data: {
      status,
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      db: dbOk ? 'ok' : 'error',
      rpc: rpcOk ? 'ok' : 'error',
      ...(rpcBlockNumber && { rpcBlockNumber }),
    },
  });
});

// API routes
app.use('/api/v1/game', gameRoutes);
app.use('/api/v1/players', playerRoutes);
app.use('/api/v1/leaderboards', leaderboardRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/webhook', webhookRoutes); // Also support /webhook for Farcaster manifest compatibility
app.use('/api/v1/pool', poolRoutes);
app.use('/api/v1/stats', statsRoutes);
app.use('/api/v1/notifications', notificationRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Graceful shutdown handling
let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, 'Shutdown signal received');

  // Stop event listener
  eventListenerService.stop();

  // Stop cooldown notification service
  cooldownNotificationService.stop();

  // Give time for ongoing requests to complete
  await new Promise((resolve) => setTimeout(resolve, 5000));

  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
async function start(): Promise<void> {
  try {
    if (config.mockMode) {
      logger.info('Running in MOCK MODE - blockchain and database services disabled');
    } else {
      // Start event listener in background
      eventListenerService.start().catch((error) => {
        logger.error({ error }, 'Event listener error');
      });

      // Start cooldown notification service
      cooldownNotificationService.start();

      // Initialize leaderboards
      leaderboardService.refreshAllLeaderboards().catch((error) => {
        logger.warn({ error }, 'Initial leaderboard refresh failed');
      });

      // Schedule periodic leaderboard refresh (every 5 minutes)
      setInterval(() => {
        leaderboardService.refreshAllLeaderboards().catch((error) => {
          logger.warn({ error }, 'Scheduled leaderboard refresh failed');
        });
      }, 5 * 60 * 1000);
    }

    // Start HTTP server
    app.listen(config.port, () => {
      logger.info({ port: config.port, env: config.nodeEnv }, 'Server started');
      logger.info('Bloc Step Arcade Backend is running');
      logger.info(`Health check: http://localhost:${config.port}/health`);
      logger.info(`Game API: http://localhost:${config.port}/api/v1/game`);
      logger.info(`Player API: http://localhost:${config.port}/api/v1/players`);
      logger.info(`Leaderboard API: http://localhost:${config.port}/api/v1/leaderboards`);
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

start();

export default app;
