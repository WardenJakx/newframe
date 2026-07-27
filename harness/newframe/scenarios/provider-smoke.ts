import { BrowserProvider, hexlify, toUtf8Bytes } from 'ethers'
import createFrameProvider from '../../../apps/newframe/main/provider/connection.ts'

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
  const getFirstSigner = async () => {
    const [signer] = await provider.listAccounts()
    if (!signer) throw new Error('No account available')
    return signer
  }

  const assertRecovered = (actual: string, expected: string, label: string) => {
    if (actual.toLowerCase() !== expected.toLowerCase()) {
      throw new Error(`${label} recovered ${actual}; expected ${expected}`)
    }
  }

  async function signPersonal() {
    const message = 'Frame Test'
    const hexMessage = hexlify(toUtf8Bytes(message))
    const signer = await getFirstSigner()
    const address = await signer.getAddress()
    const signed = await provider.send('personal_sign', [hexMessage, address])
    const result = await provider.send('personal_ecRecover', [hexMessage, signed])

    assertRecovered(result, address, 'personal_sign')
    console.log(JSON.stringify({ address, msg: message, sig: signed, version: '2' }))
  }

  async function signEth() {
    const message = 'Frame Test'
    const hexMessage = hexlify(toUtf8Bytes(message))
    const signer = await getFirstSigner()
    const address = await signer.getAddress()
    const signed = await provider.send('eth_sign', [address, hexMessage])
    const result = await provider.send('personal_ecRecover', [hexMessage, signed])

    assertRecovered(result, address, 'eth_sign')
    console.log(JSON.stringify({ address, msg: message, sig: signed, version: '2' }))
  }

  try {
    await waitForFrameConnect()
    provider = new BrowserProvider({
      request: ({ method, params }: { method: string; params?: any[] }) => frame.request({ method, params })
    })
    await provider.send('eth_accounts', [])

    const signer = await getFirstSigner()
    const tx = await signer.sendTransaction({
      value: 1_000_000_000_000n,
      to: '0x030e6af4985f111c265ee3a279e5a9f6aa124fd5'
    })
    if (!/^0x[0-9a-fA-F]{64}$/.test(tx.hash)) throw new Error(`Invalid transaction hash: ${tx.hash}`)

    await signPersonal()
    await signEth()
  } finally {
    frame?.close()
  }
}

await main()
