import { describe, expect, it, mock } from 'bun:test'

import { createTestStore } from '../../../../test/support/createTestStore'
import { createOperationService } from '../../../platform/operations/service'
import { createPortfolioService } from './service'

const address = '0x1111111111111111111111111111111111111111'
const owner = { clientType: 'wallet-ui' as const, windowInstanceId: 'tray-test' }

describe('portfolio refresh service', () => {
  it('lists orders only on manual refresh for the selected account', async () => {
    const store = createTestStore({
      main: {
        currentAccount: '',
        accounts: { [address]: { id: address, address } },
        networks: { ethereum: { 1: { id: 1, on: true } } }
      }
    })
    const assetRates = [{ chainId: 1, address, usdRate: 2 }]
    const observe = mock()
    const refreshBalances = mock()
    const listOrders = mock(async (_request: { accountAddress?: string; pageSize?: number }) => ({
      orders: []
    }))
    const service = createPortfolioService({
      accounts: { refreshBalances } as never,
      assetRates: { get: mock(), observe },
      flash: { listOrders } as never,
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

    expect(listOrders.mock.calls).toEqual([])
    store.store.setState((state) => {
      state.main.currentAccount = address
    })
    expect(listOrders.mock.calls).toEqual([])

    expect(await service.refresh('refresh-1', owner)).toBeTrue()
    expect(listOrders.mock.calls).toEqual([[{ accountAddress: address, pageSize: 200 }]])
    expect(observe.mock.calls).toEqual([['zerion', assetRates]])
    expect(refreshBalances.mock.calls).toEqual([[address]])
    expect(store.getState().operations['refresh-1'].operation).toMatchObject({
      status: 'succeeded',
      phase: 'completed'
    })
  })

  it('logs order-list failure while discovery and balance refresh still complete', async () => {
    const store = createTestStore({
      main: {
        currentAccount: address,
        accounts: { [address]: { id: address, address } },
        networks: { ethereum: { 1: { id: 1, on: true } } }
      }
    })
    const listError = new Error('Flash unavailable')
    const listOrders = mock(async (_request: { accountAddress?: string; pageSize?: number }) => {
      throw listError
    })
    const getWalletPortfolio = mock(async () => ({
      totalValue: 0,
      absoluteChange1d: 0,
      percentChange1d: 0,
      chainValues: {},
      tokens: [],
      balances: [],
      assetRates: []
    }))
    const refreshBalances = mock()
    const warn = mock()
    const service = createPortfolioService({
      accounts: { refreshBalances } as never,
      assetRates: { get: mock(), observe: mock() },
      flash: { listOrders } as never,
      getTokenDiscoveryProvider: () => ({
        ok: true,
        provider: {
          getChainImage: mock(async () => undefined),
          getWalletPortfolio
        }
      }),
      log: { warn },
      operations: createOperationService({ store: store.store, clock: { now: () => 1 } }),
      store: store.store
    })

    expect(await service.refresh('refresh-failure', owner)).toBeTrue()
    expect(listOrders.mock.calls).toEqual([[{ accountAddress: address, pageSize: 200 }]])
    expect(warn.mock.calls).toEqual([[`Could not refresh Flash orders for ${address}`, listError]])
    expect(getWalletPortfolio.mock.calls).toHaveLength(1)
    expect(refreshBalances.mock.calls).toEqual([[address]])
    expect(store.getState().operations['refresh-failure'].operation).toMatchObject({
      status: 'succeeded',
      phase: 'completed'
    })
  })
})
