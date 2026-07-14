import svg from '../../../../../resources/svg'
import link from '../../../../../resources/link'

import { Cluster, ClusterValue, ClusterRow } from '../../../../../resources/Components/Cluster'

interface TxApprovalProps {
  req: { handlerId: string }
  approval: {
    type: 'approveOtherChain' | 'approveGasLimit'
    data?: { message?: string }
  }
}

const TxApproval = ({ req, approval }: TxApprovalProps) => (
  <div className='approveTransactionWarning'>
    <div className='approveTransactionWarningBody'>
      <Cluster>
        <ClusterRow>
          <ClusterValue>
            <div className='approveTransactionWarningTitle'>
              <div className='approveTransactionWarningIcon approveTransactionWarningIconLeft'>
                {svg.alert(32)}
              </div>
              {'estimated to fail'}
              <div className='approveTransactionWarningIcon approveTransactionWarningIconRight'>
                {svg.alert(32)}
              </div>
            </div>
          </ClusterValue>
        </ClusterRow>
        <ClusterRow>
          <ClusterValue
            onClick={() => {
              void link.executeCommand({ type: 'request.reject', requestId: req.handlerId })
            }}
          >
            <div className='_txActionButton _txActionButtonBad'>{'Reject'}</div>
          </ClusterValue>
          <ClusterValue
            onClick={() => {
              void link.executeCommand({
                type: 'request.approval-confirm',
                requestId: req.handlerId,
                approvalType: approval.type
              })
            }}
          >
            <div className='_txActionButton _txActionButtonGood'>{'Proceed'}</div>
          </ClusterValue>
        </ClusterRow>
        <ClusterRow>
          <ClusterValue>
            <div className='approveTransactionWarningMessage'>
              {approval && approval.data && approval.data.message}
            </div>
          </ClusterValue>
        </ClusterRow>
      </Cluster>
    </div>
  </div>
)

export default TxApproval
