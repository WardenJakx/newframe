import React, { useMemo, useState } from 'react'

import { useAccountBalances } from '../../hooks/useAccountBalances'
import { useHomeUiStore } from '../../state/HomeUiProvider'
import { createPositionGroups } from './positionModel'
import { PositionsView } from './PositionsView'

const ROW_INCREMENT = 50

export function Positions() {
  const shared = useAccountBalances()
  const selectedChainId = useHomeUiStore((state) => state.selectedChainId)
  const openOverlay = useHomeUiStore((state) => state.openOverlay)
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
      networks={shared.networks}
      networksMeta={shared.networksMeta}
      onChangeQuery={setQuery}
      onOpenAsset={(asset) => openOverlay({ type: 'asset', asset })}
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
