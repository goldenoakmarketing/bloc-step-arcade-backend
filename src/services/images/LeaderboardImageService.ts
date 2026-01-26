import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import { gameScoreRepository } from '../../repositories/GameScoreRepository.js';
import { createChildLogger } from '../../utils/logger.js';
import type { GameId } from '../../types/index.js';

const logger = createChildLogger('LeaderboardImageService');

// Image dimensions (OG image standard)
const WIDTH = 1200;
const HEIGHT = 630;

// Retro color palette
const COLORS = {
  background: '#0a0a0f',
  gradientTop: '#1a0a2e',
  gradientBottom: '#0a0a1a',
  neonPurple: '#b84dff',
  neonBlue: '#4d94ff',
  neonPink: '#ff4d94',
  neonGreen: '#4dff94',
  neonYellow: '#ffd700',
  textWhite: '#ffffff',
  textMuted: '#8888aa',
  border: '#4d4d6d',
};

// Rank colors
const RANK_COLORS = [
  COLORS.neonYellow, // 1st - Gold
  '#c0c0c0', // 2nd - Silver
  '#cd7f32', // 3rd - Bronze
  COLORS.neonPurple, // 4th
  COLORS.neonBlue, // 5th
];

// Game display names and emojis
const GAME_INFO: Record<GameId, { name: string; emoji: string }> = {
  snake: { name: 'SNAKE', emoji: '🐍' },
  ping: { name: 'PING', emoji: '🏓' },
  drbloc: { name: 'DR. BLOC', emoji: '💊' },
  solitaire: { name: 'SOLITAIRE', emoji: '🃏' },
  angryblocs: { name: 'ANGRY BLOCS', emoji: '😠' },
  hextris: { name: 'HEXTRIS', emoji: '⬡' },
  'endless-runner': { name: 'ENDLESS RUNNER', emoji: '🏃' },
  'flappy-bird': { name: 'FLAPPY BIRD', emoji: '🐦' },
  '2048': { name: '2048', emoji: '🔢' },
};

export class LeaderboardImageService {
  /**
   * Generate a game-specific leaderboard share image
   */
  async generateImage(gameId: GameId): Promise<Buffer> {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // Get game-specific leaderboard data
    const entries = await gameScoreRepository.getTopScores(gameId, 5);
    const gameInfo = GAME_INFO[gameId] || { name: gameId.toUpperCase(), emoji: '🎮' };

    // Draw background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, COLORS.gradientTop);
    gradient.addColorStop(1, COLORS.gradientBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Draw scanlines effect (retro CRT)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    for (let y = 0; y < HEIGHT; y += 4) {
      ctx.fillRect(0, y, WIDTH, 2);
    }

    // Draw pixel border
    this.drawPixelBorder(ctx, 20, 20, WIDTH - 40, HEIGHT - 40, COLORS.neonPurple);

    // Draw title with game name
    ctx.fillStyle = COLORS.neonPurple;
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('BLOC STEP ARCADE', WIDTH / 2, 80);

    // Draw game name with emoji
    ctx.fillStyle = COLORS.neonYellow;
    ctx.font = 'bold 36px monospace';
    ctx.fillText(`${gameInfo.emoji} ${gameInfo.name} ${gameInfo.emoji}`, WIDTH / 2, 130);

    // Draw subtitle
    ctx.fillStyle = COLORS.neonBlue;
    ctx.font = 'bold 24px monospace';
    ctx.fillText('[ TOP PLAYERS ]', WIDTH / 2, 170);

    // Load and draw #1 player's PFP if available
    const pfpX = 150;
    const pfpY = 210;
    const pfpSize = 160;

    const topPlayer = entries[0];
    if (topPlayer) {
      const fid = topPlayer.farcasterFid;

      if (fid) {
        try {
          const pfpUrl = await this.getFarcasterPfp(fid);
          if (pfpUrl) {
            const img = await loadImage(pfpUrl);

            ctx.save();

            // Draw border
            ctx.strokeStyle = COLORS.neonYellow;
            ctx.lineWidth = 4;
            ctx.strokeRect(pfpX - 4, pfpY - 4, pfpSize + 8, pfpSize + 8);

            // Clip to square
            ctx.beginPath();
            ctx.rect(pfpX, pfpY, pfpSize, pfpSize);
            ctx.clip();

            // Draw image
            ctx.drawImage(img, pfpX, pfpY, pfpSize, pfpSize);

            ctx.restore();

            // Draw crown above PFP
            ctx.fillStyle = COLORS.neonYellow;
            ctx.font = 'bold 28px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('* #1 *', pfpX + pfpSize / 2, pfpY - 10);
          } else {
            this.drawPlaceholderPfp(ctx, pfpX, pfpY, pfpSize);
          }
        } catch (error) {
          logger.warn({ error, fid }, 'Failed to load PFP');
          this.drawPlaceholderPfp(ctx, pfpX, pfpY, pfpSize);
        }
      } else {
        this.drawPlaceholderPfp(ctx, pfpX, pfpY, pfpSize);
      }
    } else {
      this.drawPlaceholderPfp(ctx, pfpX, pfpY, pfpSize);
    }

    // Draw leaderboard entries
    const startY = 220;
    const rowHeight = 60;
    const listX = 400;

    for (let i = 0; i < Math.min(5, entries.length); i++) {
      const entry = entries[i];
      if (!entry) continue;

      const y = startY + i * rowHeight;
      const rankColor = RANK_COLORS[i] || COLORS.textMuted;

      // Draw row background
      ctx.fillStyle = i === 0 ? 'rgba(255, 215, 0, 0.1)' : 'rgba(77, 77, 109, 0.2)';
      ctx.fillRect(listX - 10, y - 28, 700, 50);

      // Draw rank
      ctx.fillStyle = rankColor;
      ctx.font = 'bold 32px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`#${i + 1}`, listX, y);

      // Draw username
      const username = entry.farcasterUsername || this.truncateAddress(entry.walletAddress);
      ctx.fillStyle = i === 0 ? COLORS.neonYellow : COLORS.textWhite;
      ctx.font = 'bold 26px monospace';
      ctx.fillText(`@${username}`, listX + 70, y);

      // Draw score
      ctx.fillStyle = rankColor;
      ctx.font = 'bold 26px monospace';
      ctx.textAlign = 'right';
      const scoreFormatted = this.formatScore(entry.score);
      ctx.fillText(scoreFormatted, listX + 680, y);
    }

    // Draw empty slots if less than 5 entries
    for (let i = entries.length; i < 5; i++) {
      const y = startY + i * rowHeight;

      ctx.fillStyle = 'rgba(77, 77, 109, 0.1)';
      ctx.fillRect(listX - 10, y - 28, 700, 50);

      ctx.fillStyle = COLORS.textMuted;
      ctx.font = '22px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`#${i + 1}  --- empty ---`, listX, y);
    }

    // Draw footer
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('blocsteparcade.netlify.app', WIDTH / 2, HEIGHT - 45);

    // Draw decorative pixels in corners
    this.drawCornerPixels(ctx);

    return canvas.toBuffer('image/png');
  }

  private drawPixelBorder(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string
  ) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;

    // Draw main border
    ctx.strokeRect(x, y, width, height);

    // Draw pixel corners
    const pixelSize = 8;
    ctx.fillStyle = color;

    // Top-left
    ctx.fillRect(x - pixelSize, y - pixelSize, pixelSize, pixelSize);
    ctx.fillRect(x, y - pixelSize, pixelSize, pixelSize);
    ctx.fillRect(x - pixelSize, y, pixelSize, pixelSize);

    // Top-right
    ctx.fillRect(x + width, y - pixelSize, pixelSize, pixelSize);
    ctx.fillRect(x + width - pixelSize, y - pixelSize, pixelSize, pixelSize);
    ctx.fillRect(x + width, y, pixelSize, pixelSize);

    // Bottom-left
    ctx.fillRect(x - pixelSize, y + height, pixelSize, pixelSize);
    ctx.fillRect(x, y + height, pixelSize, pixelSize);
    ctx.fillRect(x - pixelSize, y + height - pixelSize, pixelSize, pixelSize);

    // Bottom-right
    ctx.fillRect(x + width, y + height, pixelSize, pixelSize);
    ctx.fillRect(x + width - pixelSize, y + height, pixelSize, pixelSize);
    ctx.fillRect(x + width, y + height - pixelSize, pixelSize, pixelSize);
  }

