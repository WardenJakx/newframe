import type { ReactNode } from 'react'

import { cva } from '../../../../generated/styled-system/css/cva.js'
import { SidePanelFooter } from './SidePanel/SidePanelFooter.js'
import { SidePanelHeader } from './SidePanel/SidePanelHeader.js'
import { TrayOverlayFrame } from './TrayOverlayFrame.js'

const bodyRecipe = cva({
  base: {
    position: 'relative',
    display: 'flex',
    minHeight: 0,
    flex: 1,
    flexDirection: 'column',
    overflowX: 'hidden',
    overflowY: 'auto'
  },
  variants: {
    placement: {
      start: {},
      center: { justifyContent: 'center' }
    },
    padding: {
      none: {},
      small: { paddingInline: '4', paddingBlockEnd: '7' },
      medium: { paddingInline: '6', paddingBlockEnd: '9' }
    }
  },
  defaultVariants: { padding: 'medium', placement: 'start' }
})

export type TrayOverlayProps = {
  action?: ReactNode
  children: ReactNode
  closeLabel: string
  footer?: ReactNode
  footerAppearance?: 'plain' | 'raised'
  label: string
  onClose: () => void
  padding?: 'medium' | 'none' | 'small'
  placement?: 'center' | 'start'
  title: string
}

export function TrayOverlay({
  action,
  children,
  closeLabel,
  footer,
  footerAppearance = 'raised',
  label,
  onClose,
  padding = 'medium',
  placement = 'start',
  title
}: TrayOverlayProps) {
  return (
    <TrayOverlayFrame
      label={label}
      layout='tray'
      onKeyDown={(event) => {
        if (event.defaultPrevented || event.key !== 'Escape') {
          return
        }
        event.preventDefault()
        onClose()
      }}
    >
      <SidePanelHeader action={action} closeLabel={closeLabel} onClose={onClose} title={title} />
      <main className={bodyRecipe({ padding, placement })}>{children}</main>
      {footer ? <SidePanelFooter appearance={footerAppearance}>{footer}</SidePanelFooter> : null}
    </TrayOverlayFrame>
  )
}
