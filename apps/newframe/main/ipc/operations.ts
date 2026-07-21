import { ipcMain } from 'electron'
import log from 'electron-log'
import { z } from 'zod'

import accounts from '../accounts'
import { requestTokenImage } from '../images'
import {
  quoteFlashForCurrentAccount,
  signCurrentAccountTypedData,
  submitCurrentAccountTransaction,
  submitFlashForCurrentAccount
} from '../operations/sideTrayTransactions'
import { closeOwnSideTray, inspectOwnSideTray } from '../operations/sideTrayWorkflows'
import { resolveName, selectAccount } from '../operations/workflows'
import * as walletWorkflows from '../operations/walletWorkflows'
import {
  authorizeRenderer,
  type AuthorizationContext,
  type RendererEntrypoint,
  type RendererRole
} from './authorization'
import { createRendererPrincipal } from '../authority'
import {
  AccountSelectCommandSchema,
  AccountSelectResultSchema,
  AccountAddFromSignerCommandSchema,
  AccountCreatedResultSchema,
  AccountPrivateKeyExportQuerySchema,
  AccountPrivateKeyExportResultSchema,
  AccountRenameCommandSchema,
  AccountRemoveCommandSchema,
  AccountReorderCommandSchema,
  AccountWatchAddCommandSchema,
  AccessRequestResolveCommandSchema,
  AddChainReviewCommandSchema,
  AddTokenReviewCommandSchema,
  AppQuitCommandSchema,
  CommandBoundaryFailureSchema,
  ClipboardWriteCommandSchema,
  SideTrayCloseCommandSchema,
  SideTrayContextMenuCommandSchema,
  SideTrayOpenCommandSchema,
  SideTrayResultSchema,
  FlashQuoteQuerySchema,
  FlashQuoteResultSchema,
  FlashOrderCancelCommandSchema,
  FlashSubmitCommandSchema,
  FlashSubmitResultSchema,
  ExplorerOpenCommandSchema,
  ExternalOpenCommandSchema,
  ExtensionRespondCommandSchema,
  LatticePairCommandSchema,
  HomeCommandConsumeCommandSchema,
  KeystoreLocateCommandSchema,
  KeystoreLocateResultSchema,
  NameResolveQuerySchema,
  NameResolveResultSchema,
  NetworkRemoveCommandSchema,
  NetworkActivationSetCommandSchema,
  NetworkPrimaryRpcSetCommandSchema,
  NetworkRequestResolveCommandSchema,
  NotificationUpdateCommandSchema,
  OriginRemoveCommandSchema,
  PanelBackCommandSchema,
  PanelRequestOpenCommandSchema,
  RequestApproveCommandSchema,
  RequestApprovalConfirmCommandSchema,
  RequestClearOriginCommandSchema,
  RequestRejectCommandSchema,
  RequestTokenApprovalUpdateCommandSchema,
  PermissionClearCommandSchema,
  PortfolioRefreshCommandSchema,
  QueryBoundaryFailureSchema,
  SecurityConfigureCommandSchema,
  SecurityUnlockCommandSchema,
  SecurityStatusQuerySchema,
  SecurityStatusResultSchema,
  SeedGenerateQuerySchema,
  SeedGenerateResultSchema,
  SettingsUpdateCommandSchema,
  SignerCreatedResultSchema,
  SignerDisconnectCommandSchema,
  SignerImportCommandSchema,
  SignerLatticeCreateCommandSchema,
  SignerReloadCommandSchema,
  SignerCompatibilityQuerySchema,
  SignerCompatibilityResultSchema,
  SwitchChainRequestResolveCommandSchema,
  TokenAddCommandSchema,
  TokenImageHydrateCommandSchema,
  TokenLookupQuerySchema,
  TokenLookupResultSchema,
  TokenRemoveCommandSchema,
  TransactionSubmitCommandSchema,
  TransactionSubmitResultSchema,
  TransactionFeeDefaultSetCommandSchema,
  TransactionFeeNoticeDismissCommandSchema,
  TransactionFeeUpdateCommandSchema,
  TransactionNonceAdjustCommandSchema,
  TransactionNonceResetCommandSchema,
  TransactionReplaceCommandSchema,
  TrayContextMenuCommandSchema,
  TrayMouseoutCommandSchema,
  TrezorInputCommandSchema,
  TypedDataSignCommandSchema,
  TypedDataSignResultSchema,
  UpdaterRespondCommandSchema,
  WalletCommandResultSchema,
  WalletLockCommandSchema,
  WalletResetCommandSchema,
  WarningToggleCommandSchema,
  type AccountSelectCommand,
  type AccountPrivateKeyExportQuery,
  type SideTrayContextMenuCommand,
  type FlashQuoteQuery,
  type FlashSubmitCommand,
  type CommandMap,
  type NameResolveQuery,
  type SecurityStatusQuery,
  type SignerCompatibilityQuery,
  type SeedGenerateQuery,
  type TokenLookupQuery,
  type QueryMap,
  type TransactionSubmitCommand,
  type TypedDataSignCommand
} from '../../resources/bridge/operations'
import { ExecuteCommandChannel, ExecuteQueryChannel } from '../../resources/bridge/contracts'

