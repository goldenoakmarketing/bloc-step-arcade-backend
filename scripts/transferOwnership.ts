/**
 * Transfer Ownership Script
 *
 * Transfers ownership of ArcadeVault and StakingPool to a new address.
 * Run: npx tsx scripts/transferOwnership.ts
 */

import { createPublicClient, createWalletClient, http } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load .env from project root
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env') })

// Contract addresses
const ARCADE_VAULT = '0x04bA29B0aD6bAcFA0236Fce688a7536ADfc5F17B' as const
const STAKING_POOL = '0xa3465cfD544c6B11C3BBeD5203AEC739976059D4' as const

// New owner address
const NEW_OWNER = '0x8355969259aC310f676a534D4A17F4773093E1A3' as const

// Ownable ABI
const ownableAbi = [
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'newOwner', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

async function main() {
  const privateKey = process.env.VAULT_OWNER_PRIVATE_KEY || process.env.GAME_SERVER_PRIVATE_KEY

  if (!privateKey || privateKey === '0x0000000000000000000000000000000000000000000000000000000000000001') {
    console.error('ERROR: Valid VAULT_OWNER_PRIVATE_KEY not set in .env')
    console.error('The current owner address is: 0x48DD1B1a2f4fc8A93443dAa36AD54Bac608D6901')
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

  console.log('=== Ownership Transfer ===')
  console.log(`Caller: ${account.address}`)
  console.log(`New Owner: ${NEW_OWNER}`)
  console.log('')

  // Check current owners
  const [vaultOwner, stakingOwner] = await Promise.all([
    publicClient.readContract({
      address: ARCADE_VAULT,
      abi: ownableAbi,
      functionName: 'owner',
    }),
    publicClient.readContract({
      address: STAKING_POOL,
      abi: ownableAbi,
      functionName: 'owner',
    }),
  ])

  console.log('Current Owners:')
  console.log(`  ArcadeVault: ${vaultOwner}`)
  console.log(`  StakingPool: ${stakingOwner}`)
  console.log('')

  // Verify caller is current owner
  if (vaultOwner.toLowerCase() !== account.address.toLowerCase()) {
    console.error(`ERROR: Caller ${account.address} is not the ArcadeVault owner`)
    process.exit(1)
  }

  if (stakingOwner.toLowerCase() !== account.address.toLowerCase()) {
    console.error(`ERROR: Caller ${account.address} is not the StakingPool owner`)
    process.exit(1)
  }

  // Transfer ArcadeVault ownership
  console.log('Transferring ArcadeVault ownership...')
  try {
    const vaultHash = await walletClient.writeContract({
      address: ARCADE_VAULT,
      abi: ownableAbi,
      functionName: 'transferOwnership',
      args: [NEW_OWNER],
    })
    console.log(`  Transaction: ${vaultHash}`)

    const vaultReceipt = await publicClient.waitForTransactionReceipt({ hash: vaultHash })
    if (vaultReceipt.status === 'success') {
      console.log(`  ArcadeVault ownership transferred successfully!`)
    } else {
      console.error('  ArcadeVault transfer failed!')
      process.exit(1)
    }
  } catch (error) {
    console.error('Error transferring ArcadeVault ownership:', error)
    process.exit(1)
  }

  console.log('')

  // Transfer StakingPool ownership
  console.log('Transferring StakingPool ownership...')
  try {
    const stakingHash = await walletClient.writeContract({
      address: STAKING_POOL,
      abi: ownableAbi,
      functionName: 'transferOwnership',
      args: [NEW_OWNER],
    })
    console.log(`  Transaction: ${stakingHash}`)

    const stakingReceipt = await publicClient.waitForTransactionReceipt({ hash: stakingHash })
    if (stakingReceipt.status === 'success') {
      console.log(`  StakingPool ownership transferred successfully!`)
    } else {
      console.error('  StakingPool transfer failed!')
      process.exit(1)
    }
  } catch (error) {
    console.error('Error transferring StakingPool ownership:', error)
    process.exit(1)
  }

  console.log('')
  console.log('=== Transfer Complete ===')
  console.log(`New owner of both contracts: ${NEW_OWNER}`)
}

main().catch(console.error)
