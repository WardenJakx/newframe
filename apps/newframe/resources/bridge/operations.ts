import { z } from 'zod'

import {
  FlashAssetSchema,
  FlashOrderTypeSchema,
  FlashQuoteSchema as DomainFlashQuoteSchema,
  FlashTradeSideSchema
} from '../domain/flash/schemas'

const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
const ChainIdSchema = z.number().int().positive()
const HexDataSchema = z
  .string()
  .max(524_288)
  .regex(/^0x(?:[0-9a-fA-F]{2})*$/)
const HexQuantitySchema = z
  .string()
  .max(66)
  .regex(/^0x[0-9a-fA-F]+$/)
const SignatureSchema = z
  .string()
  .min(4)
  .max(8_194)
  .regex(/^0x(?:[0-9a-fA-F]{2})+$/)
const ErrorMessageSchema = z.string().max(1_000).optional()
const IdempotencyKeySchema = z.uuid()
const JsonPayloadSchema = z
  .json()
  .refine((value) => JSON.stringify(value).length <= 1_000_000, 'Payload is too large')

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

const FlashTriggerSchema = z.strictObject({
  notionalPrice: z.string().min(1).max(128),
  triggerType: z.enum(['lower', 'upper'])
})
const FlashQuoteSchema = DomainFlashQuoteSchema.extend({
  raw: JsonPayloadSchema.optional()
})

const FlashOptionalOrderFields = {
  durationSeconds: z.number().int().min(300).max(2_592_000).optional(),
  expireTime: z.string().max(128).optional(),
  limitNotionalPrice: z.string().max(128).optional(),
  maxPriceImpact: z.string().max(128).optional(),
  quickTrade: z.literal(true).optional(),
  slippage: z.string().max(128).optional(),
  triggers: z.array(FlashTriggerSchema).max(2).optional(),
  twapBucketCount: z.number().int().min(2).max(2_560).optional()
}

export const FlashQuoteRequestSchema = z
  .strictObject({
    chainId: ChainIdSchema,
    contraAsset: FlashAssetSchema,
    inputAmount: z.string().min(1).max(128),
    orderType: FlashOrderTypeSchema,
    qty: z.string().min(1).max(128),
    side: FlashTradeSideSchema,
    targetAsset: FlashAssetSchema,
    ...FlashOptionalOrderFields
  })
  .refine(
    ({ chainId, contraAsset, targetAsset }) =>
      contraAsset.chainId === chainId && targetAsset.chainId === chainId,
    'Flash assets must match the requested chain'
  )

export type FlashQuoteRequest = z.infer<typeof FlashQuoteRequestSchema>

export const FlashSubmitOrderSchema = z
  .strictObject({
    chainId: ChainIdSchema,
    contraAsset: FlashAssetSchema,
    evmOrderTypedData: z.union([z.string().max(1_000_000), JsonPayloadSchema]).optional(),
    evmPermitSignature: SignatureSchema.optional(),
    evmPermitTypedData: z.union([z.string().max(1_000_000), JsonPayloadSchema]).optional(),
    inputAmount: z.string().min(1).max(128),
    orderSignature: SignatureSchema,
    orderType: FlashOrderTypeSchema,
    qty: z.string().min(1).max(128),
    quote: FlashQuoteSchema,
    quoteId: z.string().max(256).optional(),
    rawPayload: JsonPayloadSchema.nullable().optional(),
    side: FlashTradeSideSchema,
    signature: SignatureSchema,
    targetAsset: FlashAssetSchema,
    ...FlashOptionalOrderFields
  })
  .refine(
    ({ chainId, contraAsset, quote, targetAsset }) =>
      contraAsset.chainId === chainId &&
      targetAsset.chainId === chainId &&
      quote.contraAsset.chainId === chainId &&
      quote.targetAsset.chainId === chainId,
    'Flash order assets must match the requested chain'
  )
  .refine(({ quote, quoteId }) => Boolean(quoteId || quote.id), 'Flash order requires a quote ID')

export type FlashSubmitOrder = z.infer<typeof FlashSubmitOrderSchema>

export const AccountSelectCommandSchema = z.strictObject({
  type: z.literal('account.select'),
  accountId: z.string().min(1).max(256)
})

export type AccountSelectCommand = z.infer<typeof AccountSelectCommandSchema>

export const AccountSelectResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(['invalid_command', 'unauthorized', 'account_not_found', 'operation_failed'])
  })
])

export type AccountSelectResult = z.infer<typeof AccountSelectResultSchema>

export const TransactionSubmitCommandSchema = z.strictObject({
  type: z.literal('transaction.submit'),
  idempotencyKey: IdempotencyKeySchema,
  chainId: ChainIdSchema,
  transaction: z.strictObject({
    to: AddressSchema,
    data: HexDataSchema.optional(),
    value: HexQuantitySchema.optional()
  })
})

export type TransactionSubmitCommand = z.infer<typeof TransactionSubmitCommandSchema>

export const TransactionSubmitResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(['invalid_command', 'unauthorized', 'no_current_account', 'provider_error']),
    message: ErrorMessageSchema
  })
])

export type TransactionSubmitResult = z.infer<typeof TransactionSubmitResultSchema>

