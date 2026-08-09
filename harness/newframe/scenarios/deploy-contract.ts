import { BrowserProvider } from 'ethers'
import createFrameProvider from '../../../apps/newframe/src/features/connections/main/provider/connection.ts'

let frame: any
let provider: BrowserProvider

const waitForFrameConnect = () =>
  new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Timed out waiting for Frame provider connection')),
      10_000
    )

    frame.once('connect', () => {
      clearTimeout(timeout)
      resolve()
    })
    frame.once('error', (err: Error) => {
      clearTimeout(timeout)
      reject(err)
    })
  })

async function main() {
  frame = createFrameProvider('frame', { origin: 'frame.test' })
  try {
    await waitForFrameConnect()
    provider = new BrowserProvider({
      request: ({ method, params }: { method: string; params?: any[] }) => frame.request({ method, params })
    })
    await provider.send('eth_accounts', [])

    const [signer] = await provider.listAccounts()
    if (!signer) throw new Error('No account available')

    const tx = await signer.sendTransaction({
      data: '0x6080604052348015600f57600080fd5b50603580601d6000396000f3006080604052600080fd00a165627a7a72305820f50314badc96cf2df848b358f976e52facd1986d2f3eb5bd7b41071ac667ae480029',
      gasLimit: 0x10cba
    })
    if (!/^0x[0-9a-fA-F]{64}$/.test(tx.hash)) throw new Error(`Invalid transaction hash: ${tx.hash}`)
    console.log(JSON.stringify({ transactionHash: tx.hash }))
  } finally {
    frame?.close()
  }
}

await main()