type OperationDefinition = {
  schema: z.ZodType<unknown>
  resultSchema: z.ZodType<unknown>
  roles: readonly RendererRole[]
  entrypoints?: readonly RendererEntrypoint[]
  handle(
    input: unknown,
    event: Electron.IpcMainInvokeEvent,
    context: AuthorizationContext
  ): Promise<unknown> | unknown
  failure: unknown
}

function defineWalletCommand<TInput>(
  schema: z.ZodType<TInput>,
  handle: (
    input: TInput,
    event: Electron.IpcMainInvokeEvent,
    context: AuthorizationContext
  ) => Promise<boolean | void> | boolean | void,
  missingError: 'not_found' | 'request_not_found',
  entrypoints: readonly RendererEntrypoint[]
) {
  return defineOperation({
    schema,
    resultSchema: WalletCommandResultSchema,
    roles: ['wallet-ui'],
    entrypoints,
    async handle(input, event, context) {
      try {
        return (await handle(input, event, context)) === false
          ? ({ ok: false, error: missingError } as const)
          : ({ ok: true } as const)
      } catch (error) {
        if (error === IdempotencyConflict) {
          return {
            ok: false,
            error: 'invalid_command',
            message: 'Idempotency key was reused.'
          } as const
        }
        log.error('Failed to execute wallet command', { type: (input as { type?: string }).type, error })
        return {
          ok: false,
          error: 'operation_failed',
          message: error instanceof Error ? error.message.slice(0, 500) : 'Operation failed.'
        } as const
      }
    },
    failure: { ok: false, error: 'operation_failed' }
  })
}

const IdempotencyConflict = Symbol('IdempotencyConflict')
const idempotencyCache = new Map<string, { fingerprint: string; result: Promise<unknown> }>()
const maxIdempotencyEntries = 256

function executeIdempotent<TResult>(
  operationType: string,
  idempotencyKey: string,
  input: unknown,
  execute: () => Promise<TResult> | TResult
): Promise<TResult | typeof IdempotencyConflict> {
  const cacheKey = `${operationType}:${idempotencyKey}`
  const fingerprint = JSON.stringify(input)
  const cached = idempotencyCache.get(cacheKey)

  if (cached) {
    return cached.fingerprint === fingerprint
      ? (cached.result as Promise<TResult>)
      : Promise.resolve(IdempotencyConflict)
  }

  const result = Promise.resolve().then(execute)
  idempotencyCache.set(cacheKey, { fingerprint, result })
  if (idempotencyCache.size > maxIdempotencyEntries) {
    const oldest = idempotencyCache.keys().next().value
    if (oldest) idempotencyCache.delete(oldest)
  }

  return result
}

type OperationRegistry = Record<string, OperationDefinition>

function defineOperation<TInput, TResult>(definition: {
  schema: z.ZodType<TInput>
  resultSchema: z.ZodType<TResult>
  roles: readonly RendererRole[]
  entrypoints?: readonly RendererEntrypoint[]
  handle(
    input: TInput,
    event: Electron.IpcMainInvokeEvent,
    context: AuthorizationContext
  ): Promise<TResult> | TResult
  failure: TResult
}): OperationDefinition {
  return {
    ...definition,
    handle: (input, event, context) => definition.handle(input as TInput, event, context)
  }
}

