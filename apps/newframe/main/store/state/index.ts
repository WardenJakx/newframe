import { v4 as generateUuid } from 'uuid'
import { z } from 'zod'
import log from 'electron-log'

import { createBuiltInNetworkMetadata, createBuiltInNetworks } from '../../../domain/chain/index.js'
import {
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILE_NAME,
  MainSchema,
  type Main
} from '../../../domain/state/main.js'
import { OperationRecordSchema } from '../../../domain/state/operation.js'
import { getMainRuntime } from '../../runtime.js'
import type { OwnedOperation } from '../actions.operation.js'

export type { ChainId, Chain, ChainMetadata } from '../../../domain/state/chain.js'
export type { Origin } from '../../../domain/state/origin.js'
export type { Permission } from '../../../domain/state/permission.js'
export type { Balance } from '../../../domain/state/balance.js'
export type {
  WithTokenId,
  Token,
  TokenCatalog,
  TokenImage,
  TokenRecord,
  TokenSource
} from '../../../domain/state/token.js'
export type { NativeCurrency } from '../../../domain/state/nativeCurrency.js'
export type { Gas, GasFees } from '../../../domain/state/gas.js'
export type { ColorwayPalette } from '../../../domain/state/colors.js'
export type {
  Activity,
  ActivityRecord,
  ActivityStatus,
  Orders,
  OrderRecord
} from '../../../domain/state/main.js'

const StatusNotificationSchema = z
  .object({
    id: z.string(),
    state: z.enum(['pending', 'completed', 'failed']),
    title: z.string().nullable().optional(),
    detail: z.string().nullable().optional(),
    createdAt: z.union([z.number(), z.string(), z.date()]).nullable().optional(),
    updatedAt: z.union([z.number(), z.string(), z.date()]).nullable().optional(),
    expiresAt: z.union([z.number(), z.string(), z.date()]).nullable().optional(),
    dismissedAt: z.union([z.number(), z.string(), z.date()]).nullable().optional(),
    hidden: z.boolean().optional(),
    target: z.unknown().optional(),
    metadata: z.unknown().optional()
  })
  .passthrough()

const ViewSchema = z
  .object({
    notifications: z.record(z.string().describe('Notification Id'), StatusNotificationSchema).default({})
  })
  .passthrough()

export const CanonicalStateSchema = z
  .object({
    main: MainSchema,
    operations: z.record(
      z.string(),
      z.strictObject({
        owner: z.strictObject({
          clientType: z.enum(['wallet-ui', 'sidetray']),
          windowInstanceId: z.string().min(1)
        }),
        operation: OperationRecordSchema
      })
    ),
    view: ViewSchema
  })
  .passthrough()

export type StatusNotification = z.infer<typeof StatusNotificationSchema>

// TODO: remove pieces of this as they're added to the main state definition
type M = Main & {
  shortcuts: any
  lattice: any
  latticeSettings: any
  ledger: any
  trezor: any
  signers: any
  frames: any
}

const mainState: M = {
  instanceId: generateUuid(),
  runtime: getMainRuntime(),
  mute: {
    explorerWarning: false,
    gasFeeWarning: false,
    onboardingWindow: false,
    signerCompatibilityWarning: false
  },
  shortcuts: {
    summon: {
      modifierKeys: ['Alt'],
      shortcutKey: 'Slash',
      enabled: true,
      configuring: false
    }
  },
  launch: false,
  reveal: false,
  showLocalNameWithENS: false,
  autoDiscoverTokens: false,
  portfolioApiKey: '',
  showTestnets: false,
  autohide: false,
  menubarGasPrice: false,
  biometricUnlock: false,
  lattice: {},
  latticeSettings: {
    accountLimit: 5,
    derivation: 'standard',
    endpointMode: 'default',
    endpointCustom: ''
  },
  ledger: { derivation: 'live', liveAccountLimit: 5 },
  trezor: { derivation: 'standard' },
  origins: {},
  knownExtensions: {},
  accounts: {},
  profiles: { [DEFAULT_PROFILE_ID]: { id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME } },
  profileOrder: [DEFAULT_PROFILE_ID],
  currentProfile: DEFAULT_PROFILE_ID,
  currentAccount: '',
  appLock: { locked: false, vaultExists: false },
  accountOrder: [],
  accountsMeta: {},
  permissions: {},
  balances: {},
  activity: {},
  orders: {},
  tokens: { byId: {}, accountTokenIds: {} },
  assetRates: {},
  signers: {},
  updater: { dontRemind: [], lastChecked: 0 },
  networks: { ethereum: createBuiltInNetworks() },
  networksMeta: { ethereum: createBuiltInNetworkMetadata() },
  frames: {}
}

const initial = {
  operations: {},
  windows: { panel: { show: false, nav: [] } },
  view: { notify: '', notifyData: {}, notifications: {}, badge: '' },
  tray: { open: false, initial: true, homeCommand: null },
  selected: { minimized: true, open: false },
  platform: process.platform,
  main: mainState
}

type NavigationEntry = { view: string; data: Record<string, any> }
type WindowState = {
  show: boolean
  nav: NavigationEntry[]
  [key: string]: any
}

export type CanonicalState = Omit<typeof initial, 'main' | 'operations' | 'view' | 'windows'> & {
  main: M
  operations: Record<string, OwnedOperation>
  view: Omit<typeof initial.view, 'notifications'> & {
    notifications: Record<string, StatusNotification>
  }
  windows: { panel: WindowState }
}

export default function createInitialState(): CanonicalState {
  const state = structuredClone(initial)
  const result = CanonicalStateSchema.safeParse(state)

  if (!result.success) {
    log.warn(`Found ${result.error.issues.length} issues while parsing saved state`, result.error.issues)
  }

  return state as CanonicalState
}
