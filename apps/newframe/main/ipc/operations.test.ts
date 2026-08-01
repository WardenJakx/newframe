import { beforeEach, describe, expect, it, mock } from 'bun:test'

import { commandContracts, queryContracts } from '../../contracts/operations'
import { createOperationDispatcher, createOperationRegistry, type OperationServices } from './operations'

const authorizeRenderer = mock()
const getAccount = mock()
const getCurrentAccount = mock()
const resolveName = mock()
const submitCurrentAccountTransaction = mock()
const signCurrentAccountTypedData = mock()
const quoteFlashForCurrentAccount = mock()
const submitFlashForCurrentAccount = mock()
const requestTokenImage = mock()
const accountMutations = {
  addressChainUsage: mock(),
  clearPermission: mock(),
  remove: mock(),
  removeOrigin: mock(),
  rename: mock(),
  reorder: mock(),
  select: mock()
}
const agent = {
  resolveAgentAccessRequest: mock(),
  revokeAgentSessions: mock(),
  setAgentAccess: mock()
}
const networks = { remove: mock(), setActivation: mock(), setPrimaryRpc: mock() }
const portfolio = { refresh: mock() }
const requestEdits = {
  adjustTransactionNonce: mock(),
  dismissTransactionFeeNotice: mock(),
  resetTransactionNonce: mock(),
  setTransactionFeeDefault: mock(),
  updateTokenApproval: mock(),
  updateTransactionFee: mock()
}
const requests = {
  approve: mock(),
  clearOrigin: mock(),
  confirmRequestApproval: mock(),
  confirmWarning: mock(),
  rejectRequest: mock(),
  replaceTransaction: mock(),
  resolveAccess: mock(),
  resolveAgentAccess: mock(),
  resolveNetwork: mock(),
  resolveSwitchChain: mock(),
  reviewAddChain: mock(),
  reviewAddToken: mock()
}
const tokens = { add: mock(), lookup: mock(), remove: mock() }
const platform = {
  closeSideTray: mock(),
  consumeHomeCommand: mock(),
  handleTrayMouseout: mock(),
  inspectRenderer: mock(),
  navigatePanelBack: mock(),
  openExternal: mock(),
  openRequestPanel: mock(),
  openSideTray: mock(),
  openTransactionExplorer: mock(),
  quitApp: mock(),
  respondToExtension: mock(),
  respondToUpdater: mock(),
  toggleWarning: mock(),
  updateNotification: mock(),
  writeClipboard: mock()
}
const settings = { update: mock() }
const profiles = {
  create: mock(),
  delete: mock(),
  moveAccount: mock(),
  movableAccounts: mock(),
  rename: mock(),
  select: mock()
}
const security = {
  configure: mock(),
  lock: mock(),
  reset: mock(),
  status: mock(),
  unlock: mock()
}
const accountOnboarding = {
  addFromSigner: mock(),
  addWatch: mock(),
  createLattice: mock(),
  disconnect: mock(),
  exportPrivateKey: mock(),
  finishHardwareSession: mock(),
  importSigner: mock(),
  generateSeedPhrase: mock(),
  loadLedgerAccounts: mock(),
  locateKeystore: mock(),
  pairLattice: mock(),
  reload: mock(),
  startHardwareSession: mock(),
  submitTrezorInput: mock()
}
const send = { dispose: mock(), submit: mock() }
const trade = {
  cancel: mock(),
  dispose: mock(),
  prepare: mock(),
  quote: mock(),
  release: mock(),
  submit: mock()
}
const createRendererPrincipal = mock(
  (context: {
    clientType: 'wallet-ui' | 'sidetray'
    entrypoint: 'tray' | 'sidetray'
    webContentsId: number
    windowInstanceId: string
  }) => ({
    kind: 'renderer' as const,
    role: context.clientType,
    entrypoint: context.entrypoint,
    webContentsId: context.webContentsId,
    windowInstanceId: context.windowInstanceId
  })
)

