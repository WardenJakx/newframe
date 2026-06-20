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
  mute: z.record(notificationTypes, z.boolean()),
  colorway: z.enum(['light', 'dark']),
  colorwayPrimary: ColorwayPrimarySchema,
  shortcuts: ShortcutsSchema,
  updater: UpdaterPreferencesSchema,
  ...PreferencesSchema
})

export type Main = z.infer<typeof MainSchema>
