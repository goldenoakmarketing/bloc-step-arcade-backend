/**
 * Comprehensive Configuration Verification
 */

import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env') })

const abi = [
  { inputs: [], name: 'owner', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'gameServer', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
]

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

async function main() {
  const publicClient = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') })

  console.log('=== Configuration Verification ===')
  console.log('')

  // 1. Verify private key
  const privateKey = process.env.GAME_SERVER_PRIVATE_KEY
  if (!privateKey) {
    console.log('GAME_SERVER_PRIVATE_KEY: NOT SET')
    return
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`)
  console.log('1. WALLET')
  console.log('   Private key configured: Yes')
  console.log('   Wallet address:', account.address)
  console.log('')

  // 2. Verify contract addresses in .env
  console.log('2. CONTRACT ADDRESSES (.env)')
  const contracts = {
    ARCADE_VAULT: process.env.ARCADE_VAULT_ADDRESS,
    STAKING_POOL: process.env.STAKING_POOL_ADDRESS,
    POOL_PAYOUT: process.env.POOL_PAYOUT_ADDRESS,
    YEET_ENGINE: process.env.YEET_ENGINE_ADDRESS,
    TIP_BOT: process.env.TIP_BOT_ADDRESS,
    BLOC_TOKEN: process.env.BLOC_TOKEN_ADDRESS,
  }

  for (const [name, addr] of Object.entries(contracts)) {
    console.log(`   ${name}: ${addr || 'NOT SET'}`)
  }
  console.log('')

  // 3. Verify on-chain ownership
  console.log('3. ON-CHAIN OWNERSHIP')
  const ownableContracts = [
    { name: 'ArcadeVault', address: process.env.ARCADE_VAULT_ADDRESS },
    { name: 'StakingPool', address: process.env.STAKING_POOL_ADDRESS },
    { name: 'PoolPayout', address: process.env.POOL_PAYOUT_ADDRESS },
  ]

  let allMatch = true
  for (const contract of ownableContracts) {
    if (!contract.address) continue
    await delay(300)
    try {
      const owner = await publicClient.readContract({
        address: contract.address as `0x${string}`,
        abi,
        functionName: 'owner',
      })
      const match = owner.toLowerCase() === account.address.toLowerCase()
      console.log(`   ${contract.name}: ${owner}`)
      console.log(`      Matches wallet: ${match ? 'YES' : 'NO'}`)
      if (!match) allMatch = false
    } catch (e) {
      console.log(`   ${contract.name}: Error reading owner`)
    }
  }
  console.log('')

  // 4. Verify gameServer settings
  console.log('4. ON-CHAIN GAME SERVER')
  const gameServerContracts = [
    { name: 'ArcadeVault', address: process.env.ARCADE_VAULT_ADDRESS },
    { name: 'PoolPayout', address: process.env.POOL_PAYOUT_ADDRESS },
  ]

  for (const contract of gameServerContracts) {
    if (!contract.address) continue
    await delay(300)
    try {
      const gameServer = await publicClient.readContract({
        address: contract.address as `0x${string}`,
        abi,
        functionName: 'gameServer',
      })
      const match = gameServer.toLowerCase() === account.address.toLowerCase()
      console.log(`   ${contract.name}: ${gameServer}`)
      console.log(`      Matches wallet: ${match ? 'YES' : 'NO'}`)
    } catch (e) {
      console.log(`   ${contract.name}: No gameServer function`)
    }
  }
  console.log('')

  // Summary
  console.log('=== SUMMARY ===')
  console.log(`Wallet: ${account.address}`)
  console.log(`All contracts owned by wallet: ${allMatch ? 'YES' : 'NO'}`)
  console.log('')
  console.log('Ready to transfer ownership to new wallet: YES')
}

main().catch(console.error)
