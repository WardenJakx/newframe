const authorizeRenderer = jest.fn()
const getAccount = jest.fn()
const getCurrentAccount = jest.fn()
const selectAccount = jest.fn()
const resolveName = jest.fn()
const submitCurrentAccountTransaction = jest.fn()
const signCurrentAccountTypedData = jest.fn()
const quoteFlashForCurrentAccount = jest.fn()
const submitFlashForCurrentAccount = jest.fn()
const closeOwnSideTrayWindow = jest.fn()
const inspectOwnSideTrayWindow = jest.fn()
const walletWorkflows = {
  acceptBetaWarning: jest.fn(),
  adjustTransactionNonce: jest.fn(),
  addAccountFromSigner: jest.fn(),
  addToken: jest.fn(),
  addWatchAccount: jest.fn(),
  approveRequest: jest.fn(),
  cancelFlashOrder: jest.fn(),
  clearOriginRequests: jest.fn(),
  clearPermission: jest.fn(),
  configureSecurity: jest.fn(),
  confirmRequestApproval: jest.fn(),
  consumeHomeCommand: jest.fn(),
  createLatticeSigner: jest.fn(),
  disconnectSigner: jest.fn(),
  exportAccountPrivateKey: jest.fn(),
  generateSeedPhrase: jest.fn(),
  hydrateNetworkIcon: jest.fn(),
  importSigner: jest.fn(),
  inspectOwnTrayWindow: jest.fn(),
  locateKeystore: jest.fn(),
  lockWallet: jest.fn(),
  lookupToken: jest.fn(),
  navigatePanelBack: jest.fn(),
  openDapp: jest.fn(),
  openExternalUrl: jest.fn(),
  openTransactionExplorer: jest.fn(),
  openRequestPanel: jest.fn(),
  pairLattice: jest.fn(),
  quitApp: jest.fn(),
  refreshPortfolio: jest.fn(),
  reloadSigner: jest.fn(),
  removeAccount: jest.fn(),
  removeNetwork: jest.fn(),
  removeOrigin: jest.fn(),
  removeToken: jest.fn(),
  rejectRequest: jest.fn(),
  renameAccount: jest.fn(),
  reorderAccounts: jest.fn(),
  resetWallet: jest.fn(),
  resolveNetworkRequest: jest.fn(),
  resolveAccessRequest: jest.fn(),
  resolveSwitchChainRequest: jest.fn(),
  requestSignerCompatibility: jest.fn(),
  resetTransactionNonce: jest.fn(),
  respondToExtension: jest.fn(),
  respondToUpdater: jest.fn(),
  reviewAddChainRequest: jest.fn(),
  reviewAddTokenRequest: jest.fn(),
  securityStatus: jest.fn(),
  setNetworkActivation: jest.fn(),
  setNetworkPrimaryRpc: jest.fn(),
  setTransactionFeeDefault: jest.fn(),
  submitTrezorInput: jest.fn(),
  toggleWarning: jest.fn(),
  unlockSecurity: jest.fn(),
  updateTokenApproval: jest.fn(),
  updateTransactionFee: jest.fn(),
  dismissTransactionFeeNotice: jest.fn(),
  replaceTransaction: jest.fn(),
  handleTrayMouseout: jest.fn(),
  updateNotification: jest.fn(),
  updateSettings: jest.fn(),
  writeClipboard: jest.fn()
}

jest.mock('../../../main/ipc/authorization', () => ({ authorizeRenderer }))
jest.mock('../../../main/accounts', () => ({
  default: { current: getCurrentAccount, get: getAccount }
}))
jest.mock('../../../main/operations/workflows', () => ({ resolveName, selectAccount }))
jest.mock('../../../main/operations/dappWorkflows', () => ({
  submitCurrentAccountTransaction,
  signCurrentAccountTypedData,
  quoteFlashForCurrentAccount,
  submitFlashForCurrentAccount
}))
jest.mock('../../../main/operations/sideTrayWorkflows', () => ({
  closeOwnSideTrayWindow,
  inspectOwnSideTrayWindow
}))
jest.mock('../../../main/operations/walletWorkflows', () => walletWorkflows)

