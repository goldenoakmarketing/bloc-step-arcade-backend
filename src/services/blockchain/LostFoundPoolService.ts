import { createPublicClient, createWalletClient, http, parseEther, formatEther } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { config } from '../../config'

// Pool constants
const POOL_CAP = 100 // Max quarters in pool
const OVERFLOW_STAKING_PERCENT = 75 // 75% to staking rewards
const OVERFLOW_OPERATIONS_PERCENT = 25 // 25% to operations

interface PoolState {
  balance: number // Current quarters in pool
  totalReceived: number // All-time quarters received
  totalClaimed: number // All-time quarters claimed
  totalOverflowToStaking: number // All-time overflow to staking
  totalOverflowToOperations: number // All-time overflow to operations
}

export class LostFoundPoolService {
  private publicClient
  private walletClient
  private account

  constructor() {
    this.publicClient = createPublicClient({
      chain: base,
      transport: http(config.rpcUrl),
    })

    if (config.gameServerPrivateKey) {
      this.account = privateKeyToAccount(config.gameServerPrivateKey as `0x${string}`)
      this.walletClient = createWalletClient({
        account: this.account,
        chain: base,
        transport: http(config.rpcUrl),
      })
    }
  }

  /**
   * Add quarters to the Lost & Found pool
   * Automatically handles overflow distribution
   */
  async addToPool(quarters: number, source: 'purchase_donation' | 'abandoned_game' | 'voluntary'): Promise<{
    addedToPool: number
    overflowToStaking: number
    overflowToOperations: number
  }> {
    const currentBalance = await this.getPoolBalance()
    const spaceInPool = Math.max(0, POOL_CAP - currentBalance)

    // How much goes to pool vs overflow
    const addedToPool = Math.min(quarters, spaceInPool)
    const overflow = quarters - addedToPool

    // Split overflow 75/25
    const overflowToStaking = Math.floor(overflow * (OVERFLOW_STAKING_PERCENT / 100))
    const overflowToOperations = overflow - overflowToStaking

    // Execute the distributions
    if (addedToPool > 0) {
      await this.depositToPool(addedToPool)
      console.log(`[LostFoundPool] Added ${addedToPool}Q to pool from ${source}`)
    }

    if (overflowToStaking > 0) {
      await this.sendToStakingRewards(overflowToStaking)
      console.log(`[LostFoundPool] Overflow: ${overflowToStaking}Q -> Staking Rewards`)
    }

    if (overflowToOperations > 0) {
      await this.sendToOperations(overflowToOperations)
      console.log(`[LostFoundPool] Overflow: ${overflowToOperations}Q -> Operations`)
    }

    return {
      addedToPool,
      overflowToStaking,
      overflowToOperations,
    }
  }

  /**
   * Process a purchase and extract the 1:8 donation
   */
  async processPurchaseDonation(quartersPurchased: number): Promise<{
    donationAmount: number
    addedToPool: number
    overflowToStaking: number
    overflowToOperations: number
  }> {
    // 1 in 8 goes to pool
    const donationAmount = Math.floor(quartersPurchased / 8)

    if (donationAmount === 0) {
      return {
        donationAmount: 0,
        addedToPool: 0,
        overflowToStaking: 0,
        overflowToOperations: 0,
      }
    }

    const result = await this.addToPool(donationAmount, 'purchase_donation')

    return {
      donationAmount,
      ...result,
    }
  }

  /**
   * Process an abandoned game (played < 1 minute)
   */
  async processAbandonedGame(quarters: number = 1): Promise<{
    addedToPool: number
    overflowToStaking: number
    overflowToOperations: number
  }> {
    return this.addToPool(quarters, 'abandoned_game')
  }

  /**
   * Process a voluntary donation
   */
  async processVoluntaryDonation(quarters: number): Promise<{
    addedToPool: number
    overflowToStaking: number
    overflowToOperations: number
  }> {
    return this.addToPool(quarters, 'voluntary')
  }

  /**
   * Claim quarters from the pool
   * Amount claimable depends on visit frequency
   */
  async claimFromPool(playerId: string, visitFrequency: 'daily' | '2x_week' | '1x_week' | 'rare'): Promise<{
    claimed: number
    poolBalanceAfter: number
  }> {
    const maxClaimable = this.getMaxClaimable(visitFrequency)
    const currentBalance = await this.getPoolBalance()
    const claimed = Math.min(maxClaimable, currentBalance)

    if (claimed > 0) {
      await this.withdrawFromPool(claimed, playerId)
      console.log(`[LostFoundPool] Player ${playerId} claimed ${claimed}Q (frequency: ${visitFrequency})`)
    }

    return {
      claimed,
      poolBalanceAfter: currentBalance - claimed,
    }
  }

  /**
   * Get max claimable based on visit frequency
   */
  getMaxClaimable(visitFrequency: 'daily' | '2x_week' | '1x_week' | 'rare'): number {
    switch (visitFrequency) {
      case 'daily':
        return 4
      case '2x_week':
        return 3
      case '1x_week':
        return 2
      case 'rare':
      default:
        return 1
    }
  }

  /**
   * Get current pool balance
   */
  async getPoolBalance(): Promise<number> {
    // In production: read from smart contract
    // For now: mock implementation
    // TODO: Integrate with actual LostFoundPool contract
    return 50 // Mock: 50 quarters in pool
  }

  /**
   * Get pool statistics
   */
  async getPoolStats(): Promise<PoolState> {
    // TODO: Read from contract/database
    return {
      balance: await this.getPoolBalance(),
      totalReceived: 0,
      totalClaimed: 0,
      totalOverflowToStaking: 0,
      totalOverflowToOperations: 0,
    }
  }

  // ============ Private Methods ============

  private async depositToPool(quarters: number): Promise<void> {
    // TODO: Call smart contract to deposit quarters to pool
    console.log(`[Contract] Depositing ${quarters}Q to Lost & Found Pool`)
  }

  private async withdrawFromPool(quarters: number, playerId: string): Promise<void> {
    // TODO: Call smart contract to withdraw quarters from pool
    console.log(`[Contract] Withdrawing ${quarters}Q from pool for player ${playerId}`)
  }

  private async sendToStakingRewards(quarters: number): Promise<void> {
    // TODO: Call smart contract to send quarters to staking rewards pool
    // This happens AUTOMATICALLY when overflow occurs
    console.log(`[Contract] AUTO-DISTRIBUTING ${quarters}Q to Staking Rewards Pool`)
  }

  private async sendToOperations(quarters: number): Promise<void> {
    // TODO: Call smart contract to send quarters to operations wallet
    console.log(`[Contract] Sending ${quarters}Q to Operations`)
  }
}

// Singleton instance
export const lostFoundPoolService = new LostFoundPoolService()
