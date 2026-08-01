import log from 'electron-log'
import { z } from 'zod'

import type { AuthorizationContext, RendererEntrypoint, RendererRole } from './authorization.js'
import {
  commandContracts,
  queryContracts,
  CommandResultSchema,
  FlashQuoteResultSchema,
  KeystoreLocateResultSchema,
  QueryBoundaryFailureSchema,
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
import { ExecuteCommandChannel, ExecuteQueryChannel } from '../../contracts/ipc.js'

export interface OperationServices {
  accounts: {
    current(): { id: string } | null | undefined
    get(accountId: string): unknown
  }
  accountMutations: import('../features/accounts/service.js').AccountService
  accountOnboarding: import('../features/accountOnboarding/service.js').AccountOnboardingService
  agent: import('../agent/index.js').AgentService
  networks: import('../features/networks/service.js').NetworkService
  portfolio: import('../features/portfolio/service.js').PortfolioService
  profiles: import('../features/profiles/service.js').ProfileService
  platform: import('../features/platform/service.js').PlatformService
  requestEdits: import('../features/requestEdits/service.js').RequestEditService
  requests: import('../features/requests/service.js').RequestService
  security: import('../features/security/service.js').SecurityService
  send: import('../features/send/service.js').SendService
  trade: import('../features/trade/service.js').TradeService
  settings: ReturnType<typeof import('../features/settings/service.js').createSettingsService>
  tokens: import('../features/tokens/service.js').TokenService
  authorizeRenderer(event: Electron.IpcMainInvokeEvent): AuthorizationContext | undefined
  createRendererPrincipal: typeof import('../authority.js').createRendererPrincipal
  requestTokenImage: import('../images/index.js').ImageService['requestTokenImage']
  resolveName(name: string): Promise<string>
}

export interface OperationDispatcher {
  dispatchCommand(event: Electron.IpcMainInvokeEvent, command: unknown): Promise<unknown>
  dispatchQuery(event: Electron.IpcMainInvokeEvent, query: unknown): Promise<unknown>
}

export interface IpcMainHandlerPort {
  handle(
    channel: string,
    listener: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown
  ): void
  removeHandler(channel: string): void
}

type OperationDefinition = {
  roles: readonly RendererRole[]
  entrypoints?: readonly RendererEntrypoint[]
  handle(
    input: unknown,
    event: Electron.IpcMainInvokeEvent,
    context: AuthorizationContext
  ): Promise<unknown> | unknown
  failure: unknown
}

function defineAcknowledgedCommand<TKey extends keyof CommandMap>(
  operationType: TKey,
  handle: (
    input: CommandMap[TKey],
    event: Electron.IpcMainInvokeEvent,
    context: AuthorizationContext
  ) => Promise<boolean | void> | boolean | void,
  missingError: 'not_found' | 'request_not_found',
  entrypoints: readonly RendererEntrypoint[]
) {
  return defineOperation<CommandMap[TKey], unknown>({
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
const maxIdempotencyEntries = 256

const operationOwner = (context: AuthorizationContext) => ({
  clientType: context.clientType,
  windowInstanceId: context.windowInstanceId
})

const operationCommandAcknowledgement = (accepted: boolean | void) =>
  accepted === false ? ({ ok: false, error: 'invalid_command' } as const) : ({ ok: true } as const)

type OperationRegistry = Record<string, OperationDefinition>
type ContractRegistry = Record<string, { input: z.ZodType; result: z.ZodType }>

function defineOperation<TInput, TResult>(definition: {
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

function defineCommand<TKey extends keyof CommandMap>(
  _operationType: TKey,
  definition: {
    roles: readonly RendererRole[]
    entrypoints?: readonly RendererEntrypoint[]
    handle(
      input: CommandMap[TKey],
      event: Electron.IpcMainInvokeEvent,
      context: AuthorizationContext
    ): Promise<CommandResult> | CommandResult
    failure: CommandResult
  }
) {
  return defineOperation(definition)
}

function defineQuery<TKey extends keyof QueryMap>(
  _operationType: TKey,
  definition: {
    roles: readonly RendererRole[]
    entrypoints?: readonly RendererEntrypoint[]
    handle(
      input: QueryMap[TKey],
      event: Electron.IpcMainInvokeEvent,
      context: AuthorizationContext
    ): Promise<QueryResultMap[TKey]> | QueryResultMap[TKey]
    failure: QueryResultMap[TKey]
  }
) {
  return defineOperation(definition)
}

export function createOperationRegistry(services: OperationServices) {
  const {
    accountMutations,
    accountOnboarding,
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
    createRendererPrincipal,
    requestTokenImage,
    resolveName
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
      if (oldest) idempotencyCache.delete(oldest)
    }

    return result
  }

  const commandRegistry = {
    'account.profile-move': defineCommand('account.profile-move', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(profiles.moveAccount(command, operationOwner(context)))
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'account.select': defineAcknowledgedCommand(
      'account.select',
      ({ accountId }) => accountMutations.select(accountId),
      'not_found',
      ['tray']
    ),
    'send.submit': defineCommand('send.submit', {
      roles: ['sidetray'],
      entrypoints: ['sidetray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(
          send.submit(command, createRendererPrincipal(context), operationOwner(context))
        )
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'trade.prepare': defineCommand('trade.prepare', {
      roles: ['sidetray'],
      entrypoints: ['sidetray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(
          trade.prepare(command, createRendererPrincipal(context), operationOwner(context))
        )
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'trade.submit': defineCommand('trade.submit', {
      roles: ['sidetray'],
      entrypoints: ['sidetray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(
          trade.submit(command, createRendererPrincipal(context), operationOwner(context))
        )
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'trade.release': defineCommand('trade.release', {
      roles: ['sidetray'],
      entrypoints: ['sidetray'],
      handle(_command, _event, context) {
        trade.release(operationOwner(context))
        return { ok: true }
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
      'not_found',
      ['tray']
    ),
    'profile.select': defineCommand('profile.select', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(profiles.select(command, operationOwner(context)))
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'profile.create': defineCommand('profile.create', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(profiles.create(command, operationOwner(context)))
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'profile.rename': defineCommand('profile.rename', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(profiles.rename(command, operationOwner(context)))
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'profile.delete': defineCommand('profile.delete', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(profiles.delete(command, operationOwner(context)))
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'security.configure': defineCommand('security.configure', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(security.configure(command, operationOwner(context)))
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'security.unlock': defineCommand('security.unlock', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(security.unlock(command, operationOwner(context)))
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'wallet.lock': defineCommand('wallet.lock', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(security.lock(command, operationOwner(context)))
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'network.primary-rpc-set': defineAcknowledgedCommand(
      'network.primary-rpc-set',
      ({ chainId, url }) => networks.setPrimaryRpc(chainId, url),
      'not_found',
      ['tray']
    ),
    'network.activation-set': defineAcknowledgedCommand(
      'network.activation-set',
      ({ chainId, enabled }) => networks.setActivation(chainId, enabled),
      'not_found',
      ['tray']
    ),
    'sidetray.open': defineAcknowledgedCommand(
      'sidetray.open',
      (command) => platform.openSideTray(command),
      'not_found',
      ['tray']
    ),
    'flash.order-cancel': defineAcknowledgedCommand(
      'flash.order-cancel',
      (command, _event, context) =>
        trade.cancel(command, createRendererPrincipal(context), operationOwner(context)),
      'not_found',
      ['tray']
    ),
    'account.reorder': defineAcknowledgedCommand(
      'account.reorder',
      ({ fromAccountId, toAccountId }) => accountMutations.reorder(fromAccountId, toAccountId),
      'not_found',
      ['tray']
    ),
    'account.rename': defineAcknowledgedCommand(
      'account.rename',
      ({ accountId, name }) => accountMutations.rename(accountId, name),
      'not_found',
      ['tray']
    ),
    'account.agent-access-set': defineAcknowledgedCommand(
      'account.agent-access-set',
      ({ accountId, enabled }) => agent.setAgentAccess(accountId, enabled),
      'not_found',
      ['tray']
    ),
    'account.agent-sessions-revoke': defineAcknowledgedCommand(
      'account.agent-sessions-revoke',
      ({ accountId }) => agent.revokeAgentSessions(accountId),
      'not_found',
      ['tray']
    ),
    'account.add-from-signer': defineCommand('account.add-from-signer', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(
          accountOnboarding.addFromSigner(command, operationOwner(context))
        )
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'account.watch-add': defineCommand('account.watch-add', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(accountOnboarding.addWatch(command, operationOwner(context)))
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'signer.import': defineCommand('signer.import', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(
          accountOnboarding.importSigner(command, operationOwner(context))
        )
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'signer.lattice-create': defineCommand('signer.lattice-create', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(
          accountOnboarding.createLattice(command, operationOwner(context))
        )
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'signer.disconnect': defineCommand('signer.disconnect', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(accountOnboarding.disconnect(command, operationOwner(context)))
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'signer.hardware-session-start': defineCommand('signer.hardware-session-start', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(
          accountOnboarding.startHardwareSession(command, operationOwner(context))
        )
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'signer.hardware-session-finish': defineCommand('signer.hardware-session-finish', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(
          accountOnboarding.finishHardwareSession(command, operationOwner(context))
        )
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'signer.ledger-accounts-load': defineCommand('signer.ledger-accounts-load', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(
          accountOnboarding.loadLedgerAccounts(command, operationOwner(context))
        )
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'portfolio.refresh': defineCommand('portfolio.refresh', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      async handle(command, _event, context) {
        return operationCommandAcknowledgement(
          await portfolio.refresh(command.operationId, operationOwner(context))
        )
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'settings.update': defineAcknowledgedCommand(
      'settings.update',
      (command) => settings.update(command),
      'not_found',
      ['tray']
    ),
    'wallet.reset': defineCommand('wallet.reset', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(security.reset(command, operationOwner(context)))
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'app.quit': defineAcknowledgedCommand('app.quit', () => platform.quitApp(), 'not_found', ['tray']),
    'permission.clear': defineAcknowledgedCommand(
      'permission.clear',
      ({ accountId, originId }) => accountMutations.clearPermission(accountId, originId),
      'not_found',
      ['tray']
    ),
    'network.request-resolve': defineAcknowledgedCommand(
      'network.request-resolve',
      (command) => requests.resolveNetwork(command),
      'request_not_found',
      ['tray']
    ),
    'notification.update': defineAcknowledgedCommand(
      'notification.update',
      ({ notificationId, action }) => platform.updateNotification(notificationId, action),
      'not_found',
      ['tray']
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
    'request.clear-origin': defineAcknowledgedCommand(
      'request.clear-origin',
      ({ accountId, originId }) => requests.clearOrigin(accountId, originId),
      'not_found',
      ['tray']
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
    'transaction.fee-update': defineAcknowledgedCommand(
      'transaction.fee-update',
      ({ requestId, field, value }) => requestEdits.updateTransactionFee(requestId, field, value),
      'request_not_found',
      ['tray']
    ),
    'transaction.fee-default-set': defineAcknowledgedCommand(
      'transaction.fee-default-set',
      ({ requestId, level }) => requestEdits.setTransactionFeeDefault(requestId, level),
      'request_not_found',
      ['tray']
    ),
    'transaction.nonce-adjust': defineAcknowledgedCommand(
      'transaction.nonce-adjust',
      ({ requestId, direction }) => requestEdits.adjustTransactionNonce(requestId, direction),
      'request_not_found',
      ['tray']
    ),
    'transaction.nonce-reset': defineAcknowledgedCommand(
      'transaction.nonce-reset',
      ({ requestId }) => requestEdits.resetTransactionNonce(requestId),
      'request_not_found',
      ['tray']
    ),
    'transaction.fee-notice-dismiss': defineAcknowledgedCommand(
      'transaction.fee-notice-dismiss',
      ({ requestId }) => requestEdits.dismissTransactionFeeNotice(requestId),
      'request_not_found',
      ['tray']
    ),
    'transaction.replace': defineAcknowledgedCommand(
      'transaction.replace',
      async (command, _event, context) => {
        const result = await executeIdempotent(
          command.type,
          `${command.requestId}:${command.idempotencyKey}`,
          command,
          () => requests.replaceTransaction(command, createRendererPrincipal(context))
        )
        if (result === IdempotencyConflict) throw IdempotencyConflict
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
    'panel.back': defineAcknowledgedCommand(
      'panel.back',
      ({ steps }) => platform.navigatePanelBack(steps),
      'not_found',
      ['tray']
    ),
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
    'extension.respond': defineAcknowledgedCommand(
      'extension.respond',
      ({ extensionId, approved }) => platform.respondToExtension(extensionId, approved),
      'not_found',
      ['tray']
    ),
    'updater.respond': defineAcknowledgedCommand(
      'updater.respond',
      ({ action }) => platform.respondToUpdater(action),
      'not_found',
      ['tray']
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
    'token.add': defineCommand('token.add', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(tokens.add(command, operationOwner(context)))
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
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
      ({ requestId }) => requests.approve(requestId),
      'request_not_found',
      ['tray']
    ),
    'request.warning-confirm': defineAcknowledgedCommand(
      'request.warning-confirm',
      ({ requestId, gate }) => requests.confirmWarning(requestId, gate),
      'request_not_found',
      ['tray']
    ),
    'network.remove': defineAcknowledgedCommand(
      'network.remove',
      ({ chainId }) => networks.remove(chainId),
      'not_found',
      ['tray']
    ),
    'signer.trezor-input': defineCommand('signer.trezor-input', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(
          accountOnboarding.submitTrezorInput(command, operationOwner(context))
        )
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'signer.lattice-pair': defineCommand('signer.lattice-pair', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(
          accountOnboarding.pairLattice(command, operationOwner(context))
        )
      },
      failure: { ok: false, error: 'operation_failed' }
    }),
    'account.remove': defineAcknowledgedCommand(
      'account.remove',
      ({ address, removeSeedSigner }) => accountMutations.remove(address, removeSeedSigner),
      'not_found',
      ['tray']
    ),
    'signer.reload': defineCommand('signer.reload', {
      roles: ['wallet-ui'],
      entrypoints: ['tray'],
      handle(command, _event, context) {
        return operationCommandAcknowledgement(accountOnboarding.reload(command, operationOwner(context)))
      },
      failure: { ok: false, error: 'operation_failed' }
    })
  } satisfies Record<keyof CommandMap, OperationDefinition>

  const queryRegistry = {
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
        const address = await resolveName(name)
        return address ? ({ ok: true, address } as const) : ({ ok: false, error: 'not_found' } as const)
      },
      failure: { ok: false, error: 'resolution_failed' }
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
      async handle({ accountId, password }: AccountPrivateKeyExportQuery) {
        const privateKey = await accountOnboarding.exportPrivateKey(accountId, password)
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

const OperationTypeSchema = z.looseObject({ type: z.string().max(128) })

function boundaryFailure(
  kind: 'command' | 'query',
  error: 'invalid_command' | 'invalid_query' | 'unauthorized'
) {
  return (kind === 'command' ? CommandResultSchema : QueryBoundaryFailureSchema).parse({
    ok: false,
    error
  })
}

async function dispatchOperation(
  kind: 'command' | 'query',
  event: Electron.IpcMainInvokeEvent,
  input: unknown,
  registry: OperationRegistry,
  contracts: ContractRegistry,
  authorizeRenderer: OperationServices['authorizeRenderer']
) {
  const context = authorizeRenderer(event)
  if (!context) {
    log.warn(`Rejected ${kind} from an unregistered or invalid renderer`)
    return boundaryFailure(kind, 'unauthorized')
  }

  const operationType = OperationTypeSchema.safeParse(input)
  const type = operationType.success ? operationType.data.type : undefined
  const operation = type ? registry[type] : undefined
  const contract = type ? contracts[type] : undefined
  if (!operation || !contract) {
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

  const parsed = contract.input.safeParse(input)
  if (!parsed.success) {
    log.warn(`Rejected invalid ${kind} payload`, {
      type,
      clientType: context.clientType
    })
    return boundaryFailure(kind, kind === 'command' ? 'invalid_command' : 'invalid_query')
  }

  try {
    const result = await operation.handle(parsed.data, event, context)
    const validated = contract.result.safeParse(result)
    if (validated.success) return validated.data

    log.error(`Invalid ${kind} result`, { type })
  } catch (error) {
    log.error(`Failed to execute ${kind}`, { type, error })
  }

  return operation.failure
}

export function createOperationDispatcher(services: OperationServices): OperationDispatcher {
  const { commandRegistry, queryRegistry } = createOperationRegistry(services)

  return {
    dispatchCommand: (event, command) =>
      dispatchOperation(
        'command',
        event,
        command,
        commandRegistry,
        commandContracts,
        services.authorizeRenderer
      ),
    dispatchQuery: (event, query) =>
      dispatchOperation('query', event, query, queryRegistry, queryContracts, services.authorizeRenderer)
  }
}

export function registerOperationHandlers(ipc: IpcMainHandlerPort, dispatcher: OperationDispatcher) {
  ipc.handle(ExecuteCommandChannel, dispatcher.dispatchCommand)
  ipc.handle(ExecuteQueryChannel, dispatcher.dispatchQuery)

  return () => {
    ipc.removeHandler(ExecuteCommandChannel)
    ipc.removeHandler(ExecuteQueryChannel)
  }
}
