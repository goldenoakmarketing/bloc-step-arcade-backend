import { privateKeyToAccount } from 'viem/accounts'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env') })

const privateKey = process.env.GAME_SERVER_PRIVATE_KEY
const targetAddress = '0x48DD1B1a2f4fc8A93443dAa36AD54Bac608D6901'
const placeholder = '0x0000000000000000000000000000000000000000000000000000000000000001'

console.log('=== Private Key Verification ===')
console.log('')

if (!privateKey || privateKey === placeholder) {
  console.log('GAME_SERVER_PRIVATE_KEY: Not set (still placeholder)')
  console.log('Status: FAILED')
} else {
  console.log('GAME_SERVER_PRIVATE_KEY set: Yes')
  console.log('Key length:', privateKey.length)
  console.log('Starts with 0x:', privateKey.startsWith('0x'))
  console.log('')

  try {
    // Add 0x prefix if missing
    const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
    const account = privateKeyToAccount(formattedKey as `0x${string}`)
    console.log('Derived address:', account.address)
    console.log('Target address:', targetAddress)
    console.log('')

    if (account.address.toLowerCase() === targetAddress.toLowerCase()) {
      console.log('Status: MATCH - Private key is correct!')
      if (!privateKey.startsWith('0x')) {
        console.log('')
        console.log('Note: Add 0x prefix to your key in .env for consistency')
      }
    } else {
      console.log('Status: MISMATCH - Private key derives to different address')
    }
  } catch (error) {
    console.log('Error parsing key:', (error as Error).message)
    console.log('Status: INVALID KEY FORMAT')
  }
}
