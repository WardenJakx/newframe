import { HoverSwapText } from '@newframe/ui/hover-swap-text'
import { IconButton } from '@newframe/ui/icon-button'
import { Text } from '@newframe/ui/text'
import { useEffect, useRef, useState } from 'react'

import { cva } from '../../../generated/styled-system/css/cva.js'
import link from '../link'

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
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(resetTimer.current), [])

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
        <IconButton
          appearance='ghost'
          icon={copied ? 'check' : 'copy'}
          label={copied ? `Address copied for ${display}` : `Copy address for ${display}`}
          onPress={(event) => {
            event.stopPropagation()
            clearTimeout(resetTimer.current)
            if (onCopy) {
              onCopy(address)
            } else {
              void link.executeCommand({ type: 'clipboard.write', text: address })
            }
            setCopied(true)
            resetTimer.current = setTimeout(() => setCopied(false), 1000)
          }}
          size='small'
          title={copied ? 'Address copied' : 'Copy address'}
          tone={copied ? 'accent' : 'neutral'}
        />
      ) : null}
    </span>
  )
}
