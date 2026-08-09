import { useMemo, useState } from 'react'

import type { DisplayedBalance } from '../../asset-data/domain/balance'
import { useAccountBalances } from './useAccountBalances'
import { createPositionGroups } from './positionModel'
import { PositionsView } from './PositionsView'
import type { PortfolioCapability } from './portfolioCapability'

const ROW_INCREMENT = 50

export function Positions({
  capability,
  onOpenAsset,
  selectedChainId
}: {
  capability: Pick<PortfolioCapability, 'hydrateTokenImage'>
  onOpenAsset: (asset: DisplayedBalance) => void
  selectedChainId: number
}) {
  const shared = useAccountBalances()
  const [query, setQuery] = useState('')
  const [secondaryExpanded, setSecondaryExpanded] = useState(false)
  const [dustExpanded, setDustExpanded] = useState(false)
  const [secondaryRowsVisible, setSecondaryRowsVisible] = useState(ROW_INCREMENT)
  const [dustRowsVisible, setDustRowsVisible] = useState(ROW_INCREMENT)

  const groups = useMemo(
    () =>
      createPositionGroups({
        balances: shared.balances,
        networks: shared.networks,
        query,
        selectedChainId
      }),
    [query, selectedChainId, shared.balances, shared.networks]
  )

  return (
    <PositionsView
      dustExpanded={dustExpanded}
      dustRowsVisible={dustRowsVisible}
      groups={groups}
      imageCapability={capability}
      networks={shared.networks}
      networksMeta={shared.networksMeta}
      onChangeQuery={setQuery}
      onOpenAsset={onOpenAsset}
      onShowMoreDust={() => setDustRowsVisible((rows) => rows + ROW_INCREMENT)}
      onShowMoreSecondary={() => setSecondaryRowsVisible((rows) => rows + ROW_INCREMENT)}
      onToggleDust={() => setDustExpanded((expanded) => !expanded)}
      onToggleSecondary={() => setSecondaryExpanded((expanded) => !expanded)}
      query={query}
      secondaryExpanded={secondaryExpanded}
      secondaryRowsVisible={secondaryRowsVisible}
    />
  )
}
