import type { ReactNode } from 'react'

import { Button } from '@newframe/ui/button'
import { Group } from '@newframe/ui/group'
import { Inline } from '@newframe/ui/inline'
import { MediaBadge } from '@newframe/ui/media-badge'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { cva } from '../../../../../generated/styled-system/css/cva.js'
import { persistedImageSource } from '../../../asset-data/domain/image'
import { tokenForId, tokenImageSource } from '../../../tokens/domain'
import StatusGlyph from '../../../../shared/renderer/ui/StatusGlyph'
import ChainTokenIcon from '../../../../shared/renderer/ui/ChainTokenIcon'
import { CopyButton } from '../../../../shared/renderer/ui/CopyButton'
import { ChainIcon } from '../../../../shared/renderer/ui/ChainIcon'
import {
  activityAssetEffect,
  activityBalanceChangeLabel,
  activityGasLabel,
  activityGlyphState,
  activityTimestampLabel,
  transactionStatusLabel
} from './activityModel'
import type {
  ActivityNetworkMap,
  ActivityNetworkMetadataMap,
  ActivityRecord,
  ActivityViewRecord,
  ActivityTokenCatalog
} from './activityTypes'
import type { ClipboardCapability, TokenImageCapability } from '../../../../shared/renderer/capabilities'

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

const transactionLinkRecipe = cva({
  base: { textDecoration: 'underline' }
})

const shortHash = (hash: string | null | undefined = '') =>
  hash ? `${hash.substring(0, 6)}…${hash.substring(hash.length - 4)}` : ''

function ActivityIcon({
  imageCapability,
  record,
  chainId,
  nativeSymbol,
  networks,
  networksMeta,
  tokens
}: {
  imageCapability: TokenImageCapability
  record: ActivityRecord
  chainId: number
  nativeSymbol: string
  networks: ActivityNetworkMap
  networksMeta: ActivityNetworkMetadataMap
  tokens: ActivityTokenCatalog
}) {
  const effect = activityAssetEffect(record, nativeSymbol)
  if (!effect) {
    return (
      <MediaBadge
        badge={<ChainIcon chainId={chainId} networks={networks} networksMeta={networksMeta} size='medium' />}
      >
        <StatusGlyph state={activityGlyphState(record.status)} />
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
      imageCapability={imageCapability}
      logoURI={canonicalImage || effect.logoURI || nativeImage || nativeCurrency.icon}
      networks={networks}
      networksMeta={networksMeta}
      symbol={effect.symbol || nativeSymbol}
      tokenId={tokenId}
    />
  )
}

function ActivityRowContent({
  imageCapability,
  record,
  networks,
  networksMeta,
  right,
  tokens
}: {
  imageCapability: TokenImageCapability
  record: ActivityRecord
  networks: ActivityNetworkMap
  networksMeta: ActivityNetworkMetadataMap
  right: ReactNode
  tokens: ActivityTokenCatalog
}) {
  const chainId = Number(record.chainId)
  const chain = networks[chainId] || {}
  const nativeSymbol = networksMeta[chainId]?.nativeCurrency?.symbol || chain.symbol || 'ETH'
  const title = record.display?.title || 'Transaction'
  const subtitle = record.display?.subtitle || chain.name || `Chain ${chainId}`
  const balanceChanges =
    record.status === 'succeeded'
      ? activityBalanceChangeLabel(record, nativeSymbol, (address) =>
          tokenForId(tokens, `${chainId}:${address.toLowerCase()}`)
        )
      : ''
  const gasSpent =
    record.status === 'succeeded' || record.status === 'reverted'
      ? activityGasLabel(record, nativeSymbol)
      : ''

  return (
    <>
      <ActivityIcon
        chainId={chainId}
        imageCapability={imageCapability}
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

export function ActivityView<TRecord extends ActivityViewRecord>({
  activity,
  clipboard,
  imageCapability,
  networks,
  networksMeta,
  onOpen,
  onOpenExplorer,
  tokens
}: {
  activity: TRecord[]
  clipboard: ClipboardCapability
  imageCapability: TokenImageCapability
  networks: ActivityNetworkMap
  networksMeta: ActivityNetworkMetadataMap
  onOpen: (activityId: string) => void
  onOpenExplorer: (record: TRecord) => void
  tokens: ActivityTokenCatalog
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
              <Inline align='center' gap='none'>
                {canOpenExplorer ? (
                  <Button
                    appearance='ghost'
                    label={`Open transaction ${record.hash || ''} in explorer`}
                    onPress={() => onOpenExplorer(record)}
                    size='compact'
                  >
                    <span className={transactionLinkRecipe()} data-transaction-link=''>
                      <Text display='inline' tone='secondary' variant='code'>
                        {shortHash(record.hash)}
                      </Text>
                    </span>
                  </Button>
                ) : (
                  <Text display='inline' tone='secondary' variant='code'>
                    {shortHash(record.hash)}
                  </Text>
                )}
                {record.hash ? (
                  <CopyButton
                    clipboard={clipboard}
                    copiedLabel={`Transaction hash copied ${record.hash}`}
                    copiedTitle='Transaction hash copied'
                    label={`Copy transaction hash ${record.hash}`}
                    title='Copy transaction hash'
                    value={record.hash}
                  />
                ) : null}
              </Inline>
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
                  imageCapability={imageCapability}
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
                imageCapability={imageCapability}
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
