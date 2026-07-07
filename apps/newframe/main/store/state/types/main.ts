import { z } from 'zod'

import { AccountMetadataSchema, AccountSchema } from './account'
import { BalanceSchema } from './balance'
import { ChainMetadataSchema, ChainSchema } from './chain'
import { ColorwayPrimarySchema } from './colors'
import { OriginSchema } from './origin'
import { PermissionSchema } from './permission'
import { ShortcutSchema } from './shortcuts'

const ShortcutsSchema = z.object({
  summon: ShortcutSchema
})

const UpdaterPreferencesSchema = z.object({
  dontRemind: z.array(z.string()),
  lastChecked: z.number().default(0)
})

// these are individual keys on the main state object
const PreferencesSchema = {
  launch: z.boolean().default(false).describe('Launch Newframe on system start'),
  reveal: z.boolean().default(false).describe('Show Newframe when user glides mouse to edge of screen'),
  autohide: z.boolean().default(false).describe('Automatically hide Newframe when it loses focus'),
  accountCloseLock: z
    .boolean()
    .default(false)
    .describe("Lock an account when it's closed instead of when Newframe restarts"),
  showLocalNameWithENS: z.boolean(),
  autoDiscoverTokens: z
    .boolean()
    .default(false)
    .describe('Automatically discover tokens through portfolio providers'),
  portfolioApiKey: z.string().default('').describe('Zerion API key for portfolio providers'),
  showTestnets: z.boolean().default(false).describe('Show testnet networks in the wallet UI'),
  menubarGasPrice: z.boolean().default(false).describe('Show gas price in menu bar'),
  biometricUnlock: z.boolean().default(false).describe('Unlock Newframe with biometrics on this device'),
  hardwareDerivation: z.string()
}

const notificationTypes = z.enum([
  'alphaWarning',
  'welcomeWarning',
  'externalLinkWarning',
  'explorerWarning',
  'signerRelockChange',
  'gasFeeWarning',
  'betaDisclosure',
  'onboardingWindow',
  'signerCompatibilityWarning'
])

export const ActivityStatusSchema = z.enum(['submitted', 'confirming', 'succeeded', 'reverted'])

const ActivityDateSchema = z.union([z.number(), z.string(), z.date()]).nullable().optional()
const ActivityNumberSchema = z.union([z.number(), z.string()]).nullable().optional()

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
    status: ActivityStatusSchema,
    confirmations: ActivityNumberSchema,
    receipt: z.unknown().optional(),
    data: z.unknown().optional(),
    payload: z.unknown().optional(),
    display: z.unknown().optional(),
    metadata: z.unknown().optional()
  })
  .passthrough()

export const ActivitySchema = z.record(z.string().describe('Activity Id'), ActivityRecordSchema).default({})

const OrderTimestampSchema = z.union([z.number(), z.string(), z.date()])
const OrderOptionalTimestampSchema = OrderTimestampSchema.nullable().optional()
const OrderAmountSchema = z.union([z.number(), z.string()])
const OrderOptionalAmountSchema = OrderAmountSchema.nullable().optional()

export const OrderRecordSchema = z
  .object({
    orderId: z.string(),
    accountAddress: z.string(),
    chainId: z.union([z.number(), z.string()]),
    provider: z.string().optional(),
    source: z.string().optional(),
    environment: z.string().nullable().optional(),
    profile: z.string().nullable().optional(),
    status: z.string(),
    rawStatus: z.string().nullable().optional(),
    orderType: z.string(),
    side: z.string(),
    targetAsset: z.unknown(),
    contraAsset: z.unknown(),
    qty: OrderAmountSchema,
    spentAsset: z.unknown().optional(),
    spentAmount: OrderOptionalAmountSchema,
    outputAmount: OrderOptionalAmountSchema,
    estimatedOutputAmount: OrderOptionalAmountSchema,
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
  .refine((order) => Boolean(order.provider || order.source), {
    message: 'Order record requires provider or source',
    path: ['source']
  })

export const OrdersSchema = z.record(z.string().describe('Flash Order Id'), OrderRecordSchema).default({})

export const MainSchema = z.object({
  _version: z.coerce.number(),
  instanceId: z.string(), // TODO: uuid
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
  currentAccount: z.string().default(''),
  accountOrder: z.array(z.string()).default([]),
  accountsMeta: z.record(z.string(), AccountMetadataSchema),
  balances: z.record(z.string().describe('Address'), z.array(BalanceSchema)),
  activity: ActivitySchema,
  orders: OrdersSchema,
  mute: z.record(notificationTypes, z.boolean()),
  colorway: z.enum(['light', 'dark']),
  colorwayPrimary: ColorwayPrimarySchema,
  shortcuts: ShortcutsSchema,
  updater: UpdaterPreferencesSchema,
  ...PreferencesSchema
})

export type Main = z.infer<typeof MainSchema>
export type Activity = z.infer<typeof ActivitySchema>
export type ActivityRecord = z.infer<typeof ActivityRecordSchema>
export type ActivityStatus = z.infer<typeof ActivityStatusSchema>
export type Orders = z.infer<typeof OrdersSchema>
export type OrderRecord = z.infer<typeof OrderRecordSchema>