export const TypedDataSignCommandSchema = z.strictObject({
  type: z.literal('typedData.signV4'),
  chainId: ChainIdSchema,
  typedData: TypedDataV4Schema
})

export type TypedDataSignCommand = z.infer<typeof TypedDataSignCommandSchema>

export const TypedDataSignResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), signature: SignatureSchema }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum([
      'invalid_command',
      'unauthorized',
      'no_current_account',
      'chain_mismatch',
      'provider_error'
    ]),
    message: ErrorMessageSchema
  })
])

export type TypedDataSignResult = z.infer<typeof TypedDataSignResultSchema>

export const FlashSubmitCommandSchema = z.strictObject({
  type: z.literal('flash.submit'),
  order: FlashSubmitOrderSchema
})

export type FlashSubmitCommand = z.infer<typeof FlashSubmitCommandSchema>

export const FlashSubmitResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), orderId: z.string().min(1).max(256) }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(['invalid_command', 'unauthorized', 'no_current_account', 'submit_failed']),
    message: ErrorMessageSchema
  })
])

export type FlashSubmitResult = z.infer<typeof FlashSubmitResultSchema>

export const DappCloseCommandSchema = z.strictObject({ type: z.literal('dapp.close') })
export type DappCloseCommand = z.infer<typeof DappCloseCommandSchema>

export const DappContextMenuCommandSchema = z.strictObject({
  type: z.literal('dapp.context-menu'),
  x: z.number().finite().nonnegative().max(100_000),
  y: z.number().finite().nonnegative().max(100_000)
})
export type DappContextMenuCommand = z.infer<typeof DappContextMenuCommandSchema>

export const DappWindowResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(['invalid_command', 'unauthorized', 'operation_failed'])
  })
])

export type DappWindowResult = z.infer<typeof DappWindowResultSchema>

export const NameResolveQuerySchema = z.strictObject({
  type: z.literal('name.resolve'),
  name: z.string().trim().min(1).max(255)
})

export type NameResolveQuery = z.infer<typeof NameResolveQuerySchema>

export const NameResolveResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(['invalid_query', 'unauthorized', 'not_found', 'resolution_failed'])
  })
])

export type NameResolveResult = z.infer<typeof NameResolveResultSchema>

export const FlashQuoteQuerySchema = z.strictObject({
  type: z.literal('flash.quote'),
  request: FlashQuoteRequestSchema
})

export type FlashQuoteQuery = z.infer<typeof FlashQuoteQuerySchema>

export const FlashQuoteResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), quote: FlashQuoteSchema, flash: JsonPayloadSchema }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(['invalid_query', 'unauthorized', 'no_current_account', 'quote_failed']),
    message: ErrorMessageSchema
  })
])

export type FlashQuoteResult = z.infer<typeof FlashQuoteResultSchema>

const OperationIdSchema = z.string().min(1).max(256)
const DashNavigationDataSchema = z
  .record(z.string().max(128), z.json())
  .refine(
    (value) => Object.keys(value).length <= 64 && JSON.stringify(value).length <= 1_000_000,
    'Navigation data is too large'
  )
const DashViewSchema = z.enum(['dapps', 'expandedSigner', 'notify', 'tokens'])

export const CommandBoundaryFailureSchema = z.strictObject({
  ok: z.literal(false),
  error: z.enum(['invalid_command', 'unauthorized']),
  message: ErrorMessageSchema.optional()
})
export type CommandBoundaryFailure = z.infer<typeof CommandBoundaryFailureSchema>

export const QueryBoundaryFailureSchema = z.strictObject({
  ok: z.literal(false),
  error: z.enum(['invalid_query', 'unauthorized']),
  message: ErrorMessageSchema.optional()
})
export type QueryBoundaryFailure = z.infer<typeof QueryBoundaryFailureSchema>

export const WalletCommandResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(['invalid_command', 'unauthorized', 'not_found', 'request_not_found', 'operation_failed']),
    message: ErrorMessageSchema.optional()
  })
])
export type WalletCommandResult = z.infer<typeof WalletCommandResultSchema>

export const DashNavigateCommandSchema = z.strictObject({
  type: z.literal('dash.navigate'),
  view: DashViewSchema,
  data: DashNavigationDataSchema.default({})
})
export type DashNavigateCommand = z.infer<typeof DashNavigateCommandSchema>

export const WalletNavigateHomeCommandSchema = z.strictObject({
  type: z.literal('wallet.navigate-home'),
  view: z.enum(['accounts', 'networks'])
})
export type WalletNavigateHomeCommand = z.infer<typeof WalletNavigateHomeCommandSchema>

export const DashBackCommandSchema = z.strictObject({
  type: z.literal('dash.back'),
  steps: z.number().int().min(1).max(100).default(1)
})
export type DashBackCommand = z.infer<typeof DashBackCommandSchema>

export const DashCloseCommandSchema = z.strictObject({ type: z.literal('dash.close') })
export type DashCloseCommand = z.infer<typeof DashCloseCommandSchema>

