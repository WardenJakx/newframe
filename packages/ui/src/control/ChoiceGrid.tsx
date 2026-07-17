import { Grid } from '../layout/Grid.js'
import { StatusDot } from '../media/StatusDot.js'
import { Text } from '../typography/Text.js'
import { Button } from './Button.js'

export type ChoiceGridOption = {
  disabled?: boolean
  id: string
  label: string
  selected: boolean
}

export type ChoiceGridProps = {
  label: string
  onSelect: (id: string) => void
  options: readonly ChoiceGridOption[]
}

export function ChoiceGrid({ label, onSelect, options }: ChoiceGridProps) {
  return (
    <div aria-label={label} role='group'>
      <Grid columns='two' gap='small' responsive>
        {options.map((option) => (
          <Button
            appearance='row'
            disabled={option.disabled}
            key={option.id}
            onPress={() => onSelect(option.id)}
            pressed={option.selected}
          >
            <StatusDot size='small' tone={option.selected ? 'success' : 'neutral'} />
            <Text role='label' truncate>
              {option.label}
            </Text>
          </Button>
        ))}
      </Grid>
    </div>
  )
}
