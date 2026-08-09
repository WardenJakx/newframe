import { describe, expect, it, mock } from 'bun:test'

import { createTestStore } from '../../../../test/support/createTestStore'
import { createAccountService } from './service'

const first = '0x1111111111111111111111111111111111111111'
const second = '0x2222222222222222222222222222222222222222'

describe('account mutation service', () => {
  it('revalidates account, signer, order, selection, and permission preconditions', async () => {
    const store = createTestStore({
      main: {
        accounts: {
          [first]: { id: first, address: first, signer: 'seed-1' },
          [second]: { id: second, address: second, signer: '' }
        },
        accountOrder: [first, second],
        origins: { 'origin-1': {} },
        permissions: { [first]: { origin: { handlerId: 'origin' } } }
      }
    })
    const remove = mock((_accountId: string) => undefined)
    const rename = mock((_accountId: string, _name: string) => undefined)
    const selectAccount = mock(async (_accountId: string) => undefined)
    const removeSigner = mock((_signerId: string) => undefined)
    const clearRequestsByOrigin = mock((_accountId: string, _originId: string) => undefined)
    const addressChainUsage = mock(async (_addresses: string[]) => [
      { address: first, chainIds: [1], complete: true }
    ])
    const service = createAccountService({
      accounts: {
        clearRequestsByOrigin,
        get: (id: string) => store.getState().main.accounts[id],
        remove,
        rename
      } as never,
      addressChainUsage,
      selectAccount,
      signers: { get: () => ({ id: 'seed-1', type: 'seed' }), remove: removeSigner },
      store: store.store
    })

    expect(await service.select('missing')).toBeFalse()
    expect(await service.select(first)).toBeTrue()
    expect(selectAccount.mock.calls).toEqual([[first]])
    expect(service.rename('missing', 'Name')).toBeFalse()
    expect(service.rename(first, 'Name')).toBeTrue()
    expect(service.reorder(first, 'missing')).toBeFalse()
    expect(service.reorder(first, second)).toBeTrue()
    expect(store.getState().main.accountOrder).toEqual([second, first])
    expect(service.clearPermission(first, 'missing')).toBeFalse()
    expect(service.clearPermission(first, 'origin')).toBeTrue()
    expect(store.getState().main.permissions[first]).toEqual({})
    expect(await service.addressChainUsage([first])).toEqual([
      { address: first, chainIds: [1], complete: true }
    ])
    expect(addressChainUsage.mock.calls).toEqual([[[first]]])
    expect(service.removeOrigin('missing')).toBeFalse()
    expect(service.removeOrigin('origin-1')).toBeTrue()
    expect(clearRequestsByOrigin.mock.calls).toEqual([
      [first, 'origin-1'],
      [second, 'origin-1']
    ])
    expect(store.getState().main.origins['origin-1']).toBeUndefined()
    expect(service.remove(first, true)).toBeTrue()
    expect(remove.mock.calls).toEqual([[first]])
    expect(removeSigner.mock.calls).toEqual([['seed-1']])
  })
})
