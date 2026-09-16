import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { QueryMap, QueryResultMap } from '../../../app/contracts/operations'
import type { AirGapRequestReference } from '../../../platform/signing/domain/airgap'
import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import type { RequestRendererCapabilities } from './requestCapabilities'

type Identity = Omit<QueryMap['safe.confirmation-status'], 'type'>
type Status = QueryResultMap['safe.confirmation-status']
export type SafeConfirmationModel = {
  status: Status['status'] | 'loading'
  message?: string
  onSign: () => void
}

export function useSafeConfirmation({
  identity,
  scope,
  capability,
  onAirGapSigning
}: {
  identity: Identity | undefined
  scope: string
  capability: RequestRendererCapabilities['safe']
  onAirGapSigning?: (reference: AirGapRequestReference) => void
}): SafeConfirmationModel {
  const [state, setState] = useState<{
    scope: string
    result?: Status
    operationId?: string
    submitting?: boolean
    error?: string
    revision: number
  }>({ scope, revision: 0 })
  const current = useRef({ scope, identity })
  useLayoutEffect(() => {
    current.current = { scope, identity }
  }, [scope, identity])
  const clicked = useRef('')
  const requestGeneration = useRef(0)
  if (state.scope !== scope) {
    setState({ scope, revision: state.revision + 1 })
  }
  const activeState = state.scope === scope ? state : undefined
  const operation = useWalletSelector((wallet) =>
    activeState?.operationId ? wallet.operations[activeState.operationId] : undefined
  )
  const terminal = operation?.status !== 'pending' ? operation?.updatedAt : undefined
  const revision = state.revision
  const signerId = useWalletSelector((wallet) =>
    identity ? wallet.accounts[identity.ownerId]?.signer : undefined
  )
  const exchange = useWalletSelector((wallet) =>
    signerId ? wallet.signers[signerId]?.airgapRequest : undefined
  )
  const notified = useRef('')
  useEffect(() => {
    if (!signerId || !exchange || exchange.requestId !== activeState?.operationId) {
      return
    }
    if (notified.current === exchange.sessionId || !onAirGapSigning) {
      return
    }
    notified.current = exchange.sessionId
    onAirGapSigning({ signerId, ...exchange })
  }, [signerId, exchange, activeState?.operationId, onAirGapSigning])

  useEffect(() => {
    const selected = current.current.identity
    if (!selected || !scope) {
      return
    }
    let active = true
    const generation = ++requestGeneration.current
    void capability.confirmationStatus(selected).then(
      (result) => {
        if (!active || generation !== requestGeneration.current) {
          return
        }
        setState((previous) =>
          previous.scope === scope
            ? {
                ...previous,
                result,
                operationId: result.operationId,
                error: undefined
              }
            : previous
        )
      },
      () => {
        if (active && generation === requestGeneration.current) {
          setState((previous) =>
            previous.scope === scope
              ? { ...previous, error: 'Could not load confirmation status. Try again.' }
              : previous
          )
        }
      }
    )
    return () => {
      active = false
    }
  }, [capability, scope, terminal, revision])

  const status: SafeConfirmationModel['status'] = activeState?.submitting
    ? 'signing'
    : operation?.status === 'pending'
      ? operation.phase === 'signing'
        ? 'signing'
        : 'publishing'
      : operation?.status === 'succeeded'
        ? 'published'
        : operation?.status === 'failed'
          ? operation.phase === 'publication_failed'
            ? 'publication_failed'
            : operation.phase === 'cancelled'
              ? 'cancelled'
              : operation.phase === 'validation_failed'
                ? 'validation_failed'
                : 'signing_failed'
          : (activeState?.result?.status ?? (activeState?.error ? 'idle' : 'loading'))

  return {
    status,
    message: activeState?.error || operation?.error?.message || activeState?.result?.message,
    onSign: () => {
      const selected = current.current.identity
      if (
        !selected ||
        !scope ||
        clicked.current === scope ||
        ['signing', 'publishing', 'published'].includes(status)
      ) {
        return
      }
      clicked.current = scope
      ++requestGeneration.current
      const operationId = crypto.randomUUID()
      setState((previous) => ({
        ...previous,
        scope,
        operationId,
        result: { status: 'signing', operationId },
        submitting: true,
        error: undefined
      }))
      void capability
        .confirm({ ...selected, operationId })
        .then(
          (result) => {
            if (current.current.scope !== scope) {
              return
            }
            setState((previous) => ({
              ...previous,
              submitting: false,
              operationId: result.ok ? operationId : undefined,
              result: result.ok ? previous.result : undefined,
              error: result.ok ? undefined : result.message || 'Could not start Safe confirmation.',
              revision: previous.revision + 1
            }))
          },
          () => {
            if (current.current.scope !== scope) {
              return
            }
            setState((previous) => ({
              ...previous,
              submitting: false,
              result: undefined,
              error: 'Could not start Safe confirmation. Try again.',
              revision: previous.revision + 1
            }))
          }
        )
        .finally(() => {
          if (clicked.current === scope) {
            clicked.current = ''
          }
        })
    }
  }
}
