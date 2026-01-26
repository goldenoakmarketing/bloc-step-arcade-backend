/**
 * Weekly Staking Rewards Distribution Script
 *
 * This script distributes staking rewards to eligible stakers.
 * Eligibility: stake_started_at >= 7 days ago
 * Reward calculation: min(20% of staked amount, proportional share of rewards pool)
 *
 * Run manually: npx tsx scripts/distributeStakingRewards.ts
 * Run via cron: Add to crontab for weekly execution (Sundays)
 *
 * Example cron (Sunday 00:00 UTC):
 * 0 0 * * 0 cd /path/to/backend && npx tsx scripts/distributeStakingRewards.ts >> /var/log/staking-rewards.log 2>&1
 */

import { createPublicClient, createWalletClient, http, formatEther, parseEther } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createClient } from '@supabase/supabase-js'

// Load .env from project root
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env') })

// Force stdout flush on Windows
const log = (...args: unknown[]) => {
  console.log(new Date().toISOString(), ...args)
  if (process.stdout.write) process.stdout.write('')
}

// Contract addresses
const BLOC_TOKEN = '0x7f62ac1e974D65Fab4A81821CA6AF659A5F46298' as const
const STAKING_POOL = '0x3C5293619857BC658599b6d1dCA0F5960b8106E5' as const

// Minimum 7 days for eligibility (in milliseconds)
const ELIGIBILITY_DAYS = 7
const ELIGIBILITY_MS = ELIGIBILITY_DAYS * 24 * 60 * 60 * 1000

// Maximum weekly reward rate (20% = 0.20)
const MAX_WEEKLY_REWARD_RATE = 0.20

