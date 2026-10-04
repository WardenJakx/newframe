import log from 'electron-log'

import type { InternetGate } from '../../../../platform/internet/index.ts'
import type { CanonicalStoreReader } from '../../../../platform/state-store/actions.ts'
import type { Token } from '../../../../platform/state-store/state/index.ts'
import type { Address } from '../../../../shared/domain/address.ts'
import { debounce } from '../../../../shared/domain/async.ts'
import { arraysMatch } from '../../../../shared/domain/collections.ts'
import { customTokens, tokensForAccount } from '../../../tokens/domain/index.ts'
import Balances from './balances/index.ts'

export interface DataScanner {
  close: () => void
  refreshBalances: (address?: Address) => void
  refreshPositions: (address: Address, chainId: number, tokens: Token[]) => void
}

export default function createExternalDataScanner(
  canonicalStore: CanonicalStoreReader,
  internet: InternetGate,
  registerTokens?: Parameters<typeof Balances>[1]
): DataScanner {
  const storeApi = {
    getActiveAddress: () => canonicalStore.getState().main.currentAccount || '',
    getAccount: (address: Address) =>
      canonicalStore.getState().main.accounts[address] as { lastSignerType?: string } | undefined,
    getCustomTokens: () => customTokens(canonicalStore.getState().main.tokens),
    getKnownTokens: (address?: Address) =>
      address
        ? tokensForAccount(canonicalStore.getState().main.tokens, address).filter((token) => !token.custom)
        : [],
    getConnectedChains: () => {
      const chains = Object.values(canonicalStore.getState().main.chains.ethereum)
      return chains.filter(
        (chain) => chain.connection.primary.connected || chain.connection.secondary.connected
      )
    }
  }
  const shouldScanOnChain = (address: Address) => {
    const signerType = storeApi.getAccount(address)?.lastSignerType ?? ''
    return signerType.toLowerCase() !== 'address'
  }
  const scanningAllowed = () => internet.isOpen()
  const balances = Balances(canonicalStore, registerTokens)

  let connectedChains: number[] = [],
    activeAccount: Address = ''
  let pauseScanningDelay: NodeJS.Timeout | undefined
  let balancesRunning = false

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
    if (balancesRunning || !scanningAllowed()) {
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

  function stopBalances() {
    clearPauseScanningDelay()
    handleChainUpdate.cancel()
    handleAddressUpdate.cancel()
    handleTokensUpdate.cancel()
    balances.stop()

    if (!balancesRunning) {
      return
    }

    log.verbose('stopping external data while the internet is closed')
    balancesRunning = false
  }

  function resumeBalances() {
    log.verbose('resuming external data after the internet opened')
    startBalances()

    if (!canonicalStore.getState().tray.open && !pauseScanningDelay) {
      pauseScanningDelay = setTimeout(balances.pause, 1000)
    }
  }

  startBalances()

  const unsubscribeInternet = internet.subscribe((open) => (open ? resumeBalances() : stopBalances()))

  const handleChainUpdate = debounce((newlyConnected: number[]) => {
    if (!scanningAllowed()) {
      return
    }

    log.verbose('updating external data due to chain update(s)', { connectedChains, newlyConnected })

    if (newlyConnected.length > 0 && activeAccount) {
      if (shouldScanOnChain(activeAccount)) {
        balances.addChains(activeAccount, newlyConnected)
      } else {
        balances.refresh(activeAccount)
      }
    }
  }, 500)

  const handleAddressUpdate = debounce(() => {
    if (!scanningAllowed()) {
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
    if (!scanningAllowed()) {
      return
    }

    log.verbose('updating external data due to token update(s)', { activeAccount })

    if (activeAccount && shouldScanOnChain(activeAccount)) {
      balances.addTokens(activeAccount, tokens)
    }
  })

  const handleChainsChange = () => {
    const connectedChainIds = storeApi
      .getConnectedChains()
      .map((n) => n.id)
      .sort()

    if (!arraysMatch(connectedChains, connectedChainIds)) {
      const newlyConnectedChains = connectedChainIds.filter((c) => !connectedChains.includes(c))
      connectedChains = connectedChainIds

      handleChainUpdate(newlyConnectedChains)
    }
  }
  handleChainsChange()
  const unsubscribeChains = canonicalStore.subscribe((state) => state.main.chains, handleChainsChange)

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

    if (!scanningAllowed()) {
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
      if (!scanningAllowed() || !address) {
        return
      }

      if (!balancesRunning && !startBalances()) {
        return
      }
      balances.refresh(address)
    },
    refreshPositions: (address, chainId, tokens) => {
      if (!scanningAllowed() || !address || !shouldScanOnChain(address)) {
        return
      }

      if (!balancesRunning && !startBalances()) {
        return
      }
      balances.refreshPositions(address, chainId, tokens)
    },
    close: () => {
      handleChainUpdate.cancel()
      handleAddressUpdate.cancel()
      handleTokensUpdate.cancel()

      unsubscribeChains()
      unsubscribeAccount()
      unsubscribeCustomTokens()
      unsubscribeTray()
      unsubscribeInternet()

      balances.stop()
      balancesRunning = false

      clearPauseScanningDelay()
    }
  }
}
