import { formatUnits, isUnlimited, toBigInt } from '../../../../../shared/domain/units'
import { chainColorValue } from '../../../../networks/domain/chain/colors'
import { Cluster, ClusterRow, ClusterValue } from '../../ui/Cluster'
import Countdown from '../../ui/Countdown'
import RequestHeader from '../../ui/RequestHeader'
import RequestItem from '../../ui/RequestItem'
import EditTokenSpend from '../../ui/EditTokenSpend'
import { SimpleTypedData as TypedSignatureOverview } from '../../ui/SimpleTypedData'
import useCopiedMessage from '../../hooks/useCopiedMessage'
import { useRequestView, type RequestViewState } from '../../requestView'
import type { RequestViewStep } from '../../requestView'
import type { SourceValue } from '../../format/displayValue'
import type { RequestRendererCapabilities } from '../../requestCapabilities'
import type { PermitRequestView } from './requestViewTypes'

type PermitChainData = {
  chainColor?: string
  chainName?: string
  icon?: string
}

type PermitOverviewProps = {
  capabilities: Pick<RequestRendererCapabilities, 'external' | 'panel'>
  req: PermitRequestView
  chainData: PermitChainData
  originName: string
  open(next: RequestViewState): void
}

type EditPermitProps = {
  capabilities: Pick<RequestRendererCapabilities, 'external' | 'review'>
  req: PermitRequestView
}

type PermitRequestProps = {
  capabilities: Pick<RequestRendererCapabilities, 'external' | 'panel' | 'review'>
  req: PermitRequestView
  originName: string
  step: RequestViewStep
  chainData: PermitChainData
}

const PermitOverview = ({ capabilities, req, chainData, originName, open }: PermitOverviewProps) => {
  const { chainColor = '', chainName = '', icon } = chainData
  const {
    permit: { spender, value, deadline },
    tokenData,
    handlerId
  } = req

  const [showCopiedMessage, copySpender] = useCopiedMessage(capabilities.external, spender.address)

  const amountDisplay = isUnlimited(String(value))
    ? '~UNLIMITED'
    : tokenData.decimals
      ? formatUnits(toBigInt(value) ?? 0n, tokenData.decimals)
      : 'UNKNOWN AMOUNT'

  const amountSuffix = tokenData.symbol || 'UNKNOWN TOKEN'

  return (
    <Stack gap='medium'>
      <RequestItem
        panel={capabilities.panel}
        key={`signErc20Permit:${handlerId}`}
        req={req}
        i={0}
        title={`${chainName} Token Permit`}
        color={chainColor ? chainColorValue(chainColor) : ''}
        img={icon}
        headerMode={true}
      >
        <Cluster>
          <ClusterRow>
            <ClusterValue
              onClick={() => {
                open({ step: 'viewRaw' })
              }}
            >
              <Stack align='center' gap='small'>
                <RequestHeader chain={chainName} chainColor={chainColor}>
                  <Stack align='center' direction='row' gap='xsmall'>
                    <Icon name='window' size='small' tone='muted' />
                    <Text tone='muted' truncate variant='caption'>
                      {originName}
                    </Text>
                  </Stack>
                  <Text align='center' variant='sectionTitle'>{`Permit to Spend ${
                    tokenData.symbol || 'Unknown Token'
                  }`}</Text>
                </RequestHeader>
              </Stack>
            </ClusterValue>
          </ClusterRow>
        </Cluster>
      </RequestItem>
      <Stack gap='xsmall'>
        <Text tone='muted' variant='overline'>
          Token Permit
        </Text>
        <Cluster>
          {tokenData && (
            <>
              <ClusterRow>
                <ClusterValue interactiveChildren onClick={() => copySpender()}>
                  <Stack align='center' gap='xsmall'>
                    <Text align='center' truncate variant={spender.ens ? 'label' : 'code'}>
                      {spender.ens ||
                        `${spender.address.substring(0, 8)}…${spender.address.substring(spender.address.length - 6)}`}
                    </Text>
                    <Text tone={showCopiedMessage ? 'accent' : 'muted'} truncate variant='code'>
                      {showCopiedMessage ? 'Address Copied' : spender.address}
                    </Text>
                  </Stack>
                </ClusterValue>
              </ClusterRow>
              <ClusterRow>
                <ClusterValue>
                  <Text align='center' tone='danger' variant='overline'>
                    is requesting permission to spend
                  </Text>
                </ClusterValue>
              </ClusterRow>
              <ClusterRow>
                <ClusterValue
                  onClick={
                    tokenData.decimals
                      ? () => {
                          open({ step: 'adjustPermit' })
                        }
                      : undefined
                  }
                >
                  <Text
                    align='center'
                    tone='accent'
                    variant='heading'
                  >{`${amountDisplay} ${amountSuffix}`}</Text>
                </ClusterValue>
              </ClusterRow>

              <ClusterRow>
                <ClusterValue>
                  <Countdown end={Number(deadline) * 1000} title='Permit Expires In' />
                </ClusterValue>
              </ClusterRow>
            </>
          )}
        </Cluster>
      </Stack>
    </Stack>
  )
}

const EditPermit = ({ capabilities, req }: EditPermitProps) => {
  const { permit, tokenData } = req

  const { verifyingContract: contract, spender, value: amount, deadline: deadlineInSeconds } = permit

  const updateRequest = (newAmt: SourceValue) => {
    void capabilities.review.updateTokenApproval({
      requestKind: 'permit',
      requestId: req.handlerId,
      amount: String(newAmt)
    })
  }
  const deadline = Number(deadlineInSeconds) * 1000

  const requestedAmount = toBigInt(req.payload.params[1].message.value) ?? 0n

  const data = {
    ...tokenData,
    contract,
    spender,
    amount
  }

  return (
    <EditTokenSpend
      clipboard={capabilities.external}
      {...{
        data,
        requestedAmount,
        updateRequest,
        deadline
      }}
    />
  )
}

const PermitRequest = ({ capabilities, req, originName, step, chainData }: PermitRequestProps) => {
  const requestView = useRequestView()

  const renderStep = () => {
    switch (step) {
      case 'adjustPermit':
        return <EditPermit capabilities={capabilities} req={req} />
      case 'viewRaw':
        return <TypedSignatureOverview originName={originName} req={req} />
      default:
        return (
          <PermitOverview
            capabilities={capabilities}
            originName={originName}
            req={req}
            chainData={chainData}
            open={requestView.open}
          />
        )
    }
  }

  return <div key={req.id || req.handlerId}>{renderStep()}</div>
}

export default PermitRequest
import { Icon } from '@newframe/ui/icon'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
