import { Icon, type IconName } from '@newframe/ui/icon'
import { MediaIcon } from '@newframe/ui/media-icon'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
import { useState, type ReactNode } from 'react'

import { cva } from '../../../../../generated/styled-system/css/cva.js'

const nameRecipe = cva({ base: { minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere' } })

export function RequestOrigin({
  originName,
  favicon = '',
  icon = 'window',
  description
}: {
  originName: ReactNode
  favicon?: string
  icon?: IconName
  description?: string
}) {
  const [failedFavicon, setFailedFavicon] = useState('')

  return (
    <Stack align='center' gap='small'>
      <MediaIcon
        onLoadError={() => setFailedFavicon(favicon)}
        shape='control'
        size='field'
        source={failedFavicon !== favicon ? favicon : undefined}
        tone='secondary'
      >
        <Icon name={icon} size='large' />
      </MediaIcon>
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
