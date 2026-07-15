import { isLowValueTokenBalance, type BalanceSummary } from '../../../../../resources/domain/balance'
import { matchFilter } from '../../../../../resources/utils'

export const PORTFOLIO_IMPORTANCE_THRESHOLD = 0.01

export interface PositionGroups {
  dust: BalanceSummary[]
  important: BalanceSummary[]
  secondary: BalanceSummary[]
  secondaryValue: number
}

export function createPositionGroups({
  balances,
  networks,
  query,
  selectedChainId
}: {
  balances: BalanceSummary[]
  networks: Record<string | number, any>
  query: string
  selectedChainId: number
}): PositionGroups {
  const matched = balances.filter((balance) => {
    if (selectedChainId !== 0 && balance.chainId !== selectedChainId) return false
    const chainName = networks[balance.chainId]?.name || ''
    return matchFilter(query, [chainName, balance.name, balance.symbol])
  })
  const matchedTotal = matched.reduce((sum, balance) => sum + balance.totalValue, 0)
  const importanceCutoff = matchedTotal * PORTFOLIO_IMPORTANCE_THRESHOLD
  const visible = matched.filter((balance) => !isLowValueTokenBalance(balance))
  const important = matchedTotal
    ? visible.filter((balance) => balance.totalValue > importanceCutoff)
    : visible
  const secondary = matchedTotal ? visible.filter((balance) => balance.totalValue <= importanceCutoff) : []
  const dust = matched.filter(isLowValueTokenBalance)

  return {
    dust,
    important,
    secondary,
    secondaryValue: secondary.reduce((sum, balance) => sum + balance.totalValue, 0)
  }
}
