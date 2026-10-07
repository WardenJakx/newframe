import { HoverSwapText } from '@newframe/ui/hover-swap-text'

import { cva } from '../../../../generated/styled-system/css/cva.js'
import { useAddressName } from '../addressNames.tsx'
import { shortAddress } from './AddressIdentity.tsx'

const fullAddressRecipe = cva({ base: { overflowWrap: 'anywhere' } })

export function AddressText({ address, name }: { address: string; name?: string }) {
  const label = useAddressName(address)?.name ?? name
  return (
    <HoverSwapText alternate={<span className={fullAddressRecipe()}>{address}</span>}>
      {label ?? shortAddress(address)}
    </HoverSwapText>
  )
}
