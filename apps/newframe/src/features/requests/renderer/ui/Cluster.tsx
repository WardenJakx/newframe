import type { MouseEventHandler, ReactNode } from 'react'

import { Stack } from '@newframe/ui/stack'

import { cva } from '../../../../../generated/styled-system/css/cva.js'

const clusterRecipe = cva({
  base: {
    display: 'flow-root',
    margin: '3',
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
  },
  variants: {
    spacing: {
      none: {},
      top: { marginBlockStart: '6' }
    }
  },
  defaultVariants: { spacing: 'none' }
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
    marginBlockStart: '1',
    marginInlineEnd: '1',
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
        cursor: 'pointer',
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
  onClick?: MouseEventHandler<HTMLDivElement> | null
  role?: string
  transparent?: boolean
}

export function ClusterValue({
  children,
  interactiveChildren = false,
  onClick,
  role,
  transparent = false
}: ClusterValueProps) {
  return (
    <div
      className={valueRecipe({
        interactive: Boolean(onClick),
        interactiveChildren,
        tone: transparent ? 'transparent' : 'default'
      })}
      data-cluster-value=''
      onClick={onClick ?? undefined}
      role={role}
    >
      {children}
    </div>
  )
}

export function ClusterRow({ children }: { children?: ReactNode }) {
  return (
    <div data-cluster-row=''>
      <Stack align='stretch' direction='row' gap='none' justify='center'>
        {children}
      </Stack>
    </div>
  )
}

export function Cluster({ children, spacing = 'none' }: { children?: ReactNode; spacing?: 'none' | 'top' }) {
  return <div className={clusterRecipe({ spacing })}>{children}</div>
}
