import EnsOverview from '../../Ens'

import { Icon } from '@newframe/ui/icon'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

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
}

const SimpleContractCallOverview = ({ method }: SimpleContractCallOverviewProps) => {
  const body = method ? `Calling Contract Method ${method}` : 'Calling Contract'

  return (
    <Text align='center' tone='secondary' variant='supporting'>
      {body}
    </Text>
  )
}

const ApproveOverview = ({ amount = 0, decimals, symbol = '?' }: ApproveOverviewProps) => {
  const isRevoke = toBigInt(amount) === 0n
  return (
    <Stack align='center' gap='xsmall'>
      {isRevoke ? (
        <Text align='center' variant='supporting'>{`Revoke Approval for ${symbol}`}</Text>
      ) : (
        <>
          <Text align='center' variant='supporting'>
            Approve Spending
          </Text>
          <DisplayValue
            type='ether'
            value={amount}
            valueDataParams={{ decimals }}
            currencySymbol={symbol}
            currencySymbolPosition='last'
          />
        </>
      )}
    </Stack>
  )
}

const SendOverview = ({ req, symbol = '?', decimals, amount: ammt }: SendOverviewProps) => {
  const amount = ammt || req?.data.value || 0
  return (
    <Stack align='center' gap='xsmall'>
      <Text align='center' variant='supporting'>
        Send
      </Text>
      <DisplayValue
        type='ether'
        value={amount}
        valueDataParams={{ decimals }}
        currencySymbol={symbol}
        currencySymbolPosition='last'
      />
    </Stack>
  )
}

const DeployContractOverview = () => (
  <Text align='center' variant='supporting'>
    Deploying Contract
  </Text>
)
const DataOverview = () => (
  <Text align='center' variant='supporting'>
    Sending data
  </Text>
)

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
    <Text align='center' tone='secondary' variant='supporting'>
      Calling Contract
    </Text>
  ) : (
    actions.map(renderActionOverview)
  )
}

const DataClusterValue = ({ children }: DataClusterValueProps) => {
  const requestView = useRequestView()
  return <ClusterValue onClick={() => requestView.open({ step: 'viewData' })}>{children}</ClusterValue>
}

const TxOverview = ({
  req,
  chainName = '',
  chainColor = '',
  symbol,
  originName = '',
  replacementStatus,
  simple
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
      <Stack align='center' gap='xsmall'>
        {description}
      </Stack>
    )
  } else {
    return (
      <Cluster>
        <ClusterRow>
          <DataClusterValue>
            <Stack align='center' gap='small'>
              <RequestHeader chain={chainName} chainColor={chainColor}>
                <Stack align='center' direction='row' gap='xsmall'>
                  <Icon name='window' size='small' tone='muted' />
                  <Text tone='muted' truncate variant='caption'>
                    {originName}
                  </Text>
                </Stack>
                <Stack align='center' gap='xsmall'>
                  {description}
                </Stack>
              </RequestHeader>
            </Stack>
          </DataClusterValue>
        </ClusterRow>
        {replacementStatus?.replacement &&
          (replacementStatus.possible ? (
            <ClusterRow>
              <ClusterValue>
                <Text align='center' tone='success' variant='overline'>
                  valid replacement
                </Text>
              </ClusterValue>
            </ClusterRow>
          ) : (
            <ClusterRow>
              <ClusterValue>
                <Text align='center' tone='danger' variant='overline'>
                  {replacementStatus.notice || 'invalid duplicate'}
                </Text>
              </ClusterValue>
            </ClusterRow>
          ))}
        {isNonZeroHex(calldata || '') && (
          <ClusterRow>
            <ClusterValue>
              <Text align='center' tone='warning' variant='overline'>
                Transaction includes data
              </Text>
            </ClusterValue>
          </ClusterRow>
        )}
        {isNonZeroHex(calldata || '') && calldataDigest && (
          <ClusterRow>
            <ClusterValue>
              <Stack align='center' gap='xsmall'>
                <Text tone='muted' variant='overline'>
                  Calldata Digest
                </Text>
                <Text tone='secondary' truncate variant='code'>
                  {calldataDigest}
                </Text>
              </Stack>
            </ClusterValue>
          </ClusterRow>
        )}
      </Cluster>
    )
  }
}

export default TxOverview
