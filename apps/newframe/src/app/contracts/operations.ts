import { z } from 'zod'

import {
  FlashAssetSchema,
  FlashOrderTypeSchema,
  FlashQuoteSchema as DomainFlashQuoteSchema,
  FlashTradeSideSchema
} from '../../features/transactions/trade/domain/schemas.js'
import {
  FLASH_MAX_TWAP_BUCKET_COUNT,
  FLASH_MAX_TWAP_DURATION_SECONDS,
  FLASH_MIN_TWAP_BUCKET_COUNT,
  FLASH_MIN_TWAP_DURATION_SECONDS
} from '../../features/transactions/trade/domain/policy.js'

const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
const ChainIdSchema = z.number().int().positive()
const HexQuantitySchema = z
  .string()
  .max(66)
  .regex(/^0x[0-9a-fA-F]+$/)
const ErrorMessageSchema = z.string().max(1_000).optional()
const IdempotencyKeySchema = z.uuid()

const TypedDataFieldSchema = z.strictObject({
  name: z.string().min(1).max(128),
  type: z.string().min(1).max(128)
})

export const TypedDataV4Schema = z
  .strictObject({
    domain: z.record(z.string().max(128), z.json()),
    message: z.record(z.string().max(128), z.json()),
    primaryType: z.string().min(1).max(128),
    types: z.record(z.string().max(128), z.array(TypedDataFieldSchema).max(256))
  })
  .refine((value) => JSON.stringify(value).length <= 1_000_000, 'Typed data is too large')
export type TypedDataV4 = z.infer<typeof TypedDataV4Schema>

const FlashTriggerSchema = z.strictObject({
  notionalPrice: z.string().min(1).max(128),
  triggerType: z.enum(['lower', 'upper'])
})
const FlashQuoteDisplayActionSchema = z.strictObject({
  id: z.string().min(1).max(256),
  kind: z.enum(['wrap', 'approve']),
  label: z.string().min(1).max(256),
  asset: FlashAssetSchema,
  amount: z.string().max(128),
  amountRaw: z.string().max(128)
})

export const FlashQuoteDisplaySchema = DomainFlashQuoteSchema.omit({ raw: true, actions: true }).extend({
  id: z.string().min(1).max(256),
  actions: z
    .strictObject({
      wrap: FlashQuoteDisplayActionSchema.nullable().optional(),
      approval: FlashQuoteDisplayActionSchema.nullable().optional()
    })
    .optional(),
  nextAction: z.enum(['wrap', 'approve', 'sign']),
  requiresPermit: z.boolean()
})
export type FlashQuoteDisplay = z.infer<typeof FlashQuoteDisplaySchema>

const FlashOptionalOrderFields = {
  startTime: z.string().max(128).optional(),
  durationSeconds: z
    .number()
    .int()
    .min(FLASH_MIN_TWAP_DURATION_SECONDS)
    .max(FLASH_MAX_TWAP_DURATION_SECONDS)
    .optional(),
  expireTime: z.string().max(128).optional(),
  limitNotionalPrice: z.string().max(128).optional(),
  maxPriceImpact: z.string().max(128).optional(),
  quickTrade: z.literal(true).optional(),
  slippage: z.string().max(128).optional(),
  triggers: z.array(FlashTriggerSchema).max(2).optional(),
  twapBucketCount: z
    .number()
    .int()
    .min(FLASH_MIN_TWAP_BUCKET_COUNT)
    .max(FLASH_MAX_TWAP_BUCKET_COUNT)
    .optional()
}

export const FlashQuoteRequestSchema = z
  .strictObject({
    contraAsset: FlashAssetSchema,
    inputAmount: z.string().min(1).max(128),
    orderType: FlashOrderTypeSchema,
    qty: z.string().min(1).max(128),
    side: FlashTradeSideSchema,
    targetAsset: FlashAssetSchema,
    ...FlashOptionalOrderFields
  })
  .refine(
    ({ contraAsset, orderType, targetAsset }) =>
      contraAsset.chainId === targetAsset.chainId || orderType === 'market',
    'Cross-chain Flash quotes only support market orders'
  )

export type FlashQuoteRequest = z.infer<typeof FlashQuoteRequestSchema>

const AccountSelectCommandSchema = z.strictObject({
  type: z.literal('account.select'),
  accountId: z.string().min(1).max(256)
})

const OperationIdSchema = z.string().min(1).max(256)
const ProfileIdSchema = z.string().min(1).max(256)
const ProfileNameSchema = z.string().trim().min(1).max(50)

const ProfileSelectCommandSchema = z.strictObject({
  type: z.literal('profile.select'),
  operationId: OperationIdSchema,
  profileId: ProfileIdSchema
})
export type ProfileSelectCommand = z.infer<typeof ProfileSelectCommandSchema>

const ProfileCreateCommandSchema = z.strictObject({
  type: z.literal('profile.create'),
  operationId: OperationIdSchema,
  name: ProfileNameSchema,
  accountIds: z
    .array(z.string().min(1).max(256))
    .max(1_000)
    .refine((ids) => new Set(ids).size === ids.length, 'Account IDs must be unique')
    .optional()
})
export type ProfileCreateCommand = z.infer<typeof ProfileCreateCommandSchema>