export const DashContextMenuCommandSchema = z.strictObject({
  type: z.literal('dash.context-menu'),
  x: z.number().finite().nonnegative().max(100_000),
  y: z.number().finite().nonnegative().max(100_000)
})
export type DashContextMenuCommand = z.infer<typeof DashContextMenuCommandSchema>

export const ClipboardWriteCommandSchema = z.strictObject({
  type: z.literal('clipboard.write'),
  text: z.string().min(1).max(100_000)
})
export type ClipboardWriteCommand = z.infer<typeof ClipboardWriteCommandSchema>

export const ExternalOpenCommandSchema = z.strictObject({
  type: z.literal('external.open'),
  url: z.url({ protocol: /^https:$/ }).max(4_096)
})
export type ExternalOpenCommand = z.infer<typeof ExternalOpenCommandSchema>

export const ExplorerOpenCommandSchema = z.strictObject({
  type: z.literal('explorer.open'),
  chainId: ChainIdSchema,
  transactionHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .optional()
})
export type ExplorerOpenCommand = z.infer<typeof ExplorerOpenCommandSchema>

export const TokenSchema = z.strictObject({
  address: AddressSchema,
  chainId: ChainIdSchema,
  decimals: z.number().int().min(0).max(255),
  logoURI: z.string().max(4_096).default(''),
  name: z.string().trim().min(1).max(128),
  symbol: z.string().trim().min(1).max(32)
})
export type WalletToken = z.infer<typeof TokenSchema>

export const TokenAddCommandSchema = z.strictObject({
  type: z.literal('token.add'),
  token: TokenSchema,
  requestId: OperationIdSchema.optional(),
  completion: z.enum(['dismiss-notification', 'return-to-tokens', 'none']).default('none'),
  edit: z.boolean().default(false)
})
export type TokenAddCommand = z.infer<typeof TokenAddCommandSchema>

export const TokenRemoveCommandSchema = z.strictObject({
  type: z.literal('token.remove'),
  address: AddressSchema,
  chainId: ChainIdSchema
})
export type TokenRemoveCommand = z.infer<typeof TokenRemoveCommandSchema>

export const OriginSwitchChainCommandSchema = z.strictObject({
  type: z.literal('origin.switch-chain'),
  originId: OperationIdSchema,
  chainId: ChainIdSchema
})
export type OriginSwitchChainCommand = z.infer<typeof OriginSwitchChainCommandSchema>

export const OriginRemoveCommandSchema = z.strictObject({
  type: z.literal('origin.remove'),
  originId: OperationIdSchema
})
export type OriginRemoveCommand = z.infer<typeof OriginRemoveCommandSchema>

export const OriginClearCommandSchema = z.strictObject({ type: z.literal('origin.clear') })
export type OriginClearCommand = z.infer<typeof OriginClearCommandSchema>

export const WarningToggleCommandSchema = z.strictObject({
  type: z.literal('warning.toggle'),
  warning: z.enum(['explorer', 'gas-fee', 'signer-compatibility'])
})
export type WarningToggleCommand = z.infer<typeof WarningToggleCommandSchema>

export const RequestApproveCommandSchema = z.strictObject({
  type: z.literal('request.approve'),
  requestId: OperationIdSchema
})
export type RequestApproveCommand = z.infer<typeof RequestApproveCommandSchema>

export const NetworkRemoveCommandSchema = z.strictObject({
  type: z.literal('network.remove'),
  chainId: ChainIdSchema
})
export type NetworkRemoveCommand = z.infer<typeof NetworkRemoveCommandSchema>

export const TrezorInputCommandSchema = z.discriminatedUnion('input', [
  z.strictObject({
    type: z.literal('signer.trezor-input'),
    signerId: OperationIdSchema,
    input: z.literal('pin'),
    value: z.string().regex(/^[1-9]{1,9}$/)
  }),
  z.strictObject({
    type: z.literal('signer.trezor-input'),
    signerId: OperationIdSchema,
    input: z.literal('passphrase'),
    value: z.string().max(256)
  }),
  z.strictObject({
    type: z.literal('signer.trezor-input'),
    signerId: OperationIdSchema,
    input: z.literal('device-passphrase')
  })
])
export type TrezorInputCommand = z.infer<typeof TrezorInputCommandSchema>

export const LatticePairCommandSchema = z.strictObject({
  type: z.literal('signer.lattice-pair'),
  signerId: OperationIdSchema,
  pairCode: z.string().trim().min(1).max(64)
})
export type LatticePairCommand = z.infer<typeof LatticePairCommandSchema>

export const SignerAccountAddCommandSchema = z.strictObject({
  type: z.literal('signer.account-add'),
  signerId: OperationIdSchema,
  address: AddressSchema
})
export type SignerAccountAddCommand = z.infer<typeof SignerAccountAddCommandSchema>

export const AccountRemoveCommandSchema = z.strictObject({
  type: z.literal('account.remove'),
  address: AddressSchema,
  removeSeedSigner: z.boolean().optional()
})
export type AccountRemoveCommand = z.infer<typeof AccountRemoveCommandSchema>

export const SignerRemoveCommandSchema = z.strictObject({
  type: z.literal('signer.remove'),
  signerId: OperationIdSchema
})
export type SignerRemoveCommand = z.infer<typeof SignerRemoveCommandSchema>

