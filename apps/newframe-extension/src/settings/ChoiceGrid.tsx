import { Grid } from '@newframe/ui/grid'
import { Group } from '@newframe/ui/group'
import { Stack } from '@newframe/ui/stack'
import { StatusDot } from '@newframe/ui/status-dot'
import { Text } from '@newframe/ui/text'
import { ToggleButton } from '@newframe/ui/toggle-button'

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
    <Group label={label}>
      <Stack gap='small'>
        <Text tone='muted' variant='overline'>
          {label}
        </Text>
        <Grid columns='two' gap='small' responsive>
          {options.map((option) => (
            <ToggleButton
              appearance='row'
              disabled={option.disabled}
              key={option.id}
              onPress={() => onSelect(option.id)}
              pressed={option.selected}
              size='small'
            >
              <StatusDot size='small' tone={option.selected ? 'success' : 'neutral'} />
              <Text variant='supporting' truncate>
                {option.label}
              </Text>
            </ToggleButton>
          ))}
        </Grid>
      </Stack>
    </Group>
  )
}
