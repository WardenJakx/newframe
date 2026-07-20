import { Inline } from './Inline.js'
import { Surface } from './Surface.js'
import { Text } from './Text.js'
import { Tab } from './Tab.js'

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
        <Inline gap='xsmall'>
          {items.map((item) => (
            <Tab key={item.id} onSelect={() => onSelect(item.id)} selected={item.active}>
              <Text align='center' variant='action' tone={item.active ? 'accent' : 'secondary'}>
                {item.label}
              </Text>
            </Tab>
          ))}
        </Inline>
      </Surface>
    </div>
  )
}
