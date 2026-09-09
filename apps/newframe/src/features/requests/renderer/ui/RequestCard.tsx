import type { ReactNode } from 'react'
import { Button } from '@newframe/ui/button'
import { Inline } from '@newframe/ui/inline'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import StatusGlyph from '../../../../shared/renderer/ui/StatusGlyph'
import { cva } from '../../../../../generated/styled-system/css/cva.js'

const iconRecipe = cva({
  base: {
    display: 'grid',
    width: 'icon-button-medium',
    height: 'icon-button-medium',
    flex: 'none',
    placeItems: 'center',
    overflow: 'hidden',
    borderWidth: 'thin',
    borderStyle: 'solid',
    borderColor: 'border',
    borderRadius: 'pill',
    background: 'bg.control',
    color: 'action.primary'
  }
})

const contentRecipe = cva({ base: { width: '100%', minWidth: 0 } })

export type RequestCardProps = {
  title: string
  icon?: ReactNode
  status: string
  tone?: 'accent' | 'danger' | 'success'
  state?: 'pending' | 'failed' | 'completed'
  aside?: ReactNode
  notice?: ReactNode
  children?: ReactNode
  headerMode?: boolean
  label?: string
  onOpen: () => void
}

export function RequestCard({
  title,
  icon,
  status,
  tone = 'accent',
  state = 'pending',
  aside,
  notice,
  children,
  headerMode,
  label,
  onOpen
}: RequestCardProps) {
  const content = (
    <div className={contentRecipe()}>
      <Stack gap='small'>
        <Inline align='center' gap='small'>
          {icon ? <span className={iconRecipe()}>{icon}</span> : null}
          <Stack gap='xsmall' grow>
            <Text variant='label' truncate>
              {title}
            </Text>
            <Inline align='center' gap='xsmall'>
              <StatusGlyph size='small' state={state} />
              <Text tone={tone} variant='caption'>
                {status}
              </Text>
            </Inline>
          </Stack>
          {aside}
        </Inline>
        {children}
        {notice ? <div role='alert'>{notice}</div> : null}
      </Stack>
    </div>
  )
  return headerMode ? (
    <Surface border='subtle' padding='small' radius='card' tone='card'>
      {content}
    </Surface>
  ) : (
    <Button
      appearance='outlinedSelection'
      label={label ?? `Open ${title}`}
      onPress={onOpen}
      size='list'
      width='full'
    >
      {content}
    </Button>
  )
}
