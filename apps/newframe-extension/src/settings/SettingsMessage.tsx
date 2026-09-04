import { Link } from '@newframe/ui/link'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

export type SettingsMessageProps = {
  action?: { href: string; label: string }
  detail: string
  title: string
}

export function SettingsMessage({ action, detail, title }: SettingsMessageProps) {
  return (
    <Surface border='subtle' elevation='default' padding='large' radius='card' tone='card'>
      <Stack align='center' gap='medium'>
        <Text as='strong' align='center' variant='sectionTitle'>
          {title}
        </Text>
        <Text align='center' variant='body' tone='secondary'>
          {detail}
        </Text>
        {action ? (
          <Link external href={action.href}>
            <Text display='inline' variant='action' tone='accent'>
              {action.label}
            </Text>
          </Link>
        ) : null}
      </Stack>
    </Surface>
  )
}
