import type { ReactNode } from 'react'

import { Text } from '@newframe/ui/text'

import { cva } from '../styled-system/css/cva.js'

const rowRecipe = cva({
  base: {
    minHeight: 'list-row',
    display: 'grid',
    gridTemplateColumns: 'minmax(token(sizes.grid-column-min), 3fr) minmax(0, 7fr)',
    alignItems: 'center',
    gap: '4',
    paddingInline: '5',
    paddingBlock: '3',
    borderBlockEndWidth: 'thin',
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: 'border.subtle'
  },
  variants: {
    code: {
      true: { alignItems: 'start' },
      false: {}
    }
  }
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
  labelVariant?: 'label' | 'overline'
  value: ReactNode
  valueVariant?: 'label' | 'supporting'
}

export function DetailRow({
  code = false,
  label,
  labelVariant = 'label',
  value,
  valueVariant = 'label'
}: DetailRowProps) {
  return (
    <div className={rowRecipe({ code })}>
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
    </div>
  )
}
