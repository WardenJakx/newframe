import type { ReactNode } from 'react'

import { Text } from '@newframe/ui/text'

import { cva } from '../styled-system/css/cva.js'

const rowRecipe = cva({
  base: {
    width: '100%',
    minHeight: 'list-row',
    display: 'grid',
    gridTemplateColumns: 'minmax(token(sizes.grid-column-min), 3fr) minmax(0, 7fr)',
    alignItems: 'center',
    gap: '4',
    paddingInline: '5',
    paddingBlock: '3',
    borderBlockStartWidth: 0,
    borderInlineWidth: 0,
    borderBlockEndWidth: 'thin',
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: 'border.subtle',
    background: 'transparent',
    color: 'inherit',
    fontFamily: 'inherit',
    textAlign: 'inherit'
  },
  variants: {
    code: {
      true: { alignItems: 'start' },
      false: {}
    },
    interactive: {
      true: {
        cursor: 'pointer',
        _hover: { background: 'bg.hover' },
        _focusVisible: {
          outlineWidth: 'focus',
          outlineStyle: 'solid',
          outlineColor: 'border.focus',
          outlineOffset: 'focus-outline-offset'
        }
      },
      false: {}
    }
  },
  defaultVariants: { interactive: false }
})

const valueRecipe = cva({
  base: { width: '100%', minWidth: 0, overflow: 'hidden' },
  variants: {
    wrap: {
      false: {},
      true: { whiteSpace: 'normal', wordBreak: 'break-all' }
    }
  },
  defaultVariants: { wrap: false }
})

export type DetailRowProps = {
  code?: boolean
  label: string
  onPress?: () => void
  pressLabel?: string
  labelVariant?: 'label' | 'overline'
  value: ReactNode
  valueVariant?: 'label' | 'supporting'
}

export function DetailRow({
  code = false,
  label,
  labelVariant = 'label',
  onPress,
  pressLabel,
  value,
  valueVariant = 'label'
}: DetailRowProps) {
  const content = (
    <>
      <Text tone='muted' variant={labelVariant}>
        {label}
      </Text>
      <div className={valueRecipe({ wrap: code })}>
        {typeof value === 'string' || typeof value === 'number' ? (
          <Text align='end' truncate={!code} variant={code ? 'code' : valueVariant}>
            {value}
          </Text>
        ) : (
          value
        )}
      </div>
    </>
  )

  return onPress ? (
    <button
      aria-label={pressLabel || label}
      className={rowRecipe({ code, interactive: true })}
      onClick={onPress}
      type='button'
    >
      {content}
    </button>
  ) : (
    <div className={rowRecipe({ code })}>{content}</div>
  )
}