export const SignerReloadCommandSchema = z.strictObject({
  type: z.literal('signer.reload'),
  signerId: OperationIdSchema
})
export type SignerReloadCommand = z.infer<typeof SignerReloadCommandSchema>

export const TokenLookupQuerySchema = z.strictObject({
  type: z.literal('token.lookup'),
  address: AddressSchema,
  chainId: ChainIdSchema
})
export type TokenLookupQuery = z.infer<typeof TokenLookupQuerySchema>

export const TokenLookupResultSchema = z.discriminatedUnion('ok', [
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
export type TokenLookupResult = z.infer<typeof TokenLookupResultSchema>

const BoundedPasswordSchema = z.string().max(1_024)
const BoundedNameSchema = z.string().trim().max(128)
const HttpUrlSchema = z.url({ protocol: /^https?:$/ }).max(4_096)
const KeystoreSchema = z
  .looseObject({ version: z.union([z.literal(1), z.literal(3)]) })
  .refine((value) => JSON.stringify(value).length <= 1_000_000, 'Keystore is too large')

export const HomeCommandConsumeCommandSchema = z.strictObject({
  type: z.literal('home.command-consume'),
  commandId: z.number().int().positive()
})
export type HomeCommandConsumeCommand = z.infer<typeof HomeCommandConsumeCommandSchema>

export const SecurityStatusQuerySchema = z.strictObject({ type: z.literal('security.status') })
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

export const SecurityStatusResultSchema = z.discriminatedUnion('ok', [
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

export const SecurityConfigureCommandSchema = z.discriminatedUnion('mode', [
  z.strictObject({ type: z.literal('security.configure'), mode: z.literal('disabled') }),
  z.strictObject({ type: z.literal('security.configure'), mode: z.literal('native') }),
  z.strictObject({
    type: z.literal('security.configure'),
    mode: z.literal('webauthn'),
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
])
export type SecurityConfigureCommand = z.infer<typeof SecurityConfigureCommandSchema>

export const WalletLockCommandSchema = z.strictObject({ type: z.literal('wallet.lock') })
export type WalletLockCommand = z.infer<typeof WalletLockCommandSchema>

export const NetworkPrimaryRpcSetCommandSchema = z.strictObject({
  type: z.literal('network.primary-rpc-set'),
  chainId: ChainIdSchema,
  url: HttpUrlSchema
})
export type NetworkPrimaryRpcSetCommand = z.infer<typeof NetworkPrimaryRpcSetCommandSchema>

export const NetworkActivationSetCommandSchema = z.strictObject({
  type: z.literal('network.activation-set'),
  chainId: ChainIdSchema,
  enabled: z.boolean()
})
export type NetworkActivationSetCommand = z.infer<typeof NetworkActivationSetCommandSchema>

export const NetworkIconHydrateCommandSchema = z.strictObject({
  type: z.literal('network.icon-hydrate'),
  chainId: ChainIdSchema
})
export type NetworkIconHydrateCommand = z.infer<typeof NetworkIconHydrateCommandSchema>

export const DappOpenCommandSchema = z.strictObject({
  type: z.literal('dapp.open'),
  feature: z.enum(['send', 'trade']),
  assetId: z.string().max(256).optional(),
  chainId: ChainIdSchema.optional()
})
export type DappOpenCommand = z.infer<typeof DappOpenCommandSchema>

export const FlashOrderCancelCommandSchema = z.strictObject({
  type: z.literal('flash.order-cancel'),
  orderId: OperationIdSchema
})
export type FlashOrderCancelCommand = z.infer<typeof FlashOrderCancelCommandSchema>

export const AccountReorderCommandSchema = z.strictObject({
  type: z.literal('account.reorder'),
  fromAccountId: AddressSchema,
  toAccountId: AddressSchema
})
export type AccountReorderCommand = z.infer<typeof AccountReorderCommandSchema>

export const AccountRenameCommandSchema = z.strictObject({
  type: z.literal('account.rename'),
  accountId: AddressSchema,
  name: BoundedNameSchema.min(1)
})
export type AccountRenameCommand = z.infer<typeof AccountRenameCommandSchema>

export const AccountPrivateKeyExportQuerySchema = z.strictObject({
  type: z.literal('account.private-key-export'),
  accountId: AddressSchema,
  password: BoundedPasswordSchema.min(1)
})
export type AccountPrivateKeyExportQuery = z.infer<typeof AccountPrivateKeyExportQuerySchema>

export const AccountPrivateKeyExportResultSchema = z.discriminatedUnion('ok', [
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
export type AccountPrivateKeyExportResult = z.infer<typeof AccountPrivateKeyExportResultSchema>

export const AccountAddFromSignerCommandSchema = z.strictObject({
  type: z.literal('account.add-from-signer'),
  signerId: OperationIdSchema,
  address: AddressSchema,
  name: BoundedNameSchema.optional()
})
export type AccountAddFromSignerCommand = z.infer<typeof AccountAddFromSignerCommandSchema>

export const AccountWatchAddCommandSchema = z.strictObject({
  type: z.literal('account.watch-add'),
  addressOrName: z.string().trim().min(1).max(255),
  name: BoundedNameSchema.optional()
})
export type AccountWatchAddCommand = z.infer<typeof AccountWatchAddCommandSchema>

export const KeystoreLocateCommandSchema = z.strictObject({ type: z.literal('keystore.locate') })
export type KeystoreLocateCommand = z.infer<typeof KeystoreLocateCommandSchema>

export const KeystoreLocateResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), keystore: KeystoreSchema }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(['invalid_command', 'unauthorized', 'not_found', 'invalid_keystore', 'operation_failed']),
    message: ErrorMessageSchema
  })
])
export type KeystoreLocateResult = z.infer<typeof KeystoreLocateResultSchema>

export const SignerImportCommandSchema = z.discriminatedUnion('source', [
  z.strictObject({
    type: z.literal('signer.import'),
    source: z.literal('phrase'),
    phrase: z.string().trim().min(1).max(2_048),
    framePassword: BoundedPasswordSchema,
    accountName: BoundedNameSchema.optional()
  }),
  z.strictObject({
    type: z.literal('signer.import'),
    source: z.literal('private-key'),
    privateKey: z.string().regex(/^(?:0x)?[0-9a-fA-F]{64}$/),
    framePassword: BoundedPasswordSchema,
    accountName: BoundedNameSchema.optional()
  }),
  z.strictObject({
    type: z.literal('signer.import'),
    source: z.literal('keystore'),
    keystore: KeystoreSchema,
    keystorePassword: BoundedPasswordSchema.min(1),
    framePassword: BoundedPasswordSchema,
    accountName: BoundedNameSchema.optional()
  })
])
export type SignerImportCommand = z.infer<typeof SignerImportCommandSchema>

export const AccountCreatedResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), accountId: AddressSchema }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(['invalid_command', 'unauthorized', 'not_found', 'operation_failed']),
    message: ErrorMessageSchema
  })
])
export type AccountCreatedResult = z.infer<typeof AccountCreatedResultSchema>

