import { HoverSwapText } from '@newframe/ui/hover-swap-text'
import { Text } from '@newframe/ui/text'

import { cva } from '../../../../generated/styled-system/css/cva.js'
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

const fullAddressRecipe = cva({
  base: {
    minWidth: 0,
    overflowWrap: 'anywhere',
    textAlign: 'end'
  }
})

export const shortAddress = (address?: string) => {
  if (!address) return ''
  return `${address.slice(0, 8)}...${address.slice(-6)}`
}

export type AddressIdentityProps = {
  address?: string
  nickname?: string
  onCopy?: (address: string) => void
  showFullAddress?: boolean
}

export function AddressIdentity({
  address,
  nickname,
  onCopy,
  showFullAddress = false
}: AddressIdentityProps) {
  if (!address && !nickname) return null
  const addressDisplay = showFullAddress ? address || '' : shortAddress(address)
  const display = nickname || addressDisplay
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
      {nickname && address ? (
        <HoverSwapText alternate={addressText}>{displayText}</HoverSwapText>
      ) : nickname ? (
        displayText
      ) : (
        addressText
      )}
      {address ? (
        <CopyButton
          copiedLabel={`Address copied for ${display}`}
          copiedTitle='Address copied'
          label={`Copy address for ${display}`}
          onCopy={onCopy}
          title='Copy address'
          value={address}
        />
      ) : null}
    </span>
  )
}
