import { Inline } from './Inline.js'
import { Surface } from './Surface.js'
import { Text } from './Text.js'
import { Tab } from './Tab.js'

export type TabsItem<T extends string> = { active: boolean; id: T; label: string }

export type TabsProps<T extends string> = {
  appearance?: 'segmented' | 'underline'
  label: string
  items: readonly TabsItem<T>[]
  onSelect: (id: T) => void
}

export function Tabs<T extends string>({ appearance = 'segmented', label, items, onSelect }: TabsProps<T>) {
  const tabs = (
    <Inline gap={appearance === 'underline' ? 'large' : 'xsmall'}>
      {items.map((item) => (
        <Tab appearance={appearance} key={item.id} onSelect={() => onSelect(item.id)} selected={item.active}>
          <Text
            align='center'
            variant={appearance === 'underline' ? 'label' : 'action'}
            tone={item.active ? (appearance === 'underline' ? 'primary' : 'accent') : 'secondary'}
          >
            {item.label}
          </Text>
        </Tab>
      ))}
    </Inline>
  )

  return (
    <div aria-label={label} role='tablist'>
      {appearance === 'segmented' ? (
        <Surface padding='xsmall' radius='small' tone='subtle'>
          {tabs}
        </Surface>
      ) : (
        tabs
      )}
    </div>
  )
}
