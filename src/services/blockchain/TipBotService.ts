import { getContract } from 'viem';
import { publicClient, walletClient, gameServerAccount } from '../../config/blockchain.js';
import { tipBotAbi, contractAddresses } from '../../config/contracts.js';
import { createChildLogger } from '../../utils/logger.js';
import { retry, isRetryableError } from '../../utils/retry.js';
import type { Address } from '../../types/index.js';

const logger = createChildLogger('TipBotService');

export class TipBotService {
  private contract;

  constructor() {
    this.contract = getContract({
      address: contractAddresses.tipBot,
      abi: tipBotAbi,
      client: { public: publicClient, wallet: walletClient },
    });
  }

  async isAuthorizedOperator(operator: Address): Promise<boolean> {
    logger.debug({ operator }, 'Checking operator authorization');

    const authorized = await retry(
      () => this.contract.read.isAuthorizedOperator([operator]),
      { retryIf: isRetryableError }
    );

    logger.debug({ operator, authorized }, 'Operator authorization checked');
    return authorized;
  }

  async executeTip(from: Address, to: Address, amount: bigint): Promise<`0x${string}`> {
    logger.info({ from, to, amount: amount.toString() }, 'Executing tip');

    const hash = await retry(
      async () => {
        const { request } = await publicClient.simulateContract({
          account: gameServerAccount,
          address: contractAddresses.tipBot,
          abi: tipBotAbi,
          functionName: 'executeTip',
          args: [from, to, amount],
        });

        return walletClient.writeContract(request);
      },
      { retryIf: isRetryableError }
    );

    logger.info({ from, to, amount: amount.toString(), txHash: hash }, 'Tip transaction submitted');
    return hash;
  }

  async waitForTip(txHash: `0x${string}`): Promise<boolean> {
    logger.debug({ txHash }, 'Waiting for tip confirmation');

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
      timeout: 60_000,
    });

    const success = receipt.status === 'success';
    logger.info({ txHash, success, blockNumber: receipt.blockNumber.toString() }, 'Tip confirmed');
    return success;
  }
}

export const tipBotService = new TipBotService();