let dispatchCommand: typeof import('../../../main/ipc/operations').dispatchCommand
let dispatchQuery: typeof import('../../../main/ipc/operations').dispatchQuery
const event = {} as Electron.IpcMainInvokeEvent
const trayContext = { clientType: 'wallet-ui' as const, entrypoint: 'tray' as const, webContentsId: 1 }
const sideTrayContext = { clientType: 'dapp' as const, entrypoint: 'sidetray' as const, webContentsId: 2 }
const transactionIdempotencyKey = '00000000-0000-4000-8000-000000000001'
const flashTargetAsset = {
  id: '1:0x1111111111111111111111111111111111111111',
  symbol: 'TOK',
  name: 'Token',
  decimals: 18,
  chainId: 1,
  isNative: false,
  address: '0x1111111111111111111111111111111111111111'
}
const flashContraAsset = {
  id: '1:0x2222222222222222222222222222222222222222',
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  chainId: 1,
  isNative: false,
  address: '0x2222222222222222222222222222222222222222'
}
const flashOrder = {
  chainId: 1,
  contraAsset: flashContraAsset,
  inputAmount: '1',
  orderSignature: '0x12',
  orderType: 'market' as const,
  qty: '1',
  quote: {
    id: 'quote-1',
    side: 'buy' as const,
    orderType: 'market' as const,
    targetAsset: flashTargetAsset,
    contraAsset: flashContraAsset,
    spentAsset: flashContraAsset,
    receiveAsset: flashTargetAsset,
    inputAmount: '1',
    outputAmount: '1',
    steps: []
  },
  side: 'buy' as const,
  signature: '0x12',
  targetAsset: flashTargetAsset
}

beforeAll(async () => {
  const operations = await import('../../../main/ipc/operations')
  dispatchCommand = operations.dispatchCommand
  dispatchQuery = operations.dispatchQuery
})

beforeEach(() => {
  authorizeRenderer.mockReset()
  getAccount.mockReset()
  getCurrentAccount.mockReset()
  getCurrentAccount.mockReturnValue({ id: 'account-1' })
  selectAccount.mockReset()
  resolveName.mockReset()
  submitCurrentAccountTransaction.mockReset()
  signCurrentAccountTypedData.mockReset()
  quoteFlashForCurrentAccount.mockReset()
  submitFlashForCurrentAccount.mockReset()
  closeOwnSideTrayWindow.mockReset()
  inspectOwnSideTrayWindow.mockReset()
  Object.values(walletWorkflows).forEach((mock) => mock.mockReset())
})