const ProfileRenameCommandSchema = z.strictObject({
  type: z.literal('profile.rename'),
  operationId: OperationIdSchema,
  profileId: ProfileIdSchema,
  name: ProfileNameSchema
})
export type ProfileRenameCommand = z.infer<typeof ProfileRenameCommandSchema>

const ProfileDeleteCommandSchema = z.strictObject({
  type: z.literal('profile.delete'),
  operationId: OperationIdSchema,
  profileId: ProfileIdSchema
})
export type ProfileDeleteCommand = z.infer<typeof ProfileDeleteCommandSchema>

const AccountProfileMoveCommandSchema = z.strictObject({
  type: z.literal('account.profile-move'),
  operationId: OperationIdSchema,
  accountId: z.string().min(1).max(256),
  profileId: ProfileIdSchema
})
export type AccountProfileMoveCommand = z.infer<typeof AccountProfileMoveCommandSchema>

const ProfileMovableAccountsQuerySchema = z.strictObject({
  type: z.literal('profile.movable-accounts')
})
export type ProfileMovableAccountsQuery = z.infer<typeof ProfileMovableAccountsQuerySchema>

const ProfileMovableAccountSchema = z.strictObject({
  id: z.string().min(1).max(256),
  address: z.string().min(1).max(256),
  name: z.string().max(256),
  profileId: ProfileIdSchema
})

const ProfileMovableAccountsResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    accounts: z.array(ProfileMovableAccountSchema).max(1_000)
  }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(['invalid_query', 'unauthorized', 'operation_failed'])
  })
])

const SendSubmitCommandSchema = z.strictObject({
  type: z.literal('send.submit'),
  operationId: OperationIdSchema,
  asset: z.strictObject({
    address: AddressSchema,
    chainId: ChainIdSchema
  }),
  amount: z
    .string()
    .regex(/^[1-9][0-9]{0,77}$/)
    .max(78),
  recipient: z.string().trim().min(1).max(512)
})

export type SendSubmitCommand = z.infer<typeof SendSubmitCommandSchema>

const TradePrepareCommandSchema = z.strictObject({
  type: z.literal('trade.prepare'),
  operationId: OperationIdSchema,
  quoteId: z.string().min(1).max(256),
  action: z.enum(['wrap', 'approve'])
})
export type TradePrepareCommand = z.infer<typeof TradePrepareCommandSchema>

const TradeSubmitCommandSchema = z.strictObject({
  type: z.literal('trade.submit'),
  operationId: OperationIdSchema,
  quoteId: z.string().min(1).max(256)
})
export type TradeSubmitCommand = z.infer<typeof TradeSubmitCommandSchema>

const TradeReleaseCommandSchema = z.strictObject({ type: z.literal('trade.release') })

const SideTrayCloseCommandSchema = z.strictObject({ type: z.literal('sidetray.close') })

const RendererContextMenuCommandSchema = z.strictObject({
  type: z.literal('renderer.context-menu'),
  x: z.number().finite().nonnegative().max(100_000),
  y: z.number().finite().nonnegative().max(100_000)
})
export type RendererContextMenuCommand = z.infer<typeof RendererContextMenuCommandSchema>

const NameResolveQuerySchema = z.strictObject({
  type: z.literal('name.resolve'),
  name: z.string().trim().min(1).max(255)
})

export type NameResolveQuery = z.infer<typeof NameResolveQuerySchema>

const NameResolveResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(['invalid_query', 'unauthorized', 'not_found', 'resolution_failed'])
  })
])

const AddressChainUsageQuerySchema = z.strictObject({
  type: z.literal('address.chain-usage'),
  addresses: z.array(AddressSchema).min(1).max(20)
})

export type AddressChainUsageQuery = z.infer<typeof AddressChainUsageQuerySchema>

const AddressChainUsageSchema = z.strictObject({
  address: AddressSchema,
  chainIds: z.array(ChainIdSchema).max(100),
  complete: z.boolean()
})

const AddressChainUsageResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    usage: z.array(AddressChainUsageSchema).max(20)
  }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(['invalid_query', 'unauthorized', 'lookup_failed'])
  })
])

const FlashQuoteQuerySchema = z.strictObject({
  type: z.literal('flash.quote'),
  request: FlashQuoteRequestSchema
})

export type FlashQuoteQuery = z.infer<typeof FlashQuoteQuerySchema>

export const FlashQuoteResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    quoteId: z.string().min(1).max(256),
    quote: FlashQuoteDisplaySchema
  }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(['invalid_query', 'unauthorized', 'no_current_account', 'quote_failed']),
    message: ErrorMessageSchema
  })
])

export type FlashQuoteResult = z.infer<typeof FlashQuoteResultSchema>

export const QueryBoundaryFailureSchema = z.strictObject({
  ok: z.literal(false),
  error: z.enum(['invalid_query', 'unauthorized']),
  message: ErrorMessageSchema.optional()
})
type QueryBoundaryFailure = z.infer<typeof QueryBoundaryFailureSchema>

export const CommandResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(['invalid_command', 'unauthorized', 'not_found', 'request_not_found', 'operation_failed']),
    message: ErrorMessageSchema.optional()
  })
])
export type CommandResult = z.infer<typeof CommandResultSchema>

const ClipboardWriteCommandSchema = z.strictObject({
  type: z.literal('clipboard.write'),
  text: z.string().min(1).max(100_000)
})

const ExternalOpenCommandSchema = z.strictObject({
  type: z.literal('external.open'),
  url: z.url({ protocol: /^https:$/ }).max(4_096)
})

