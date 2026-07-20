import React from 'react'

import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import { DetailRow } from '../../../../../resources/Components/DetailRow'
import { TrayOverlay } from '../../../../../resources/Components/TrayOverlay'
import { getContraPreposition } from '../../../../../resources/domain/flash/pair'
import { cva } from '../../../../../resources/styled-system/css/cva.js'
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

const payloadRecipe = cva({
  base: {
    margin: 0,
    maxHeight: 'scroll-menu',
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  }
})

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
      <DetailRow
        code={monospace}
        label={label}
        labelVariant='overline'
        value={value}
        valueVariant='supporting'
      />
    )
  }
  const rawPayload = orderJson(order.rawPayload)
  const rawStatusPayload = orderJson(order.rawStatusPayload)
  const shortAddress = (address = '') =>
    address ? `${address.substring(0, 5)}…${address.substring(address.length - 4)}` : ''

  return (
    <TrayOverlay closeLabel='Back to orders' label='Order details' onClose={onBack} title='Order'>
      <Stack gap='medium'>
        <Stack align='center' gap='small'>
          <Stack align='center' direction='row' gap='small' justify='center'>
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
          </Stack>
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
        </Stack>
        <Stack gap='none'>
          {detailRow('Order ID', order.orderId || orderId, true)}
          {detailRow('Provider', order.provider || order.source)}
          {detailRow('Environment', order.environment)}
          {detailRow('Profile', order.profile)}
          {detailRow('Account', shortAddress(order.accountAddress), true)}
          {detailRow(
            'Chain',
            <Stack align='center' direction='row' gap='xsmall' justify='end'>
              <ChainIcon chainId={chainId} networks={networks} networksMeta={networksMeta} size='large' />
              <Text truncate variant='supporting'>
                {chain.name || `Chain ${chainId}`}
              </Text>
            </Stack>
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
        </Stack>
        {rawStatusPayload ? (
          <Surface padding='small' radius='small' tone='subtle'>
            <Stack gap='xsmall'>
              <Text tone='muted' variant='overline'>
                Status Payload
              </Text>
              <pre className={payloadRecipe()}>
                <Text variant='microCode'>{rawStatusPayload}</Text>
              </pre>
            </Stack>
          </Surface>
        ) : null}
        {rawPayload ? (
          <Surface padding='small' radius='small' tone='subtle'>
            <Stack gap='xsmall'>
              <Text tone='muted' variant='overline'>
                Raw Payload
              </Text>
              <pre className={payloadRecipe()}>
                <Text variant='microCode'>{rawPayload}</Text>
              </pre>
            </Stack>
          </Surface>
        ) : null}
      </Stack>
    </TrayOverlay>
  )
}
