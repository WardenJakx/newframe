import React from 'react'

import svg from '../../../../resources/svg'
import { activateOnKeyboard } from '../ui/keyboard'
import type { HomeSection } from '../state/homeUiTypes'

export function HomeNavigationView({
  enabledChainDots,
  onOpenNetworks,
  onSelectSection,
  section,
  selectedChain
}: {
  enabledChainDots: React.ReactNode
  onOpenNetworks: () => void
  onSelectSection: (section: HomeSection) => void
  section: HomeSection
  selectedChain?: { icon: React.ReactNode; name: string }
}) {
  return (
    <div className='t2TabRow'>
      <div aria-label='Home sections' className='t2Tabs' role='tablist'>
        {(['positions', 'activity', 'orders'] as HomeSection[]).map((value) => {
          const label = value[0].toUpperCase() + value.slice(1)
          const selected = section === value
          return (
            <div
              key={value}
              aria-selected={selected}
              className='t2Tab'
              onClick={() => onSelectSection(value)}
              onKeyDown={(event) => activateOnKeyboard(event, () => onSelectSection(value))}
              role='tab'
              tabIndex={selected ? 0 : -1}
            >
              <div className={selected ? 't2TabLabel t2TabLabelActive' : 't2TabLabel'}>{label}</div>
              <div className={selected ? 't2TabBar t2TabBarActive' : 't2TabBar'} />
            </div>
          )
        })}
      </div>
      <div
        aria-label='Network filter'
        aria-haspopup='dialog'
        className='t2NetworkPill'
        onClick={onOpenNetworks}
        onKeyDown={(event) => activateOnKeyboard(event, onOpenNetworks)}
        role='button'
        tabIndex={0}
      >
        {selectedChain ? (
          <div className='t2PillChainIcon'>{selectedChain.icon}</div>
        ) : (
          <div className='t2NetworkDots'>{enabledChainDots}</div>
        )}
        <span>{selectedChain?.name || 'All Networks'}</span>
        <div className='t2NetworkPillChevron'>{svg.chevron(13)}</div>
      </div>
    </div>
  )
}
