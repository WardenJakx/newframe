import { z } from 'zod'

import { AccountSchema } from '../../main/store/state/types/account'
import { BalanceSchema } from '../../main/store/state/types/balance'
import { MainSchema, RuntimeSchema } from '../../main/store/state/types/main'
import { NativeCurrencySchema } from '../../main/store/state/types/nativeCurrency'
import { RateSchema } from '../../main/store/state/types/rate'
import { TokenCatalogSchema, TokenImageSchema } from '../../main/store/state/types/token'

export const RendererProjectionSchema = z.enum(['wallet-ui', 'sidetray'])
export type RendererProjection = z.infer<typeof RendererProjectionSchema>

const NavigationDataSchema = z.strictObject({
  account: z.string().optional(),
  accountId: z.string().optional(),
  chain: z.unknown().optional(),
  dappDetails: z.string().optional(),
  id: z.string().optional(),
  notify: z.string().optional(),
  notifyData: z.unknown().optional(),
  request: z.unknown().optional(),
  requestId: z.string().optional(),
  showAddAccounts: z.boolean().optional(),
  signer: z.string().optional(),
  step: z.string().optional()
})

const NavigationEntrySchema = z.strictObject({
  view: z.string(),
  data: NavigationDataSchema.default({})
})

const WindowStateSchema = z.strictObject({
  show: z.boolean(),
  nav: z.array(NavigationEntrySchema)
})

const WindowsSchema = z.strictObject({
  panel: WindowStateSchema
})

const StatusNotificationSchema = z
  .object({
    id: z.string(),
    state: z.enum(['pending', 'completed', 'failed'])
  })
  .passthrough()

const ViewSchema = z.strictObject({
  notify: z.string(),
  notifyData: z.unknown(),
  notifications: z.record(z.string(), StatusNotificationSchema),
  badge: z.unknown()
})

const TraySchema = z.strictObject({
  open: z.boolean(),
  initial: z.boolean(),
  homeCommand: z.unknown().nullable()
})

const SelectedSchema = z.strictObject({
  minimized: z.boolean(),
  open: z.boolean()
})

const LatticeSettingsSchema = z.strictObject({
  accountLimit: z.number().int().positive(),
  derivation: z.string(),
  endpointMode: z.string(),
  endpointCustom: z.string()
})

const LedgerSettingsSchema = z.strictObject({
  derivation: z.string(),
  liveAccountLimit: z.number().int().positive()
})

const TrezorSettingsSchema = z.strictObject({ derivation: z.string() })

const WalletRateSchema = z
  .object({
    usd: RateSchema.optional()
  })
  .passthrough()

const WalletRatesSchema = z.record(z.string(), WalletRateSchema)

const WalletRequestSchema = z
  .object({
    type: z.enum([
      'sign',
      'signTypedData',
      'signErc20Permit',
      'transaction',
      'access',
      'addChain',
      'switchChain',
      'addToken'
    ]),
    handlerId: z.string(),
    origin: z.string().optional(),
    data: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough()

const WalletAccountSchema = AccountSchema.extend({
  requests: z.record(z.string(), WalletRequestSchema)
}).strip()

const WalletSignerSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    model: z.string(),
    type: z.string(),
    addresses: z.array(z.string()),
    status: z.string(),
    capabilities: z.array(z.string()).optional(),
    liveAddressesFound: z.number().optional(),
    tag: z.string().optional(),
    appVersion: z.strictObject({
      major: z.number(),
      minor: z.number(),
      patch: z.number()
    })
  })
  .strip()

