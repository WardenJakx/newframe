const getState = jest.fn()
const getSigner = jest.fn()
const removeSignerRecord = jest.fn()
const reloadSignerRecord = jest.fn()
const lockApp = jest.fn()
const unlockApp = jest.fn()
const unlockAppWithBiometrics = jest.fn()
const exportAccountPrivateKeyRecord = jest.fn()
const currentAccount = jest.fn()
const getAccountRecord = jest.fn()
const addAccount = jest.fn()
const removeAccountRecord = jest.fn()
const renameAccountRecord = jest.fn()
const rejectRequest = jest.fn()
const resolveRequest = jest.fn()
const setAccess = jest.fn()
const clearRequestsByOrigin = jest.fn()
const confirmRequestApprovalRecord = jest.fn()
const updateRequest = jest.fn()
const setBaseFee = jest.fn()
const setPriorityFee = jest.fn()
const setGasPrice = jest.fn()
const setGasLimit = jest.fn()
const adjustNonce = jest.fn()
const resetNonce = jest.fn()
const removeFeeUpdateNotice = jest.fn()
const replaceTx = jest.fn()
const removeRequests = jest.fn()
const setRequestPending = jest.fn()
const setRequestError = jest.fn()
const setRequestSuccess = jest.fn()
const setTxSent = jest.fn()
const approveTransactionRequest = jest.fn()
const approveSign = jest.fn()
const approveSignTypedData = jest.fn()
const providerSend = jest.fn()
const getTokenData = jest.fn()
const tokenConstructor = jest.fn()
const openBlockExplorer = jest.fn()
const openExternal = jest.fn()
const vaultExists = jest.fn()
const vaultIsUnlocked = jest.fn()
const vaultGetKey = jest.fn()
const biometricSummary = jest.fn()
const biometricDisable = jest.fn()
const biometricEnableNative = jest.fn()
const biometricEnableWebAuthn = jest.fn()
const flashCancelOrder = jest.fn()
const signerCompatibility = jest.fn()
const handleTrayMouseoutRecord = jest.fn()
const refocusFrame = jest.fn()
const updaterFetchUpdate = jest.fn()
const updaterQuitAndInstall = jest.fn()
const updaterDismissUpdate = jest.fn()
const selectAccount = jest.fn()
const resolveName = jest.fn()

jest.mock('../../../main/store', () => ({ default: { getState } }))
jest.mock('../../../main/signers', () => ({
  default: {
    exportAccountPrivateKey: exportAccountPrivateKeyRecord,
    get: getSigner,
    lockApp,
    unlockApp,
    unlockAppWithBiometrics,
    remove: removeSignerRecord,
    reload: reloadSignerRecord
  }
}))
jest.mock('../../../main/accounts', () => ({
  default: {
    add: addAccount,
    current: currentAccount,
    get: getAccountRecord,
    rejectRequest,
    setAccess,
    clearRequestsByOrigin,
    confirmRequestApproval: confirmRequestApprovalRecord,
    updateRequest,
    setBaseFee,
    setPriorityFee,
    setGasPrice,
    setGasLimit,
    adjustNonce,
    resetNonce,
    removeFeeUpdateNotice,
    replaceTx,
    remove: removeAccountRecord,
    rename: renameAccountRecord,
    removeRequests,
    resolveRequest,
    setRequestError,
    setRequestPending,
    setRequestSuccess,
    setTxSent
  }
}))
jest.mock('../../../main/provider', () => ({
  default: { approveSign, approveSignTypedData, approveTransactionRequest, send: providerSend }
}))
jest.mock('../../../main/biometrics', () => ({
  default: {
    disable: biometricDisable,
    enableNative: biometricEnableNative,
    enableWebAuthn: biometricEnableWebAuthn,
    summary: biometricSummary
  }
}))
jest.mock('../../../main/flash/instance', () => ({ flashService: { cancelOrder: flashCancelOrder } }))
jest.mock('../../../main/transaction', () => ({ signerCompatibility }))
jest.mock('../../../main/updater', () => ({
  default: {
    dismissUpdate: updaterDismissUpdate,
    fetchUpdate: updaterFetchUpdate,
    quitAndInstall: updaterQuitAndInstall,
    get updateReady() {
      return true
    }
  }
}))
jest.mock('../../../main/operations/workflows', () => ({ resolveName, selectAccount }))
jest.mock('../../../main/contracts/erc20', () => ({
  default: class MockErc20Contract {
    constructor(address: string, chainId: number) {
      tokenConstructor(address, chainId)
    }

    getTokenData() {
      return getTokenData()
    }
  }
}))
jest.mock('../../../main/vault', () => ({
  default: { exists: vaultExists, getKey: vaultGetKey, isUnlocked: vaultIsUnlocked }
}))
jest.mock('../../../main/windows', () => ({
  default: { handleTrayMouseout: handleTrayMouseoutRecord, refocusFrame }
}))
jest.mock('../../../main/windows/window', () => ({ openBlockExplorer, openExternal }))