const commandRegistry = {
  'account.select': defineOperation({
    schema: AccountSelectCommandSchema,
    resultSchema: AccountSelectResultSchema,
    roles: ['wallet-ui'],
    entrypoints: ['tray'],
    async handle({ accountId }: AccountSelectCommand) {
      if (!accounts.get(accountId)) return { ok: false, error: 'account_not_found' } as const

      await selectAccount(accountId)
      return { ok: true } as const
    },
    failure: { ok: false, error: 'operation_failed' }
  }),
  'transaction.submit': defineOperation({
    schema: TransactionSubmitCommandSchema,
    resultSchema: TransactionSubmitResultSchema,
    roles: ['sidetray'],
    entrypoints: ['sidetray'],
    async handle(command: TransactionSubmitCommand, _event, context) {
      const accountId = accounts.current()?.id || 'no-account'
      const result = await executeIdempotent(
        command.type,
        `${accountId}:${command.idempotencyKey}`,
        command,
        () => submitCurrentAccountTransaction(command, createRendererPrincipal(context))
      )
      return result === IdempotencyConflict
        ? ({ ok: false, error: 'invalid_command', message: 'Idempotency key was reused.' } as const)
        : result
    },
    failure: { ok: false, error: 'provider_error', message: 'Transaction submission failed.' }
  }),
  'typedData.signV4': defineOperation({
    schema: TypedDataSignCommandSchema,
    resultSchema: TypedDataSignResultSchema,
    roles: ['sidetray'],
    entrypoints: ['sidetray'],
    handle(command: TypedDataSignCommand, _event, context) {
      return signCurrentAccountTypedData(command, createRendererPrincipal(context))
    },
    failure: { ok: false, error: 'provider_error', message: 'Typed-data signing failed.' }
  }),
  'flash.submit': defineOperation({
    schema: FlashSubmitCommandSchema,
    resultSchema: FlashSubmitResultSchema,
    roles: ['sidetray'],
    entrypoints: ['sidetray'],
    async handle(command: FlashSubmitCommand) {
      const accountId = accounts.current()?.id || 'no-account'
      const quoteId = command.order.quoteId || command.order.quote.id || 'no-quote'
      const result = await executeIdempotent(command.type, `${accountId}:${quoteId}`, command, () =>
        submitFlashForCurrentAccount(command.order)
      )
      return result === IdempotencyConflict
        ? ({ ok: false, error: 'invalid_command', message: 'Idempotency key was reused.' } as const)
        : FlashSubmitResultSchema.parse(result)
    },
    failure: { ok: false, error: 'submit_failed', message: 'Flash order submission failed.' }
  }),
  'sidetray.close': defineOperation({
    schema: SideTrayCloseCommandSchema,
    resultSchema: SideTrayResultSchema,
    roles: ['sidetray'],
    entrypoints: ['sidetray'],
    handle(_command, event) {
      closeOwnSideTray(event)
      return { ok: true } as const
    },
    failure: { ok: false, error: 'operation_failed' }
  }),
  'sidetray.context-menu': defineOperation({
    schema: SideTrayContextMenuCommandSchema,
    resultSchema: SideTrayResultSchema,
    roles: ['sidetray'],
    entrypoints: ['sidetray'],
    handle({ x, y }: SideTrayContextMenuCommand, event) {
      inspectOwnSideTray(event, x, y)
      return { ok: true } as const
    },
    failure: { ok: false, error: 'operation_failed' }
  }),
  'home.command-consume': defineWalletCommand(
    HomeCommandConsumeCommandSchema,
    ({ commandId }) => walletWorkflows.consumeHomeCommand(commandId),
    'not_found',
    ['tray']
  ),
  'keystore.locate': defineOperation({
    schema: KeystoreLocateCommandSchema,
    resultSchema: KeystoreLocateResultSchema,
    roles: ['wallet-ui'],
    entrypoints: ['tray'],
    async handle() {
      const keystore = await walletWorkflows.locateKeystore()
      return KeystoreLocateResultSchema.parse(
        keystore
          ? ({ ok: true, keystore } as const)
          : ({ ok: false, error: 'not_found', message: 'No keystore was selected.' } as const)
      )
    },
    failure: { ok: false, error: 'invalid_keystore', message: 'Could not read the keystore.' }
  }),
  'security.configure': defineWalletCommand(
    SecurityConfigureCommandSchema,
    (command) => walletWorkflows.configureSecurity(command),
    'not_found',
    ['tray']
  ),
  'security.unlock': defineWalletCommand(
    SecurityUnlockCommandSchema,
    (command) => walletWorkflows.unlockSecurity(command),
    'not_found',
    ['tray']
  ),
  'wallet.lock': defineWalletCommand(
    WalletLockCommandSchema,
    () => walletWorkflows.lockWallet(),
    'not_found',
    ['tray']
  ),
  'network.primary-rpc-set': defineWalletCommand(
    NetworkPrimaryRpcSetCommandSchema,
    ({ chainId, url }) => walletWorkflows.setNetworkPrimaryRpc(chainId, url),
    'not_found',
    ['tray']
  ),
  'network.activation-set': defineWalletCommand(
    NetworkActivationSetCommandSchema,
    ({ chainId, enabled }) => walletWorkflows.setNetworkActivation(chainId, enabled),
    'not_found',
    ['tray']
  ),
  'sidetray.open': defineWalletCommand(
    SideTrayOpenCommandSchema,
    (command) => walletWorkflows.openSideTray(command),
    'not_found',
    ['tray']
  ),
  'flash.order-cancel': defineWalletCommand(
    FlashOrderCancelCommandSchema,
    ({ orderId }, _event, context) =>
      walletWorkflows.cancelFlashOrder(orderId, createRendererPrincipal(context)),
    'not_found',
    ['tray']
  ),
  'account.reorder': defineWalletCommand(
    AccountReorderCommandSchema,
    ({ fromAccountId, toAccountId }) => walletWorkflows.reorderAccounts(fromAccountId, toAccountId),
    'not_found',
    ['tray']
  ),
  'account.rename': defineWalletCommand(
    AccountRenameCommandSchema,
    ({ accountId, name }) => walletWorkflows.renameAccount(accountId, name),
    'not_found',
    ['tray']
  ),
  'account.add-from-signer': defineOperation({
    schema: AccountAddFromSignerCommandSchema,
    resultSchema: AccountCreatedResultSchema,
    roles: ['wallet-ui'],
    entrypoints: ['tray'],
    async handle(command) {
      const accountId = await walletWorkflows.addAccountFromSigner(command)
      return accountId
        ? ({ ok: true, accountId } as const)
        : ({ ok: false, error: 'not_found', message: 'Signer account was not found.' } as const)
    },
    failure: { ok: false, error: 'operation_failed', message: 'Could not add the account.' }
  }),
  'account.watch-add': defineOperation({
    schema: AccountWatchAddCommandSchema,
    resultSchema: AccountCreatedResultSchema,
    roles: ['wallet-ui'],
    entrypoints: ['tray'],
    async handle({ addressOrName, name }) {
      const accountId = await walletWorkflows.addWatchAccount(addressOrName, name)
      return accountId
        ? ({ ok: true, accountId } as const)
        : ({ ok: false, error: 'not_found', message: 'Address or name was not found.' } as const)
    },
    failure: { ok: false, error: 'operation_failed', message: 'Could not add the watch account.' }
  }),
  'signer.import': defineOperation({
    schema: SignerImportCommandSchema,
    resultSchema: AccountCreatedResultSchema,
    roles: ['wallet-ui'],
    entrypoints: ['tray'],
    async handle(command) {
      return { ok: true, accountId: await walletWorkflows.importSigner(command) } as const
    },
    failure: { ok: false, error: 'operation_failed', message: 'Could not import the signer.' }
  }),
  'signer.lattice-create': defineOperation({
    schema: SignerLatticeCreateCommandSchema,
    resultSchema: SignerCreatedResultSchema,
    roles: ['wallet-ui'],
    entrypoints: ['tray'],
    handle({ deviceId, deviceName }) {
      return { ok: true, signerId: walletWorkflows.createLatticeSigner(deviceId, deviceName) } as const
    },
    failure: { ok: false, error: 'operation_failed', message: 'Could not create the signer.' }
  }),
  'signer.disconnect': defineWalletCommand(
    SignerDisconnectCommandSchema,
    ({ signerId }) => walletWorkflows.disconnectSigner(signerId),
    'not_found',
    ['tray']
  ),
  'portfolio.refresh': defineWalletCommand(
    PortfolioRefreshCommandSchema,
    () => walletWorkflows.refreshPortfolio(),
    'not_found',
    ['tray']
  ),
  'settings.update': defineWalletCommand(
    SettingsUpdateCommandSchema,
    (command) => walletWorkflows.updateSettings(command),
    'not_found',
    ['tray']
  ),
  'wallet.reset': defineWalletCommand(
    WalletResetCommandSchema,
    ({ scope }) => walletWorkflows.resetWallet(scope),
    'not_found',
    ['tray']
  ),
  'app.quit': defineWalletCommand(AppQuitCommandSchema, () => walletWorkflows.quitApp(), 'not_found', [
    'tray'
  ]),
  'permission.clear': defineWalletCommand(
    PermissionClearCommandSchema,
    ({ accountId, originId }) => walletWorkflows.clearPermission(accountId, originId),
    'not_found',
    ['tray']
  ),
  'network.request-resolve': defineWalletCommand(
    NetworkRequestResolveCommandSchema,
    (command) => walletWorkflows.resolveNetworkRequest(command),
    'request_not_found',
    ['tray']
  ),
  'notification.update': defineWalletCommand(
    NotificationUpdateCommandSchema,
    ({ notificationId, action }) => walletWorkflows.updateNotification(notificationId, action),
    'not_found',
    ['tray']
  ),
  'request.reject': defineWalletCommand(
    RequestRejectCommandSchema,
    ({ requestId }) => walletWorkflows.rejectRequest(requestId),
    'request_not_found',
    ['tray']
  ),
  'request.access-resolve': defineWalletCommand(
    AccessRequestResolveCommandSchema,
    ({ requestId, approved }) => walletWorkflows.resolveAccessRequest(requestId, approved),
    'request_not_found',
    ['tray']
  ),
  'request.switch-chain-resolve': defineWalletCommand(
    SwitchChainRequestResolveCommandSchema,
    ({ requestId, approved }) => walletWorkflows.resolveSwitchChainRequest(requestId, approved),
    'request_not_found',
    ['tray']
  ),
  'request.clear-origin': defineWalletCommand(
    RequestClearOriginCommandSchema,
    ({ accountId, originId }) => walletWorkflows.clearOriginRequests(accountId, originId),
    'not_found',
    ['tray']
  ),
  'request.approval-confirm': defineWalletCommand(
    RequestApprovalConfirmCommandSchema,
    ({ requestId, approvalType }) => walletWorkflows.confirmRequestApproval(requestId, approvalType),
    'request_not_found',
    ['tray']
  ),
  'request.token-approval-update': defineWalletCommand(
    RequestTokenApprovalUpdateCommandSchema,
    (command) => walletWorkflows.updateTokenApproval(command),
    'request_not_found',
    ['tray']
  ),
  'transaction.fee-update': defineWalletCommand(
    TransactionFeeUpdateCommandSchema,
    ({ requestId, field, value }) => walletWorkflows.updateTransactionFee(requestId, field, value),
    'request_not_found',
    ['tray']
  ),
  'transaction.fee-default-set': defineWalletCommand(
    TransactionFeeDefaultSetCommandSchema,
    ({ requestId, level }) => walletWorkflows.setTransactionFeeDefault(requestId, level),
    'request_not_found',
    ['tray']
  ),
  'transaction.nonce-adjust': defineWalletCommand(
    TransactionNonceAdjustCommandSchema,
    ({ requestId, direction }) => walletWorkflows.adjustTransactionNonce(requestId, direction),
    'request_not_found',
    ['tray']
  ),
  'transaction.nonce-reset': defineWalletCommand(
    TransactionNonceResetCommandSchema,
    ({ requestId }) => walletWorkflows.resetTransactionNonce(requestId),
    'request_not_found',
    ['tray']
  ),
  'transaction.fee-notice-dismiss': defineWalletCommand(
    TransactionFeeNoticeDismissCommandSchema,
    ({ requestId }) => walletWorkflows.dismissTransactionFeeNotice(requestId),
    'request_not_found',
    ['tray']
  ),
  'transaction.replace': defineWalletCommand(
    TransactionReplaceCommandSchema,
    async (command, _event, context) => {
      const result = await executeIdempotent(
        command.type,
        `${command.requestId}:${command.idempotencyKey}`,
        command,
        () =>
          walletWorkflows.replaceTransaction(
            command.requestId,
            command.replacement,
            createRendererPrincipal(context)
          )
      )
      if (result === IdempotencyConflict) throw IdempotencyConflict
      return result
    },
    'request_not_found',
    ['tray']
  ),
  'panel.request-open': defineWalletCommand(
    PanelRequestOpenCommandSchema,
    ({ requestId }) => walletWorkflows.openRequestPanel(requestId),
    'request_not_found',
    ['tray']
  ),
  'panel.back': defineWalletCommand(
    PanelBackCommandSchema,
    ({ steps }) => walletWorkflows.navigatePanelBack(steps),
    'not_found',
    ['tray']
  ),
  'request.add-token-review': defineWalletCommand(
    AddTokenReviewCommandSchema,
    ({ requestId }) => walletWorkflows.reviewAddTokenRequest(requestId),
    'request_not_found',
    ['tray']
  ),
  'request.add-chain-review': defineWalletCommand(
    AddChainReviewCommandSchema,
    ({ requestId }) => walletWorkflows.reviewAddChainRequest(requestId),
    'request_not_found',
    ['tray']
  ),
  'extension.respond': defineWalletCommand(
    ExtensionRespondCommandSchema,
    ({ extensionId, approved }) => walletWorkflows.respondToExtension(extensionId, approved),
    'not_found',
    ['tray']
  ),
  'updater.respond': defineWalletCommand(
    UpdaterRespondCommandSchema,
    ({ action }) => walletWorkflows.respondToUpdater(action),
    'not_found',
    ['tray']
  ),
  'tray.mouseout': defineWalletCommand(
    TrayMouseoutCommandSchema,
    () => walletWorkflows.handleTrayMouseout(),
    'not_found',
    ['tray']
  ),
  'tray.context-menu': defineWalletCommand(
    TrayContextMenuCommandSchema,
    ({ x, y }, event) => walletWorkflows.inspectOwnTrayWindow(event, x, y),
    'not_found',
    ['tray']
  ),
  'clipboard.write': defineWalletCommand(
    ClipboardWriteCommandSchema,
    ({ text }) => walletWorkflows.writeClipboard(text),
    'not_found',
    ['tray']
  ),
  'external.open': defineWalletCommand(
    ExternalOpenCommandSchema,
    ({ url }) => walletWorkflows.openExternalUrl(url),
    'not_found',
    ['tray']
  ),
  'explorer.open': defineWalletCommand(
    ExplorerOpenCommandSchema,
    ({ chainId, transactionHash }) => walletWorkflows.openTransactionExplorer(chainId, transactionHash),
    'not_found',
    ['tray']
  ),
  'token.add': defineWalletCommand(
    TokenAddCommandSchema,
    (command) => walletWorkflows.addToken(command),
    'request_not_found',
    ['tray']
  ),
  'token.image-hydrate': defineOperation({
    schema: TokenImageHydrateCommandSchema,
    resultSchema: WalletCommandResultSchema,
    roles: ['wallet-ui', 'sidetray'],
    entrypoints: ['tray', 'sidetray'],
    handle({ tokenId }) {
      requestTokenImage(tokenId)
      return { ok: true } as const
    },
    failure: { ok: false, error: 'operation_failed' }
  }),
  'token.remove': defineWalletCommand(
    TokenRemoveCommandSchema,
    ({ address, chainId }) => walletWorkflows.removeToken({ address, chainId }),
    'not_found',
    ['tray']
  ),
  'origin.remove': defineWalletCommand(
    OriginRemoveCommandSchema,
    ({ originId }) => walletWorkflows.removeOrigin(originId),
    'not_found',
    ['tray']
  ),
  'warning.toggle': defineWalletCommand(
    WarningToggleCommandSchema,
    ({ warning }) => walletWorkflows.toggleWarning(warning),
    'not_found',
    ['tray']
  ),
  'request.approve': defineWalletCommand(
    RequestApproveCommandSchema,
    async (command) => {
      const result = await executeIdempotent(command.type, command.requestId, command, () =>
        walletWorkflows.approveRequest(command.requestId)
      )
      if (result === IdempotencyConflict) throw IdempotencyConflict
      return result
    },
    'request_not_found',
    ['tray']
  ),
  'network.remove': defineWalletCommand(
    NetworkRemoveCommandSchema,
    ({ chainId }) => walletWorkflows.removeNetwork(chainId),
    'not_found',
    ['tray']
  ),
  'signer.trezor-input': defineWalletCommand(
    TrezorInputCommandSchema,
    (command) => walletWorkflows.submitTrezorInput(command),
    'not_found',
    ['tray']
  ),
  'signer.lattice-pair': defineWalletCommand(
    LatticePairCommandSchema,
    ({ signerId, pairCode }) => walletWorkflows.pairLattice(signerId, pairCode),
    'not_found',
    ['tray']
  ),
  'account.remove': defineWalletCommand(
    AccountRemoveCommandSchema,
    ({ address, removeSeedSigner }) => walletWorkflows.removeAccount(address, removeSeedSigner),
    'not_found',
    ['tray']
  ),
  'signer.reload': defineWalletCommand(
    SignerReloadCommandSchema,
    ({ signerId }) => walletWorkflows.reloadSigner(signerId),
    'not_found',
    ['tray']
  )
} satisfies Record<keyof CommandMap, OperationDefinition>

