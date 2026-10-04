import type { BalanceSummary } from '../../../features/asset-data/domain/balance/index.ts'
import { isBuiltInChain } from '../../../features/chains/domain/chain/index.ts'
import { matchFilter } from '../../../shared/domain/text.ts'
interface ChainListItem {
  isTestnet?: boolean
  name: string
  on: boolean
}

export function createChainRows({
  balances,
  chains,
  query,
  showTestnets
}: {
  balances: BalanceSummary[]
  chains: Record<string | number, ChainListItem>
  query: string
  showTestnets: boolean
}) {
  const totalByChain = new Map<number, number>()
  balances.forEach((balance) => {
    totalByChain.set(balance.chainId, (totalByChain.get(balance.chainId) ?? 0) + balance.totalValue)
  })

  return Object.keys(chains)
    .map((id) => ({ chainId: Number(id), ...chains[id] }))
    .filter((chain) => (!chain.isTestnet || showTestnets) && matchFilter(query.trim(), [chain.name]))
    .map((chain) => ({
      ...chain,
      removable: !isBuiltInChain(chain.chainId),
      totalValue: totalByChain.get(chain.chainId) ?? 0
    }))
    .sort((a, b) => {
      if (a.on !== b.on) {
        return a.on ? -1 : 1
      }
      return b.totalValue - a.totalValue
    })
}
