import React from 'react'

import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { SidePanelHeader } from '../../../../../resources/Components/SidePanel/SidePanelHeader'
import { getContraPreposition } from '../../../../../resources/domain/flash/pair'
import { ChainIcon } from '../../components/ChainIcon'
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
        <Text tone='muted' variant='overline'>
          {label}
        </Text>
        <div className={monospace ? 't2OrderDetailValueCode' : undefined}>
          <Text align='end' truncate={!monospace} variant={monospace ? 'code' : 'supporting'}>
            {value}
          </Text>
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
      <SidePanelHeader closeLabel='Back to orders' onClose={onBack} title='Order' />
      <div className='t2OverlayScroll t2OrderDetailScroll'>
        <div className='t2OrderDetailHero'>
          <div className='t2OrderDetailPair'>
            <OrderAssetPill
              asset={order.targetAsset}
              fallbackChainId={chainId}
              networks={networks}
              networksMeta={networksMeta}
            />
            <Text align='center' truncate variant='label'>
              {orderPairIntent(order)}
            </Text>
            <OrderAssetPill
              asset={order.contraAsset}
              fallbackChainId={chainId}
              networks={networks}
              networksMeta={networksMeta}
              prefix={side ? getContraPreposition(side) : 'with'}
            />
          </div>
          <Stack direction='row' gap='xsmall' wrap>
            <Text tone='muted' variant='code'>
              {orderStatusLabel(order)}
            </Text>
            <Text tone='muted' variant='code'>
              {orderTypeLabel(order)}
            </Text>
            <Text tone='muted' variant='code'>
              {orderSize(order)}
            </Text>
          </Stack>
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
              <Text truncate variant='supporting'>
                {chain.name || `Chain ${chainId}`}
              </Text>
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
            <Text tone='muted' variant='overline'>
              Status Payload
            </Text>
            <pre>{rawStatusPayload}</pre>
          </div>
        ) : null}
        {rawPayload ? (
          <div className='t2OrderJsonSection'>
            <Text tone='muted' variant='overline'>
              Raw Payload
            </Text>
            <pre>{rawPayload}</pre>
          </div>
        ) : null}
      </div>
    </div>
  )
}