const ExplorerOpenCommandSchema = z.strictObject({
  type: z.literal('explorer.open'),
  chainId: ChainIdSchema,
  transactionHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .optional()
})

const TokenSchema = z.strictObject({
  address: AddressSchema,
  chainId: ChainIdSchema,
  decimals: z.number().int().min(0).max(255),
  logoURI: z.string().max(4_096).default(''),
  name: z.string().trim().min(1).max(128),
  symbol: z.string().trim().min(1).max(32)
})
export type WalletToken = z.infer<typeof TokenSchema>

const TokenAddCommandSchema = z.strictObject({
  type: z.literal('token.add'),
  operationId: OperationIdSchema,
  token: TokenSchema
})
export type TokenAddCommand = z.infer<typeof TokenAddCommandSchema>

const TokenRemoveCommandSchema = z.strictObject({
  type: z.literal('token.remove'),
  address: AddressSchema,
  chainId: ChainIdSchema
})

const TokenImageHydrateCommandSchema = z.strictObject({
  type: z.literal('token.image-hydrate'),
  tokenId: z
    .string()
    .max(128)
    .regex(/^\d+:0x[0-9a-fA-F]{40}$/)
})

const OriginRemoveCommandSchema = z.strictObject({
  type: z.literal('origin.remove'),
  originId: OperationIdSchema
})

const WarningToggleCommandSchema = z.strictObject({
  type: z.literal('warning.toggle'),
  warning: z.enum(['explorer', 'gas-fee', 'signer-compatibility'])
})
export type WarningToggleCommand = z.infer<typeof WarningToggleCommandSchema>

const RequestApproveCommandSchema = z.strictObject({
  type: z.literal('request.approve'),
  requestId: OperationIdSchema
})

const RequestWarningConfirmCommandSchema = z.strictObject({
  type: z.literal('request.warning-confirm'),
  requestId: OperationIdSchema,
  gate: z.enum(['signer-compatibility', 'gas-fee'])
})

const NetworkRemoveCommandSchema = z.strictObject({
  type: z.literal('network.remove'),
  chainId: ChainIdSchema
})

const TrezorInputCommandSchema = z.discriminatedUnion('input', [
  z.strictObject({
    type: z.literal('signer.trezor-input'),
    operationId: OperationIdSchema,
    actionId: OperationIdSchema,
    signerId: OperationIdSchema,
    input: z.literal('pin'),
    value: z.string().regex(/^[1-9]{1,9}$/)
  }),
  z.strictObject({
    type: z.literal('signer.trezor-input'),
    operationId: OperationIdSchema,
    actionId: OperationIdSchema,
    signerId: OperationIdSchema,
    input: z.literal('passphrase'),
    value: z.string().max(256)
  }),
  z.strictObject({
    type: z.literal('signer.trezor-input'),
    operationId: OperationIdSchema,
    actionId: OperationIdSchema,
    signerId: OperationIdSchema,
    input: z.literal('device-passphrase')
  })
])
export type TrezorInputCommand = z.infer<typeof TrezorInputCommandSchema>

const LatticePairCommandSchema = z.strictObject({
  type: z.literal('signer.lattice-pair'),
  operationId: OperationIdSchema,
  actionId: OperationIdSchema,
  signerId: OperationIdSchema,
  pairCode: z.string().trim().min(1).max(64)
})
export type LatticePairCommand = z.infer<typeof LatticePairCommandSchema>

const SignerHardwareSessionStartCommandSchema = z.strictObject({
  type: z.literal('signer.hardware-session-start'),
  operationId: OperationIdSchema,
  signerId: OperationIdSchema
})
export type SignerHardwareSessionStartCommand = z.infer<typeof SignerHardwareSessionStartCommandSchema>

const SignerHardwareSessionFinishCommandSchema = z.strictObject({
  type: z.literal('signer.hardware-session-finish'),
  operationId: OperationIdSchema,
  signerId: OperationIdSchema,
  outcome: z.enum(['ready', 'cancelled'])
})
export type SignerHardwareSessionFinishCommand = z.infer<typeof SignerHardwareSessionFinishCommandSchema>

const AccountRemoveCommandSchema = z.strictObject({
  type: z.literal('account.remove'),
  address: AddressSchema,
  removeSeedSigner: z.boolean().optional()
})

const SignerReloadCommandSchema = z.strictObject({
  type: z.literal('signer.reload'),
  operationId: OperationIdSchema,
  signerId: OperationIdSchema
})
export type SignerReloadCommand = z.infer<typeof SignerReloadCommandSchema>

const SignerLedgerAccountsLoadCommandSchema = z.strictObject({
  type: z.literal('signer.ledger-accounts-load'),
  operationId: OperationIdSchema,
  signerId: OperationIdSchema,
  accountCount: z.number().int().min(5).max(100).multipleOf(5)
})
export type SignerLedgerAccountsLoadCommand = z.infer<typeof SignerLedgerAccountsLoadCommandSchema>

const TokenLookupQuerySchema = z.strictObject({
  type: z.literal('token.lookup'),
  address: AddressSchema,
  chainId: ChainIdSchema
})
export type TokenLookupQuery = z.infer<typeof TokenLookupQuerySchema>

const TokenLookupResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    token: z.strictObject({
      decimals: z.number().int().min(0).max(255),
      name: z.string().max(128),
      symbol: z.string().max(32),
      totalSupply: z.string().max(256)
    })
  }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(['invalid_query', 'unauthorized', 'not_found', 'lookup_failed'])
  })
])

const BoundedPasswordSchema = z.string().max(1_024)
const BoundedNameSchema = z.string().trim().max(128)
const HttpUrlSchema = z.url({ protocol: /^https?:$/ }).max(4_096)
const KeystoreSchema = z
  .looseObject({ version: z.union([z.literal(1), z.literal(3)]) })
  .refine((value) => JSON.stringify(value).length <= 1_000_000, 'Keystore is too large')

const HomeCommandConsumeCommandSchema = z.strictObject({
  type: z.literal('home.command-consume'),
  commandId: z.number().int().positive()
})

const SecurityStatusQuerySchema = z.strictObject({ type: z.literal('security.status') })
export type SecurityStatusQuery = z.infer<typeof SecurityStatusQuerySchema>

const BiometricSummarySchema = z.strictObject({
  enabled: z.boolean(),
  method: z.enum(['', 'native', 'webauthn']),
  credential: z
    .strictObject({
      version: z.literal(1),
      credentialId: z
        .string()
        .regex(/^[0-9a-fA-F]+$/)
        .max(8_192),
      salt: z.string().regex(/^[0-9a-fA-F]{64}$/)
    })
    .optional(),
  nativeAvailable: z.boolean()
})

const SecurityStatusResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    locked: z.boolean(),
    vaultExists: z.boolean(),
    biometricUnlockEnabled: z.boolean(),
    biometricAvailable: z.boolean(),
    biometrics: BiometricSummarySchema
  }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(['invalid_query', 'unauthorized', 'operation_failed']),
    message: ErrorMessageSchema
  })
])
export type SecurityStatusResult = z.infer<typeof SecurityStatusResultSchema>

const WebAuthnEnrollmentSchema = z.strictObject({
  status: z.literal('enrolled'),
  credential: z.strictObject({
    version: z.literal(1),
    credentialId: z
      .string()
      .regex(/^[0-9a-fA-F]+$/)
      .max(8_192),
    salt: z.string().regex(/^[0-9a-fA-F]{64}$/)
  }),
  secret: z
    .string()
    .regex(/^[0-9a-fA-F]+$/)
    .min(32)
    .max(512)
})

const SecurityConfigureCommandSchema = z.discriminatedUnion('mode', [
  z.strictObject({
    type: z.literal('security.configure'),
    operationId: OperationIdSchema,
    mode: z.literal('disabled')
  }),
  z.strictObject({
    type: z.literal('security.configure'),
    operationId: OperationIdSchema,
    mode: z.literal('best-available'),
    browser: z.discriminatedUnion('status', [
      WebAuthnEnrollmentSchema,
      z.strictObject({ status: z.literal('unavailable') }),
      z.strictObject({ status: z.literal('failed') })
    ])
  })
])
export type SecurityConfigureCommand = z.infer<typeof SecurityConfigureCommandSchema>

const WalletLockCommandSchema = z.strictObject({
  type: z.literal('wallet.lock'),
  operationId: OperationIdSchema
})
export type WalletLockCommand = z.infer<typeof WalletLockCommandSchema>

const NetworkPrimaryRpcSetCommandSchema = z.strictObject({
  type: z.literal('network.primary-rpc-set'),
  chainId: ChainIdSchema,
  url: HttpUrlSchema
})

const NetworkActivationSetCommandSchema = z.strictObject({
  type: z.literal('network.activation-set'),
  chainId: ChainIdSchema,
  enabled: z.boolean()
})

const SideTrayOpenCommandSchema = z.strictObject({
  type: z.literal('sidetray.open'),
  feature: z.enum(['send', 'trade']),
  assetId: z.string().max(256).optional(),
  chainId: ChainIdSchema.optional()
})
export type SideTrayOpenCommand = z.infer<typeof SideTrayOpenCommandSchema>

const FlashOrderCancelCommandSchema = z.strictObject({
  type: z.literal('flash.order-cancel'),
  operationId: OperationIdSchema,
  orderId: OperationIdSchema
})
export type FlashOrderCancelCommand = z.infer<typeof FlashOrderCancelCommandSchema>

const AccountReorderCommandSchema = z.strictObject({
  type: z.literal('account.reorder'),
  fromAccountId: AddressSchema,
  toAccountId: AddressSchema
})

const AccountRenameCommandSchema = z.strictObject({
  type: z.literal('account.rename'),
  accountId: AddressSchema,
  name: BoundedNameSchema.min(1)
})

const AccountAgentAccessSetCommandSchema = z.strictObject({
  type: z.literal('account.agent-access-set'),
  accountId: AddressSchema,
  enabled: z.boolean()
})

const AccountAgentSessionsRevokeCommandSchema = z.strictObject({
  type: z.literal('account.agent-sessions-revoke'),
  accountId: AddressSchema
})

const AccountPrivateKeyExportQuerySchema = z.strictObject({
  type: z.literal('account.private-key-export'),
  accountId: AddressSchema,
  password: BoundedPasswordSchema.min(1)
})
export type AccountPrivateKeyExportQuery = z.infer<typeof AccountPrivateKeyExportQuerySchema>

const AccountPrivateKeyExportResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    privateKey: z.string().regex(/^(?:0x)?[0-9a-fA-F]{64}$/)
  }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(['invalid_query', 'unauthorized', 'account_not_found', 'export_failed']),
    message: ErrorMessageSchema
  })
])

const AccountAddFromSignerCommandSchema = z.strictObject({
  type: z.literal('account.add-from-signer'),
  operationId: OperationIdSchema,
  signerId: OperationIdSchema,
  address: AddressSchema,
  name: BoundedNameSchema.optional()
})
export type AccountAddFromSignerCommand = z.infer<typeof AccountAddFromSignerCommandSchema>

const AccountWatchAddCommandSchema = z.strictObject({
  type: z.literal('account.watch-add'),
  operationId: OperationIdSchema,
  addressOrName: z.string().trim().min(1).max(255),
  name: BoundedNameSchema.optional()
})
export type AccountWatchAddCommand = z.infer<typeof AccountWatchAddCommandSchema>

const KeystoreLocateQuerySchema = z.strictObject({ type: z.literal('keystore.locate') })
export type KeystoreLocateQuery = z.infer<typeof KeystoreLocateQuerySchema>

export const KeystoreLocateResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), keystore: KeystoreSchema }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(['invalid_query', 'unauthorized', 'not_found', 'invalid_keystore', 'operation_failed']),
    message: ErrorMessageSchema
  })
])

const SignerImportCommandSchema = z.discriminatedUnion('source', [
  z.strictObject({
    type: z.literal('signer.import'),
    operationId: OperationIdSchema,
    source: z.literal('phrase'),
    phrase: z.string().trim().min(1).max(2_048),
    framePassword: BoundedPasswordSchema,
    accountName: BoundedNameSchema.optional()
  }),
  z.strictObject({
    type: z.literal('signer.import'),
    operationId: OperationIdSchema,
    source: z.literal('private-key'),
    privateKey: z.string().regex(/^(?:0x)?[0-9a-fA-F]{64}$/),
    framePassword: BoundedPasswordSchema,
    accountName: BoundedNameSchema.optional()
  }),
  z.strictObject({
    type: z.literal('signer.import'),
    operationId: OperationIdSchema,
    source: z.literal('keystore'),
    keystore: KeystoreSchema,
    keystorePassword: BoundedPasswordSchema.min(1),
    framePassword: BoundedPasswordSchema,
    accountName: BoundedNameSchema.optional()
  })
])
export type SignerImportCommand = z.infer<typeof SignerImportCommandSchema>

const SignerLatticeCreateCommandSchema = z.strictObject({
  type: z.literal('signer.lattice-create'),
  operationId: OperationIdSchema,
  deviceId: z.string().trim().min(1).max(128),
  deviceName: z.string().trim().min(1).max(128)
})
export type SignerLatticeCreateCommand = z.infer<typeof SignerLatticeCreateCommandSchema>

const SignerDisconnectCommandSchema = z.strictObject({
  type: z.literal('signer.disconnect'),
  operationId: OperationIdSchema,
  signerId: OperationIdSchema
})
export type SignerDisconnectCommand = z.infer<typeof SignerDisconnectCommandSchema>

const PortfolioRefreshCommandSchema = z.strictObject({
  type: z.literal('portfolio.refresh'),
  operationId: OperationIdSchema
})
export type PortfolioRefreshCommand = z.infer<typeof PortfolioRefreshCommandSchema>

const SettingsBooleanSchema = z.discriminatedUnion('setting', [
  z.strictObject({
    type: z.literal('settings.update'),
    setting: z.enum([
      'autohide',
      'launch',
      'reveal',
      'menubar-gas-price',
      'show-local-name-with-ens',
      'show-testnets',
      'shortcut-enabled',
      'shortcut-configuring'
    ]),
    value: z.boolean()
  }),
  z.strictObject({
    type: z.literal('settings.update'),
    setting: z.literal('auto-discover-tokens'),
    value: z.boolean(),
    apiKey: z.string().trim().max(512).optional()
  })
])

const ShortcutUpdateSchema = z.strictObject({
  modifierKeys: z.array(z.enum(['Alt', 'Control', 'Meta', 'Super', 'CommandOrCtrl'])).max(5),
  shortcutKey: z
    .string()
    .max(32)
    .regex(
      /^(?:Comma|Period|Forwardslash|Slash|Tab|Space|Enter|Escape|Arrow(?:Up|Down|Left|Right)|F(?:[1-9]|1[01])|Digit[0-9]|Key[A-Z]|Numpad(?:Divide|Multiply|Subtract|Add|Decimal|[0-9]))$/
    ),
  enabled: z.boolean(),
  configuring: z.boolean()
})

