import React from 'react'

// New Tx
import TxReview from './TxReview'
import AdjustFee from './AdjustFee'
import ViewData from './ViewData'
import EditTokenSpend from '../../../../../resources/Components/EditTokenSpend'
import link from '../../../../../resources/link'
import { erc20Interface } from '../../../../../resources/contracts'
import { useRequestView } from '../../../requestView'

const decodeRequested = (req: any) => {
  const calldata = req.payload.params[0].data
  const [spender, amount] = erc20Interface.decodeFunctionData('approve', calldata)
  return { spender, amount: BigInt(amount) }
}

export function TransactionRequest(props: any) {
  const { actionId, req, step } = props

  if (step === 'adjustFee') return <AdjustFee req={req} />
  if (step === 'viewData') return <ViewData {...props} />
  if (step === 'adjustApproval') {
    if (!req || actionId !== 'erc20:approve') return null
    const approval = (req.recognizedActions || []).find((action: any) => action.id === actionId)
    if (!approval) return null
    const requestedAmount = decodeRequested(req).amount

    return (
      <EditTokenSpend
        data={approval.data}
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

  let requestClass = 'signerRequest cardShow'
  const success = req.status === 'confirming' || req.status === 'confirmed'
  const error = req.status === 'error' || req.status === 'declined'
  if (success) requestClass += ' signerRequestSuccess'
  if (req.status === 'confirmed') requestClass += ' signerRequestConfirmed'
  else if (error) requestClass += ' signerRequestError'

  return (
    <div key={req.handlerId} className={requestClass}>
      {req.type === 'transaction' ? (
        <div className='approveTransaction'>
          <div className='approveTransactionPayload'>
            <div className='_txBody'>
              <TxReview {...props} req={req} />
            </div>
          </div>
        </div>
      ) : (
        <div className='unknownType'>{'Unknown: ' + req.type}</div>
      )}
    </div>
  )
}

export default function TransactionRequestWithState(props: any) {
  const { actionId, step } = useRequestView()
  return <TransactionRequest {...props} actionId={actionId} step={step} />
}
