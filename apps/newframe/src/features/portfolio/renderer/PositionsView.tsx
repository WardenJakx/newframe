import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { SearchField } from '@newframe/ui/search-field'
import { Spacer } from '@newframe/ui/spacer'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
import { Fragment } from 'react'

import { cva } from '../../../../generated/styled-system/css/cva.js'
import type { TokenImageCapability } from '../../../shared/renderer/capabilities.ts'
import TokenOptionRow from '../../../shared/renderer/ui/TokenOptionRow.tsx'
import type { ChainLike, ChainMetaLike } from '../../../shared/renderer/ui/tokenSelectorTypes.ts'
import {
  createDisplayBalance,
  formatBalanceNotionalValue,
  type BalanceSummary,
  type DisplayedBalance
} from '../../asset-data/domain/balance/index.ts'
import { formatUsdRate } from '../../asset-data/domain/balance/index.ts'
import type { PositionGroups } from './positionModel.ts'

type PortfolioChains = Record<string | number, ChainLike>
type PortfolioChainMetadata = Record<string | number, ChainMetaLike>

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
  chains: PortfolioChains
  chainsMeta: PortfolioChainMetadata
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
  chains,
  chainsMeta,
  onOpen
}: {
  balance: BalanceSummary
  imageCapability: TokenImageCapability
  chains: PortfolioChains
  chainsMeta: PortfolioChainMetadata
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
        chains={chains}
        chainsMeta={chainsMeta}
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
  if (hiddenCount <= 0) {
    return null
  }

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
  chains,
  chainsMeta,
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
  const renderRows = (balances: BalanceSummary[]) =>
    balances.map((balance) => (
      <PositionRow
        key={`${balance.chainId}:${balance.address}`}
        balance={balance}
        imageCapability={imageCapability}
        chains={chains}
        chainsMeta={chainsMeta}
        onOpen={onOpenAsset}
      />
    ))
  const collapsibleGroups = [
    {
      id: 'secondary',
      count: groups.secondary.length,
      label: secondaryLabel,
      value: `$${formatUsdRate(groups.secondaryValue, 2)}`,
      expanded: secondaryExpanded,
      rows: secondaryRows,
      hiddenCount: secondaryHidden,
      moreLabel: `Show ${Math.min(50, secondaryHidden)} more assets`,
      onToggle: onToggleSecondary,
      onShowMore: onShowMoreSecondary
    },
    {
      id: 'dust',
      count: groups.dust.length,
      label: dustLabel,
      value: '<$0.01',
      expanded: dustExpanded,
      rows: dustRows,
      hiddenCount: dustHidden,
      moreLabel: `Show ${Math.min(50, dustHidden)} more low value tokens`,
      onToggle: onToggleDust,
      onShowMore: onShowMoreDust
    }
  ]

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
            {renderRows(groups.important)}
            {collapsibleGroups.map((group) =>
              group.count ? (
                <Fragment key={group.id}>
                  <Button
                    appearance='subtle'
                    expanded={group.expanded}
                    label={group.label}
                    onPress={group.onToggle}
                    size='small'
                    width='full'
                  >
                    <Icon name='chevronDown' size='small' tone='muted' />
                    <Text display='inline' variant='body' tone='secondary' truncate>
                      {group.label}
                    </Text>
                    <Spacer />
                    <Text display='inline' variant='numeric'>
                      {group.value}
                    </Text>
                  </Button>
                  {group.expanded ? renderRows(group.rows) : null}
                  {group.expanded ? (
                    <MoreRows
                      hiddenCount={group.hiddenCount}
                      label={group.moreLabel}
                      onClick={group.onShowMore}
                    />
                  ) : null}
                </Fragment>
              ) : null
            )}
          </Stack>
        )}
      </main>
    </>
  )
}
