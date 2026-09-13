import { Icon } from '@newframe/ui/icon'
import { Image } from '@newframe/ui/image'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
import { useState, type ReactNode } from 'react'

import { cva } from '../../../../../generated/styled-system/css/cva.js'

const siteIconRecipe = cva({
  base: {
    width: 'field',
    height: 'field',
    display: 'grid',
    placeItems: 'center',
    borderRadius: 'control',
    overflow: 'hidden',
    background: 'bg.control',
    color: 'text.secondary'
  }
})
const nameRecipe = cva({ base: { minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere' } })

export function RequestOrigin({
  originName,
  favicon = '',
  description
}: {
  originName: ReactNode
  favicon?: string
  description?: string
}) {
  const [failedFavicon, setFailedFavicon] = useState('')

  return (
    <Stack align='center' gap='small'>
      <span className={siteIconRecipe()}>
        {favicon && failedFavicon !== favicon ? (
          <Image alt='' source={favicon} onLoadError={() => setFailedFavicon(favicon)} />
        ) : (
          <Icon name='window' size='large' />
        )}
      </span>
      <div className={nameRecipe()}>
        <Text align='center' variant='heading'>
          {originName}
        </Text>
      </div>
      {description ? (
        <Text align='center' tone='secondary' variant='supporting'>
          {description}
        </Text>
      ) : null}
    </Stack>
  )
}
