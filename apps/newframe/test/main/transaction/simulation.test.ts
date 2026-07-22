import { describe, expect, it } from 'bun:test'

import store from '../../../main/store'
import { effectsFromTrace } from '../../../main/transaction/simulation'
import { erc20Interface } from '../../../resources/contracts'

const account = '0x35f9179059A691D8BEECf82Fe112F7277E018588'
const testContract = '0x0000000000000000000000000000000000001337'
const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

describe('#effectsFromTrace', () => {
  it('detects simulated ERC-20 asset out from an internal transferFrom call', async () => {
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
      { symbol: 'ETH', decimals: 18 }
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
})
