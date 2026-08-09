import { useEffect, useRef, useState } from 'react'

import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import { AboutView } from './AboutView'

import appPackage from '../../../../package.json'
import type { SettingsCapability } from './settingsCapability'

const appVersion = appPackage.version

export function About({
  capability,
  onBack
}: {
  capability: Pick<SettingsCapability, 'copyText' | 'openExternal'>
  onBack: () => void
}) {
  const instanceId = useWalletSelector((state) => state.instanceId || '')
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <AboutView
      copied={copied}
      instanceId={instanceId}
      onBack={onBack}
      onCopyInstanceId={() => {
        clearTimeout(timer.current)
        void capability.copyText({ text: instanceId })
        setCopied(true)
        timer.current = setTimeout(() => setCopied(false), 1800)
      }}
      onViewLicense={() =>
        void capability.openExternal({
          url: 'https://github.com/wardenjakx/newframe/blob/main/apps/newframe/LICENSE'
        })
      }
      version={appVersion}
    />
  )
}
