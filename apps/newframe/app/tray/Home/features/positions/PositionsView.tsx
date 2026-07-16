import React from 'react'

import svg from '../../../../../resources/svg'
import TokenOptionRow from '../../../../../resources/Components/TokenOptionRow'
import {
  createDisplayBalance,
  formatBalanceNotionalValue,
  type BalanceSummary,
  type DisplayedBalance
} from '../../../../../resources/domain/balance'
import { formatUsdRate } from '../../../../../resources/domain/balance'
import { activateOnKeyboard } from '../../ui/keyboard'
import type { PositionGroups } from './positionModel'

export interface PositionsViewProps {
  dustExpanded: boolean
  dustRowsVisible: number
  groups: PositionGroups
  networks: Record<string | number, any>
  networksMeta: Record<string | number, any>
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
  className = 't2TokenRow cardShow',
  networks,
  networksMeta,
  onOpen
}: {
  balance: BalanceSummary
  className?: string
  networks: Record<string | number, any>
  networksMeta: Record<string | number, any>
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
    <div
      aria-label={`${displayed.symbol} asset details`}
      className={className}
      onClick={() => onOpen(displayed)}
      onKeyDown={(event) => activateOnKeyboard(event, () => onOpen(displayed))}
      role='button'
      tabIndex={0}
    >
      <TokenOptionRow item={item} networks={networks} networksMeta={networksMeta} showRightSubLabel />
    </div>
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
    <div
      aria-label={label}
      className='t2PositionListMore'
      onClick={onClick}
      onKeyDown={(event) => activateOnKeyboard(event, onClick)}
      role='button'
      tabIndex={0}
    >
      <span className='traySpan'>{label}</span>
      {svg.chevron(12)}
    </div>
  )
}

export function PositionsView({
  dustExpanded,
  dustRowsVisible,
  groups,
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
      <div className='t2SearchWrap'>
        <div className='t2Search'>
          <div className='t2SearchIcon'>{svg.search(12)}</div>
          <input
            aria-label='Filter assets'
            onChange={(event) => onChangeQuery(event.target.value)}
            placeholder='Filter assets'
            spellCheck={false}
            type='text'
            value={query}
          />
          {query ? (
            <div
              aria-label='Clear asset filter'
              className='t2SearchClear'
              onClick={() => onChangeQuery('')}
              onKeyDown={(event) => activateOnKeyboard(event, () => onChangeQuery(''))}
              role='button'
              tabIndex={0}
            >
              {svg.x(10)}
            </div>
          ) : null}
        </div>
      </div>
      <div className='t2Main'>
        {!groups.important.length && !groups.secondary.length && !groups.dust.length ? (
          <div className='t2EmptyState'>No Tokens Found</div>
        ) : (
          <div className='t2List'>
            {groups.important.map((balance) => (
              <PositionRow
                key={`${balance.chainId}:${balance.address}`}
                balance={balance}
                networks={networks}
                networksMeta={networksMeta}
                onOpen={onOpenAsset}
              />
            ))}
            {groups.secondary.length ? (
              <>
                <div
                  aria-expanded={secondaryExpanded}
                  aria-label={secondaryLabel}
                  className='t2LowValueHidden'
                  onClick={onToggleSecondary}
                  onKeyDown={(event) => activateOnKeyboard(event, onToggleSecondary)}
                  role='button'
                  tabIndex={0}
                >
                  <div
                    className={
                      secondaryExpanded
                        ? 't2LowValueHiddenChevron t2LowValueHiddenChevronOpen'
                        : 't2LowValueHiddenChevron'
                    }
                  >
                    {svg.chevronLeft(10)}
                  </div>
                  <div className='t2LowValueHiddenLabel'>{secondaryLabel}</div>
                  <div className='t2LowValueHiddenValue'>{`$${formatUsdRate(groups.secondaryValue, 2)}`}</div>
                </div>
                {secondaryExpanded
                  ? secondaryRows.map((balance) => (
                      <PositionRow
                        key={`${balance.chainId}:${balance.address}`}
                        balance={balance}
                        className='t2TokenRow t2SecondaryTokenRow cardShow'
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
                <div
                  aria-expanded={dustExpanded}
                  aria-label={dustLabel}
                  className='t2LowValueHidden'
                  onClick={onToggleDust}
                  onKeyDown={(event) => activateOnKeyboard(event, onToggleDust)}
                  role='button'
                  tabIndex={0}
                >
                  <div
                    className={
                      dustExpanded
                        ? 't2LowValueHiddenChevron t2LowValueHiddenChevronOpen'
                        : 't2LowValueHiddenChevron'
                    }
                  >
                    {svg.chevronLeft(10)}
                  </div>
                  <div className='t2LowValueHiddenLabel'>{dustLabel}</div>
                  <div className='t2LowValueHiddenValue'>{'<$0.01'}</div>
                </div>
                {dustExpanded
                  ? dustRows.map((balance) => (
                      <PositionRow
                        key={`${balance.chainId}:${balance.address}`}
                        balance={balance}
                        className='t2TokenRow t2DustTokenRow cardShow'
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
          </div>
        )}
      </div>
    </>
  )
}
