import { formatUnits, isUnlimited, toBigInt } from '../../../../../resources/utils/numbers'
import { chainColorValue } from '../../../../../resources/colors'
import link from '../../../../../resources/link'
import { Cluster, ClusterRow, ClusterValue } from '../../../../../resources/Components/Cluster'
import Countdown from '../../../../../resources/Components/Countdown'
import RequestHeader from '../../../../../resources/Components/RequestHeader'
import RequestItem from '../../../../../resources/Components/RequestItem'
import EditTokenSpend from '../../../../../resources/Components/EditTokenSpend'
import { SimpleTypedData as TypedSignatureOverview } from '../../../../../resources/Components/SimpleTypedData'
import useCopiedMessage from '../../../../../resources/Hooks/useCopiedMessage'
import { useRequestView, type RequestViewState } from '../../../requestView'
import type { RequestViewStep } from '../../../requestView'
import type { PermitSignatureRequest } from '../../../../../main/accounts/types'
import type { SourceValue } from '../../../../../resources/utils/displayValue'

type PermitChainData = {
  chainColor?: string
  chainName?: string
  icon?: string
}

type PermitOverviewProps = {
  req: PermitSignatureRequest
  chainData: PermitChainData
  originName: string
  open(next: RequestViewState): void
}

type EditPermitProps = {
  req: PermitSignatureRequest
}

type PermitRequestProps = {
  req: PermitSignatureRequest & { id?: string }
  originName: string
  step: RequestViewStep
  chainData: PermitChainData
}

const PermitOverview = ({ req, chainData, originName, open }: PermitOverviewProps) => {
  const { chainColor = '', chainName = '', icon } = chainData
  const {
    permit: { spender, value, deadline },
    tokenData,
    handlerId
  } = req

  const [showCopiedMessage, copySpender] = useCopiedMessage(spender.address)

  const amountDisplay = isUnlimited(String(value))
    ? '~UNLIMITED'
    : tokenData.decimals
      ? formatUnits(toBigInt(value) ?? 0n, tokenData.decimals)
      : 'UNKNOWN AMOUNT'

  const amountSuffix = tokenData.symbol || 'UNKNOWN TOKEN'

  return (
    <Stack gap='medium'>
      <RequestItem
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

const EditPermit = ({ req }: EditPermitProps) => {
  const { permit, tokenData } = req

  const { verifyingContract: contract, spender, value: amount, deadline: deadlineInSeconds } = permit

  const updateRequest = (newAmt: SourceValue) => {
    void link.executeCommand({
      type: 'request.token-approval-update',
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
      {...{
        data,
        requestedAmount,
        updateRequest,
        deadline
      }}
    />
  )
}

const PermitRequest = ({ req, originName, step, chainData }: PermitRequestProps) => {
  const requestView = useRequestView()

  const renderStep = () => {
    switch (step) {
      case 'adjustPermit':
        return <EditPermit req={req} />
      case 'viewRaw':
        return <TypedSignatureOverview req={req} />
      default:
        return (
          <PermitOverview originName={originName} req={req} chainData={chainData} open={requestView.open} />
        )
    }
  }

  return <div key={req.id || req.handlerId}>{renderStep()}</div>
}

export default PermitRequest
import { Icon } from '@newframe/ui/icon'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
