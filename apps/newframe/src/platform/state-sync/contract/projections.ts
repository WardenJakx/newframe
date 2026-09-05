import { z } from 'zod'

import { AccountSchema } from '../../../features/accounts/domain/state/account.js'
import { BalanceSchema } from '../../../features/asset-data/domain/state/balance.js'
import {
  ActivityRecordSchema,
  ActivityStatusSchema,
  MainSchema,
  OrderRecordSchema,
  RuntimeSchema
} from '../../../app/contracts/state/main.js'
import { NativeCurrencySchema } from '../../../features/networks/domain/state/nativeCurrency.js'
import { OperationCollectionSchema } from '../../operations/operation.js'
import { AssetRateMapSchema } from '../../../features/asset-data/domain/state/rate.js'
import { TokenCatalogSchema, TokenImageSchema } from '../../../features/tokens/domain/state/token.js'

export const RendererProjectionSchema = z.enum(['wallet-ui', 'sidetray'])
export type RendererProjection = z.infer<typeof RendererProjectionSchema>

const WalletNavigationChainSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    chainId: z.union([z.string(), z.number()]).optional(),
    icon: z.string().optional(),
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

const NotificationTimestampSchema = z.union([z.number(), z.string(), z.date()]).nullable().optional()

const WalletStatusNotificationTargetSchema = z
  .object({
    type: z.enum(['transactionActivity', 'flashOrder']).optional(),
    activityId: z.string().optional(),
    orderId: z.string().optional(),
    hash: z.string().optional(),
    account: z.string().optional(),
    chainId: z.union([z.string(), z.number()]).optional(),
    chainType: z.string().optional()
  })
  .strip()

const WalletStatusNotificationMetadataSchema = z
  .object({
    hash: z.string().optional(),
    orderId: z.string().optional(),
    status: z.string().optional(),
    rawStatus: z.string().optional(),
    orderType: z.string().optional(),
    side: z.string().optional()
  })
  .strip()

export const WalletStatusNotificationSchema = z
  .object({
    id: z.string(),
    state: z.enum(['pending', 'completed', 'failed']),
    title: z.string().nullable().optional(),
    detail: z.string().nullable().optional(),
    createdAt: NotificationTimestampSchema,
    updatedAt: NotificationTimestampSchema,
    expiresAt: NotificationTimestampSchema,
    hidden: z.boolean().optional(),
    leadingIcon: z
      .object({
        chainId: z.union([z.string(), z.number()]).optional(),
        chainType: z.string().optional()
      })
      .strip()
      .optional(),
    target: WalletStatusNotificationTargetSchema.optional(),
    metadata: WalletStatusNotificationMetadataSchema.optional()
  })
  .strip()

const ViewSchema = z.strictObject({
  notify: z.string(),
  notifyData: z.unknown(),
  notifications: z.record(z.string(), WalletStatusNotificationSchema),
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
    approvalGate: z
      .discriminatedUnion('type', [
        z.discriminatedUnion('reason', [
          z.strictObject({
            type: z.literal('signer-compatibility'),
            reason: z.literal('incompatible'),
            signer: z.string(),
            tx: z.string(),
            chain: z.strictObject({ type: z.literal('ethereum'), id: z.number().int().positive() })
          }),
          z.strictObject({
            type: z.literal('signer-compatibility'),
            reason: z.literal('no-signer')
          }),
          z.strictObject({
            type: z.literal('signer-compatibility'),
            reason: z.literal('signer-unavailable'),
            signerIds: z.array(z.string()).max(16)
          })
        ]),
        z.strictObject({
          type: z.literal('gas-fee'),
          feeUSD: z.string(),
          currentSymbol: z.string()
        })
      ])
      .optional(),
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

const SideTrayActivitySchema = z
  .record(
    z.string(),
    z
      .object({
        id: z.string(),
        account: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        status: ActivityStatusSchema,
        data: z
          .object({
            to: z.string().optional(),
            data: z.string().optional()
          })
          .strip()
          .optional(),
        recognizedActions: z
          .array(
            z
              .object({
                id: z.string(),
                data: z
                  .object({
                    recipient: z
                      .object({
                        address: z.string().optional()
                      })
                      .strip()
                      .optional()
                  })
                  .strip()
                  .optional()
              })
              .strip()
          )
          .optional()
      })
      .strip()
  )
  .default({})

const {
  rawPayload: _rawPayload,
  rawStatusPayload: _rawStatusPayload,
  targetAsset: _targetAsset,
  contraAsset: _contraAsset,
  spentAsset: _spentAsset,
  receiveAsset: _receiveAsset,
  ...WalletOrderRecordShape
} = OrderRecordSchema.shape

const WalletOrderAssetSchema = z
  .object({
    id: z.string().optional(),
    address: z.string().optional(),
    chainId: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
    decimals: z.number().int().nonnegative().optional(),
    isNative: z.boolean().optional(),
    name: z.string().optional(),
    symbol: z.string().optional()
  })
  .strip()

const WalletOrderDiagnosticPayloadSchema = z.strictObject({
  orderId: z.string(),
  provider: z.string().optional(),
  source: z.string().optional(),
  environment: z.string().nullable().optional(),
  orderType: z.string(),
  side: z.string(),
  qty: z.union([z.number(), z.string()])
})

const WalletOrderDiagnosticStatusSchema = z.strictObject({
  orderId: z.string(),
  status: z.string(),
  rawStatus: z.string().nullable().optional(),
  spentAmount: z.union([z.number(), z.string()]).nullable().optional(),
  outputAmount: z.union([z.number(), z.string()]).nullable().optional(),
  filledOutputAmount: z.union([z.number(), z.string()]).nullable().optional(),
  averageFillPrice: z.union([z.number(), z.string()]).nullable().optional(),
  updatedAt: z.union([z.number(), z.string(), z.date()]),
  terminalAt: z.union([z.number(), z.string(), z.date()]).nullable().optional(),
  fillHash: z.string().nullable().optional(),
  fillTransactionHash: z.string().nullable().optional()
})

export const WalletOrderRecordSchema = z
  .object({
    ...WalletOrderRecordShape,
    targetAsset: WalletOrderAssetSchema,
    contraAsset: WalletOrderAssetSchema,
    spentAsset: WalletOrderAssetSchema.optional(),
    receiveAsset: WalletOrderAssetSchema.optional(),
    rawPayload: WalletOrderDiagnosticPayloadSchema.optional(),
    rawStatusPayload: WalletOrderDiagnosticStatusSchema.optional()
  })
  .strip()
  .refine((order) => Boolean(order.provider || order.source), {
    message: 'Order record requires provider or source',
    path: ['source']
  })
const WalletOrdersSchema = z.record(z.string(), WalletOrderRecordSchema).default({})

const WalletProfileSummarySchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  accountCount: z.number().int().nonnegative(),
  cachedValue: z.discriminatedUnion('state', [
    z.strictObject({ state: z.literal('missing') }),
    z.strictObject({ state: z.literal('unpriced') }),
    z.strictObject({ state: z.literal('priced'), value: z.number().finite().nonnegative() })
  ])
})

