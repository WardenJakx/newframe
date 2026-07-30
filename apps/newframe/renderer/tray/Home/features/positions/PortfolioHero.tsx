import { useEffect, useRef, useState } from 'react'

import link from '../../../../shared/link'
import { formatUsdRate } from '../../../../../domain/balance'
import { useAccountBalances } from '../../hooks/useAccountBalances'
import { useHomeUiStore } from '../../state/HomeUiProvider'
import { PortfolioHeroView } from './PortfolioHeroView'
import { usePortfolioActions } from './usePortfolioActions'

import type { BalanceSummary } from '../../../../../domain/balance'

export function formatPortfolioValue(balances: Pick<BalanceSummary, 'hasPrice' | 'totalValue'>[]) {
  if (balances.length > 0 && !balances.some((balance) => balance.hasPrice)) return '—'

  return formatUsdRate(
    balances.reduce((sum, balance) => sum + balance.totalValue, 0),
    2
  )
}

export function PortfolioHero() {
  const { balances } = useAccountBalances()
  const selectedChainId = useHomeUiStore((state) => state.selectedChainId)
  const actions = usePortfolioActions(balances)
  const [refreshing, setRefreshing] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const visibleBalances = balances.filter(
    (balance) => selectedChainId === 0 || balance.chainId === selectedChainId
  )

  return (
    <PortfolioHeroView
      canSend={actions.canSend()}
      canTrade={actions.canTrade()}
      displayValue={formatPortfolioValue(visibleBalances)}
      onRefresh={() => {
        if (refreshing) return
        setRefreshing(true)
        void link.executeCommand({ type: 'portfolio.refresh' }).finally(() => {
          timer.current = setTimeout(() => setRefreshing(false), 1000)
        })
      }}
      onSend={() => actions.openSend()}
      onTrade={() => actions.openTrade()}
      refreshing={refreshing}
    />
  )
}