export const SignerLatticeCreateCommandSchema = z.strictObject({
  type: z.literal('signer.lattice-create'),
  deviceId: z.string().trim().min(1).max(128),
  deviceName: z.string().trim().min(1).max(128)
})
export type SignerLatticeCreateCommand = z.infer<typeof SignerLatticeCreateCommandSchema>

export const SignerCreatedResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), signerId: OperationIdSchema }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(['invalid_command', 'unauthorized', 'operation_failed']),
    message: ErrorMessageSchema
  })
])
export type SignerCreatedResult = z.infer<typeof SignerCreatedResultSchema>

export const SignerDisconnectCommandSchema = z.strictObject({
  type: z.literal('signer.disconnect'),
  signerId: OperationIdSchema
})
export type SignerDisconnectCommand = z.infer<typeof SignerDisconnectCommandSchema>

export const PortfolioRefreshCommandSchema = z.strictObject({ type: z.literal('portfolio.refresh') })
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

export const SettingsUpdateCommandSchema = z.discriminatedUnion('setting', [
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

export const WalletResetCommandSchema = z.strictObject({
  type: z.literal('wallet.reset'),
  scope: z.enum(['saved-data', 'all-settings-data'])
})
export type WalletResetCommand = z.infer<typeof WalletResetCommandSchema>

export const AppQuitCommandSchema = z.strictObject({ type: z.literal('app.quit') })
export type AppQuitCommand = z.infer<typeof AppQuitCommandSchema>

export const PermissionClearCommandSchema = z.strictObject({
  type: z.literal('permission.clear'),
  accountId: AddressSchema,
  originId: OperationIdSchema.optional()
})
export type PermissionClearCommand = z.infer<typeof PermissionClearCommandSchema>

export const NetworkRequestResolveCommandSchema = z
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

export const NotificationUpdateCommandSchema = z.strictObject({
  type: z.literal('notification.update'),
  notificationId: OperationIdSchema,
  action: z.enum(['dismiss', 'expire'])
})
export type NotificationUpdateCommand = z.infer<typeof NotificationUpdateCommandSchema>

export const SeedGenerateQuerySchema = z.strictObject({ type: z.literal('seed.generate') })
export type SeedGenerateQuery = z.infer<typeof SeedGenerateQuerySchema>

export const SeedGenerateResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), phrase: z.string().trim().min(1).max(2_048) }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(['invalid_query', 'unauthorized', 'operation_failed']),
    message: ErrorMessageSchema
  })
])
export type SeedGenerateResult = z.infer<typeof SeedGenerateResultSchema>

export const SecurityUnlockCommandSchema = z.discriminatedUnion('method', [
  z.strictObject({
    type: z.literal('security.unlock'),
    method: z.literal('password'),
    password: BoundedPasswordSchema.min(1)
  }),
  z.strictObject({ type: z.literal('security.unlock'), method: z.literal('native') }),
  z.strictObject({
    type: z.literal('security.unlock'),
    method: z.literal('webauthn'),
    secret: z
      .string()
      .regex(/^[0-9a-fA-F]+$/)
      .min(32)
      .max(512)
  })
])
export type SecurityUnlockCommand = z.infer<typeof SecurityUnlockCommandSchema>

