import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { SearchField } from '@newframe/ui/search-field'
import { Spacer } from '@newframe/ui/spacer'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import TokenOptionRow from '../../../shared/renderer/ui/TokenOptionRow'
import {
  createDisplayBalance,
  formatBalanceNotionalValue,
  type BalanceSummary,
  type DisplayedBalance
} from '../../asset-data/domain/balance'
import { formatUsdRate } from '../../asset-data/domain/balance'
import type { PositionGroups } from './positionModel'
import { cva } from '../../../../generated/styled-system/css/cva.js'
import type { NetworkLike, NetworkMetaLike } from '../../../shared/renderer/ui/tokenSelectorTypes'
import type { TokenImageCapability } from '../../../shared/renderer/capabilities'

type PortfolioNetworks = Record<string | number, NetworkLike>
type PortfolioNetworkMetadata = Record<string | number, NetworkMetaLike>

const searchRecipe = cva({ base: { flexShrink: 0, paddingInline: '5', paddingBlockEnd: '4' } })
const listRecipe = cva({
  base: {
    position: 'relative',
    zIndex: 'content',
    minHeight: 0,
    flex: 1,
    overflowX: 'hidden',
    overflowY: 'auto',
    paddingInline: '4',
    paddingBlockStart: '1',
    paddingBlockEnd: '7'
  }
})

export interface PositionsViewProps {
  dustExpanded: boolean
  dustRowsVisible: number
  groups: PositionGroups
  imageCapability: TokenImageCapability
  networks: PortfolioNetworks
  networksMeta: PortfolioNetworkMetadata
  onChangeQuery: (query: string) => void
  onOpenAsset: (asset: DisplayedBalance) => void
  onShowMoreDust: () => void
  onShowMoreSecondary: () => void
  onToggleDust: () => void
  onToggleSecondary: () => void
  query: string
  secondaryExpanded: boolean
  secondaryRowsVisible: number
}

function PositionRow({
  balance,
  imageCapability,
  networks,
  networksMeta,
  onOpen
}: {
  balance: BalanceSummary
  imageCapability: TokenImageCapability
  networks: PortfolioNetworks
  networksMeta: PortfolioNetworkMetadata
  onOpen: (balance: DisplayedBalance) => void
}) {
  const displayed = createDisplayBalance(balance)
  const change = displayed.priceChange ? parseFloat(displayed.priceChange) : 0
  const item = {
    id: `${displayed.chainId}:${displayed.address}`,
    symbol: displayed.symbol,
    amountLabel: displayed.displayBalance,
    notionalLabel: formatBalanceNotionalValue(displayed),
    chainId: displayed.chainId,
    logoURI: displayed.logoURI,
    rightSubLabel: displayed.priceChange ? `${change >= 0 ? '+' : ''}${displayed.priceChange}%` : undefined
  }

  return (
    <Button
      appearance='selectionOption'
      label={`${displayed.symbol} asset details`}
      onPress={() => onOpen(displayed)}
      width='full'
    >
      <TokenOptionRow
        imageCapability={imageCapability}
        item={item}
        networks={networks}
        networksMeta={networksMeta}
        showRightSubLabel
      />
    </Button>
  )
}

function MoreRows({
  hiddenCount,
  label,
  onClick
}: {
  hiddenCount: number
  label: string
  onClick: () => void
}) {
  if (hiddenCount <= 0) return null

  return (
    <Button appearance='segment' label={label} onPress={onClick} size='small' width='full'>
      <Text display='inline' variant='supporting' tone='secondary'>
        {label}
      </Text>
      <Icon name='chevronDown' size='small' tone='muted' />
    </Button>
  )
}

