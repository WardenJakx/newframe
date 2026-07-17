import { Stack } from '../layout/Stack.js'
import { Surface } from '../surface/Surface.js'
import { Text } from '../typography/Text.js'
import './side-panel.css'

export type ProgressStepStatus = 'complete' | 'error' | 'idle' | 'pending' | 'required' | 'skipped'
export type ProgressStep = { id: string; label: string; status: ProgressStepStatus }
export type ProgressStepsProps = { steps: readonly ProgressStep[] }

export function ProgressSteps({ steps }: ProgressStepsProps) {
  return (
    <Stack direction='row' gap='small'>
      {steps.map((step, index) => (
        <Surface
          border={step.status === 'required' ? 'accent' : 'subtle'}
          key={step.id}
          padding='small'
          radius='small'
          tone='subtle'
        >
          <Stack align='center' direction='row' gap='small'>
            <span
              className='nf-progress-step__number'
              data-status={step.status === 'required' ? 'required' : 'default'}
            >
              <Text align='center' role='caption' tone={step.status === 'required' ? 'accent' : 'secondary'}>
                {index + 1}
              </Text>
            </span>
            <Text role='compactAction' tone='secondary' truncate>
              {step.label}
            </Text>
          </Stack>
        </Surface>
      ))}
    </Stack>
  )
}
