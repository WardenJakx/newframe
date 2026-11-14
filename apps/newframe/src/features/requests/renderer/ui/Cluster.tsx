import { Stack } from '@newframe/ui/stack'
import type { ReactNode } from 'react'

import { cva } from '../../../../../generated/styled-system/css/cva.js'

const clusterFrameRecipe = cva({
  base: { padding: '3' },
  variants: {
    spacing: {
      none: {},
      top: { paddingBlockStart: '6' }
    }
  },
  defaultVariants: { spacing: 'none' }
})

const clusterRecipe = cva({
  base: {
    display: 'flow-root',
    paddingBlock: '1',
    borderRadius: 'card',
    background: 'bg.primary',
    '& > [data-cluster-row]:first-child > [data-cluster-value]:first-child': {
      borderStartStartRadius: 'card'
    },
    '& > [data-cluster-row]:first-child > [data-cluster-value]:last-child': {
      borderStartEndRadius: 'card'
    },
    '& > [data-cluster-row]:last-child > [data-cluster-value]:first-child': {
      borderEndStartRadius: 'card'
    },
    '& > [data-cluster-row]:last-child > [data-cluster-value]:last-child': {
      borderEndEndRadius: 'card'
    }
  }
})

const rowRecipe = cva({
  base: {
    '& [data-cluster-value]': {
      marginBlockStart: '1',
      marginInlineEnd: '1'
    }
  }
})

const valueRecipe = cva({
  base: {
    display: 'flex',
    minWidth: 0,
    minHeight: 'button-medium',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderBlockEndWidth: 'strong',
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: 'bg.primary',
    borderRadius: 'small',
    background: 'bg.raised',
    boxShadow: 'elevation-raised'
  },
  variants: {
    interactiveChildren: {
      true: { '& > *': { pointerEvents: 'auto' } },
      false: { '& > *': { pointerEvents: 'none' } }
    },
    interactive: {
      true: {
        padding: 0,
        borderInlineWidth: 0,
        borderBlockStartWidth: 0,
        color: 'inherit',
        cursor: 'pointer',
        _focusVisible: {
          outlineWidth: 'focus',
          outlineStyle: 'solid',
          outlineColor: 'border.focus',
          outlineOffset: 'focus-outline-offset-inset'
        },
        _hover: {
          zIndex: 'content',
          background: 'bg.control',
          transform: 'translateY(calc(-1 * token(sizes.motion-distance-hover)))'
        },
        _active: { transform: 'none' }
      },
      false: {}
    },
    tone: {
      default: {},
      transparent: { borderBlockEndColor: 'transparent', background: 'transparent', boxShadow: 'none' }
    }
  },
  defaultVariants: { interactive: false, interactiveChildren: false, tone: 'default' }
})

export type ClusterValueProps = {
  children?: ReactNode
  interactiveChildren?: boolean
  transparent?: boolean
} & ({ label: string; onClick: () => void } | { label?: never; onClick?: undefined })

export function ClusterValue({
  children,
  interactiveChildren = false,
  label,
  onClick,
  transparent = false
}: ClusterValueProps) {
  const className = valueRecipe({
    interactive: Boolean(onClick),
    interactiveChildren,
    tone: transparent ? 'transparent' : 'default'
  })
  return onClick ? (
    <button aria-label={label} className={className} data-cluster-value='' onClick={onClick} type='button'>
      {children}
    </button>
  ) : (
    <div className={className} data-cluster-value=''>
      {children}
    </div>
  )
}

export function ClusterRow({ children }: { children?: ReactNode }) {
  return (
    <div className={rowRecipe()} data-cluster-row=''>
      <Stack align='stretch' direction='row' gap='none' justify='center'>
        {children}
      </Stack>
    </div>
  )
}

export function Cluster({ children, spacing = 'none' }: { children?: ReactNode; spacing?: 'none' | 'top' }) {
  return (
    <div className={clusterFrameRecipe({ spacing })}>
      <div className={clusterRecipe()}>{children}</div>
    </div>
  )
}
