import { createPublicClient, createWalletClient, http, formatEther } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { config } from '../../config/index.js'
import { supabase } from '../../config/supabase.js'
import { contractAddresses, poolPayoutAbi } from '../../config/contracts.js'
import { createChildLogger } from '../../utils/logger.js'
import type { Address } from '../../types/index.js'

const logger = createChildLogger('LostFoundPoolService')

// Pool constants
const POOL_CAP = 2500 // Max quarters in pool
const COOLDOWN_MS = 24 * 60 * 60 * 1000 // 24 hours in milliseconds
const OVERFLOW_STAKING_PERCENT = 75 // 75% to staking rewards (remaining 25% to operations)
const QUARTER_AMOUNT = 250n * 10n ** 18n // 250 BLOC per quarter

interface PoolState {
  balance: number // Current quarters in pool
  totalReceived: number // All-time quarters received
  totalClaimed: number // All-time quarters claimed
  totalOverflow: number // All-time overflow distributed
}

interface ClaimResult {
  claimed: number
  poolBalanceAfter: number
  streak: number
  nextClaimTime: Date
  cooldownActive?: boolean
  txHash?: string
}

export class LostFoundPoolService {
  private publicClient
  private walletClient
  private account

  constructor() {
    this.publicClient = createPublicClient({
      chain: base,
      transport: http(config.blockchain.rpcUrl),
    })

    if (config.blockchain.gameServerPrivateKey) {
      this.account = privateKeyToAccount(config.blockchain.gameServerPrivateKey)
      this.walletClient = createWalletClient({
        account: this.account,
        chain: base,
        transport: http(config.blockchain.rpcUrl),
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
    const poolState = await this.getPoolState()
    const spaceInPool = Math.max(0, POOL_CAP - poolState.balance)

    // How much goes to pool vs overflow
    const addedToPool = Math.min(quarters, spaceInPool)
    const overflow = quarters - addedToPool

    // Split overflow 75/25
    const overflowToStaking = Math.floor(overflow * (OVERFLOW_STAKING_PERCENT / 100))
    const overflowToOperations = overflow - overflowToStaking

    // Update database
    if (addedToPool > 0 || overflow > 0) {
      await supabase
        .from('lost_found_pool')
        .update({
          balance: poolState.balance + addedToPool,
          total_received: poolState.totalReceived + quarters,
          total_overflow: poolState.totalOverflow + overflow,
          updated_at: new Date().toISOString(),
        })
        .eq('id', (await this.getPoolRecord()).id)

      logger.info({ addedToPool, overflow, source }, 'Added quarters to pool')
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
  async canClaim(walletAddress: string): Promise<{ allowed: boolean; nextClaimTime?: Date; reason?: string }> {
    const claimState = await this.getClaimState(walletAddress)

    if (!claimState || !claimState.last_claim_time) {
      logger.info({ walletAddress }, 'No previous claim found, allowing first claim')
      return { allowed: true }
    }

    const now = Date.now()
    const lastClaimTime = new Date(claimState.last_claim_time).getTime()
    const timeSinceLastClaim = now - lastClaimTime
    const hoursRemaining = Math.max(0, (COOLDOWN_MS - timeSinceLastClaim) / (1000 * 60 * 60))

    logger.info({
      walletAddress,
      lastClaimTime: claimState.last_claim_time,
      timeSinceLastClaimMs: timeSinceLastClaim,
      cooldownMs: COOLDOWN_MS,
      hoursRemaining: hoursRemaining.toFixed(2),
      canClaim: timeSinceLastClaim >= COOLDOWN_MS,
    }, 'Checking claim cooldown')

    if (timeSinceLastClaim < COOLDOWN_MS) {
      const nextClaimTime = this.getNextResetTime(lastClaimTime)
      logger.warn({ walletAddress, nextClaimTime, hoursRemaining: hoursRemaining.toFixed(2) }, 'Claim rejected - cooldown active')
      return {
        allowed: false,
        nextClaimTime,
        reason: `Cooldown active. ${hoursRemaining.toFixed(1)} hours remaining.`,
      }
    }

    logger.info({ walletAddress }, 'Cooldown passed, allowing claim')
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
   * Calculate streak based on time since last claim
   */
  private calculateNewStreak(lastClaimTime: Date | null, currentStreak: number, now: number): number {
    if (!lastClaimTime) {
      return 1 // First claim ever
    }

    const hoursSinceLastClaim = (now - new Date(lastClaimTime).getTime()) / (1000 * 60 * 60)

    if (hoursSinceLastClaim >= 24 && hoursSinceLastClaim <= 48) {
      // Within window: streak continues
      return currentStreak + 1
    } else if (hoursSinceLastClaim > 48) {
      // Missed a day: streak resets
      return 1
    }

    // Shouldn't reach here due to cooldown, but return current streak
    return currentStreak
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
   * Claim quarters from the pool
   */
  async claimFromPool(walletAddress: string, playerId?: string): Promise<ClaimResult> {
    const now = Date.now()

    // Check cooldown
    const cooldownCheck = await this.canClaim(walletAddress)
    if (!cooldownCheck.allowed) {
      const claimState = await this.getClaimState(walletAddress)
      return {
        claimed: 0,
        poolBalanceAfter: (await this.getPoolState()).balance,
        streak: claimState?.streak || 0,
        nextClaimTime: cooldownCheck.nextClaimTime!,
        cooldownActive: true,
      }
    }

    // Get current claim state
    const claimState = await this.getClaimState(walletAddress)
    const currentStreak = claimState?.streak || 0
    const lastClaimTime = claimState?.last_claim_time ? new Date(claimState.last_claim_time) : null

    // Calculate new streak
    const newStreak = this.calculateNewStreak(lastClaimTime, currentStreak, now)

    // Get max claimable based on streak
    const maxClaimable = this.getMaxClaimable(newStreak)
    const poolState = await this.getPoolState()
    const claimed = Math.min(maxClaimable, poolState.balance)

    if (claimed === 0) {
      return {
        claimed: 0,
        poolBalanceAfter: poolState.balance,
        streak: newStreak,
        nextClaimTime: this.getNextResetTime(now),
      }
    }

    // Execute on-chain claim
    let txHash: string | undefined
    try {
      txHash = await this.executeOnChainClaim(walletAddress as Address, claimed)
      logger.info({ walletAddress, claimed, txHash }, 'On-chain claim executed')
    } catch (error) {
      logger.error({ error, walletAddress, claimed }, 'Failed to execute on-chain claim')
      throw error
    }

    // Update pool balance in database
    const newPoolBalance = poolState.balance - claimed
    await supabase
      .from('lost_found_pool')
      .update({
        balance: newPoolBalance,
        total_claimed: poolState.totalClaimed + claimed,
        updated_at: new Date().toISOString(),
      })
      .eq('id', (await this.getPoolRecord()).id)

    // Update or create claim state
    const claimTime = new Date().toISOString()
    const { error: upsertError } = await supabase
      .from('pool_claims')
      .upsert({
        wallet_address: walletAddress.toLowerCase(),
        player_id: playerId || null,
        last_claim_time: claimTime,
        streak: newStreak,
        total_claimed: (claimState?.total_claimed || 0) + claimed,
      }, { onConflict: 'wallet_address' })

    if (upsertError) {
      logger.error({ error: upsertError, walletAddress }, 'Failed to update claim state')
      throw new Error('Failed to record claim')
    }

    logger.info({ walletAddress, claimTime, newStreak }, 'Claim state updated')

    // Record claim history
    await supabase.from('pool_claim_history').insert({
      player_id: playerId || null,
      wallet_address: walletAddress.toLowerCase(),
      quarters_claimed: claimed,
      streak_at_claim: newStreak,
      pool_balance_after: newPoolBalance,
      tx_hash: txHash,
    })

    logger.info({ walletAddress, claimed, newStreak, txHash }, 'Player claimed from pool')

    return {
      claimed,
      poolBalanceAfter: newPoolBalance,
      streak: newStreak,
      nextClaimTime: this.getNextResetTime(now),
      txHash,
    }
  }

  /**
   * Execute on-chain claim via PoolPayout contract
   */
  private async executeOnChainClaim(player: Address, quarters: number): Promise<string> {
    if (!this.walletClient || !this.account) {
      throw new Error('Wallet client not configured')
    }

    const amount = BigInt(quarters) * QUARTER_AMOUNT

    const { request } = await this.publicClient.simulateContract({
      address: contractAddresses.poolPayout,
      abi: poolPayoutAbi,
      functionName: 'claim',
      args: [player, amount],
      account: this.account,
    })

    const hash = await this.walletClient.writeContract(request)

    // Wait for confirmation
    await this.publicClient.waitForTransactionReceipt({ hash })

    return hash
  }

  /**
   * Get current pool balance from contract
   */
  async getContractBalance(): Promise<{ balance: bigint; quarterBalance: bigint }> {
    const [balance, quarterBalance] = await Promise.all([
      this.publicClient.readContract({
        address: contractAddresses.poolPayout,
        abi: poolPayoutAbi,
        functionName: 'getBalance',
      }) as Promise<bigint>,
      this.publicClient.readContract({
        address: contractAddresses.poolPayout,
        abi: poolPayoutAbi,
        functionName: 'getQuarterBalance',
      }) as Promise<bigint>,
    ])

    return { balance, quarterBalance }
  }

  /**
   * Get pool state from database
   */
  async getPoolState(): Promise<PoolState> {
    const record = await this.getPoolRecord()
    return {
      balance: record.balance,
      totalReceived: record.total_received,
      totalClaimed: record.total_claimed,
      totalOverflow: record.total_overflow,
    }
  }

  /**
   * Get the singleton pool record from database
   */
  private async getPoolRecord() {
    const { data, error } = await supabase
      .from('lost_found_pool')
      .select('*')
      .single()

    if (error || !data) {
      logger.error({ error }, 'Failed to get pool record')
      throw new Error('Failed to get pool record')
    }

    return data
  }

  /**
   * Get claim state for a wallet
   */
  private async getClaimState(walletAddress: string) {
    const { data, error } = await supabase
      .from('pool_claims')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single()

    // PGRST116 means no rows found - that's OK for first-time claimers
    if (error && error.code !== 'PGRST116') {
      logger.error({ error, walletAddress }, 'Error fetching claim state')
    }

    logger.debug({ walletAddress, data, hasRecord: !!data }, 'Fetched claim state')

    return data
  }

  /**
   * Get pool statistics
   */
  async getPoolStats(): Promise<PoolState & { contractBalance: string; contractQuarters: number }> {
    const [poolState, contractBalances] = await Promise.all([
      this.getPoolState(),
      this.getContractBalance(),
    ])

    return {
      ...poolState,
      contractBalance: formatEther(contractBalances.balance),
      contractQuarters: Number(contractBalances.quarterBalance),
    }
  }

  /**
   * Get claim info for a wallet
   */
  async getClaimInfo(walletAddress: string): Promise<{
    canClaim: boolean
    nextClaimTime?: Date
    streak: number
    maxClaimable: number
    totalClaimed: number
  }> {
    const [cooldownCheck, claimState] = await Promise.all([
      this.canClaim(walletAddress),
      this.getClaimState(walletAddress),
    ])

    const streak = claimState?.streak || 0
    const maxClaimable = this.getMaxClaimable(cooldownCheck.allowed ? streak + 1 : streak)

    return {
      canClaim: cooldownCheck.allowed,
      nextClaimTime: cooldownCheck.nextClaimTime,
      streak,
      maxClaimable,
      totalClaimed: claimState?.total_claimed || 0,
    }
  }
}

// Singleton instance
export const lostFoundPoolService = new LostFoundPoolService()
