import { Button } from '@newframe/ui/button'
import { Inline } from '@newframe/ui/inline'
import { Spinner } from '@newframe/ui/spinner'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { SignatureRequest, TransactionRequest } from '../../../../contracts/requests'
import { RequestActions } from '../../../shared/ui/RequestActions'
import StatusGlyph from '../../../shared/ui/StatusGlyph'
import { isCancelableRequest, isSignatureRequest } from '../../../../domain/request'
import type { WalletRendererState } from '../../../../contracts/state/projections'
import link from '../../../shared/link'
import { useWalletSelector } from '../../../state/useAppSelector'
import { useTrayNotification, type TrayNotifier } from '../../notification'
import { useRequestView, type RequestViewStep } from '../../requestView'
import TxApproval from './TxApproval'

type RequestReference = { handlerId: string }

interface RequestCommandSharedState {
  appLocked: boolean
  chain: { explorer?: string; isTestnet?: boolean }
  explorerWarningMuted: boolean
  step: RequestViewStep
}

export type RequestCommandRequest = {
  handlerId: string
  type: string
  status?: string
  notice?: string
  mode?: string
}

interface RequestCommandProps {
  notify: TrayNotifier
  req: RequestCommandRequest
  shared: RequestCommandSharedState
  signingDelay?: number
}

const EMPTY_CHAIN = {}

export const approveRequest = (requestId: string) =>
  void link.executeCommand({ type: 'request.approve', requestId })

export const declineRequest = (req: RequestReference) =>
  void link.executeCommand({ type: 'request.reject', requestId: req.handlerId })

export const runWhenAppUnlocked = (appLocked: boolean, next: () => void) => {
  if (!appLocked) next()
}

