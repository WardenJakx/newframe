// New Tx
import TxReview from './TxReview'
import AdjustFee from './AdjustFee'
import ViewData from './ViewData'
import EditTokenSpend from '../../../../../resources/Components/EditTokenSpend'
import type { TokenSpendData } from '../../../../../resources/Components/EditTokenSpend'
import link from '../../../../../resources/link'
import { erc20Interface } from '../../../../../resources/contracts'
import { useRequestView } from '../../../requestView'
import type { RequestViewStep } from '../../../requestView'
import type { TransactionRequest as TransactionAccountRequest } from '../../../../../main/accounts/types'
import { Text } from '@newframe/ui/text'

type TransactionRequestProps = {
  req: TransactionRequestData
  actionId?: string
  step: RequestViewStep
}

type TransactionRequestWithStateProps = Omit<TransactionRequestProps, 'actionId' | 'step'>

type TransactionRequestData = {
  handlerId: string
  type: string
  payload: { params: Array<{ data?: string }> }
  recognizedActions?: Array<{ id: string; data: unknown }>
  status?: string
}

const decodeRequested = (req: TransactionRequestData) => {
  const calldata = req.payload.params[0]?.data || '0x'
  const [spender, amount] = erc20Interface.decodeFunctionData('approve', calldata)
  return { spender, amount: BigInt(amount) }
}

export function TransactionRequest(props: TransactionRequestProps) {
  const { actionId, req, step } = props
  const transactionRequest = req as TransactionAccountRequest

  if (step === 'adjustFee') return <AdjustFee req={transactionRequest} />
  if (step === 'viewData') return <ViewData req={transactionRequest} />
  if (step === 'adjustApproval') {
    if (!req || actionId !== 'erc20:approve') return null
    const approval = (req.recognizedActions || []).find((action) => action.id === actionId)
    if (!approval) return null
    const requestedAmount = decodeRequested(req).amount

    return (
      <EditTokenSpend
        data={approval.data as TokenSpendData}
        requestedAmount={requestedAmount}
        updateRequest={(amount: string) => {
          void link.executeCommand({
            type: 'request.token-approval-update',
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
    <TxReview key={req.handlerId} req={transactionRequest} />
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