export const RequestRejectCommandSchema = z.strictObject({
  type: z.literal('request.reject'),
  requestId: OperationIdSchema
})
export type RequestRejectCommand = z.infer<typeof RequestRejectCommandSchema>

export const AccessRequestResolveCommandSchema = z.strictObject({
  type: z.literal('request.access-resolve'),
  requestId: OperationIdSchema,
  approved: z.boolean()
})
export type AccessRequestResolveCommand = z.infer<typeof AccessRequestResolveCommandSchema>

export const SwitchChainRequestResolveCommandSchema = z.strictObject({
  type: z.literal('request.switch-chain-resolve'),
  requestId: OperationIdSchema,
  approved: z.boolean()
})
export type SwitchChainRequestResolveCommand = z.infer<typeof SwitchChainRequestResolveCommandSchema>

export const RequestClearOriginCommandSchema = z.strictObject({
  type: z.literal('request.clear-origin'),
  accountId: AddressSchema,
  originId: OperationIdSchema
})
export type RequestClearOriginCommand = z.infer<typeof RequestClearOriginCommandSchema>

export const RequestSignerRecoveryOpenCommandSchema = z.strictObject({
  type: z.literal('request.signer-recovery-open'),
  requestId: OperationIdSchema
})
export type RequestSignerRecoveryOpenCommand = z.infer<typeof RequestSignerRecoveryOpenCommandSchema>

export const SignerCompatibilityQuerySchema = z.strictObject({
  type: z.literal('request.signer-compatibility'),
  requestId: OperationIdSchema
})
export type SignerCompatibilityQuery = z.infer<typeof SignerCompatibilityQuerySchema>

const SignerCompatibilitySchema = z.strictObject({
  signer: z.string().min(1).max(64),
  tx: z.string().max(64),
  compatible: z.boolean()
})

export const SignerCompatibilityResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), compatibility: SignerCompatibilitySchema }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum([
      'invalid_query',
      'unauthorized',
      'request_not_found',
      'no_signer',
      'locked',
      'signer_unavailable',
      'operation_failed'
    ]),
    message: ErrorMessageSchema
  })
])
export type SignerCompatibilityResult = z.infer<typeof SignerCompatibilityResultSchema>

export const RequestApprovalConfirmCommandSchema = z.strictObject({
  type: z.literal('request.approval-confirm'),
  requestId: OperationIdSchema,
  approvalType: z.enum(['approveOtherChain', 'approveGasLimit'])
})
export type RequestApprovalConfirmCommand = z.infer<typeof RequestApprovalConfirmCommandSchema>

const TokenApprovalAmountSchema = z
  .string()
  .max(78)
  .regex(/^(?:0x[0-9a-fA-F]{1,64}|[0-9]{1,78})$/)

