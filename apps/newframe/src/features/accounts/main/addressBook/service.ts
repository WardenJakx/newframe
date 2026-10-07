import type {
  AddressBookImportCommand,
  AddressBookRemoveCommand,
  AddressBookSaveCommand
} from '../../../../app/contracts/operations.ts'
import type { CanonicalStore } from '../../../../core/state/store/actions.ts'

type AddressBookState = Pick<
  CanonicalStore,
  'main' | 'saveAddressBookEntry' | 'removeAddressBookEntry' | 'importAddressBookEntries'
>

export interface AddressBookServicePorts {
  store: { getState(): AddressBookState }
}

export function createAddressBookService(ports: AddressBookServicePorts) {
  return {
    save({ address, name }: AddressBookSaveCommand) {
      const state = ports.store.getState()
      const { accounts, currentProfile } = state.main
      if (accounts[address.toLowerCase()]?.profileId === currentProfile) {
        return false
      }
      state.saveAddressBookEntry(currentProfile, address, name)
      return true
    },

    remove({ address }: AddressBookRemoveCommand) {
      const state = ports.store.getState()
      state.removeAddressBookEntry(state.main.currentProfile, address)
    },

    import({ entries }: AddressBookImportCommand) {
      const state = ports.store.getState()
      state.importAddressBookEntries(state.main.currentProfile, entries)
    }
  }
}

export type AddressBookService = ReturnType<typeof createAddressBookService>