let dispatchCommand: ReturnType<typeof createOperationDispatcher>['dispatchCommand']
let dispatchQuery: ReturnType<typeof createOperationDispatcher>['dispatchQuery']
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
const transactionIdempotencyKey = '00000000-0000-4000-8000-000000000001'

function createTestServices() {
  return {
    accounts: { current: getCurrentAccount, get: getAccount },
    accountOnboarding,
    accountMutations,
    agent,
    networks,
    portfolio,
    platform,
    profiles,
    requestEdits,
    requests,
    send,
    trade,
    security,
    settings,
    tokens,
    authorizeRenderer,
    createRendererPrincipal,
    requestTokenImage,
    quoteFlashForCurrentAccount,
    signCurrentAccountTypedData,
    submitCurrentAccountTransaction,
    submitFlashForCurrentAccount,
    resolveName
  } as unknown as OperationServices
}

function createTestDispatcher() {
  return createOperationDispatcher(createTestServices())
}

beforeEach(() => {
  authorizeRenderer.mockReset()
  getAccount.mockReset()
  getCurrentAccount.mockReset()
  getCurrentAccount.mockReturnValue({ id: 'account-1' })
  resolveName.mockReset()
  submitCurrentAccountTransaction.mockReset()
  signCurrentAccountTypedData.mockReset()
  quoteFlashForCurrentAccount.mockReset()
  submitFlashForCurrentAccount.mockReset()
  Object.values(platform).forEach((operation) => operation.mockReset())
  settings.update.mockReset()
  requestTokenImage.mockReset()
  Object.values(accountMutations).forEach((operation) => operation.mockReset())
  Object.values(accountOnboarding).forEach((operation) => operation.mockReset())
  Object.values(send).forEach((operation) => operation.mockReset())
  Object.values(trade).forEach((operation) => operation.mockReset())
  Object.values(agent).forEach((operation) => operation.mockReset())
  Object.values(networks).forEach((operation) => operation.mockReset())
  Object.values(portfolio).forEach((operation) => operation.mockReset())
  Object.values(requestEdits).forEach((operation) => operation.mockReset())
  Object.values(security).forEach((operation) => operation.mockReset())
  Object.values(tokens).forEach((operation) => operation.mockReset())
  createRendererPrincipal.mockClear()
  Object.values(profiles).forEach((profileOperation) => profileOperation.mockReset())

  const dispatcher = createTestDispatcher()
  dispatchCommand = dispatcher.dispatchCommand
  dispatchQuery = dispatcher.dispatchQuery
})

