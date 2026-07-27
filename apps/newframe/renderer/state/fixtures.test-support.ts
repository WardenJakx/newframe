import type { SideTrayRendererState, WalletRendererState } from '../../contracts/state/projections'

const baseWalletState: WalletRendererState = {
  accounts: {},
  accountOrder: [],
  activity: {},
  appLock: { locked: false, vaultExists: false },
  autoDiscoverTokens: false,
  autohide: false,
  balances: {},
  biometricUnlock: false,
  currentAccount: '',
  instanceId: 'renderer-fixture',
  latticeSettings: {
    accountLimit: 5,
    derivation: 'standard',
    endpointMode: 'default',
    endpointCustom: ''
  },
  launch: false,
  ledger: { derivation: 'live', liveAccountLimit: 5 },
  menubarGasPrice: false,
  mute: {
    explorerWarning: false,
    gasFeeWarning: false,
    onboardingWindow: false,
    signerCompatibilityWarning: false
  },
  networks: { ethereum: {} },
  networksMeta: { ethereum: {} },
  orders: {},
  origins: {},
  permissions: {},
  portfolioApiKeyConfigured: false,
  rates: {},
  reveal: false,
  runtime: { environment: 'test', isDev: false, profile: null },
  shortcuts: {
    summon: {
      modifierKeys: ['Alt'],
      shortcutKey: 'Slash',
      enabled: true,
      configuring: false
    }
  },
  showLocalNameWithENS: false,
  showTestnets: false,
  signers: {},
  tokens: { byId: {}, accountTokenIds: {} },
  trezor: { derivation: 'standard' },
  windows: { panel: { show: false, nav: [] } },
  view: { notify: '', notifyData: {}, notifications: {}, badge: '' },
  tray: { open: false, initial: true, homeCommand: null },
  selected: { minimized: true, open: false },
  platform: 'test'
}

const baseSideTrayState: SideTrayRendererState = {
  accounts: {},
  accountOrder: [],
  balances: {},
  currentAccount: '',
  networks: { ethereum: {} },
  networksMeta: { ethereum: {} },
  rates: {},
  tokens: { byId: {}, accountTokenIds: {} },
  runtime: { environment: 'test', isDev: false, profile: null }
}

export function walletState(overrides: Partial<WalletRendererState>): WalletRendererState {
  return { ...baseWalletState, ...overrides }
}

export function walletChanges(changes: Partial<WalletRendererState>): Partial<WalletRendererState> {
  return changes
}

export function sideTrayState(overrides: Partial<SideTrayRendererState> = {}): SideTrayRendererState {
  return { ...baseSideTrayState, ...overrides }
}
