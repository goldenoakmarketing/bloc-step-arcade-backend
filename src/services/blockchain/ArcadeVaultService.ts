import { getContract } from 'viem';
import { publicClient, walletClient, gameServerAccount } from '../../config/blockchain.js';
import { arcadeVaultAbi, contractAddresses } from '../../config/contracts.js';
import { createChildLogger } from '../../utils/logger.js';
import { retry, isRetryableError } from '../../utils/retry.js';
import type { Address } from '../../types/index.js';

const logger = createChildLogger('ArcadeVaultService');

export class ArcadeVaultService {
  private contract;

  constructor() {
    this.contract = getContract({
      address: contractAddresses.arcadeVault,
      abi: arcadeVaultAbi,
      client: { public: publicClient, wallet: walletClient },
    });
  }

  async getTimeBalance(player: Address): Promise<bigint> {
    logger.debug({ player }, 'Fetching time balance');

    const balance = await retry(
      () => this.contract.read.timeBalances([player]),
      { retryIf: isRetryableError }
    );

    logger.debug({ player, balance: balance.toString() }, 'Time balance fetched');
    return balance;
  }

  async consumeTime(player: Address, seconds: bigint): Promise<`0x${string}`> {
    logger.info({ player, seconds: seconds.toString() }, 'Consuming time');

    const hash = await retry(
      async () => {
        const { request } = await publicClient.simulateContract({
          account: gameServerAccount,
          address: contractAddresses.arcadeVault,
          abi: arcadeVaultAbi,
          functionName: 'consumeTime',
          args: [player, seconds],
        });

        return walletClient.writeContract(request);
      },
      { retryIf: isRetryableError }
    );

    logger.info({ player, seconds: seconds.toString(), txHash: hash }, 'Time consumption transaction submitted');
    return hash;
  }

  async waitForConsumption(txHash: `0x${string}`): Promise<boolean> {
    logger.debug({ txHash }, 'Waiting for consumption confirmation');

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    });

    const success = receipt.status === 'success';
    logger.info({ txHash, success, blockNumber: receipt.blockNumber.toString() }, 'Consumption confirmed');
    return success;
  }
}

export const arcadeVaultService = new ArcadeVaultService();
