import { afterEach, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { EventEmitter } from 'events'

import { createRendererAuthorizationRegistry } from '../ipc/authorization'
import { createRendererPrincipal, decideWalletAction } from '../authority'

const revealMock = {
  recog: mock(),
  identity: mock(),
  decode: mock()
}
const fetchContractMock = mock()
const simulateTransactionEffectsMock = mock()
const providerMock = { on: mock(), off: mock(), send: mock(), getL1GasCost: mock() }
const signersMock = { get: mock() }
const windowsMock = { showTray: mock() }
const navMock = { forward: mock(), back: mock() }

mock.module('../reveal', () => ({ ...revealMock }))
mock.module('../contracts', () => ({ fetchContract: fetchContractMock }))
mock.module('../signers', () => ({ default: signersMock }))
mock.module('../windows', () => ({ default: windowsMock }))
mock.module('../nameResolution', () => ({
  __esModule: true,
  default: {
    off: mock(),
    ready: mock(() => true),
    once: mock(),
    reverseLookup: async () => 'frame.eth'
  }
}))

let account: any
let Account: any
let reveal: any
let fetchContract: any
let nav: any
let store: any
const nameResolution = {
  off: mock(),
  ready: mock(() => true),
  once: mock(),
  reverseLookup: mock(async () => 'frame.eth')
}

const accounts = { syncTransactionActivity: mock() }
const requestLifecycle = {
  pending: new Map<string, RPCRequestCallback>(),
  bind: mock(),
  create(respond: RPCRequestCallback, requestId = crypto.randomUUID()) {
    this.pending.set(requestId, respond)
    return requestId
  },
  respond(requestId: string, response: RPCResponsePayload) {
    const callback = this.pending.get(requestId)
    if (!callback) return false
    this.pending.delete(requestId)
    callback(response)
    return true
  },
  resolve(request: any, result?: unknown) {
    return this.respond(request.handlerId, {
      id: request.payload.id,
      jsonrpc: request.payload.jsonrpc,
      result
    })
  },
  reject(request: any, error: EVMError) {
    return this.respond(request.handlerId, {
      id: request.payload.id,
      jsonrpc: request.payload.jsonrpc,
      error
    })
  }
}

const accountState = {
  address: '0x690B9A9E9aa1C9dB991C7721a92d351Db4FaC990',
  name: 'Test Account'
}

beforeAll(async () => {
  Account = (await import('./Account')).default
  reveal = revealMock
  fetchContract = (await import('../contracts')).fetchContract
  nav = navMock
  store = (await import('../store')).default
})

function createAccount(profileActive = true) {
  return new Account(
    accountState as any,
    accounts as any,
    store,
    providerMock as any,
    { simulateTransactionEffects: simulateTransactionEffectsMock },
    nameResolution,
    revealMock,
    {
      navigation: navMock,
      now: Date.now,
      notify: mock(),
      openBlockExplorer: mock(),
      persistence: { flush: mock() },
      schedule: (callback: () => void, delay: number) => setTimeout(callback, delay),
      signers: signersMock,
      windows: windowsMock
    },
    requestLifecycle,
    profileActive
  )
}

beforeEach(() => {
  mock.clearAllMocks()
  account?.close()
  requestLifecycle.pending.clear()
  store.getState().removeAccount(accountState.address.toLowerCase())
  account = createAccount()
  ;(fetchContract as any).mockResolvedValueOnce(undefined)
  simulateTransactionEffectsMock.mockResolvedValue({ status: 'success', effects: [] })
})

afterEach(() => {
  account?.close()
  store.getState().removeAccount(accountState.address.toLowerCase())
})

describe('#addRequest', () => {
  it('stores request data canonically, keeps capabilities in sidecars, and settles exactly once', () => {
    const externalResponse = mock()
    const handlerId = requestLifecycle.create(externalResponse)
    const actionData = { amount: '0x1' }
    let updateCalls = 0
    const update = (request: any, data: any) => {
      updateCalls += 1
      actionData.amount = data.amount
      request.data.data = `encoded:${data.amount}`
    }
    const request = {
      handlerId,
      type: 'transaction',
      account: account.id,
      origin: 'test',
      payload: { id: 1, jsonrpc: '2.0', method: 'eth_sendTransaction', params: [] },
      data: { data: 'encoded:0x1' },
      approvals: [{ type: 'approveGasLimit', approved: false, data: {} }],
      recognizedActions: [{ id: 'erc20:approve', data: actionData, update }]
    }
    const rendererPrincipal = createRendererPrincipal({
      clientType: 'wallet-ui',
      entrypoint: 'tray',
      webContentsId: 7,
      windowInstanceId: 'wallet-window'
    })
    const decision = decideWalletAction(rendererPrincipal, request as any)
    if (decision.outcome !== 'prompt') throw new Error('renderer request was not prompt-authorized')
    ;(request as any).authorization = decision.authorization

    requestLifecycle.bind(request as any)
    account.addRequest(request)

    const renderer = Object.assign(new EventEmitter(), { id: 7 })
    const renderers = createRendererAuthorizationRegistry(() => 'wallet-window')
    renderers.registerRenderer(renderer as never, 'wallet-ui', 'tray')
    renderer.emit('destroyed')

    expect(account.requests[request.handlerId]).toMatchObject({
      authorization: {
        decision: 'prompt',
        principal: { kind: 'renderer', webContentsId: 7, windowInstanceId: 'wallet-window' }
      }
    })
    expect(requestLifecycle.pending.has(request.handlerId)).toBe(true)
    expect('responseHandlers' in account).toBe(false)

    const canonical = store.getState().main.accounts[account.id].requests[request.handlerId]
    expect(canonical.recognizedActions[0].update).toBeUndefined()
    expect(() => structuredClone(canonical)).not.toThrow()

    expect(account.approveRequest(request.handlerId, 'approveGasLimit', {})).toBe(true)
    expect(account.requests[request.handlerId].approvals[0].approved).toBe(true)
    expect(account.updateRecognizedAction(request.handlerId, 'erc20:approve', { amount: '0x2' })).toBe(true)
    expect(updateCalls).toBe(1)
    expect(account.requests[request.handlerId].data.data).toBe('encoded:0x2')
    expect(account.requests[request.handlerId].recognizedActions[0].data.amount).toBe('0x2')

    account.resolveRequest(request, 'ok')
    account.resolveRequest(request, 'late')
    account.rejectRequest(request, { code: 4001, message: 'late rejection' })
    expect(externalResponse.mock.calls).toEqual([[{ id: 1, jsonrpc: '2.0', result: 'ok' }]])
    expect(account.requests[request.handlerId]).toBeUndefined()
    expect((account as any).actionUpdateHandlers.size).toBe(0)
    expect(requestLifecycle.pending.has(handlerId)).toBe(false)
    renderers.dispose()
  })

  describe('recognizing requests', () => {
    it('recognizes an ERC-20 approval', async () => {
      const actionData = { amount: '0x1' }
      const request = {
        handlerId: '123456',
        type: 'transaction',
        data: {
          chainId: '0x539',
          to: '0x6887246668a3b87F54DeB3b94Ba47a6f63F32985',
          data: '0x095ea7b30000000000000000000000009bc5baf874d2da8d216ae9f137804184ee5afef40000000000000000000000000000000000000000000000000000000000011170'
        }
      }

      ;(reveal.recog as any).mockResolvedValue([
        {
          id: 'erc20:approve',
          data: actionData,
          update: (request: any, { amount }: { amount: string }) => {
            actionData.amount = amount
            request.data.data = `encoded:${amount}`
          }
        }
      ])

      account.addRequest(request)
      await Promise.resolve()
      await Promise.resolve()

      expect(account.requests[request.handlerId].recognizedActions).toEqual([
        { id: 'erc20:approve', data: { amount: '0x1' } }
      ])
      expect(() =>
        account.updateRecognizedAction(request.handlerId, 'erc20:approve', { amount: '0x2' })
      ).not.toThrow()
      expect(account.requests[request.handlerId].data.data).toBe('encoded:0x2')
      expect(account.requests[request.handlerId].recognizedActions[0].data.amount).toBe('0x2')
    })

    it('waits for token recognition before simulating the transaction', async () => {
      let resolveRecognition: (actions: any[]) => void = () => {}
      reveal.recog.mockImplementationOnce(
        () => new Promise<any[]>((resolve) => (resolveRecognition = resolve))
      )
      reveal.decode.mockResolvedValueOnce(undefined)

      const request = {
        handlerId: 'transfer-request',
        type: 'transaction',
        data: {
          chainId: '0x1',
          to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          data: '0xa9059cbb00000000000000000000000000000000000000000000000000000000000013370000000000000000000000000000000000000000000000000000000007ed6b40'
        }
      }

      account.addRequest(request)
      await Promise.resolve()

      expect(simulateTransactionEffectsMock).not.toHaveBeenCalled()

      resolveRecognition([
        {
          id: 'erc20:transfer',
          data: {
            amount: '0x7ed6b40',
            contract: request.data.to,
            decimals: 6,
            name: 'USD Coin',
            symbol: 'USDC'
          }
        }
      ])
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()

      expect(simulateTransactionEffectsMock).toHaveBeenCalledTimes(1)
      expect(simulateTransactionEffectsMock.mock.calls[0][0]).toMatchObject({
        recognizedActions: [
          {
            id: 'erc20:transfer',
            data: { contract: request.data.to, decimals: 6, symbol: 'USDC' }
          }
        ]
      })
    })
  })
})

describe('creation-block listener lifecycle', () => {
  it('removes the provider listener after resolving the creation block', () => {
    const listener = providerMock.on.mock.calls.find(([event]) => event === 'connect')?.[1]
    providerMock.send.mockImplementationOnce((_payload, respond) => respond({ result: '0x64' }))

    listener()

    expect(account.created).toMatch(/^100:/)
    expect(providerMock.off).toHaveBeenCalledWith('connect', listener)
  })

  it('removes the provider listener when the account handle closes', () => {
    const listener = providerMock.on.mock.calls.find(([event]) => event === 'connect')?.[1]

    account.close()

    expect(providerMock.off).toHaveBeenCalledWith('connect', listener)
  })

  it('ignores a late creation-block response after canonical removal', () => {
    const listener = providerMock.on.mock.calls.find(([event]) => event === 'connect')?.[1]
    providerMock.send.mockImplementationOnce((_payload, respond) => respond({ result: '0x64' }))
    store.getState().removeAccount(account.id)

    expect(() => listener()).not.toThrow()
    expect(providerMock.off).toHaveBeenCalledWith('connect', listener)
  })

  it('starts profile-owned network callbacks only while the Account is active', async () => {
    account.close()
    store.getState().removeAccount(account.id)
    mock.clearAllMocks()

    account = createAccount(false)

    expect(providerMock.on).not.toHaveBeenCalledWith('connect', expect.any(Function))
    expect(nameResolution.reverseLookup).not.toHaveBeenCalled()

    account.setProfileActive(true)
    await Promise.resolve()

    expect(providerMock.on).toHaveBeenCalledWith('connect', expect.any(Function))
    expect(nameResolution.reverseLookup).toHaveBeenCalledTimes(1)

    const listener = providerMock.on.mock.calls.find(([event]) => event === 'connect')?.[1]
    account.setProfileActive(false)
    expect(providerMock.off).toHaveBeenCalledWith('connect', listener)
  })

  it('keeps a started reverse-name write but schedules no inactive follow-up', async () => {
    let resolveLookup: (name: string) => void = () => {}
    account.close()
    store.getState().removeAccount(account.id)
    mock.clearAllMocks()
    nameResolution.reverseLookup.mockImplementationOnce(
      () => new Promise<string>((resolve) => (resolveLookup = resolve))
    )
    account = createAccount()

    account.setProfileActive(false)
    resolveLookup('late.frame.eth')
    await Promise.resolve()
    await Promise.resolve()

    expect(account.ensName).toBe('late.frame.eth')
    expect(nameResolution.reverseLookup).toHaveBeenCalledTimes(1)
  })
})

describe('#clearRequest', () => {
  const pendingRequest = (handlerId: string, created: number, state = {}) => ({
    handlerId,
    type: 'transaction',
    created,
    ...state
  })

  it('opens the next actionable request when the current request is cleared', () => {
    ;[
      pendingRequest('first', 1),
      pendingRequest('second', 2),
      pendingRequest('newest', 3),
      pendingRequest('confirmed', 0, { status: 'confirmed' }),
      pendingRequest('monitoring', 0, { mode: 'monitor', status: 'confirming' })
    ].forEach((request) => {
      store.getState().upsertAccountRequest(account.id, request)
    })
    store.setState((state: any) => {
      state.windows.panel.nav = [
        { view: 'requestView', data: { requestId: 'first' } },
        { view: 'expandedModule', data: { id: 'requests', account: account.id } }
      ]
    })

    const navClearReq = spyOn(store.getState(), 'navClearReq')
    account.clearRequest('first')

    expect(navClearReq).toHaveBeenCalledWith('first', true)
    expect(nav.forward).toHaveBeenCalledWith('panel', {
      view: 'requestView',
      data: {
        step: 'confirm',
        accountId: account.id,
        requestId: 'second'
      }
    })
  })

  it('keeps the current request open when another request is queued', () => {
    const request = {
      handlerId: 'second',
      type: 'transaction',
      origin: 'newframe-contracts.local',
      account: account.id,
      data: {
        chainId: '0x539',
        to: '0x6887246668a3b87F54DeB3b94Ba47a6f63F32985'
      }
    }

    store.setState((state: any) => {
      state.main.currentAccount = account.id
      state.tray.open = true
      state.windows.panel.nav = [
        { view: 'requestView', data: { requestId: 'first' } },
        { view: 'expandedModule', data: { id: 'requests', account: account.id } }
      ]
    })

    account.addRequest(request)

    expect(nav.back).not.toHaveBeenCalled()
    expect(nav.forward).not.toHaveBeenCalled()
  })
})
