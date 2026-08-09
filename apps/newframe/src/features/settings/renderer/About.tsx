import { useEffect, useRef, useState } from 'react'

import link from '../../../platform/ipc/renderer/link'
import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import { useHomeUiStore } from '../../../app/renderer/tray/Home/state/HomeUiProvider'
import { AboutView } from './AboutView'

import appPackage from '../../../../package.json'

const appVersion = appPackage.version

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
