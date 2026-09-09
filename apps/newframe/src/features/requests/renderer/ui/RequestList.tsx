import type { ReactNode } from 'react'
import { Inline } from '@newframe/ui/inline'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

export type RequestGroup = {
  id: string
  title: string
  icon?: ReactNode
  action?: ReactNode
  notice?: ReactNode
  items: ReactNode[]
  emptyText?: string
}

export function RequestList({
  groups,
  emptyText = 'No pending requests'
}: {
  groups: RequestGroup[]
  emptyText?: string
}) {
  if (!groups.length)
    return (
      <Surface border='subtle' padding='large' radius='card' tone='card'>
        <Text align='center' tone='secondary' variant='overline'>
          {emptyText}
        </Text>
      </Surface>
    )
  return (
    <Stack gap='medium'>
      {groups.map((group) => (
        <Surface border='subtle' key={group.id} padding='small' radius='card' tone='card'>
          <Stack gap='small'>
            <Inline align='center' gap='small' justify='between'>
              <Inline align='center' gap='small'>
                {group.icon}
                <Text variant='label' truncate>
                  {group.title}
                </Text>
              </Inline>
              {group.action}
            </Inline>
            {group.notice}
            <Stack gap='small'>
              {group.items.length ? (
                group.items
              ) : (
                <Text tone='secondary'>{group.emptyText ?? emptyText}</Text>
              )}
            </Stack>
          </Stack>
        </Surface>
      ))}
    </Stack>
  )
}
