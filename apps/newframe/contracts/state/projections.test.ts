import { describe, expect, it } from 'bun:test'

import {
  WalletActivityRecordSchema,
  WalletHomeCommandSchema,
  WalletOrderRecordSchema,
  WalletPanelNavigationEntrySchema,
  WalletRequestSchema
} from './projections'

describe('wallet renderer projection records', () => {
  it('keeps supported request presentation data and strips unowned fields', () => {
    expect(
      WalletRequestSchema.parse({
        type: 'transaction',
        handlerId: 'request-1',
        origin: 'https://example.test',
        data: { to: '0x1' },
        approvals: [{ type: 'spend', data: { amount: '1' }, approved: false }],
        authorization: {
          decision: 'autonomous',
          principal: {
            type: 'agent',
            origin: 'https://sensitive.example',
            sessionId: 'secret-session'
          }
        },
        futureCredential: 'must-not-cross-ipc'
      })
    ).toEqual({
      type: 'transaction',
      handlerId: 'request-1',
      origin: 'https://example.test',
      data: { to: '0x1' },
      approvals: [{ type: 'spend', data: { amount: '1' }, approved: false }]
    })
  })

  it('projects navigation as explicit identifiers and display data', () => {
    expect(
      WalletPanelNavigationEntrySchema.parse({
        view: 'requestView',
        data: {
          accountId: 'account-1',
          requestId: 'request-1',
          request: {
            origin: 'https://sensitive.example',
            authorization: { principal: { sessionId: 'secret-session' } }
          },
          futureNavigationField: 'must-not-cross-ipc'
        },
        futureNavigationField: 'must-not-cross-ipc'
      })
    ).toEqual({
      view: 'requestView',
      data: { accountId: 'account-1', requestId: 'request-1' }
    })

    expect(
      WalletHomeCommandSchema.parse({
        id: 1,
        view: 'addChain',
        data: {
          chain: {
            id: 1,
            name: 'Ethereum',
            symbol: 'ETH',
            primaryRpc: 'https://rpc.example',
            authorization: { principal: { sessionId: 'secret-session' } }
          },
          requestId: 'request-1',
          request: {
            origin: 'https://sensitive.example',
            authorization: { principal: { sessionId: 'secret-session' } }
          },
          futureNavigationField: 'must-not-cross-ipc'
        }
      })
    ).toEqual({
      id: 1,
      view: 'addChain',
      data: {
        chain: {
          id: 1,
          name: 'Ethereum',
          symbol: 'ETH',
          primaryRpc: 'https://rpc.example'
        },
        requestId: 'request-1'
      }
    })
  })

  it('keeps cohesive activity display data and strips unowned fields', () => {
    expect(
      WalletActivityRecordSchema.parse({
        id: 'activity-1',
        status: 'submitted',
        chainId: 1,
        decodedData: {
          contractName: 'Token',
          method: 'transfer',
          source: 'signature',
          futureCredential: 'must-not-cross-ipc'
        },
        futureCredential: 'must-not-cross-ipc'
      })
    ).toEqual({
      id: 'activity-1',
      status: 'submitted',
      chainId: 1,
      decodedData: {
        contractName: 'Token',
        method: 'transfer',
        source: 'signature'
      }
    })
  })

  it('keeps the complete order display contract and strips unowned fields', () => {
    expect(
      WalletOrderRecordSchema.parse({
        orderId: 'order-1',
        accountAddress: '0x1111111111111111111111111111111111111111',
        chainId: 1,
        provider: 'flash',
        status: 'open',
        orderType: 'market',
        side: 'buy',
        targetAsset: { symbol: 'ETH' },
        contraAsset: { symbol: 'USDC' },
        qty: '1',
        createdAt: 1,
        updatedAt: 2,
        futureCredential: 'must-not-cross-ipc'
      })
    ).toEqual({
      orderId: 'order-1',
      accountAddress: '0x1111111111111111111111111111111111111111',
      chainId: 1,
      provider: 'flash',
      status: 'open',
      orderType: 'market',
      side: 'buy',
      targetAsset: { symbol: 'ETH' },
      contraAsset: { symbol: 'USDC' },
      qty: '1',
      createdAt: 1,
      updatedAt: 2
    })
  })
})
