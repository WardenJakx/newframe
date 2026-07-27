import { z } from 'zod'

import { AccountSchema } from '../../domain/state/account'
import { BalanceSchema } from '../../domain/state/balance'
import { ActivityRecordSchema, MainSchema, OrderRecordSchema, RuntimeSchema } from '../../domain/state/main'
import { NativeCurrencySchema } from '../../domain/state/nativeCurrency'
import { RateSchema } from '../../domain/state/rate'
import { TokenCatalogSchema, TokenImageSchema } from '../../domain/state/token'

export const RendererProjectionSchema = z.enum(['wallet-ui', 'sidetray'])
export type RendererProjection = z.infer<typeof RendererProjectionSchema>

export const WalletNavigationChainSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    chainId: z.union([z.string(), z.number()]).optional(),
    name: z.string().optional(),
    symbol: z.string().optional(),
    primaryRpc: z.string().optional(),
    explorer: z.string().optional()
  })
  .strip()

const WalletNavigationTokenSchema = z
  .object({
    address: z.string(),
    chainId: z.number(),
    decimals: z.number().optional(),
    logoURI: z.string().optional(),
    name: z.string().optional(),
    symbol: z.string().optional()
  })
  .strip()

export const WalletPanelNavigationEntrySchema = z.discriminatedUnion('view', [
  z
    .object({
      view: z.literal('requestView'),
      data: z
        .object({
          accountId: z.string(),
          requestId: z.string(),
          step: z.enum(['confirm']).optional()
        })
        .strip()
    })
    .strip(),
  z
    .object({
      view: z.literal('expandedModule'),
      data: z
        .object({
          id: z.literal('requests'),
          account: z.string()
        })
        .strip()
    })
    .strip()
])

const HomeCommandBaseSchema = {
  id: z.number().int().positive()
}

export const WalletHomeCommandSchema = z.discriminatedUnion('view', [
  z
    .object({
      ...HomeCommandBaseSchema,
      view: z.literal('settings'),
      data: z.object({}).strip()
    })
    .strip(),
  z
    .object({
      ...HomeCommandBaseSchema,
      view: z.literal('accounts'),
      data: z
        .object({
          showAddAccounts: z.boolean().optional(),
          newAccountType: z.string().optional(),
          selectedSigner: z.string().optional()
        })
        .strip()
    })
    .strip(),
  z
    .object({
      ...HomeCommandBaseSchema,
      view: z.literal('networks'),
      data: z
        .object({
          newChain: WalletNavigationChainSchema.optional(),
          selectedChain: WalletNavigationChainSchema.optional()
        })
        .strip()
    })
    .strip(),
  z
    .object({
      ...HomeCommandBaseSchema,
      view: z.literal('addChain'),
      data: z
        .object({
          chain: WalletNavigationChainSchema,
          requestId: z.string()
        })
        .strip()
    })
    .strip(),
  z
    .object({
      ...HomeCommandBaseSchema,
      view: z.literal('tokens'),
      data: z
        .object({
          token: WalletNavigationTokenSchema.optional()
        })
        .strip()
    })
    .strip()
])

const WindowStateSchema = z.strictObject({
  show: z.boolean(),
  nav: z.array(WalletPanelNavigationEntrySchema)
})

const WindowsSchema = z.strictObject({
  panel: WindowStateSchema
})

const StatusNotificationSchema = z
  .object({
    id: z.string(),
    state: z.enum(['pending', 'completed', 'failed'])
  })
  .strip()

const ViewSchema = z.strictObject({
  notify: z.string(),
  notifyData: z.unknown(),
  notifications: z.record(z.string(), StatusNotificationSchema),
  badge: z.unknown()
})