let addSignerAccount: typeof import('../../../main/operations/walletWorkflows').addSignerAccount
let approveRequest: typeof import('../../../main/operations/walletWorkflows').approveRequest
let cancelFlashOrder: typeof import('../../../main/operations/walletWorkflows').cancelFlashOrder
let configureSecurity: typeof import('../../../main/operations/walletWorkflows').configureSecurity
let consumeHomeCommand: typeof import('../../../main/operations/walletWorkflows').consumeHomeCommand
let inspectOwnDashWindow: typeof import('../../../main/operations/walletWorkflows').inspectOwnDashWindow
let lockWallet: typeof import('../../../main/operations/walletWorkflows').lockWallet
let lookupToken: typeof import('../../../main/operations/walletWorkflows').lookupToken
let openDapp: typeof import('../../../main/operations/walletWorkflows').openDapp
let openTransactionExplorer: typeof import('../../../main/operations/walletWorkflows').openTransactionExplorer
let removeAccount: typeof import('../../../main/operations/walletWorkflows').removeAccount
let removeNetwork: typeof import('../../../main/operations/walletWorkflows').removeNetwork
let removeToken: typeof import('../../../main/operations/walletWorkflows').removeToken
let resolveNetworkRequest: typeof import('../../../main/operations/walletWorkflows').resolveNetworkRequest
let securityStatus: typeof import('../../../main/operations/walletWorkflows').securityStatus
let setNetworkPrimaryRpc: typeof import('../../../main/operations/walletWorkflows').setNetworkPrimaryRpc
let workflows: typeof import('../../../main/operations/walletWorkflows')

const address = '0x1111111111111111111111111111111111111111'
const actions = {
  addNetwork: jest.fn(),
  activateNetwork: jest.fn(),
  backDash: jest.fn(),
  clearHomeCommand: jest.fn(),
  dontRemind: jest.fn(),
  initOrigin: jest.fn(),
  navBack: jest.fn(),
  navDash: jest.fn(),
  navForward: jest.fn(),
  navHome: jest.fn(),
  notify: jest.fn(),
  removeBalance: jest.fn(),
  removeCustomTokens: jest.fn(),
  removeNetwork: jest.fn(),
  selectPrimary: jest.fn(),
  setDash: jest.fn(),
  setBiometricUnlock: jest.fn(),
  setFramePanel: jest.fn(),
  setPrimaryCustom: jest.fn(),
  setGasDefault: jest.fn(),
  switchOriginChain: jest.fn(),
  trustExtension: jest.fn(),
  toggleConnection: jest.fn(),
  updateBadge: jest.fn()
}

beforeAll(async () => {
  workflows = await import('../../../main/operations/walletWorkflows')
  addSignerAccount = workflows.addSignerAccount
  approveRequest = workflows.approveRequest
  cancelFlashOrder = workflows.cancelFlashOrder
  configureSecurity = workflows.configureSecurity
  consumeHomeCommand = workflows.consumeHomeCommand
  inspectOwnDashWindow = workflows.inspectOwnDashWindow
  lockWallet = workflows.lockWallet
  lookupToken = workflows.lookupToken
  openDapp = workflows.openDapp
  openTransactionExplorer = workflows.openTransactionExplorer
  removeAccount = workflows.removeAccount
  removeNetwork = workflows.removeNetwork
  removeToken = workflows.removeToken
  resolveNetworkRequest = workflows.resolveNetworkRequest
  securityStatus = workflows.securityStatus
  setNetworkPrimaryRpc = workflows.setNetworkPrimaryRpc
})

