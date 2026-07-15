import EnsOverview from '../../Ens'

import svg from '../../../../../../resources/svg'
import { isNonZeroHex } from '../../../../../../resources/utils'

import { Cluster, ClusterRow, ClusterValue } from '../../../../../../resources/Components/Cluster'
import { DisplayValue } from '../../../../../../resources/Components/DisplayValue'
import RequestHeader from '../../../../../../resources/Components/RequestHeader'
import { toBigInt } from '../../../../../../resources/utils/numbers'
import { useRequestView } from '../../../../requestView'
import type { ReactNode } from 'react'
import type { SourceValue } from '../../../../../../resources/utils/displayValue'

type TxOverviewRequest = {
  data: {
    value?: string
    data?: string
    calldataDigest?: string
  }
  classification: string
  decodedData?: { method?: string }
  recognizedActions?: Array<{ id: string; data?: unknown }>
}

type SimpleContractCallOverviewProps = {
  method?: string
}

type ApproveOverviewProps = {
  amount?: SourceValue
  decimals?: number
  symbol?: string
}

type SendOverviewProps = ApproveOverviewProps & {
  req?: TxOverviewRequest
}

type ContractCallOverviewProps = {
  req: TxOverviewRequest
}

type DataClusterValueProps = {
  children?: ReactNode
  valueColor?: string
}

type TxOverviewProps = {
  req: TxOverviewRequest
  chainName?: string
  chainColor?: string
  symbol: string
  originName?: string
  replacementStatus?: {
    replacement?: boolean
    possible?: boolean
    notice?: string
  }
  simple?: boolean
  valueColor?: string
}

const SimpleContractCallOverview = ({ method }: SimpleContractCallOverviewProps) => {
  const body = method ? `Calling Contract Method ${method}` : 'Calling Contract'

  return <div className='_txDescriptionSummaryLine'>{body}</div>
}

const ApproveOverview = ({ amount = 0, decimals, symbol = '?' }: ApproveOverviewProps) => {
  const isRevoke = toBigInt(amount) === 0n
  return (
    <div>
      {isRevoke ? (
        <span>{`Revoke Approval for ${symbol}`}</span>
      ) : (
        <>
          <span>{'Approve Spending'}</span>
          <DisplayValue
            type='ether'
            value={amount}
            valueDataParams={{ decimals }}
            currencySymbol={symbol}
            currencySymbolPosition='last'
          />
        </>
      )}
    </div>
  )
}

const SendOverview = ({ req, symbol = '?', decimals, amount: ammt }: SendOverviewProps) => {
  const amount = ammt || req?.data.value || 0
  return (
    <div>
      <span>{'Send'}</span>
      <DisplayValue
        type='ether'
        value={amount}
        valueDataParams={{ decimals }}
        currencySymbol={symbol}
        currencySymbolPosition='last'
      />
    </div>
  )
}

const DeployContractOverview = () => <div>Deploying Contract</div>
const DataOverview = () => <div>Sending data</div>

const ContractCallOverview = ({ req }: ContractCallOverviewProps) => {
  const { decodedData: { method } = {} } = req
  return renderRecognizedActions(req) || <SimpleContractCallOverview method={method} />
}

const renderActionOverview = (action: { id: string; data?: unknown }, index: number) => {
  const { id = '', data } = action
  const key = id + index
  const [_actionClass, actionType] = id.split(':')
  const props = data && typeof data === 'object' ? data : {}

  if (id === 'erc20:transfer') return <SendOverview key={key} {...(props as SendOverviewProps)} />
  if (id === 'erc20:approve') return <ApproveOverview key={key} {...(props as ApproveOverviewProps)} />
  if (id.startsWith('ens:')) {
    return <EnsOverview key={key} type={actionType} data={props} />
  }

  return <SimpleContractCallOverview key={key} />
}

function renderRecognizedActions(req: TxOverviewRequest) {
  const { recognizedActions: actions = [] } = req

  return !actions.length ? (
    <div className='_txDescriptionSummaryLine'>Calling Contract</div>
  ) : (
    actions.map(renderActionOverview)
  )
}

const DataClusterValue = ({ children, valueColor }: DataClusterValueProps) => {
  const requestView = useRequestView()
  return (
    <ClusterValue onClick={() => requestView.open({ step: 'viewData' })} style={{ background: valueColor }}>
      {children}
    </ClusterValue>
  )
}

const TxOverview = ({
  req,
  chainName = '',
  chainColor = '',
  symbol,
  originName = '',
  replacementStatus,
  simple,
  valueColor
}: TxOverviewProps) => {
  const { data: tx, classification } = req
  const { data: calldata, calldataDigest } = tx

  const description = (() => {
    if (classification === 'CONTRACT_DEPLOY') return <DeployContractOverview />
    if (classification === 'CONTRACT_CALL') return <ContractCallOverview req={req} />
    if (classification === 'SEND_DATA') return <DataOverview />
    return <SendOverview req={req} decimals={18} symbol={symbol} />
  })()

  if (simple) {
    return (
      <div className='txDescriptionSummaryStandalone'>
        <span className='txDescriptionSummaryStandaloneWrap'>{description}</span>
      </div>
    )
  } else {
    return (
      <Cluster>
        <ClusterRow>
          <DataClusterValue valueColor={valueColor}>
            <div className='_txDescription'>
              <RequestHeader chain={chainName} chainColor={chainColor}>
                <div className='requestItemTitleSub'>
                  <div className='requestItemTitleSubIcon'>{svg.window(10)}</div>
                  <div className='requestItemTitleSubText'>{originName}</div>
                </div>
                <div className='_txDescriptionSummaryMain'>{description}</div>
              </RequestHeader>
            </div>
          </DataClusterValue>
        </ClusterRow>
        {replacementStatus?.replacement &&
          (replacementStatus.possible ? (
            <ClusterRow>
              <ClusterValue>
                <div className='_txMainTag _txMainTagGood'>valid replacement</div>
              </ClusterValue>
            </ClusterRow>
          ) : (
            <ClusterRow>
              <ClusterValue>
                <div className='_txMainTag _txMainTagBad'>
                  {replacementStatus.notice || 'invalid duplicate'}
                </div>
              </ClusterValue>
            </ClusterRow>
          ))}
        {isNonZeroHex(calldata || '') && (
          <ClusterRow>
            <ClusterValue>
              <div className='_txMainTag _txMainTagWarning'>{'Transaction includes data'}</div>
            </ClusterValue>
          </ClusterRow>
        )}
        {isNonZeroHex(calldata || '') && calldataDigest && (
          <ClusterRow>
            <ClusterValue>
              <div className='calldataDigestRow'>
                <div className='calldataDigestLabel'>Calldata Digest</div>
                <div className='calldataDigestValue'>{calldataDigest}</div>
              </div>
            </ClusterValue>
          </ClusterRow>
        )}
      </Cluster>
    )
  }
}

export default TxOverview
