import { afterAll, beforeAll, expect, test } from 'bun:test'

import { BrowserProvider, TypedDataEncoder, verifyTypedData } from 'ethers'
import createFrameProvider from '../../main/provider/connection'

const TYPED_DATA = {
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' }
    ],
    Person: [
      { name: 'name', type: 'string' },
      { name: 'wallet', type: 'address' }
    ],
    Mail: [
      { name: 'from', type: 'Person' },
      { name: 'to', type: 'Person' },
      { name: 'contents', type: 'string' }
    ]
  },
  primaryType: 'Mail',
  domain: {
    name: 'Ether Mail',
    version: '1',
    chainId: 1,
    verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC'
  },
  message: {
    from: {
      name: 'Cow',
      wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826'
    },
    to: {
      name: 'Bob',
      wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB'
    },
    contents: 'Hello, Bob!'
  }
}

const TYPED_TYPES = {
  Person: TYPED_DATA.types.Person,
  Mail: TYPED_DATA.types.Mail
}

let frame: any
let provider: BrowserProvider

const waitForFrameConnect = () =>
  new Promise<void>((resolve, reject) => {
    if (frame.connected) return resolve()

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

beforeAll(async () => {
  frame = createFrameProvider('frame', { origin: 'eip8213.test', interval: 500 })
  await waitForFrameConnect()

  provider = new BrowserProvider({
    request: ({ method, params }: { method: string; params?: any[] }) => frame.request({ method, params })
  })
}, 30_000)

afterAll(() => {
  frame?.close()
})

test('ERC-8213 typed data signing', async () => {
  const [address] = await provider.send('eth_requestAccounts', [])
  const expectedDigest = TypedDataEncoder.hash(TYPED_DATA.domain, TYPED_TYPES, TYPED_DATA.message)

  const signaturePromise = provider.send('eth_signTypedData_v4', [address, JSON.stringify(TYPED_DATA)])
  console.log(JSON.stringify({ address, expectedDigest, label: 'EIP-712 Digest' }))

  const signature = await signaturePromise
  const recovered = verifyTypedData(TYPED_DATA.domain, TYPED_TYPES, TYPED_DATA.message, signature)

  expect(signature).toMatch(/^0x[0-9a-fA-F]{130}$/)
  expect(recovered.toLowerCase()).toBe(address.toLowerCase())
}, 120_000)
