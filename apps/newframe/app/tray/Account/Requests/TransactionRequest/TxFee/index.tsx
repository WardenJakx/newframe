import React from 'react'
import Restore from 'react-restore'

import { DisplayCoinBalance, DisplayValue } from '../../../../../../resources/Components/DisplayValue'
import { toBigInt } from '../../../../../../resources/utils/numbers'
import { GasFeesSource, usesBaseFee } from '../../../../../../resources/domain/transaction'
import { displayValueData } from '../../../../../../resources/utils/displayValue'
import { chainUsesOptimismFees } from '../../../../../../resources/utils/chains'
import link from '../../../../../../resources/link'
import {
  ClusterBox,
  Cluster,
  ClusterRow,
  ClusterValue,
  ClusterColumn
} from '../../../../../../resources/Components/Cluster'

const FEE_WARNING_THRESHOLD_USD = 50

const GasDisplay = ({ maxFeePerGas }: { maxFeePerGas: any }) => {
  const { displayValue: gweiDisplayValue } = maxFeePerGas.gwei()
  const shouldDisplayWei = gweiDisplayValue === '0'
  const displayValue = shouldDisplayWei ? maxFeePerGas.wei().displayValue : gweiDisplayValue
  const displayLabel = shouldDisplayWei ? 'Wei' : 'Gwei'

  return (
    <div data-testid='gas-display' className='_txFeeGwei'>
      <span className='_txFeeGweiValue'>{displayValue}</span>
      <span className='_txFeeGweiLabel'>{displayLabel}</span>
    </div>
  )
}

const FeeDisplay = ({ fee }: { fee: any }) => <DisplayValue type='fiat' value={fee} currencySymbol='$' />
const FeeRange = ({ max, min }: { max: any; min: any }) => (
  <>
    <FeeDisplay fee={min} />
    <span>{'-'}</span>
    <FeeDisplay fee={max} />
  </>
)

const USDEstimateDisplay = ({
  minFee,
  maxFee,
  nativeCurrency
}: {
  minFee: any
  maxFee: any
  nativeCurrency: any
}) => {
  const { value: maxFeeValue, displayValue, approximationSymbol: maxFeeApproximation } = maxFee.fiat()
  const displayMaxFeeWarning = maxFeeValue > FEE_WARNING_THRESHOLD_USD
  const maxFeeIsUnknownValue = displayValue === '?'

  return (
    <div data-testid='usd-estimate-display' className='clusterTag'>
      <div className={`_txFeeValueDefault${displayMaxFeeWarning ? ' _txFeeValueDefaultWarn' : ''}`}>
        <span>{maxFeeIsUnknownValue ? '=' : '≈'}</span>
        {maxFeeApproximation === '<' || maxFeeIsUnknownValue ? (
          <FeeDisplay fee={maxFee} />
        ) : (
          <FeeRange max={maxFee} min={minFee} />
        )}
        <span className='_txFeeValueCurrency'>{`in ${nativeCurrency.symbol}`}</span>
      </div>
    </div>
  )
}

class TxFee extends React.Component<any, any> {
  declare store: Store

  constructor(props: any, context?: any) {
    super(props, context)
  }

  getOptimismFee = (l2Price: any, l2Limit: any, chainData: any) => {
    const l1DataFee = toBigInt(chainData?.l1Fees ?? '')
    if (l1DataFee === undefined) return undefined

    // Compute the L2 execution fee
    const l2ExecutionFee = l2Price * l2Limit

    // Return the sum of both fees
    return (l2ExecutionFee as any) + l1DataFee
  }

  override render() {
    const req = this.props.req
    const chain = {
      type: 'ethereum',
      id: parseInt(req.data.chainId, 16)
    }
    const { isTestnet } = this.store('main.networks', chain.type, chain.id)
    const { nativeCurrency } = this.store('main.networksMeta', chain.type, chain.id)
    const nativeCurrencyUSD = nativeCurrency.usd
    const shouldDisplayUSDEstimate = Boolean(nativeCurrencyUSD)
    const nativeCurrencyRate = !isTestnet ? nativeCurrencyUSD : undefined

    const maxGas = toBigInt(req.data.gasLimit) ?? 0n
    const maxFeePerGas = toBigInt(req.data[usesBaseFee(req.data) ? 'maxFeePerGas' : 'gasPrice']) ?? 0n
    const maxFeeSourceValue = chainUsesOptimismFees(chain.id)
      ? this.getOptimismFee(maxFeePerGas, maxGas, req.chainData?.optimism)
      : maxFeePerGas * maxGas

    const maxFee = displayValueData(maxFeeSourceValue, {
      currencyRate: nativeCurrencyRate,
      isTestnet
    } as any)

    // accounts for two potential 12.5% block fee increases (divide by (9/8)^2)
    const minFeePerGas = (maxFeePerGas * 64n) / 81n

    // accounts for the 50% padding in the gas estimate in the provider
    const minGas = (maxGas * 2n) / 3n
    const minFeeSourceValue = chainUsesOptimismFees(chain.id)
      ? this.getOptimismFee(minFeePerGas, minGas, req.chainData?.optimism)
      : minFeePerGas * minGas
    const minFee = displayValueData(minFeeSourceValue, {
      currencyRate: nativeCurrencyRate,
      isTestnet
    } as any)

    return (
      <ClusterBox title='fee' animationSlot={this.props.i}>
        <Cluster>
          <ClusterRow>
            <ClusterColumn>
              <ClusterValue
                onClick={() => {
                  link.send('nav:update', 'panel', { data: { step: 'adjustFee' } })
                }}
              >
                <GasDisplay maxFeePerGas={displayValueData(maxFeePerGas)} />
              </ClusterValue>
            </ClusterColumn>
            <ClusterColumn grow={2}>
              <ClusterValue>
                <div className='txSendingValue'>
                  {maxFee.bn === undefined ? (
                    `? ${nativeCurrency.symbol}`
                  ) : (
                    <DisplayCoinBalance amount={maxFee} symbol={nativeCurrency.symbol} />
                  )}
                </div>
              </ClusterValue>
              {shouldDisplayUSDEstimate ? (
                <ClusterValue>
                  <USDEstimateDisplay minFee={minFee} maxFee={maxFee} nativeCurrency={nativeCurrency} />
                </ClusterValue>
              ) : null}
            </ClusterColumn>
          </ClusterRow>
          {req.feesUpdatedByUser ? (
            <ClusterRow>
              <ClusterValue>
                <div className='clusterTag' style={{ color: 'var(--good)' }}>
                  {`Gas values set by user`}
                </div>
              </ClusterValue>
            </ClusterRow>
          ) : req.data.gasFeesSource !== GasFeesSource.Frame ? (
            <ClusterRow>
              <ClusterValue>
                <div className='clusterTag' style={{ color: 'var(--bad)' }}>
                  {`Gas values set by ${req.data.gasFeesSource}`}
                </div>
              </ClusterValue>
            </ClusterRow>
          ) : null}
        </Cluster>
      </ClusterBox>
    )
  }
}

export default Restore.connect(TxFee)
