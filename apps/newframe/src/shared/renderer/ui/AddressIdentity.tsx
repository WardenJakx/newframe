import { HoverSwapText } from '@newframe/ui/hover-swap-text'
import { Text } from '@newframe/ui/text'

import { cva } from '../../../../generated/styled-system/css/cva.js'
import { useAddressName } from '../addressNames.tsx'
import type { ClipboardCapability } from '../capabilities.ts'
import { AddressAvatar } from './AddressAvatar.tsx'
import { CopyButton } from './CopyButton.tsx'

const addressIdentityRecipe = cva({
  base: {
    display: 'inline-flex',
    minWidth: 0,
    maxWidth: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 'xsmall'
  }
})

const addressTextRecipe = cva({
  base: { display: 'flex', flexDirection: 'column', minWidth: 0 }
})

const fullAddressRecipe = cva({
  base: {
    minWidth: 0,
    overflowWrap: 'anywhere',
    textAlign: 'end'
  }
})

export const shortAddress = (address?: string) => {
  if (!address) {
    return ''
  }
  return address.length > 14 ? `${address.slice(0, 8)}...${address.slice(-6)}` : address
}

export type AddressIdentityProps = {
  address: string
  accountType?: string
  clipboard?: ClipboardCapability
  name?: string
  showCopy?: boolean
  showFullAddress?: boolean
}

// `name` is a fallback the caller knows, such as a request's ENS name; the profile's name wins.
export function AddressIdentity({
  address,
  accountType,
  clipboard,
  name,
  showCopy = true,
  showFullAddress = false
}: AddressIdentityProps) {
  const known = useAddressName(address)
  const label = known?.name ?? name
  const fullAddress = (
    <span className={fullAddressRecipe()}>
      <Text align='end' variant='nanoCode'>
        {address}
      </Text>
    </span>
  )
  const copyName = label ?? shortAddress(address)

  return (
    <span className={addressIdentityRecipe()} data-address-identity=''>
      <AddressAvatar address={address} accountType={accountType ?? known?.accountType} />
      <span className={addressTextRecipe()}>
        {label ? (
          <Text align='end' truncate variant='code'>
            {label}
          </Text>
        ) : null}
        {showFullAddress ? (
          fullAddress
        ) : (
          <HoverSwapText alternate={fullAddress}>
            <Text align='end' truncate variant='code'>
              {shortAddress(address)}
            </Text>
          </HoverSwapText>
        )}
      </span>
      {showCopy && clipboard ? (
        <CopyButton
          clipboard={clipboard}
          copiedLabel={`Address copied for ${copyName}`}
          copiedTitle='Address copied'
          label={`Copy address for ${copyName}`}
          title='Copy address'
          value={address}
        />
      ) : null}
    </span>
  )
}
