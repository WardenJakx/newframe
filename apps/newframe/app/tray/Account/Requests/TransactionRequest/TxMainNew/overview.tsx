import link from '../../../../../../resources/link'
import EnsOverview from '../../Ens'

import svg from '../../../../../../resources/svg'
import { isNonZeroHex } from '../../../../../../resources/utils'

import { Cluster, ClusterRow, ClusterValue } from '../../../../../../resources/Components/Cluster'
import { DisplayValue } from '../../../../../../resources/Components/DisplayValue'
import RequestHeader from '../../../../../../resources/Components/RequestHeader'
import { toBigInt } from '../../../../../../resources/utils/numbers'

const SimpleContractCallOverview = ({ method }: { method?: any }) => {
  const body = method ? `Calling Contract Method ${method}` : 'Calling Contract'

  return <div className='_txDescriptionSummaryLine'>{body}</div>
}

const ApproveOverview = ({ amount, decimals, symbol }: any) => {
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

const SendOverview = ({ req, symbol, decimals, amount: ammt }: any) => {
  const amount = ammt || req.data.value
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

const ContractCallOverview = ({ req }: any) => {
  const { decodedData: { method } = {} } = req
  return renderRecognizedActions(req) || <SimpleContractCallOverview method={method} />
}

const actionOverviews: Record<string, any> = {
  'erc20:transfer': SendOverview,
  'erc20:approve': ApproveOverview,
  ens: EnsOverview
}

const renderActionOverview = (action: any, index: number) => {
  const { id = '', data } = action
  const key = id + index
  const [_actionClass, actionType] = id.split(':')
  const ActionOverview = actionOverviews[id] || SimpleContractCallOverview

  return <ActionOverview key={key} type={actionType} {...{ ...data }} />
}

function renderRecognizedActions(req: any) {
  const { recognizedActions: actions = [] } = req

  return !actions.length ? (
    <div className='_txDescriptionSummaryLine'>Calling Contract</div>
  ) : (
    actions.map(renderActionOverview)
  )
}

const BaseOverviews: Record<string, any> = {
  CONTRACT_DEPLOY: DeployContractOverview,
  CONTRACT_CALL: ContractCallOverview,
  SEND_DATA: DataOverview,
  NATIVE_TRANSFER: SendOverview
}

const TxOverview = ({
  req,
  chainName,
  chainColor,
  symbol,
  originName,
  replacementStatus,
  simple,
  valueColor
}: any) => {
  const { data: tx = {}, classification } = req
  const { data: calldata } = tx

  const Description = BaseOverviews[classification]

  if (simple) {
    return (
      <div className='txDescriptionSummaryStandalone'>
        <span className='txDescriptionSummaryStandaloneWrap'>
          <Description req={req} decimals={18} symbol={symbol} />
        </span>
      </div>
    )
  } else {
    return (
      <Cluster>
        <ClusterRow>
          <ClusterValue
            onClick={() => {
              link.send('nav:update', 'panel', { data: { step: 'viewData' } })
            }}
            style={{ background: valueColor }}
          >
            <div className='_txDescription'>
              <RequestHeader chain={chainName} chainColor={chainColor}>
                <div className='requestItemTitleSub'>
                  <div className='requestItemTitleSubIcon'>{svg.window(10)}</div>
                  <div className='requestItemTitleSubText'>{originName}</div>
                </div>
                <div className='_txDescriptionSummaryMain'>
                  <Description req={req} decimals={18} symbol={symbol} />
                </div>
              </RequestHeader>
            </div>
          </ClusterValue>
        </ClusterRow>
        {replacementStatus.replacement &&
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
        {isNonZeroHex(calldata) && (
          <ClusterRow>
            <ClusterValue>
              <div className='_txMainTag _txMainTagWarning'>{'Transaction includes data'}</div>
            </ClusterValue>
          </ClusterRow>
        )}
      </Cluster>
    )
  }
}

export default TxOverview