const SettingsUpdateCommandSchema = z.discriminatedUnion('setting', [
  ...SettingsBooleanSchema.options,
  z.strictObject({
    type: z.literal('settings.update'),
    setting: z.literal('trezor-derivation'),
    value: z.enum(['standard', 'legacy', 'testnet'])
  }),
  z.strictObject({
    type: z.literal('settings.update'),
    setting: z.literal('ledger-derivation'),
    value: z.enum(['live', 'legacy', 'standard', 'testnet'])
  }),
  z.strictObject({
    type: z.literal('settings.update'),
    setting: z.literal('lattice-derivation'),
    value: z.enum(['standard', 'legacy', 'live'])
  }),
  z.strictObject({
    type: z.literal('settings.update'),
    setting: z.enum(['ledger-live-account-limit', 'lattice-account-limit']),
    value: z.union([z.literal(5), z.literal(10), z.literal(20), z.literal(40)])
  }),
  z.strictObject({
    type: z.literal('settings.update'),
    setting: z.literal('lattice-endpoint-mode'),
    value: z.enum(['default', 'custom'])
  }),
  z.strictObject({
    type: z.literal('settings.update'),
    setting: z.literal('lattice-endpoint'),
    value: z.union([z.literal(''), HttpUrlSchema])
  }),
  z.strictObject({
    type: z.literal('settings.update'),
    setting: z.literal('portfolio-api-key'),
    value: z.string().trim().max(512)
  }),
  z.strictObject({
    type: z.literal('settings.update'),
    setting: z.literal('summon-shortcut'),
    value: ShortcutUpdateSchema
  })
])
export type SettingsUpdateCommand = z.infer<typeof SettingsUpdateCommandSchema>

const WalletResetCommandSchema = z.strictObject({
  type: z.literal('wallet.reset'),
  operationId: OperationIdSchema,
  scope: z.enum(['saved-data', 'all-settings-data'])
})
export type WalletResetCommand = z.infer<typeof WalletResetCommandSchema>

const AppQuitCommandSchema = z.strictObject({ type: z.literal('app.quit') })

const PermissionClearCommandSchema = z.strictObject({
  type: z.literal('permission.clear'),
  accountId: AddressSchema,
  originId: OperationIdSchema.optional()
})

const NetworkRequestResolveCommandSchema = z
  .strictObject({
    type: z.literal('network.request-resolve'),
    approved: z.boolean(),
    requestId: OperationIdSchema.optional(),
    homeCommandId: z.number().int().positive().optional()
  })
  .refine(
    ({ requestId, homeCommandId }) => Number(Boolean(requestId)) + Number(Boolean(homeCommandId)) === 1,
    'Exactly one canonical request identifier is required'
  )
export type NetworkRequestResolveCommand = z.infer<typeof NetworkRequestResolveCommandSchema>

const NotificationUpdateCommandSchema = z.strictObject({
  type: z.literal('notification.update'),
  notificationId: OperationIdSchema,
  action: z.enum(['dismiss', 'expire'])
})

const SeedGenerateQuerySchema = z.strictObject({ type: z.literal('seed.generate') })
export type SeedGenerateQuery = z.infer<typeof SeedGenerateQuerySchema>

const SeedGenerateResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), phrase: z.string().trim().min(1).max(2_048) }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(['invalid_query', 'unauthorized', 'operation_failed']),
    message: ErrorMessageSchema
  })
])

const SecurityUnlockCommandSchema = z.discriminatedUnion('method', [
  z.strictObject({
    type: z.literal('security.unlock'),
    operationId: OperationIdSchema,
    method: z.literal('password'),
    password: BoundedPasswordSchema.min(1)
  }),
  z.strictObject({
    type: z.literal('security.unlock'),
    operationId: OperationIdSchema,
    method: z.literal('native')
  }),
  z.strictObject({
    type: z.literal('security.unlock'),
    operationId: OperationIdSchema,
    method: z.literal('webauthn'),
    secret: z
      .string()
      .regex(/^[0-9a-fA-F]+$/)
      .min(32)
      .max(512)
  })
])
export type SecurityUnlockCommand = z.infer<typeof SecurityUnlockCommandSchema>

const RequestRejectCommandSchema = z.strictObject({
  type: z.literal('request.reject'),
  requestId: OperationIdSchema
})

const AccessRequestResolveCommandSchema = z.strictObject({
  type: z.literal('request.access-resolve'),
  requestId: OperationIdSchema,
  approved: z.boolean()
})

const AgentAccessRequestResolveCommandSchema = z.strictObject({
  type: z.literal('request.agent-access-resolve'),
  requestId: OperationIdSchema,
  approved: z.boolean()
})

const SwitchChainRequestResolveCommandSchema = z.strictObject({
  type: z.literal('request.switch-chain-resolve'),
  requestId: OperationIdSchema,
  approved: z.boolean()
})

const RequestClearOriginCommandSchema = z.strictObject({
  type: z.literal('request.clear-origin'),
  accountId: AddressSchema,
  originId: OperationIdSchema
})

const RequestApprovalConfirmCommandSchema = z.strictObject({
  type: z.literal('request.approval-confirm'),
  requestId: OperationIdSchema,
  approvalType: z.enum(['approveOtherChain', 'approveGasLimit'])
})

const TokenApprovalAmountSchema = z
  .string()
  .max(78)
  .regex(/^(?:0x[0-9a-fA-F]{1,64}|[0-9]{1,78})$/)

const RequestTokenApprovalUpdateCommandSchema = z.discriminatedUnion('requestKind', [
  z.strictObject({
    type: z.literal('request.token-approval-update'),
    requestKind: z.literal('transaction'),
    requestId: OperationIdSchema,
    actionId: z.literal('erc20:approve'),
    amount: TokenApprovalAmountSchema
  }),
  z.strictObject({
    type: z.literal('request.token-approval-update'),
    requestKind: z.literal('permit'),
    requestId: OperationIdSchema,
    amount: TokenApprovalAmountSchema
  })
])
export type RequestTokenApprovalUpdateCommand = z.infer<typeof RequestTokenApprovalUpdateCommandSchema>

