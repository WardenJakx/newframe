import type { ReactNode } from 'react'

import { Button } from '../control/Button.js'
import { Icon, type IconName } from '../icon/Icon.js'
import { Surface } from '../surface/Surface.js'
import { Text } from '../typography/Text.js'
import './side-panel.css'

export type DisclosureProps = {
  children: ReactNode
  icon?: IconName
  label: string
  onToggle: () => void
  open: boolean
}

export function Disclosure({ children, icon, label, onToggle, open }: DisclosureProps) {
  return (
    <section className='nf-disclosure'>
      <Button appearance='disclosure' expanded={open} onPress={onToggle}>
        {icon ? <Icon name={icon} size='small' /> : null}
        <Text role='action' tone='secondary'>
          {label}
        </Text>
        <span
          aria-hidden='true'
          className={`nf-disclosure__chevron${open ? ' nf-disclosure__chevron--open' : ''}`}
        >
          <Icon name='chevronUp' size='small' />
        </span>
      </Button>
      {open ? (
        <Surface border='subtle' padding='medium' radius='small' tone='card'>
          {children}
        </Surface>
      ) : null}
    </section>
  )
}
