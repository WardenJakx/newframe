import React, { useEffect, useRef, useState } from 'react'

import link from '../../../../../resources/link'
import { formatUsdRate } from '../../../../../resources/domain/balance'
import { useAccountBalances } from '../../hooks/useAccountBalances'
import { useHomeUiStore } from '../../state/HomeUiProvider'
import { PortfolioHeroView } from './PortfolioHeroView'
import { usePortfolioActions } from './usePortfolioActions'

export function PortfolioHero() {
  const { balances } = useAccountBalances()
  const selectedChainId = useHomeUiStore((state) => state.selectedChainId)
  const actions = usePortfolioActions(balances)
  const [refreshing, setRefreshing] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const total = balances
    .filter((balance) => selectedChainId === 0 || balance.chainId === selectedChainId)
    .reduce((sum, balance) => sum + balance.totalValue, 0)

  return (
    <PortfolioHeroView
      canSend={actions.canSend()}
      canTrade={actions.canTrade()}
      displayValue={formatUsdRate(total, 2)}
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
