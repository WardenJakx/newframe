import log from 'electron-log'
import { v4 as generateUuid } from 'uuid'
import { z } from 'zod'

import {
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILE_NAME,
  MainSchema,
  type Main
} from '../../../../app/contracts/state/main.ts'
import {
  createBuiltInChainMetadata,
  createBuiltInChains
} from '../../../../features/chains/domain/chain/index.ts'
import { OperationRecordSchema } from '../../../../platform/operations/operation.ts'
import { Derivation } from '../../../../platform/signing/signers/Signer/derive.ts'
import type { SignerSummary } from '../../../../platform/signing/signers/Signer/index.ts'
import { getMainRuntime } from '../../../desktop-ui/runtime/index.ts'
import type { OwnedOperation } from '../actions.operation.ts'

export type { ChainId, Chain, ChainMetadata } from '../../../../features/chains/domain/state/chain.ts'
export type { Origin } from '../../../../features/connections/domain/state/origin.ts'
export type { AccountAccessGrant } from '../../../../features/connections/domain/state/accountAccessGrant.ts'
export type { Balance } from '../../../../features/asset-data/domain/state/balance.ts'
export type { Token, TokenImage, TokenRecord } from '../../../../features/tokens/domain/state/token.ts'
export type { NativeCurrency } from '../../../../features/chains/domain/state/nativeCurrency.ts'
export type { Gas, GasFees } from '../../../../features/chains/domain/state/gas.ts'

export type { ActivityRecord } from '../../../../app/contracts/state/main.ts'

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
  .loose()

const ViewSchema = z
  .object({
    notifications: z.record(z.string().describe('Notification Id'), StatusNotificationSchema).default({})
  })
  .loose()

export const CanonicalStateSchema = z
  .object({
    main: MainSchema,
    operations: z.record(
      z.string(),
      z.strictObject({
        owner: z.strictObject({
          clientType: z.enum(['main-tray', 'side-tray']),
          windowInstanceId: z.string().min(1)
        }),
        operation: OperationRecordSchema
      })
    ),
    view: ViewSchema
  })
  .loose()

type StatusNotification = z.infer<typeof StatusNotificationSchema>

export interface Frame {
  id: string
  route?: string
}

// TODO: remove pieces of this as they're added to the main state definition
type M = Main & {
  shortcuts: Main['shortcuts'] & { altSlash?: boolean }
  lattice: Record<
    string,
    {
      deviceId?: string
      deviceName: string
      tag: string
      privKey: string
      paired: boolean
      baseUrl?: string
      endpointMode?: 'default' | 'custom'
    }
  >
  latticeSettings: {
    accountLimit: number
    derivation: Derivation
    endpointMode: 'default' | 'custom'
    endpointCustom: string
  }
  ledger: { derivation: Derivation; liveAccountLimit: number }
  trezor: { derivation: Derivation }
  signers: Record<string, SignerSummary & Record<string, unknown>>
  frames: Record<string, Frame>
  focusedFrame: string
}

const mainState: M = {
  instanceId: generateUuid(),
  runtime: getMainRuntime(),
  tor: { available: false, connection: 'direct' },
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
  portfolioProvider: 'zerion',
  portfolioApiKey: '',
  showTestnets: false,
  autohide: false,
  menubarGasPrice: false,
  biometricUnlock: false,
  airgap: {},
  lattice: {},
  latticeSettings: {
    accountLimit: 5,
    derivation: Derivation.standard,
    endpointMode: 'default',
    endpointCustom: ''
  },
  ledger: { derivation: Derivation.live, liveAccountLimit: 5 },
  trezor: { derivation: Derivation.standard },
  origins: {},
  knownExtensions: {},
  extensionAccess: {},
  accounts: {},
  profiles: { [DEFAULT_PROFILE_ID]: { id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME } },
  profileOrder: [DEFAULT_PROFILE_ID],
  currentProfile: DEFAULT_PROFILE_ID,
  currentAccount: '',
  appLock: { locked: false, vaultExists: false },
  accountOrder: [],
  accountsMeta: {},
  accountAccessGrants: {},
  balances: {},
  activity: {},
  orders: {},
  tokens: { byId: {}, accountTokenIds: {} },
  assetRates: {},
  signers: {},
  updater: { dontRemind: [], lastChecked: 0 },
  chains: { ethereum: createBuiltInChains() },
  chainsMeta: { ethereum: createBuiltInChainMetadata() },
  frames: {},
  focusedFrame: ''
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

export type NavigationEntry = {
  view: string
  data: Record<string, unknown>
  [key: string]: unknown
}
type WindowState = {
  show: boolean
  nav: NavigationEntry[]
  [key: string]: unknown
}

export type CanonicalState = Omit<typeof initial, 'main' | 'operations' | 'view' | 'windows'> & {
  main: M
  operations: Record<string, OwnedOperation>
  view: Omit<typeof initial.view, 'notifications' | 'notifyData' | 'badge'> & {
    notifyData: unknown
    badge: unknown
    notifications: Record<string, StatusNotification>
  }
  windows: Record<string, WindowState> & { panel: WindowState }
}

export default function createInitialState(): CanonicalState {
  const state = structuredClone(initial)
  const result = CanonicalStateSchema.safeParse(state)

  if (!result.success) {
    log.warn(`Found ${result.error.issues.length} issues while parsing saved state`, result.error.issues)
  }

  return state
}