describe('typed operation dispatcher', () => {
  it('rejects calls that do not have a validated renderer registration', async () => {
    authorizeRenderer.mockReturnValue(undefined)

    await expect(dispatchQuery(event, { type: 'name.resolve', name: 'alice.eth' })).resolves.toEqual({
      ok: false,
      error: 'unauthorized'
    })
    expect(resolveName).not.toHaveBeenCalled()
  })

  it('does not authorize dapps to select the wallet account', async () => {
    authorizeRenderer.mockReturnValue(sideTrayContext)

    await expect(dispatchCommand(event, { type: 'account.select', accountId: '0xabc' })).resolves.toEqual({
      ok: false,
      error: 'unauthorized'
    })
    expect(getAccount).not.toHaveBeenCalled()
    expect(selectAccount).not.toHaveBeenCalled()
  })

  it('validates command payloads before invoking a handler', async () => {
    authorizeRenderer.mockReturnValue(trayContext)

    await expect(
      dispatchCommand(event, { type: 'account.select', accountId: '', injected: true })
    ).resolves.toEqual({ ok: false, error: 'invalid_command' })
    expect(selectAccount).not.toHaveBeenCalled()
  })

  it('selects an existing account for wallet renderers', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    getAccount.mockReturnValue({ id: '0xabc' })
    selectAccount.mockResolvedValue({ id: '0xabc' })

    await expect(dispatchCommand(event, { type: 'account.select', accountId: '0xabc' })).resolves.toEqual({
      ok: true
    })
    expect(selectAccount).toHaveBeenCalledWith('0xabc')
  })

  it('returns account_not_found without running account-selection orchestration', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    getAccount.mockReturnValue(undefined)

    await expect(dispatchCommand(event, { type: 'account.select', accountId: 'missing' })).resolves.toEqual({
      ok: false,
      error: 'account_not_found'
    })
    expect(selectAccount).not.toHaveBeenCalled()
  })

  it('allows dapps to resolve names without granting state-changing privileges', async () => {
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

  it('treats the native keystore picker as a command side effect', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    walletWorkflows.locateKeystore.mockResolvedValue({ version: 3 })

    await expect(dispatchQuery(event, { type: 'keystore.locate' })).resolves.toEqual({
      ok: false,
      error: 'invalid_query'
    })
    await expect(dispatchCommand(event, { type: 'keystore.locate' })).resolves.toEqual({
      ok: true,
      keystore: { version: 3 }
    })
    expect(walletWorkflows.locateKeystore).toHaveBeenCalledTimes(1)
  })

  it('does not expose renderer-controlled provider initialization', async () => {
    authorizeRenderer.mockReturnValue(sideTrayContext)

    await expect(
      dispatchCommand(event, { type: 'dapp.initialize', feature: 'send', chainId: 1 })
    ).resolves.toEqual({ ok: false, error: 'invalid_command' })
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

  it('submits a validated transaction without exposing generic provider RPC', async () => {
    authorizeRenderer.mockReturnValue(sideTrayContext)
    submitCurrentAccountTransaction.mockResolvedValue({
      ok: true,
      transactionHash: `0x${'1'.repeat(64)}`
    })
    const command = {
      type: 'transaction.submit' as const,
      idempotencyKey: transactionIdempotencyKey,
      chainId: 1,
      transaction: {
        to: '0x1111111111111111111111111111111111111111',
        value: '0x1'
      }
    }

    await expect(dispatchCommand(event, command)).resolves.toEqual({
      ok: true,
      transactionHash: `0x${'1'.repeat(64)}`
    })
    expect(submitCurrentAccountTransaction).toHaveBeenCalledWith(command)
  })

  it('deduplicates retry-sensitive transaction submissions by renderer-generated key', async () => {
    authorizeRenderer.mockReturnValue(sideTrayContext)
    submitCurrentAccountTransaction.mockResolvedValue({
      ok: true,
      transactionHash: `0x${'2'.repeat(64)}`
    })
    const command = {
      type: 'transaction.submit' as const,
      idempotencyKey: '00000000-0000-4000-8000-000000000002',
      chainId: 1,
      transaction: {
        to: '0x1111111111111111111111111111111111111111',
        value: '0x1'
      }
    }

    await expect(
      Promise.all([dispatchCommand(event, command), dispatchCommand(event, command)])
    ).resolves.toEqual([
      { ok: true, transactionHash: `0x${'2'.repeat(64)}` },
      { ok: true, transactionHash: `0x${'2'.repeat(64)}` }
    ])
    expect(submitCurrentAccountTransaction).toHaveBeenCalledTimes(1)

    await expect(
      dispatchCommand(event, {
        ...command,
        transaction: { ...command.transaction, value: '0x2' }
      })
    ).resolves.toEqual({
      ok: false,
      error: 'invalid_command',
      message: 'Idempotency key was reused.'
    })
    expect(submitCurrentAccountTransaction).toHaveBeenCalledTimes(1)
  })

  it('deduplicates Flash submission by its stable quote ID', async () => {
    authorizeRenderer.mockReturnValue(sideTrayContext)
    submitFlashForCurrentAccount.mockResolvedValue({ ok: true, orderId: 'order-1' })
    const command = {
      type: 'flash.submit' as const,
      order: flashOrder
    }

    await expect(
      Promise.all([dispatchCommand(event, command), dispatchCommand(event, command)])
    ).resolves.toEqual([
      { ok: true, orderId: 'order-1' },
      { ok: true, orderId: 'order-1' }
    ])
    expect(submitFlashForCurrentAccount).toHaveBeenCalledTimes(1)

    await expect(dispatchCommand(event, { ...command, order: { ...flashOrder, qty: '2' } })).resolves.toEqual(
      {
        ok: false,
        error: 'invalid_command',
        message: 'Idempotency key was reused.'
      }
    )
    expect(submitFlashForCurrentAccount).toHaveBeenCalledTimes(1)
  })

  it('bounds the idempotency cache and eventually evicts the oldest result', async () => {
    authorizeRenderer.mockReturnValue(sideTrayContext)
    submitCurrentAccountTransaction.mockResolvedValue({
      ok: true,
      transactionHash: `0x${'3'.repeat(64)}`
    })
    const command = {
      type: 'transaction.submit' as const,
      idempotencyKey: '10000000-0000-4000-8000-000000000000',
      chainId: 1,
      transaction: { to: '0x1111111111111111111111111111111111111111' }
    }

    await dispatchCommand(event, command)
    for (let index = 1; index <= 256; index += 1) {
      await dispatchCommand(event, {
        ...command,
        idempotencyKey: `10000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`
      })
    }
    await dispatchCommand(event, command)

    expect(submitCurrentAccountTransaction).toHaveBeenCalledTimes(258)
  })

  it('does not allow wallet renderers to use internal dapp commands', async () => {
    authorizeRenderer.mockReturnValue(trayContext)

    await expect(dispatchCommand(event, { type: 'sidetray.close' })).resolves.toEqual({
      ok: false,
      error: 'unauthorized'
    })
    expect(closeOwnSideTrayWindow).not.toHaveBeenCalled()
  })

  it('allows the tray to use validated security capabilities', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    walletWorkflows.securityStatus.mockReturnValue({
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

    await expect(dispatchCommand(event, { type: 'security.configure', mode: 'disabled' })).resolves.toEqual({
      ok: true
    })
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
    expect(walletWorkflows.configureSecurity).toHaveBeenCalledWith({
      type: 'security.configure',
      mode: 'disabled'
    })
  })

  it('passes only validated identifiers to wallet workflows', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    walletWorkflows.removeToken.mockReturnValue(true)

    await expect(
      dispatchCommand(event, {
        type: 'token.remove',
        address: '0x1111111111111111111111111111111111111111',
        chainId: 1
      })
    ).resolves.toEqual({ ok: true })
    expect(walletWorkflows.removeToken).toHaveBeenCalledWith({
      address: '0x1111111111111111111111111111111111111111',
      chainId: 1
    })
  })

  it('restricts token lookup queries to wallet renderers', async () => {
    walletWorkflows.lookupToken.mockResolvedValue({
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
    expect(walletWorkflows.lookupToken).toHaveBeenCalledWith(query.address, query.chainId)
  })

  it('closes the invoking side tray without accepting a target window', async () => {
    authorizeRenderer.mockReturnValue(sideTrayContext)

    await expect(dispatchCommand(event, { type: 'sidetray.close' })).resolves.toEqual({ ok: true })
    expect(closeOwnSideTrayWindow).toHaveBeenCalledWith(event)

    await expect(
      dispatchCommand(event, { type: 'sidetray.close', windowId: 'some-other-window' })
    ).resolves.toEqual({ ok: false, error: 'invalid_command' })
  })

  it('inspects only the invoking side tray at validated coordinates', async () => {
    authorizeRenderer.mockReturnValue(sideTrayContext)

    await expect(dispatchCommand(event, { type: 'sidetray.context-menu', x: 12, y: 34 })).resolves.toEqual({
      ok: true
    })
    expect(inspectOwnSideTrayWindow).toHaveBeenCalledWith(event, 12, 34)

    await expect(dispatchCommand(event, { type: 'sidetray.context-menu', x: -1, y: 34 })).resolves.toEqual({
      ok: false,
      error: 'invalid_command'
    })
  })

  it('keeps request and unlock capabilities inside the tray entrypoint', async () => {
    authorizeRenderer.mockReturnValue(sideTrayContext)

    await expect(
      dispatchCommand(event, { type: 'security.unlock', method: 'password', password: 'secret' })
    ).resolves.toEqual({ ok: false, error: 'unauthorized' })
    await expect(dispatchCommand(event, { type: 'request.reject', requestId: 'request-1' })).resolves.toEqual(
      {
        ok: false,
        error: 'unauthorized'
      }
    )
    await expect(
      dispatchQuery(event, { type: 'request.signer-compatibility', requestId: 'request-1' })
    ).resolves.toEqual({ ok: false, error: 'unauthorized' })
    expect(walletWorkflows.unlockSecurity).not.toHaveBeenCalled()
    expect(walletWorkflows.rejectRequest).not.toHaveBeenCalled()
  })

  it('accepts canonical request IDs but rejects renderer request objects', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    walletWorkflows.rejectRequest.mockReturnValue(true)

    await expect(dispatchCommand(event, { type: 'request.reject', requestId: 'request-1' })).resolves.toEqual(
      {
        ok: true
      }
    )
    expect(walletWorkflows.rejectRequest).toHaveBeenCalledWith('request-1')

    await expect(
      dispatchCommand(event, {
        type: 'request.reject',
        requestId: 'request-1',
        request: { handlerId: 'request-1', type: 'transaction' }
      })
    ).resolves.toEqual({ ok: false, error: 'invalid_command' })
    expect(walletWorkflows.rejectRequest).toHaveBeenCalledTimes(1)
  })

  it('validates each unlock method before invoking the signer workflow', async () => {
    authorizeRenderer.mockReturnValue(trayContext)

    await expect(
      dispatchCommand(event, { type: 'security.unlock', method: 'webauthn', secret: 'not-hex' })
    ).resolves.toEqual({ ok: false, error: 'invalid_command' })
    expect(walletWorkflows.unlockSecurity).not.toHaveBeenCalled()

    await expect(dispatchCommand(event, { type: 'security.unlock', method: 'native' })).resolves.toEqual({
      ok: true
    })
    expect(walletWorkflows.unlockSecurity).toHaveBeenCalledWith({
      type: 'security.unlock',
      method: 'native'
    })
  })

  it('returns signer compatibility without allowing the query to navigate', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    walletWorkflows.requestSignerCompatibility.mockReturnValue({
      ok: true,
      compatibility: { signer: 'ledger', tx: 'london', compatible: false }
    })

    await expect(
      dispatchQuery(event, { type: 'request.signer-compatibility', requestId: 'request-1' })
    ).resolves.toEqual({
      ok: true,
      compatibility: { signer: 'ledger', tx: 'london', compatible: false }
    })
    expect(walletWorkflows.requestSignerCompatibility).toHaveBeenCalledWith('request-1')
  })

  it('deduplicates request approval by its canonical request ID', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    walletWorkflows.approveRequest.mockReturnValue(true)
    const command = { type: 'request.approve' as const, requestId: 'approval-idempotency-1' }

    await expect(
      Promise.all([dispatchCommand(event, command), dispatchCommand(event, command)])
    ).resolves.toEqual([{ ok: true }, { ok: true }])
    expect(walletWorkflows.approveRequest).toHaveBeenCalledTimes(1)

    authorizeRenderer.mockReturnValue({ ...trayContext, webContentsId: 3 })
    await expect(dispatchCommand(event, command)).resolves.toEqual({ ok: true })
    expect(walletWorkflows.approveRequest).toHaveBeenCalledTimes(1)
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
    walletWorkflows.replaceTransaction.mockReturnValue(true)
    const command = {
      type: 'transaction.replace' as const,
      requestId: 'request-1',
      replacement: 'speed' as const,
      idempotencyKey: '00000000-0000-4000-8000-000000000100'
    }

    await expect(
      Promise.all([dispatchCommand(event, command), dispatchCommand(event, command)])
    ).resolves.toEqual([{ ok: true }, { ok: true }])
    expect(walletWorkflows.replaceTransaction).toHaveBeenCalledTimes(1)

    await expect(dispatchCommand(event, { ...command, replacement: 'cancel' as const })).resolves.toEqual({
      ok: false,
      error: 'invalid_command',
      message: 'Idempotency key was reused.'
    })
    expect(walletWorkflows.replaceTransaction).toHaveBeenCalledTimes(1)
  })

  it('derives extension and explorer targets only from validated scalar fields', async () => {
    authorizeRenderer.mockReturnValue(trayContext)
    walletWorkflows.respondToExtension.mockReturnValue(true)
    walletWorkflows.openTransactionExplorer.mockReturnValue(true)

    await expect(
      dispatchCommand(event, {
        type: 'extension.respond',
        extensionId: 'moz-extension://trusted',
        approved: true
      })
    ).resolves.toEqual({ ok: true })
    expect(walletWorkflows.respondToExtension).toHaveBeenCalledWith('moz-extension://trusted', true)

    await expect(dispatchCommand(event, { type: 'explorer.open', chainId: 1 })).resolves.toEqual({ ok: true })
    expect(walletWorkflows.openTransactionExplorer).toHaveBeenCalledWith(1, undefined)
  })
})
