import React from 'react'

import svg from '../../../../../../resources/svg'
import { DisplayCoinBalance } from '../../../../../../resources/Components/DisplayValue'
import StatusGlyph from '../../../../../../resources/Components/StatusGlyph'
import { cachedImageUrl } from '../../../../../../resources/domain/imageCache'

export type TransactionProgressData = {
  status?: string
  notice?: string
  txHash?: string
  confirmations?: number
  confirmationTarget?: number
  blockNumber?: number | string
}

export type TransactionInformationEffect = {
  id: React.Key
  direction: string
  kind?: string
  logoURI?: string
  symbol?: string
  amount?: any
  decimals?: any
  label: React.ReactNode
  detail?: React.ReactNode
}

export type TransactionInformationDetailRow = {
  label: string
  value?: React.ReactNode
  onClick?: () => void
}

export type TransactionInformationNativeCurrency = {
  icon?: string
}

export type TransactionInformationProps = {
  networkName: React.ReactNode
  networkColor?: string
  title: React.ReactNode
  subtitle?: React.ReactNode
  statusLabel: React.ReactNode
  notice?: React.ReactNode
  progress: TransactionProgressData
  effects: TransactionInformationEffect[]
  effectsEmptyText: React.ReactNode
  details: TransactionInformationDetailRow[]
  nativeCurrency: TransactionInformationNativeCurrency
  children?: React.ReactNode
}

export const shortAddress = (address?: string) => {
  if (!address) return ''
  return `${address.slice(0, 8)}...${address.slice(-6)}`
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

const stepState = (status: string | undefined, index: number) => {
  if (status === 'error' || status === 'declined') {
    const rank = Math.max(statusRank(status), 1)
    if (index < rank) return 'complete'
    if (index === rank) return 'error'
    return 'idle'
  }

  const rank = statusRank(status)
  if (rank > index) return 'complete'
  if (rank === index) return 'active'
  return 'idle'
}

const ProgressMarker = ({ state }: { state: string }) => {
  if (state === 'complete')
    return (
      <div className='txReviewProgressMarkerIcon'>
        <StatusGlyph state='completed' size='small' />
      </div>
    )
  if (state === 'error')
    return (
      <div className='txReviewProgressMarkerIcon'>
        <StatusGlyph state='failed' size='small' />
      </div>
    )
  if (state === 'active') return <StatusGlyph state='pending' size='small' />
  return <div className='txReviewProgressMarkerDot' />
}

const confirmationDetail = (confirmations: number, confirmationTarget?: number) => {
  if (confirmationTarget) return `${confirmations}/${confirmationTarget} confirmations`
  return `${confirmations} confirmations`
}

const TransactionProgress = ({ progress }: { progress: TransactionProgressData }) => {
  const confirmations = progress.confirmations || 0
  const steps = [
    {
      title: 'Review',
      detail: progress.status ? 'Request accepted' : 'Ready to sign'
    },
    {
      title: 'Signed',
      detail:
        progress.status === 'pending'
          ? progress.notice || 'Waiting for signature'
          : statusRank(progress.status) > 1
            ? 'Signature complete'
            : 'Awaiting signature'
    },
    {
      title: 'Submitted',
      detail: progress.txHash
        ? shortAddress(progress.txHash)
        : progress.status === 'sending'
          ? 'Broadcasting'
          : 'Not sent'
    },
    {
      title: 'Confirmed',
      detail:
        progress.status === 'confirmed'
          ? progress.blockNumber
            ? `Block ${progress.blockNumber}`
            : 'Finalized'
          : progress.status === 'confirming'
            ? confirmationDetail(confirmations, progress.confirmationTarget)
            : 'Waiting for inclusion'
    }
  ]

  return (
    <section aria-label='Transaction progress' className='txReviewProgress'>
      {steps.map((step, index) => {
        const state = stepState(progress.status, index)
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

const AssetIcon = ({
  effect,
  nativeCurrency
}: {
  effect: TransactionInformationEffect
  nativeCurrency: TransactionInformationNativeCurrency
}) => {
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
  effects,
  emptyText,
  nativeCurrency
}: {
  effects: TransactionInformationEffect[]
  emptyText: React.ReactNode
  nativeCurrency: TransactionInformationNativeCurrency
}) => {
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
                  symbol={effect.symbol || '?'}
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

const TransactionInformation = ({
  networkName,
  networkColor,
  title,
  subtitle,
  statusLabel,
  notice,
  progress,
  effects,
  effectsEmptyText,
  details,
  nativeCurrency,
  children
}: TransactionInformationProps) => {
  return (
    <div className='txReview'>
      <section className='txReviewHero'>
        <div className='txReviewHeroNetwork' style={{ color: networkColor }}>
          <span>{networkName}</span>
        </div>
        <div className='txReviewHeroTitle'>{title}</div>
        <div className='txReviewHeroSubtitle'>{subtitle}</div>
        <span className='txReviewStatus' role='status'>
          {statusLabel}
        </span>
        {notice ? (
          <div className='txReviewNotice' role='alert'>
            {notice}
          </div>
        ) : null}
      </section>

      <TransactionProgress progress={progress} />

      <TransactionEffects effects={effects} emptyText={effectsEmptyText} nativeCurrency={nativeCurrency} />

      <section aria-label='Transaction details' className='txReviewSection'>
        <div className='txReviewSectionTitle'>Transaction details</div>
        <div className='txReviewDetails'>
          {details.map((detail, index) => (
            <DetailRow
              key={`${detail.label}-${index}`}
              label={detail.label}
              value={detail.value}
              onClick={detail.onClick}
            />
          ))}
        </div>
      </section>

      {children}
    </div>
  )
}

export default TransactionInformation
