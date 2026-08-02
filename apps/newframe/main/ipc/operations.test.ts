import { beforeEach, describe, expect, it, mock } from 'bun:test'

import { commandContracts, queryContracts } from '../../contracts/operations'
import { createOperationDispatcher, createOperationRegistry, type OperationServices } from './operations'

const fakes = (...names: string[]) =>
  Object.fromEntries(names.map((name) => [name, mock()])) as Record<string, ReturnType<typeof mock>>

const authorizeRenderer = mock()
const resolveName = mock()
const requestTokenImage = mock()
const accountMutations = fakes(
  'addressChainUsage',
  'clearPermission',
  'remove',
  'removeOrigin',
  'rename',
  'reorder',
  'select'
)
const accountOnboarding = fakes(
  'addFromSigner',
  'addWatch',
  'createLattice',
  'disconnect',
  'exportPrivateKey',
  'finishHardwareSession',
  'generateSeedPhrase',
  'importSigner',
  'loadLedgerAccounts',
  'locateKeystore',
  'pairLattice',
  'reload',
  'startHardwareSession',
  'submitTrezorInput'
)
const agent = fakes('resolveAgentAccessRequest', 'revokeAgentSessions', 'setAgentAccess')
const networks = fakes('remove', 'setActivation', 'setPrimaryRpc')
const portfolio = fakes('refresh')
const requestEdits = fakes(
  'adjustTransactionNonce',
  'dismissTransactionFeeNotice',
  'resetTransactionNonce',
  'setTransactionFeeDefault',
  'updateTokenApproval',
  'updateTransactionFee'
)
const requests = fakes(
  'approve',
  'clearOrigin',
  'confirmRequestApproval',
  'confirmWarning',
  'rejectRequest',
  'replaceTransaction',
  'resolveAccess',
  'resolveAgentAccess',
  'resolveNetwork',
  'resolveSwitchChain',
  'reviewAddChain',
  'reviewAddToken'
)
const platform = fakes(
  'closeSideTray',
  'consumeHomeCommand',
  'handleTrayMouseout',
  'inspectRenderer',
  'navigatePanelBack',
  'openExternal',
  'openRequestPanel',
  'openSideTray',
  'openTransactionExplorer',
  'quitApp',
  'respondToExtension',
  'respondToUpdater',
  'toggleWarning',
  'updateNotification',
  'writeClipboard'
)
const profiles = fakes('create', 'delete', 'moveAccount', 'movableAccounts', 'rename', 'select')
const security = fakes('configure', 'lock', 'reset', 'status', 'unlock')
const send = fakes('dispose', 'submit')
const settings = fakes('update')
const tokens = fakes('add', 'lookup', 'remove')
const trade = fakes('cancel', 'dispose', 'prepare', 'quote', 'release', 'submit')
const servicesWithMocks = [
  accountMutations,
  accountOnboarding,
  agent,
  networks,
  portfolio,
  requestEdits,
  requests,
  platform,
  profiles,
  security,
  send,
  settings,
  tokens,
  trade
]

const createRendererPrincipal = mock((context: typeof trayContext) => ({
  kind: 'renderer' as const,
  role: context.clientType,
  entrypoint: context.entrypoint,
  webContentsId: context.webContentsId,
  windowInstanceId: context.windowInstanceId
}))
const event = {} as Electron.IpcMainInvokeEvent
const trayContext = {
  clientType: 'wallet-ui' as const,
  entrypoint: 'tray' as const,
  webContentsId: 1,
  windowInstanceId: 'tray-test'
}
const sideTrayContext = {
  clientType: 'sidetray' as const,
  entrypoint: 'sidetray' as const,
  webContentsId: 2,
  windowInstanceId: 'side-tray-test'
}
const owner = { clientType: 'wallet-ui', windowInstanceId: 'tray-test' }

function createTestServices() {
  return {
    accounts: { current: mock(), get: mock() },
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
    settings,
    tokens,
    trade,
    authorizeRenderer,
    createRendererPrincipal,
    requestTokenImage,
    resolveName
  } as unknown as OperationServices
}

let dispatcher: ReturnType<typeof createOperationDispatcher>

beforeEach(() => {
  authorizeRenderer.mockReset()
  resolveName.mockReset()
  requestTokenImage.mockReset()
  createRendererPrincipal.mockClear()
  for (const service of servicesWithMocks) Object.values(service).forEach((fn) => fn.mockReset())
  dispatcher = createOperationDispatcher(createTestServices())
})