export function PositionsView({
  dustExpanded,
  dustRowsVisible,
  groups,
  imageCapability,
  networks,
  networksMeta,
  onChangeQuery,
  onOpenAsset,
  onShowMoreDust,
  onShowMoreSecondary,
  onToggleDust,
  onToggleSecondary,
  query,
  secondaryExpanded,
  secondaryRowsVisible
}: PositionsViewProps) {
  const secondaryRows = groups.secondary.slice(0, secondaryRowsVisible)
  const dustRows = groups.dust.slice(0, dustRowsVisible)
  const secondaryHidden = groups.secondary.length - secondaryRows.length
  const dustHidden = groups.dust.length - dustRows.length
  const secondaryLabel = `${groups.secondary.length} ${groups.secondary.length === 1 ? 'asset' : 'assets'} below 1% hidden`
  const dustLabel = `${groups.dust.length} low value ${groups.dust.length === 1 ? 'token' : 'tokens'} hidden`

  return (
    <>
      <div className={searchRecipe()}>
        <SearchField
          label='asset filter'
          onChange={onChangeQuery}
          onClear={() => onChangeQuery('')}
          placeholder='Filter assets'
          value={query}
        />
      </div>
      <main className={listRecipe()}>
        {!groups.important.length && !groups.secondary.length && !groups.dust.length ? (
          <Text align='center' variant='title' tone='disabled'>
            No Tokens Found
          </Text>
        ) : (
          <Stack gap='none'>
            {groups.important.map((balance) => (
              <PositionRow
                key={`${balance.chainId}:${balance.address}`}
                balance={balance}
                imageCapability={imageCapability}
                networks={networks}
                networksMeta={networksMeta}
                onOpen={onOpenAsset}
              />
            ))}
            {groups.secondary.length ? (
              <>
                <Button
                  appearance='subtle'
                  expanded={secondaryExpanded}
                  label={secondaryLabel}
                  onPress={onToggleSecondary}
                  size='small'
                  width='full'
                >
                  <Icon name='chevronDown' size='small' tone='muted' />
                  <Text display='inline' variant='body' tone='secondary' truncate>
                    {secondaryLabel}
                  </Text>
                  <Spacer />
                  <Text
                    display='inline'
                    variant='numeric'
                  >{`$${formatUsdRate(groups.secondaryValue, 2)}`}</Text>
                </Button>
                {secondaryExpanded
                  ? secondaryRows.map((balance) => (
                      <PositionRow
                        key={`${balance.chainId}:${balance.address}`}
                        balance={balance}
                        imageCapability={imageCapability}
                        networks={networks}
                        networksMeta={networksMeta}
                        onOpen={onOpenAsset}
                      />
                    ))
                  : null}
                {secondaryExpanded ? (
                  <MoreRows
                    hiddenCount={secondaryHidden}
                    label={`Show ${Math.min(50, secondaryHidden)} more assets`}
                    onClick={onShowMoreSecondary}
                  />
                ) : null}
              </>
            ) : null}
            {groups.dust.length ? (
              <>
                <Button
                  appearance='subtle'
                  expanded={dustExpanded}
                  label={dustLabel}
                  onPress={onToggleDust}
                  size='small'
                  width='full'
                >
                  <Icon name='chevronDown' size='small' tone='muted' />
                  <Text display='inline' variant='body' tone='secondary' truncate>
                    {dustLabel}
                  </Text>
                  <Spacer />
                  <Text display='inline' variant='numeric'>
                    {'<$0.01'}
                  </Text>
                </Button>
                {dustExpanded
                  ? dustRows.map((balance) => (
                      <PositionRow
                        key={`${balance.chainId}:${balance.address}`}
                        balance={balance}
                        imageCapability={imageCapability}
                        networks={networks}
                        networksMeta={networksMeta}
                        onOpen={onOpenAsset}
                      />
                    ))
                  : null}
                {dustExpanded ? (
                  <MoreRows
                    hiddenCount={dustHidden}
                    label={`Show ${Math.min(50, dustHidden)} more low value tokens`}
                    onClick={onShowMoreDust}
                  />
                ) : null}
              </>
            ) : null}
          </Stack>
        )}
      </main>
    </>
  )
}
