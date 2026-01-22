import { createPublicClient, createWalletClient, http, parseEther, formatEther } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { config } from '../../config'

// Pool constants
const POOL_CAP = 2500 // Max quarters in pool
const COOLDOWN_MS = 24 * 60 * 60 * 1000 // 24 hours in milliseconds
const OVERFLOW_STAKING_PERCENT = 75 // 75% to staking rewards
const OVERFLOW_OPERATIONS_PERCENT = 25 // 25% to operations

interface PoolState {
  balance: number // Current quarters in pool
  totalReceived: number // All-time quarters received
  totalClaimed: number // All-time quarters claimed
  totalOverflowToStaking: number // All-time overflow to staking
  totalOverflowToOperations: number // All-time overflow to operations
}

interface UserClaimState {
  lastClaimTime: number // Unix timestamp (ms)
  streak: number // Consecutive daily check-ins
}

export class LostFoundPoolService {
  private publicClient
  private walletClient
  private account
  // TODO: Persist to database for production
  private userStates: Map<string, UserClaimState> = new Map()

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
   * Check if user can claim (24-hour cooldown)
   */
  canClaim(playerId: string): { allowed: boolean; nextClaimTime?: Date; reason?: string } {
    const userState = this.userStates.get(playerId)

    if (!userState) {
      return { allowed: true }
    }

    const now = Date.now()
    const timeSinceLastClaim = now - userState.lastClaimTime

    if (timeSinceLastClaim < COOLDOWN_MS) {
      const nextClaimTime = this.getNextResetTime(userState.lastClaimTime)
      return {
        allowed: false,
        nextClaimTime,
        reason: 'Cooldown active. Try again after 00:00 UTC.',
      }
    }

    return { allowed: true }
  }

  /**
   * Get next 00:00 UTC reset time after a given timestamp
   */
  private getNextResetTime(afterTimestamp: number): Date {
    const date = new Date(afterTimestamp)
    const nextDay = new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + 1,
      0, 0, 0, 0
    ))
    return nextDay
  }

  /**
   * Update streak based on time since last claim
   */
  private updateStreak(playerId: string, now: number): number {
    const userState = this.userStates.get(playerId)

    if (!userState) {
      return 1 // First claim ever
    }

    const hoursSinceLastClaim = (now - userState.lastClaimTime) / (1000 * 60 * 60)

    if (hoursSinceLastClaim >= 24 && hoursSinceLastClaim <= 48) {
      // Within window: streak continues
      return userState.streak + 1
    } else if (hoursSinceLastClaim > 48) {
      // Missed a day: streak resets
      return 1
    }

    // Shouldn't reach here due to cooldown, but return current streak
    return userState.streak
  }

  /**
   * Claim quarters from the pool
   * Amount claimable depends on streak (consecutive daily check-ins)
   */
  async claimFromPool(playerId: string): Promise<{
    claimed: number
    poolBalanceAfter: number
    streak: number
    nextClaimTime: Date
    cooldownActive?: boolean
  }> {
    const now = Date.now()

    // Check cooldown
    const cooldownCheck = this.canClaim(playerId)
    if (!cooldownCheck.allowed) {
      return {
        claimed: 0,
        poolBalanceAfter: await this.getPoolBalance(),
        streak: this.userStates.get(playerId)?.streak || 0,
        nextClaimTime: cooldownCheck.nextClaimTime!,
        cooldownActive: true,
      }
    }

    // Calculate new streak
    const newStreak = this.updateStreak(playerId, now)

    // Get max claimable based on streak
    const maxClaimable = this.getMaxClaimable(newStreak)
    const currentBalance = await this.getPoolBalance()
    const claimed = Math.min(maxClaimable, currentBalance)

    // Update user state
    this.userStates.set(playerId, {
      lastClaimTime: now,
      streak: newStreak,
    })

    if (claimed > 0) {
      await this.withdrawFromPool(claimed, playerId)
      console.log(`[LostFoundPool] Player ${playerId} claimed ${claimed}Q (streak: ${newStreak} days)`)
    }

    return {
      claimed,
      poolBalanceAfter: currentBalance - claimed,
      streak: newStreak,
      nextClaimTime: this.getNextResetTime(now),
    }
  }

  /**
   * Get max claimable based on streak (consecutive daily check-ins)
   * 4+ days → 4 quarters
   * 2-3 days → 2 quarters
   * 1 day → 1 quarter
   */
  getMaxClaimable(streak: number): number {
    if (streak >= 4) {
      return 4
    } else if (streak >= 2) {
      return 2
    }
    return 1
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
