import { BrowserProvider, hexlify, toUtf8Bytes } from 'ethers'
import createFrameProvider from '../../main/provider/connection'

let frame: any
let provider: BrowserProvider

const waitForFrameConnect = () =>
  new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for Frame provider connection')), 10_000)

    frame.once('connect', () => {
      clearTimeout(timeout)
      resolve()
    })
    frame.once('error', (err: Error) => {
      clearTimeout(timeout)
      reject(err)
    })
  })

beforeAll(async () => {
  jest.useRealTimers()
  frame = createFrameProvider('frame', { origin: 'frame.test' })
  await waitForFrameConnect()

  provider = new BrowserProvider({
    request: ({ method, params }: { method: string; params?: any[] }) => frame.request({ method, params })
  })

  await provider.send('eth_accounts', [])
}, 30_000)

beforeEach(() => {
  jest.useRealTimers()
})

const getFirstSigner = async () => {
  const [signer] = await provider.listAccounts()
  if (!signer) throw new Error('No account available')
  return signer
}

afterAll(() => {
  frame?.close()
})

test('Send Transaction', async () => {
  const signer = await getFirstSigner()
  const tx = await signer.sendTransaction({
    value: BigInt(Math.round(1000000000000000 * Math.random())),
    to: '0x030e6af4985f111c265ee3a279e5a9f6aa124fd5'
  })

  expect(tx.hash).toBeTruthy()
})

test('sign_personal and ecRecover', async () => {
  const message = 'Frame Test'
  const hexMessage = hexlify(toUtf8Bytes(message))
  const signer = await getFirstSigner()
  const address = await signer.getAddress()
  const signed = await provider.send('personal_sign', [hexMessage, address])
  const result = await provider.send('personal_ecRecover', [hexMessage, signed])

  expect(result.toLowerCase()).toBe(address.toLowerCase())
  console.log(JSON.stringify({ address, msg: message, sig: signed, version: '2' }))
})

test('eth_sign and ecRecover', async () => {
  const message = 'Frame Test'
  const hexMessage = hexlify(toUtf8Bytes(message))
  const signer = await getFirstSigner()
  const address = await signer.getAddress()
  const signed = await provider.send('eth_sign', [address, hexMessage])
  const result = await provider.send('personal_ecRecover', [hexMessage, signed])

  expect(result.toLowerCase()).toBe(address.toLowerCase())
  console.log(JSON.stringify({ address, msg: message, sig: signed, version: '2' }))
})
