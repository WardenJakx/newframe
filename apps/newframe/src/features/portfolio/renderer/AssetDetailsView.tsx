import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { cva } from '../../../../generated/styled-system/css/cva.js'
import type { ClipboardCapability, TokenImageCapability } from '../../../shared/renderer/capabilities.ts'
import { AddressIdentity } from '../../../shared/renderer/ui/AddressIdentity.tsx'
import { ChainIcon } from '../../../shared/renderer/ui/ChainIcon.tsx'
import ChainTokenIcon from '../../../shared/renderer/ui/ChainTokenIcon.tsx'
import { DetailRow } from '../../../shared/renderer/ui/DetailRow.tsx'
import type { ChainLike, ChainMetaLike } from '../../../shared/renderer/ui/tokenSelectorTypes.ts'
import { TrayOverlay } from '../../../shared/renderer/ui/TrayOverlay.tsx'
import {
  formatUsdRate,
  isNativeCurrency,
  type DisplayedBalance
} from '../../asset-data/domain/balance/index.ts'
import { TRADE_DISABLED_CHAIN_LABEL } from './usePortfolioActions.ts'

const contentRecipe = cva({ base: { paddingBlockStart: '4' } })

export function AssetDetailsView({
  asset,
  accountType,
  canSend,
  canTrade,
  clipboard,
  imageCapability,
  chains,
  chainsMeta,
  onBack,
  onSend,
  onTrade
}: {
  asset: DisplayedBalance
  accountType?: string
  canSend: boolean
  canTrade: boolean
  clipboard: ClipboardCapability
  imageCapability: TokenImageCapability
  chains: Partial<Record<string | number, ChainLike>>
  chainsMeta: Partial<Record<string | number, ChainMetaLike>>
  onBack: () => void
  onSend: () => void
  onTrade: () => void
}) {
  const chain = chains[asset.chainId] ?? {}
  const price = Number(asset.rate?.usdRate ?? 0)
  const nativeAsset = isNativeCurrency(asset.address)
  const footer = (
    <Stack direction='row' gap='small'>
      <Button
        appearance='primary'
        disabled={!canSend}
        label={`Send ${asset.symbol}`}
        onPress={onSend}
        shape='pill'
        size='large'
        width='wide'
      >
        <Icon name='send' size='small' />
        <Text tone='inverse' variant='action'>
          Send
        </Text>
      </Button>
      <Button
        appearance='primary'
        disabled={!canTrade}
        label={`Trade ${asset.symbol}`}
        onPress={onTrade}
        shape='pill'
        size='large'
        title={canTrade ? `Trade ${asset.symbol}` : TRADE_DISABLED_CHAIN_LABEL}
        width='wide'
      >
        <Icon name='sync' size='small' />
        <Text tone='inverse' variant='action'>
          Trade
        </Text>
      </Button>
    </Stack>
  )
  let priceLabel = '—'
  if (asset.hasPrice) {
    priceLabel = price > 0 ? `$${formatUsdRate(price, 2)}` : '$0.00'
  }

  return (
    <TrayOverlay
      closeLabel='Back to positions'
      footer={footer}
      footerAppearance='plain'
      label='Asset details'
      onClose={onBack}
      title={asset.symbol}
    >
      <div className={contentRecipe()}>
        <Stack gap='small'>
          <Stack align='center' direction='row' gap='small'>
            <ChainTokenIcon
              chainId={asset.chainId}
              imageCapability={imageCapability}
              logoURI={asset.logoURI}
              chains={chains}
              chainsMeta={chainsMeta}
              size='md'
              symbol={asset.symbol}
              tokenId={`${asset.chainId}:${asset.address}`}
            />
            <Stack gap='xsmall' grow>
              <Text truncate variant='heading'>
                {asset.name || asset.symbol}
              </Text>
              <Stack direction='row' gap='xsmall'>
                <Text tone='secondary' variant='supporting'>
                  {asset.symbol}
                </Text>
                <Text tone='secondary' truncate variant='supporting'>
                  {chain.name ?? `Chain ${asset.chainId}`}
                </Text>
              </Stack>
            </Stack>
          </Stack>
          <Stack gap='none'>
            <DetailRow label='Price' value={priceLabel} />
            <DetailRow label='Balance' value={`${asset.displayBalance} ${asset.symbol}`} />
            <DetailRow
              label='Chain'
              value={
                <Stack align='center' direction='row' gap='xsmall' justify='end'>
                  <ChainIcon chainId={asset.chainId} chains={chains} chainsMeta={chainsMeta} size='large' />
                  <Text truncate variant='label'>
                    {chain.name ?? `Chain ${asset.chainId}`}
                  </Text>
                </Stack>
              }
            />
            {nativeAsset ? (
              <DetailRow label='Contract Address' value='Native asset' />
            ) : (
              <DetailRow
                code
                label='Contract Address'
                value={
                  <AddressIdentity address={asset.address} accountType={accountType} clipboard={clipboard} />
                }
              />
            )}
          </Stack>
        </Stack>
      </div>
    </TrayOverlay>
  )
}
