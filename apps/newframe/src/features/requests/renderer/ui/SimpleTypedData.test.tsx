import { describe, expect, test } from 'bun:test'

import { screen, render, fireEvent } from '../../../../../test/support/componentSetup'
import { createRendererStateFixture } from '../../../../../test/support/rendererState'
import SignTypedDataRequest from '../Account/Requests/SignTypedDataRequest'
import { SimpleTypedData } from './SimpleTypedData'

describe('SimpleTypedData', () => {
  test('renders the stored requester and favicon, with a fallback for failed images', () => {
    const favicon = 'data:image/png;base64,aWNvbg=='
    render(
      <SignTypedDataRequest
        req={{
          type: 'signTypedData',
          origin: 'origin-1',
          handlerId: 'request-1',
          account: '0x1',
          payload: { id: 1, jsonrpc: '2.0', method: 'eth_signTypedData_v4', params: [] },
          typedMessage: { data: { domain: { name: 'Different signed domain' } }, version: 'V4' }
        }}
      />,
      {
        rendererState: createRendererStateFixture({
          initialState: {
            origins: {
              'origin-1': {
                name: 'app.hyperliquid.xyz',
                image: { mimeType: 'image/png', base64: 'aWNvbg==' }
              }
            }
          }
        })
      }
    )

    expect(screen.getByText('app.hyperliquid.xyz')).toBeTruthy()
    const image = screen.getByRole('presentation')
    expect(image.getAttribute('src')).toBe(favicon)
    fireEvent.error(image)
    expect(screen.queryByRole('presentation')).toBeNull()
    expect(screen.getByText('app.hyperliquid.xyz')).toBeTruthy()
  })

  test('renders ERC-7730 clear signing rows with raw typed data fallback', () => {
    render(
      <SimpleTypedData
        originName='app.hyperliquid.xyz'
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
        originName='example.test'
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
        originName='example.test'
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
