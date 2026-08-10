// New Tx
import { Text } from '@newframe/ui/text'

import TxReview from './TxReview'
import AdjustFee from './AdjustFee'
import EditTokenSpend from '../../../ui/EditTokenSpend'
import type { TokenSpendData } from '../../../ui/EditTokenSpend'
import { erc20Interface } from '../../../../../../shared/domain/evm'
import { useRequestView } from '../../../requestView'
import type { RequestViewStep } from '../../../requestView'
import type { RequestRendererCapabilities } from '../../../requestCapabilities'
import type { TransactionRequestView } from '../requestViewTypes'

type TransactionRequestProps = {
  capabilities: Pick<RequestRendererCapabilities, 'external' | 'review' | 'transaction'>
  req: TransactionRequestView
  actionId?: string
  step: RequestViewStep
}

type TransactionRequestWithStateProps = Omit<TransactionRequestProps, 'actionId' | 'step'>

const decodeRequested = (req: TransactionRequestView) => {
  const calldata = req.payload.params[0]?.data || '0x'
  const [spender, amount] = erc20Interface.decodeFunctionData('approve', calldata)
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

  if (step === 'adjustFee') {
    return <AdjustFee capability={props.capabilities.transaction} req={req} />
  }
  if (step === 'adjustApproval') {
    if (!req || actionId !== 'erc20:approve') return null
    const approval = (req.recognizedActions || []).find((action) => action.id === actionId)
    if (!isTokenSpendData(approval?.data)) return null
    const requestedAmount = decodeRequested(req).amount

    return (
      <EditTokenSpend
        clipboard={props.capabilities.external}
        data={approval.data}
        requestedAmount={requestedAmount}
        updateRequest={(amount: string) => {
          void props.capabilities.review.updateTokenApproval({
            requestKind: 'transaction',
            requestId: req.handlerId,
            actionId: 'erc20:approve',
            amount: String(amount)
          })
        }}
        canRevoke={true}
      />
    )
  }
  if (step !== 'confirm') return step
  if (!req) return null

  return req.type === 'transaction' ? (
    <TxReview capabilities={props.capabilities} key={req.handlerId} req={req} />
  ) : (
    <Text align='center' tone='danger' variant='label'>
      {'Unknown: ' + req.type}
    </Text>
  )
}

export default function TransactionRequestWithState(props: TransactionRequestWithStateProps) {
  const { actionId, step } = useRequestView()
  return <TransactionRequest {...props} actionId={actionId} step={step} />
}
