import { z } from 'zod';

// Address validation
export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address');
export type Address = `0x${string}`;

// Game session types
export const gameSessionStatusSchema = z.enum(['active', 'paused', 'completed', 'expired']);
export type GameSessionStatus = z.infer<typeof gameSessionStatusSchema>;

export interface GameSession {
  id: string;
  playerId: string;
  walletAddress: Address;
  status: GameSessionStatus;
  startedAt: Date;
  endedAt?: Date;
  totalTimeConsumed: bigint;
  lastConsumptionAt?: Date;
  metadata: Record<string, unknown>;
}

export interface CreateGameSessionInput {
  walletAddress: Address;
}

export interface ConsumeTimeInput {
  sessionId: string;
  seconds: number;
}

// Player types
export interface Player {
  id: string;
  walletAddress: Address;
  farcasterFid?: number;
  farcasterUsername?: string;
  cachedTimeBalance: bigint;
  cachedStakedBalance: bigint;
  totalTimePurchased: bigint;
  totalTimeConsumed: bigint;
  totalYeeted: bigint;
  totalTipsSent: bigint;
  totalTipsReceived: bigint;
  createdAt: Date;
  updatedAt: Date;
}

export interface LinkFarcasterInput {
  walletAddress: Address;
  fid: number;
  username: string;
}

// Time tracking types
export interface TimePurchase {
  id: string;
  playerId?: string;
  walletAddress: Address;
  secondsPurchased: bigint;
  costWei: bigint;
  txHash: string;
  blockNumber: bigint;
  logIndex: number;
  createdAt: Date;
}

export interface TimeConsumption {
  id: string;
  sessionId?: string;
  playerId?: string;
  walletAddress: Address;
  secondsConsumed: bigint;
  txHash?: string;
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
  errorMessage?: string;
  createdAt: Date;
  confirmedAt?: Date;
}

// Yeet types
export interface YeetEvent {
  id: string;
  playerId?: string;
  walletAddress: Address;
  amountWei: bigint;
  txHash: string;
  blockNumber: bigint;
  logIndex: number;
  eventTimestamp: Date;
  createdAt: Date;
}

// Tip types
export interface Tip {
  id: string;
  fromPlayerId?: string;
  toPlayerId?: string;
  fromWallet: Address;
  toWallet: Address;
  fromFid?: number;
  toFid?: number;
  amountWei: bigint;
  txHash?: string;
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
  farcasterCastHash?: string;
  errorMessage?: string;
  createdAt: Date;
  confirmedAt?: Date;
}

export interface ExecuteTipInput {
  fromWallet: Address;
  toWallet: Address;
  amount: bigint;
  fromFid?: number;
  toFid?: number;
  castHash?: string;
}

// Leaderboard types
export interface LeaderboardEntry {
  rank: number;
  walletAddress: Address;
  playerId?: string;
  score: bigint;
  farcasterUsername?: string;
  metadata: Record<string, unknown>;
}

export type LeaderboardType = 'yeet' | 'staking' | 'time_played' | 'tips_sent' | 'tips_received';

// Staking types
export interface StakingEvent {
  id: string;
  playerId?: string;
  walletAddress: Address;
  eventType: 'stake' | 'unstake';
  amountWei: bigint;
  txHash: string;
  blockNumber: bigint;
  logIndex: number;
  createdAt: Date;
}

// Block sync types
export interface BlockSyncState {
  id: string;
  contractName: string;
  contractAddress: Address;
  lastSyncedBlock: bigint;
  lastSyncedAt: Date;
}

// Farcaster types
export interface FarcasterUser {
  fid: number;
  username: string;
  displayName?: string;
  pfpUrl?: string;
  custodyAddress?: Address;
  verifiedAddresses: Address[];
}

export interface TipCommand {
  fromFid: number;
  toFid: number;
  amount: bigint;
  castHash: string;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

// Request validation schemas
export const startSessionSchema = z.object({
  walletAddress: addressSchema,
});

export const consumeTimeSchema = z.object({
  seconds: z.number().int().positive().max(3600), // Max 1 hour per call
});

export const linkFarcasterSchema = z.object({
  walletAddress: addressSchema,
  fid: z.number().int().positive(),
  username: z.string().min(1).max(255),
  signature: z.string().optional(), // For verification
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
