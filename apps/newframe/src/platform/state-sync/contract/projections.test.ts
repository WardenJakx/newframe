import { describe, expect, it } from 'bun:test'

import {
  WalletActivityRecordSchema,
  WalletHomeCommandSchema,
  WalletOrderRecordSchema,
  WalletPanelNavigationEntrySchema,
  WalletRequestSchema,
  WalletStatusNotificationSchema
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
        approvalGate: {
          type: 'signer-compatibility',
          reason: 'incompatible',
          signer: 'ledger',
          tx: 'london',
          chain: { type: 'ethereum', id: 1 }
        },
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
      approvals: [{ type: 'spend', data: { amount: '1' }, approved: false }],
      approvalGate: {
        type: 'signer-compatibility',
        reason: 'incompatible',
        signer: 'ledger',
        tx: 'london',
        chain: { type: 'ethereum', id: 1 }
      }
    })

    expect(
      WalletRequestSchema.safeParse({
        type: 'transaction',
        handlerId: 'request-1',
        approvalGate: {
          type: 'gas-fee',
          feeUSD: '51.00',
          currentSymbol: 'ETH',
          privatePolicyState: 'must-not-cross-ipc'
        }
      }).success
    ).toBeFalse()
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
            icon: 'https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg',
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
          icon: 'https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg',
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
        gasSpent: '0x5208',
        balanceChanges: [
          {
            id: 'usdc-out',
            kind: 'erc20',
            direction: 'out',
            label: 'Asset out',
            amount: '0x1',
            decimals: 6,
            symbol: 'USDC',
            futureCredential: 'must-not-cross-ipc'
          }
        ],
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
      },
      gasSpent: '0x5208',
      balanceChanges: [
        {
          id: 'usdc-out',
          kind: 'erc20',
          direction: 'out',
          label: 'Asset out',
          amount: '0x1',
          decimals: 6,
          symbol: 'USDC'
        }
      ]
    })
  })

  it('keeps the complete order display contract and strips unowned fields', () => {
    expect(
      WalletOrderRecordSchema.parse({
        orderId: 'order-1',
        accountAddress: '0x1111111111111111111111111111111111111111',
        provider: 'flash',
        status: 'open',
        orderType: 'market',
        side: 'buy',
        targetAsset: { symbol: 'ETH', chainId: 1 },
        contraAsset: { symbol: 'USDC', chainId: 8453 },
        qty: '1',
        createdAt: 1,
        updatedAt: 2,
        futureCredential: 'must-not-cross-ipc'
      })
    ).toEqual({
      orderId: 'order-1',
      accountAddress: '0x1111111111111111111111111111111111111111',
      provider: 'flash',
      status: 'open',
      orderType: 'market',
      side: 'buy',
      targetAsset: { symbol: 'ETH', chainId: 1 },
      contraAsset: { symbol: 'USDC', chainId: 8453 },
      qty: '1',
      createdAt: 1,
      updatedAt: 2
    })

    expect(
      WalletOrderRecordSchema.safeParse({
        orderId: 'scalar-only',
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
      }).success
    ).toBeFalse()
  })

  it('keeps notification presentation and navigation data while stripping unowned fields', () => {
    expect(
      WalletStatusNotificationSchema.parse({
        id: 'flash-order:order-1',
        state: 'pending',
        title: 'Buy WETH Market Order',
        detail: '1 USDC -> 0.0003 WETH',
        createdAt: 100,
        updatedAt: 200,
        expiresAt: 300,
        hidden: false,
        leadingIcon: {
          chainId: 1,
          chainType: 'ethereum',
          futureCredential: 'must-not-cross-ipc'
        },
        target: {
          type: 'flashOrder',
          orderId: 'order-1',
          account: '0x1111111111111111111111111111111111111111',
          chainId: 1,
          chainType: 'ethereum',
          futureCredential: 'must-not-cross-ipc'
        },
        metadata: {
          orderId: 'order-1',
          status: 'open',
          orderType: 'market',
          side: 'buy',
          futureCredential: 'must-not-cross-ipc'
        },
        futureCredential: 'must-not-cross-ipc'
      })
    ).toEqual({
      id: 'flash-order:order-1',
      state: 'pending',
      title: 'Buy WETH Market Order',
      detail: '1 USDC -> 0.0003 WETH',
      createdAt: 100,
      updatedAt: 200,
      expiresAt: 300,
      hidden: false,
      leadingIcon: { chainId: 1, chainType: 'ethereum' },
      target: {
        type: 'flashOrder',
        orderId: 'order-1',
        account: '0x1111111111111111111111111111111111111111',
        chainId: 1,
        chainType: 'ethereum'
      },
      metadata: {
        orderId: 'order-1',
        status: 'open',
        orderType: 'market',
        side: 'buy'
      }
    })
  })
})
