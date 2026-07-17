import { Input } from '@newframe/ui/input'
import { Range } from '@newframe/ui/range'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

export type BalanceRangeProps = {
  label: string
  balanceLabel: string
  direction: 'buy' | 'sell'
  onChange: (percent: number) => void
  value: number
}

export function BalanceRange({ label, balanceLabel, direction, onChange, value }: BalanceRangeProps) {
  return (
    <Stack gap='xsmall'>
      <Stack align='center' direction='row' gap='small' justify='between'>
        <Text role='detail' tone='secondary' truncate>
          {balanceLabel}
        </Text>
        <Surface padding='small' radius='small' tone='subtle'>
          <Stack align='center' direction='row' gap='xsmall'>
            <Input
              align='end'
              appearance='plain'
              inputMode='decimal'
              label={`${label} balance percentage`}
              max={100}
              min={0}
              onChange={(event) => onChange(Number(event.target.value))}
              type='number'
              value={Number(value.toFixed(2))}
            />
            <Text display='inline' role='supporting' tone='secondary'>
              %
            </Text>
          </Stack>
        </Surface>
      </Stack>
      <Range
        label={`${label} amount percentage`}
        max={100}
        min={0}
        onChange={(event) => onChange(Number(event.target.value))}
        step={0.1}
        tone={direction === 'buy' ? 'special' : 'danger'}
        value={value}
      />
      <Stack decorative direction='row' gap='none' justify='between'>
        {['0%', '25%', '50%', '75%', '100%'].map((tick) => (
          <Text key={tick} role='micro' tone='disabled'>
            {tick}
          </Text>
        ))}
      </Stack>
    </Stack>
  )
}
