import { formatUnits, isUnlimited, toBigInt } from '../../../../../resources/utils/numbers'
import svg from '../../../../../resources/svg'
import link from '../../../../../resources/link'
import { ClusterBox, Cluster, ClusterRow, ClusterValue } from '../../../../../resources/Components/Cluster'
import Countdown from '../../../../../resources/Components/Countdown'
import RequestHeader from '../../../../../resources/Components/RequestHeader'
import RequestItem from '../../../../../resources/Components/RequestItem'
import EditTokenSpend from '../../../../../resources/Components/EditTokenSpend'
import { SimpleTypedData as TypedSignatureOverview } from '../../../../../resources/Components/SimpleTypedData'
import { getSignatureRequestClass } from '../../../../../resources/domain/request'
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
    <div className='approveRequest'>
      <div className='approveTransactionPayload'>
        <div className='_txBody'>
          <ClusterBox animationSlot={1}>
            <RequestItem
              key={`signErc20Permit:${handlerId}`}
              req={req}
              i={0}
              title={`${chainName} Token Permit`}
              color={chainColor ? `var(--${chainColor})` : ''}
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
                    <div className='_txDescription'>
                      <RequestHeader chain={chainName} chainColor={chainColor}>
                        <div className='requestItemTitleSub'>
                          <div className='requestItemTitleSubIcon'>{svg.window(10)}</div>
                          <div className='requestItemTitleSubText'>{originName}</div>
                        </div>
                        <div className='_txDescriptionSummaryMain'>{`Permit to Spend ${
                          tokenData.symbol || 'Unknown Token'
                        }`}</div>
                      </RequestHeader>
                    </div>
                  </ClusterValue>
                </ClusterRow>
              </Cluster>
            </RequestItem>
          </ClusterBox>
          <ClusterBox title={'Token Permit'} animationSlot={2}>
            <Cluster>
              {tokenData && (
                <>
                  <ClusterRow>
                    <ClusterValue pointerEvents={true} onClick={() => copySpender()}>
                      <div className='clusterAddress'>
                        <span className='traySpan clusterAddressRecipient'>
                          {spender.ens || (
                            <>
                              {spender.address.substring(0, 8)}
                              {svg.octicon('kebab-horizontal', { height: 15 })}
                              {spender.address.substring(spender.address.length - 6)}
                            </>
                          )}
                        </span>
                        <div className='clusterAddressRecipientFull'>
                          {showCopiedMessage ? (
                            <span className='traySpan'>{'Address Copied'}</span>
                          ) : (
                            <span className='traySpan clusterFira'>{spender.address}</span>
                          )}
                        </div>
                      </div>
                    </ClusterValue>
                  </ClusterRow>
                  <ClusterRow>
                    <ClusterValue>
                      <div
                        className='clusterTag'
                        style={{ color: 'var(--color-status-danger)' }}
                      >{`is requesting permission to spend`}</div>
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
                      <div className='clusterFocus'>
                        <div className='clusterFocusHighlight'>{`${amountDisplay} ${amountSuffix}`}</div>
                      </div>
                    </ClusterValue>
                  </ClusterRow>

                  <ClusterRow>
                    <ClusterValue>
                      <div className='clusterTag'>Permit Expires In</div>
                    </ClusterValue>
                  </ClusterRow>

                  <ClusterRow>
                    <ClusterValue>
                      <Countdown
                        end={Number(deadline) * 1000}
                        innerClass='clusterFocusHighlight'
                        titleClass='clusterFocus'
                      />
                    </ClusterValue>
                  </ClusterRow>
                </>
              )}
            </Cluster>
          </ClusterBox>
        </div>
      </div>
    </div>
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
  const requestClass = getSignatureRequestClass(req)

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

  return (
    <div key={req.id || req.handlerId} className={requestClass}>
      {renderStep()}
    </div>
  )
}

export default PermitRequest