// ERC20 transfer ABI
const erc20Abi = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// StakingPool ABI for reading staked balances
const stakingPoolAbi = [
  {
    inputs: [{ name: 'player', type: 'address' }],
    name: 'getStakedBalance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalStaked',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

interface EligibleStaker {
  wallet_address: string
  stake_started_at: string
  cached_staked_balance: number
}

async function main() {
  const privateKey = process.env.REWARDS_WALLET_PRIVATE_KEY || process.env.GAME_SERVER_PRIVATE_KEY

  if (!privateKey || privateKey === '0x0000000000000000000000000000000000000000000000000000000000000001') {
    console.error('ERROR: Valid REWARDS_WALLET_PRIVATE_KEY not set in .env')
    process.exit(1)
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in .env')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const account = privateKeyToAccount(privateKey as `0x${string}`)

  const publicClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  })

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http('https://mainnet.base.org'),
  })

  log('=== Weekly Staking Rewards Distribution ===')
  log(`Rewards Wallet: ${account.address}`)
  log('')

  // Check rewards wallet balance
  const rewardsWalletBalance = await publicClient.readContract({
    address: BLOC_TOKEN,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account.address],
  })

  log(`Rewards Wallet BLOC Balance: ${formatEther(rewardsWalletBalance)} BLOC`)

  // Get total staked from contract
  const totalStaked = await publicClient.readContract({
    address: STAKING_POOL,
    abi: stakingPoolAbi,
    functionName: 'totalStaked',
  })

  log(`Total Staked in Pool: ${formatEther(totalStaked)} BLOC`)
  log('')

  // Calculate eligibility cutoff date
  const now = new Date()
  const eligibilityCutoff = new Date(now.getTime() - ELIGIBILITY_MS)
  log(`Eligibility cutoff: ${eligibilityCutoff.toISOString()} (staked for ${ELIGIBILITY_DAYS}+ days)`)

  // Get eligible stakers from database
  const { data: eligibleStakers, error } = await supabase
    .from('players')
    .select('wallet_address, stake_started_at, cached_staked_balance')
    .lte('stake_started_at', eligibilityCutoff.toISOString())
    .gt('cached_staked_balance', 0)

  if (error) {
    console.error('ERROR: Failed to fetch eligible stakers:', error)
    process.exit(1)
  }

  if (!eligibleStakers || eligibleStakers.length === 0) {
    log('No eligible stakers found. Exiting.')
    process.exit(0)
  }

  log(`Found ${eligibleStakers.length} eligible stakers`)
  log('')

  // Calculate rewards for each staker
  const totalRewardsPool = Number(formatEther(rewardsWalletBalance))
  const totalEligibleStaked = eligibleStakers.reduce((sum, s) => sum + s.cached_staked_balance, 0)

  log(`Total Eligible Staked: ${totalEligibleStaked.toLocaleString()} BLOC`)
  log(`Total Rewards Available: ${totalRewardsPool.toLocaleString()} BLOC`)
  log('')

  interface RewardCalculation {
    walletAddress: string
    stakedAmount: number
    maxReward: number
    proportionalShare: number
    actualReward: number
  }

  const rewardCalculations: RewardCalculation[] = eligibleStakers.map((staker: EligibleStaker) => {
    const stakedAmount = staker.cached_staked_balance
    const maxReward = stakedAmount * MAX_WEEKLY_REWARD_RATE
    const proportionalShare = totalEligibleStaked > 0
      ? (stakedAmount / totalEligibleStaked) * totalRewardsPool
      : 0
    const actualReward = Math.min(maxReward, proportionalShare)

    return {
      walletAddress: staker.wallet_address,
      stakedAmount,
      maxReward,
      proportionalShare,
      actualReward,
    }
  })

  // Filter out zero rewards
  const validRewards = rewardCalculations.filter(r => r.actualReward > 0)
  const totalToDistribute = validRewards.reduce((sum, r) => sum + r.actualReward, 0)

  log('=== Reward Calculations ===')
  for (const reward of validRewards) {
    log(`${reward.walletAddress}: ${reward.actualReward.toFixed(2)} BLOC (staked: ${reward.stakedAmount}, max: ${reward.maxReward.toFixed(2)}, share: ${reward.proportionalShare.toFixed(2)})`)
  }
  log('')
  log(`Total to distribute: ${totalToDistribute.toFixed(2)} BLOC`)
  log('')

  // Check if we have enough balance
  if (parseEther(totalToDistribute.toString()) > rewardsWalletBalance) {
    console.error('ERROR: Insufficient rewards wallet balance for distribution')
    console.error(`  Need: ${totalToDistribute.toFixed(2)} BLOC`)
    console.error(`  Have: ${formatEther(rewardsWalletBalance)} BLOC`)
    process.exit(1)
  }

  // Distribute rewards
  log('=== Distributing Rewards ===')
  let successful = 0
  let failed = 0

  for (const reward of validRewards) {
    try {
      const amount = parseEther(reward.actualReward.toFixed(18))

      log(`Sending ${reward.actualReward.toFixed(2)} BLOC to ${reward.walletAddress}...`)

      const hash = await walletClient.writeContract({
        address: BLOC_TOKEN,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [reward.walletAddress as `0x${string}`, amount],
      })

      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      if (receipt.status === 'success') {
        log(`  ✓ Success: ${hash}`)
        successful++

        // Log to database
        await supabase.from('staking_rewards').insert({
          wallet_address: reward.walletAddress,
          amount_tokens: reward.actualReward,
          tx_hash: hash,
          distributed_at: new Date().toISOString(),
        }).catch(() => {
          // Table might not exist yet, that's OK
        })
      } else {
        log(`  ✗ Failed: ${hash}`)
        failed++
      }
    } catch (err) {
      console.error(`  ✗ Error sending to ${reward.walletAddress}:`, err)
      failed++
    }
  }

  log('')
  log('=== Distribution Complete ===')
  log(`Successful: ${successful}`)
  log(`Failed: ${failed}`)
  log(`Total Distributed: ${validRewards.filter((_, i) => i < successful).reduce((sum, r) => sum + r.actualReward, 0).toFixed(2)} BLOC`)
}

main().catch(console.error)
