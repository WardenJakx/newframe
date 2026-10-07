import { createContext, useContext } from 'react'

import type { MainTrayProjection } from '../../platform/state-sync/contract/projections.ts'

type AddressNames = MainTrayProjection['addressNames']

// Each tray root provides the active profile's names; previews and tests see none.
export const AddressNamesContext = createContext<AddressNames>({})

export function useAddressName(address?: string) {
  const names = useContext(AddressNamesContext)
  return address ? names[address.toLowerCase()] : undefined
}
