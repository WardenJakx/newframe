import React from 'react'

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
import { useNetwork, useNetworkMetadata, useOriginName } from '../../state'
import { useRequestView } from '../../../../requestView'

const FEE_WARNING_THRESHOLD_USD = 50
const FEE_RATE_OPTIONS = [
  { id: 'asap', label: 'Ape' },
  { id: 'fast', label: 'Fast' },
  { id: 'standard', label: 'Medium' },
  { id: 'slow', label: 'Slow' },
  { id: 'custom', label: 'Custom' }
] as const

const displayStatus = (req: any) => {
  const notice = (req.notice || '').toLowerCase()
  const status = (req.status || 'ready to sign').toLowerCase()

  if (status === 'pending' && notice === 'see signer') return 'waiting for device signature'
  if (status === 'verifying') return 'waiting for block'
  return status
}

export function TxFeeSummary(props: any) {
  const getOptimismFee = (l2Price: bigint, l2Limit: bigint, chainData: any) => {
    const l1DataFee = toBigInt(chainData?.l1Fees ?? '')
    if (l1DataFee === undefined) return undefined

    return l2Price * l2Limit + l1DataFee
  }

  const applyFeeRate = (option: (typeof FEE_RATE_OPTIONS)[number]) => {
    const { req } = props

    if (option.id === 'custom') {
      props.openRequestView({ step: 'adjustFee' })
      return
    }

    void link.executeCommand({
      type: 'transaction.fee-default-set',
      requestId: req.handlerId,
      level: option.id
    })
  }

  const { req, chain, nativeCurrency, isTestnet } = props
  const paidFee = getPaidTransactionFee(req)
  const nativeCurrencyRate = !isTestnet ? nativeCurrency.usd : undefined

  const maxGas = toBigInt(req.data.gasLimit) ?? 0n
  const maxFeePerGas = toBigInt(req.data[usesBaseFee(req.data) ? 'maxFeePerGas' : 'gasPrice']) ?? 0n
  const executionFee = maxFeePerGas * maxGas
  const maxFeeSourceValue = chainUsesOptimismFees(chain.id)
    ? getOptimismFee(maxFeePerGas, maxGas, req.chainData?.optimism)
    : executionFee
  const displayedFee = paidFee || maxFeeSourceValue || executionFee
  const fee = displayValueData(displayedFee, {
    currencyRate: nativeCurrencyRate,
    isTestnet
  } as any)
  const feeUSD = fee.fiat()
  const gasDisplay = displayValueData(maxFeePerGas).gwei()
  const shouldWarn = feeUSD.value > FEE_WARNING_THRESHOLD_USD
  const selectedRate = req.feesUpdatedByUser ? 'custom' : props.gasPrice?.selected || 'fast'
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
              onClick={() => applyFeeRate(option)}
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

export function TxReview(props: any) {
  const copyAddress = (data: string) => {
    void link.executeCommand({ type: 'clipboard.write', text: data })
  }

  const { req } = props
  const chainId = parseInt(req.data.chainId, 16)
  const chain = { type: 'ethereum', id: chainId }
  const { network, networkMetadata: meta } = props
  const nativeCurrency = meta.nativeCurrency || { symbol: '?' }
  const symbol = nativeCurrency.symbol || '?'
  const chainName = network.name || `Chain ${chainId}`
  const originName = props.originName || req.origin
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
      onClick: () => from && copyAddress(from)
    },
    {
      label: 'To',
      value: req.recipient || shortAddress(to),
      onClick: () => to && copyAddress(to)
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
        props.openRequestView({ step: 'viewData' })
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
      <TxFeeSummary
        chain={chain}
        gasPrice={meta.gas?.price}
        isTestnet={Boolean(network.isTestnet)}
        nativeCurrency={nativeCurrency}
        openRequestView={props.openRequestView}
        req={req}
      />
    </TransactionInformation>
  )
}

export default function TxReviewWithState(props: any) {
  const chainId = parseInt(props.req.data.chainId, 16)
  const network = useNetwork('ethereum', chainId)
  const networkMetadata = useNetworkMetadata('ethereum', chainId)
  const originName = useOriginName(props.req.origin)
  const { open } = useRequestView()
  return (
    <TxReview
      {...props}
      network={network}
      networkMetadata={networkMetadata}
      originName={originName}
      openRequestView={open}
    />
  )
}
