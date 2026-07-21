import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'

const revealMock = {
  recog: mock(),
  identity: mock(),
  decode: mock()
}
const fetchContractMock = mock()
const simulateTransactionEffectsMock = mock()
const providerMock = { on: mock(), off: mock(), send: mock() }

mock.module('../../../../main/reveal', () => ({ default: revealMock, ...revealMock }))
mock.module('../../../../main/contracts', () => ({ fetchContract: fetchContractMock }))
mock.module('../../../../main/transaction/simulation', () => ({
  simulateTransactionEffects: simulateTransactionEffectsMock
}))

mock.module('../../../../main/provider', () => ({ default: providerMock, ...providerMock }))
mock.module('../../../../main/accounts', () => ({
  default: {},
  RequestMode: { Normal: 'normal', Monitor: 'monitor' }
}))
mock.module('../../../../main/signers', () => ({ default: {} }))
mock.module('../../../../main/windows', () => ({ default: {} }))
mock.module('../../../../main/nameResolution', () => ({
  __esModule: true,
  default: {
    off: mock(),
    ready: mock(() => true),
    once: mock(),
    reverseLookup: async () => 'frame.eth'
  }
}))

mock.module('../../../../main/windows/nav', () => ({
  default: {
    forward: mock(),
    back: mock()
  },
  forward: mock(),
  back: mock()
}))

let account: any
let Account: any
let reveal: any
let fetchContract: any
let nav: any
let store: any

const accounts = { syncTransactionActivity: mock() }

const accountState = {
  address: '0x690B9A9E9aa1C9dB991C7721a92d351Db4FaC990',
  name: 'Test Account'
}

beforeAll(async () => {
  Account = (await import('../../../../main/accounts/Account')).default
  reveal = (await import('../../../../main/reveal')).default
  fetchContract = (await import('../../../../main/contracts')).fetchContract
  nav = (await import('../../../../main/windows/nav')).default
  store = (await import('../../../../main/store')).default
})

beforeEach(() => {
  mock.clearAllMocks()
  account?.close()
  store.getState().removeAccount(accountState.address.toLowerCase())
  account = new Account(accountState as any, accounts as any)
  ;(fetchContract as any).mockResolvedValueOnce(undefined)
  simulateTransactionEffectsMock.mockResolvedValue({ status: 'success', effects: [] })
})

describe('#addRequest', () => {
  it('stores request data canonically while keeping request capabilities in runtime sidecars', () => {
    const respond = mock()
    const actionData = { amount: '0x1' }
    let updateCalls = 0
    const update = (request: any, data: any) => {
      updateCalls += 1
      actionData.amount = data.amount
      request.data.data = `encoded:${data.amount}`
    }
    const request = {
      handlerId: 'runtime-capabilities',
      type: 'transaction',
      account: account.id,
      origin: 'test',
      payload: { id: 1, jsonrpc: '2.0', method: 'eth_sendTransaction', params: [] },
      data: { data: 'encoded:0x1' },
      approvals: [{ type: 'approveGasLimit', approved: false, data: {} }],
      recognizedActions: [{ id: 'erc20:approve', data: actionData, update }]
    }

    account.addRequest(request, respond)

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
    expect(respond).toHaveBeenCalledWith({ id: 1, jsonrpc: '2.0', result: 'ok' })
    expect(account.requests[request.handlerId]).toBeUndefined()
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
})

describe('#clearRequest', () => {
  it('opens the next actionable request when the current request is cleared', () => {
    const first = {
      handlerId: 'first',
      type: 'transaction',
      created: 1
    }
    const second = {
      handlerId: 'second',
      type: 'transaction',
      created: 2
    }
    const newest = {
      handlerId: 'newest',
      type: 'transaction',
      created: 3
    }
    const confirmed = {
      handlerId: 'confirmed',
      type: 'transaction',
      status: 'confirmed',
      created: 0
    }
    const monitoring = {
      handlerId: 'monitoring',
      type: 'transaction',
      mode: 'monitor',
      status: 'confirming',
      created: 0
    }

    ;[first, second, newest, confirmed, monitoring].forEach((request) => {
      store.getState().upsertAccountRequest(account.id, request)
    })
    store.setState((state: any) => {
      state.windows.panel.nav = [
        { view: 'requestView', data: { requestId: 'first' } },
        { view: 'expandedModule', data: { id: 'requests', account: account.id } }
      ]
    })

    account.clearRequest('first')

    expect(store.getState().navClearReq).toHaveBeenCalledWith('first', true)
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
