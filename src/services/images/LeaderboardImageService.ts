import { createCanvas, loadImage, registerFont } from 'canvas'
import { leaderboardService } from '../analytics/LeaderboardService.js'
import { createChildLogger } from '../../utils/logger.js'
import type { LeaderboardType } from '../../types/index.js'

const logger = createChildLogger('LeaderboardImageService')

// Image dimensions (OG image standard)
const WIDTH = 1200
const HEIGHT = 630

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
}

// Rank colors
const RANK_COLORS = [
  COLORS.neonYellow,  // 1st - Gold
  '#c0c0c0',          // 2nd - Silver
  '#cd7f32',          // 3rd - Bronze
  COLORS.neonPurple,  // 4th
  COLORS.neonBlue,    // 5th
]

export class LeaderboardImageService {
  /**
   * Generate a leaderboard share image
   */
  async generateImage(type: LeaderboardType = 'yeet'): Promise<Buffer> {
    const canvas = createCanvas(WIDTH, HEIGHT)
    const ctx = canvas.getContext('2d')

    // Get leaderboard data
    const entries = await leaderboardService.getYeetLeaderboard(5)

    // Draw background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT)
    gradient.addColorStop(0, COLORS.gradientTop)
    gradient.addColorStop(1, COLORS.gradientBottom)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, WIDTH, HEIGHT)

    // Draw scanlines effect (retro CRT)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'
    for (let y = 0; y < HEIGHT; y += 4) {
      ctx.fillRect(0, y, WIDTH, 2)
    }

    // Draw pixel border
    this.drawPixelBorder(ctx, 20, 20, WIDTH - 40, HEIGHT - 40, COLORS.neonPurple)

    // Draw title
    ctx.fillStyle = COLORS.neonPurple
    ctx.font = 'bold 48px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('BLOC STEP ARCADE', WIDTH / 2, 90)

    // Draw subtitle
    ctx.fillStyle = COLORS.neonBlue
    ctx.font = 'bold 28px monospace'
    ctx.fillText('TOP PLAYERS', WIDTH / 2, 130)

    // Draw trophy emoji (using text since canvas doesn't support emoji well)
    ctx.fillStyle = COLORS.neonYellow
    ctx.font = 'bold 36px monospace'
    ctx.fillText('[ LEADERBOARD ]', WIDTH / 2, 170)

    // Load and draw #1 player's PFP if available
    let pfpX = 150
    let pfpY = 220
    const pfpSize = 180

    if (entries.length > 0) {
      const topPlayer = entries[0]
      const fid = topPlayer.metadata?.farcaster_fid

      if (fid) {
        try {
          // Try to fetch Farcaster PFP
          const pfpUrl = await this.getFarcasterPfp(Number(fid))
          if (pfpUrl) {
            const img = await loadImage(pfpUrl)

            // Draw pixelated PFP
            ctx.save()

            // Draw border
            ctx.strokeStyle = COLORS.neonYellow
            ctx.lineWidth = 4
            ctx.strokeRect(pfpX - 4, pfpY - 4, pfpSize + 8, pfpSize + 8)

            // Clip to square
            ctx.beginPath()
            ctx.rect(pfpX, pfpY, pfpSize, pfpSize)
            ctx.clip()

            // Draw image
            ctx.drawImage(img, pfpX, pfpY, pfpSize, pfpSize)

            ctx.restore()

            // Draw crown above PFP
            ctx.fillStyle = COLORS.neonYellow
            ctx.font = 'bold 32px monospace'
            ctx.textAlign = 'center'
            ctx.fillText('* #1 *', pfpX + pfpSize / 2, pfpY - 15)
          }
        } catch (error) {
          logger.warn({ error, fid }, 'Failed to load PFP')
          // Draw placeholder
          this.drawPlaceholderPfp(ctx, pfpX, pfpY, pfpSize)
        }
      } else {
        this.drawPlaceholderPfp(ctx, pfpX, pfpY, pfpSize)
      }
    }

    // Draw leaderboard entries
    const startY = 230
    const rowHeight = 65
    const listX = 400

    for (let i = 0; i < Math.min(5, entries.length); i++) {
      const entry = entries[i]
      const y = startY + i * rowHeight
      const rankColor = RANK_COLORS[i] || COLORS.textMuted

      // Draw row background
      ctx.fillStyle = i === 0 ? 'rgba(255, 215, 0, 0.1)' : 'rgba(77, 77, 109, 0.2)'
      ctx.fillRect(listX - 10, y - 30, 700, 55)

      // Draw rank
      ctx.fillStyle = rankColor
      ctx.font = 'bold 36px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`#${i + 1}`, listX, y)

      // Draw username
      const username = entry.farcasterUsername || this.truncateAddress(entry.walletAddress)
      ctx.fillStyle = i === 0 ? COLORS.neonYellow : COLORS.textWhite
      ctx.font = 'bold 28px monospace'
      ctx.fillText(`@${username}`, listX + 80, y)

      // Draw score
      ctx.fillStyle = rankColor
      ctx.font = 'bold 28px monospace'
      ctx.textAlign = 'right'
      const scoreFormatted = this.formatScore(entry.score)
      ctx.fillText(scoreFormatted, listX + 680, y)
    }

