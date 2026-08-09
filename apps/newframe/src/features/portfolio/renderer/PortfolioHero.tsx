import { useEffect, useState } from 'react'

import link from '../../../platform/ipc/renderer/link'
import { formatUsdRate } from '../../asset-data/domain/balance'
import { useAccountBalances } from './useAccountBalances'
import { useHomeUiStore } from '../../../app/renderer/tray/Home/state/HomeUiProvider'
import { PortfolioHeroView } from './PortfolioHeroView'
import { usePortfolioActions } from './usePortfolioActions'
import { selectOperationById } from '../../../platform/state-sync/renderer/selectors/operation'
import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'

import type { BalanceSummary } from '../../asset-data/domain/balance'

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
  const [refreshOperationId, setRefreshOperationId] = useState('')
  const [refreshBoundaryFailureId, setRefreshBoundaryFailureId] = useState('')
  const [minimumRefreshElapsed, setMinimumRefreshElapsed] = useState(true)
  const refreshOperation = useWalletSelector((state) =>
    refreshOperationId ? selectOperationById(state, refreshOperationId) : undefined
  )
  const refreshTerminal =
    refreshOperation?.status === 'succeeded' ||
    refreshOperation?.status === 'failed' ||
    refreshBoundaryFailureId === refreshOperationId
  const refreshing = Boolean(refreshOperationId && (!refreshTerminal || !minimumRefreshElapsed))
  const visibleBalances = balances.filter(
    (balance) => selectedChainId === 0 || balance.chainId === selectedChainId
  )

  useEffect(() => {
    if (!refreshOperationId) return

    const timeout = setTimeout(() => setMinimumRefreshElapsed(true), 1000)
    return () => clearTimeout(timeout)
  }, [refreshOperationId])

  return (
    <PortfolioHeroView
      canSend={actions.canSend()}
      canTrade={actions.canTrade()}
      displayValue={formatPortfolioValue(visibleBalances)}
      onRefresh={() => {
        if (refreshing) return
        const operationId = crypto.randomUUID()
        setRefreshBoundaryFailureId('')
        setMinimumRefreshElapsed(false)
        setRefreshOperationId(operationId)
        void link
          .executeCommand({ type: 'portfolio.refresh', operationId })
          .then((result) => {
            if (!result.ok) setRefreshBoundaryFailureId(operationId)
          })
          .catch(() => setRefreshBoundaryFailureId(operationId))
      }}
      onSend={() => actions.openSend()}
      onTrade={() => actions.openTrade()}
      refreshing={refreshing}
    />
  )
}
