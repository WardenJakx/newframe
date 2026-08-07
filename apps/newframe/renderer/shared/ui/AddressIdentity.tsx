import { HoverSwapText } from '@newframe/ui/hover-swap-text'
import { IconButton } from '@newframe/ui/icon-button'
import { Text } from '@newframe/ui/text'
import { useEffect, useRef, useState } from 'react'

import { cva } from '../../../generated/styled-system/css/cva.js'

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
  name?: string
  onCopy?: () => void
}

export function AddressIdentity({ address, name, onCopy }: AddressIdentityProps) {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(resetTimer.current), [])

  if (!address && !name) return null
  const display = name || shortAddress(address)
  const displayText = (
    <Text align='end' truncate variant='code'>
      {display}
    </Text>
  )

  return (
    <span className={addressIdentityRecipe()} data-address-identity=''>
      {name && address ? (
        <HoverSwapText
          alternate={
            <span className={fullAddressRecipe()}>
              <Text align='end' variant='nanoCode'>
                {address}
              </Text>
            </span>
          }
        >
          {displayText}
        </HoverSwapText>
      ) : (
        displayText
      )}
      {address && onCopy ? (
        <IconButton
          appearance='ghost'
          icon={copied ? 'check' : 'copy'}
          label={copied ? `Address copied for ${display}` : `Copy address for ${display}`}
          onPress={() => {
            clearTimeout(resetTimer.current)
            onCopy()
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