const TraySchema = z.strictObject({
  open: z.boolean(),
  initial: z.boolean(),
  homeCommand: WalletHomeCommandSchema.nullable()
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
  .strip()

const WalletRatesSchema = z.record(z.string(), WalletRateSchema)

const WalletApprovalSchema = z
  .object({
    type: z.string(),
    data: z.unknown(),
    approved: z.boolean()
  })
  .strip()

const WalletRecognizedActionSchema = z
  .object({
    id: z.string(),
    data: z.unknown().optional()
  })
  .strip()

// Requests are canonical main-owned state, but renderers receive only the
// explicitly supported presentation fields. Unknown future fields are
// discarded instead of silently becoming renderer capabilities.
export const WalletRequestSchema = z
  .object({
    type: z.enum([
      'sign',
      'signTypedData',
      'signErc20Permit',
      'transaction',
      'agentAccess',
      'access',
      'addChain',
      'switchChain',
      'addToken'
    ]),
    handlerId: z.string(),
    origin: z.string().optional(),
    payload: z.unknown().optional(),
    account: z.string().optional(),
    status: z
      .enum([
        'pending',
        'sending',
        'verifying',
        'confirming',
        'confirmed',
        'sent',
        'declined',
        'error',
        'success'
      ])
      .optional(),
    mode: z.enum(['normal', 'monitor']).optional(),
    notice: z.string().optional(),
    created: z.number().optional(),
    data: z.unknown().optional(),
    approvals: z.array(WalletApprovalSchema).optional(),
    recognizedActions: z.array(WalletRecognizedActionSchema).optional(),
    typedMessage: z.unknown().optional(),
    digests: z.unknown().optional(),
    erc7730: z.unknown().optional(),
    permit: z.unknown().optional(),
    tokenData: z.unknown().optional(),
    chain: z.unknown().optional(),
    token: z.unknown().optional(),
    decodedData: z.unknown().optional(),
    chainData: z.unknown().optional(),
    simulation: z.unknown().optional(),
    tx: z.unknown().optional(),
    locked: z.boolean().optional(),
    automaticFeeUpdateNotice: z.unknown().optional(),
    recipient: z.string().optional(),
    updatedFees: z.boolean().optional(),
    feeAtTime: z.string().optional(),
    completed: z.number().optional(),
    feesUpdatedByUser: z.boolean().optional(),
    recipientType: z.string().optional(),
    classification: z.enum(['CONTRACT_DEPLOY', 'CONTRACT_CALL', 'SEND_DATA', 'NATIVE_TRANSFER']).optional()
  })
  .strip()

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

export const WalletActivityRecordSchema = z
  .object({
    ...ActivityRecordSchema.shape,
    decodedData: z
      .object({
        contractName: z.string().optional(),
        method: z.string().optional(),
        source: z.string().optional()
      })
      .strip()
      .optional(),
    recipient: z.string().optional(),
    recognizedActions: z.array(WalletRecognizedActionSchema).optional()
  })
  .strip()

const WalletActivitySchema = z.record(z.string(), WalletActivityRecordSchema).default({})

export const WalletOrderRecordSchema = z
  .object({ ...OrderRecordSchema.shape })
  .strip()
  .refine((order) => Boolean(order.provider || order.source), {
    message: 'Order record requires provider or source',
    path: ['source']
  })
const WalletOrdersSchema = z.record(z.string(), WalletOrderRecordSchema).default({})

// Wallet renderers receive explicit domain slices. Keeping canonical `main`
// out of this schema prevents one setting change from cloning every wallet
// domain and prevents future Electron-only fields from crossing by default.
export const WalletRendererStateSchema = z.strictObject({
  accounts: z.record(z.string(), WalletAccountSchema),
  accountOrder: MainSchema.shape.accountOrder,
  activity: WalletActivitySchema,
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
  orders: WalletOrdersSchema,
  origins: MainSchema.shape.origins,
  permissions: MainSchema.shape.permissions,
  portfolioApiKeyConfigured: z.boolean(),
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
export type WalletPanelNavigationEntry = z.infer<typeof WalletPanelNavigationEntrySchema>
export type WalletHomeCommand = z.infer<typeof WalletHomeCommandSchema>

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
