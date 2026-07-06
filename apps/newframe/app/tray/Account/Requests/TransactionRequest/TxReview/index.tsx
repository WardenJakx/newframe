import React from 'react'
import Restore from 'react-restore'

import link from '../../../../../../resources/link'
import { DisplayCoinBalance } from '../../../../../../resources/Components/DisplayValue'
import {
  getPaidTransactionFee,
  TRANSACTION_CONFIRMATION_TARGET,
  getTransactionEffects,
  getTransactionIntent,
  usesBaseFee
} from '../../../../../../resources/domain/transaction'
import { chainUsesOptimismFees } from '../../../../../../resources/utils/chains'
import { displayValueData } from '../../../../../../resources/utils/displayValue'
import { getAddress } from '../../../../../../resources/utils'
import { toBigInt } from '../../../../../../resources/utils/numbers'
import TransactionInformation, { shortAddress } from '../TransactionInformation'
import type { TransactionInformationDetailRow } from '../TransactionInformation'

const FEE_WARNING_THRESHOLD_USD = 50
const FEE_RATE_OPTIONS = [
  { id: 'asap', label: 'Ape', multiplier: 150n },
  { id: 'fast', label: 'Fast', multiplier: 125n },
  { id: 'standard', label: 'Medium', multiplier: 100n },
  { id: 'slow', label: 'Slow', multiplier: 85n },
  { id: 'custom', label: 'Custom' }
]

const displayStatus = (req: any) => {
  const notice = (req.notice || '').toLowerCase()
  const status = (req.status || 'ready to sign').toLowerCase()

  if (status === 'pending' && notice === 'see signer') return 'waiting for device signature'
  if (status === 'verifying') return 'waiting for block'
  return status
}

class TxFeeSummary extends React.Component<any, any> {
  declare store: Store

  toHex = (value: bigint) => `0x${value.toString(16)}`

  scaleFee = (value: bigint, multiplier = 100n) => (value * multiplier) / 100n

  getOptimismFee = (l2Price: bigint, l2Limit: bigint, chainData: any) => {
    const l1DataFee = toBigInt(chainData?.l1Fees ?? '')
    if (l1DataFee === undefined) return undefined

    return l2Price * l2Limit + l1DataFee
  }

  applyFeeRate(option: (typeof FEE_RATE_OPTIONS)[number]) {
    const { req, chain } = this.props

    if (option.id === 'custom') {
      link.send('nav:update', 'panel', { data: { step: 'adjustFee' } })
      return
    }

    const gasPrice = this.store('main.networksMeta', chain.type, chain.id, 'gas.price') || {}
    const levels = gasPrice.levels || {}
    const fees = gasPrice.fees || {}
    const multiplier = option.multiplier || 100n

    link.send('tray:action', 'setGasDefault', chain.type, chain.id, option.id, levels[option.id])

    if (usesBaseFee(req.data)) {
      const currentPriority = toBigInt(req.data.maxPriorityFeePerGas) ?? 0n
      const currentMax = toBigInt(req.data.maxFeePerGas) ?? 0n
      const currentBase = currentMax > currentPriority ? currentMax - currentPriority : 0n
      const sampledBase = toBigInt(fees.maxBaseFeePerGas) ?? currentBase
      const sampledPriority = toBigInt(fees.maxPriorityFeePerGas) ?? currentPriority
      const nextBase = this.scaleFee(sampledBase, multiplier)
      const nextPriority = this.scaleFee(sampledPriority, multiplier)

      link.rpc('setPriorityFee', this.toHex(nextPriority), req.handlerId, (e: any) => {
        if (e) console.error(e)
      })
      link.rpc('setBaseFee', this.toHex(nextBase), req.handlerId, (e: any) => {
        if (e) console.error(e)
      })
      return
    }

    const currentGasPrice = toBigInt(req.data.gasPrice) ?? 0n
    const levelGasPrice = toBigInt(levels[option.id])
    const nextGasPrice = levelGasPrice ?? this.scaleFee(currentGasPrice, multiplier)

    link.rpc('setGasPrice', this.toHex(nextGasPrice), req.handlerId, (e: any) => {
      if (e) console.error(e)
    })
  }