// Wallet renderers receive explicit domain slices. Keeping canonical `main`
// out of this schema prevents one setting change from cloning every wallet
// domain and prevents future Electron-only fields from crossing by default.
const WalletRendererStateSchema = z.strictObject({
  accounts: z.record(z.string(), WalletAccountSchema),
  accountOrder: MainSchema.shape.accountOrder,
  activity: WalletActivitySchema,
  appLock: MainSchema.shape.appLock,
  autoDiscoverTokens: MainSchema.shape.autoDiscoverTokens,
  autohide: MainSchema.shape.autohide,
  balances: MainSchema.shape.balances,
  biometricUnlock: MainSchema.shape.biometricUnlock,
  currentAccount: MainSchema.shape.currentAccount,
  currentProfile: MainSchema.shape.currentProfile,
  instanceId: MainSchema.shape.instanceId,
  latticeSettings: LatticeSettingsSchema,
  launch: MainSchema.shape.launch,
  ledger: LedgerSettingsSchema,
  menubarGasPrice: MainSchema.shape.menubarGasPrice,
  mute: MainSchema.shape.mute,
  networks: MainSchema.shape.networks,
  networksMeta: MainSchema.shape.networksMeta,
  orders: WalletOrdersSchema,
  operations: OperationCollectionSchema,
  origins: MainSchema.shape.origins,
  permissions: MainSchema.shape.permissions,
  portfolioApiKeyConfigured: z.boolean(),
  profiles: z.array(WalletProfileSummarySchema).max(1_000),
  assetRates: AssetRateMapSchema,
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
const SideTrayRendererStateSchema = z.strictObject({
  accounts: z.record(z.string(), SideTrayAccountSchema),
  accountOrder: z.array(z.string()),
  activity: SideTrayActivitySchema,
  balances: z.record(z.string(), z.array(BalanceSchema)),
  currentAccount: z.string(),
  operations: OperationCollectionSchema,
  orders: WalletOrdersSchema.optional(),
  networks: z.strictObject({
    ethereum: z.record(z.coerce.number(), SideTrayNetworkSchema)
  }),
  networksMeta: z.strictObject({
    ethereum: z.record(z.coerce.number(), SideTrayNetworkMetadataSchema)
  }),
  assetRates: AssetRateMapSchema,
  tokens: TokenCatalogSchema,
  runtime: RuntimeSchema
})

export type WalletRendererState = z.infer<typeof WalletRendererStateSchema>
export type WalletStatusNotification = z.infer<typeof WalletStatusNotificationSchema>
export type SideTrayRendererState = z.infer<typeof SideTrayRendererStateSchema>
export type WalletPanelNavigationEntry = z.infer<typeof WalletPanelNavigationEntrySchema>

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