// Wallet renderers receive explicit domain slices. Keeping canonical `main`
// out of this schema prevents one setting change from cloning every wallet
// domain and prevents future Electron-only fields from crossing by default.
export const WalletRendererStateSchema = z.strictObject({
  accounts: z.record(z.string(), WalletAccountSchema),
  accountOrder: MainSchema.shape.accountOrder,
  activity: MainSchema.shape.activity,
  appLock: MainSchema.shape.appLock,
  autoDiscoverTokens: MainSchema.shape.autoDiscoverTokens,
  autohide: MainSchema.shape.autohide,
  balances: MainSchema.shape.balances,
  biometricUnlock: MainSchema.shape.biometricUnlock,
  currentAccount: MainSchema.shape.currentAccount,
  instanceId: MainSchema.shape.instanceId,
  latticeSettings: LatticeSettingsSchema,
  launch: MainSchema.shape.launch,
  ledger: LedgerSettingsSchema,
  menubarGasPrice: MainSchema.shape.menubarGasPrice,
  mute: MainSchema.shape.mute,
  networks: MainSchema.shape.networks,
  networksMeta: MainSchema.shape.networksMeta,
  orders: MainSchema.shape.orders,
  origins: MainSchema.shape.origins,
  permissions: MainSchema.shape.permissions,
  portfolioApiKey: MainSchema.shape.portfolioApiKey,
  rates: WalletRatesSchema,
  reveal: MainSchema.shape.reveal,
  runtime: MainSchema.shape.runtime,
  shortcuts: MainSchema.shape.shortcuts,
  showLocalNameWithENS: MainSchema.shape.showLocalNameWithENS,
  showTestnets: MainSchema.shape.showTestnets,
  signers: z.record(z.string(), WalletSignerSchema),
  tokens: TokenCatalogSchema,
  trezor: TrezorSettingsSchema,
  windows: WindowsSchema,
  view: ViewSchema,
  tray: TraySchema,
  selected: SelectedSchema,
  platform: z.string()
})

const SideTrayAccountSchema = z.strictObject({
  id: z.string(),
  address: z.string(),
  name: z.string(),
  lastSignerType: z.string(),
  ensName: z.string().optional()
})

const SideTrayRateSchema = z.strictObject({
  usd: RateSchema.optional()
})

const SideTrayNetworkSchema = z.strictObject({
  id: z.coerce.number(),
  name: z.string(),
  on: z.boolean(),
  layer: z.enum(['mainnet', 'rollup', 'sidechain', 'testnet']).optional(),
  isTestnet: z.boolean(),
  explorer: z.string()
})

const SideTrayNetworkMetadataSchema = z.strictObject({
  image: TokenImageSchema.optional(),
  primaryColor: z.string(),
  nativeCurrency: NativeCurrencySchema
})

// `sidetray` is the restricted capability projection used by the bundled
// Send/Trade renderer.
// Origin-controlled web content must never be registered for this projection.
export const SideTrayRendererStateSchema = z.strictObject({
  accounts: z.record(z.string(), SideTrayAccountSchema),
  accountOrder: z.array(z.string()),
  balances: z.record(z.string(), z.array(BalanceSchema)),
  currentAccount: z.string(),
  networks: z.strictObject({
    ethereum: z.record(z.coerce.number(), SideTrayNetworkSchema)
  }),
  networksMeta: z.strictObject({
    ethereum: z.record(z.coerce.number(), SideTrayNetworkMetadataSchema)
  }),
  rates: z.record(z.string(), SideTrayRateSchema),
  tokens: TokenCatalogSchema,
  runtime: RuntimeSchema
})

export type WalletRendererState = z.infer<typeof WalletRendererStateSchema>
export type SideTrayRendererState = z.infer<typeof SideTrayRendererStateSchema>
export type WalletAccount = WalletRendererState['accounts'][string]

export const projectionStateSchemas = {
  'wallet-ui': WalletRendererStateSchema,
  sidetray: SideTrayRendererStateSchema
} as const

function createProjectionChangesSchema<TSchema extends z.ZodObject>(schema: TSchema) {
  const shape = schema.shape

  return z.record(z.string(), z.unknown()).transform((changes, context) => {
    const parsedChanges: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(changes)) {
      if (!Object.prototype.hasOwnProperty.call(shape, key)) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: 'Unknown renderer state slice'
        })
        continue
      }

      const result = shape[key].safeParse(value)
      if (!result.success) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `Invalid renderer state slice: ${result.error.message}`
        })
        continue
      }

      parsedChanges[key] = result.data
    }

    return parsedChanges as Partial<z.infer<TSchema>>
  })
}

// Zod defaults inside a normal `.partial()` populate omitted slices. Parse
// only keys that are actually present so a one-slice update stays one slice.
export const projectionStateChangeSchemas = {
  'wallet-ui': createProjectionChangesSchema(WalletRendererStateSchema),
  sidetray: createProjectionChangesSchema(SideTrayRendererStateSchema)
} as const
