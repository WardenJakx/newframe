import { HoverSwapText } from '@newframe/ui/hover-swap-text'
import { Text } from '@newframe/ui/text'

import { cva } from '../../../../generated/styled-system/css/cva.js'
import type { ClipboardCapability } from '../capabilities'
import { AddressAvatar } from './AddressAvatar'
import { CopyButton } from './CopyButton'

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
  if (!address) return ''
  return address.length > 14 ? `${address.slice(0, 8)}...${address.slice(-6)}` : address
}

export type AddressIdentityProps = {
  address?: string
  accountType?: string
  clipboard?: ClipboardCapability
  nickname?: string
  showCopy?: boolean
  showFullAddress?: boolean
}

export function AddressIdentity({
  address,
  accountType,
  clipboard,
  nickname,
  showCopy = true,
  showFullAddress = false
}: AddressIdentityProps) {
  if (!address && !nickname) return null
  const addressDisplay = showFullAddress ? address || '' : shortAddress(address)
  const display = nickname || addressDisplay
  const hasNickname = nickname && nickname !== shortAddress(address) && nickname !== address
  const displayText = (
    <Text align='end' truncate variant='code'>
      {display}
    </Text>
  )
  const addressText = showFullAddress ? (
    <span className={fullAddressRecipe()}>
      <Text align='end' variant='nanoCode'>
        {addressDisplay}
      </Text>
    </span>
  ) : (
    <Text align='end' truncate variant='code'>
      {addressDisplay}
    </Text>
  )

  return (
    <span className={addressIdentityRecipe()} data-address-identity=''>
      {address ? <AddressAvatar address={address} accountType={accountType} /> : null}
      <span className={addressTextRecipe()}>
        {hasNickname ? displayText : null}
        {address ? (
          nickname && showFullAddress ? (
            <HoverSwapText alternate={addressText}>
              <Text align='end' truncate variant='code'>
                {shortAddress(address)}
              </Text>
            </HoverSwapText>
          ) : (
            addressText
          )
        ) : !hasNickname ? (
          displayText
        ) : null}
      </span>
      {address && showCopy && clipboard ? (
        <CopyButton
          clipboard={clipboard}
          copiedLabel={`Address copied for ${display}`}
          copiedTitle='Address copied'
          label={`Copy address for ${display}`}
          title='Copy address'
          value={address}
        />
      ) : null}
    </span>
  )
}
