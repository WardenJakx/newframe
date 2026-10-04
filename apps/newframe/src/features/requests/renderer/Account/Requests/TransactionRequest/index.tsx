// New Tx
import { useCallback } from 'react'

import { useWalletSelector } from '../../../../../../platform/state-sync/renderer/useAppSelector.tsx'
import { erc20Interface } from '../../../../../../shared/domain/evm.ts'
import { persistedImageSource } from '../../../../../asset-data/domain/image/index.ts'
import { NATIVE_CURRENCY } from '../../../../../tokens/domain/constants.ts'
import type { TransactionApprovalAdjustments } from '../../../../../transactions/domain/approval.ts'
import type { TransactionFeeField } from '../../../../../transactions/domain/fees.ts'
import type { RequestTrayCapabilities } from '../../../requestCapabilities.ts'
import { useRequestView } from '../../../requestView.tsx'
import type { RequestViewStep } from '../../../requestView.tsx'
import { SafeProposalDetailsView } from '../../../SafeProposalDetailsView.tsx'
import EditTokenSpend from '../../../ui/EditTokenSpend.tsx'
import type { TokenSpendData } from '../../../ui/EditTokenSpend.tsx'
import { useSafeProposalSimulation, useSafeTransactionActions } from '../../../useSafeConfirmation.ts'
import type { TransactionRequestView } from '../requestViewTypes.ts'
import {
  useAddressIdentities,
  useAssetRate,
  useOriginName,
  useOrigins,
  useTokens,
  type AddressIdentities
} from '../state.ts'
import AdjustFee from './AdjustFee.tsx'
import TxReview from './TxReview.tsx'

type TransactionRequestProps = {
  capabilities: Pick<RequestTrayCapabilities, 'external' | 'review' | 'safe' | 'transaction'>
  req: TransactionRequestView
  identities?: AddressIdentities
  actionId?: string
  step: RequestViewStep
  onUpdateFee: (field: TransactionFeeField, value: bigint) => void
}

function SafeTransactionRequestReview({
  capabilities,
  req
}: Pick<TransactionRequestProps, 'capabilities' | 'req'>) {
  const chainId = Number.parseInt(req.data.chainId, 16)
  const safeTxHash = req.safeTxHash ?? ''
  const account = useWalletSelector((state) => state.accounts[req.account])
  const currentProfile = useWalletSelector((state) => state.currentProfile)
  const chain = useWalletSelector((state) => state.chains.ethereum[chainId])
  const metadata = useWalletSelector((state) => state.chainsMeta.ethereum[chainId])
  const originName = useOriginName(req.origin)
  const origins = useOrigins()
  const identities = useAddressIdentities()
  const tokens = useTokens()
  const nativeCurrencyRate = useAssetRate({
    chainId,
    address: NATIVE_CURRENCY,
    nativeTicker: metadata.nativeCurrency.symbol
  })
  const deployment = account.safe?.[String(chainId)]
  const proposal = deployment?.pending?.find(
    (candidate) => candidate.safeTxHash.toLowerCase() === safeTxHash.toLowerCase()
  )
  const { scope, preview } = useSafeProposalSimulation({
    accountId: req.account,
    scope: JSON.stringify([req.requestId, account.created, currentProfile]),
    deployment,
    proposal,
    capability: capabilities.safe
  })
  const confirmOwner = useCallback(
    async (ownerId: string) => capabilities.review.approve({ requestId: req.requestId, ownerId }),
    [capabilities.review, req.requestId]
  )
  const prepareExecutor = async (executorId: string) =>
    deployment && proposal
      ? capabilities.safe.prepareExecution({ accountId: req.account, chainId, safeTxHash, executorId })
      : { ok: false as const, error: 'Safe proposal unavailable.' }
  const executeWith = useCallback(
    async (executorId: string, adjustments: TransactionApprovalAdjustments | undefined) =>
      capabilities.review.approve({
        requestId: req.requestId,
        executorId,
        ...(adjustments ? { adjustments } : {})
      }),
    [capabilities.review, req.requestId]
  )
  const progress = req.safeTransactionProgress
  const actionConfirmations = progress?.confirmations ?? [
    ...new Set([
      ...(proposal?.confirmations ?? []),
      ...(proposal?.local?.confirmations.map(({ owner }) => owner) ?? [])
    ])
  ]
  const actions = useSafeTransactionActions({
    scope,
    status: progress?.status ?? 'collecting',
    confirmations: actionConfirmations,
    threshold: progress?.threshold ?? deployment?.configuration.threshold ?? 1,
    publication: progress?.publication ?? proposal?.local?.publication.status ?? 'published',
    owners: progress?.ownerCandidates ?? [],
    executors: progress?.executorCandidates ?? [],
    execution: proposal?.local?.execution,
    canAct: proposal?.integrity?.status === 'matched',
    canExecute:
      proposal?.integrity?.status === 'matched' && proposal.nonce === deployment?.configuration.nonce,
    onConfirm: confirmOwner,
    onPrepare: prepareExecutor,
    onExecute: executeWith,
    onDecline:
      !req.status &&
      progress?.status === 'collecting' &&
      proposal?.local?.requestId === req.requestId &&
      actionConfirmations.length === 0
        ? () => void capabilities.review.reject({ requestId: req.requestId })
        : undefined
  })

  if (!deployment || !proposal) {
    return <TxReview capabilities={capabilities} key={req.requestId} req={req} />
  }
  const currency = metadata.nativeCurrency
  return (
    <SafeProposalDetailsView
      deployment={deployment}
      proposal={proposal}
      actions={actions}
      simulation={preview}
      chainName={chain.name}
      chainIcon={persistedImageSource(metadata.image)}
      symbol={currency.symbol}
      decimals={currency.decimals}
      originName={originName}
      favicon={persistedImageSource(origins[req.origin]?.image)}
      accountName={account.name || account.ensName}
      isTestnet={chain.isTestnet}
      nativeCurrencyRate={nativeCurrencyRate}
      identities={identities}
      tokens={tokens}
      capabilities={capabilities}
    />
  )
}

