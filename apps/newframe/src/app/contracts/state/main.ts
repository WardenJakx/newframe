import { z } from 'zod'

import { AccountMetadataSchema, AccountSchema } from '../../../features/accounts/domain/state/account.js'
import { BalanceSchema } from '../../../features/asset-data/domain/state/balance.js'
import { ChainMetadataSchema, ChainSchema } from '../../../features/networks/domain/state/chain.js'
import { OriginSchema } from '../../../features/connections/domain/state/origin.js'
import { PermissionSchema } from '../../../features/connections/domain/state/permission.js'
import { AssetRateMapSchema } from '../../../features/asset-data/domain/state/rate.js'
import { ShortcutSchema } from '../../../features/settings/domain/state/shortcuts.js'
import { TokenCatalogSchema } from '../../../features/tokens/domain/state/token.js'

export const DEFAULT_PROFILE_ID = 'default-profile'
export const DEFAULT_PROFILE_NAME = 'Profile 1'

const ProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1)
})

const ShortcutsSchema = z.object({
  summon: ShortcutSchema
})

const UpdaterPreferencesSchema = z.object({
  dontRemind: z.array(z.string()),
  lastChecked: z.number().default(0)
})

export const RuntimeSchema = z.object({
  environment: z.string().nullable().optional(),
  isDev: z.boolean().optional(),
  profile: z.string().nullable().optional()
})

const AppLockSchema = z.object({
  locked: z.boolean(),
  vaultExists: z.boolean()
})

// these are individual keys on the main state object
const PreferencesSchema = {
  launch: z.boolean().default(false).describe('Launch Newframe on system start'),
  reveal: z.boolean().default(false).describe('Show Newframe when user glides mouse to edge of screen'),
  autohide: z.boolean().default(false).describe('Automatically hide Newframe when it loses focus'),
  showLocalNameWithENS: z.boolean(),
  autoDiscoverTokens: z
    .boolean()
    .default(false)
    .describe('Automatically discover tokens through portfolio providers'),
  portfolioApiKey: z.string().default('').describe('Zerion API key for portfolio providers'),
  showTestnets: z.boolean().default(false).describe('Show testnet networks in the wallet UI'),
  menubarGasPrice: z.boolean().default(false).describe('Show gas price in menu bar'),
  biometricUnlock: z.boolean().default(false).describe('Unlock Newframe with biometrics on this device')
}

const notificationTypes = z.enum([
  'explorerWarning',
  'gasFeeWarning',
  'onboardingWindow',
  'signerCompatibilityWarning'
])

export const ActivityStatusSchema = z.enum(['submitted', 'confirming', 'succeeded', 'reverted'])

const ActivityDateSchema = z.union([z.number(), z.string(), z.date()]).nullable().optional()
const ActivityNumberSchema = z.union([z.number(), z.string()]).nullable().optional()
const ActivityBalanceChangeSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['native', 'erc20']),
    direction: z.enum(['out', 'in']),
    label: z.string(),
    amount: z.string().optional(),
    decimals: z.number().int().nonnegative().optional(),
    symbol: z.string(),
    detail: z.string().optional(),
    assetAddress: z.string().optional(),
    logoURI: z.string().optional()
  })
  .strip()

export const ActivityRecordSchema = z
  .object({
    id: z.string(),
    hash: z.string().nullable().optional(),
    handlerId: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    account: z.string().nullable().optional(),
    chainId: ActivityNumberSchema,
    chainType: z.string().nullable().optional(),
    nonce: ActivityNumberSchema,
    origin: z.unknown().optional(),
    submittedAt: ActivityDateSchema,
    updatedAt: ActivityDateSchema,
    completedAt: ActivityDateSchema,
    positionsRefreshedAt: ActivityDateSchema,
    status: ActivityStatusSchema,
    confirmations: ActivityNumberSchema,
    receipt: z.unknown().optional(),
    gasSpent: z.string().nullable().optional(),
    balanceChanges: z.array(ActivityBalanceChangeSchema).optional(),
    data: z.unknown().optional(),
    payload: z.unknown().optional(),
    display: z.unknown().optional(),
    metadata: z.unknown().optional()
  })
  .passthrough()

const ActivitySchema = z.record(z.string().describe('Activity Id'), ActivityRecordSchema).default({})