const TransactionFeeUpdateCommandSchema = z.strictObject({
  type: z.literal('transaction.fee-update'),
  requestId: OperationIdSchema,
  field: z.enum(['baseFee', 'priorityFee', 'gasPrice', 'gasLimit']),
  value: HexQuantitySchema
})

const TransactionFeeDefaultSetCommandSchema = z.strictObject({
  type: z.literal('transaction.fee-default-set'),
  requestId: OperationIdSchema,
  level: z.enum(['asap', 'fast', 'standard', 'slow'])
})

const TransactionNonceAdjustCommandSchema = z.strictObject({
  type: z.literal('transaction.nonce-adjust'),
  requestId: OperationIdSchema,
  direction: z.union([z.literal(-1), z.literal(1)])
})

const TransactionNonceResetCommandSchema = z.strictObject({
  type: z.literal('transaction.nonce-reset'),
  requestId: OperationIdSchema
})

const TransactionFeeNoticeDismissCommandSchema = z.strictObject({
  type: z.literal('transaction.fee-notice-dismiss'),
  requestId: OperationIdSchema
})

const TransactionReplaceCommandSchema = z.strictObject({
  type: z.literal('transaction.replace'),
  requestId: OperationIdSchema,
  replacement: z.enum(['cancel', 'speed']),
  idempotencyKey: IdempotencyKeySchema
})
export type TransactionReplaceCommand = z.infer<typeof TransactionReplaceCommandSchema>

const PanelRequestOpenCommandSchema = z.strictObject({
  type: z.literal('panel.request-open'),
  requestId: OperationIdSchema
})

const PanelBackCommandSchema = z.strictObject({
  type: z.literal('panel.back'),
  steps: z.number().int().min(1).max(10).default(1)
})

const AddTokenReviewCommandSchema = z.strictObject({
  type: z.literal('request.add-token-review'),
  requestId: OperationIdSchema
})

const AddChainReviewCommandSchema = z.strictObject({
  type: z.literal('request.add-chain-review'),
  requestId: OperationIdSchema
})

const ExtensionRespondCommandSchema = z.strictObject({
  type: z.literal('extension.respond'),
  extensionId: z.string().trim().min(1).max(4_096),
  approved: z.boolean()
})

const UpdaterRespondCommandSchema = z.strictObject({
  type: z.literal('updater.respond'),
  action: z.enum(['restart', 'install', 'later', 'skip', 'dismiss-ready'])
})
export type UpdaterRespondCommand = z.infer<typeof UpdaterRespondCommandSchema>

const TrayMouseoutCommandSchema = z.strictObject({ type: z.literal('tray.mouseout') })

type OperationContract = {
  input: z.ZodType
  result: z.ZodType
}

function defineOperationContracts<const TContracts extends Record<string, OperationContract>>(
  contracts: TContracts
) {
  return contracts
}

const acknowledged = <TInput extends z.ZodType>(input: TInput) => ({
  input,
  result: CommandResultSchema
})

