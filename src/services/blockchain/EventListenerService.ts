import type { Log, AbiEvent } from 'viem';
import { publicClient } from '../../config/blockchain.js';
import {
  arcadeVaultAbi,
  yeetEngineAbi,
  stakingPoolAbi,
  tipBotAbi,
  contractAddresses,
} from '../../config/contracts.js';
import { config } from '../../config/index.js';
import { supabase } from '../../config/supabase.js';
import { createChildLogger } from '../../utils/logger.js';
import { sleep } from '../../utils/retry.js';
import type { Address } from '../../types/index.js';

const logger = createChildLogger('EventListenerService');

interface EventHandler {
  contractName: string;
  contractAddress: Address;
  eventName: string;
  handler: (log: Log) => Promise<void>;
}

export class EventListenerService {
  private isRunning = false;
  private handlers: EventHandler[] = [];

  constructor() {
    this.registerHandlers();
  }

  private registerHandlers() {
    // TimePurchased event
    this.handlers.push({
      contractName: 'ArcadeVault',
      contractAddress: contractAddresses.arcadeVault,
      eventName: 'TimePurchased',
      handler: this.handleTimePurchased.bind(this),
    });

    // TimeConsumed event
    this.handlers.push({
      contractName: 'ArcadeVault',
      contractAddress: contractAddresses.arcadeVault,
      eventName: 'TimeConsumed',
      handler: this.handleTimeConsumed.bind(this),
    });

    // YeetSent event
    this.handlers.push({
      contractName: 'YeetEngine',
      contractAddress: contractAddresses.yeetEngine,
      eventName: 'YeetSent',
      handler: this.handleYeetSent.bind(this),
    });

    // Staked event
    this.handlers.push({
      contractName: 'StakingPool',
      contractAddress: contractAddresses.stakingPool,
      eventName: 'Staked',
      handler: this.handleStaked.bind(this),
    });

    // Unstaked event
    this.handlers.push({
      contractName: 'StakingPool',
      contractAddress: contractAddresses.stakingPool,
      eventName: 'Unstaked',
      handler: this.handleUnstaked.bind(this),
    });

    // TipExecuted event
    this.handlers.push({
      contractName: 'TipBot',
      contractAddress: contractAddresses.tipBot,
      eventName: 'TipExecuted',
      handler: this.handleTipExecuted.bind(this),
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Event listener already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting event listener');

    while (this.isRunning) {
      try {
        await this.pollEvents();
      } catch (error) {
        logger.error({ error }, 'Error polling events');
      }

      await sleep(config.eventListener.pollingIntervalMs);
    }
  }

  stop(): void {
    logger.info('Stopping event listener');
    this.isRunning = false;
  }

  private async pollEvents(): Promise<void> {
    const currentBlock = await publicClient.getBlockNumber();

    for (const handler of this.handlers) {
      const syncState = await this.getSyncState(handler.contractName);
      const fromBlock = syncState ? BigInt(syncState.last_synced_block) + 1n : config.eventListener.startBlock;

      if (fromBlock > currentBlock) {
        continue;
      }

      const toBlock = currentBlock;
      const batchSize = 2000n;

      for (let start = fromBlock; start <= toBlock; start += batchSize) {
        const end = start + batchSize - 1n > toBlock ? toBlock : start + batchSize - 1n;

        logger.debug(
          { contractName: handler.contractName, eventName: handler.eventName, fromBlock: start.toString(), toBlock: end.toString() },
          'Fetching logs'
        );

        const logs = await this.getLogs(handler, start, end);

        for (const log of logs) {
          try {
            await handler.handler(log);
          } catch (error) {
            logger.error({ error, txHash: log.transactionHash }, 'Error processing log');
          }
        }

        await this.updateSyncState(handler.contractName, handler.contractAddress, end);
      }
    }
  }

  private async getLogs(handler: EventHandler, fromBlock: bigint, toBlock: bigint): Promise<Log[]> {
    const eventAbi = this.getEventAbi(handler.contractName, handler.eventName);
    if (!eventAbi) return [];

    return publicClient.getLogs({
      address: handler.contractAddress,
      event: eventAbi as AbiEvent,
      fromBlock,
      toBlock,
    });
  }

  private getEventAbi(contractName: string, eventName: string): AbiEvent | undefined {
    const abis: Record<string, readonly unknown[]> = {
      ArcadeVault: arcadeVaultAbi,
      YeetEngine: yeetEngineAbi,
      StakingPool: stakingPoolAbi,
      TipBot: tipBotAbi,
    };

    const abi = abis[contractName];
    if (!abi) return undefined;

    const event = abi.find(
      (item): item is AbiEvent =>
        typeof item === 'object' &&
        item !== null &&
        'type' in item &&
        (item as { type: string }).type === 'event' &&
        'name' in item &&
        (item as { name: string }).name === eventName
    );

    return event;
  }

  private async getSyncState(contractName: string) {
    const { data } = await supabase
      .from('block_sync_state')
      .select('*')
      .eq('contract_name', contractName)
      .single();
    return data;
  }

  private async updateSyncState(contractName: string, contractAddress: Address, blockNumber: bigint) {
    await supabase.from('block_sync_state').upsert({
      contract_name: contractName,
      contract_address: contractAddress,
      last_synced_block: Number(blockNumber),
      last_synced_at: new Date().toISOString(),
    });
  }

  private async handleTimePurchased(log: Log): Promise<void> {
    const args = (log as unknown as { args: { player: Address; seconds: bigint; cost: bigint } }).args;
    logger.info({ player: args.player, seconds: args.seconds.toString(), txHash: log.transactionHash }, 'TimePurchased event');

    const player = await this.ensurePlayer(args.player);

    await supabase.from('time_purchases').insert({
      player_id: player?.id,
      wallet_address: args.player,
      seconds_purchased: Number(args.seconds),
      cost_wei: args.cost.toString(),
      tx_hash: log.transactionHash!,
      block_number: Number(log.blockNumber),
      log_index: log.logIndex!,
    });

    if (player) {
      await supabase
        .from('players')
        .update({
          total_time_purchased: player.total_time_purchased + Number(args.seconds),
          cached_time_balance: player.cached_time_balance + Number(args.seconds),
        })
        .eq('id', player.id);
    }
  }

  private async handleTimeConsumed(log: Log): Promise<void> {
    const args = (log as unknown as { args: { player: Address; seconds: bigint } }).args;
    logger.info({ player: args.player, seconds: args.seconds.toString(), txHash: log.transactionHash }, 'TimeConsumed event');

    const player = await this.getPlayer(args.player);

    if (player) {
      await supabase
        .from('players')
        .update({
          total_time_consumed: player.total_time_consumed + Number(args.seconds),
          cached_time_balance: Math.max(0, player.cached_time_balance - Number(args.seconds)),
        })
        .eq('id', player.id);
    }

    // Update pending consumption record
    await supabase
      .from('time_consumptions')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('tx_hash', log.transactionHash);
  }

  private async handleYeetSent(log: Log): Promise<void> {
    const args = (log as unknown as { args: { player: Address; amount: bigint; timestamp: bigint } }).args;
    logger.info({ player: args.player, amount: args.amount.toString(), txHash: log.transactionHash }, 'YeetSent event');

    const player = await this.ensurePlayer(args.player);

    await supabase.from('yeet_events').insert({
      player_id: player?.id,
      wallet_address: args.player,
      amount_wei: args.amount.toString(),
      tx_hash: log.transactionHash!,
      block_number: Number(log.blockNumber),
      log_index: log.logIndex!,
      event_timestamp: new Date(Number(args.timestamp) * 1000).toISOString(),
    });

    if (player) {
      await supabase
        .from('players')
        .update({ total_yeeted: player.total_yeeted + Number(args.amount) })
        .eq('id', player.id);
    }
  }

  private async handleStaked(log: Log): Promise<void> {
    const args = (log as unknown as { args: { player: Address; amount: bigint } }).args;
    logger.info({ player: args.player, amount: args.amount.toString(), txHash: log.transactionHash }, 'Staked event');

    const player = await this.ensurePlayer(args.player);

    await supabase.from('staking_events').insert({
      player_id: player?.id,
      wallet_address: args.player,
      event_type: 'stake',
      amount_wei: args.amount.toString(),
      tx_hash: log.transactionHash!,
      block_number: Number(log.blockNumber),
      log_index: log.logIndex!,
    });

    if (player) {
      await supabase
        .from('players')
        .update({ cached_staked_balance: player.cached_staked_balance + Number(args.amount) })
        .eq('id', player.id);
    }
  }

  private async handleUnstaked(log: Log): Promise<void> {
    const args = (log as unknown as { args: { player: Address; amount: bigint } }).args;
    logger.info({ player: args.player, amount: args.amount.toString(), txHash: log.transactionHash }, 'Unstaked event');

    const player = await this.getPlayer(args.player);

    await supabase.from('staking_events').insert({
      player_id: player?.id,
      wallet_address: args.player,
      event_type: 'unstake',
      amount_wei: args.amount.toString(),
      tx_hash: log.transactionHash!,
      block_number: Number(log.blockNumber),
      log_index: log.logIndex!,
    });

    if (player) {
      await supabase
        .from('players')
        .update({ cached_staked_balance: Math.max(0, player.cached_staked_balance - Number(args.amount)) })
        .eq('id', player.id);
    }
  }

  private async handleTipExecuted(log: Log): Promise<void> {
    const args = (log as unknown as { args: { from: Address; to: Address; amount: bigint } }).args;
    logger.info({ from: args.from, to: args.to, amount: args.amount.toString(), txHash: log.transactionHash }, 'TipExecuted event');

    // Update tip record status
    await supabase
      .from('tips')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('tx_hash', log.transactionHash);
  }

  private async getPlayer(walletAddress: Address) {
    const { data } = await supabase
      .from('players')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();
    return data;
  }

  private async ensurePlayer(walletAddress: Address) {
    let player = await this.getPlayer(walletAddress);

    if (!player) {
      const { data } = await supabase
        .from('players')
        .insert({ wallet_address: walletAddress.toLowerCase() })
        .select()
        .single();
      player = data;
    }

    return player;
  }
}

export const eventListenerService = new EventListenerService();
