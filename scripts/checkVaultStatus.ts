/**
 * Vault Status Check Script
 *
 * Check the current vault balance and distribution timing without requiring a private key.
 * Run: npx tsx scripts/checkVaultStatus.ts
 */

import { createPublicClient, http, formatEther } from 'viem'
import { base } from 'viem/chains'

// Contract addresses
const ARCADE_VAULT = '0x04bA29B0aD6bAcFA0236Fce688a7536ADfc5F17B' as const

// ABIs - minimal for just the data we need
const arcadeVaultAbi = [
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

// Helper to add delay between calls
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function main() {
  const publicClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  })

  console.log('=== BLOC Vault Status ===')
  console.log(`Vault: ${ARCADE_VAULT}`)
  console.log('')

  try {
    // Fetch vault data with delays to avoid rate limiting
    const vaultBalance = await publicClient.readContract({
      address: ARCADE_VAULT,
      abi: arcadeVaultAbi,
      functionName: 'vaultBalance',
    })

    console.log(`Vault Balance: ${formatEther(vaultBalance)} BLOC`)

    await delay(500)

    const timeUntilNext = await publicClient.readContract({
      address: ARCADE_VAULT,
      abi: arcadeVaultAbi,
      functionName: 'timeUntilNextDistribution',
    })

    await delay(500)

    const lastDistribution = await publicClient.readContract({
      address: ARCADE_VAULT,
      abi: arcadeVaultAbi,
      functionName: 'lastDistribution',
    })

    const lastDistDate = lastDistribution > 0n
      ? new Date(Number(lastDistribution) * 1000).toISOString()
      : 'Never'
    console.log(`Last Distribution: ${lastDistDate}`)

    if (timeUntilNext > 0n) {
      const seconds = Number(timeUntilNext)
      const days = Math.floor(seconds / 86400)
      const hours = Math.floor((seconds % 86400) / 3600)
      const mins = Math.floor((seconds % 3600) / 60)
      console.log(`Next Distribution In: ${days}d ${hours}h ${mins}m`)
      console.log(`Distribution Available: No`)
    } else {
      console.log(`Distribution Available: YES - Ready to call distributeVault()`)
    }
    console.log('')

    if (vaultBalance > 0n) {
      const stakingAmt = (vaultBalance * 6000n) / 10000n
      const stabilityAmt = (vaultBalance * 2500n) / 10000n
      const profitAmt = vaultBalance - stakingAmt - stabilityAmt

      console.log('--- Pending Distribution ---')
      console.log(`  Staking Pool (60%): ${formatEther(stakingAmt)} BLOC`)
      console.log(`  Stability Reserve (25%): ${formatEther(stabilityAmt)} BLOC`)
      console.log(`  Profit Wallet (15%): ${formatEther(profitAmt)} BLOC`)
    } else {
      console.log('Vault is empty - nothing to distribute.')
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('429')) {
      console.error('Rate limited by RPC. Try again in a minute or use a different RPC provider.')
    } else {
      throw error
    }
  }
}

main().catch(console.error)
