import type { ReactNode } from 'react'

import { Button } from '@newframe/ui/button'
import { Group } from '@newframe/ui/group'
import { MediaBadge } from '@newframe/ui/media-badge'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { cva } from '../../../../../generated/styled-system/css/cva.js'
import { persistedImageSource } from '../../../../../domain/image'
import { tokenForId, tokenImageSource } from '../../../../../domain/token'
import StatusGlyph from '../../../../shared/ui/StatusGlyph'
import ChainTokenIcon from '../../../../shared/ui/ChainTokenIcon'
import { ChainIcon } from '../../components/ChainIcon'
import {
  activityAssetEffect,
  activityBalanceChangeLabel,
  activityGasLabel,
  activityGlyphState,
  activityTimestampLabel,
  transactionStatusLabel
} from './activityModel'

const activityRowRecipe = cva({
  base: {
    width: '100%',
    minHeight: 'menu-row-min',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '4',
    padding: '4',
    borderRadius: 'compact'
  }
})

const shortHash = (hash = '') => (hash ? `${hash.substring(0, 6)}…${hash.substring(hash.length - 4)}` : '')

function ActivityIcon({
  record,
  chainId,
  nativeSymbol,
  networks,
  networksMeta,
  tokens
}: {
  record: any
  chainId: number
  nativeSymbol: string
  networks: Record<string | number, any>
  networksMeta: Record<string | number, any>
  tokens: any
}) {
  const effect = activityAssetEffect(record, nativeSymbol)
  if (!effect) {
    return (
      <MediaBadge
        badge={<ChainIcon chainId={chainId} networks={networks} networksMeta={networksMeta} size='medium' />}
      >
        <StatusGlyph state={activityGlyphState(record.status) as any} />
      </MediaBadge>
    )
  }

  const nativeCurrency = networksMeta[chainId]?.nativeCurrency || {}
  const address = effect.assetAddress?.toLowerCase()
  const tokenId = address ? `${chainId}:${address}` : undefined
  const canonicalImage = tokenId ? tokenImageSource(tokenForId(tokens, tokenId)) : ''
  const nativeImage = effect.kind === 'native' ? persistedImageSource(nativeCurrency.image) : ''

  return (
    <ChainTokenIcon
      chainId={chainId}
      logoURI={canonicalImage || effect.logoURI || nativeImage || nativeCurrency.icon}
      networks={networks}
      networksMeta={networksMeta}
      symbol={effect.symbol || nativeSymbol}
      tokenId={tokenId}
    />
  )
}

function ActivityRowContent({
  record,
  networks,
  networksMeta,
  right,
  tokens
}: {
  record: any
  networks: Record<string | number, any>
  networksMeta: Record<string | number, any>
  right: ReactNode
  tokens: any
}) {
  const chainId = Number(record.chainId)
  const chain = networks[chainId] || {}
  const nativeSymbol = networksMeta[chainId]?.nativeCurrency?.symbol || chain.symbol || 'ETH'
  const title = record.display?.title || 'Transaction'
  const subtitle = record.display?.subtitle || chain.name || `Chain ${chainId}`
  const balanceChanges = record.status === 'succeeded' ? activityBalanceChangeLabel(record, nativeSymbol) : ''
  const gasSpent =
    record.status === 'succeeded' || record.status === 'reverted'
      ? activityGasLabel(record, nativeSymbol)
      : ''

  return (
    <>
      <ActivityIcon
        chainId={chainId}
        nativeSymbol={nativeSymbol}
        networks={networks}
        networksMeta={networksMeta}
        record={record}
        tokens={tokens}
      />
      <Stack gap='xsmall' grow>
        <Text truncate variant='label'>
          {title}
        </Text>
        <Text tone='secondary' truncate variant='supporting'>
          {subtitle}
        </Text>
        {balanceChanges ? (
          <Text tone='secondary' truncate variant='caption'>
            {balanceChanges}
          </Text>
        ) : null}
        {gasSpent ? (
          <Text tone='muted' truncate variant='caption'>
            {gasSpent}
          </Text>
        ) : null}
      </Stack>
      {right}
    </>
  )
}

export function ActivityView({
  activity,
  networks,
  networksMeta,
  onOpen,
  onOpenExplorer,
  tokens
}: {
  activity: any[]
  networks: Record<string | number, any>
  networksMeta: Record<string | number, any>
  onOpen: (activityId: string) => void
  onOpenExplorer: (record: any) => void
  tokens: any
}) {
  if (!activity.length)
    return (
      <Text align='center' tone='disabled' variant='overline'>
        No Activity Yet
      </Text>
    )

  return (
    <Group label='Activity list'>
      <Stack gap='xsmall'>
        {activity.map((record) => {
          const status = transactionStatusLabel(record.status)
          const submitted = activityTimestampLabel(record)
          const confirmed = record.status === 'succeeded'
          const canOpenExplorer = confirmed && !!record.hash && !!networks[Number(record.chainId)]?.explorer
          const right = confirmed ? (
            <Stack align='end' gap='xsmall'>
              <Button
                appearance='ghost'
                disabled={!canOpenExplorer}
                label={`Open transaction ${record.hash || ''} in explorer`}
                onPress={() => canOpenExplorer && onOpenExplorer(record)}
                size='compact'
                tone='accent'
              >
                <Text display='inline' tone='accent' variant='code'>
                  {shortHash(record.hash)}
                </Text>
              </Button>
              <Text tone='muted' variant='caption'>
                {submitted}
              </Text>
            </Stack>
          ) : (
            <Stack align='end' gap='xsmall'>
              <Text tone={record.status === 'reverted' ? 'danger' : 'warning'} variant='supporting'>
                {status}
              </Text>
              <Text tone='muted' variant='caption'>
                {submitted}
              </Text>
            </Stack>
          )

          if (confirmed) {
            return (
              <div className={activityRowRecipe()} key={record.id}>
                <ActivityRowContent
                  networks={networks}
                  networksMeta={networksMeta}
                  record={record}
                  right={right}
                  tokens={tokens}
                />
              </div>
            )
          }

          return (
            <Button
              key={record.id}
              appearance='selectionOption'
              label={`${record.display?.title || 'Transaction'} ${status}`}
              onPress={() => onOpen(record.id)}
              width='full'
            >
              <ActivityRowContent
                networks={networks}
                networksMeta={networksMeta}
                record={record}
                right={right}
                tokens={tokens}
              />
            </Button>
          )
        })}
      </Stack>
    </Group>
  )
}
