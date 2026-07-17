import { Link } from '@newframe/ui/link'
import { Stack } from '@newframe/ui/stack'
import { StrongText } from '@newframe/ui/strong-text'
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
        <StrongText align='center' role='heading'>
          {title}
        </StrongText>
        <Stack align='center' gap='xsmall'>
          {detailLines.map((line, index) => (
            <Text
              align='center'
              key={`${index}-${line}`}
              role='label'
              tone={index === emphasizedDetail ? 'danger' : 'secondary'}
            >
              {line}
            </Text>
          ))}
        </Stack>
        {action ? (
          <Link appearance='action' external href={action.href}>
            <Text display='inline' role='action' tone='accent'>
              {action.label}
            </Text>
          </Link>
        ) : null}
      </Stack>
    </Surface>
  )
}
