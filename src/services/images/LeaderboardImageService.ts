import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';
import { gameScoreRepository } from '../../repositories/GameScoreRepository.js';
import { gameChampionRepository } from '../../repositories/GameChampionRepository.js';
import { createChildLogger } from '../../utils/logger.js';
import type { GameId } from '../../types/index.js';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const logger = createChildLogger('LeaderboardImageService');

// Font configuration
const FONT_NAME = 'CustomMono';
let fontRegistered = false;

// Download and register a font from URL
const registerFontFromUrl = async (url: string, fontName: string): Promise<boolean> => {
  try {
    logger.info({ url, fontName }, 'Downloading font...');

    const response = await fetch(url);
    if (!response.ok) {
      logger.error({ status: response.status }, 'Failed to download font');
      return false;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Save to temp file (GlobalFonts.register needs a path or buffer)
    const tempDir = join(tmpdir(), 'bloc-fonts');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }

    const fontPath = join(tempDir, `${fontName}.ttf`);
    writeFileSync(fontPath, buffer);

    // Register the font
    GlobalFonts.registerFromPath(fontPath, fontName);
    logger.info({ fontName, fontPath }, 'Font registered successfully');

    return true;
  } catch (error) {
    logger.error({ error }, 'Failed to register font from URL');
    return false;
  }
};

// Check available fonts and register if needed
const initFonts = async (): Promise<boolean> => {
  try {
    // Log available font families for debugging
    const families = GlobalFonts.families;
    const familyNames = families.map(f => f.family);
    logger.info({ fontCount: families.length }, 'Font initialization starting');

    if (families.length > 0) {
      logger.info({ fonts: familyNames.slice(0, 20) }, 'Available system fonts (first 20)');
    } else {
      logger.warn('No system fonts detected by @napi-rs/canvas');
    }

    // Check for usable fonts by category
    const monoFonts = familyNames.filter(f => f.toLowerCase().includes('mono'));
    const sansFonts = familyNames.filter(f => f.toLowerCase().includes('sans') || f.toLowerCase().includes('arial'));
    const courierFonts = familyNames.filter(f => f.toLowerCase().includes('courier'));
    const dejavuFonts = familyNames.filter(f => f.toLowerCase().includes('dejavu'));

    logger.info({
      monoFonts: monoFonts.slice(0, 5),
      sansFonts: sansFonts.slice(0, 5),
      courierFonts,
      dejavuFonts,
    }, 'Font categories found');

    const hasUsableFont = monoFonts.length > 0 || sansFonts.length > 0 ||
      courierFonts.length > 0 || dejavuFonts.length > 0;

    if (!hasUsableFont || families.length === 0) {
      logger.warn('No usable fonts found, downloading fallback font...');

      // Download Roboto Mono from Google Fonts (static TTF)
      // Using a direct GitHub raw URL for a monospace font
      const fontUrl = 'https://github.com/googlefonts/RobotoMono/raw/main/fonts/ttf/RobotoMono-Bold.ttf';

      fontRegistered = await registerFontFromUrl(fontUrl, FONT_NAME);

      if (fontRegistered) {
        logger.info({ fontName: FONT_NAME }, 'Fallback font downloaded and registered successfully');
      } else {
        logger.error('Failed to register fallback font - text rendering will use canvas defaults');
      }
    } else {
      const selectedFont = monoFonts[0] || courierFonts[0] || dejavuFonts[0] || sansFonts[0];
      logger.info({ selectedFont, fallbackChain: getFontFamily() }, 'Using system fonts');
    }

    // Log final font configuration
    logger.info({
      fontRegistered,
      fontFamily: getFontFamily(),
      totalFontsAvailable: families.length,
    }, 'Font initialization complete');

    return true;
  } catch (error) {
    logger.error({
      error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    }, 'Font initialization failed - images will render with default canvas fonts');
    return false;
  }
};

// Initialize fonts (called lazily on first image generation)
let fontsInitialized = false;
const ensureFontsInitialized = async () => {
  if (!fontsInitialized) {
    await initFonts();
    fontsInitialized = true;
  }
};

