import type { SideTrayProjection, MainTrayProjection } from '../contract/projections.ts'

const baseProjectionState = {
  accounts: {},
  accountOrder: [],
  activity: {},
  balances: {},
  currentAccount: '',
  operations: {},
  chains: { ethereum: {} },
  chainsMeta: { ethereum: {} },
  assetRates: {},
  tokens: { byId: {}, accountTokenIds: {} },
  runtime: { environment: 'test', isDev: false, profile: null }
}

const baseSideTrayState: SideTrayProjection = baseProjectionState

const baseWalletState: MainTrayProjection = {
  ...baseProjectionState,
  appLock: { locked: false, vaultExists: false },
  autoDiscoverTokens: false,
  autohide: false,
  tor: { available: false, connection: 'direct' },
  biometricUnlock: false,
  currentProfile: 'default-profile',
  extensionAccess: {},
  instanceId: 'tray-fixture',
  knownExtensions: {},
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
  accountAccessGrants: {},
  portfolioApiKeyConfigured: false,
  portfolioProvider: 'zerion',
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

export function walletState(overrides: Partial<MainTrayProjection>): MainTrayProjection {
  return { ...baseWalletState, ...overrides }
}

export function walletChanges(changes: Partial<MainTrayProjection>): Partial<MainTrayProjection> {
  return changes
}

export function sideTrayState(overrides: Partial<SideTrayProjection> = {}): SideTrayProjection {
  return { ...baseSideTrayState, ...overrides }
}