beforeEach(() => {
  ;[
    getState,
    getSigner,
    removeSignerRecord,
    reloadSignerRecord,
    lockApp,
    unlockApp,
    unlockAppWithBiometrics,
    exportAccountPrivateKeyRecord,
    currentAccount,
    getAccountRecord,
    addAccount,
    removeAccountRecord,
    renameAccountRecord,
    rejectRequest,
    setAccess,
    clearRequestsByOrigin,
    confirmRequestApprovalRecord,
    updateRequest,
    setBaseFee,
    setPriorityFee,
    setGasPrice,
    setGasLimit,
    adjustNonce,
    resetNonce,
    removeFeeUpdateNotice,
    replaceTx,
    resolveRequest,
    removeRequests,
    setRequestPending,
    setRequestError,
    setRequestSuccess,
    setTxSent,
    approveTransactionRequest,
    approveSign,
    approveSignTypedData,
    providerSend,
    getTokenData,
    tokenConstructor,
    openBlockExplorer,
    openExternal,
    vaultExists,
    vaultIsUnlocked,
    vaultGetKey,
    biometricSummary,
    biometricDisable,
    biometricEnableNative,
    biometricEnableWebAuthn,
    flashCancelOrder,
    signerCompatibility,
    handleTrayMouseoutRecord,
    refocusFrame,
    updaterFetchUpdate,
    updaterQuitAndInstall,
    updaterDismissUpdate,
    selectAccount,
    resolveName,
    ...Object.values(actions)
  ].forEach((mock) => mock.mockReset())

  vaultExists.mockReturnValue(false)
  vaultIsUnlocked.mockReturnValue(false)
  biometricSummary.mockReturnValue({
    enabled: false,
    method: '',
    nativeAvailable: false
  })
  getState.mockReturnValue({
    ...actions,
    main: {
      accounts: {},
      appLock: { locked: false, vaultExists: false },
      currentAccount: '',
      networks: { ethereum: {} },
      networksMeta: { ethereum: {} },
      origins: {},
      orders: {},
      tokens: { custom: [] }
    },
    tray: {},
    view: { badge: {}, notifications: {}, notify: '', notifyData: {} }
  })
})

