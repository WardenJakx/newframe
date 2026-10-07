import { expect, it } from 'bun:test'

import { createTestStore } from '../../../../../test/support/createTestStore.ts'
import { DEFAULT_PROFILE_ID } from '../../../../app/contracts/state/main.ts'
import { createAddressBookService } from './service.ts'

const account = `0x${'a'.repeat(40)}`
const friend = `0x${'b'.repeat(40)}`
const checksummed = (address: string) => `0x${address.slice(2).toUpperCase()}`

it('names addresses in the active profile and refuses to name its accounts', () => {
  const store = createTestStore({
    main: {
      profiles: {
        [DEFAULT_PROFILE_ID]: { id: DEFAULT_PROFILE_ID, name: 'Profile 1' },
        work: { id: 'work', name: 'Work' }
      },
      profileOrder: [DEFAULT_PROFILE_ID, 'work'],
      currentProfile: 'work',
      accounts: {
        [account]: {
          id: account,
          profileId: 'work',
          address: account,
          name: 'Mine',
          lastSignerType: 'address',
          status: 'ok',
          signer: '',
          requests: {},
          created: 'test:1'
        }
      }
    }
  })
  const service = createAddressBookService({ store: store.store })

  expect(service.save({ type: 'address-book.save', address: checksummed(account), name: 'Mine' })).toBeFalse()
  expect(service.save({ type: 'address-book.save', address: checksummed(friend), name: 'Friend' })).toBeTrue()
  service.import({ type: 'address-book.import', entries: [{ address: account, name: 'Mine' }] })
  expect(store.getState().main.addressBook).toEqual({ work: { [friend]: 'Friend' } })

  service.remove({ type: 'address-book.remove', address: checksummed(friend) })
  expect(store.getState().main.addressBook).toEqual({ work: {} })
})
