import { useEffect, useRef, useState } from 'react'

import type { AccountsCapability } from './accountsCapability'

export interface HardwareSession {
  operationId: string
  signerId: string
}

export function useHardwareSessionController(
  capability: AccountsCapability,
  onBegin?: (session: HardwareSession, command: 'signer.session-start' | 'signer.refresh') => void
) {
  const [session, setSession] = useState<HardwareSession | null>(null)
  const sessionRef = useRef<HardwareSession | null>(null)

  const adopt = (next: HardwareSession | null) => {
    sessionRef.current = next
    setSession(next)
  }

  const finish = (outcome: 'ready' | 'cancelled') => {
    const current = sessionRef.current
    if (!current) {
      return
    }
    adopt(null)
    void capability.finishSignerSession({
      operationId: current.operationId,
      signerId: current.signerId,
      outcome
    })
  }

  const start = (signerId: string, options: { reload?: boolean; replaceCurrent?: boolean } = {}) => {
    if (sessionRef.current && (options.replaceCurrent || sessionRef.current.signerId !== signerId)) {
      finish('cancelled')
    }
    const operationId = crypto.randomUUID()
    const next = { operationId, signerId }
    adopt(next)
    const command = options.reload ? 'signer.refresh' : 'signer.session-start'
    onBegin?.(next, command)
    void (options.reload ? capability.refreshSigner(next) : capability.startSignerSession(next))
    return next
  }

  useEffect(
    () => () => {
      const current = sessionRef.current
      if (!current) {
        return
      }
      sessionRef.current = null
      void capability.finishSignerSession({ ...current, outcome: 'cancelled' })
    },
    [capability]
  )

  return { adopt, finish, session, sessionRef, start }
}
