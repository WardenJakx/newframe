import { matchFilter } from '../../../../../resources/utils'
import type { BalanceSummary } from '../../../../../resources/domain/balance'

export function createNetworkRows({
  balances,
  networks,
  query,
  showTestnets
}: {
  balances: BalanceSummary[]
  networks: Record<string | number, any>
  query: string
  showTestnets: boolean
}) {
  const totalByChain = new Map<number, number>()
  balances.forEach((balance) => {
    totalByChain.set(balance.chainId, (totalByChain.get(balance.chainId) || 0) + balance.totalValue)
  })

  return Object.keys(networks)
    .map((id) => ({ chainId: Number(id), ...networks[id] }))
    .filter((chain) => (!chain.isTestnet || showTestnets) && matchFilter(query.trim(), [chain.name]))
    .map((chain) => ({ ...chain, totalValue: totalByChain.get(chain.chainId) || 0 }))
    .sort((a, b) => {
      if (a.on !== b.on) return a.on ? -1 : 1
      return b.totalValue - a.totalValue
    })
}
