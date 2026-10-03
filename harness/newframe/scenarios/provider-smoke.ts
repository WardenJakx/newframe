import { BrowserProvider, hexlify, isAddress, toUtf8Bytes } from 'ethers'

import { HarnessExtension } from '../core/extension.ts'

const NEWFRAME_URL = 'http://127.0.0.1:1248'

let extension: HarnessExtension
let provider: BrowserProvider

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`)
  }
  return value
}

function requireAddress(value: unknown, label: string) {
  const address = requireString(value, label)
  if (!isAddress(address)) {
    throw new Error(`${label} must be an address`)
  }
  return address
}

async function main() {
  extension = await HarnessExtension.connect(NEWFRAME_URL)
  const getFirstSigner = async () => {
    const signer: Awaited<ReturnType<BrowserProvider['listAccounts']>>[number] | undefined = (
      await provider.listAccounts()
    ).at(0)
    if (!signer) {
      throw new Error('No account available')
    }
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
    const signed = requireString(
      await provider.send('personal_sign', [hexMessage, address]),
      'personal_sign result'
    )
    const result = requireAddress(
      await provider.send('personal_ecRecover', [hexMessage, signed]),
      'personal_ecRecover result'
    )

    assertRecovered(result, address, 'personal_sign')
    console.log(JSON.stringify({ address, msg: message, sig: signed, version: '2' }))
  }

  async function signEth() {
    const message = 'Frame Test'
    const hexMessage = hexlify(toUtf8Bytes(message))
    const signer = await getFirstSigner()
    const address = await signer.getAddress()
    const signed = requireString(await provider.send('eth_sign', [address, hexMessage]), 'eth_sign result')
    const result = requireAddress(
      await provider.send('personal_ecRecover', [hexMessage, signed]),
      'personal_ecRecover result'
    )

    assertRecovered(result, address, 'eth_sign')
    console.log(JSON.stringify({ address, msg: message, sig: signed, version: '2' }))
  }

  try {
    provider = new BrowserProvider(extension.eip1193('https://frame.test'))
    await provider.send('eth_accounts', [])

    const signer = await getFirstSigner()
    const tx = await signer.sendTransaction({
      value: 1_000_000_000_000n,
      to: '0x030e6af4985f111c265ee3a279e5a9f6aa124fd5'
    })
    if (!/^0x[0-9a-fA-F]{64}$/.test(tx.hash)) {
      throw new Error(`Invalid transaction hash: ${tx.hash}`)
    }

    await signPersonal()
    await signEth()
  } finally {
    extension.close()
  }
}

await main()
