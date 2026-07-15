import React, { useEffect, useRef, useState } from 'react'

import link from '../../../../../resources/link'
import { useWalletSelector } from '../../../../state/useAppSelector'
import { useHomeUiStore } from '../../state/HomeUiProvider'
import { AboutView } from './AboutView'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const appVersion = require('../../../../../package.json').version

export function About() {
  const instanceId = useWalletSelector((state) => state.instanceId || '')
  const openOverlay = useHomeUiStore((state) => state.openOverlay)
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <AboutView
      copied={copied}
      instanceId={instanceId}
      onBack={() => openOverlay({ type: 'menu' })}
      onCopyInstanceId={() => {
        clearTimeout(timer.current)
        void link.executeCommand({ type: 'clipboard.write', text: instanceId })
        setCopied(true)
        timer.current = setTimeout(() => setCopied(false), 1800)
      }}
      onViewLicense={() =>
        void link.executeCommand({
          type: 'external.open',
          url: 'https://github.com/wardenjakx/newframe/blob/main/apps/newframe/LICENSE'
        })
      }
      version={appVersion}
    />
  )
}
