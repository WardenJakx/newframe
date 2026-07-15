import React from 'react'

import svg from '../../../../../resources/svg'
import { getContraPreposition } from '../../../../../resources/domain/flash/pair'
import { ChainIcon } from '../../components/ChainIcon'
import { activateOnKeyboard } from '../../ui/keyboard'
import { OrderAssetPill } from './OrderAssetPill'
import {
  formatOrderAmount,
  normalizeOrderSide,
  orderDateTime,
  orderJson,
  orderPairIntent,
  orderSideLabel,
  orderSize,
  orderStatusLabel,
  orderTypeLabel
} from './orderModel'

export function OrderDetailsView({
  networks,
  networksMeta,
  onBack,
  order,
  orderId
}: {
  networks: Record<string | number, any>
  networksMeta: Record<string | number, any>
  onBack: () => void
  order: any
  orderId: string
}) {
  const chainId = Number(order.chainId)
  const chain = networks[chainId] || {}
  const side = normalizeOrderSide(order.side)
  const detailRow = (label: string, value: React.ReactNode, monospace = false) => {
    if (value === undefined || value === null || value === '') return null
    return (
      <div className='t2OrderDetailRow'>
        <div className='t2OrderDetailLabel'>{label}</div>
        <div className={monospace ? 't2OrderDetailValue t2OrderDetailValueCode' : 't2OrderDetailValue'}>
          {value}
        </div>
      </div>
    )
  }
  const rawPayload = orderJson(order.rawPayload)
  const rawStatusPayload = orderJson(order.rawStatusPayload)
  const shortAddress = (address = '') =>
    address ? `${address.substring(0, 5)}…${address.substring(address.length - 4)}` : ''

  return (
    <div aria-label='Order details' className='t2Overlay t2OrderOverlay cardShow' role='dialog'>
      <div className='t2OverlayHeader'>
        <div
          aria-label='Back to orders'
          className='t2OverlayBack'
          onClick={onBack}
          onKeyDown={(event) => activateOnKeyboard(event, onBack)}
          role='button'
          tabIndex={0}
        >
          {svg.chevronLeft(13)}
        </div>
        <div className='t2OverlayTitle'>Order</div>
        <div className='t2OverlaySpacer' />
      </div>
      <div className='t2OverlayScroll t2OrderDetailScroll'>
        <div className='t2OrderDetailHero'>
          <div className='t2OrderDetailPair'>
            <OrderAssetPill
              asset={order.targetAsset}
              fallbackChainId={chainId}
              networks={networks}
              networksMeta={networksMeta}
            />
            <div className='t2OrderDetailIntent'>{orderPairIntent(order)}</div>
            <OrderAssetPill
              asset={order.contraAsset}
              fallbackChainId={chainId}
              networks={networks}
              networksMeta={networksMeta}
              prefix={side ? getContraPreposition(side) : 'with'}
            />
          </div>
          <div className='t2OrderDetailMeta'>
            <span>{orderStatusLabel(order)}</span>
            <span>{orderTypeLabel(order)}</span>
            <span>{orderSize(order)}</span>
          </div>
        </div>
        <div className='t2OrderDetailList'>
          {detailRow('Order ID', order.orderId || orderId, true)}
          {detailRow('Provider', order.provider || order.source)}
          {detailRow('Environment', order.environment)}
          {detailRow('Profile', order.profile)}
          {detailRow('Account', shortAddress(order.accountAddress), true)}
          {detailRow(
            'Chain',
            <div className='t2OrderChainValue'>
              <div className='t2OrderChainIcon'>
                <ChainIcon chainId={chainId} imageSize={18} networks={networks} networksMeta={networksMeta} />
              </div>
              <span>{chain.name || `Chain ${chainId}`}</span>
            </div>
          )}
          {detailRow('Status', orderStatusLabel(order))}
          {detailRow('Raw status', order.rawStatus)}
          {detailRow('Side', orderSideLabel(order))}
          {detailRow('Type', orderTypeLabel(order))}
          {detailRow('Size', orderSize(order))}
          {detailRow('Spent amount', formatOrderAmount(order.spentAmount))}
          {detailRow('Output amount', formatOrderAmount(order.outputAmount))}
          {detailRow('Estimated output', formatOrderAmount(order.estimatedOutputAmount))}
          {detailRow('Filled output', formatOrderAmount(order.filledOutputAmount))}
          {detailRow('Average fill price', formatOrderAmount(order.averageFillPrice))}
          {detailRow('Created', orderDateTime(order.createdAt))}
          {detailRow('Updated', orderDateTime(order.updatedAt))}
          {detailRow('Terminal', orderDateTime(order.terminalAt))}
          {detailRow('Fill hash', order.fillHash || order.fillTransactionHash, true)}
        </div>
        {rawStatusPayload ? (
          <div className='t2OrderJsonSection'>
            <div className='t2OrderJsonTitle'>Status Payload</div>
            <pre>{rawStatusPayload}</pre>
          </div>
        ) : null}
        {rawPayload ? (
          <div className='t2OrderJsonSection'>
            <div className='t2OrderJsonTitle'>Raw Payload</div>
            <pre>{rawPayload}</pre>
          </div>
        ) : null}
      </div>
    </div>
  )
}