  private drawCornerPixels(ctx: SKRSContext2D) {
    const pixelSize = 6;
    const colors = [COLORS.neonPink, COLORS.neonBlue, COLORS.neonGreen, COLORS.neonYellow];

    // Top-left decoration
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = colors[i] ?? COLORS.neonPink;
      ctx.fillRect(40 + i * (pixelSize + 2), 40, pixelSize, pixelSize);
    }

    // Top-right decoration
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = colors[3 - i] ?? COLORS.neonPink;
      ctx.fillRect(WIDTH - 80 + i * (pixelSize + 2), 40, pixelSize, pixelSize);
    }

    // Bottom decorations
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = colors[i] ?? COLORS.neonPink;
      ctx.fillRect(40 + i * (pixelSize + 2), HEIGHT - 46, pixelSize, pixelSize);
      ctx.fillRect(WIDTH - 80 + i * (pixelSize + 2), HEIGHT - 46, pixelSize, pixelSize);
    }
  }

  private drawPlaceholderPfp(ctx: SKRSContext2D, x: number, y: number, size: number) {
    // Draw border
    ctx.strokeStyle = COLORS.neonYellow;
    ctx.lineWidth = 4;
    ctx.strokeRect(x - 4, y - 4, size + 8, size + 8);

    // Draw placeholder background
    const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
    gradient.addColorStop(0, COLORS.neonPurple);
    gradient.addColorStop(1, COLORS.neonBlue);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, size, size);

    // Draw "?" or crown
    ctx.fillStyle = COLORS.textWhite;
    ctx.font = 'bold 64px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('?', x + size / 2, y + size / 2 + 20);

    // Draw crown above
    ctx.fillStyle = COLORS.neonYellow;
    ctx.font = 'bold 28px monospace';
    ctx.fillText('* #1 *', x + size / 2, y - 10);
  }

  private async getFarcasterPfp(fid: number): Promise<string | null> {
    try {
      const apiKey = process.env.NEYNAR_API_KEY;
      if (!apiKey) {
        logger.warn('NEYNAR_API_KEY not set');
        return null;
      }

      const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
        headers: {
          api_key: apiKey,
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as { users?: Array<{ pfp_url?: string }> };
      return data.users?.[0]?.pfp_url || null;
    } catch (error) {
      logger.warn({ error, fid }, 'Failed to fetch Farcaster PFP');
      return null;
    }
  }

  private truncateAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  private formatScore(score: bigint): string {
    const num = Number(score);
    if (num >= 1_000_000_000) {
      return `${(num / 1_000_000_000).toFixed(1)}B`;
    }
    if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(1)}M`;
    }
    if (num >= 1_000) {
      return `${(num / 1_000).toFixed(1)}K`;
    }
    return num.toLocaleString();
  }
}

export const leaderboardImageService = new LeaderboardImageService();
