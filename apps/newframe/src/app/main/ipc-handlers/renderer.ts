import log from 'electron-log'

import type {
  AuthorizationContext,
  RendererEntrypoint,
  RendererRole
} from '../../../platform/ipc/main/authorization.js'
import type { SigningUiContext } from '../../../platform/signing/signers/Signer/index.js'
import {
  FlashQuoteResultSchema,
  KeystoreLocateResultSchema,
  type AddressChainUsageQuery,
  type AccountPrivateKeyExportQuery,
  type CommandMap,
  type CommandResult,
  type FlashQuoteQuery,
  type KeystoreLocateQuery,
  type NameResolveQuery,
  type ProfileMovableAccountsQuery,
  type QueryMap,
  type QueryResultMap,
  type SecurityStatusQuery,
  type SeedGenerateQuery,
  type RendererContextMenuCommand,
  type TokenLookupQuery
} from '../../contracts/operations.js'

export type RendererOperationContext = AuthorizationContext & {
  source: import('../gateway/requestSource.js').NewframeInternalSource
}

export interface OperationServices {
  protectedOperations: Pick<
    import('../protected-operations/service.js').ProtectedOperationsService,
    'exportPrivateKey'
  >
  airgap: import('../../../features/accounts/main/airgap/service.js').AirGapService
  accounts: {
    current(): { id: string } | null | undefined
    get(accountId: string): unknown
  }
  accountMutations: import('../../../features/accounts/main/service.js').AccountService
  safes: import('../../../features/accounts/main/safe.js').SafeService
  accountOnboarding: import('../../../features/accounts/main/accountOnboarding/service.js').AccountOnboardingService
  agent: import('../../../features/agent-access/main/index.js').AgentService
  networks: import('../../../features/networks/main/service.js').NetworkService
  portfolio: import('../../../features/portfolio/main/service.js').PortfolioService
  profiles: import('../../../features/accounts/main/profiles/service.js').ProfileService
  platform: import('../platform/service.js').PlatformService
  requestEdits: import('../../../features/requests/main/requestEdits/service.js').RequestEditService
  requests: import('../../../features/requests/main/service.js').RequestService
  security: import('../../../features/security/main/service.js').SecurityService
  send: import('../../../features/transactions/send/main/service.js').SendService
  trade: import('../../../features/transactions/trade/main/service.js').TradeService
  settings: ReturnType<typeof import('../../../features/settings/main/service.js').createSettingsService>
  tokens: import('../../../features/tokens/main/service.js').TokenService
  authorizeRenderer(event: Electron.IpcMainInvokeEvent): AuthorizationContext | undefined
  requestTokenImage: import('../../../features/asset-data/main/images/index.js').ImageService['requestTokenImage']
  resolveName(name: string): Promise<string>
}

type OperationDefinition = {
  roles: readonly RendererRole[]
  entrypoints?: readonly RendererEntrypoint[]
  handle(
    input: unknown,
    event: Electron.IpcMainInvokeEvent,
    context: RendererOperationContext
  ): Promise<unknown> | unknown
  failure: unknown
}

