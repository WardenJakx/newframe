const revealMock = {
  recog: jest.fn(),
  identity: jest.fn(),
  decode: jest.fn()
}
const fetchContractMock = jest.fn()
const simulateTransactionEffectsMock = jest.fn()

jest.mock('../../../../main/reveal', () => ({ default: revealMock, ...revealMock }))
jest.mock('../../../../main/contracts', () => ({ fetchContract: fetchContractMock }))
jest.mock('../../../../main/transaction/simulation', () => ({
  simulateTransactionEffects: simulateTransactionEffectsMock
}))

jest.mock('../../../../main/provider', () => ({ default: { on: jest.fn() }, on: jest.fn() }))
jest.mock('../../../../main/accounts', () => ({
  default: {},
  RequestMode: { Normal: 'normal', Monitor: 'monitor' }
}))
jest.mock('../../../../main/signers', () => ({ default: {} }))
jest.mock('../../../../main/windows', () => ({ default: {} }))
jest.mock('../../../../main/ens', () => ({
  __esModule: true,
  default: {
    ready: jest.fn(() => true),
    once: jest.fn(),
    reverseLookup: async () => 'frame.eth'
  }
}))

jest.mock('../../../../main/windows/nav', () => ({
  default: {
    forward: jest.fn(),
    back: jest.fn()
  },
  forward: jest.fn(),
  back: jest.fn()
}))

jest.mock('../../../../main/store', () => {
  const store = jest.fn()
  ;(store as any).setPermission = jest.fn()
  ;(store as any).setSignerView = jest.fn()
  ;(store as any).setPanelView = jest.fn()
  ;(store as any).navClearReq = jest.fn()
  ;(store as any).observer = jest.fn()
  return { default: store, ...store }
})

let account: any
let Account: any
let reveal: any
let fetchContract: any
let nav: any
let store: any

const accounts = { update: jest.fn() }

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
  jest.clearAllMocks()
  account = new Account(accountState as any, accounts as any)
  ;(fetchContract as any).mockResolvedValueOnce(undefined)
  simulateTransactionEffectsMock.mockResolvedValue({ status: 'success', effects: [] })
})

describe('#addRequest', () => {
  describe('recognizing requests', () => {
    it('recognizes an ERC-20 approval', (done) => {
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
          id: 'erc20:approve'
        }
      ])

      let asserted = false
      accounts.update.mockImplementation(() => {
        if (!asserted && (request as any).recognizedActions?.length) {
          asserted = true
          expect((request as any).recognizedActions).toHaveLength(1)
          done()
        }
      })

      account.addRequest(request)
    })
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

    account.requests = { first, second, newest, confirmed, monitoring }
    store.mockImplementation((path: string) =>
      path === 'windows.panel.nav'
        ? [
            { view: 'requestView', data: { requestId: 'first' } },
            { view: 'expandedModule', data: { id: 'requests', account: account.id } }
          ]
        : undefined
    )

    account.clearRequest('first')

    expect(store.navClearReq).toHaveBeenCalledWith('first', true)
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

    store.mockImplementation((path: string) => {
      if (path === 'selected.current') return account.id
      if (path === 'tray.open') return true
      if (path === 'windows.panel.nav') {
        return [
          { view: 'requestView', data: { requestId: 'first' } },
          { view: 'expandedModule', data: { id: 'requests', account: account.id } }
        ]
      }
      return undefined
    })

    account.addRequest(request)

    expect(nav.back).not.toHaveBeenCalled()
    expect(nav.forward).not.toHaveBeenCalled()
  })
})