const queryRegistry = {
  'flash.quote': defineOperation({
    schema: FlashQuoteQuerySchema,
    resultSchema: FlashQuoteResultSchema,
    roles: ['sidetray'],
    entrypoints: ['sidetray'],
    async handle({ request }: FlashQuoteQuery) {
      return FlashQuoteResultSchema.parse(await quoteFlashForCurrentAccount(request))
    },
    failure: { ok: false, error: 'quote_failed', message: 'Flash quote failed.' }
  }),
  'name.resolve': defineOperation({
    schema: NameResolveQuerySchema,
    resultSchema: NameResolveResultSchema,
    roles: ['wallet-ui', 'sidetray'],
    entrypoints: ['tray', 'sidetray'],
    async handle({ name }: NameResolveQuery) {
      const address = await resolveName(name)
      return address ? ({ ok: true, address } as const) : ({ ok: false, error: 'not_found' } as const)
    },
    failure: { ok: false, error: 'resolution_failed' }
  }),
  'token.lookup': defineOperation({
    schema: TokenLookupQuerySchema,
    resultSchema: TokenLookupResultSchema,
    roles: ['wallet-ui'],
    entrypoints: ['tray'],
    async handle({ address, chainId }: TokenLookupQuery) {
      const token = await walletWorkflows.lookupToken(address, chainId)
      return token ? ({ ok: true, token } as const) : ({ ok: false, error: 'not_found' } as const)
    },
    failure: { ok: false, error: 'lookup_failed' }
  }),
  'security.status': defineOperation({
    schema: SecurityStatusQuerySchema,
    resultSchema: SecurityStatusResultSchema,
    roles: ['wallet-ui'],
    entrypoints: ['tray'],
    handle(_query: SecurityStatusQuery) {
      return { ok: true, ...walletWorkflows.securityStatus() } as const
    },
    failure: { ok: false, error: 'operation_failed', message: 'Could not read security status.' }
  }),
  'request.signer-compatibility': defineOperation({
    schema: SignerCompatibilityQuerySchema,
    resultSchema: SignerCompatibilityResultSchema,
    roles: ['wallet-ui'],
    entrypoints: ['tray'],
    handle({ requestId }: SignerCompatibilityQuery) {
      return walletWorkflows.requestSignerCompatibility(requestId)
    },
    failure: { ok: false, error: 'operation_failed', message: 'Could not inspect signer compatibility.' }
  }),
  'account.private-key-export': defineOperation({
    schema: AccountPrivateKeyExportQuerySchema,
    resultSchema: AccountPrivateKeyExportResultSchema,
    roles: ['wallet-ui'],
    entrypoints: ['tray'],
    async handle({ accountId, password }: AccountPrivateKeyExportQuery) {
      const secret = await walletWorkflows.exportAccountPrivateKey(accountId, password)
      if (!secret) {
        return { ok: false, error: 'account_not_found', message: 'Account was not found.' } as const
      }
      if (secret.type !== 'privateKey') {
        return { ok: false, error: 'export_failed', message: 'Private key was not returned.' } as const
      }
      return { ok: true, privateKey: secret.value } as const
    },
    failure: { ok: false, error: 'export_failed', message: 'Could not export the private key.' }
  }),
  'seed.generate': defineOperation({
    schema: SeedGenerateQuerySchema,
    resultSchema: SeedGenerateResultSchema,
    roles: ['wallet-ui'],
    entrypoints: ['tray'],
    async handle(_query: SeedGenerateQuery) {
      return { ok: true, phrase: await walletWorkflows.generateSeedPhrase() } as const
    },
    failure: { ok: false, error: 'operation_failed', message: 'Could not generate a recovery phrase.' }
  })
} satisfies Record<keyof QueryMap, OperationDefinition>