const OrderTimestampSchema = z.union([z.number(), z.string(), z.date()])
const OrderOptionalTimestampSchema = OrderTimestampSchema.nullable().optional()
const OrderAmountSchema = z.union([z.number(), z.string()])
const OrderOptionalAmountSchema = OrderAmountSchema.nullable().optional()
const OrderAssetReferenceSchema = z
  .object({
    chainId: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)])
  })
  .passthrough()

export const OrderRecordSchema = z
  .object({
    orderId: z.string(),
    accountAddress: z.string(),
    provider: z.string().optional(),
    source: z.string().optional(),
    environment: z.string().nullable().optional(),
    profile: z.string().nullable().optional(),
    status: z.string(),
    rawStatus: z.string().nullable().optional(),
    orderType: z.string(),
    side: z.string(),
    targetAsset: OrderAssetReferenceSchema,
    contraAsset: OrderAssetReferenceSchema,
    qty: OrderAmountSchema,
    spentAsset: OrderAssetReferenceSchema.optional(),
    receiveAsset: OrderAssetReferenceSchema.optional(),
    spentAmount: OrderOptionalAmountSchema,
    outputAmount: OrderOptionalAmountSchema,
    estimatedOutputAmount: OrderOptionalAmountSchema,
    targetNotional: OrderOptionalAmountSchema,
    contraNotional: OrderOptionalAmountSchema,
    filledOutputAmount: OrderOptionalAmountSchema,
    averageFillPrice: OrderOptionalAmountSchema,
    createdAt: OrderTimestampSchema,
    updatedAt: OrderTimestampSchema,
    terminalAt: OrderOptionalTimestampSchema,
    open: z.boolean().optional(),
    cancellable: z.boolean().optional(),
    rawPayload: z.unknown().optional(),
    rawStatusPayload: z.unknown().optional(),
    fillHash: z.string().nullable().optional(),
    fillTransactionHash: z.string().nullable().optional()
  })
  .passthrough()
  .refine((order) => !Object.prototype.hasOwnProperty.call(order, 'chainId'), {
    message: 'Order chain must be defined by its assets',
    path: ['chainId']
  })
  .refine((order) => Boolean(order.provider || order.source), {
    message: 'Order record requires provider or source',
    path: ['source']
  })

const OrdersSchema = z.record(z.string().describe('Flash Order Id'), OrderRecordSchema).default({})

export const MainSchema = z
  .object({
    instanceId: z.string(), // TODO: uuid
    runtime: RuntimeSchema,
    networks: z.object({
      ethereum: z.record(z.coerce.number(), ChainSchema)
    }),
    networksMeta: z.object({
      ethereum: z.record(z.coerce.number(), ChainMetadataSchema)
    }),
    origins: z.record(z.string().describe('Origin Id'), OriginSchema),
    knownExtensions: z.record(z.string(), z.boolean()),
    permissions: z.record(
      z.string().describe('Address'),
      z.record(z.string().describe('Origin Id'), PermissionSchema)
    ),
    accounts: z.record(z.string(), AccountSchema),
    profiles: z.record(z.string(), ProfileSchema),
    profileOrder: z.array(z.string()),
    currentProfile: z.string().min(1),
    currentAccount: z.string().default(''),
    appLock: AppLockSchema,
    accountOrder: z.array(z.string()).default([]),
    accountsMeta: z.record(z.string(), AccountMetadataSchema),
    balances: z.record(z.string().describe('Address'), z.array(BalanceSchema)),
    assetRates: AssetRateMapSchema,
    tokens: TokenCatalogSchema,
    activity: ActivitySchema,
    orders: OrdersSchema,
    mute: z.record(notificationTypes, z.boolean()),
    shortcuts: ShortcutsSchema,
    updater: UpdaterPreferencesSchema,
    ...PreferencesSchema
  })
  .passthrough()

export type Main = z.infer<typeof MainSchema>
export type ActivityRecord = z.infer<typeof ActivityRecordSchema>

export function getProfileAccountIds(
  main: Pick<Main, 'accounts' | 'accountOrder'>,
  profileId: string
): string[] {
  const ordered: string[] = []
  const seen = new Set<string>()

  for (const id of [...main.accountOrder, ...Object.keys(main.accounts)]) {
    if (!seen.has(id) && main.accounts[id]?.profileId === profileId) {
      seen.add(id)
      ordered.push(id)
    }
  }

  return ordered
}
