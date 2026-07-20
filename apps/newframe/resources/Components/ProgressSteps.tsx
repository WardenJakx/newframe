import { Inline } from '@newframe/ui/inline'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import { cva } from '../styled-system/css/cva.js'

const stepNumberRecipe = cva({
  base: {
    width: 'progress-marker',
    height: 'progress-marker',
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 'pill'
  },
  variants: {
    required: {
      true: { background: 'action.primary.subtle' },
      false: { background: 'border' }
    }
  },
  defaultVariants: { required: false }
})

export type ProgressStepStatus = 'complete' | 'error' | 'idle' | 'pending' | 'required' | 'skipped'
export type ProgressStep = { id: string; label: string; status: ProgressStepStatus }
export type ProgressStepsProps = { steps: readonly ProgressStep[] }

export function ProgressSteps({ steps }: ProgressStepsProps) {
  return (
    <Inline gap='small'>
      {steps.map((step, index) => (
        <Surface
          border={step.status === 'required' ? 'accent' : 'subtle'}
          key={step.id}
          padding='small'
          radius='small'
          tone='subtle'
        >
          <Inline align='center' gap='small'>
            <span className={stepNumberRecipe({ required: step.status === 'required' })}>
              <Text
                align='center'
                variant='caption'
                tone={step.status === 'required' ? 'accent' : 'secondary'}
              >
                {index + 1}
              </Text>
            </span>
            <Text variant='compactAction' tone='secondary' truncate>
              {step.label}
            </Text>
          </Inline>
        </Surface>
      ))}
    </Inline>
  )
}
