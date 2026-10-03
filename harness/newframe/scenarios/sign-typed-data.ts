import { BrowserProvider, TypedDataEncoder, verifyTypedData } from 'ethers'

import { HarnessExtension } from '../core/extension.ts'

const NEWFRAME_URL = 'http://127.0.0.1:1248'

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

let extension: HarnessExtension
let provider: BrowserProvider

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string') {
    throw new Error(`${label} returned a non-string value`)
  }
  return value
}

function requireFirstAddress(value: unknown) {
  if (!Array.isArray(value) || typeof value[0] !== 'string') {
    throw new Error('eth_requestAccounts returned no address')
  }
  return value[0]
}

async function main() {
  extension = await HarnessExtension.connect(NEWFRAME_URL)
  try {
    provider = new BrowserProvider(extension.eip1193('https://eip8213.test'))

    const address = requireFirstAddress(await provider.send('eth_requestAccounts', []))
    const expectedDigest = TypedDataEncoder.hash(TYPED_DATA.domain, TYPED_TYPES, TYPED_DATA.message)
    const signaturePromise = provider.send('eth_signTypedData_v4', [address, JSON.stringify(TYPED_DATA)])
    console.log(JSON.stringify({ address, expectedDigest, label: 'EIP-712 Digest' }))

    const signature = requireString(await signaturePromise, 'eth_signTypedData_v4')
    const recovered = verifyTypedData(TYPED_DATA.domain, TYPED_TYPES, TYPED_DATA.message, signature)
    if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
      throw new Error('Invalid typed-data signature')
    }
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      throw new Error(`Signature recovered ${recovered}; expected ${address}`)
    }
  } finally {
    extension.close()
  }
}

await main()
