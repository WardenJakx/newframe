import { Icon } from '@newframe/ui/icon'
import { Image } from '@newframe/ui/image'
import { MediaBadge } from '@newframe/ui/media-badge'
import makeBlockie from 'ethereum-blockies-base64'
import { useMemo } from 'react'

import { cva } from '../../../../generated/styled-system/css/cva.js'
import { signerIconName } from './signerPresentation'

// Keep the badge's protruding edge inside address rows that clip their content.
const avatarRecipe = cva({
  base: { display: 'inline-flex', flexShrink: 0 },
  variants: {
    size: {
      sm: {
        paddingBlockStart: 'calc(token(spacing.5) / 2)',
        paddingInlineStart: 'calc(token(spacing.5) / 2)'
      },
      md: {
        paddingBlockStart: 'calc(token(spacing.7) / 2)',
        paddingInlineStart: 'calc(token(spacing.7) / 2)'
      }
    }
  }
})

export function AddressAvatar({
  address,
  accountType,
  size = 'sm'
}: {
  address?: string
  accountType?: string
  size?: 'sm' | 'md'
}) {
  const normalized = address?.trim().toLowerCase() || ''
  const type = accountType?.toLowerCase()
  const knownType =
    type && ['ring', 'seed', 'address', 'ledger', 'trezor', 'lattice', 'safe', 'airgap'].includes(type)
  const source = useMemo(
    () => (/^0x[0-9a-f]{40}$/.test(normalized) ? makeBlockie(normalized) : undefined),
    [normalized]
  )
  return (
    <span className={avatarRecipe({ size })}>
      <MediaBadge
        badge={source && knownType ? <Icon name={signerIconName(type)} size='small' /> : undefined}
        decorative
        size={size === 'md' ? 'medium' : 'small'}
      >
        {source ? <Image alt='' source={source} size='fill' /> : <Icon name='accounts' size='small' />}
      </MediaBadge>
    </span>
  )
}
