import { describe, expect, it, mock } from 'bun:test'

import { createTestStore } from '../../../test/support/createTestStore'
import { createOperationService } from '../operations/service'
import { createPortfolioService } from './service'

const address = '0x1111111111111111111111111111111111111111'
const owner = { clientType: 'wallet-ui' as const, windowInstanceId: 'tray-test' }

describe('portfolio refresh service', () => {
  it('owns the projected lifecycle while preserving discovery and balance refresh behavior', async () => {
    const store = createTestStore({
      main: {
        currentAccount: address,
        accounts: { [address]: { id: address, address } },
        networks: { ethereum: { 1: { id: 1, on: true } } }
      }
    })
    const assetRates = [{ chainId: 1, address, usdRate: 2 }]
    const observe = mock()
    const refreshBalances = mock()
    const service = createPortfolioService({
      accounts: { refreshBalances } as never,
      assetRates: { get: mock(), observe },
      getTokenDiscoveryProvider: () => ({
        ok: true,
        provider: {
          getChainImage: mock(async () => undefined),
          getWalletPortfolio: mock(async () => ({
            totalValue: 0,
            absoluteChange1d: 0,
            percentChange1d: 0,
            chainValues: {},
            tokens: [],
            balances: [],
            assetRates
          }))
        }
      }),
      log: { warn: mock() },
      operations: createOperationService({ store: store.store, clock: { now: () => 1 } }),
      store: store.store
    })

    expect(await service.refresh('refresh-1', owner)).toBeTrue()
    expect(observe.mock.calls).toEqual([['zerion', assetRates]])
    expect(refreshBalances.mock.calls).toEqual([[address]])
    expect(store.getState().operations['refresh-1'].operation).toMatchObject({
      status: 'succeeded',
      phase: 'completed'
    })
  })
})
