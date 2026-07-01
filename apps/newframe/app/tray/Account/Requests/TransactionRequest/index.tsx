import React from 'react'
import Restore from 'react-restore'

// New Tx
import TxReview from './TxReview'
import AdjustFee from './AdjustFee'
import ViewData from './ViewData'
import EditTokenSpend from '../../../../../resources/Components/EditTokenSpend'
import link from '../../../../../resources/link'
import { erc20Interface } from '../../../../../resources/contracts'

class TransactionRequest extends React.Component<any, any> {
  declare store: Store

  constructor(props: any, context?: any) {
    super(props, context)
    this.state = { allowInput: false, dataView: false, showHashDetails: false }

    setTimeout(() => {
      this.setState({ allowInput: true })
    }, props.signingDelay || 1500)
  }

  overlayMode(mode: any) {
    this.setState({ overlayMode: mode })
  }

  allowOtherChain() {
    this.setState({ allowOtherChain: true })
  }

  renderAdjustFee() {
    const { req } = this.props
    return <AdjustFee req={req} />
  }

  decodeRequested(req: any) {
    const calldata = req.payload.params[0].data
    const [spender, amount] = erc20Interface.decodeFunctionData('approve', calldata)
    return { spender, amount: BigInt(amount) }
  }

  renderTokenSpend() {
    const crumb = this.store('windows.panel.nav')[0] || {}
    const { actionId } = crumb.data
    const { req } = this.props
    if (!req) return null

    const { handlerId } = req
    const approval = (req.recognizedActions || []).find((action: any) => action.id === actionId)
    if (!approval) return null

    const { data } = approval

    const { amount: requestedAmount } = this.decodeRequested(req)

    return (
      <EditTokenSpend
        data={data}
        requestedAmount={requestedAmount}
        updateRequest={(amount: any) => link.rpc('updateRequest', handlerId, { amount }, actionId, () => {})}
        canRevoke={true}
      />
    )
  }

  renderViewData() {
    return <ViewData {...this.props} />
  }

  renderTx() {
    const { req } = this.props
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
                <TxReview {...this.props} req={req} />
              </div>
            </div>
          </div>
        ) : (
          <div className='unknownType'>{'Unknown: ' + req.type}</div>
        )}
      </div>
    )
  }
  override render() {
    const { step } = this.props
    switch (step) {
      case 'adjustFee':
        return this.renderAdjustFee()
      case 'adjustApproval':
        return this.renderTokenSpend()
      case 'viewData':
        return this.renderViewData()
      case 'confirm':
        return this.renderTx()
      default:
        return step
    }
  }
}

export default Restore.connect(TransactionRequest)
