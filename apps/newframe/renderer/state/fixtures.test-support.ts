import type { SideTrayRendererState, WalletRendererState } from '../../contracts/state/projections'

const baseProjectionState = {
  accounts: {},
  accountOrder: [],
  activity: {},
  balances: {},
  currentAccount: '',
  operations: {},
  networks: { ethereum: {} },
  networksMeta: { ethereum: {} },
  assetRates: {},
  tokens: { byId: {}, accountTokenIds: {} },
  runtime: { environment: 'test', isDev: false, profile: null }
}

const baseSideTrayState: SideTrayRendererState = baseProjectionState

const baseWalletState: WalletRendererState = {
  ...baseProjectionState,
  appLock: { locked: false, vaultExists: false },
  autoDiscoverTokens: false,
  autohide: false,
  biometricUnlock: false,
  currentProfile: 'default-profile',
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
  orders: {},
  origins: {},
  permissions: {},
  portfolioApiKeyConfigured: false,
  profiles: [
    {
      id: 'default-profile',
      name: 'Profile 1',
      accountCount: 0,
      cachedValue: { state: 'missing' }
    }
  ],
  reveal: false,
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
  trezor: { derivation: 'standard' },
  windows: { panel: { show: false, nav: [] } },
  view: { notify: '', notifyData: {}, notifications: {}, badge: '' },
  tray: { open: false, initial: true, homeCommand: null },
  selected: { minimized: true, open: false },
  platform: 'test'
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
