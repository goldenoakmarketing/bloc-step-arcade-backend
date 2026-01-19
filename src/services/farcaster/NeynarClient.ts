import { config } from '../../config/index.js';
import { createChildLogger } from '../../utils/logger.js';
import { retry, isRetryableError } from '../../utils/retry.js';
import type { Address, FarcasterUser } from '../../types/index.js';

const logger = createChildLogger('NeynarClient');

const NEYNAR_API_BASE = 'https://api.neynar.com/v2';

interface NeynarUserResponse {
  users: Array<{
    fid: number;
    username: string;
    display_name?: string;
    pfp_url?: string;
    custody_address?: string;
    verified_addresses?: {
      eth_addresses?: string[];
    };
  }>;
}

interface NeynarCastResponse {
  cast: {
    hash: string;
    author: {
      fid: number;
      username: string;
    };
    text: string;
    timestamp: string;
    parent_hash?: string;
    parent_author?: {
      fid: number;
    };
  };
}

export class NeynarClient {
  private apiKey: string;

  constructor() {
    this.apiKey = config.farcaster.neynarApiKey;
  }

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${NEYNAR_API_BASE}${endpoint}`;

    const response = await retry(
      async () => {
        const res = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            'api_key': this.apiKey,
            ...options.headers,
          },
        });

        if (!res.ok) {
          const error = await res.text();
          throw new Error(`Neynar API error: ${res.status} - ${error}`);
        }

        return res.json() as Promise<T>;
      },
      { retryIf: isRetryableError }
    );

    return response;
  }

  async getUserByFid(fid: number): Promise<FarcasterUser | null> {
    logger.debug({ fid }, 'Fetching user by FID');

    try {
      const response = await this.fetch<NeynarUserResponse>(
        `/farcaster/user/bulk?fids=${fid}`
      );

      const user = response.users[0];
      if (!user) return null;

      return {
        fid: user.fid,
        username: user.username,
        displayName: user.display_name,
        pfpUrl: user.pfp_url,
        custodyAddress: user.custody_address as Address | undefined,
        verifiedAddresses: (user.verified_addresses?.eth_addresses || []) as Address[],
      };
    } catch (error) {
      logger.error({ fid, error }, 'Failed to fetch user by FID');
      return null;
    }
  }

  async getUserByUsername(username: string): Promise<FarcasterUser | null> {
    logger.debug({ username }, 'Fetching user by username');

    try {
      const response = await this.fetch<NeynarUserResponse>(
        `/farcaster/user/by_username?username=${encodeURIComponent(username)}`
      );

      const user = response.users[0];
      if (!user) return null;

      return {
        fid: user.fid,
        username: user.username,
        displayName: user.display_name,
        pfpUrl: user.pfp_url,
        custodyAddress: user.custody_address as Address | undefined,
        verifiedAddresses: (user.verified_addresses?.eth_addresses || []) as Address[],
      };
    } catch (error) {
      logger.error({ username, error }, 'Failed to fetch user by username');
      return null;
    }
  }

  async getUsersByAddresses(addresses: Address[]): Promise<FarcasterUser[]> {
    logger.debug({ addresses }, 'Fetching users by addresses');

    try {
      const response = await this.fetch<NeynarUserResponse>(
        `/farcaster/user/bulk-by-address?addresses=${addresses.join(',')}`
      );

      return response.users.map((user) => ({
        fid: user.fid,
        username: user.username,
        displayName: user.display_name,
        pfpUrl: user.pfp_url,
        custodyAddress: user.custody_address as Address | undefined,
        verifiedAddresses: (user.verified_addresses?.eth_addresses || []) as Address[],
      }));
    } catch (error) {
      logger.error({ addresses, error }, 'Failed to fetch users by addresses');
      return [];
    }
  }

  async getCast(hash: string): Promise<NeynarCastResponse['cast'] | null> {
    logger.debug({ hash }, 'Fetching cast');

    try {
      const response = await this.fetch<NeynarCastResponse>(
        `/farcaster/cast?identifier=${hash}&type=hash`
      );

      return response.cast;
    } catch (error) {
      logger.error({ hash, error }, 'Failed to fetch cast');
      return null;
    }
  }

  async postCast(text: string, replyTo?: string): Promise<string | null> {
    logger.info({ textLength: text.length, replyTo }, 'Posting cast');

    try {
      const body: Record<string, unknown> = { text };
      if (replyTo) {
        body.parent = replyTo;
      }

      const response = await this.fetch<{ cast: { hash: string } }>(
        '/farcaster/cast',
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      );

      logger.info({ castHash: response.cast.hash }, 'Cast posted successfully');
      return response.cast.hash;
    } catch (error) {
      logger.error({ error }, 'Failed to post cast');
      return null;
    }
  }

  verifyWebhookSignature(body: string, signature: string): boolean {
    const crypto = require('crypto') as typeof import('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', config.farcaster.webhookSecret)
      .update(body)
      .digest('hex');

    return signature === expectedSignature;
  }
}

export const neynarClient = new NeynarClient();
