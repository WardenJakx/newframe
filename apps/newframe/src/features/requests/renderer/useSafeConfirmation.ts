import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { CommandResult, QueryMap, QueryResultMap } from '../../../app/contracts/operations'
import type { AirGapRequestReference } from '../../../platform/signing/domain/airgap'
import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import type { SafeDeployment, SafeProposal, SafeProposalSimulation } from '../../accounts/domain/safe'
import type { TransactionApprovalAdjustments } from '../../transactions/domain/approval'
import type { TransactionFeeField } from '../../transactions/domain/fees'
import type { SafeTransactionProgress, SigningCandidate } from '../contract/requests'
import type { RequestRendererCapabilities } from './requestCapabilities'
import { updateTransactionFee } from './requestView'
import type { SafePreview, SafeProposalActionModel } from './SafeProposalDetailsView'

export function useSafeProposalSimulation({
  accountId,
  scope: lifetime,
  deployment,
  proposal,
  capability
}: {
  accountId: string
  scope: string
  deployment: SafeDeployment | undefined
  proposal: SafeProposal | undefined
  capability: RequestRendererCapabilities['safe']
}) {
  const chainId = deployment?.chainId
  const safeTxHash = proposal?.safeTxHash
  // Configuration observations and confirmations do not change the signed transaction.
  const scope =
    deployment && proposal
      ? JSON.stringify([
          lifetime,
          accountId,
          chainId,
          deployment.address,
          safeTxHash,
          proposal.safe,
          proposal.nonce,
          proposal.to,
          proposal.value,
          proposal.operation,
          proposal.data,
          proposal.safeTxGas,
          proposal.baseGas,
          proposal.gasPrice,
          proposal.gasToken,
          proposal.refundReceiver
        ])
      : ''
  const [preview, setPreview] = useState<{ scope: string; generation: number; result: SafePreview }>({
    scope: '',
    generation: 0,
    result: { status: 'loading' }
  })
  if (preview.scope !== scope) {
    setPreview({ scope, generation: preview.generation + 1, result: { status: 'loading' } })
  }
  const generation = preview.generation
  useEffect(() => {
    if (!scope || chainId === undefined || !safeTxHash) {
      return
    }
    let active = true
    const receive = (result: SafeProposalSimulation) => {
      if (active) {
        setPreview((current) =>
          current.scope === scope && current.generation === generation ? { ...current, result } : current
        )
      }
    }
    void capability.simulate({ accountId, chainId, safeTxHash }).then(receive, (error: unknown) => {
      receive({
        status: 'unavailable',
        error: error instanceof Error ? error.message : 'Could not load Safe preview.'
      })
    })
    return () => {
      active = false
    }
  }, [accountId, capability, chainId, generation, safeTxHash, scope])
  return { scope, preview: preview.scope === scope ? preview.result : { status: 'loading' as const } }
}

