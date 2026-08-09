import type { Accounts } from '../../accounts/main/index.js'
import type { TokenDiscoveryProviderAccess } from './index.js'
import type { CanonicalStore } from '../../../platform/state-store/actions.js'
import type { FlashService } from '../../transactions/trade/main/index.js'
import type { AssetRateService } from '../../asset-data/main/assetRates/service.js'
import type { OperationService } from '../../../platform/operations/service.js'
import type { OperationOwner, OperationReference } from '../../../platform/operations/types.js'

type PortfolioState = Pick<
  CanonicalStore,
  'accountTokensUpdated' | 'main' | 'setPortfolioBalances' | 'upsertTokens'
>

export interface PortfolioServicePorts {
  accounts: Pick<Accounts, 'refreshBalances'>
  assetRates: AssetRateService
  flash: Pick<FlashService, 'listOrders'>
  getTokenDiscoveryProvider(): TokenDiscoveryProviderAccess
  log: { warn(message: string, details?: unknown): void }
  operations: OperationService
  store: { getState(): PortfolioState }
}

export type PortfolioServiceAdapters = Pick<PortfolioServicePorts, 'getTokenDiscoveryProvider' | 'log'>

export function createPortfolioService(ports: PortfolioServicePorts) {
  return {
    async refresh(operationId: string, owner: OperationOwner) {
      const reference: OperationReference = { owner, id: operationId, type: 'portfolio.refresh' }
      if (ports.operations.lookup(reference)) return true

      const initialState = ports.store.getState()
      const initialAccount = initialState.main.accounts[initialState.main.currentAccount || '']
      try {
        ports.operations.start({
          id: reference.id,
          type: reference.type,
          owner,
          phase: 'refreshing',
          ...(initialAccount?.address
            ? { entityRefs: [{ type: 'account' as const, id: initialAccount.address.toLowerCase() }] }
            : {})
        })
      } catch {
        return false
      }

      const fail = (code: string, message: string) => {
        ports.operations.fail(reference, { code, message })
        return true
      }

      const state = ports.store.getState()
      const account = state.main.accounts[state.main.currentAccount || '']
      if (!account?.address) return fail('account_not_found', 'No account is selected.')

      const address = account.address.toLowerCase() as Address
      const chainIds = Object.values(state.main.networks.ethereum)
        .filter((network) => network.on)
        .map((network) => network.id)
      const discovery = ports.getTokenDiscoveryProvider()

      try {
        await ports.flash.listOrders({ accountAddress: address, pageSize: 200 })
      } catch (error) {
        ports.log.warn(`Could not refresh Flash orders for ${address}`, error)
      }

      if (discovery.ok) {
        try {
          const portfolio = await discovery.provider.getWalletPortfolio(address, chainIds, { sync: true })
          if (portfolio.tokens.length) {
            state.upsertTokens(portfolio.tokens, { account: address, source: 'portfolio' })
          }
          if (portfolio.balances.length) {
            state.setPortfolioBalances(address, portfolio.balances)
            state.accountTokensUpdated(address)
          }
          ports.assetRates.observe('zerion', portfolio.assetRates)
        } catch (error) {
          ports.log.warn(`Could not refresh portfolio provider balances for ${address}`, error)
        }
      }

      try {
        ports.accounts.refreshBalances(address)
        ports.operations.complete(reference, 'completed')
      } catch {
        return fail('refresh_failed', 'Could not refresh account balances.')
      }
      return true
    }
  }
}

export type PortfolioService = ReturnType<typeof createPortfolioService>
