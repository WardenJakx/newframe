import type { ReactNode } from 'react'

import { sva } from '../styled-system/css/sva.js'
import type { RecipeVariantProps } from '../styled-system/types/recipe.js'
import { Text } from './Text.js'

const fieldRecipe = sva({
  slots: ['root', 'control'],
  base: {
    root: {
      minWidth: 0,
      minHeight: 'field',
      display: 'flex',
      alignItems: 'center',
      gap: '4',
      paddingInline: '5',
      borderWidth: 'thin',
      borderStyle: 'solid',
      borderColor: 'border.subtle',
      borderRadius: 'default',
      background: 'border.subtle'
    },
    control: {
      minWidth: 0,
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: '3'
    }
  },
  variants: {
    invalid: {
      true: { root: { borderColor: 'status.danger', boxShadow: 'focus-danger' } },
      false: {}
    },
    vertical: {
      true: {
        root: {
          minHeight: 'field-vertical',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'center',
          gap: '3'
        },
        control: { justifyContent: 'flex-start' }
      },
      false: {}
    }
  },
  defaultVariants: { invalid: false, vertical: false }
})

export type FieldProps = RecipeVariantProps<typeof fieldRecipe> & {
  children: ReactNode
  label: string
  required?: boolean
  suffix?: string
}

export function Field({ children, invalid, label, required = false, suffix, vertical }: FieldProps) {
  const styles = fieldRecipe({ invalid, vertical })
  return (
    <label className={styles.root} data-invalid={invalid || undefined}>
      <Text display='inline' variant='fieldLabel' tone='secondary'>
        {label}
        {required ? (
          <Text decorative display='inline' variant='fieldLabel' tone='danger'>
            {' *'}
          </Text>
        ) : null}
      </Text>
      <span className={styles.control}>
        {children}
        {suffix ? (
          <Text display='inline' variant='caption' tone='disabled'>
            {suffix}
          </Text>
        ) : null}
      </span>
    </label>
  )
}
