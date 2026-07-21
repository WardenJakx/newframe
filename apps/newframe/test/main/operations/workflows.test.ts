import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'

const getSelectedAddresses = mock()
const setSigner = mock()
const accountsChanged = mock()
const resolveAddress = mock()

mock.module('../../../main/accounts', () => ({
  default: { getSelectedAddresses, setSigner }
}))
mock.module('../../../main/provider', () => ({ default: { accountsChanged } }))
mock.module('../../../main/nameResolution', () => ({ default: { resolveAddress } }))

let resolveName: typeof import('../../../main/operations/workflows').resolveName
let selectAccount: typeof import('../../../main/operations/workflows').selectAccount

beforeAll(async () => {
  const workflows = await import('../../../main/operations/workflows')
  resolveName = workflows.resolveName
  selectAccount = workflows.selectAccount
})

beforeEach(() => {
  getSelectedAddresses.mockReset()
  setSigner.mockReset()
  accountsChanged.mockReset()
  resolveAddress.mockReset()
})

describe('operation workflows', () => {
  it('preserves account selection and provider account-change orchestration', async () => {
    const account = { id: 'selected' }
    getSelectedAddresses.mockReturnValueOnce(['previous']).mockReturnValueOnce(['selected'])
    setSigner.mockImplementation((_id, callback) => callback(null, account))

    await expect(selectAccount('selected')).resolves.toMatchObject(account)
    expect(setSigner).toHaveBeenCalledWith('selected', expect.any(Function))
    expect(accountsChanged).toHaveBeenCalledWith(['selected'])
  })

  it('does not publish an account-change notification when addresses are unchanged', async () => {
    getSelectedAddresses.mockReturnValue(['selected'])
    setSigner.mockImplementation((_id, callback) => callback(null, { id: 'selected' }))

    await selectAccount('selected')

    expect(accountsChanged).not.toHaveBeenCalled()
  })

  it('passes account-selection failures through to both API paths', async () => {
    const error = new Error('could not set signer')
    getSelectedAddresses.mockReturnValue([])
    setSigner.mockImplementation((_id, callback) => callback(error))

    await expect(selectAccount('missing')).rejects.toBe(error)
    expect(accountsChanged).not.toHaveBeenCalled()
  })

  it('uses the existing name-resolution service', async () => {
    resolveAddress.mockResolvedValue('0x1111111111111111111111111111111111111111')

    await expect(resolveName('alice.eth')).resolves.toBe('0x1111111111111111111111111111111111111111')
    expect(resolveAddress).toHaveBeenCalledWith('alice.eth')
  })
})
