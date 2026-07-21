import { describe, expect, test } from 'bun:test'

import { screen, render } from '../../../componentSetup'
import { SimpleTypedData } from '../../../../resources/Components/SimpleTypedData'

describe('SimpleTypedData', () => {
  test('renders ERC-7730 clear signing rows with raw typed data fallback', () => {
    render(
      <SimpleTypedData
        req={{
          type: 'signTypedData',
          typedMessage: {
            data: {
              domain: { name: 'USD Coin' },
              message: { spender: '0x1111111254eeb25477b68fb85ed929f73a960582' }
            }
          },
          digests: {
            eip712Digest: '0x1234'
          },
          erc7730: {
            title: 'Permit token spend',
            summary: 'Permit spender to spend 1.0 USDC',
            rows: [
              {
                label: 'Spender',
                value: '0x1111111254EEB25477B68fb85Ed929f73A960582'
              },
              {
                label: 'Amount',
                value: '1.0 USDC'
              }
            ]
          }
        }}
      />
    )

    expect(screen.getByText('ERC-7730 Clear Signing')).toBeTruthy()
    expect(screen.getByText('Permit spender to spend 1.0 USDC')).toBeTruthy()
    expect(screen.getByText('Raw Typed Data')).toBeTruthy()
    expect(screen.getByText('EIP-712 Digest')).toBeTruthy()
  })

  test('renders nested EIP-712 message leaf fields instead of empty object rows', () => {
    render(
      <SimpleTypedData
        req={{
          type: 'signTypedData',
          typedMessage: {
            data: {
              domain: {
                name: 'Ether Mail',
                version: '1'
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
                contents: 'Hello, Bob!',
                encoded: '0x48656c6c6f2c20426f6221'
              }
            }
          }
        }}
      />
    )

    expect(screen.getByText('Message')).toBeTruthy()
    expect(screen.queryByText('from')).toBeNull()
    expect(screen.getByText('from name')).toBeTruthy()
    expect(screen.getByText('Cow')).toBeTruthy()
    expect(screen.getByText('from wallet')).toBeTruthy()
    expect(screen.getByText('contents')).toBeTruthy()
    expect(screen.getByText('Hello, Bob!')).toBeTruthy()
    expect(screen.getByText('Hello, Bob! (0x48656c6c6f2c20426f6221)')).toBeTruthy()
  })

  test('does not render an empty Message section when there are no message fields', () => {
    render(
      <SimpleTypedData
        req={{
          type: 'signTypedData',
          typedMessage: {
            data: {
              domain: { name: 'Ether Mail' },
              message: {}
            }
          }
        }}
      />
    )

    expect(screen.getByText('Domain')).toBeTruthy()
    expect(screen.queryByText('Message')).toBeNull()
  })
})
