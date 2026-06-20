const revealMock = {
  recog: jest.fn(),
  identity: jest.fn(),
  decode: jest.fn()
}
const fetchContractMock = jest.fn()

jest.mock('../../../../main/reveal', () => ({ default: revealMock, ...revealMock }))
jest.mock('../../../../main/contracts', () => ({ fetchContract: fetchContractMock }))

jest.mock('../../../../main/provider', () => ({ default: { on: jest.fn() }, on: jest.fn() }))
jest.mock('../../../../main/accounts', () => ({
  default: {},
  RequestMode: { Normal: 'normal' }
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
    forward: jest.fn()
  },
  forward: jest.fn()
}))

jest.mock('../../../../main/store', () => {
  const store = jest.fn()
  ;(store as any).setPermission = jest.fn()
  ;(store as any).setSignerView = jest.fn()
  ;(store as any).setPanelView = jest.fn()
  ;(store as any).observer = jest.fn()
  return { default: store, ...store }
})

let account: any
let Account: any
let reveal: any
let fetchContract: any

const accounts = { update: jest.fn() }

const accountState = {
  address: '0x690B9A9E9aa1C9dB991C7721a92d351Db4FaC990',
  name: 'Test Account'
}

beforeAll(async () => {
  Account = (await import('../../../../main/accounts/Account')).default
  reveal = (await import('../../../../main/reveal')).default
  fetchContract = (await import('../../../../main/contracts')).fetchContract
})

beforeEach(() => {
  account = new Account(accountState as any, accounts as any)
  ;(fetchContract as any).mockResolvedValueOnce(undefined)
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

      accounts.update.mockImplementationOnce(() => {})
      accounts.update.mockImplementationOnce(() => {
        expect((request as any).recognizedActions).toHaveLength(1)
        done()
      })

      account.addRequest(request)
    })
  })
})
