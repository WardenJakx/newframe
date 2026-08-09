import { describe, expect, it } from 'bun:test'

import createCanonicalStore from '../../../platform/state-store/createCanonicalStore'
import { createTransactionSimulationProjection, effectsFromTrace } from './simulation'
import { erc20Interface } from '../../../shared/domain/evm'

const account = '0x35f9179059A691D8BEECf82Fe112F7277E018588'
const testContract = '0x0000000000000000000000000000000000001337'
const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

describe('#effectsFromTrace', () => {
  it('detects simulated ERC-20 asset out from an internal transferFrom call', async () => {
    const store = createCanonicalStore({
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined
    }).store
    store.setState((state) => {
      const token = {
        address: usdc.toLowerCase(),
        chainId: 31337,
        decimals: 6,
        name: 'Mock USD Coin',
        symbol: 'USDC',
        image: {
          base64: 'dG9rZW4taWNvbg==',
          contentHash: 'token-icon',
          mimeType: 'image/png'
        },
        custom: false,
        curated: false,
        sources: ['transaction' as const],
        updatedAt: 0
      }
      const tokenId = `${token.chainId}:${token.address}`
      state.main.tokens.byId[tokenId] = token
      state.main.tokens.accountTokenIds[account.toLowerCase()] = [tokenId]
    })

    const effects = await effectsFromTrace(
      {
        from: account,
        to: testContract,
        value: '0x0',
        input: '0x',
        calls: [
          {
            from: testContract,
            to: usdc,
            value: '0x0',
            input: erc20Interface.encodeFunctionData('transferFrom', [account, testContract, '25000000'])
          }
        ]
      },
      {
        handlerId: 'request-1',
        type: 'transaction',
        account: account.toLowerCase(),
        origin: 'newframe-contracts.local',
        payload: {} as any,
        approvals: [],
        feesUpdatedByUser: false,
        recipientType: 'contract',
        recognizedActions: [],
        classification: 'CONTRACT_CALL' as any,
        data: {
          chainId: '0x7a69',
          type: '0x2',
          gasFeesSource: 'Frame' as any,
          from: account,
          to: testContract,
          value: '0x0',
          data: '0x'
        }
      },
      { symbol: 'ETH', decimals: 18 },
      createTransactionSimulationProjection(store)
    )

    expect(effects).toStrictEqual([
      {
        id: `sim-erc20-${usdc.toLowerCase()}`,
        kind: 'erc20',
        direction: 'out',
        label: 'Asset out',
        amount: '0x17d7840',
        decimals: 6,
        symbol: 'USDC',
        detail: 'Simulated balance change',
        assetAddress: usdc.toLowerCase(),
        logoURI: 'data:image/png;base64,dG9rZW4taWNvbg=='
      }
    ])
  })

  it('uses recognized USDC metadata instead of assuming 18 decimals', async () => {
    const effects = await effectsFromTrace(
      {
        calls: [
          {
            from: account,
            to: usdc,
            input: erc20Interface.encodeFunctionData('transfer', [testContract, '133000000'])
          }
        ]
      },
      {
        handlerId: 'request-2',
        type: 'transaction',
        account: account.toLowerCase(),
        origin: 'example.test',
        payload: {} as any,
        approvals: [],
        feesUpdatedByUser: false,
        recipientType: 'contract',
        classification: 'CONTRACT_CALL' as any,
        recognizedActions: [
          {
            id: 'erc20:transfer',
            data: {
              amount: '0x7ed6b40',
              contract: usdc,
              decimals: 6,
              name: 'USD Coin',
              symbol: 'USDC'
            }
          }
        ],
        data: {
          chainId: '0x1',
          type: '0x2',
          gasFeesSource: 'Frame' as any,
          from: account,
          to: usdc,
          value: '0x0',
          data: erc20Interface.encodeFunctionData('transfer', [testContract, '133000000'])
        }
      },
      { symbol: 'ETH', decimals: 18 },
      { getNativeCurrency: () => ({}), getToken: () => undefined }
    )

    expect(effects).toEqual([
      expect.objectContaining({
        kind: 'erc20',
        amount: '0x7ed6b40',
        decimals: 6,
        symbol: 'USDC',
        assetAddress: usdc.toLowerCase()
      })
    ])
  })

  it('uses canonical token metadata seeded by an internal send', async () => {
    const effects = await effectsFromTrace(
      {
        calls: [
          {
            from: account,
            to: usdc,
            input: erc20Interface.encodeFunctionData('transfer', [testContract, '134553460'])
          }
        ]
      },
      {
        handlerId: 'request-internal-send',
        type: 'transaction',
        account: account.toLowerCase(),
        origin: 'newframe-internal',
        payload: {} as any,
        approvals: [],
        feesUpdatedByUser: false,
        recipientType: 'contract',
        recognizedActions: [],
        classification: 'CONTRACT_CALL' as any,
        tokenData: { decimals: 6, name: 'USD Coin', symbol: 'USDC' },
        data: {
          chainId: '0x2105',
          type: '0x2',
          gasFeesSource: 'Frame' as any,
          from: account,
          to: usdc,
          value: '0x0',
          data: erc20Interface.encodeFunctionData('transfer', [testContract, '134553460'])
        }
      },
      { symbol: 'ETH', decimals: 18 },
      { getNativeCurrency: () => ({}), getToken: () => undefined }
    )

    expect(effects).toEqual([
      expect.objectContaining({
        kind: 'erc20',
        amount: '0x8051f74',
        decimals: 6,
        symbol: 'USDC',
        assetAddress: usdc.toLowerCase()
      })
    ])
  })

  it('leaves decimals unknown when token metadata is unavailable', async () => {
    const effects = await effectsFromTrace(
      {
        calls: [
          {
            from: account,
            to: usdc,
            input: erc20Interface.encodeFunctionData('transfer', [testContract, '133000000'])
          }
        ]
      },
      {
        handlerId: 'request-3',
        type: 'transaction',
        account: account.toLowerCase(),
        origin: 'example.test',
        payload: {} as any,
        approvals: [],
        feesUpdatedByUser: false,
        recipientType: 'contract',
        recognizedActions: [],
        classification: 'CONTRACT_CALL' as any,
        data: {
          chainId: '0x1',
          type: '0x2',
          gasFeesSource: 'Frame' as any,
          from: account,
          to: usdc,
          value: '0x0',
          data: '0x'
        }
      },
      { symbol: 'ETH', decimals: 18 },
      { getNativeCurrency: () => ({}), getToken: () => undefined }
    )

    expect(effects[0]).toMatchObject({ symbol: 'Token' })
    expect(effects[0]).not.toHaveProperty('decimals')
  })
})