  override render() {
    const { req, chain, nativeCurrency, isTestnet } = this.props
    const paidFee = getPaidTransactionFee(req)
    const nativeCurrencyRate = !isTestnet ? nativeCurrency.usd : undefined

    const maxGas = toBigInt(req.data.gasLimit) ?? 0n
    const maxFeePerGas = toBigInt(req.data[usesBaseFee(req.data) ? 'maxFeePerGas' : 'gasPrice']) ?? 0n
    const executionFee = maxFeePerGas * maxGas
    const maxFeeSourceValue = chainUsesOptimismFees(chain.id)
      ? this.getOptimismFee(maxFeePerGas, maxGas, req.chainData?.optimism)
      : executionFee
    const displayedFee = paidFee || maxFeeSourceValue || executionFee
    const fee = displayValueData(displayedFee, {
      currencyRate: nativeCurrencyRate,
      isTestnet
    } as any)
    const feeUSD = fee.fiat()
    const gasDisplay = displayValueData(maxFeePerGas).gwei()
    const shouldWarn = feeUSD.value > FEE_WARNING_THRESHOLD_USD
    const selectedRate = req.feesUpdatedByUser
      ? 'custom'
      : this.store('main.networksMeta', chain.type, chain.id, 'gas.price.selected') || 'fast'
    const canAdjustFee = !paidFee && !req.status

    return (
      <section aria-label='Network fee' className='txReviewFee'>
        <div className='txReviewFeeSummary'>
          <div className='txReviewFeeMain'>
            <div className='txReviewFeeLabel'>{paidFee ? 'Paid fee' : 'Max fee'}</div>
            <div className={shouldWarn ? 'txReviewFeeValue txReviewFeeValueWarn' : 'txReviewFeeValue'}>
              {fee.bn === undefined ? (
                `? ${nativeCurrency.symbol}`
              ) : (
                <DisplayCoinBalance amount={fee} symbol={nativeCurrency.symbol} />
              )}
            </div>
          </div>
          <div className='txReviewFeeMeta'>
            <span>{gasDisplay.displayValue} Gwei</span>
          </div>
        </div>
        {canAdjustFee ? (
          <div className='txReviewFeeRates' role='group' aria-label='Fee rate'>
            {FEE_RATE_OPTIONS.map((option) => (
              <button
                key={option.id}
                aria-pressed={selectedRate === option.id}
                className={
                  selectedRate === option.id ? 'txReviewFeeRate txReviewFeeRateActive' : 'txReviewFeeRate'
                }
                onClick={() => this.applyFeeRate(option)}
                type='button'
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </section>
    )
  }
}

const ConnectedTxFeeSummary = Restore.connect(TxFeeSummary)

class TxReview extends React.Component<any, any> {
  declare store: Store

  copyAddress(data: string) {
    link.send('tray:clipboardData', data)
  }

  override render() {
    const { req } = this.props
    const chainId = parseInt(req.data.chainId, 16)
    const chain = { type: 'ethereum', id: chainId }
    const network = this.store('main.networks.ethereum', chainId) || {}
    const meta = this.store('main.networksMeta.ethereum', chainId) || {}
    const nativeCurrency = meta.nativeCurrency || { symbol: '?' }
    const symbol = nativeCurrency.symbol || '?'
    const chainName = network.name || `Chain ${chainId}`
    const originName = this.store('main.origins', req.origin, 'name') || this.props.originName || req.origin
    const intent = getTransactionIntent(req, symbol)
    const to = req.data.to ? getAddress(req.data.to) : ''
    const from = req.data.from || req.account
    const calldata = req.data.data
    const method = req.decodedData?.method
    const contractName = req.decodedData?.contractName
    const source = req.decodedData?.source
    const block = req.tx?.receipt?.blockNumber ? parseInt(req.tx.receipt.blockNumber, 16) : undefined
    const effects = getTransactionEffects(req, symbol)
    const simulationStatus = req.simulation?.status
    const effectsEmptyText =
      simulationStatus === 'loading'
        ? 'Checking asset changes'
        : simulationStatus === 'error' || simulationStatus === 'unavailable'
          ? 'Simulation unavailable'
          : 'No direct asset changes detected'
    const notice =
      req.notice && req.notice.toLowerCase() !== (req.status || '').toLowerCase() ? req.notice : undefined
    const details: TransactionInformationDetailRow[] = [
      { label: 'Origin', value: originName },
      {
        label: 'From',
        value: shortAddress(from),
        onClick: () => from && this.copyAddress(from)
      },
      {
        label: 'To',
        value: req.recipient || shortAddress(to),
        onClick: () => to && this.copyAddress(to)
      },
      { label: 'Contract', value: contractName },
      { label: 'Method', value: method },
      { label: 'Decode source', value: source }
    ]

    if (calldata && calldata !== '0x') {
      details.push({
        label: 'Calldata digest',
        value: req.data.calldataDigest || 'View data',
        onClick: () => {
          link.send('nav:update', 'panel', { data: { step: 'viewData' } })
        }
      })
    }

    return (
      <TransactionInformation
        networkName={chainName}
        networkColor={meta.primaryColor ? `var(--${meta.primaryColor})` : undefined}
        title={intent.title}
        subtitle={intent.subtitle}
        statusLabel={displayStatus(req)}
        notice={notice}
        progress={{
          status: req.status,
          notice: req.notice,
          txHash: req.tx?.hash,
          confirmations: req.tx?.confirmations,
          confirmationTarget: TRANSACTION_CONFIRMATION_TARGET,
          blockNumber: block
        }}
        effects={effects}
        effectsEmptyText={effectsEmptyText}
        details={details}
        nativeCurrency={nativeCurrency}
      >
        <ConnectedTxFeeSummary
          chain={chain}
          isTestnet={Boolean(network.isTestnet)}
          nativeCurrency={nativeCurrency}
          req={req}
        />
      </TransactionInformation>
    )
  }
}

export default Restore.connect(TxReview)
