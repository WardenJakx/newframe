import type { ReactNode } from 'react'

import { css } from '../styled-system/css/css.js'
import { cva } from '../styled-system/css/cva.js'
import { cx } from '../styled-system/css/cx.js'
import { buttonRecipe } from './Button.tsx'
import { Icon, type IconName } from './Icon.tsx'
import { Surface } from './Surface.tsx'
import { Text } from './Text.tsx'

const disclosureClass = css({ display: 'flex', flexDirection: 'column', gap: '4' })
const summaryClass = css({ listStyle: 'none', '&::-webkit-details-marker': { display: 'none' } })

const chevronRecipe = cva({
  base: { marginInlineStart: 'auto', display: 'flex' },
  variants: {
    open: {
      true: { transform: 'none' },
      false: { transform: 'rotate(token(sizes.motion-rotation-half))' }
    }
  },
  defaultVariants: { open: false }
})

export type DisclosureProps = {
  children: ReactNode
  icon?: IconName
  label: string
  onOpenChange: (open: boolean) => void
  open: boolean
}

// Native <details> keeps collapsed content in the DOM, so find-in-page and assistive tech
// still reach it, and the browser expands it when a search lands inside.
export function Disclosure({ children, icon, label, onOpenChange, open }: DisclosureProps) {
  return (
    <details
      className={disclosureClass}
      onToggle={(event) => {
        if (event.currentTarget.open !== open) {
          onOpenChange(event.currentTarget.open)
        }
      }}
      open={open}
    >
      <summary className={cx(buttonRecipe({ appearance: 'disclosure', size: 'medium' }), summaryClass)}>
        {icon ? <Icon name={icon} size='small' /> : null}
        <Text variant='action' tone='secondary'>
          {label}
        </Text>
        <span aria-hidden='true' className={chevronRecipe({ open })}>
          <Icon name='chevronUp' size='small' />
        </span>
      </summary>
      <Surface border='subtle' padding='medium' radius='small' tone='card'>
        {children}
      </Surface>
    </details>
  )
}
