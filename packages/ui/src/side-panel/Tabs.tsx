import { Button } from '../control/Button.js'
import { Stack } from '../layout/Stack.js'
import { Surface } from '../surface/Surface.js'
import { Text } from '../typography/Text.js'

export type TabsItem<T extends string> = { active: boolean; id: T; label: string }

export type TabsProps<T extends string> = {
  label: string
  items: readonly TabsItem<T>[]
  onSelect: (id: T) => void
}

export function Tabs<T extends string>({ label, items, onSelect }: TabsProps<T>) {
  return (
    <div aria-label={label} role='tablist'>
      <Surface padding='xsmall' radius='small' tone='subtle'>
        <Stack direction='row' equal gap='xsmall'>
          {items.map((item) => (
            <Button
              active={item.active}
              appearance='tab'
              key={item.id}
              onPress={() => onSelect(item.id)}
              selected={item.active}
              size='small'
            >
              <Text align='center' role='action' tone={item.active ? 'accent' : 'secondary'}>
                {item.label}
              </Text>
            </Button>
          ))}
        </Stack>
      </Surface>
    </div>
  )
}