export const RequestTokenApprovalUpdateCommandSchema = z.discriminatedUnion('requestKind', [
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

export const TransactionFeeUpdateCommandSchema = z.strictObject({
  type: z.literal('transaction.fee-update'),
  requestId: OperationIdSchema,
  field: z.enum(['baseFee', 'priorityFee', 'gasPrice', 'gasLimit']),
  value: HexQuantitySchema
})
export type TransactionFeeUpdateCommand = z.infer<typeof TransactionFeeUpdateCommandSchema>

export const TransactionFeeDefaultSetCommandSchema = z.strictObject({
  type: z.literal('transaction.fee-default-set'),
  requestId: OperationIdSchema,
  level: z.enum(['asap', 'fast', 'standard', 'slow'])
})
export type TransactionFeeDefaultSetCommand = z.infer<typeof TransactionFeeDefaultSetCommandSchema>

export const TransactionNonceAdjustCommandSchema = z.strictObject({
  type: z.literal('transaction.nonce-adjust'),
  requestId: OperationIdSchema,
  direction: z.union([z.literal(-1), z.literal(1)])
})
export type TransactionNonceAdjustCommand = z.infer<typeof TransactionNonceAdjustCommandSchema>

export const TransactionNonceResetCommandSchema = z.strictObject({
  type: z.literal('transaction.nonce-reset'),
  requestId: OperationIdSchema
})
export type TransactionNonceResetCommand = z.infer<typeof TransactionNonceResetCommandSchema>

export const TransactionFeeNoticeDismissCommandSchema = z.strictObject({
  type: z.literal('transaction.fee-notice-dismiss'),
  requestId: OperationIdSchema
})
export type TransactionFeeNoticeDismissCommand = z.infer<typeof TransactionFeeNoticeDismissCommandSchema>

export const TransactionReplaceCommandSchema = z.strictObject({
  type: z.literal('transaction.replace'),
  requestId: OperationIdSchema,
  replacement: z.enum(['cancel', 'speed']),
  idempotencyKey: IdempotencyKeySchema
})
export type TransactionReplaceCommand = z.infer<typeof TransactionReplaceCommandSchema>

export const PanelRequestOpenCommandSchema = z.strictObject({
  type: z.literal('panel.request-open'),
  requestId: OperationIdSchema
})
export type PanelRequestOpenCommand = z.infer<typeof PanelRequestOpenCommandSchema>

export const PanelBackCommandSchema = z.strictObject({
  type: z.literal('panel.back'),
  steps: z.number().int().min(1).max(10).default(1)
})
export type PanelBackCommand = z.infer<typeof PanelBackCommandSchema>

export const AddTokenReviewCommandSchema = z.strictObject({
  type: z.literal('request.add-token-review'),
  requestId: OperationIdSchema
})
export type AddTokenReviewCommand = z.infer<typeof AddTokenReviewCommandSchema>

export const AddChainReviewCommandSchema = z.strictObject({
  type: z.literal('request.add-chain-review'),
  requestId: OperationIdSchema
})
export type AddChainReviewCommand = z.infer<typeof AddChainReviewCommandSchema>

export const ExtensionRespondCommandSchema = z.strictObject({
  type: z.literal('extension.respond'),
  extensionId: z.string().trim().min(1).max(4_096),
  approved: z.boolean()
})
export type ExtensionRespondCommand = z.infer<typeof ExtensionRespondCommandSchema>

export const UpdaterRespondCommandSchema = z.strictObject({
  type: z.literal('updater.respond'),
  action: z.enum(['restart', 'install', 'later', 'skip', 'dismiss-ready'])
})
export type UpdaterRespondCommand = z.infer<typeof UpdaterRespondCommandSchema>

export const TrayMouseoutCommandSchema = z.strictObject({ type: z.literal('tray.mouseout') })
export type TrayMouseoutCommand = z.infer<typeof TrayMouseoutCommandSchema>

export const TrayContextMenuCommandSchema = z.strictObject({
  type: z.literal('tray.context-menu'),
  x: z.number().finite().nonnegative().max(100_000),
  y: z.number().finite().nonnegative().max(100_000)
})
export type TrayContextMenuCommand = z.infer<typeof TrayContextMenuCommandSchema>

export interface CommandMap {
  'account.add-from-signer': AccountAddFromSignerCommand
  'account.select': AccountSelectCommand
  'account.remove': AccountRemoveCommand
  'account.rename': AccountRenameCommand
  'account.reorder': AccountReorderCommand
  'account.watch-add': AccountWatchAddCommand
  'app.quit': AppQuitCommand
  'clipboard.write': ClipboardWriteCommand
  'dash.back': DashBackCommand
  'dash.close': DashCloseCommand
  'dash.context-menu': DashContextMenuCommand
  'dash.navigate': DashNavigateCommand
  'dapp.open': DappOpenCommand
  'dapp.close': DappCloseCommand
  'dapp.context-menu': DappContextMenuCommand
  'explorer.open': ExplorerOpenCommand
  'external.open': ExternalOpenCommand
  'extension.respond': ExtensionRespondCommand
  'flash.submit': FlashSubmitCommand
  'flash.order-cancel': FlashOrderCancelCommand
  'home.command-consume': HomeCommandConsumeCommand
  'keystore.locate': KeystoreLocateCommand
  'network.activation-set': NetworkActivationSetCommand
  'network.icon-hydrate': NetworkIconHydrateCommand
  'network.primary-rpc-set': NetworkPrimaryRpcSetCommand
  'network.remove': NetworkRemoveCommand
  'network.request-resolve': NetworkRequestResolveCommand
  'notification.update': NotificationUpdateCommand
  'origin.clear': OriginClearCommand
  'origin.remove': OriginRemoveCommand
  'origin.switch-chain': OriginSwitchChainCommand
  'panel.back': PanelBackCommand
  'panel.request-open': PanelRequestOpenCommand
  'permission.clear': PermissionClearCommand
  'portfolio.refresh': PortfolioRefreshCommand
  'request.approve': RequestApproveCommand
  'request.access-resolve': AccessRequestResolveCommand
  'request.add-chain-review': AddChainReviewCommand
  'request.add-token-review': AddTokenReviewCommand
  'request.approval-confirm': RequestApprovalConfirmCommand
  'request.clear-origin': RequestClearOriginCommand
  'request.reject': RequestRejectCommand
  'request.signer-recovery-open': RequestSignerRecoveryOpenCommand
  'request.switch-chain-resolve': SwitchChainRequestResolveCommand
  'request.token-approval-update': RequestTokenApprovalUpdateCommand
  'security.configure': SecurityConfigureCommand
  'security.unlock': SecurityUnlockCommand
  'settings.update': SettingsUpdateCommand
  'signer.account-add': SignerAccountAddCommand
  'signer.disconnect': SignerDisconnectCommand
  'signer.import': SignerImportCommand
  'signer.lattice-pair': LatticePairCommand
  'signer.lattice-create': SignerLatticeCreateCommand
  'signer.reload': SignerReloadCommand
  'signer.remove': SignerRemoveCommand
  'signer.trezor-input': TrezorInputCommand
  'token.add': TokenAddCommand
  'token.remove': TokenRemoveCommand
  'transaction.fee-default-set': TransactionFeeDefaultSetCommand
  'transaction.fee-notice-dismiss': TransactionFeeNoticeDismissCommand
  'transaction.fee-update': TransactionFeeUpdateCommand
  'transaction.nonce-adjust': TransactionNonceAdjustCommand
  'transaction.nonce-reset': TransactionNonceResetCommand
  'transaction.replace': TransactionReplaceCommand
  'transaction.submit': TransactionSubmitCommand
  'tray.context-menu': TrayContextMenuCommand
  'tray.mouseout': TrayMouseoutCommand
  'typedData.signV4': TypedDataSignCommand
  'wallet.navigate-home': WalletNavigateHomeCommand
  'wallet.lock': WalletLockCommand
  'wallet.reset': WalletResetCommand
  'updater.respond': UpdaterRespondCommand
  'warning.toggle': WarningToggleCommand
}

export interface CommandResultMap {
  'account.add-from-signer': AccountCreatedResult
  'account.select': AccountSelectResult
  'account.remove': WalletCommandResult
  'account.rename': WalletCommandResult
  'account.reorder': WalletCommandResult
  'account.watch-add': AccountCreatedResult
  'app.quit': WalletCommandResult
  'clipboard.write': WalletCommandResult
  'dash.back': WalletCommandResult
  'dash.close': WalletCommandResult
  'dash.context-menu': WalletCommandResult
  'dash.navigate': WalletCommandResult
  'dapp.open': WalletCommandResult
  'dapp.close': DappWindowResult
  'dapp.context-menu': DappWindowResult
  'explorer.open': WalletCommandResult
  'external.open': WalletCommandResult
  'extension.respond': WalletCommandResult
  'flash.submit': FlashSubmitResult
  'flash.order-cancel': WalletCommandResult
  'home.command-consume': WalletCommandResult
  'keystore.locate': KeystoreLocateResult
  'network.activation-set': WalletCommandResult
  'network.icon-hydrate': WalletCommandResult
  'network.primary-rpc-set': WalletCommandResult
  'network.remove': WalletCommandResult
  'network.request-resolve': WalletCommandResult
  'notification.update': WalletCommandResult
  'origin.clear': WalletCommandResult
  'origin.remove': WalletCommandResult
  'origin.switch-chain': WalletCommandResult
  'panel.back': WalletCommandResult
  'panel.request-open': WalletCommandResult
  'permission.clear': WalletCommandResult
  'portfolio.refresh': WalletCommandResult
  'request.approve': WalletCommandResult
  'request.access-resolve': WalletCommandResult
  'request.add-chain-review': WalletCommandResult
  'request.add-token-review': WalletCommandResult
  'request.approval-confirm': WalletCommandResult
  'request.clear-origin': WalletCommandResult
  'request.reject': WalletCommandResult
  'request.signer-recovery-open': WalletCommandResult
  'request.switch-chain-resolve': WalletCommandResult
  'request.token-approval-update': WalletCommandResult
  'security.configure': WalletCommandResult
  'security.unlock': WalletCommandResult
  'settings.update': WalletCommandResult
  'signer.account-add': WalletCommandResult
  'signer.disconnect': WalletCommandResult
  'signer.import': AccountCreatedResult
  'signer.lattice-pair': WalletCommandResult
  'signer.lattice-create': SignerCreatedResult
  'signer.reload': WalletCommandResult
  'signer.remove': WalletCommandResult
  'signer.trezor-input': WalletCommandResult
  'token.add': WalletCommandResult
  'token.remove': WalletCommandResult
  'transaction.fee-default-set': WalletCommandResult
  'transaction.fee-notice-dismiss': WalletCommandResult
  'transaction.fee-update': WalletCommandResult
  'transaction.nonce-adjust': WalletCommandResult
  'transaction.nonce-reset': WalletCommandResult
  'transaction.replace': WalletCommandResult
  'transaction.submit': TransactionSubmitResult
  'tray.context-menu': WalletCommandResult
  'tray.mouseout': WalletCommandResult
  'typedData.signV4': TypedDataSignResult
  'wallet.navigate-home': WalletCommandResult
  'wallet.lock': WalletCommandResult
  'wallet.reset': WalletCommandResult
  'updater.respond': WalletCommandResult
  'warning.toggle': WalletCommandResult
}

export interface QueryMap {
  'account.private-key-export': AccountPrivateKeyExportQuery
  'flash.quote': FlashQuoteQuery
  'name.resolve': NameResolveQuery
  'request.signer-compatibility': SignerCompatibilityQuery
  'security.status': SecurityStatusQuery
  'seed.generate': SeedGenerateQuery
  'token.lookup': TokenLookupQuery
}

export interface QueryResultMap {
  'account.private-key-export': AccountPrivateKeyExportResult
  'flash.quote': FlashQuoteResult
  'name.resolve': NameResolveResult
  'request.signer-compatibility': SignerCompatibilityResult
  'security.status': SecurityStatusResult
  'seed.generate': SeedGenerateResult
  'token.lookup': TokenLookupResult
}

export type AppCommand = CommandMap[keyof CommandMap]
export type AppQuery = QueryMap[keyof QueryMap]
export type ResultForCommand<TCommand extends AppCommand> =
  | CommandResultMap[TCommand['type']]
  | CommandBoundaryFailure
export type ResultForQuery<TQuery extends AppQuery> = QueryResultMap[TQuery['type']] | QueryBoundaryFailure