export const commandContracts = defineOperationContracts({
  'account.agent-access-set': acknowledged(AccountAgentAccessSetCommandSchema),
  'account.agent-sessions-revoke': acknowledged(AccountAgentSessionsRevokeCommandSchema),
  'account.add-from-signer': acknowledged(AccountAddFromSignerCommandSchema),
  'account.profile-move': acknowledged(AccountProfileMoveCommandSchema),
  'account.select': acknowledged(AccountSelectCommandSchema),
  'account.remove': acknowledged(AccountRemoveCommandSchema),
  'account.rename': acknowledged(AccountRenameCommandSchema),
  'account.reorder': acknowledged(AccountReorderCommandSchema),
  'account.watch-add': acknowledged(AccountWatchAddCommandSchema),
  'app.quit': acknowledged(AppQuitCommandSchema),
  'clipboard.write': acknowledged(ClipboardWriteCommandSchema),
  'sidetray.open': acknowledged(SideTrayOpenCommandSchema),
  'sidetray.close': acknowledged(SideTrayCloseCommandSchema),
  'renderer.context-menu': acknowledged(RendererContextMenuCommandSchema),
  'explorer.open': acknowledged(ExplorerOpenCommandSchema),
  'external.open': acknowledged(ExternalOpenCommandSchema),
  'extension.respond': acknowledged(ExtensionRespondCommandSchema),
  'flash.order-cancel': acknowledged(FlashOrderCancelCommandSchema),
  'home.command-consume': acknowledged(HomeCommandConsumeCommandSchema),
  'network.activation-set': acknowledged(NetworkActivationSetCommandSchema),
  'network.primary-rpc-set': acknowledged(NetworkPrimaryRpcSetCommandSchema),
  'network.remove': acknowledged(NetworkRemoveCommandSchema),
  'network.request-resolve': acknowledged(NetworkRequestResolveCommandSchema),
  'notification.update': acknowledged(NotificationUpdateCommandSchema),
  'origin.remove': acknowledged(OriginRemoveCommandSchema),
  'panel.back': acknowledged(PanelBackCommandSchema),
  'panel.request-open': acknowledged(PanelRequestOpenCommandSchema),
  'permission.clear': acknowledged(PermissionClearCommandSchema),
  'portfolio.refresh': acknowledged(PortfolioRefreshCommandSchema),
  'profile.create': acknowledged(ProfileCreateCommandSchema),
  'profile.delete': acknowledged(ProfileDeleteCommandSchema),
  'profile.rename': acknowledged(ProfileRenameCommandSchema),
  'profile.select': acknowledged(ProfileSelectCommandSchema),
  'request.approve': acknowledged(RequestApproveCommandSchema),
  'request.warning-confirm': acknowledged(RequestWarningConfirmCommandSchema),
  'request.access-resolve': acknowledged(AccessRequestResolveCommandSchema),
  'request.agent-access-resolve': acknowledged(AgentAccessRequestResolveCommandSchema),
  'request.add-chain-review': acknowledged(AddChainReviewCommandSchema),
  'request.add-token-review': acknowledged(AddTokenReviewCommandSchema),
  'request.approval-confirm': acknowledged(RequestApprovalConfirmCommandSchema),
  'request.clear-origin': acknowledged(RequestClearOriginCommandSchema),
  'request.reject': acknowledged(RequestRejectCommandSchema),
  'request.switch-chain-resolve': acknowledged(SwitchChainRequestResolveCommandSchema),
  'request.token-approval-update': acknowledged(RequestTokenApprovalUpdateCommandSchema),
  'security.configure': acknowledged(SecurityConfigureCommandSchema),
  'security.unlock': acknowledged(SecurityUnlockCommandSchema),
  'send.submit': acknowledged(SendSubmitCommandSchema),
  'trade.prepare': acknowledged(TradePrepareCommandSchema),
  'trade.release': acknowledged(TradeReleaseCommandSchema),
  'trade.submit': acknowledged(TradeSubmitCommandSchema),
  'settings.update': acknowledged(SettingsUpdateCommandSchema),
  'signer.disconnect': acknowledged(SignerDisconnectCommandSchema),
  'signer.hardware-session-finish': acknowledged(SignerHardwareSessionFinishCommandSchema),
  'signer.hardware-session-start': acknowledged(SignerHardwareSessionStartCommandSchema),
  'signer.import': acknowledged(SignerImportCommandSchema),
  'signer.ledger-accounts-load': acknowledged(SignerLedgerAccountsLoadCommandSchema),
  'signer.lattice-pair': acknowledged(LatticePairCommandSchema),
  'signer.lattice-create': acknowledged(SignerLatticeCreateCommandSchema),
  'signer.reload': acknowledged(SignerReloadCommandSchema),
  'signer.trezor-input': acknowledged(TrezorInputCommandSchema),
  'token.add': acknowledged(TokenAddCommandSchema),
  'token.image-hydrate': acknowledged(TokenImageHydrateCommandSchema),
  'token.remove': acknowledged(TokenRemoveCommandSchema),
  'transaction.fee-default-set': acknowledged(TransactionFeeDefaultSetCommandSchema),
  'transaction.fee-notice-dismiss': acknowledged(TransactionFeeNoticeDismissCommandSchema),
  'transaction.fee-update': acknowledged(TransactionFeeUpdateCommandSchema),
  'transaction.nonce-adjust': acknowledged(TransactionNonceAdjustCommandSchema),
  'transaction.nonce-reset': acknowledged(TransactionNonceResetCommandSchema),
  'transaction.replace': acknowledged(TransactionReplaceCommandSchema),
  'tray.mouseout': acknowledged(TrayMouseoutCommandSchema),
  'wallet.lock': acknowledged(WalletLockCommandSchema),
  'wallet.reset': acknowledged(WalletResetCommandSchema),
  'updater.respond': acknowledged(UpdaterRespondCommandSchema),
  'warning.toggle': acknowledged(WarningToggleCommandSchema)
})

export const queryContracts = defineOperationContracts({
  'account.private-key-export': {
    input: AccountPrivateKeyExportQuerySchema,
    result: AccountPrivateKeyExportResultSchema
  },
  'address.chain-usage': {
    input: AddressChainUsageQuerySchema,
    result: AddressChainUsageResultSchema
  },
  'flash.quote': { input: FlashQuoteQuerySchema, result: FlashQuoteResultSchema },
  'keystore.locate': { input: KeystoreLocateQuerySchema, result: KeystoreLocateResultSchema },
  'name.resolve': { input: NameResolveQuerySchema, result: NameResolveResultSchema },
  'profile.movable-accounts': {
    input: ProfileMovableAccountsQuerySchema,
    result: ProfileMovableAccountsResultSchema
  },
  'security.status': { input: SecurityStatusQuerySchema, result: SecurityStatusResultSchema },
  'seed.generate': { input: SeedGenerateQuerySchema, result: SeedGenerateResultSchema },
  'token.lookup': { input: TokenLookupQuerySchema, result: TokenLookupResultSchema }
})

type InputMap<TContracts extends Record<string, OperationContract>> = {
  [TType in keyof TContracts]: z.infer<TContracts[TType]['input']>
}

type ResultMap<TContracts extends Record<string, OperationContract>> = {
  [TType in keyof TContracts]: z.infer<TContracts[TType]['result']>
}

export type CommandMap = InputMap<typeof commandContracts>
export type QueryMap = InputMap<typeof queryContracts>
export type QueryResultMap = ResultMap<typeof queryContracts>

export type AppCommand = CommandMap[keyof CommandMap]
export type AppQuery = QueryMap[keyof QueryMap]
export type ResultForQuery<TQuery extends AppQuery> = QueryResultMap[TQuery['type']] | QueryBoundaryFailure
