import type { SettingsUpdateCommand } from '../../../contracts/operations'
import type { CanonicalStore } from '../../store/actions'

type SettingsState = Pick<
  CanonicalStore,
  | 'main'
  | 'setAutoDiscoverTokens'
  | 'setAutohide'
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

export function createSettingsService(settingsStore: { getState(): SettingsState }) {
  return {
    update(command: SettingsUpdateCommand) {
      const state = settingsStore.getState()

      switch (command.setting) {
        case 'autohide':
          return state.setAutohide(command.value)
        case 'launch':
          if (state.main.launch !== command.value) state.toggleLaunch()
          return
        case 'reveal':
          if (state.main.reveal !== command.value) state.toggleReveal()
          return
        case 'menubar-gas-price':
          return state.setMenubarGasPrice(command.value)
        case 'show-local-name-with-ens':
          if (state.main.showLocalNameWithENS !== command.value) state.toggleShowLocalNameWithENS()
          return
        case 'show-testnets':
          return state.setShowTestnets(command.value)
        case 'shortcut-enabled':
          return state.setShortcut('summon', { enabled: command.value })
        case 'shortcut-configuring':
          return state.setShortcut('summon', { configuring: command.value })
        case 'auto-discover-tokens':
          if (command.apiKey !== undefined) state.setPortfolioApiKey(command.apiKey)
          return state.setAutoDiscoverTokens(command.value)
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
  }
}
