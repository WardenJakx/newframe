import { powerMonitor } from 'electron'
import log from 'electron-log'

import store from '../store'
import Balances from './balances'
import { arraysMatch, debounce } from '../../resources/utils'
import { customTokens, tokensForAccount } from '../../resources/domain/token'

import type { Chain, Token } from '../store/state'

export interface DataScanner {
  close: () => void
  refreshBalances: (address?: Address) => void
  refreshPositions: (address: Address, chainId: number, tokens: Token[]) => void
}

const storeApi = {
  getActiveAddress: () => (store.getState().main.currentAccount || '') as Address,
  getAccount: (address: Address) =>
    store.getState().main.accounts[address] as { lastSignerType?: string } | undefined,
  getCustomTokens: () => customTokens(store.getState().main.tokens),
  getKnownTokens: (address?: Address) =>
    address ? tokensForAccount(store.getState().main.tokens, address).filter((token) => !token.custom) : [],
  getConnectedNetworks: () => {
    const networks = Object.values(store.getState().main.networks.ethereum || {}) as Chain[]
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
  let balancesRunning = false
  let systemSuspended = false
  let screenLocked = false

  const isSystemInactive = () => systemSuspended || screenLocked

  function clearPauseScanningDelay() {
    if (pauseScanningDelay) {
      clearTimeout(pauseScanningDelay)
      pauseScanningDelay = undefined
    }
  }

  function scannableAddress() {
    return activeAccount && shouldScanOnChain(activeAccount) ? activeAccount : ('' as Address)
  }

  function startBalances() {
    if (balancesRunning || isSystemInactive()) return

    balancesRunning = balances.start()
    if (balancesRunning) balances.setAddress(scannableAddress())
  }

  function stopBalances(reason: string) {
    clearPauseScanningDelay()
    balances.stop()

    if (!balancesRunning) return

    log.verbose(`stopping external data while system is ${reason}`)
    balancesRunning = false
  }

  function resumeBalances(reason: string) {
    if (isSystemInactive()) {
      log.verbose(`keeping external data stopped after system ${reason}`, { systemSuspended, screenLocked })
      return
    }

    log.verbose(`resuming external data after system ${reason}`)
    startBalances()

    if (!store.getState().tray.open && !pauseScanningDelay) {
      pauseScanningDelay = setTimeout(balances.pause, 1000)
    }
  }

  const handleSuspend = () => {
    systemSuspended = true
    stopBalances('suspending')
  }

  const handleResume = () => {
    systemSuspended = false
    resumeBalances('resumed')
  }

  const handleLockScreen = () => {
    screenLocked = true
    stopBalances('locked')
  }

  const handleUnlockScreen = () => {
    screenLocked = false
    resumeBalances('unlocked')
  }

  powerMonitor.on('suspend', handleSuspend)
  powerMonitor.on('resume', handleResume)
  powerMonitor.on('lock-screen', handleLockScreen)
  powerMonitor.on('unlock-screen', handleUnlockScreen)

  startBalances()

  const handleNetworkUpdate = debounce((newlyConnected: number[]) => {
    if (isSystemInactive()) return

    log.verbose('updating external data due to network update(s)', { connectedChains, newlyConnected })

    if (newlyConnected.length > 0 && activeAccount) {
      if (shouldScanOnChain(activeAccount)) {
        balances.addNetworks(activeAccount, newlyConnected)
      } else {
        balances.refresh(activeAccount)
      }
    }
  }, 500)

  const handleAddressUpdate = debounce(() => {
    if (isSystemInactive()) return

    log.verbose('updating external data due to address update(s)', { activeAccount })

    if (activeAccount && !shouldScanOnChain(activeAccount)) {
      balances.setAddress('' as Address)
      balances.refresh(activeAccount)
    } else {
      balances.setAddress(activeAccount)
    }
  }, 800)

  const handleTokensUpdate = debounce((tokens: Token[]) => {
    if (isSystemInactive()) return

    log.verbose('updating external data due to token update(s)', { activeAccount })

    if (activeAccount && shouldScanOnChain(activeAccount)) {
      balances.addTokens(activeAccount, tokens)
    }
  })

  const handleNetworksChange = () => {
    const connectedNetworkIds = storeApi
      .getConnectedNetworks()
      .map((n) => n.id)
      .sort()

    if (!arraysMatch(connectedChains, connectedNetworkIds)) {
      const newlyConnectedNetworks = connectedNetworkIds.filter((c) => !connectedChains.includes(c))
      connectedChains = connectedNetworkIds

      handleNetworkUpdate(newlyConnectedNetworks)
    }
  }
  handleNetworksChange()
  const unsubscribeNetworks = store.subscribe((state) => state.main.networks, handleNetworksChange)

  const handleAccountChange = () => {
    const activeAddress = storeApi.getActiveAddress()
    const knownTokens = storeApi.getKnownTokens(activeAddress)

    if (activeAddress !== activeAccount) {
      activeAccount = activeAddress
      handleAddressUpdate()
    } else {
      handleTokensUpdate(knownTokens)
    }
  }
  handleAccountChange()
  const unsubscribeAccount = store.subscribe(
    (state) => ({ currentAccount: state.main.currentAccount, tokens: state.main.tokens }),
    handleAccountChange,
    {
      equalityFn: (previous, current) =>
        previous.currentAccount === current.currentAccount && previous.tokens === current.tokens
    }
  )

  const handleCustomTokensChange = () => {
    const customTokens = storeApi.getCustomTokens()
    handleTokensUpdate(customTokens)
  }
  handleCustomTokensChange()
  const unsubscribeCustomTokens = store.subscribe((state) => state.main.tokens, handleCustomTokensChange)

  const handleTrayChange = () => {
    const open = store.getState().tray.open

    if (isSystemInactive()) return

    if (!open) {
      // pause balance scanning after the tray is out of view for one minute
      if (!pauseScanningDelay) {
        pauseScanningDelay = setTimeout(balances.pause, 1000)
      }
    } else {
      if (pauseScanningDelay) {
        clearPauseScanningDelay()

        balances.resume()
      }
    }
  }
  handleTrayChange()
  const unsubscribeTray = store.subscribe((state) => state.tray.open, handleTrayChange)

  return {
    refreshBalances: (address = activeAccount) => {
      if (!isSystemInactive() && address) balances.refresh(address)
    },
    refreshPositions: (address, chainId, tokens) => {
      if (!isSystemInactive() && address && shouldScanOnChain(address)) {
        balances.refreshPositions(address, chainId, tokens)
      }
    },
    close: () => {
      unsubscribeNetworks()
      unsubscribeAccount()
      unsubscribeCustomTokens()
      unsubscribeTray()

      powerMonitor.off('suspend', handleSuspend)
      powerMonitor.off('resume', handleResume)
      powerMonitor.off('lock-screen', handleLockScreen)
      powerMonitor.off('unlock-screen', handleUnlockScreen)

      balances.stop()
      balancesRunning = false

      clearPauseScanningDelay()
    }
  } as DataScanner
}
