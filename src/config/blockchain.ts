import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { config } from './index.js';

// Public client for read operations
export const publicClient = createPublicClient({
  chain: base,
  transport: http(config.blockchain.rpcUrl),
});

// Game server account for write operations
export const gameServerAccount = privateKeyToAccount(config.blockchain.gameServerPrivateKey);

// Wallet client for write operations
export const walletClient = createWalletClient({
  account: gameServerAccount,
  chain: base,
  transport: http(config.blockchain.rpcUrl),
});

export type PublicClient = typeof publicClient;
export type WalletClient = typeof walletClient;
