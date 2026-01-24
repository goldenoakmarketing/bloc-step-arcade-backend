import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MOCK_MODE: z.string().default('false'),

  // Supabase
  SUPABASE_URL: z.string().default('https://mock.supabase.co'),
  SUPABASE_SERVICE_KEY: z.string().default('mock-key'),

  // Blockchain
  RPC_URL: z.string().default('https://mainnet.base.org'),
  GAME_SERVER_PRIVATE_KEY: z.string().startsWith('0x').default('0x0000000000000000000000000000000000000000000000000000000000000001'),

  // Contract Addresses
  ARCADE_VAULT_ADDRESS: z.string().startsWith('0x').default('0x0000000000000000000000000000000000000001'),
  TIP_BOT_ADDRESS: z.string().startsWith('0x').default('0x0000000000000000000000000000000000000002'),
  YEET_ENGINE_ADDRESS: z.string().startsWith('0x').default('0x0000000000000000000000000000000000000003'),
  STAKING_POOL_ADDRESS: z.string().startsWith('0x').default('0x0000000000000000000000000000000000000004'),
  BLOC_TOKEN_ADDRESS: z.string().startsWith('0x').default('0x0000000000000000000000000000000000000005'),
  POOL_PAYOUT_ADDRESS: z.string().startsWith('0x').default('0xb440AE06aC5ceF3Eb837FDF353459Fb8eFF3556d'),

  // Farcaster
  NEYNAR_API_KEY: z.string().default('mock-key'),
  NEYNAR_WEBHOOK_SECRET: z.string().default('mock-secret'),

  // Event Listener
  START_BLOCK: z.string().default('0'),
  POLLING_INTERVAL_MS: z.string().default('5000'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  port: parseInt(parsed.data.PORT, 10),
  nodeEnv: parsed.data.NODE_ENV,
  isDev: parsed.data.NODE_ENV === 'development',
  isProd: parsed.data.NODE_ENV === 'production',
  mockMode: parsed.data.MOCK_MODE === 'true',

  supabase: {
    url: parsed.data.SUPABASE_URL,
    serviceKey: parsed.data.SUPABASE_SERVICE_KEY,
  },

  blockchain: {
    rpcUrl: parsed.data.RPC_URL,
    gameServerPrivateKey: parsed.data.GAME_SERVER_PRIVATE_KEY as `0x${string}`,
  },

  contracts: {
    arcadeVault: parsed.data.ARCADE_VAULT_ADDRESS as `0x${string}`,
    tipBot: parsed.data.TIP_BOT_ADDRESS as `0x${string}`,
    yeetEngine: parsed.data.YEET_ENGINE_ADDRESS as `0x${string}`,
    stakingPool: parsed.data.STAKING_POOL_ADDRESS as `0x${string}`,
    blocToken: parsed.data.BLOC_TOKEN_ADDRESS as `0x${string}`,
    poolPayout: parsed.data.POOL_PAYOUT_ADDRESS as `0x${string}`,
  },

  farcaster: {
    neynarApiKey: parsed.data.NEYNAR_API_KEY,
    webhookSecret: parsed.data.NEYNAR_WEBHOOK_SECRET,
  },

  eventListener: {
    startBlock: BigInt(parsed.data.START_BLOCK),
    pollingIntervalMs: parseInt(parsed.data.POLLING_INTERVAL_MS, 10),
  },
} as const;

export type Config = typeof config;