describe('typed operation dispatcher', () => {
  it('registers every portable contract in the separately-owned main registry', () => {
    const { commandRegistry, queryRegistry } = createOperationRegistry(createTestServices())
    expect(Object.keys(commandRegistry).sort()).toEqual(Object.keys(commandContracts).sort())
    expect(Object.keys(queryRegistry).sort()).toEqual(Object.keys(queryContracts).sort())
  })

  it('rejects unknown, unregistered, wrong-role, wrong-entrypoint, and non-strict inputs', async () => {
    authorizeRenderer.mockReturnValue(undefined)
    await expect(
      dispatcher.dispatchQuery(event, { type: 'name.resolve', name: 'alice.eth' })
    ).resolves.toEqual({
      ok: false,
      error: 'unauthorized'
    })

    authorizeRenderer.mockReturnValue(sideTrayContext)
    for (const input of [
      { type: 'account.select', accountId: 'account-1' },
      { type: 'security.unlock', operationId: 'unlock', method: 'native' },
      { type: 'request.reject', requestId: 'request-1' }
    ]) {
      await expect(dispatcher.dispatchCommand(event, input)).resolves.toEqual({
        ok: false,
        error: 'unauthorized'
      })
    }

    authorizeRenderer.mockReturnValue(trayContext)
    for (const input of [
      { type: 'sidetray.close' },
      { type: 'account.select', accountId: '', injected: true },
      { type: 'request.reject', requestId: 'request-1', request: {} },
      { type: 'x'.repeat(129) },
      { type: 'transaction.submit', method: 'eth_sign', originId: 'attacker' }
    ]) {
      await expect(dispatcher.dispatchCommand(event, input)).resolves.toEqual({
        ok: false,
        error: input.type === 'sidetray.close' ? 'unauthorized' : 'invalid_command'
      })
    }
  })

  it('conforms uniform tray acknowledgements and preserves representative service arguments', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    const address = '0x1111111111111111111111111111111111111111'
    const commands = [
      { type: 'account.select', accountId: 'account-1' },
      { type: 'home.command-consume', commandId: 1 },
      { type: 'network.activation-set', chainId: 1, enabled: true },
      { type: 'sidetray.open', feature: 'trade', chainId: 1 },
      {
        type: 'account.reorder',
        fromAccountId: address,
        toAccountId: '0x2222222222222222222222222222222222222222'
      },
      { type: 'account.rename', accountId: address, name: 'Primary' },
      { type: 'account.agent-access-set', accountId: address, enabled: true },
      { type: 'account.agent-sessions-revoke', accountId: address },
      { type: 'settings.update', setting: 'show-testnets', value: true },
      { type: 'app.quit' },
      { type: 'permission.clear', accountId: address },
      { type: 'network.request-resolve', approved: true, requestId: 'request-1' },
      { type: 'notification.update', notificationId: 'notice-1', action: 'dismiss' },
      { type: 'request.reject', requestId: 'request-1' },
      { type: 'request.access-resolve', requestId: 'request-1', approved: true },
      { type: 'request.agent-access-resolve', requestId: 'request-1', approved: true },
      { type: 'request.switch-chain-resolve', requestId: 'request-1', approved: true },
      { type: 'request.clear-origin', accountId: address, originId: 'origin-1' },
      { type: 'request.approval-confirm', requestId: 'request-1', approvalType: 'approveGasLimit' },
      { type: 'transaction.fee-update', requestId: 'request-1', field: 'gasLimit', value: '0x1' },
      { type: 'transaction.fee-default-set', requestId: 'request-1', level: 'standard' },
      { type: 'transaction.nonce-adjust', requestId: 'request-1', direction: 1 },
      { type: 'transaction.nonce-reset', requestId: 'request-1' },
      { type: 'transaction.fee-notice-dismiss', requestId: 'request-1' },
      { type: 'panel.request-open', requestId: 'request-1' },
      { type: 'panel.back', steps: 2 },
      { type: 'request.add-token-review', requestId: 'request-1' },
      { type: 'request.add-chain-review', requestId: 'request-1' },
      { type: 'extension.respond', extensionId: 'moz-extension://trusted', approved: true },
      { type: 'updater.respond', action: 'later' },
      { type: 'tray.mouseout' },
      { type: 'clipboard.write', text: 'copy' },
      { type: 'explorer.open', chainId: 1 },
      { type: 'token.remove', address, chainId: 1 },
      { type: 'origin.remove', originId: 'origin-1' },
      { type: 'warning.toggle', warning: 'gas-fee' },
      { type: 'network.remove', chainId: 1 },
      { type: 'account.remove', address }
    ]
    for (const command of commands) {
      await expect(dispatcher.dispatchCommand(event, command)).resolves.toEqual({ ok: true })
    }
    expect(platform.openTransactionExplorer).toHaveBeenCalledWith(1, undefined)
    expect(requestEdits.updateTransactionFee).toHaveBeenCalledWith('request-1', 'gasLimit', '0x1')
    expect(accountMutations.clearPermission).toHaveBeenCalledWith(address, undefined)

    accountMutations.select.mockReturnValueOnce(false)
    await expect(
      dispatcher.dispatchCommand(event, { type: 'account.select', accountId: 'missing' })
    ).resolves.toEqual({ ok: false, error: 'not_found' })
    requests.rejectRequest.mockReturnValueOnce(false)
    await expect(
      dispatcher.dispatchCommand(event, { type: 'request.reject', requestId: 'missing' })
    ).resolves.toEqual({ ok: false, error: 'request_not_found' })
  })

  it('keeps profiles explicit, canonicalizes their input, and validates projected query output', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    await expect(
      dispatcher.dispatchCommand(event, {
        type: 'profile.create',
        operationId: 'create-profile',
        name: '  Work  ',
        accountIds: ['account-1']
      })
    ).resolves.toEqual({ ok: true })
    expect(profiles.create).toHaveBeenCalledWith(
      { type: 'profile.create', operationId: 'create-profile', name: 'Work', accountIds: ['account-1'] },
      owner
    )

    profiles.movableAccounts.mockReturnValue({
      ok: true,
      accounts: [{ id: 'one', address: '0x1', name: 'One', profileId: 'default', signer: 'secret' }]
    })
    await expect(dispatcher.dispatchQuery(event, { type: 'profile.movable-accounts' })).resolves.toEqual({
      ok: false,
      error: 'operation_failed'
    })

    profiles.create.mockImplementationOnce(() => {
      throw new Error('failed')
    })
    await expect(
      dispatcher.dispatchCommand(event, { type: 'profile.create', operationId: 'fail', name: 'Work' })
    ).resolves.toEqual({ ok: false, error: 'operation_failed' })
  })

  it('keeps Send and Trade main-owned and bound to side-tray identity', async () => {
    authorizeRenderer.mockReturnValue(sideTrayContext)
    const sendCommand = {
      type: 'send.submit' as const,
      operationId: 'send-operation',
      asset: { address: '0x0000000000000000000000000000000000000000', chainId: 1 },
      amount: '1',
      recipient: 'alice.eth'
    }
    await expect(dispatcher.dispatchCommand(event, sendCommand)).resolves.toEqual({ ok: true })
    expect(send.submit).toHaveBeenCalledWith(
      sendCommand,
      expect.objectContaining({ kind: 'renderer', windowInstanceId: 'side-tray-test' }),
      { clientType: 'sidetray', windowInstanceId: 'side-tray-test' }
    )

    await expect(
      dispatcher.dispatchCommand(event, {
        type: 'trade.prepare',
        operationId: 'trade-operation',
        quoteId: 'quote-1',
        action: 'approve'
      })
    ).resolves.toEqual({ ok: true })
    await expect(dispatcher.dispatchCommand(event, { type: 'trade.release' })).resolves.toEqual({ ok: true })
    expect(trade.release).toHaveBeenCalledWith({
      clientType: 'sidetray',
      windowInstanceId: 'side-tray-test'
    })

    authorizeRenderer.mockReturnValue(trayContext)
    await expect(
      dispatcher.dispatchCommand(event, {
        type: 'flash.order-cancel',
        operationId: 'cancel-operation',
        orderId: 'order-1'
      })
    ).resolves.toEqual({ ok: true })
    expect(trade.cancel).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-1' }),
      expect.objectContaining({ kind: 'renderer' }),
      owner
    )
  })

  it('keeps Security and onboarding commands explicit with owner-scoped validated inputs', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    for (const command of [
      { type: 'security.configure', operationId: 'configure', mode: 'disabled' },
      { type: 'security.unlock', operationId: 'unlock', method: 'native' },
      { type: 'wallet.lock', operationId: 'lock' },
      { type: 'wallet.reset', operationId: 'reset', scope: 'saved-data' },
      {
        type: 'signer.ledger-accounts-load',
        operationId: 'ledger',
        signerId: 'ledger-1',
        accountCount: 25
      },
      { type: 'signer.reload', operationId: 'reload', signerId: 'ledger-1' }
    ]) {
      await expect(dispatcher.dispatchCommand(event, command)).resolves.toEqual({ ok: true })
    }
    expect(accountOnboarding.loadLedgerAccounts).toHaveBeenCalledWith(
      expect.objectContaining({ accountCount: 25 }),
      owner
    )
    await expect(
      dispatcher.dispatchCommand(event, {
        type: 'security.unlock',
        operationId: 'bad',
        method: 'webauthn',
        secret: 'not-hex'
      })
    ).resolves.toEqual({ ok: false, error: 'invalid_command' })
  })

  it('keeps secret-bearing queries tray-only with typed success and failure results', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    accountOnboarding.locateKeystore.mockResolvedValue({ version: 3 })
    const accountId = '0x1111111111111111111111111111111111111111'
    const privateKey = `0x${'12'.repeat(32)}`
    accountOnboarding.exportPrivateKey.mockResolvedValue(privateKey)
    accountOnboarding.generateSeedPhrase.mockResolvedValue('one two three')
    await expect(dispatcher.dispatchQuery(event, { type: 'keystore.locate' })).resolves.toEqual({
      ok: true,
      keystore: { version: 3 }
    })
    await expect(
      dispatcher.dispatchQuery(event, {
        type: 'account.private-key-export',
        accountId,
        password: 'secret'
      })
    ).resolves.toEqual({ ok: true, privateKey })
    await expect(dispatcher.dispatchQuery(event, { type: 'seed.generate' })).resolves.toEqual({
      ok: true,
      phrase: 'one two three'
    })

    accountOnboarding.exportPrivateKey.mockResolvedValueOnce(undefined)
    await expect(
      dispatcher.dispatchQuery(event, {
        type: 'account.private-key-export',
        accountId,
        password: 'secret'
      })
    ).resolves.toEqual({ ok: false, error: 'account_not_found', message: 'Account was not found.' })
  })

  it('authorizes each public query independently and validates service results', async () => {
    const address = '0x1111111111111111111111111111111111111111'
    authorizeRenderer.mockReturnValue(sideTrayContext)
    resolveName.mockResolvedValue(address)
    await expect(
      dispatcher.dispatchQuery(event, { type: 'name.resolve', name: 'alice.eth' })
    ).resolves.toEqual({ ok: true, address })
    await expect(
      dispatcher.dispatchQuery(event, { type: 'token.lookup', address, chainId: 1 })
    ).resolves.toEqual({ ok: false, error: 'unauthorized' })

    authorizeRenderer.mockReturnValue(trayContext)
    tokens.lookup.mockResolvedValue({ decimals: 18, name: 'Token', symbol: 'TKN', totalSupply: '100' })
    accountMutations.addressChainUsage.mockResolvedValue([{ address, chainIds: [1, 10], complete: true }])
    await expect(
      dispatcher.dispatchQuery(event, { type: 'token.lookup', address, chainId: 1 })
    ).resolves.toEqual({
      ok: true,
      token: { decimals: 18, name: 'Token', symbol: 'TKN', totalSupply: '100' }
    })
    await expect(
      dispatcher.dispatchQuery(event, { type: 'address.chain-usage', addresses: [address] })
    ).resolves.toEqual({ ok: true, usage: [{ address, chainIds: [1, 10], complete: true }] })

    resolveName.mockRejectedValueOnce(new Error('offline'))
    await expect(
      dispatcher.dispatchQuery(event, { type: 'name.resolve', name: 'alice.eth' })
    ).resolves.toEqual({ ok: false, error: 'resolution_failed' })
  })

  it('binds close/context-menu effects to the invoking event', async () => {
    authorizeRenderer.mockReturnValue(sideTrayContext)
    await expect(dispatcher.dispatchCommand(event, { type: 'sidetray.close' })).resolves.toEqual({ ok: true })
    await expect(
      dispatcher.dispatchCommand(event, { type: 'renderer.context-menu', x: 12, y: 34 })
    ).resolves.toEqual({ ok: true })
    expect(platform.closeSideTray).toHaveBeenCalledWith(event)
    expect(platform.inspectRenderer).toHaveBeenCalledWith(event, 12, 34)
  })

  it('deduplicates replacements, rejects key reuse, and leaves request approvals service-idempotent', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    requests.replaceTransaction.mockReturnValue(true)
    const command = {
      type: 'transaction.replace' as const,
      requestId: 'request-1',
      replacement: 'speed' as const,
      idempotencyKey: '00000000-0000-4000-8000-000000000100'
    }
    await expect(
      Promise.all([dispatcher.dispatchCommand(event, command), dispatcher.dispatchCommand(event, command)])
    ).resolves.toEqual([{ ok: true }, { ok: true }])
    expect(requests.replaceTransaction).toHaveBeenCalledTimes(1)
    await expect(
      dispatcher.dispatchCommand(event, { ...command, replacement: 'cancel' as const })
    ).resolves.toEqual({
      ok: false,
      error: 'invalid_command',
      message: 'Idempotency key was reused.'
    })

    const approve = { type: 'request.approve' as const, requestId: 'request-1' }
    await Promise.all([
      dispatcher.dispatchCommand(event, approve),
      dispatcher.dispatchCommand(event, approve)
    ])
    expect(requests.approve).toHaveBeenCalledTimes(2)
  })
})
