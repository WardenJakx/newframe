import log from 'electron-log'

import store from '../store'
import Balances from './balances'
import { arraysMatch, debounce } from '../../resources/utils'

import type { Chain, Token } from '../store/state'

export interface DataScanner {
  close: () => void
  refreshBalances: (address?: Address) => void
}

const storeApi = {
  getActiveAddress: () => (store('selected.current') || '') as Address,
  getAccount: (address: Address) =>
    store('main.accounts', address) as { lastSignerType?: string } | undefined,
  getCustomTokens: () => (store('main.tokens.custom') || []) as Token[],
  getKnownTokens: (address?: Address) => ((address && store('main.tokens.known', address)) || []) as Token[],
  getConnectedNetworks: () => {
    const networks = Object.values(store('main.networks.ethereum') || {}) as Chain[]
    return networks.filter(
      (n) => (n.connection.primary || {}).connected || (n.connection.secondary || {}).connected
    )
  }
}

function shouldScanOnChain(address: Address) {
  const signerType = storeApi.getAccount(address)?.lastSignerType || ''
  return signerType.toLowerCase() !== 'address'
}

export default function () {
  const balances = Balances(store)

  let connectedChains: number[] = [],
    activeAccount: Address = ''
  let pauseScanningDelay: NodeJS.Timeout | undefined

  balances.start()

  const handleNetworkUpdate = debounce((newlyConnected: number[]) => {
    log.verbose('updating external data due to network update(s)', { connectedChains, newlyConnected })

    if (newlyConnected.length > 0 && activeAccount && shouldScanOnChain(activeAccount)) {
      balances.addNetworks(activeAccount, newlyConnected)
    }
  }, 500)

  const handleAddressUpdate = debounce(() => {
    log.verbose('updating external data due to address update(s)', { activeAccount })

    balances.setAddress(activeAccount && shouldScanOnChain(activeAccount) ? activeAccount : ('' as Address))
  }, 800)

  const handleTokensUpdate = debounce((tokens: Token[]) => {
    log.verbose('updating external data due to token update(s)', { activeAccount })

    if (activeAccount && shouldScanOnChain(activeAccount)) {
      balances.addTokens(activeAccount, tokens)
    }
  })

  const allNetworksObserver = store.observer(() => {
    const connectedNetworkIds = storeApi
      .getConnectedNetworks()
      .map((n) => n.id)
      .sort()

    if (!arraysMatch(connectedChains, connectedNetworkIds)) {
      const newlyConnectedNetworks = connectedNetworkIds.filter((c) => !connectedChains.includes(c))
      connectedChains = connectedNetworkIds

      handleNetworkUpdate(newlyConnectedNetworks)
    }
  }, 'externalData:networks')

  const activeAddressObserver = store.observer(() => {
    const activeAddress = storeApi.getActiveAddress()
    const knownTokens = storeApi.getKnownTokens(activeAddress)

    if (activeAddress !== activeAccount) {
      activeAccount = activeAddress
      handleAddressUpdate()
    } else {
      handleTokensUpdate(knownTokens)
    }
  }, 'externalData:activeAccount')

  const customTokensObserver = store.observer(() => {
    const customTokens = storeApi.getCustomTokens()
    handleTokensUpdate(customTokens)
  }, 'externalData:customTokens')

  const trayObserver = store.observer(() => {
    const open = store('tray.open')

    if (!open) {
      // pause balance scanning after the tray is out of view for one minute
      if (!pauseScanningDelay) {
        pauseScanningDelay = setTimeout(balances.pause, 1000)
      }
    } else {
      if (pauseScanningDelay) {
        clearTimeout(pauseScanningDelay)
        pauseScanningDelay = undefined

        balances.resume()
      }
    }
  }, 'externalData:tray')

  return {
    refreshBalances: (address = activeAccount) => {
      if (address && shouldScanOnChain(address)) balances.refresh(address)
    },
    close: () => {
      allNetworksObserver.remove()
      activeAddressObserver.remove()
      customTokensObserver.remove()
      trayObserver.remove()

      balances.stop()

      if (pauseScanningDelay) {
        clearTimeout(pauseScanningDelay)
      }
    }
  } as DataScanner
}
