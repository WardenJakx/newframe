import type { SettingsUpdateCommand } from '../../../app/contracts/operations.ts'
import type { CanonicalStore } from '../../../core/state/store/actions.ts'

type SettingsState = Pick<
  CanonicalStore,
  | 'main'
  | 'setGasDefault'
  | 'setAutoDiscoverTokens'
  | 'setAutohide'
  | 'setTorEnabled'
  | 'setLatticeAccountLimit'
  | 'setLatticeDerivation'
  | 'setLatticeEndpointCustom'
  | 'setLatticeEndpointMode'
  | 'setLedgerDerivation'
  | 'setLiveAccountLimit'
  | 'setMenubarGasPrice'
  | 'setPortfolioApiKey'
  | 'setShortcut'
  | 'setShowTestnets'
  | 'setTrezorDerivation'
  | 'toggleLaunch'
  | 'toggleReveal'
  | 'toggleShowLocalNameWithENS'
>

export function createSettingsService(
  settingsStore: { getState(): SettingsState },
  persistence: { flush(): void }
) {
  function updateState(command: SettingsUpdateCommand) {
    const state = settingsStore.getState()

    switch (command.setting) {
      case 'gas-fee-level': {
        const value = state.main.chainsMeta.ethereum[command.chainId]?.gas?.price.levels[command.value]
        const chains = state.main.chains.ethereum as Record<
          number,
          (typeof state.main.chains.ethereum)[number] | undefined
        >
        if (!chains[command.chainId] || value === undefined) {
          throw new Error('Fee preference unavailable for this network')
        }
        return state.setGasDefault('ethereum', command.chainId, command.value, value)
      }
      case 'autohide':
        return state.setAutohide(command.value)
      case 'tor-enabled':
        return state.setTorEnabled(command.value)
      case 'launch':
        if (state.main.launch !== command.value) {
          state.toggleLaunch()
        }
        return
      case 'reveal':
        if (state.main.reveal !== command.value) {
          state.toggleReveal()
        }
        return
      case 'menubar-gas-price':
        return state.setMenubarGasPrice(command.value)
      case 'show-local-name-with-ens':
        if (state.main.showLocalNameWithENS !== command.value) {
          state.toggleShowLocalNameWithENS()
        }
        return
      case 'show-testnets':
        return state.setShowTestnets(command.value)
      case 'shortcut-enabled':
        return state.setShortcut('summon', { enabled: command.value })
      case 'shortcut-configuring':
        return state.setShortcut('summon', { configuring: command.value })
      case 'auto-discover-tokens':
        if (command.apiKey !== undefined) {
          state.setPortfolioApiKey(command.apiKey)
        }
        return state.setAutoDiscoverTokens(command.value, command.provider)
      case 'trezor-derivation':
        return state.setTrezorDerivation(command.value)
      case 'ledger-derivation':
        return state.setLedgerDerivation(command.value)
      case 'lattice-derivation':
        return state.setLatticeDerivation(command.value)
      case 'ledger-live-account-limit':
        return state.setLiveAccountLimit(command.value)
      case 'lattice-account-limit':
        return state.setLatticeAccountLimit(command.value)
      case 'lattice-endpoint-mode':
        return state.setLatticeEndpointMode(command.value)
      case 'lattice-endpoint':
        return state.setLatticeEndpointCustom(command.value)
      case 'portfolio-api-key':
        return state.setPortfolioApiKey(command.value)
      case 'summon-shortcut':
        return state.setShortcut('summon', command.value)
    }
  }

  return {
    update(command: SettingsUpdateCommand) {
      updateState(command)
      persistence.flush()
    }
  }
}