describe('wallet UI workflows', () => {
  it('opens Trade and Send in the fixed secondary panel', () => {
    getState.mockReturnValue({
      ...actions,
      main: {
        frames: {},
        networks: { ethereum: { 31337: { id: 31337, on: true } } }
      }
    })

    expect(openDapp({ type: 'dapp.open', feature: 'trade', chainId: 31337 })).toBe(true)
    expect(actions.setFramePanel).toHaveBeenCalledWith({
      id: 'dappLauncher',
      presentation: 'secondaryPanel',
      route: '/trade?chainId=31337'
    })
    expect(openDapp({ type: 'dapp.open', feature: 'send' })).toBe(true)
    expect(actions.setFramePanel).toHaveBeenLastCalledWith({
      id: 'dappLauncher',
      presentation: 'secondaryPanel',
      route: '/send'
    })
    expect(actions.setDash).toHaveBeenCalledWith({ show: false })
  })

  it('resolves a token from canonical state before removing it', () => {
    const token = { address, chainId: 1, decimals: 18, logoURI: '', name: 'Token', symbol: 'TKN' }
    getState.mockReturnValue({
      ...actions,
      main: { networks: { ethereum: {} }, tokens: { custom: [token] } }
    })

    expect(removeToken({ address: address.toUpperCase(), chainId: 1 })).toBe(true)
    expect(actions.removeBalance).toHaveBeenCalledWith(1, token.address)
    expect(actions.removeCustomTokens).toHaveBeenCalledWith([token])

    expect(removeToken({ address: '0x2222222222222222222222222222222222222222', chainId: 1 })).toBe(false)
  })

  it('derives signer account metadata from the canonical signer', () => {
    getSigner.mockReturnValue({ id: 'ledger-1', type: 'ledger', addresses: [address] })

    expect(addSignerAccount('ledger-1', address)).toBe(true)
    expect(addAccount).toHaveBeenCalledWith(address, 'Ledger Account', { type: 'ledger' })

    expect(addSignerAccount('ledger-1', '0x2222222222222222222222222222222222222222')).toBe(false)
    expect(addAccount).toHaveBeenCalledTimes(1)
  })

  it('looks up ERC-20 metadata through the main-process provider', async () => {
    getTokenData.mockResolvedValue({ decimals: 18, name: 'Token', symbol: 'TKN', totalSupply: '100' })

    await expect(lookupToken(address, 1)).resolves.toEqual({
      decimals: 18,
      name: 'Token',
      symbol: 'TKN',
      totalSupply: '100'
    })
    expect(tokenConstructor).toHaveBeenCalledWith(address, 1)
  })

  it('uses canonical networks for explorer and removal operations', () => {
    const network = { id: 10, type: 'ethereum', name: 'Optimism' }
    getState.mockReturnValue({
      ...actions,
      main: { networks: { ethereum: { 10: network } }, tokens: { custom: [] } }
    })
    const hash = `0x${'a'.repeat(64)}`

    expect(openTransactionExplorer(10, hash)).toBe(true)
    expect(openBlockExplorer).toHaveBeenCalledWith({ id: 10, type: 'ethereum' }, hash)
    expect(removeNetwork(10)).toBe(true)
    expect(actions.removeNetwork).toHaveBeenCalledWith(network)
    expect(actions.backDash).toHaveBeenLastCalledWith(2)
  })

  it('verifies and applies a primary RPC change as one main-owned workflow', async () => {
    const network = { id: 1, type: 'ethereum', name: 'Ethereum' }
    getState.mockReturnValue({
      ...actions,
      main: { networks: { ethereum: { 1: network } } }
    })

    const originalFetch = globalThis.fetch
    globalThis.fetch = jest.fn(async () =>
      Response.json({ id: 1, jsonrpc: '2.0', result: '0x1' })
    ) as unknown as typeof fetch

    await expect(setNetworkPrimaryRpc(1, 'https://rpc.example')).resolves.toBe(true)
    expect(actions.setPrimaryCustom).toHaveBeenCalledWith('ethereum', 1, 'https://rpc.example')
    expect(actions.selectPrimary).toHaveBeenCalledWith('ethereum', 1, 'custom')
    expect(actions.toggleConnection).toHaveBeenCalledWith('ethereum', 1, 'primary', true)

    await expect(setNetworkPrimaryRpc(10, 'https://attacker.example')).resolves.toBe(false)
    expect(actions.setPrimaryCustom).toHaveBeenCalledTimes(1)

    globalThis.fetch = originalFetch
  })

  it('consumes only the canonical pending Home command ID', () => {
    getState.mockReturnValue({
      ...actions,
      main: { networks: { ethereum: {} } },
      tray: { homeCommand: { id: 7, type: 'view', data: {} } }
    })

    expect(consumeHomeCommand(6)).toBe(false)
    expect(actions.clearHomeCommand).not.toHaveBeenCalled()
    expect(consumeHomeCommand(7)).toBe(true)
    expect(actions.clearHomeCommand).toHaveBeenCalledWith(7)
  })

  it('removes a seed signer only when requested and no other account uses it', () => {
    const seedSigner = { id: 'seed-1', type: 'seed' }
    getSigner.mockReturnValue(seedSigner)
    getState.mockReturnValue({
      ...actions,
      main: {
        accounts: {
          [address]: { id: address, address, signer: seedSigner.id }
        },
        networks: { ethereum: {} }
      }
    })

    expect(removeAccount(address, true)).toBe(true)
    expect(removeAccountRecord).toHaveBeenCalledWith(address)
    expect(removeSignerRecord).toHaveBeenCalledWith(seedSigner.id)

    removeAccountRecord.mockClear()
    removeSignerRecord.mockClear()
    const otherAddress = '0x2222222222222222222222222222222222222222'
    getState.mockReturnValue({
      ...actions,
      main: {
        accounts: {
          [address]: { id: address, address, signer: seedSigner.id },
          [otherAddress]: { id: otherAddress, address: otherAddress, signer: seedSigner.id }
        },
        networks: { ethereum: {} }
      }
    })

    expect(removeAccount(address, true)).toBe(true)
    expect(removeAccountRecord).toHaveBeenCalledWith(address)
    expect(removeSignerRecord).not.toHaveBeenCalled()
  })

  it('derives security status from canonical app-lock state and owns biometric configuration', async () => {
    const appLock = { locked: true, vaultExists: true }
    const summary = { enabled: true, method: 'native' as const, nativeAvailable: true }
    biometricSummary.mockReturnValue(summary)
    getState.mockReturnValue({
      ...actions,
      main: { appLock, networks: { ethereum: {} } }
    })

    expect(securityStatus()).toEqual({
      ...appLock,
      biometricUnlockEnabled: true,
      biometricAvailable: true,
      biometrics: summary
    })
    await configureSecurity({ type: 'security.configure', mode: 'disabled' })
    expect(biometricDisable).toHaveBeenCalledTimes(1)
    expect(actions.setBiometricUnlock).toHaveBeenCalledWith(false)

    vaultIsUnlocked.mockReturnValue(true)
    vaultGetKey.mockReturnValue('vault-key')
    biometricEnableNative.mockResolvedValue(undefined)
    await configureSecurity({ type: 'security.configure', mode: 'native' })
    expect(biometricEnableNative).toHaveBeenCalledWith('vault-key')
    expect(actions.setBiometricUnlock).toHaveBeenLastCalledWith(true)
  })

  it('converts the signer lock callback to a rejecting Promise', async () => {
    lockApp.mockImplementationOnce((done) => done())
    await expect(lockWallet()).resolves.toBeUndefined()

    lockApp.mockImplementationOnce((done) => done(new Error('lock failed')))
    await expect(lockWallet()).rejects.toThrow('lock failed')
  })

  it('verifies and resolves add-chain decisions from canonical requests or Home commands', async () => {
    const chain = {
      id: 10,
      name: 'Optimism',
      type: 'ethereum',
      primaryRpc: 'https://rpc.example.com',
      explorer: 'https://explorer.example.com',
      symbol: 'ETH'
    }
    const request = { handlerId: 'request-1', type: 'addChain', chain }
    currentAccount.mockReturnValue({
      getRequest: (id: string) => (id === request.handlerId ? request : undefined)
    })
    getState.mockReturnValue({
      ...actions,
      main: { networks: { ethereum: {} } },
      tray: {}
    })

    const originalFetch = globalThis.fetch
    globalThis.fetch = jest.fn(async () =>
      Response.json({ id: 1, jsonrpc: '2.0', result: '0xa' })
    ) as unknown as typeof fetch

    await expect(
      resolveNetworkRequest({
        type: 'network.request-resolve',
        requestId: request.handlerId,
        approved: true
      })
    ).resolves.toBe(true)
    expect(actions.addNetwork).toHaveBeenCalledWith(chain)
    expect(resolveRequest).toHaveBeenCalledWith(request)

    actions.addNetwork.mockClear()
    const homeCommand = { id: 8, type: 'newChain', data: { newChain: chain } }
    getState.mockReturnValue({
      ...actions,
      main: { networks: { ethereum: {} } },
      tray: { homeCommand }
    })
    await expect(
      resolveNetworkRequest({
        type: 'network.request-resolve',
        homeCommandId: homeCommand.id,
        approved: true
      })
    ).resolves.toBe(true)
    expect(actions.addNetwork).toHaveBeenCalledWith(chain)
    expect(actions.clearHomeCommand).toHaveBeenCalledWith(homeCommand.id)

    actions.addNetwork.mockClear()
    getState.mockReturnValue({
      ...actions,
      main: { networks: { ethereum: { 10: { id: 10, on: false } } } },
      tray: {}
    })
    await expect(
      resolveNetworkRequest({
        type: 'network.request-resolve',
        requestId: request.handlerId,
        approved: true
      })
    ).resolves.toBe(true)
    expect(actions.activateNetwork).toHaveBeenCalledWith('ethereum', 10, true)
    expect(actions.addNetwork).not.toHaveBeenCalled()

    globalThis.fetch = originalFetch
  })

  it('refuses an add-chain approval when the RPC reports another chain', async () => {
    const chain = {
      id: 10,
      name: 'Optimism',
      type: 'ethereum',
      primaryRpc: 'https://rpc.example.com'
    }
    const request = { handlerId: 'request-mismatch', type: 'addChain', chain }
    currentAccount.mockReturnValue({ getRequest: () => request })
    getState.mockReturnValue({
      ...actions,
      main: { networks: { ethereum: {} } },
      tray: {}
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = jest.fn(async () =>
      Response.json({ id: 1, jsonrpc: '2.0', result: '0x1' })
    ) as unknown as typeof fetch

    await expect(
      resolveNetworkRequest({
        type: 'network.request-resolve',
        requestId: request.handlerId,
        approved: true
      })
    ).rejects.toThrow('different chain ID')
    expect(actions.addNetwork).not.toHaveBeenCalled()
    expect(resolveRequest).not.toHaveBeenCalled()

    globalThis.fetch = originalFetch
  })

  it('cancels Flash orders using canonical order, account, and network data', async () => {
    const orderId = 'order-1'
    getState.mockReturnValue({
      ...actions,
      main: {
        accounts: { [address]: { id: address, address } },
        currentAccount: address,
        networks: { ethereum: { 1: { id: 1, type: 'ethereum' } } },
        orders: { [orderId]: { accountAddress: address, chainId: 1 } }
      }
    })
    providerSend.mockImplementation((_payload, done) => done({ id: 1, jsonrpc: '2.0', result: '0x1234' }))
    flashCancelOrder.mockResolvedValue(undefined)

    await expect(cancelFlashOrder(orderId)).resolves.toBe(true)
    expect(actions.initOrigin).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ chain: { id: 1, type: 'ethereum' } })
    )
    expect(providerSend).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'personal_sign',
        chainId: '0x1',
        params: [expect.stringContaining(orderId), address]
      }),
      expect.any(Function)
    )
    expect(flashCancelOrder).toHaveBeenCalledWith({ orderId, signature: '0x1234' })

    getState.mockReturnValue({
      ...actions,
      main: {
        accounts: {},
        currentAccount: '',
        networks: { ethereum: { 1: { id: 1, type: 'ethereum' } } },
        orders: { [orderId]: { accountAddress: address, chainId: 1 } }
      }
    })
    await expect(cancelFlashOrder(orderId)).resolves.toBe(false)
    expect(flashCancelOrder).toHaveBeenCalledTimes(1)
  })

  it('resolves request approval by ID instead of trusting a renderer request object', () => {
    const request = { handlerId: 'request-1', type: 'transaction' }
    currentAccount.mockReturnValue({
      getRequest: (id: string) => (id === request.handlerId ? request : undefined)
    })
    approveTransactionRequest.mockImplementation((_request, callback) => callback(null, '0xhash'))

    expect(approveRequest(request.handlerId)).toBe(true)
    expect(setRequestPending).toHaveBeenCalledWith(request)
    expect(approveTransactionRequest).toHaveBeenCalledWith(request, expect.any(Function))
    expect(setTxSent).toHaveBeenCalledWith(request.handlerId, '0xhash')
    expect(approveRequest('missing')).toBe(false)
  })

  it('routes each validated unlock method to the signer service', async () => {
    unlockApp.mockImplementation((_password, done) => done(null, true))
    unlockAppWithBiometrics.mockImplementation((_payload, done) => done(null, true))

    await expect(
      workflows.unlockSecurity({ type: 'security.unlock', method: 'password', password: 'secret' })
    ).resolves.toBeUndefined()
    expect(unlockApp).toHaveBeenCalledWith('secret', expect.any(Function))

    await expect(
      workflows.unlockSecurity({ type: 'security.unlock', method: 'native' })
    ).resolves.toBeUndefined()
    expect(unlockAppWithBiometrics).toHaveBeenCalledWith({ method: 'native' }, expect.any(Function))
  })

  it('resolves request decisions from the canonical account request', () => {
    const access = { handlerId: 'access-1', type: 'access', origin: 'origin-1', account: address }
    const switchRequest = {
      handlerId: 'switch-1',
      type: 'switchChain',
      origin: 'origin-1',
      account: address,
      chain: { id: '10', type: 'ethereum' }
    }
    const requests = { [access.handlerId]: access, [switchRequest.handlerId]: switchRequest }
    currentAccount.mockReturnValue({
      address,
      getRequest: (id: string) => requests[id],
      getSigner: jest.fn()
    })
    getAccountRecord.mockReturnValue({ address })
    getState.mockReturnValue({
      ...actions,
      main: {
        networks: { ethereum: { 10: { id: 10 } } },
        origins: { 'origin-1': { id: 'origin-1' } }
      },
      view: { badge: {}, notify: '', notifyData: {} }
    })

    expect(workflows.rejectRequest(access.handlerId)).toBe(true)
    expect(rejectRequest).toHaveBeenCalledWith(access, {
      code: 4001,
      message: 'User rejected the request'
    })
    expect(workflows.resolveAccessRequest(access.handlerId, true)).toBe(true)
    expect(setAccess).toHaveBeenCalledWith(access, true)
    expect(workflows.resolveSwitchChainRequest(switchRequest.handlerId, true)).toBe(true)
    expect(actions.switchOriginChain).toHaveBeenCalledWith('origin-1', 10, 'ethereum')
    expect(resolveRequest).toHaveBeenCalledWith(switchRequest)
    expect(workflows.clearOriginRequests(address, 'origin-1')).toBe(true)
    expect(clearRequestsByOrigin).toHaveBeenCalledWith(address, 'origin-1')
  })

  it('keeps compatibility queries pure and opens hardware recovery through a command', () => {
    const request = { handlerId: 'request-1', type: 'transaction', data: { type: '0x2' } }
    const signerSummary = {
      id: 'ledger-1',
      type: 'ledger',
      status: 'ok',
      appVersion: { major: 2, minor: 0, patch: 0 },
      model: 'Nano'
    }
    currentAccount.mockReturnValue({
      getRequest: (id: string) => (id === request.handlerId ? request : undefined),
      signer: signerSummary.id,
      lastSignerType: 'ledger'
    })
    getState.mockReturnValue({
      ...actions,
      main: { signers: { [signerSummary.id]: signerSummary } }
    })
    signerCompatibility.mockReturnValue({ signer: 'ledger', tx: 'london', compatible: false })

    expect(workflows.requestSignerCompatibility(request.handlerId)).toEqual({
      ok: true,
      compatibility: { signer: 'ledger', tx: 'london', compatible: false }
    })
    expect(signerCompatibility).toHaveBeenCalledWith(request.data, signerSummary)
    expect(actions.navDash).not.toHaveBeenCalled()

    currentAccount.mockReturnValue({
      getRequest: () => request,
      lastSignerType: 'ledger'
    })
    getState.mockReturnValue({ ...actions, main: { signers: {} } })
    expect(workflows.requestSignerCompatibility(request.handlerId)).toEqual(
      expect.objectContaining({ ok: false, error: 'no_signer' })
    )
    expect(actions.navDash).not.toHaveBeenCalled()

    getState.mockReturnValue({
      ...actions,
      main: {
        signers: {
          'ledger-1': { id: 'ledger-1', type: 'ledger', status: 'disconnected' }
        }
      }
    })
    expect(workflows.requestSignerCompatibility(request.handlerId)).toEqual(
      expect.objectContaining({ ok: false, error: 'signer_unavailable' })
    )
    expect(actions.navDash).not.toHaveBeenCalled()

    expect(workflows.openRequestSignerRecovery(request.handlerId)).toBe(true)
    expect(actions.navDash).toHaveBeenCalledWith({
      view: 'expandedSigner',
      data: { signer: 'ledger-1' }
    })
  })

  it('updates transaction approvals, fees, and nonce only for the canonical request', async () => {
    const approval = { type: 'approveGasLimit', approved: false }
    const request = {
      handlerId: 'request-1',
      type: 'transaction',
      approvals: [approval],
      recognizedActions: [{ id: 'erc20:approve' }],
      data: {
        chainId: '0x1',
        type: '0x2',
        maxPriorityFeePerGas: '0x4',
        maxFeePerGas: '0xc'
      }
    }
    currentAccount.mockReturnValue({
      getRequest: (id: string) => (id === request.handlerId ? request : undefined)
    })
    updateRequest.mockReturnValue(true)
    removeFeeUpdateNotice.mockImplementation((_id, done) => done(null))
    getState.mockReturnValue({
      ...actions,
      main: {
        networks: { ethereum: { 1: { id: 1 } } },
        networksMeta: {
          ethereum: {
            1: {
              gas: {
                price: {
                  levels: { fast: '0x2' },
                  fees: { maxBaseFeePerGas: '0x10', maxPriorityFeePerGas: '0x4' }
                }
              }
            }
          }
        }
      },
      view: { badge: {}, notify: '', notifyData: {} }
    })

    expect(workflows.confirmRequestApproval(request.handlerId, 'approveGasLimit')).toBe(true)
    expect(confirmRequestApprovalRecord).toHaveBeenCalledWith(request.handlerId, 'approveGasLimit', {})
    expect(
      workflows.updateTokenApproval({
        type: 'request.token-approval-update',
        requestKind: 'transaction',
        requestId: request.handlerId,
        actionId: 'erc20:approve',
        amount: '10'
      })
    ).toBe(true)
    expect(updateRequest).toHaveBeenCalledWith(request.handlerId, { amount: '10' }, 'erc20:approve')
    updateRequest.mockReturnValueOnce(false)
    expect(
      workflows.updateTokenApproval({
        type: 'request.token-approval-update',
        requestKind: 'transaction',
        requestId: request.handlerId,
        actionId: 'erc20:approve',
        amount: '11'
      })
    ).toBe(false)
    expect(workflows.updateTransactionFee(request.handlerId, 'baseFee', '0x2')).toBe(true)
    expect(setBaseFee).toHaveBeenCalledWith('0x2', request.handlerId, true)
    expect(workflows.setTransactionFeeDefault(request.handlerId, 'fast')).toBe(true)
    expect(actions.setGasDefault).toHaveBeenCalledWith('ethereum', 1, 'fast', '0x2')
    expect(setPriorityFee).toHaveBeenCalledWith('0x5', request.handlerId, true)
    expect(setBaseFee).toHaveBeenLastCalledWith('0x14', request.handlerId, true)
    expect(workflows.adjustTransactionNonce(request.handlerId, 1)).toBe(true)
    expect(adjustNonce).toHaveBeenCalledWith(request.handlerId, 1)
    expect(workflows.resetTransactionNonce(request.handlerId)).toBe(true)
    expect(resetNonce).toHaveBeenCalledWith(request.handlerId)
    await expect(workflows.dismissTransactionFeeNotice(request.handlerId)).resolves.toBe(true)
  })

  it('validates pending extension and updater state before acting', () => {
    getState.mockReturnValue({
      ...actions,
      main: { networks: { ethereum: {} } },
      view: {
        badge: { type: 'updateAvailable', version: '9.9.9' },
        notify: 'extensionConnect',
        notifyData: { id: 'extension-1' }
      }
    })

    expect(workflows.respondToExtension('extension-1', true)).toBe(true)
    expect(actions.trustExtension).toHaveBeenCalledWith('extension-1', true)
    expect(actions.notify).toHaveBeenCalledWith('', {})
    expect(workflows.respondToExtension('extension-2', true)).toBe(false)

    expect(workflows.respondToUpdater('skip')).toBe(true)
    expect(actions.dontRemind).toHaveBeenCalledWith('9.9.9')
    expect(actions.updateBadge).toHaveBeenCalledWith('', undefined)
    expect(updaterDismissUpdate).toHaveBeenCalledTimes(1)
  })

  it('opens request reviews from canonical request IDs', () => {
    const addToken = {
      handlerId: 'token-1',
      type: 'addToken',
      token: { address, symbol: 'TKN', decimals: 18, logoURI: '', name: 'Token', chainId: 1 }
    }
    currentAccount.mockReturnValue({
      address,
      getRequest: (id: string) => (id === addToken.handlerId ? addToken : undefined)
    })
    getState.mockReturnValue({ ...actions, main: { networks: { ethereum: {} } } })

    expect(workflows.openRequestPanel(addToken.handlerId)).toBe(true)
    expect(actions.navForward).toHaveBeenCalledWith(
      'panel',
      expect.objectContaining({
        data: { step: 'confirm', accountId: address, requestId: addToken.handlerId }
      })
    )
    expect(workflows.reviewAddTokenRequest(addToken.handlerId)).toBe(true)
    expect(resolveRequest).toHaveBeenCalledWith(addToken, null)
    expect(actions.navDash).toHaveBeenCalledWith(expect.objectContaining({ view: 'tokens' }))
  })

  it('inspects only the invoking dashboard sender', () => {
    const inspectElement = jest.fn()
    const originalEnvironment = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    inspectOwnDashWindow(
      { sender: { inspectElement } } as unknown as Pick<Electron.IpcMainInvokeEvent, 'sender'>,
      12,
      34
    )
    expect(inspectElement).toHaveBeenCalledWith(12, 34)

    process.env.NODE_ENV = originalEnvironment
  })
})
