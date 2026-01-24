/**
 * Check Contract Ownership
 */

import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

const ARCADE_VAULT = '0x04bA29B0aD6bAcFA0236Fce688a7536ADfc5F17B' as const
const STAKING_POOL = '0xa3465cfD544c6B11C3BBeD5203AEC739976059D4' as const

const ownableAbi = [
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

async function main() {
  const publicClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  })

  console.log('=== Contract Ownership ===')

  const vaultOwner = await publicClient.readContract({
    address: ARCADE_VAULT,
    abi: ownableAbi,
    functionName: 'owner',
  })
  console.log(`ArcadeVault (${ARCADE_VAULT}):`)
  console.log(`  Owner: ${vaultOwner}`)

  const stakingOwner = await publicClient.readContract({
    address: STAKING_POOL,
    abi: ownableAbi,
    functionName: 'owner',
  })
  console.log(`StakingPool (${STAKING_POOL}):`)
  console.log(`  Owner: ${stakingOwner}`)
}

main().catch(console.error)