function defineAcknowledgedCommand<TKey extends keyof CommandMap>(
  operationType: TKey,
  handle: (
    input: CommandMap[TKey],
    event: Electron.IpcMainInvokeEvent,
    context: RendererOperationContext
  ) => Promise<boolean | void> | boolean | void,
  missingError:
    | 'not_found'
    | 'request_not_found'
    | ((input: CommandMap[TKey]) => 'not_found' | 'request_not_found' | 'invalid_command') = 'not_found',
  entrypoints: readonly RendererEntrypoint[] = ['tray']
) {
  return defineOperation<CommandMap[TKey], unknown>({
    roles: ['wallet-ui'],
    entrypoints,
    async handle(input, event, context) {
      try {
        return (await handle(input, event, context)) === false
          ? ({
              ok: false,
              error: typeof missingError === 'function' ? missingError(input) : missingError
            } as const)
          : ({ ok: true } as const)
      } catch (error) {
        if (isIdempotencyConflict(error)) {
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

const IdempotencyConflict = new Error('Idempotency conflict')
const isIdempotencyConflict = (value: unknown): value is typeof IdempotencyConflict =>
  value === IdempotencyConflict
const maxIdempotencyEntries = 256

const operationOwner = (context: RendererOperationContext) => ({
  clientType: context.clientType,
  windowInstanceId: context.windowInstanceId
})

function signingUiContext(
  event: Electron.IpcMainInvokeEvent,
  context: RendererOperationContext
): SigningUiContext {
  const sender = event.sender
  return {
    owner: operationOwner(context),
    isOwnerActive: () => !sender.isDestroyed(),
    subscribeOwnerDisposed(onDispose) {
      if (sender.isDestroyed()) {
        onDispose()
        return () => {}
      }
      sender.once('destroyed', onDispose)
      if (sender.isDestroyed()) {
        sender.removeListener('destroyed', onDispose)
        onDispose()
      }
      return () => {
        sender.removeListener('destroyed', onDispose)
      }
    }
  }
}

const operationCommandAcknowledgement = (accepted: boolean | void) =>
  accepted === false ? ({ ok: false, error: 'invalid_command' } as const) : ({ ok: true } as const)

export type OperationRegistry = Record<string, OperationDefinition>

function defineOperation<TInput, TResult>(definition: {
  roles: readonly RendererRole[]
  entrypoints?: readonly RendererEntrypoint[]
  handle(
    input: TInput,
    event: Electron.IpcMainInvokeEvent,
    context: RendererOperationContext
  ): Promise<TResult> | TResult
  failure: TResult
}): OperationDefinition {
  return {
    ...definition,
    handle: (input, event, context) => definition.handle(input as TInput, event, context)
  }
}

function defineCommand<TKey extends keyof CommandMap>(
  _operationType: TKey,
  definition: {
    roles: readonly RendererRole[]
    entrypoints?: readonly RendererEntrypoint[]
    handle(
      input: CommandMap[TKey],
      event: Electron.IpcMainInvokeEvent,
      context: RendererOperationContext
    ): Promise<CommandResult> | CommandResult
    failure: CommandResult
  }
) {
  return defineOperation(definition)
}

function defineOwnedCommand<TKey extends keyof CommandMap>(
  operationType: TKey,
  handle: (
    input: CommandMap[TKey],
    context: RendererOperationContext
  ) => Promise<boolean | void> | boolean | void
) {
  return defineCommand(operationType, {
    roles: ['wallet-ui'],
    entrypoints: ['tray'],
    async handle(input, _event, context) {
      return operationCommandAcknowledgement(await handle(input, context))
    },
    failure: { ok: false, error: 'operation_failed' }
  })
}

function defineQuery<TKey extends keyof QueryMap>(
  _operationType: TKey,
  definition: {
    roles: readonly RendererRole[]
    entrypoints?: readonly RendererEntrypoint[]
    handle(
      input: QueryMap[TKey],
      event: Electron.IpcMainInvokeEvent,
      context: RendererOperationContext
    ): Promise<QueryResultMap[TKey]> | QueryResultMap[TKey]
    failure: QueryResultMap[TKey]
  }
) {
  return defineOperation(definition)
}

export function createOperationRegistry(services: OperationServices) {
  const {
    accountMutations,
    airgap,
    accountOnboarding,
    safes,
    agent,
    networks,
    portfolio,
    platform,
    profiles,
    requestEdits,
    requests,
    security,
    send,
    trade,
    settings,
    tokens,
    requestTokenImage
  } = services
  const idempotencyCache = new Map<string, { fingerprint: string; result: Promise<unknown> }>()

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
      if (oldest) {
        idempotencyCache.delete(oldest)
      }
    }

    return result
  }

  const commandRegistry = {
    'account.create': defineOwnedCommand('account.create', (command, context) =>
      command.source === 'safe'
        ? safes.import(command, operationOwner(context))
        : accountOnboarding.createAccount(command, operationOwner(context))
    ),
    'account.update': defineAcknowledgedCommand(
      'account.update',
      (command, _event, context) => {
        if ('profileId' in command) {
          return profiles.moveAccount(command, operationOwner(context))
        }
        return 'enabled' in command
          ? agent.setAgentAccess(command.accountId, command.enabled)
          : accountMutations.update(command)
      },
      (command) => ('profileId' in command ? 'invalid_command' : 'not_found')
    ),
    'signer.import': defineAcknowledgedCommand(
      'signer.import',
      (command, event, context) =>
        command.source === 'airgap'
          ? airgap.pairStart(command, signingUiContext(event, context))
          : accountOnboarding.importSigner(command, operationOwner(context)),
      (command) => (command.source === 'airgap' ? 'not_found' : 'invalid_command')
    ),
    'signer.refresh': defineOwnedCommand('signer.refresh', (command, context) =>
      accountOnboarding.refresh(command, operationOwner(context))
    ),
    'signer.session-input': defineAcknowledgedCommand(
      'signer.session-input',
      (command, _event, context) => {
        const owner = operationOwner(context)
        if ('input' in command) {
          return accountOnboarding.sessionInput(command, owner)
        }
        return 'requestId' in command ? airgap.scan(command, owner) : airgap.pairScan(command, owner)
      },
      (command) => ('input' in command ? 'invalid_command' : 'not_found')
    ),
    'signer.session-finish': defineAcknowledgedCommand(
      'signer.session-finish',
      (command, _event, context) => {
        const owner = operationOwner(context)
        if ('outcome' in command) {
          return accountOnboarding.finishSession(command, owner)
        }
        return 'requestId' in command ? airgap.cancel(command, owner) : airgap.pairCancel(command, owner)
      },
      (command) => ('outcome' in command ? 'invalid_command' : 'not_found')
    ),
    'account.select': defineAcknowledgedCommand(
      'account.select',
      ({ accountId }) => accountMutations.select(accountId),
      'not_found'
    ),
    'request.create': defineCommand('request.create', {
      roles: ['sidetray'],
      entrypoints: ['sidetray'],
      handle(command, _event, context) {
        const principal = context.source
        const owner = operationOwner(context)
        return operationCommandAcknowledgement(
          'quoteId' in command
            ? trade.prepare(command, principal, owner)
            : send.submit(command, principal, owner)
        )
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'trade.submit': defineCommand('trade.submit', {
      roles: ['sidetray'],
      entrypoints: ['sidetray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(trade.submit(command, context.source, operationOwner(context)))
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'operation.cancel': defineCommand('operation.cancel', {
      roles: ['sidetray'],
      entrypoints: ['sidetray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(trade.cancelOperation(command, operationOwner(context)))
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'sidetray.close': defineCommand('sidetray.close', {
      roles: ['sidetray'],
      entrypoints: ['sidetray'],
      handle(_command, event) {
        platform.closeSideTray(event)
        return { ok: true } as const
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'renderer.context-menu': defineCommand('renderer.context-menu', {
      roles: ['wallet-ui', 'sidetray'],
      entrypoints: ['tray', 'sidetray'],
      handle({ x, y }: RendererContextMenuCommand, event) {
        platform.inspectRenderer(event, x, y)
        return { ok: true } as const
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'home.command-consume': defineAcknowledgedCommand(
      'home.command-consume',
      ({ commandId }) => platform.consumeHomeCommand(commandId),
      'not_found'
    ),
    'profile.select': defineOwnedCommand('profile.select', (command, context) =>
      profiles.select(command, operationOwner(context))
    ),
    'profile.create': defineOwnedCommand('profile.create', (command, context) =>
      profiles.create(command, operationOwner(context))
    ),
    'profile.update': defineOwnedCommand('profile.update', (command, context) =>
      profiles.update(command, operationOwner(context))
    ),
    'profile.delete': defineOwnedCommand('profile.delete', (command, context) =>
      profiles.delete(command, operationOwner(context))
    ),
    'security.configure': defineOwnedCommand('security.configure', (command, context) =>
      security.configure(command, operationOwner(context))
    ),
    'security.unlock': defineOwnedCommand('security.unlock', (command, context) =>
      security.unlock(command, operationOwner(context))
    ),
    'wallet.lock': defineOwnedCommand('wallet.lock', (command, context) =>
      security.lock(command, operationOwner(context))
    ),
    'network.primary-rpc-set': defineAcknowledgedCommand('network.primary-rpc-set', ({ chainId, url }) =>
      networks.setPrimaryRpc(chainId, url)
    ),
    'network.activation-set': defineAcknowledgedCommand('network.activation-set', ({ chainId, enabled }) =>
      networks.setActivation(chainId, enabled)
    ),
    'sidetray.open': defineAcknowledgedCommand('sidetray.open', (command) => platform.openSideTray(command)),
    'flash.order-cancel': defineAcknowledgedCommand('flash.order-cancel', (command, _event, context) =>
      trade.cancel(command, context.source, operationOwner(context))
    ),

    'account.agent-sessions-revoke': defineAcknowledgedCommand(
      'account.agent-sessions-revoke',
      ({ accountId }) => agent.revokeAgentSessions(accountId)
    ),

    'account.refresh': defineAcknowledgedCommand('account.refresh', (command) => safes.refresh(command)),

    'signer.disconnect': defineOwnedCommand('signer.disconnect', (command, context) =>
      accountOnboarding.disconnect(command, operationOwner(context))
    ),
    'signer.session-start': defineOwnedCommand('signer.session-start', (command, context) =>
      accountOnboarding.startSession(command, operationOwner(context))
    ),

    'portfolio.refresh': defineOwnedCommand('portfolio.refresh', (command, context) =>
      portfolio.refresh(command.operationId, operationOwner(context))
    ),
    'settings.update': defineAcknowledgedCommand('settings.update', (command) => settings.update(command)),
    'wallet.reset': defineOwnedCommand('wallet.reset', (command, context) =>
      security.reset(command, operationOwner(context))
    ),
    'app.quit': defineAcknowledgedCommand('app.quit', () => platform.quitApp()),
    'permission.clear': defineAcknowledgedCommand('permission.clear', ({ accountId, originId }) =>
      accountMutations.clearPermission(accountId, originId)
    ),
    'network.request-resolve': defineAcknowledgedCommand(
      'network.request-resolve',
      (command) => requests.resolveNetwork(command),
      'request_not_found',
      ['tray']
    ),
    'notification.update': defineAcknowledgedCommand('notification.update', ({ notificationId, action }) =>
      platform.updateNotification(notificationId, action)
    ),
    'request.reject': defineAcknowledgedCommand(
      'request.reject',
      ({ requestId }) => requests.rejectRequest(requestId),
      'request_not_found',
      ['tray']
    ),
    'request.access-resolve': defineAcknowledgedCommand(
      'request.access-resolve',
      ({ requestId, approved }) => requests.resolveAccess(requestId, approved),
      'request_not_found',
      ['tray']
    ),
    'request.agent-access-resolve': defineAcknowledgedCommand(
      'request.agent-access-resolve',
      ({ requestId, approved }) => requests.resolveAgentAccess(requestId, approved),
      'request_not_found',
      ['tray']
    ),
    'request.switch-chain-resolve': defineAcknowledgedCommand(
      'request.switch-chain-resolve',
      ({ requestId, approved }) => requests.resolveSwitchChain(requestId, approved),
      'request_not_found',
      ['tray']
    ),
    'request.clear-origin': defineAcknowledgedCommand('request.clear-origin', ({ accountId, originId }) =>
      requests.clearOrigin(accountId, originId)
    ),
    'request.approval-confirm': defineAcknowledgedCommand(
      'request.approval-confirm',
      ({ requestId, approvalType }) => requests.confirmRequestApproval(requestId, approvalType),
      'request_not_found',
      ['tray']
    ),
    'request.token-approval-update': defineAcknowledgedCommand(
      'request.token-approval-update',
      (command) => requestEdits.updateTokenApproval(command),
      'request_not_found',
      ['tray']
    ),
    'transaction.replace': defineAcknowledgedCommand(
      'transaction.replace',
      async (command, _event, context) => {
        const result = await executeIdempotent(
          command.type,
          `${context.windowInstanceId}:${command.requestId}:${command.idempotencyKey}`,
          command,
          () => requests.replaceTransaction(command, context.source)
        )
        if (isIdempotencyConflict(result)) {
          throw IdempotencyConflict
        }
        return result
      },
      'request_not_found',
      ['tray']
    ),
    'panel.request-open': defineAcknowledgedCommand(
      'panel.request-open',
      ({ requestId }) => platform.openRequestPanel(requestId),
      'request_not_found',
      ['tray']
    ),
    'panel.back': defineAcknowledgedCommand('panel.back', ({ steps }) => platform.navigatePanelBack(steps)),
    'request.add-token-review': defineAcknowledgedCommand(
      'request.add-token-review',
      ({ requestId }) => requests.reviewAddToken(requestId),
      'request_not_found',
      ['tray']
    ),
    'request.add-chain-review': defineAcknowledgedCommand(
      'request.add-chain-review',
      ({ requestId }) => requests.reviewAddChain(requestId),
      'request_not_found',
      ['tray']
    ),
    'extension.respond': defineAcknowledgedCommand('extension.respond', ({ extensionId, approved }) =>
      platform.respondToExtension(extensionId, approved)
    ),
    'updater.respond': defineAcknowledgedCommand('updater.respond', ({ action }) =>
      platform.respondToUpdater(action)
    ),
    'tray.mouseout': defineAcknowledgedCommand(
      'tray.mouseout',
      () => platform.handleTrayMouseout(),
      'not_found',
      ['tray']
    ),
    'clipboard.write': defineAcknowledgedCommand(
      'clipboard.write',
      ({ text }) => platform.writeClipboard(text),
      'not_found',
      ['tray']
    ),
    'external.open': defineAcknowledgedCommand(
      'external.open',
      ({ url }) => platform.openExternal(url),
      'not_found',
      ['tray']
    ),
    'explorer.open': defineAcknowledgedCommand(
      'explorer.open',
      ({ chainId, transactionHash }) => platform.openTransactionExplorer(chainId, transactionHash),
      'not_found',
      ['tray']
    ),
    'token.add': defineOwnedCommand('token.add', (command, context) =>
      tokens.add(command, operationOwner(context))
    ),
    'token.image-hydrate': defineCommand('token.image-hydrate', {
      roles: ['wallet-ui', 'sidetray'],
      entrypoints: ['tray', 'sidetray'],
      handle({ tokenId }) {
        requestTokenImage(tokenId)
        return { ok: true } as const
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'token.remove': defineAcknowledgedCommand(
      'token.remove',
      ({ address, chainId }) => tokens.remove({ address, chainId }),
      'not_found',
      ['tray']
    ),
    'origin.remove': defineAcknowledgedCommand(
      'origin.remove',
      ({ originId }) => accountMutations.removeOrigin(originId),
      'not_found',
      ['tray']
    ),
    'warning.toggle': defineAcknowledgedCommand(
      'warning.toggle',
      ({ warning }) => platform.toggleWarning(warning),
      'not_found',
      ['tray']
    ),
    'request.approve': defineAcknowledgedCommand(
      'request.approve',
      (command, event, context) => {
        if ('safeTxHash' in command) {
          if ('action' in command) {
            void safes
              .execute(
                command,
                command.executorId,
                command.adjustments,
                signingUiContext(event, context),
                command.operationId
              )
              .catch(() => undefined)
            return
          }
          return safes.confirm(command, signingUiContext(event, context))
        }
        return requests.approve(
          command.requestId,
          signingUiContext(event, context),
          'adjustments' in command ? command.adjustments : undefined,
          'ownerId' in command ? command.ownerId : undefined,
          'executorId' in command ? command.executorId : undefined
        )
      },
      (command) => ('safeTxHash' in command ? 'not_found' : 'request_not_found'),
      ['tray']
    ),
    'request.warning-confirm': defineAcknowledgedCommand(
      'request.warning-confirm',
      ({ requestId, gate }, event, context) =>
        requests.confirmWarning(requestId, gate, signingUiContext(event, context)),
      'request_not_found',
      ['tray']
    ),
    'network.remove': defineAcknowledgedCommand(
      'network.remove',
      ({ chainId }) => networks.remove(chainId),
      'not_found',
      ['tray']
    ),

    'account.remove': defineAcknowledgedCommand(
      'account.remove',
      ({ address, removeSeedSigner }) => accountMutations.remove(address, removeSeedSigner),
      'not_found',
      ['tray']
    )
  } satisfies Record<keyof CommandMap, OperationDefinition>

  const queryRegistry = {
    'signer.session-frames': defineQuery('signer.session-frames', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle: (query, _event, context) => airgap.request(query, operationOwner(context)),
      failure: { ok: false, error: 'unavailable' }
    }),
    'keystore.locate': defineQuery('keystore.locate', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      async handle(_query: KeystoreLocateQuery) {
        const keystore = await accountOnboarding.locateKeystore()
        return KeystoreLocateResultSchema.parse(
          keystore
            ? ({ ok: true, keystore } as const)
            : ({ ok: false, error: 'not_found', message: 'No keystore was selected.' } as const)
        )
      },
      failure: { ok: false, error: 'invalid_keystore', message: 'Could not read the keystore.' }
    }),
    'profile.movable-accounts': defineQuery('profile.movable-accounts', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(_query: ProfileMovableAccountsQuery) {
        return profiles.movableAccounts()
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'address.chain-usage': defineQuery('address.chain-usage', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      async handle({ addresses }: AddressChainUsageQuery) {
        return {
          ok: true,
          usage: await accountMutations.addressChainUsage(addresses)
        } as const
      },
      failure: { ok: false, error: 'lookup_failed' }
    }),
    'flash.quote': defineQuery('flash.quote', {
      roles: ['sidetray'],
      entrypoints: ['sidetray'],
      async handle({ request }: FlashQuoteQuery, _event, context) {
        return FlashQuoteResultSchema.parse(await trade.quote(request, operationOwner(context)))
      },
      failure: { ok: false, error: 'quote_failed', message: 'Flash quote failed.' }
    }),
    'name.resolve': defineQuery('name.resolve', {
      roles: ['wallet-ui', 'sidetray'],
      entrypoints: ['tray', 'sidetray'],
      async handle({ name }: NameResolveQuery) {
        const address = await services.resolveName(name)
        return address ? ({ ok: true, address } as const) : ({ ok: false, error: 'not_found' } as const)
      },
      failure: { ok: false, error: 'resolution_failed' }
    }),
    'safe.discover': defineQuery('safe.discover', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle: ({ address }) => safes.discoverNetworks(address),
      failure: []
    }),
    'safe.simulate': defineQuery('safe.simulate', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle: (query) => safes.simulate(query),
      failure: { status: 'unavailable', error: 'Safe simulation unavailable.' }
    }),
    'safe.confirmation-status': defineQuery('safe.confirmation-status', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle: (query, _event, context) => safes.confirmationStatus(query, operationOwner(context)),
      failure: { status: 'validation_failed', message: 'Safe confirmation status is unavailable.' }
    }),
    'safe.execution-prepare': defineQuery('safe.execution-prepare', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      async handle(query) {
        try {
          return { ok: true, ...(await safes.prepareExecution(query, query.executorId)) } as const
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message.slice(0, 500) : 'Safe execution preparation failed.'
          } as const
        }
      },
      failure: { ok: false, error: 'Safe execution preparation failed.' }
    }),
    'token.lookup': defineQuery('token.lookup', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      async handle({ address, chainId }: TokenLookupQuery) {
        const token = await tokens.lookup(address, chainId)
        return token ? ({ ok: true, token } as const) : ({ ok: false, error: 'not_found' } as const)
      },
      failure: { ok: false, error: 'lookup_failed' }
    }),
    'security.status': defineQuery('security.status', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(_query: SecurityStatusQuery) {
        return { ok: true, ...security.status() } as const
      },
      failure: { ok: false, error: 'operation_failed', message: 'Could not read security status.' }
    }),
    'account.private-key-export': defineQuery('account.private-key-export', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      async handle({ accountId }: AccountPrivateKeyExportQuery) {
        const privateKey = await services.protectedOperations.exportPrivateKey(accountId)
        if (!privateKey) {
          return { ok: false, error: 'account_not_found', message: 'Account was not found.' } as const
        }
        return { ok: true, privateKey } as const
      },
      failure: { ok: false, error: 'export_failed', message: 'Could not export the private key.' }
    }),
    'seed.generate': defineQuery('seed.generate', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      async handle(_query: SeedGenerateQuery) {
        return { ok: true, phrase: await accountOnboarding.generateSeedPhrase() } as const
      },
      failure: { ok: false, error: 'operation_failed', message: 'Could not generate a recovery phrase.' }
    })
  } satisfies Record<keyof QueryMap, OperationDefinition>

  return { commandRegistry, queryRegistry }
}
