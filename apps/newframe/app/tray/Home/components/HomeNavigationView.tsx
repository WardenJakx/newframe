import type { ReactNode } from 'react'

import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Tabs } from '@newframe/ui/tabs'
import { Text } from '@newframe/ui/text'
import type { HomeSection } from '../state/homeUiTypes'

export function HomeNavigationView({
  enabledChainDots,
  onOpenNetworks,
  onSelectSection,
  section,
  selectedChain
}: {
  enabledChainDots: ReactNode
  onOpenNetworks: () => void
  onSelectSection: (section: HomeSection) => void
  section: HomeSection
  selectedChain?: { icon: ReactNode; name: string }
}) {
  return (
    <div className='t2TabRow'>
      <Tabs
        appearance='underline'
        items={(['positions', 'activity', 'orders'] as HomeSection[]).map((value) => ({
          active: section === value,
          id: value,
          label: value[0].toUpperCase() + value.slice(1)
        }))}
        label='Home sections'
        onSelect={onSelectSection}
      />
      <Button
        appearance='control'
        hasPopup='dialog'
        label='Network filter'
        onPress={onOpenNetworks}
        shape='pill'
        size='small'
      >
        {selectedChain ? (
          <div className='t2PillChainIcon'>{selectedChain.icon}</div>
        ) : (
          <div className='t2NetworkDots'>{enabledChainDots}</div>
        )}
        <Text display='inline' variant='supporting'>
          {selectedChain?.name || 'All Networks'}
        </Text>
        <Icon name='chevronDown' size='small' tone='muted' />
      </Button>
    </div>
  )
}