type Identity = Omit<QueryMap['safe.confirmation-status'], 'type'>
type Status = QueryResultMap['safe.confirmation-status']
export type SafeConfirmationModel = {
  status: Status['status'] | 'loading'
  message?: string
  onSign: (operationId?: string) => Promise<CommandResult>
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

  let status: SafeConfirmationModel['status'] = activeState?.result?.status ?? 'loading'
  if (activeState?.error && !activeState.result?.status) {
    status = 'idle'
  }
  if (operation?.status === 'failed') {
    status = 'signing_failed'
    if (operation.phase === 'publication_failed') {
      status = 'publication_failed'
    } else if (operation.phase === 'cancelled') {
      status = 'cancelled'
    } else if (operation.phase === 'validation_failed') {
      status = 'validation_failed'
    }
  } else {
    switch (operation?.phase) {
      case 'local':
      case 'ready':
      case 'signing':
      case 'reconciling':
      case 'publishing':
      case 'published':
      case 'preparing':
      case 'executing':
      case 'submitted':
        status = operation.phase
        break
      case undefined:
        break
    }
  }
  if (activeState?.submitting) {
    status = 'signing'
  }

  return {
    status,
    message: activeState?.error ?? operation?.error?.message ?? activeState?.result?.message,
    onSign: async (providedOperationId) => {
      const selected = current.current.identity
      if (
        !selected ||
        !scope ||
        clicked.current === scope ||
        ['signing', 'reconciling', 'publishing', 'published'].includes(status)
      ) {
        return { ok: false, error: 'operation_failed', message: 'Confirmation is already in progress.' }
      }
      clicked.current = scope
      ++requestGeneration.current
      const operationId = providedOperationId ?? crypto.randomUUID()
      setState((previous) => ({
        ...previous,
        scope,
        operationId,
        result: { status: 'signing', operationId },
        submitting: true,
        error: undefined
      }))
      try {
        const result = await capability.confirm({ ...selected, operationId })
        if (current.current.scope !== scope) {
          return result
        }
        setState((previous) => ({
          ...previous,
          submitting: false,
          operationId: result.ok ? operationId : undefined,
          result: result.ok ? previous.result : undefined,
          error: result.ok ? undefined : (result.message ?? 'Could not start Safe confirmation.'),
          revision: previous.revision + 1
        }))
        return result
      } catch {
        if (current.current.scope === scope) {
          setState((previous) => ({
            ...previous,
            submitting: false,
            result: undefined,
            error: 'Could not start Safe confirmation. Try again.',
            revision: previous.revision + 1
          }))
        }
        return { ok: false, error: 'operation_failed', message: 'Could not start Safe confirmation.' }
      } finally {
        if (clicked.current === scope) {
          clicked.current = ''
        }
      }
    }
  }
}

type SafeExecutionState = NonNullable<NonNullable<SafeProposal['local']>['execution']>

