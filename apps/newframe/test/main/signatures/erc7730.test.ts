import { beforeEach, describe, expect, test } from 'bun:test'

import { SignTypedDataVersion } from '@metamask/eth-sig-util'

import {
  clearErc7730Caches,
  formatErc7730TypedData,
  getEip712EncodeType,
  getEip712EncodeTypeHash,
  getErc7730TypedDataDisplay
} from '../../../main/signatures/erc7730'

const VERIFYING_CONTRACT = '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC'
const OWNER = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
const SPENDER = '0x1111111254eeb25477b68fb85ed929f73a960582'

const TYPED_DATA = {
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' }
    ],
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }
    ]
  },
  primaryType: 'Permit',
  domain: {
    name: 'USD Coin',
    version: '2',
    chainId: 1,
    verifyingContract: VERIFYING_CONTRACT
  },
  message: {
    owner: OWNER,
    spender: SPENDER,
    value: '1000000',
    nonce: 1,
    deadline: 1700000000
  }
}

const DESCRIPTOR = {
  context: {
    eip712: {
      domain: {
        chainId: 1,
        verifyingContract: VERIFYING_CONTRACT
      }
    }
  },
  metadata: {
    token: {
      name: 'USD Coin',
      ticker: 'USDC',
      decimals: 6
    }
  },
  display: {
    formats: {
      'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)': {
        intent: 'Permit token spend',
        interpolatedIntent: 'Permit {spender} to spend {value}',
        fields: [
          {
            path: 'spender',
            label: 'Spender',
            format: 'addressName'
          },
          {
            path: 'value',
            label: 'Amount',
            format: 'tokenAmount',
            params: { tokenPath: '@.verifyingContract' }
          },
          {
            path: 'deadline',
            label: 'Expires',
            format: 'date',
            params: { encoding: 'timestamp' }
          }
        ]
      }
    }
  }
}

describe('ERC-7730 typed data clear signing', () => {
  beforeEach(() => {
    clearErc7730Caches()
  })

  test('builds the EIP-712 encode type used for descriptor matching', () => {
    expect(getEip712EncodeType(TYPED_DATA.types, TYPED_DATA.primaryType)).toBe(
      'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'
    )
  })

  test('formats a matching descriptor into clear signing rows', () => {
    const display = formatErc7730TypedData({ data: TYPED_DATA, version: SignTypedDataVersion.V4 }, DESCRIPTOR)

    expect(display?.title).toBe('Permit token spend')
    expect(display?.summary).toBe('Permit 0x1111111254EEB25477B68fb85Ed929f73A960582 to spend 1.0 USDC')
    expect(display?.rows).toEqual([
      {
        label: 'Spender',
        value: '0x1111111254EEB25477B68fb85Ed929f73A960582',
        path: 'spender',
        format: 'addressName'
      },
      {
        label: 'Amount',
        value: '1.0 USDC',
        path: 'value',
        format: 'tokenAmount'
      },
      {
        label: 'Expires',
        value: '2023-11-14T22:13:20.000Z',
        path: 'deadline',
        format: 'date'
      }
    ])
  })

  test('does not apply a descriptor bound to a different domain', () => {
    const display = formatErc7730TypedData(
      { data: TYPED_DATA, version: SignTypedDataVersion.V4 },
      {
        ...DESCRIPTOR,
        context: {
          eip712: {
            domain: {
              chainId: 5,
              verifyingContract: VERIFYING_CONTRACT
            }
          }
        }
      }
    )

    expect(display).toBeUndefined()
  })

  test('loads a registry descriptor by chain, verifying contract, primary type, and encode type hash', async () => {
    const descriptorPath = 'registry/test/eip712-permit.json'
    const encodeTypeHash = getEip712EncodeTypeHash(TYPED_DATA.types, TYPED_DATA.primaryType)
    const fetcher = async (url: string | URL | Request) => {
      const href = url.toString()
      if (href.endsWith('/index.eip712.json')) {
        return new Response(
          JSON.stringify({
            [`eip155:1:${VERIFYING_CONTRACT.toLowerCase()}`]: {
              Permit: [{ path: descriptorPath, encodeTypeHashes: [encodeTypeHash] }]
            }
          })
        )
      }

      if (href.endsWith(`/${descriptorPath}`)) {
        return new Response(JSON.stringify(DESCRIPTOR))
      }

      return new Response('not found', { status: 404 })
    }

    const display = await getErc7730TypedDataDisplay(
      { data: TYPED_DATA, version: SignTypedDataVersion.V4 },
      fetcher as typeof fetch
    )

    expect(display?.descriptorPath).toBe(descriptorPath)
    expect(display?.summary).toContain('to spend 1.0 USDC')
  })
})