describe('typed operation dispatcher', () => {
  it('registers the canonical operation keys and authorizes profiles only for the wallet tray', async () => {
    const { commandRegistry, queryRegistry } = createOperationRegistry(createTestServices())

    expect(Object.keys(commandRegistry).sort()).toEqual(Object.keys(commandContracts).sort())
    expect(Object.keys(queryRegistry).sort()).toEqual(Object.keys(queryContracts).sort())

    profiles.movableAccounts.mockReturnValue({ ok: true, accounts: [] })

    authorizeRenderer.mockReturnValue(sideTrayContext)
    await expect(
      dispatchCommand(event, {
        type: 'profile.select',
        operationId: 'select-profile',
        profileId: 'profile-1'
      })
    ).resolves.toEqual({ ok: false, error: 'unauthorized' })
    await expect(dispatchQuery(event, { type: 'profile.movable-accounts' })).resolves.toEqual({
      ok: false,
      error: 'unauthorized'
    })

    authorizeRenderer.mockReturnValue(trayContext)
    await expect(
      dispatchCommand(event, {
        type: 'profile.select',
        operationId: 'select-profile',
        profileId: 'profile-1'
      })
    ).resolves.toEqual({ ok: true })
    expect(profiles.select.mock.calls.at(-1)).toEqual([
      { type: 'profile.select', operationId: 'select-profile', profileId: 'profile-1' },
      { clientType: 'wallet-ui', windowInstanceId: 'tray-test' }
    ])
    profiles.select.mockReturnValueOnce(false)
    await expect(
      dispatchCommand(event, {
        type: 'profile.select',
        operationId: 'colliding-profile-operation',
        profileId: 'profile-1'
      })
    ).resolves.toEqual({ ok: false, error: 'invalid_command' })
    await expect(dispatchQuery(event, { type: 'profile.movable-accounts' })).resolves.toEqual({
      ok: true,
      accounts: []
    })
  })

  it('validates and trims bounded profile commands before invoking the profile service', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    await expect(
      dispatchCommand(event, {
        type: 'profile.create',
        operationId: 'create-profile',
        name: '  Work  ',
        accountIds: ['account-1']
      })
    ).resolves.toEqual({ ok: true })
    expect(profiles.create).toHaveBeenCalledWith(
      {
        type: 'profile.create',
        operationId: 'create-profile',
        name: 'Work',
        accountIds: ['account-1']
      },
      { clientType: 'wallet-ui', windowInstanceId: 'tray-test' }
    )

    await expect(
      dispatchCommand(event, {
        type: 'profile.rename',
        operationId: 'rename-profile',
        profileId: 'created',
        name: 'x'.repeat(51)
      })
    ).resolves.toEqual({ ok: false, error: 'invalid_command' })
    await expect(
      dispatchCommand(event, {
        type: 'profile.create',
        operationId: 'duplicate-accounts',
        name: 'Duplicate IDs',
        accountIds: ['account-1', 'account-1']
      })
    ).resolves.toEqual({ ok: false, error: 'invalid_command' })
    expect(profiles.rename).not.toHaveBeenCalled()
  })

  it('returns generic acknowledgements and minimum movable Account records', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    profiles.movableAccounts.mockReturnValue({
      ok: true,
      accounts: [
        {
          id: 'account-1',
          address: '0x1111111111111111111111111111111111111111',
          name: 'Account 1',
          profileId: 'profile-1'
        }
      ]
    })

    await expect(
      dispatchCommand(event, {
        type: 'account.profile-move',
        operationId: 'move-account',
        accountId: 'account-1',
        profileId: 'profile-1'
      })
    ).resolves.toEqual({ ok: true })
    await expect(
      dispatchCommand(event, {
        type: 'profile.delete',
        operationId: 'delete-profile',
        profileId: 'profile-1'
      })
    ).resolves.toEqual({ ok: true })
    await expect(dispatchQuery(event, { type: 'profile.movable-accounts' })).resolves.toEqual({
      ok: true,
      accounts: [
        {
          id: 'account-1',
          address: '0x1111111111111111111111111111111111111111',
          name: 'Account 1',
          profileId: 'profile-1'
        }
      ]
    })

    profiles.movableAccounts.mockReturnValue({
      ok: true,
      accounts: [
        {
          id: 'account-1',
          address: '0x1111111111111111111111111111111111111111',
          name: 'Account 1',
          profileId: 'profile-1',
          signer: 'must-not-cross-the-boundary'
        }
      ]
    })
    await expect(dispatchQuery(event, { type: 'profile.movable-accounts' })).resolves.toEqual({
      ok: false,
      error: 'operation_failed'
    })
  })

  it('maps unexpected profile service failures to a typed boundary failure', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    profiles.create.mockImplementationOnce(() => {
      throw new Error('failed')
    })

    await expect(
      dispatchCommand(event, { type: 'profile.create', operationId: 'create-profile', name: 'Work' })
    ).resolves.toEqual({ ok: false, error: 'operation_failed' })
  })

  it('rejects calls that do not have a validated renderer registration', async () => {
    authorizeRenderer.mockReturnValue(undefined)

    await expect(dispatchQuery(event, { type: 'name.resolve', name: 'alice.eth' })).resolves.toEqual({
      ok: false,
      error: 'unauthorized'
    })
    expect(resolveName).not.toHaveBeenCalled()
  })

  it('does not authorize the side tray to select the wallet account', async () => {
    authorizeRenderer.mockReturnValue(sideTrayContext)

    await expect(dispatchCommand(event, { type: 'account.select', accountId: '0xabc' })).resolves.toEqual({
      ok: false,
      error: 'unauthorized'
    })
    expect(getAccount).not.toHaveBeenCalled()
    expect(accountMutations.select).not.toHaveBeenCalled()
  })

  it('validates command payloads before invoking a handler', async () => {
    authorizeRenderer.mockReturnValue(trayContext)

    await expect(
      dispatchCommand(event, { type: 'account.select', accountId: '', injected: true })
    ).resolves.toEqual({ ok: false, error: 'invalid_command' })
    expect(accountMutations.select).not.toHaveBeenCalled()
  })

  it('selects an existing account for wallet renderers', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    accountMutations.select.mockResolvedValue(true)

    await expect(dispatchCommand(event, { type: 'account.select', accountId: '0xabc' })).resolves.toEqual({
      ok: true
    })
    expect(accountMutations.select).toHaveBeenCalledWith('0xabc')
  })

  it('lets either trusted renderer request bounded main-process token image hydration', async () => {
    const command = {
      type: 'token.image-hydrate' as const,
      tokenId: '1:0x1111111111111111111111111111111111111111'
    }

    authorizeRenderer.mockReturnValue(trayContext)
    await expect(dispatchCommand(event, command)).resolves.toEqual({ ok: true })
    authorizeRenderer.mockReturnValue(sideTrayContext)
    await expect(dispatchCommand(event, command)).resolves.toEqual({ ok: true })

    expect(requestTokenImage).toHaveBeenCalledTimes(2)
    expect(requestTokenImage).toHaveBeenCalledWith(command.tokenId)
  })

  it('returns a generic missing acknowledgement without exposing account selection domain data', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    accountMutations.select.mockResolvedValue(false)

    await expect(dispatchCommand(event, { type: 'account.select', accountId: 'missing' })).resolves.toEqual({
      ok: false,
      error: 'not_found'
    })
    expect(accountMutations.select).toHaveBeenCalledWith('missing')
  })

  it('allows the side tray to resolve names without granting unrelated state-changing privileges', async () => {
    authorizeRenderer.mockReturnValue(sideTrayContext)
    resolveName.mockResolvedValue('0x1111111111111111111111111111111111111111')

    await expect(dispatchQuery(event, { type: 'name.resolve', name: 'alice.eth' })).resolves.toEqual({
      ok: true,
      address: '0x1111111111111111111111111111111111111111'
    })
  })

  it('maps unresolved names and lookup failures to typed results', async () => {
    authorizeRenderer.mockReturnValue(sideTrayContext)
    resolveName.mockResolvedValueOnce('')

    await expect(dispatchQuery(event, { type: 'name.resolve', name: 'nobody.eth' })).resolves.toEqual({
      ok: false,
      error: 'not_found'
    })

    resolveName.mockRejectedValueOnce(new Error('offline'))
    await expect(dispatchQuery(event, { type: 'name.resolve', name: 'alice.eth' })).resolves.toEqual({
      ok: false,
      error: 'resolution_failed'
    })
  })

  it('treats the native keystore picker as a typed query', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    accountOnboarding.locateKeystore.mockResolvedValue({ version: 3 })

    await expect(dispatchQuery(event, { type: 'keystore.locate' })).resolves.toEqual({
      ok: true,
      keystore: { version: 3 }
    })
    await expect(dispatchCommand(event, { type: 'keystore.locate' })).resolves.toEqual({
      ok: false,
      error: 'invalid_command'
    })
    expect(accountOnboarding.locateKeystore).toHaveBeenCalledTimes(1)
  })

  it('does not expose renderer-controlled provider initialization', async () => {
    authorizeRenderer.mockReturnValue(sideTrayContext)

    await expect(
      dispatchCommand(event, { type: 'sidetray.initialize', feature: 'send', chainId: 1 })
    ).resolves.toEqual({ ok: false, error: 'invalid_command' })
  })

  it('opens the side tray from the tray renderer', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    platform.openSideTray.mockReturnValue(true)

    await expect(
      dispatchCommand(event, { type: 'sidetray.open', feature: 'trade', chainId: 1 })
    ).resolves.toEqual({ ok: true })
    expect(platform.openSideTray).toHaveBeenCalledWith({
      type: 'sidetray.open',
      feature: 'trade',
      chainId: 1
    })
  })

  it('rejects renderer-controlled provider methods, origins, and sender addresses', async () => {
    authorizeRenderer.mockReturnValue(sideTrayContext)

    await expect(
      dispatchCommand(event, {
        type: 'transaction.submit',
        idempotencyKey: transactionIdempotencyKey,
        chainId: 1,
        method: 'eth_sign',
        originId: 'attacker',
        transaction: {
          from: '0x2222222222222222222222222222222222222222',
          to: '0x1111111111111111111111111111111111111111',
          value: '0x1'
        }
      })
    ).resolves.toEqual({ ok: false, error: 'invalid_command' })
    expect(submitCurrentAccountTransaction).not.toHaveBeenCalled()
  })

  it('routes send through the main-owned operation service', async () => {
    authorizeRenderer.mockReturnValue(sideTrayContext)
    send.submit.mockReturnValue(true)
    const sendCommand = {
      type: 'send.submit' as const,
      operationId: 'send-operation',
      asset: { address: '0x0000000000000000000000000000000000000000', chainId: 1 },
      amount: '1',
      recipient: 'alice.eth'
    }
    await expect(dispatchCommand(event, sendCommand)).resolves.toEqual({ ok: true })
    expect(send.submit.mock.calls.at(-1)).toEqual([
      sendCommand,
      expect.objectContaining({ kind: 'renderer', windowInstanceId: sideTrayContext.windowInstanceId }),
      { clientType: 'sidetray', windowInstanceId: sideTrayContext.windowInstanceId }
    ])

    trade.prepare.mockReturnValue(true)
    const prepareCommand = {
      type: 'trade.prepare' as const,
      operationId: 'trade-operation',
      quoteId: 'quote-1',
      action: 'approve' as const
    }
    await expect(dispatchCommand(event, prepareCommand)).resolves.toEqual({ ok: true })
    expect(trade.prepare.mock.calls.at(-1)).toEqual([
      prepareCommand,
      expect.objectContaining({ kind: 'renderer', windowInstanceId: sideTrayContext.windowInstanceId }),
      { clientType: 'sidetray', windowInstanceId: sideTrayContext.windowInstanceId }
    ])

    await expect(dispatchCommand(event, { type: 'trade.release' })).resolves.toEqual({ ok: true })
    expect(trade.release).toHaveBeenCalledWith({
      clientType: 'sidetray',
      windowInstanceId: sideTrayContext.windowInstanceId
    })

    authorizeRenderer.mockReturnValue(trayContext)
    trade.cancel.mockReturnValue(true)
    const cancelCommand = {
      type: 'flash.order-cancel' as const,
      operationId: 'cancel-operation',
      orderId: 'order-1'
    }
    await expect(dispatchCommand(event, cancelCommand)).resolves.toEqual({ ok: true })
    expect(trade.cancel.mock.calls.at(-1)).toEqual([
      cancelCommand,
      expect.objectContaining({ kind: 'renderer', windowInstanceId: trayContext.windowInstanceId }),
      { clientType: 'wallet-ui', windowInstanceId: trayContext.windowInstanceId }
    ])
  })

  it('routes validated tray security capabilities', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    security.status.mockReturnValue({
      locked: false,
      vaultExists: true,
      biometricUnlockEnabled: true,
      biometricAvailable: true,
      biometrics: {
        enabled: true,
        method: 'native',
        nativeAvailable: true
      }
    })

    await expect(
      dispatchCommand(event, {
        type: 'security.configure',
        operationId: 'disable-biometrics',
        mode: 'disabled'
      })
    ).resolves.toEqual({ ok: true })
    await expect(dispatchQuery(event, { type: 'security.status' })).resolves.toEqual({
      ok: true,
      locked: false,
      vaultExists: true,
      biometricUnlockEnabled: true,
      biometricAvailable: true,
      biometrics: {
        enabled: true,
        method: 'native',
        nativeAvailable: true
      }
    })
    expect(security.configure.mock.calls.at(-1)).toEqual([
      { type: 'security.configure', operationId: 'disable-biometrics', mode: 'disabled' },
      { clientType: 'wallet-ui', windowInstanceId: 'tray-test' }
    ])
  })

  it('passes only validated identifiers to focused services', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    portfolio.refresh.mockResolvedValue(true)
    tokens.add.mockReturnValue(true)
    tokens.remove.mockReturnValue(true)
    accountOnboarding.loadLedgerAccounts.mockReturnValue(true)

    await expect(
      dispatchCommand(event, {
        type: 'token.remove',
        address: '0x1111111111111111111111111111111111111111',
        chainId: 1
      })
    ).resolves.toEqual({ ok: true })
    expect(tokens.remove).toHaveBeenCalledWith({
      address: '0x1111111111111111111111111111111111111111',
      chainId: 1
    })

    const tokenAddCommand = {
      type: 'token.add' as const,
      operationId: 'add-token',
      token: {
        address: '0x2222222222222222222222222222222222222222',
        chainId: 99,
        decimals: 18,
        logoURI: '',
        name: 'Token',
        symbol: 'TKN'
      }
    }
    await expect(dispatchCommand(event, tokenAddCommand)).resolves.toEqual({ ok: true })
    expect(tokens.add.mock.calls.at(-1)).toEqual([
      tokenAddCommand,
      { clientType: 'wallet-ui', windowInstanceId: 'tray-test' }
    ])

    await expect(
      dispatchCommand(event, { type: 'portfolio.refresh', operationId: 'refresh-portfolio' })
    ).resolves.toEqual({ ok: true })
    expect(portfolio.refresh.mock.calls.at(-1)).toEqual([
      'refresh-portfolio',
      { clientType: 'wallet-ui', windowInstanceId: 'tray-test' }
    ])

    await expect(
      dispatchCommand(event, {
        type: 'signer.ledger-accounts-load',
        operationId: 'load-ledger-page',
        signerId: 'ledger-1',
        accountCount: 25
      })
    ).resolves.toEqual({ ok: true })
    expect(accountOnboarding.loadLedgerAccounts.mock.calls.at(-1)).toEqual([
      {
        type: 'signer.ledger-accounts-load',
        operationId: 'load-ledger-page',
        signerId: 'ledger-1',
        accountCount: 25
      },
      { clientType: 'wallet-ui', windowInstanceId: 'tray-test' }
    ])

    await expect(
      dispatchCommand(event, {
        type: 'signer.ledger-accounts-load',
        operationId: 'invalid-ledger-page',
        signerId: 'ledger-1',
        accountCount: 26
      })
    ).resolves.toEqual({ ok: false, error: 'invalid_command' })
    expect(accountOnboarding.loadLedgerAccounts).toHaveBeenCalledTimes(1)
  })

  it('restricts token lookup queries to wallet renderers', async () => {
    tokens.lookup.mockResolvedValue({
      decimals: 18,
      name: 'Token',
      symbol: 'TKN',
      totalSupply: '100'
    })
    const query = {
      type: 'token.lookup',
      address: '0x1111111111111111111111111111111111111111',
      chainId: 1
    }

    authorizeRenderer.mockReturnValue(sideTrayContext)
    await expect(dispatchQuery(event, query)).resolves.toEqual({ ok: false, error: 'unauthorized' })

    authorizeRenderer.mockReturnValue(trayContext)
    await expect(dispatchQuery(event, query)).resolves.toEqual({
      ok: true,
      token: { decimals: 18, name: 'Token', symbol: 'TKN', totalSupply: '100' }
    })
    expect(tokens.lookup).toHaveBeenCalledWith(query.address, query.chainId)
  })

  it('checks address chain usage only for wallet renderers', async () => {
    const addresses = [
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222'
    ]
    accountMutations.addressChainUsage.mockResolvedValue([
      { address: addresses[0], chainIds: [1, 10], complete: true },
      { address: addresses[1], chainIds: [], complete: false }
    ])
    const query = { type: 'address.chain-usage', addresses }

    authorizeRenderer.mockReturnValue(sideTrayContext)
    await expect(dispatchQuery(event, query)).resolves.toEqual({ ok: false, error: 'unauthorized' })

    authorizeRenderer.mockReturnValue(trayContext)
    await expect(dispatchQuery(event, query)).resolves.toEqual({
      ok: true,
      usage: [
        { address: addresses[0], chainIds: [1, 10], complete: true },
        { address: addresses[1], chainIds: [], complete: false }
      ]
    })
    expect(accountMutations.addressChainUsage).toHaveBeenCalledWith(addresses)
  })

  it('enforces sender authority for close and shared renderer inspection', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    await expect(dispatchCommand(event, { type: 'sidetray.close' })).resolves.toEqual({
      ok: false,
      error: 'unauthorized'
    })
    expect(platform.closeSideTray.mock.calls).toEqual([])

    authorizeRenderer.mockReturnValue(sideTrayContext)
    await expect(dispatchCommand(event, { type: 'sidetray.close' })).resolves.toEqual({ ok: true })
    expect(platform.closeSideTray.mock.calls).toEqual([[event]])

    await expect(
      dispatchCommand(event, { type: 'sidetray.close', windowId: 'some-other-window' })
    ).resolves.toEqual({ ok: false, error: 'invalid_command' })

    await expect(dispatchCommand(event, { type: 'renderer.context-menu', x: 12, y: 34 })).resolves.toEqual({
      ok: true
    })

    authorizeRenderer.mockReturnValue(trayContext)
    await expect(dispatchCommand(event, { type: 'renderer.context-menu', x: 56, y: 78 })).resolves.toEqual({
      ok: true
    })
    expect(platform.inspectRenderer.mock.calls).toEqual([
      [event, 12, 34],
      [event, 56, 78]
    ])

    await expect(dispatchCommand(event, { type: 'renderer.context-menu', x: -1, y: 34 })).resolves.toEqual({
      ok: false,
      error: 'invalid_command'
    })
  })

  it('keeps request and unlock capabilities inside the tray entrypoint', async () => {
    authorizeRenderer.mockReturnValue(sideTrayContext)

    await expect(
      dispatchCommand(event, {
        type: 'security.unlock',
        operationId: 'side-unlock',
        method: 'password',
        password: 'secret'
      })
    ).resolves.toEqual({ ok: false, error: 'unauthorized' })
    await expect(dispatchCommand(event, { type: 'request.reject', requestId: 'request-1' })).resolves.toEqual(
      {
        ok: false,
        error: 'unauthorized'
      }
    )
    await expect(
      dispatchCommand(event, {
        type: 'request.warning-confirm',
        requestId: 'request-1',
        gate: 'gas-fee'
      })
    ).resolves.toEqual({ ok: false, error: 'unauthorized' })
    expect(security.unlock).not.toHaveBeenCalled()
    expect(requests.rejectRequest).not.toHaveBeenCalled()
  })

  it('accepts canonical request IDs but rejects renderer request objects', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    requests.rejectRequest.mockReturnValue(true)

    await expect(dispatchCommand(event, { type: 'request.reject', requestId: 'request-1' })).resolves.toEqual(
      {
        ok: true
      }
    )
    expect(requests.rejectRequest).toHaveBeenCalledWith('request-1')

    await expect(
      dispatchCommand(event, {
        type: 'request.reject',
        requestId: 'request-1',
        request: { handlerId: 'request-1', type: 'transaction' }
      })
    ).resolves.toEqual({ ok: false, error: 'invalid_command' })
    expect(requests.rejectRequest).toHaveBeenCalledTimes(1)
  })

  it('validates each unlock method before invoking the signer workflow', async () => {
    authorizeRenderer.mockReturnValue(trayContext)

    await expect(
      dispatchCommand(event, {
        type: 'security.unlock',
        operationId: 'invalid-webauthn',
        method: 'webauthn',
        secret: 'not-hex'
      })
    ).resolves.toEqual({ ok: false, error: 'invalid_command' })
    expect(security.unlock).not.toHaveBeenCalled()

    await expect(
      dispatchCommand(event, {
        type: 'security.unlock',
        operationId: 'native-unlock',
        method: 'native'
      })
    ).resolves.toEqual({ ok: true })
    expect(security.unlock.mock.calls.at(-1)).toEqual([
      { type: 'security.unlock', operationId: 'native-unlock', method: 'native' },
      { clientType: 'wallet-ui', windowInstanceId: 'tray-test' }
    ])
  })

  it('dispatches only the validated projected warning gate', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    requests.confirmWarning.mockReturnValue(true)

    await expect(
      dispatchCommand(event, {
        type: 'request.warning-confirm',
        requestId: 'request-1',
        gate: 'signer-compatibility'
      })
    ).resolves.toEqual({ ok: true })
    expect(requests.confirmWarning).toHaveBeenCalledWith('request-1', 'signer-compatibility')
  })

  it('keeps request approval handlers thin while the request service owns idempotency', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    requests.approve.mockReturnValue(true)
    const command = { type: 'request.approve' as const, requestId: 'approval-idempotency-1' }

    await expect(
      Promise.all([dispatchCommand(event, command), dispatchCommand(event, command)])
    ).resolves.toEqual([{ ok: true }, { ok: true }])
    expect(requests.approve).toHaveBeenCalledTimes(2)

    authorizeRenderer.mockReturnValue({ ...trayContext, webContentsId: 3 })
    await expect(dispatchCommand(event, command)).resolves.toEqual({ ok: true })
    expect(requests.approve).toHaveBeenCalledTimes(3)
  })

  it('bounds operation type values before logging unknown operations', async () => {
    authorizeRenderer.mockReturnValue(trayContext)

    await expect(dispatchCommand(event, { type: 'x'.repeat(129) })).resolves.toEqual({
      ok: false,
      error: 'invalid_command'
    })
  })

  it('deduplicates replacement requests and rejects idempotency-key reuse', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    requests.replaceTransaction.mockReturnValue(true)
    const command = {
      type: 'transaction.replace' as const,
      requestId: 'request-1',
      replacement: 'speed' as const,
      idempotencyKey: '00000000-0000-4000-8000-000000000100'
    }

    await expect(
      Promise.all([dispatchCommand(event, command), dispatchCommand(event, command)])
    ).resolves.toEqual([{ ok: true }, { ok: true }])
    expect(requests.replaceTransaction).toHaveBeenCalledTimes(1)

    await expect(dispatchCommand(event, { ...command, replacement: 'cancel' as const })).resolves.toEqual({
      ok: false,
      error: 'invalid_command',
      message: 'Idempotency key was reused.'
    })
    expect(requests.replaceTransaction).toHaveBeenCalledTimes(1)
  })

  it('derives extension and explorer targets only from validated scalar fields', async () => {
    platform.respondToExtension.mockReturnValue(true)
    platform.openTransactionExplorer.mockReturnValue(true)
    const extensionCommand = {
      type: 'extension.respond',
      extensionId: 'moz-extension://trusted',
      approved: true
    } as const

    authorizeRenderer.mockReturnValue(sideTrayContext)
    await expect(dispatchCommand(event, extensionCommand)).resolves.toEqual({
      ok: false,
      error: 'unauthorized'
    })
    expect(platform.respondToExtension).not.toHaveBeenCalled()

    authorizeRenderer.mockReturnValue(trayContext)
    await expect(dispatchCommand(event, extensionCommand)).resolves.toEqual({ ok: true })
    expect(platform.respondToExtension).toHaveBeenCalledWith('moz-extension://trusted', true)

    await expect(dispatchCommand(event, { type: 'explorer.open', chainId: 1 })).resolves.toEqual({ ok: true })
    expect(platform.openTransactionExplorer).toHaveBeenCalledWith(1, undefined)
  })
})