export function useSafeTransactionActions({
  scope,
  status,
  confirmations,
  threshold,
  publication,
  owners,
  executors,
  execution,
  confirmation,
  canAct,
  canExecute = canAct,
  onConfirm,
  onPrepare,
  onExecute,
  onDecline,
  onRecoverSigner,
  controlledOwnerId,
  onSelectControlledOwner,
  controlledOwnerSelection = false
}: {
  scope: string
  status: SafeTransactionProgress['status']
  confirmations: string[]
  threshold: number
  publication: SafeProposalActionModel['publication']
  owners: SigningCandidate[]
  executors: SigningCandidate[]
  execution?: SafeExecutionState
  confirmation?: Pick<SafeConfirmationModel, 'status' | 'message'>
  canAct: boolean
  canExecute?: boolean
  onConfirm: (ownerId: string, operationId: string) => Promise<CommandResult>
  onPrepare: (executorId: string) => Promise<QueryResultMap['safe.execution-prepare']>
  onExecute: (
    executorId: string,
    adjustments: TransactionApprovalAdjustments | undefined,
    operationId: string
  ) => Promise<CommandResult>
  onDecline?: () => void
  onRecoverSigner?: (signerId: string) => void
  controlledOwnerId?: string
  onSelectControlledOwner?: (ownerId: string) => void
  controlledOwnerSelection?: boolean
}): SafeProposalActionModel {
  const confirmed = useMemo(
    () => new Set(confirmations.map((address) => address.toLowerCase())),
    [confirmations]
  )
  const retryPublication = publication === 'failed' || confirmation?.status === 'publication_failed'
  const selectableOwners = owners.filter((owner) => {
    if (retryPublication) {
      return owner.status !== 'watch-only'
    }
    return owner.status !== 'watch-only' && !confirmed.has(owner.address.toLowerCase())
  })
  const [selection, setSelection] = useState<{
    scope: string
    ownerId?: string
    executorId?: string
  }>({ scope })
  const activeSelection = selection.scope === scope ? selection : { scope }
  const requestedOwnerId = controlledOwnerId ?? activeSelection.ownerId
  let selectedOwnerId = selectableOwners.some(({ accountId }) => accountId === requestedOwnerId)
    ? requestedOwnerId
    : undefined
  if (!selectedOwnerId && !controlledOwnerSelection && selectableOwners.length === 1) {
    selectedOwnerId = selectableOwners[0].accountId
  }
  const readyExecutors = executors.filter(({ status }) => status === 'ready')
  const defaultExecutor =
    readyExecutors.find(({ accountId }) => accountId === requestedOwnerId)?.accountId ??
    (readyExecutors.length === 1 ? readyExecutors[0].accountId : undefined)
  const selectedExecutorId = readyExecutors.some(({ accountId }) => accountId === activeSelection.executorId)
    ? activeSelection.executorId
    : defaultExecutor
  const [transient, setTransient] = useState<{
    scope: string
    error?: string
    adjustments?: TransactionApprovalAdjustments
    preparing?: boolean
  }>({ scope })
  const activeTransient = transient.scope === scope ? transient : { scope }
  const prepareKey = useRef('')
  const prepareExecution = useEffectEvent(onPrepare)
  const executionNeedsReview =
    status === 'failed' || execution?.status === 'failed' || execution?.status === 'cancelled'
  const canonicalReviewed =
    execution &&
    execution.executorId === selectedExecutorId &&
    ['ready', 'executing', 'submitted'].includes(execution.status)
      ? execution.transaction
      : undefined
  const reviewedTransaction =
    canonicalReviewed && activeTransient.adjustments
      ? { ...canonicalReviewed, ...activeTransient.adjustments }
      : canonicalReviewed

  useEffect(() => {
    if (status !== 'ready' || !selectedExecutorId || canonicalReviewed) {
      return
    }
    const key = `${scope}:${selectedExecutorId}`
    if (prepareKey.current === key) {
      return
    }
    prepareKey.current = key
    let active = true
    void prepareExecution(selectedExecutorId).then(
      (result) => {
        if (!active) {
          return
        }
        setTransient((current) =>
          current.scope === scope ? { ...current, error: result.ok ? undefined : result.error } : current
        )
      },
      (error: unknown) => {
        if (active) {
          setTransient((current) =>
            current.scope === scope
              ? {
                  ...current,
                  error: error instanceof Error ? error.message : 'Could not prepare execution.'
                }
              : current
          )
        }
      }
    )
    return () => {
      active = false
    }
  }, [canonicalReviewed, scope, selectedExecutorId, status])

  const selectedOwner = owners.find(({ accountId }) => accountId === selectedOwnerId)
  const ownerBusy =
    confirmation?.status === 'signing' ||
    confirmation?.status === 'reconciling' ||
    confirmation?.status === 'publishing'
  const recoverSigner =
    selectedOwner?.status === 'unavailable' &&
    selectedOwner.signerAttached &&
    selectedOwner.signerStatus !== 'Wallet locked'
      ? onRecoverSigner
      : undefined
  const recoverable = Boolean(recoverSigner)
  let ownerLabel = retryPublication ? 'Retry publication' : 'Sign'
  const confirmationPublished = confirmation?.status === 'published'
  if (ownerBusy) {
    ownerLabel = confirmation.status === 'publishing' ? 'Publishing…' : 'Signing…'
  } else if (confirmationPublished) {
    ownerLabel = 'Confirmation published'
  } else if (recoverable) {
    ownerLabel = 'Connect signer'
  } else if (selectedOwner && !selectedOwner.signerAttached && !retryPublication) {
    ownerLabel = 'No signer attached'
  }

  const canonicalStatus: SafeProposalActionModel['status'] = (() => {
    if (activeTransient.preparing) {
      return 'preparing'
    }
    if (executionNeedsReview) {
      return 'ready'
    }
    if (status !== 'collecting') {
      return status
    }
    if (retryPublication) {
      return 'publication_failed'
    }
    if (confirmation?.status === 'publishing') {
      return 'publishing'
    }
    if (ownerBusy) {
      return 'signing'
    }
    return 'collecting'
  })()
  let executionLabel = 'Choose an executor'
  if (canonicalStatus === 'submitted') {
    executionLabel = 'Transaction submitted'
  } else if (canonicalStatus === 'executing') {
    executionLabel = 'Executing…'
  } else if (canonicalStatus === 'preparing') {
    executionLabel = 'Preparing execution…'
  } else if (executionNeedsReview) {
    executionLabel = 'Review execution again'
  } else if (reviewedTransaction) {
    executionLabel = 'Execute transaction'
  } else if (selectedExecutorId) {
    executionLabel = 'Review execution'
  }

  return {
    status: canonicalStatus,
    confirmations,
    threshold,
    publication,
    owners,
    selectedOwnerId,
    onSelectOwner: (ownerId) => {
      onSelectControlledOwner?.(ownerId)
      setSelection({ ...activeSelection, scope, ownerId })
    },
    ownerAction: {
      label: ownerLabel,
      disabled:
        !canAct ||
        confirmationPublished ||
        ownerBusy ||
        !selectedOwner ||
        selectedOwner.signerStatus === 'Wallet locked' ||
        (!retryPublication && selectedOwner.status !== 'ready' && !recoverable),
      onPress: () => {
        if (!selectedOwner) {
          return
        }
        if (recoverSigner && !retryPublication) {
          recoverSigner(selectedOwner.accountId)
          return
        }
        const operationId = crypto.randomUUID()
        void onConfirm(selectedOwner.accountId, operationId).then(
          (result) =>
            setTransient((current) =>
              current.scope === scope
                ? {
                    ...current,
                    error: result.ok ? undefined : (result.message ?? 'Could not approve as owner.')
                  }
                : current
            ),
          () =>
            setTransient((current) =>
              current.scope === scope ? { ...current, error: 'Could not approve as owner.' } : current
            )
        )
      }
    },
    executors,
    selectedExecutorId,
    onSelectExecutor: (executorId) => {
      prepareKey.current = ''
      setSelection({ ...activeSelection, scope, executorId })
      setTransient((current) => ({
        scope,
        adjustments: current.scope === scope ? current.adjustments : undefined
      }))
    },
    executionAction: {
      label: executionLabel,
      disabled:
        !canExecute ||
        !selectedExecutorId ||
        (!reviewedTransaction && !executionNeedsReview) ||
        ['preparing', 'executing', 'submitted'].includes(canonicalStatus),
      onPress: () => {
        if (!selectedExecutorId) {
          return
        }
        if (executionNeedsReview) {
          setTransient({ scope, preparing: true })
          void onPrepare(selectedExecutorId).then(
            (result) =>
              setTransient((current) =>
                current.scope === scope
                  ? { ...current, preparing: false, error: result.ok ? undefined : result.error }
                  : current
              ),
            (error: unknown) =>
              setTransient((current) =>
                current.scope === scope
                  ? {
                      ...current,
                      preparing: false,
                      error: error instanceof Error ? error.message : 'Could not prepare execution.'
                    }
                  : current
              )
          )
          return
        }
        if (!reviewedTransaction) {
          prepareKey.current = ''
          return
        }
        const operationId = crypto.randomUUID()
        void onExecute(selectedExecutorId, activeTransient.adjustments, operationId).then(
          (result) =>
            setTransient((current) =>
              current.scope === scope
                ? {
                    ...current,
                    error: result.ok ? undefined : (result.message ?? 'Could not execute Safe transaction.')
                  }
                : current
            ),
          () =>
            setTransient((current) =>
              current.scope === scope ? { ...current, error: 'Could not execute Safe transaction.' } : current
            )
        )
      }
    },
    reviewedTransaction,
    executionWarnings: execution?.warnings,
    outerTxHash: execution?.transactionHash,
    adjustments: activeTransient.adjustments,
    onUpdateFee: canonicalReviewed
      ? (field: TransactionFeeField, value: bigint) =>
          setTransient((current) => ({
            ...current,
            scope,
            adjustments: updateTransactionFee(
              canonicalReviewed,
              current.scope === scope ? current.adjustments : undefined,
              field,
              value
            )
          }))
      : undefined,
    decline: onDecline ? { label: 'Decline', onPress: onDecline } : undefined,
    message: activeTransient.error ?? confirmation?.message ?? execution?.error
  }
}
