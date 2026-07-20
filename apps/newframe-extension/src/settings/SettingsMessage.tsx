import { Link } from '@newframe/ui/link'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

export type SettingsMessageProps = {
  action?: { href: string; label: string }
  detailLines: readonly string[]
  emphasizedDetail?: number
  title: string
}

export function SettingsMessage({ action, detailLines, emphasizedDetail, title }: SettingsMessageProps) {
  return (
    <Surface border='subtle' elevation='default' padding='large' radius='card' tone='card'>
      <Stack align='center' gap='large'>
        <Text as='strong' align='center' variant='heading'>
          {title}
        </Text>
        <Stack align='center' gap='xsmall'>
          {detailLines.map((line, index) => (
            <Text
              align='center'
              key={`${index}-${line}`}
              variant='label'
              tone={index === emphasizedDetail ? 'danger' : 'secondary'}
            >
              {line}
            </Text>
          ))}
        </Stack>
        {action ? (
          <Link appearance='action' external href={action.href}>
            <Text display='inline' variant='action' tone='accent'>
              {action.label}
            </Text>
          </Link>
        ) : null}
      </Stack>
    </Surface>
  )
}
