/**
 * Weekly Vault Distribution Script
 *
 * This script calls ArcadeVault.distributeVault() to distribute accumulated
 * tokens to StakingPool (60%), StabilityReserve (25%), and ProfitWallet (15%).
 *
 * Run manually: npx tsx scripts/distributeVault.ts
 * Run via cron: Add to crontab for weekly execution
 */

import { createPublicClient, createWalletClient, http, formatEther } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import dotenv from 'dotenv'

dotenv.config()

// Contract addresses
const ARCADE_VAULT = '0x04bA29B0aD6bAcFA0236Fce688a7536ADfc5F17B' as const

// ABI for distributeVault
const arcadeVaultAbi = [
  {
    inputs: [],
    name: 'distributeVault',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'vaultBalance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'timeUntilNextDistribution',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'lastDistribution',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

async function main() {
  const privateKey = process.env.VAULT_OWNER_PRIVATE_KEY || process.env.GAME_SERVER_PRIVATE_KEY

  if (!privateKey || privateKey === '0x0000000000000000000000000000000000000000000000000000000000000001') {
    console.error('ERROR: Valid VAULT_OWNER_PRIVATE_KEY not set in .env')
    console.error('The owner address is: 0x48DD1B1a2f4fc8A93443dAa36AD54Bac608D6901')
    process.exit(1)
  }

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

  console.log('=== Weekly Vault Distribution ===')
  console.log(`Caller: ${account.address}`)
  console.log(`Vault: ${ARCADE_VAULT}`)
  console.log('')

  // Check current state
  const [vaultBalance, timeUntilNext] = await Promise.all([
    publicClient.readContract({
      address: ARCADE_VAULT,
      abi: arcadeVaultAbi,
      functionName: 'vaultBalance',
    }),
    publicClient.readContract({
      address: ARCADE_VAULT,
      abi: arcadeVaultAbi,
      functionName: 'timeUntilNextDistribution',
    }),
  ])

  console.log(`Vault Balance: ${formatEther(vaultBalance)} BLOC`)
  console.log(`Time Until Next Distribution: ${Number(timeUntilNext)} seconds`)
  console.log('')

  // Check if distribution is allowed
  if (timeUntilNext > 0n) {
    const hours = Math.floor(Number(timeUntilNext) / 3600)
    const days = Math.floor(hours / 24)
    console.log(`Cannot distribute yet. Wait ${days} days, ${hours % 24} hours.`)
    process.exit(0)
  }

  if (vaultBalance === 0n) {
    console.log('Vault balance is 0. Nothing to distribute.')
    process.exit(0)
  }

  // Calculate distribution amounts
  const stakingAmt = (vaultBalance * 6000n) / 10000n // 60%
  const stabilityAmt = (vaultBalance * 2500n) / 10000n // 25%
  const profitAmt = vaultBalance - stakingAmt - stabilityAmt // 15%

  console.log('Distribution Preview:')
  console.log(`  Staking Pool (60%): ${formatEther(stakingAmt)} BLOC`)
  console.log(`  Stability Reserve (25%): ${formatEther(stabilityAmt)} BLOC`)
  console.log(`  Profit Wallet (15%): ${formatEther(profitAmt)} BLOC`)
  console.log('')

  // Execute distribution
  console.log('Executing distributeVault()...')

  try {
    const hash = await walletClient.writeContract({
      address: ARCADE_VAULT,
      abi: arcadeVaultAbi,
      functionName: 'distributeVault',
    })

    console.log(`Transaction submitted: ${hash}`)

    const receipt = await publicClient.waitForTransactionReceipt({ hash })

    if (receipt.status === 'success') {
      console.log('Distribution successful!')
      console.log(`Block: ${receipt.blockNumber}`)
      console.log(`Gas used: ${receipt.gasUsed}`)
    } else {
      console.error('Transaction failed!')
      process.exit(1)
    }
  } catch (error) {
    console.error('Error executing distribution:', error)
    process.exit(1)
  }
}

main().catch(console.error)