type TransactionRequestWithStateProps = Omit<TransactionRequestProps, 'actionId' | 'step' | 'onUpdateFee'>

const decodeRequested = (req: TransactionRequestView) => {
  const calldata = req.payload.params[0]?.data ?? '0x'
  const decoded = erc20Interface.decodeFunctionData('approve', calldata)
  const spender: unknown = decoded[0]
  const amount: unknown = decoded[1]
  if (
    typeof spender !== 'string' ||
    (typeof amount !== 'string' && typeof amount !== 'number' && typeof amount !== 'bigint')
  ) {
    throw new Error('Invalid ERC-20 approval calldata')
  }
  return { spender, amount: BigInt(amount) }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isIdentity = (value: unknown) =>
  isRecord(value) &&
  typeof value.address === 'string' &&
  (value.ens === undefined || typeof value.ens === 'string') &&
  (value.type === undefined || typeof value.type === 'string')

const isSourceValue = (value: unknown) => typeof value === 'string' || typeof value === 'number'

const isTokenSpendData = (value: unknown): value is TokenSpendData =>
  isRecord(value) &&
  (value.decimals === undefined || typeof value.decimals === 'number') &&
  (value.symbol === undefined || typeof value.symbol === 'string') &&
  (value.name === undefined || typeof value.name === 'string') &&
  isIdentity(value.spender) &&
  isIdentity(value.contract) &&
  isSourceValue(value.amount)

export function TransactionRequest(props: TransactionRequestProps) {
  const { actionId, req, step } = props

  if (req.safeTxHash) {
    return <SafeTransactionRequestReview capabilities={props.capabilities} req={req} />
  }

  if (step === 'adjustFee') {
    return <AdjustFee req={req} onUpdateFee={props.onUpdateFee} />
  }
  if (step === 'adjustApproval') {
    if (actionId !== 'erc20:approve') {
      return null
    }
    const approval = (req.recognizedActions ?? []).find((action) => action.id === actionId)
    if (!isTokenSpendData(approval?.data)) {
      return null
    }
    const requestedAmount = decodeRequested(req).amount

    return (
      <EditTokenSpend
        clipboard={props.capabilities.external}
        data={approval.data}
        identities={props.identities}
        requestedAmount={requestedAmount}
        updateRequest={(amount: string) => {
          void props.capabilities.review.updateTokenApproval({
            requestKind: 'transaction',
            requestId: req.requestId,
            actionId: 'erc20:approve',
            amount: String(amount)
          })
        }}
        canRevoke={true}
      />
    )
  }
  if (step !== 'confirm') {
    return step
  }
  return <TxReview capabilities={props.capabilities} key={req.requestId} req={req} />
}

export default function TransactionRequestWithState(props: TransactionRequestWithStateProps) {
  const { actionId, step, displayRequest, updateFee } = useRequestView()
  return (
    <TransactionRequest
      {...props}
      req={displayRequest(props.req)}
      identities={useAddressIdentities()}
      actionId={actionId}
      step={step}
      onUpdateFee={(field, value) => updateFee(props.req, field, value)}
    />
  )
}
