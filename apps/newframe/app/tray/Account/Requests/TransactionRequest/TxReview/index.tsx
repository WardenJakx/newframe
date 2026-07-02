import React from 'react'
import Restore from 'react-restore'

import link from '../../../../../../resources/link'
import svg from '../../../../../../resources/svg'
import { DisplayCoinBalance } from '../../../../../../resources/Components/DisplayValue'
import {
  getPaidTransactionFee,
  TRANSACTION_CONFIRMATION_TARGET,
  getTransactionEffects,
  getTransactionIntent,
  usesBaseFee
} from '../../../../../../resources/domain/transaction'
import { cachedImageUrl } from '../../../../../../resources/domain/imageCache'
import { chainUsesOptimismFees } from '../../../../../../resources/utils/chains'
import { displayValueData } from '../../../../../../resources/utils/displayValue'
import { getAddress } from '../../../../../../resources/utils'
import { toBigInt } from '../../../../../../resources/utils/numbers'

const FEE_WARNING_THRESHOLD_USD = 50
const FEE_RATE_OPTIONS = [
  { id: 'asap', label: 'Ape', multiplier: 150n },
  { id: 'fast', label: 'Fast', multiplier: 125n },
  { id: 'standard', label: 'Medium', multiplier: 100n },
  { id: 'slow', label: 'Slow', multiplier: 85n },
  { id: 'custom', label: 'Custom' }
]

const shortAddress = (address?: string) => {
  if (!address) return ''
  return `${address.slice(0, 8)}...${address.slice(-6)}`
}

const displayStatus = (req: any) => {
  const notice = (req.notice || '').toLowerCase()
  const status = (req.status || 'ready to sign').toLowerCase()

  if (status === 'pending' && notice === 'see signer') return 'waiting for device signature'
  if (status === 'verifying') return 'waiting for block'
  return status
}

const statusRank = (status?: string) => {
  switch (status) {
    case 'pending':
      return 1
    case 'sending':
      return 2
    case 'sent':
    case 'verifying':
      return 2
    case 'confirming':
      return 3
    case 'confirmed':
      return 4
    default:
      return 0
  }
}

const stepState = (req: any, index: number) => {
  if (req.status === 'error' || req.status === 'declined') {
    const rank = Math.max(statusRank(req.status), 1)
    if (index < rank) return 'complete'
    if (index === rank) return 'error'
    return 'idle'
  }

  const rank = statusRank(req.status)
  if (rank > index) return 'complete'
  if (rank === index) return 'active'
  return 'idle'
}

const ProgressMarker = ({ state }: { state: string }) => {
  if (state === 'complete')
    return <div className='txReviewProgressMarkerIcon'>{svg.octicon('check', { height: 10 })}</div>
  if (state === 'error')
    return <div className='txReviewProgressMarkerIcon'>{svg.octicon('x', { height: 10 })}</div>
  if (state === 'active') return <div className='txReviewProgressMarkerSpinner' />
  return <div className='txReviewProgressMarkerDot' />
}

const TransactionProgress = ({ req }: { req: any }) => {
  const confirmations = req.tx?.confirmations || 0
  const block = req.tx?.receipt?.blockNumber ? parseInt(req.tx.receipt.blockNumber, 16) : undefined
  const steps = [
    {
      title: 'Review',
      detail: req.status ? 'Request accepted' : 'Ready to sign'
    },
    {
      title: 'Signed',
      detail:
        req.status === 'pending'
          ? req.notice || 'Waiting for signature'
          : statusRank(req.status) > 1
            ? 'Signature complete'
            : 'Awaiting signature'
    },
    {
      title: 'Submitted',
      detail: req.tx?.hash
        ? shortAddress(req.tx.hash)
        : req.status === 'sending'
          ? 'Broadcasting'
          : 'Not sent'
    },
    {
      title: 'Confirmed',
      detail:
        req.status === 'confirmed'
          ? block
            ? `Block ${block}`
            : 'Finalized'
          : req.status === 'confirming'
            ? `${confirmations}/${TRANSACTION_CONFIRMATION_TARGET} confirmations`
            : 'Waiting for inclusion'
    }
  ]

  return (
    <section aria-label='Transaction progress' className='txReviewProgress'>
      {steps.map((step, index) => {
        const state = stepState(req, index)
        return (
          <div key={step.title} className={`txReviewProgressStep txReviewProgressStep-${state}`}>
            <div className='txReviewProgressRail' />
            <div className='txReviewProgressMarker'>
              <ProgressMarker state={state} />
            </div>
            <div className='txReviewProgressCopy'>
              <div className='txReviewProgressTitle'>{step.title}</div>
              <div className='txReviewProgressDetail'>{step.detail}</div>
            </div>
          </div>
        )
      })}
    </section>
  )
}

const DetailRow = ({
  label,
  value,
  onClick
}: {
  label: string
  value?: React.ReactNode
  onClick?: () => void
}) => {
  if (!value) return null

  return (
    <div
      className={onClick ? 'txReviewDetailRow txReviewDetailRowClickable' : 'txReviewDetailRow'}
      onClick={onClick}
    >
      <div className='txReviewDetailLabel'>{label}</div>
      <div className='txReviewDetailValue'>{value}</div>
    </div>
  )
}

const ASSET_SYMBOL_MAX_FONT_SIZE = 9
const ASSET_SYMBOL_MIN_FONT_SIZE = 4
const ASSET_SYMBOL_PADDING = 4

