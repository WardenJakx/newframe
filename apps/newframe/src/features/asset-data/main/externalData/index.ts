import { powerMonitor } from 'electron'
import log from 'electron-log'

import type { CanonicalStoreReader } from '../../../../platform/state-store/actions.js'
import type { Token } from '../../../../platform/state-store/state/index.js'
import { debounce } from '../../../../shared/domain/async.js'
import { arraysMatch } from '../../../../shared/domain/collections.js'
import { customTokens, tokensForAccount } from '../../../tokens/domain/index.js'
import Balances from './balances/index.js'

export interface DataScanner {
  close: () => void
  refreshBalances: (address?: Address) => void
  refreshPositions: (address: Address, chainId: number, tokens: Token[]) => void
}

export default function createExternalDataScanner(canonicalStore: CanonicalStoreReader): DataScanner {
  const storeApi = {
    getActiveAddress: () => canonicalStore.getState().main.currentAccount || '',
    getAccount: (address: Address) =>
      canonicalStore.getState().main.accounts[address] as { lastSignerType?: string } | undefined,
    getCustomTokens: () => customTokens(canonicalStore.getState().main.tokens),
    getKnownTokens: (address?: Address) =>
      address
        ? tokensForAccount(canonicalStore.getState().main.tokens, address).filter((token) => !token.custom)
        : [],
    getConnectedNetworks: () => {
      const networks = Object.values(canonicalStore.getState().main.networks.ethereum || {})
      return networks.filter(
        (network) => network.connection.primary?.connected || network.connection.secondary?.connected
      )
    }
  }
  const shouldScanOnChain = (address: Address) => {
    const signerType = storeApi.getAccount(address)?.lastSignerType ?? ''
    return signerType.toLowerCase() !== 'address'
  }
  const scanningAllowed = () => {
    const { locked, vaultExists } = canonicalStore.getState().main.appLock
    return vaultExists && !locked
  }
  const balances = Balances(canonicalStore)

  let connectedChains: number[] = [],
    activeAccount: Address = ''
  let pauseScanningDelay: NodeJS.Timeout | undefined
  let balancesRunning = false
  let systemSuspended = false
  let screenLocked = false

  const isScannerInactive = () => systemSuspended || screenLocked || !scanningAllowed()

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
    if (balancesRunning || isScannerInactive()) {
      return balancesRunning
    }

    balancesRunning = balances.start()
    if (balancesRunning) {
      const address = scannableAddress()
      balances.setAddress(address)
      if (activeAccount && !address) {
        balances.refresh(activeAccount)
      }
    }

    return balancesRunning
  }

  function stopBalances(reason: string) {
    clearPauseScanningDelay()
    handleNetworkUpdate.cancel()
    handleAddressUpdate.cancel()
    handleTokensUpdate.cancel()
    balances.stop()

    if (!balancesRunning) {
      return
    }

    log.verbose(`stopping external data while system is ${reason}`)
    balancesRunning = false
  }

  function resumeBalances(reason: string) {
    if (isScannerInactive()) {
      log.verbose(`keeping external data stopped after ${reason}`, {
        systemSuspended,
        screenLocked,
        scanningAllowed: scanningAllowed()
      })
      return
    }

    log.verbose(`resuming external data after system ${reason}`)
    startBalances()

    if (!canonicalStore.getState().tray.open && !pauseScanningDelay) {
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

  const handleScanningPermissionChange = (allowed: boolean) => {
    if (allowed) {
      resumeBalances('wallet unlocked')
    } else {
      stopBalances('wallet locked')
    }
  }
  const unsubscribeScanningPermission = canonicalStore.subscribe(
    (state) => state.main.appLock.vaultExists && !state.main.appLock.locked,
    handleScanningPermissionChange
  )

  const handleNetworkUpdate = debounce((newlyConnected: number[]) => {
    if (isScannerInactive()) {
      return
    }

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
    if (isScannerInactive()) {
      return
    }

    log.verbose('updating external data due to address update(s)', { activeAccount })

    if (activeAccount && !shouldScanOnChain(activeAccount)) {
      balances.setAddress('')
      balances.refresh(activeAccount)
    } else {
      balances.setAddress(activeAccount)
    }
  }, 800)

  const handleTokensUpdate = debounce((tokens: Token[]) => {
    if (isScannerInactive()) {
      return
    }

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
  const unsubscribeNetworks = canonicalStore.subscribe((state) => state.main.networks, handleNetworksChange)

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
  const unsubscribeAccount = canonicalStore.subscribe(
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
  const unsubscribeCustomTokens = canonicalStore.subscribe(
    (state) => state.main.tokens,
    handleCustomTokensChange
  )

  const handleTrayChange = () => {
    const open = canonicalStore.getState().tray.open

    if (isScannerInactive()) {
      return
    }

    if (!open) {
      // pause balance scanning after the tray is out of view for one minute
      pauseScanningDelay ??= setTimeout(balances.pause, 1000)
    } else {
      if (pauseScanningDelay) {
        clearPauseScanningDelay()

        balances.resume()
      }
    }
  }
  handleTrayChange()
  const unsubscribeTray = canonicalStore.subscribe((state) => state.tray.open, handleTrayChange)

  return {
    refreshBalances: (address = activeAccount) => {
      if (isScannerInactive() || !address) {
        return
      }

      if (!balancesRunning && !startBalances()) {
        return
      }
      balances.refresh(address)
    },
    refreshPositions: (address, chainId, tokens) => {
      if (isScannerInactive() || !address || !shouldScanOnChain(address)) {
        return
      }

      if (!balancesRunning && !startBalances()) {
        return
      }
      balances.refreshPositions(address, chainId, tokens)
    },
    close: () => {
      handleNetworkUpdate.cancel()
      handleAddressUpdate.cancel()
      handleTokensUpdate.cancel()

      unsubscribeNetworks()
      unsubscribeAccount()
      unsubscribeCustomTokens()
      unsubscribeTray()
      unsubscribeScanningPermission()

      powerMonitor.off('suspend', handleSuspend)
      powerMonitor.off('resume', handleResume)
      powerMonitor.off('lock-screen', handleLockScreen)
      powerMonitor.off('unlock-screen', handleUnlockScreen)

      balances.stop()
      balancesRunning = false

      clearPauseScanningDelay()
    }
  }
}