    // Draw empty slots if less than 5 entries
    for (let i = entries.length; i < 5; i++) {
      const y = startY + i * rowHeight

      ctx.fillStyle = 'rgba(77, 77, 109, 0.1)'
      ctx.fillRect(listX - 10, y - 30, 700, 55)

      ctx.fillStyle = COLORS.textMuted
      ctx.font = '24px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`#${i + 1}  ---`, listX, y)
    }

    // Draw footer
    ctx.fillStyle = COLORS.textMuted
    ctx.font = '20px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('blocsteparcade.netlify.app', WIDTH / 2, HEIGHT - 50)

    // Draw decorative pixels in corners
    this.drawCornerPixels(ctx)

    return canvas.toBuffer('image/png')
  }

  private drawPixelBorder(
    ctx: ReturnType<typeof createCanvas>['prototype']['getContext'],
    x: number,
    y: number,
    width: number,
    height: number,
    color: string
  ) {
    ctx.strokeStyle = color
    ctx.lineWidth = 4

    // Draw main border
    ctx.strokeRect(x, y, width, height)

    // Draw pixel corners
    const pixelSize = 8
    ctx.fillStyle = color

    // Top-left
    ctx.fillRect(x - pixelSize, y - pixelSize, pixelSize, pixelSize)
    ctx.fillRect(x, y - pixelSize, pixelSize, pixelSize)
    ctx.fillRect(x - pixelSize, y, pixelSize, pixelSize)

    // Top-right
    ctx.fillRect(x + width, y - pixelSize, pixelSize, pixelSize)
    ctx.fillRect(x + width - pixelSize, y - pixelSize, pixelSize, pixelSize)
    ctx.fillRect(x + width, y, pixelSize, pixelSize)

    // Bottom-left
    ctx.fillRect(x - pixelSize, y + height, pixelSize, pixelSize)
    ctx.fillRect(x, y + height, pixelSize, pixelSize)
    ctx.fillRect(x - pixelSize, y + height - pixelSize, pixelSize, pixelSize)

    // Bottom-right
    ctx.fillRect(x + width, y + height, pixelSize, pixelSize)
    ctx.fillRect(x + width - pixelSize, y + height, pixelSize, pixelSize)
    ctx.fillRect(x + width, y + height - pixelSize, pixelSize, pixelSize)
  }

  private drawCornerPixels(ctx: ReturnType<typeof createCanvas>['prototype']['getContext']) {
    const pixelSize = 6
    const colors = [COLORS.neonPink, COLORS.neonBlue, COLORS.neonGreen, COLORS.neonYellow]

    // Top-left decoration
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = colors[i]
      ctx.fillRect(40 + i * (pixelSize + 2), 40, pixelSize, pixelSize)
    }

    // Top-right decoration
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = colors[3 - i]
      ctx.fillRect(WIDTH - 80 + i * (pixelSize + 2), 40, pixelSize, pixelSize)
    }

    // Bottom decorations
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = colors[i]
      ctx.fillRect(40 + i * (pixelSize + 2), HEIGHT - 46, pixelSize, pixelSize)
      ctx.fillRect(WIDTH - 80 + i * (pixelSize + 2), HEIGHT - 46, pixelSize, pixelSize)
    }
  }

  private drawPlaceholderPfp(
    ctx: ReturnType<typeof createCanvas>['prototype']['getContext'],
    x: number,
    y: number,
    size: number
  ) {
    // Draw border
    ctx.strokeStyle = COLORS.neonYellow
    ctx.lineWidth = 4
    ctx.strokeRect(x - 4, y - 4, size + 8, size + 8)

    // Draw placeholder background
    const gradient = ctx.createLinearGradient(x, y, x + size, y + size)
    gradient.addColorStop(0, COLORS.neonPurple)
    gradient.addColorStop(1, COLORS.neonBlue)
    ctx.fillStyle = gradient
    ctx.fillRect(x, y, size, size)

    // Draw "?" or crown
    ctx.fillStyle = COLORS.textWhite
    ctx.font = 'bold 72px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('?', x + size / 2, y + size / 2 + 25)

    // Draw crown above
    ctx.fillStyle = COLORS.neonYellow
    ctx.font = 'bold 32px monospace'
    ctx.fillText('* #1 *', x + size / 2, y - 15)
  }

  private async getFarcasterPfp(fid: number): Promise<string | null> {
    try {
      // Use Neynar API to get user info
      const apiKey = process.env.NEYNAR_API_KEY
      if (!apiKey) {
        logger.warn('NEYNAR_API_KEY not set')
        return null
      }

      const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
        headers: {
          'api_key': apiKey,
        },
      })

      if (!response.ok) {
        return null
      }

      const data = await response.json()
      return data.users?.[0]?.pfp_url || null
    } catch (error) {
      logger.warn({ error, fid }, 'Failed to fetch Farcaster PFP')
      return null
    }
  }

  private truncateAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  private formatScore(score: bigint): string {
    const num = Number(score)
    if (num >= 1_000_000_000) {
      return `${(num / 1_000_000_000).toFixed(1)}B`
    }
    if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(1)}M`
    }
    if (num >= 1_000) {
      return `${(num / 1_000).toFixed(1)}K`
    }
    return num.toLocaleString()
  }
}

export const leaderboardImageService = new LeaderboardImageService()