const OperationTypeSchema = z.looseObject({ type: z.string().max(128) })

function boundaryFailure(
  kind: 'command' | 'query',
  error: 'invalid_command' | 'invalid_query' | 'unauthorized'
) {
  return (kind === 'command' ? CommandBoundaryFailureSchema : QueryBoundaryFailureSchema).parse({
    ok: false,
    error
  })
}

async function dispatchOperation(
  kind: 'command' | 'query',
  event: Electron.IpcMainInvokeEvent,
  input: unknown,
  registry: OperationRegistry
) {
  const context = authorizeRenderer(event)
  if (!context) {
    log.warn(`Rejected ${kind} from an unregistered or invalid renderer`)
    return boundaryFailure(kind, 'unauthorized')
  }

  const operationType = OperationTypeSchema.safeParse(input)
  const type = operationType.success ? operationType.data.type : undefined
  const operation = type ? registry[type] : undefined
  if (!operation) {
    log.warn(`Rejected malformed or unknown ${kind}`, {
      type,
      clientType: context.clientType
    })
    return boundaryFailure(kind, kind === 'command' ? 'invalid_command' : 'invalid_query')
  }

  if (!operation.roles.includes(context.clientType)) {
    log.warn(`Rejected unauthorized ${kind}`, {
      type,
      clientType: context.clientType
    })
    return boundaryFailure(kind, 'unauthorized')
  }

  if (operation.entrypoints && !operation.entrypoints.includes(context.entrypoint)) {
    log.warn(`Rejected unauthorized ${kind} entrypoint`, {
      type,
      entrypoint: context.entrypoint
    })
    return boundaryFailure(kind, 'unauthorized')
  }

  const parsed = operation.schema.safeParse(input)
  if (!parsed.success) {
    log.warn(`Rejected invalid ${kind} payload`, {
      type,
      clientType: context.clientType
    })
    return boundaryFailure(kind, kind === 'command' ? 'invalid_command' : 'invalid_query')
  }

  try {
    const result = await operation.handle(parsed.data, event, context)
    const validated = operation.resultSchema.safeParse(result)
    if (validated.success) return validated.data

    log.error(`Invalid ${kind} result`, { type })
  } catch (error) {
    log.error(`Failed to execute ${kind}`, { type, error })
  }

  return operation.failure
}

export const dispatchCommand = (event: Electron.IpcMainInvokeEvent, command: unknown) =>
  dispatchOperation('command', event, command, commandRegistry)

export const dispatchQuery = (event: Electron.IpcMainInvokeEvent, query: unknown) =>
  dispatchOperation('query', event, query, queryRegistry)

export function registerOperationHandlers() {
  ipcMain.handle(ExecuteCommandChannel, dispatchCommand)
  ipcMain.handle(ExecuteQueryChannel, dispatchQuery)
}