export function RequestCommand(props: RequestCommandProps) {
  const request = props.req as TransactionRequest | SignatureRequest
  const { notify } = props
  const [state, setCommandState] = useState({
    allowInput: false,
    showHashDetails: false,
    txHashCopied: false
  })
  const setState = (update: Partial<typeof state>) =>
    setCommandState((current) => ({ ...current, ...update }))

  useEffect(() => {
    const timer = setTimeout(
      () => setCommandState((current) => ({ ...current, allowInput: true })),
      props.signingDelay || 0
    )
    return () => clearTimeout(timer)
  }, [props.signingDelay])

  useEffect(() => {
    const gate = request.approvalGate
    if (!gate) return
    if (gate.type === 'gas-fee') {
      notify('gasFeeWarning', {
        req: request,
        feeUSD: gate.feeUSD,
        currentSymbol: gate.currentSymbol
      })
    } else if (gate.reason === 'incompatible') {
      notify('signerCompatibilityWarning', {
        req: request,
        compatibility: { signer: gate.signer, tx: gate.tx, compatible: false },
        chain: gate.chain
      })
    } else if (gate.reason === 'signer-unavailable') {
      notify('signerRecovery', { req: request, signerIds: gate.signerIds })
    } else {
      notify('noSignerWarning', { req: request })
    }
  }, [notify, request, request.approvalGate])

  function submittedCommand(req: TransactionRequest) {
    const chain = { type: 'ethereum' as const, id: parseInt(req.data.chainId, 16) }
    const displayNotice = (req.notice || '').toLowerCase()
    let displayStatus = (req.status || 'pending').toLowerCase()
    if (displayStatus === 'pending' && displayNotice === 'see signer')
      displayStatus = 'waiting for device signature'
    else if (displayStatus === 'verifying') displayStatus = 'waiting for block'
    const hash = req.tx?.hash

    const copyHash = () => {
      if (!hash) return
      void link.executeCommand({ type: 'clipboard.write', text: hash })
      setState({ txHashCopied: true, showHashDetails: false })
      setTimeout(() => setState({ txHashCopied: false }), 3000)
    }

    return (
      <Stack align='center' gap='small'>
        <Text align='center' tone='accent' variant='overline'>
          {displayStatus}
        </Text>
        {hash ? (
          state.txHashCopied ? (
            <Surface padding='small' radius='pill' tone='raised'>
              <Text align='center' variant='caption'>
                Transaction hash copied
              </Text>
            </Surface>
          ) : state.showHashDetails || req.status === 'confirming' || req.status === 'confirmed' ? (
            <Stack direction='row' equal gap='xsmall'>
              <Button
                appearance='control'
                disabled={!props.shared.chain.explorer}
                label='Open transaction explorer'
                onPress={() => {
                  if (!hash || !props.shared.chain.explorer) return
                  if (props.shared.explorerWarningMuted) {
                    void link.executeCommand({
                      type: 'explorer.open',
                      chainId: chain.id,
                      transactionHash: hash
                    })
                  } else props.notify('openExplorer', { hash, chain })
                }}
                size='small'
              >
                <Text variant='caption'>Open explorer</Text>
              </Button>
              <Button appearance='control' label='Copy transaction hash' onPress={copyHash} size='small'>
                <Text variant='caption'>Copy hash</Text>
              </Button>
            </Stack>
          ) : (
            <Stack direction='row' equal gap='xsmall'>
              <Button
                appearance='danger'
                label='Cancel transaction'
                onPress={() =>
                  void link.executeCommand({
                    type: 'transaction.replace',
                    requestId: req.handlerId,
                    replacement: 'cancel',
                    idempotencyKey: crypto.randomUUID()
                  })
                }
                size='small'
              >
                <Text variant='caption'>Cancel</Text>
              </Button>
              <Button
                appearance='control'
                label='View transaction details'
                onPress={() => setState({ showHashDetails: true })}
                size='small'
              >
                <Text variant='caption'>Details</Text>
              </Button>
              <Button
                appearance='subtle'
                label='Speed up transaction'
                onPress={() =>
                  void link.executeCommand({
                    type: 'transaction.replace',
                    requestId: req.handlerId,
                    replacement: 'speed',
                    idempotencyKey: crypto.randomUUID()
                  })
                }
                size='small'
              >
                <Text variant='caption'>Speed up</Text>
              </Button>
            </Stack>
          )
        ) : null}
        {isCancelableRequest(req.status || '') ? (
          <Button appearance='ghost' onPress={() => declineRequest(req)} size='compact' tone='danger'>
            <Text variant='caption'>Cancel request</Text>
          </Button>
        ) : null}
      </Stack>
    )
  }

  function transactionActions(req: TransactionRequest) {
    const sign = () => {
      if (!state.allowInput) return
      runWhenAppUnlocked(props.shared.appLocked, () => approveRequest(req.handlerId))
    }

    return (
      <Stack gap='xsmall'>
        {req.automaticFeeUpdateNotice ? (
          <Surface padding='xsmall' radius='pill' tone='card'>
            <Inline align='center' gap='small' justify='between'>
              <Text tone='accent' variant='caption'>
                Fee updated
              </Text>
              <Button
                appearance='subtle'
                onPress={() =>
                  void link.executeCommand({
                    type: 'transaction.fee-notice-dismiss',
                    requestId: req.handlerId
                  })
                }
                size='compact'
              >
                <Text variant='caption'>Ok</Text>
              </Button>
            </Inline>
          </Surface>
        ) : null}
        <RequestActions
          primary={{ disabled: !state.allowInput, label: 'Sign', onPress: sign }}
          secondary={{ disabled: !state.allowInput, label: 'Decline', onPress: () => declineRequest(req) }}
        />
      </Stack>
    )
  }

  function transactionCommand(req: TransactionRequest) {
    const requiredApproval =
      !req.status && req.mode !== 'monitor'
        ? (req.approvals || []).find((approval) => !approval.approved)
        : undefined
    if (requiredApproval) {
      return (
        <TxApproval
          req={req}
          approval={
            requiredApproval as { type: 'approveOtherChain' | 'approveGasLimit'; data?: { message?: string } }
          }
        />
      )
    }
    return req.notice ? submittedCommand(req) : transactionActions(req)
  }

  function signatureCommand(req: SignatureRequest) {
    if (req.notice) {
      const pending = req.status === 'pending'
      const failed = req.status === 'error' || req.status === 'declined'
      return (
        <Stack align='center' gap='small'>
          {pending ? (
            <Spinner label='Waiting for signer' size='large' />
          ) : (
            <StatusGlyph state={failed ? 'failed' : req.status === 'success' ? 'completed' : 'idle'} />
          )}
          <Text
            align='center'
            tone={failed ? 'danger' : req.status === 'success' ? 'success' : 'primary'}
            variant='overline'
          >
            {req.notice}
          </Text>
          {pending ? (
            <Button appearance='ghost' onPress={() => declineRequest(req)} size='compact' tone='danger'>
              <Text variant='caption'>Cancel</Text>
            </Button>
          ) : null}
        </Stack>
      )
    }

    return (
      <RequestActions
        primary={{
          disabled: !state.allowInput,
          label: 'Sign',
          onPress: () => {
            if (!state.allowInput) return
            runWhenAppUnlocked(props.shared.appLocked, () => approveRequest(req.handlerId))
          }
        }}
        secondary={{ disabled: !state.allowInput, label: 'Decline', onPress: () => declineRequest(req) }}
      />
    )
  }

  if (!request) return null
  if (request.type === 'transaction' && props.shared.step === 'confirm') return transactionCommand(request)
  if (isSignatureRequest(request)) return signatureCommand(request)
  return null
}

export default function RequestCommandContainer(props: Omit<RequestCommandProps, 'notify' | 'shared'>) {
  const request = props.req as TransactionRequest | SignatureRequest
  const chainId = request.type === 'transaction' ? parseInt(request.data.chainId || '0', 16) : 0
  const { notify } = useTrayNotification()
  const { step } = useRequestView()
  const selector = useMemo(
    () =>
      (state: WalletRendererState): Omit<RequestCommandSharedState, 'step'> => ({
        appLocked: state.appLock.locked,
        chain: state.networks.ethereum[chainId] || EMPTY_CHAIN,
        explorerWarningMuted: !!state.mute?.explorerWarning
      }),
    [chainId]
  )
  const synchronized = useWalletSelector(useShallow(selector))
  return <RequestCommand {...props} notify={notify} shared={{ ...synchronized, step }} />
}