// Use registered font if available, otherwise fall back to system fonts
const getFontFamily = () => {
  if (fontRegistered) {
    return FONT_NAME;
  }
  // Fall back through multiple options
  return 'DejaVu Sans Mono, Liberation Mono, Noto Sans Mono, Courier New, Courier, sans-serif';
};

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
  breakout: { name: 'BREAKOUT', emoji: '🧱' },
};

export class LeaderboardImageService {
  /**
   * Generate a game-specific leaderboard share image
   */
  async generateImage(gameId: GameId): Promise<Buffer> {
    // Ensure fonts are loaded before drawing
    await ensureFontsInitialized();
    logger.info({ fontFamily: getFontFamily(), gameId }, 'Starting image generation');

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // Get game-specific leaderboard data
    const entries = await gameScoreRepository.getTopScores(gameId, 5);
    logger.info({
      gameId,
      entriesCount: entries.length,
      entries: entries.map(e => ({
        rank: e.rank,
        wallet: e.walletAddress?.slice(0, 10),
        score: e.score?.toString(),
        username: e.farcasterUsername
      }))
    }, 'Fetched entries for image');

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
    ctx.font = `bold 48px ${getFontFamily()}`;
    ctx.textAlign = 'center';
    ctx.fillText('BLOC STEP ARCADE', WIDTH / 2, 80);
    logger.debug('Drew title text');

    // Draw game name (without emoji - emojis may not render on server)
    ctx.fillStyle = COLORS.neonYellow;
    ctx.font = `bold 36px ${getFontFamily()}`;
    ctx.fillText(`[ ${gameInfo.name} ]`, WIDTH / 2, 130);

    // Draw subtitle
    ctx.fillStyle = COLORS.neonBlue;
    ctx.font = `bold 24px ${getFontFamily()}`;
    ctx.fillText('TOP PLAYERS', WIDTH / 2, 170);

    // Load and draw #1 player's PFP if available
    const pfpX = 150;
    const pfpY = 210;
    const pfpSize = 160;

    // Try to get champion PFP from cached game_champions table first
    const champion = await gameChampionRepository.getChampion(gameId);
    const pfpUrl = champion?.farcasterPfp;
    logger.info({
      gameId,
      hasChampion: !!champion,
      championWallet: champion?.walletAddress?.slice(0, 10),
      championScore: champion?.score?.toString(),
      hasPfp: !!pfpUrl,
      pfpUrl: pfpUrl,
      pfpUrlLength: pfpUrl?.length
    }, 'Champion data for image');

    if (pfpUrl) {
      try {
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
        ctx.font = `bold 28px ${getFontFamily()}`;
        ctx.textAlign = 'center';
        ctx.fillText('* #1 *', pfpX + pfpSize / 2, pfpY - 10);
      } catch (error) {
        logger.warn({
          error: error instanceof Error ? error.message : String(error),
          pfpUrl,
          pfpUrlLength: pfpUrl?.length
        }, 'Failed to load champion PFP');
        await this.drawPlaceholderPfp(ctx, pfpX, pfpY, pfpSize);
      }
    } else {
      // Fall back to fetching from API if no cached PFP
      const topPlayer = entries[0];
      if (topPlayer?.farcasterFid) {
        try {
          const fetchedPfpUrl = await this.getFarcasterPfp(topPlayer.farcasterFid);
          if (fetchedPfpUrl) {
            const img = await loadImage(fetchedPfpUrl);

            ctx.save();
            ctx.strokeStyle = COLORS.neonYellow;
            ctx.lineWidth = 4;
            ctx.strokeRect(pfpX - 4, pfpY - 4, pfpSize + 8, pfpSize + 8);
            ctx.beginPath();
            ctx.rect(pfpX, pfpY, pfpSize, pfpSize);
            ctx.clip();
            ctx.drawImage(img, pfpX, pfpY, pfpSize, pfpSize);
            ctx.restore();

            ctx.fillStyle = COLORS.neonYellow;
            ctx.font = `bold 28px ${getFontFamily()}`;
            ctx.textAlign = 'center';
            ctx.fillText('* #1 *', pfpX + pfpSize / 2, pfpY - 10);

            // Update the champion record with the PFP for next time
            if (topPlayer) {
              await gameChampionRepository.updateChampion(
                gameId,
                topPlayer.walletAddress,
                topPlayer.score,
                topPlayer.farcasterFid,
                topPlayer.farcasterUsername,
                fetchedPfpUrl
              );
            }
          } else {
            await this.drawPlaceholderPfp(ctx, pfpX, pfpY, pfpSize);
          }
        } catch (error) {
          logger.warn({ error }, 'Failed to load PFP from API');
          await this.drawPlaceholderPfp(ctx, pfpX, pfpY, pfpSize);
        }
      } else {
        await this.drawPlaceholderPfp(ctx, pfpX, pfpY, pfpSize);
      }
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
      ctx.font = `bold 32px ${getFontFamily()}`;
      ctx.textAlign = 'left';
      ctx.fillText(`#${i + 1}`, listX, y);

      // Draw username
      const username = entry.farcasterUsername || this.truncateAddress(entry.walletAddress);
      ctx.fillStyle = i === 0 ? COLORS.neonYellow : COLORS.textWhite;
      ctx.font = `bold 26px ${getFontFamily()}`;
      ctx.fillText(`@${username}`, listX + 70, y);

      // Draw score
      ctx.fillStyle = rankColor;
      ctx.font = `bold 26px ${getFontFamily()}`;
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
      ctx.font = `22px ${getFontFamily()}`;
      ctx.textAlign = 'left';
      ctx.fillText(`#${i + 1}  --- empty ---`, listX, y);
    }

    // Draw footer with app URL (prominent for sharing)
    ctx.fillStyle = COLORS.neonPurple;
    ctx.font = `bold 20px ${getFontFamily()}`;
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

  private async drawPlaceholderPfp(ctx: SKRSContext2D, x: number, y: number, size: number) {
    // Default arcade cabinet image URL (hosted on GitHub)
    const defaultPfpUrl = 'https://raw.githubusercontent.com/goldenoakmarketing/bloc-step-arcade-frontend/main/public/arcade-cabinet.jpg';

    try {
      // Try to load the arcade cabinet image
      const img = await loadImage(defaultPfpUrl);

      ctx.save();

      // Draw border
      ctx.strokeStyle = COLORS.neonYellow;
      ctx.lineWidth = 4;
      ctx.strokeRect(x - 4, y - 4, size + 8, size + 8);

      // Clip to square
      ctx.beginPath();
      ctx.rect(x, y, size, size);
      ctx.clip();

      // Draw image (centered and covering)
      ctx.drawImage(img, x, y, size, size);

      ctx.restore();

      // Draw crown above
      ctx.fillStyle = COLORS.neonYellow;
      ctx.font = `bold 28px ${getFontFamily()}`;
      ctx.textAlign = 'center';
      ctx.fillText('* #1 *', x + size / 2, y - 10);
    } catch (error) {
      logger.warn({ error }, 'Failed to load default PFP image, using fallback');

      // Fallback to gradient background with "?"
      ctx.strokeStyle = COLORS.neonYellow;
      ctx.lineWidth = 4;
      ctx.strokeRect(x - 4, y - 4, size + 8, size + 8);

      const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
      gradient.addColorStop(0, COLORS.neonPurple);
      gradient.addColorStop(1, COLORS.neonBlue);
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, size, size);

      ctx.fillStyle = COLORS.textWhite;
      ctx.font = `bold 64px ${getFontFamily()}`;
      ctx.textAlign = 'center';
      ctx.fillText('?', x + size / 2, y + size / 2 + 20);

      ctx.fillStyle = COLORS.neonYellow;
      ctx.font = `bold 28px ${getFontFamily()}`;
      ctx.fillText('* #1 *', x + size / 2, y - 10);
    }
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