const FittedAssetSymbol = ({ symbol }: { symbol: string }) => {
  const frameRef = React.useRef<HTMLDivElement | null>(null)
  const textRef = React.useRef<HTMLSpanElement | null>(null)

  React.useLayoutEffect(() => {
    const fit = () => {
      const frame = frameRef.current
      const text = textRef.current
      if (!frame || !text) return

      const maxWidth = frame.clientWidth - ASSET_SYMBOL_PADDING * 2
      const maxHeight = frame.clientHeight - ASSET_SYMBOL_PADDING * 2
      if (maxWidth <= 0 || maxHeight <= 0) return

      let size = ASSET_SYMBOL_MAX_FONT_SIZE
      text.style.fontSize = `${size}px`

      while (
        size > ASSET_SYMBOL_MIN_FONT_SIZE &&
        (text.scrollWidth > maxWidth || text.scrollHeight > maxHeight)
      ) {
        size -= 0.5
        text.style.fontSize = `${size}px`
      }
    }

    fit()

    if (typeof ResizeObserver === 'undefined' || !frameRef.current) return undefined

    const observer = new ResizeObserver(fit)
    observer.observe(frameRef.current)

    return () => observer.disconnect()
  }, [symbol])

  return (
    <div ref={frameRef} className='txReviewEffectIconSymbolFrame'>
      <span ref={textRef} className='txReviewEffectIconSymbol' title={symbol}>
        {symbol}
      </span>
    </div>
  )
}

const AssetIcon = ({ effect, nativeCurrency }: { effect: any; nativeCurrency: any }) => {
  const icon = effect.logoURI || (effect.kind === 'native' ? nativeCurrency.icon : '')
  const symbol = (effect.symbol || '?').trim() || '?'

  return (
    <div className='txReviewEffectIcon'>
      {icon ? (
        <img src={cachedImageUrl(icon)} alt='' />
      ) : effect.kind === 'native' && symbol.toUpperCase() === 'ETH' ? (
        svg.eth(14)
      ) : (
        <FittedAssetSymbol symbol={symbol} />
      )}
    </div>
  )
}

const TransactionEffects = ({
  req,
  symbol,
  nativeCurrency
}: {
  req: any
  symbol: string
  nativeCurrency: any
}) => {
  const effects = getTransactionEffects(req, symbol)
  const simulationStatus = req.simulation?.status
  const emptyText =
    simulationStatus === 'loading'
      ? 'Checking asset changes'
      : simulationStatus === 'error' || simulationStatus === 'unavailable'
        ? 'Simulation unavailable'
        : 'No direct asset changes detected'

  return (
    <section aria-label='Transaction effects' className='txReviewSection'>
      <div className='txReviewSectionTitle'>Transaction effects</div>
      <div className='txReviewEffectList'>
        {effects.length ? (
          effects.map((effect) => (
            <div key={effect.id} className={`txReviewEffect txReviewEffect-${effect.direction}`}>
              <AssetIcon effect={effect} nativeCurrency={nativeCurrency} />
              <div className='txReviewEffectMeta'>
                <div className='txReviewEffectLabel'>{effect.label}</div>
                {effect.detail ? <div className='txReviewEffectDetail'>{effect.detail}</div> : null}
              </div>
              <div className='txReviewEffectAmount'>
                {effect.direction === 'out' ? <span className='txReviewEffectPrefix'>-</span> : null}
                {effect.direction === 'in' ? <span className='txReviewEffectPrefix'>+</span> : null}
                <DisplayCoinBalance
                  amount={effect.amount || '0x0'}
                  decimals={effect.decimals}
                  symbol={effect.symbol}
                />
              </div>
            </div>
          ))
        ) : (
          <div className='txReviewEffectEmpty'>{emptyText}</div>
        )}
      </div>
    </section>
  )
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

    return (
      <div className='txReview'>
        <section className='txReviewHero'>
          <div
            className='txReviewHeroNetwork'
            style={{ color: meta.primaryColor ? `var(--${meta.primaryColor})` : undefined }}
          >
            <span>{chainName}</span>
          </div>
          <div className='txReviewHeroTitle'>{intent.title}</div>
          <div className='txReviewHeroSubtitle'>{intent.subtitle}</div>
          <span className='txReviewStatus' role='status'>
            {displayStatus(req)}
          </span>
          {req.notice && req.notice.toLowerCase() !== (req.status || '').toLowerCase() ? (
            <div className='txReviewNotice' role='alert'>
              {req.notice}
            </div>
          ) : null}
        </section>

        <TransactionProgress req={req} />

        <TransactionEffects req={req} symbol={symbol} nativeCurrency={nativeCurrency} />

        <section aria-label='Transaction details' className='txReviewSection'>
          <div className='txReviewSectionTitle'>Transaction details</div>
          <div className='txReviewDetails'>
            <DetailRow label='Origin' value={originName} />
            <DetailRow
              label='From'
              value={shortAddress(from)}
              onClick={() => from && this.copyAddress(from)}
            />
            <DetailRow
              label='To'
              value={req.recipient || shortAddress(to)}
              onClick={() => to && this.copyAddress(to)}
            />
            <DetailRow label='Contract' value={contractName} />
            <DetailRow label='Method' value={method} />
            <DetailRow label='Decode source' value={source} />
            {calldata && calldata !== '0x' ? (
              <DetailRow
                label='Calldata digest'
                value={req.data.calldataDigest || 'View data'}
                onClick={() => {
                  link.send('nav:update', 'panel', { data: { step: 'viewData' } })
                }}
              />
            ) : null}
          </div>
        </section>

        <ConnectedTxFeeSummary
          chain={chain}
          isTestnet={Boolean(network.isTestnet)}
          nativeCurrency={nativeCurrency}
          req={req}
        />
      </div>
    )
  }
}

export default Restore.connect(TxReview)
