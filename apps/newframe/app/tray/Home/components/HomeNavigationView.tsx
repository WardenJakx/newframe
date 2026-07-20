import type { ReactNode } from 'react'

import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Tabs } from '@newframe/ui/tabs'
import { Text } from '@newframe/ui/text'
import { cva } from '../../../../resources/styled-system/css/cva.js'
import type { HomeSection } from '../state/homeUiTypes'

const navigationRecipe = cva({
  base: {
    position: 'relative',
    zIndex: 'content',
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingInline: '6',
    paddingBlockEnd: '4'
  }
})

const chainIconRecipe = cva({
  base: {
    display: 'grid',
    placeItems: 'center',
    '& img': { borderRadius: '50%', objectFit: 'cover' }
  }
})

const networkDotsRecipe = cva({
  base: { display: 'grid', gridTemplateColumns: 'repeat(2, 5px)', gap: '1' }
})

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
    <nav className={navigationRecipe()}>
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
          <span className={chainIconRecipe()}>{selectedChain.icon}</span>
        ) : (
          <span className={networkDotsRecipe()}>{enabledChainDots}</span>
        )}
        <Text display='inline' variant='supporting'>
          {selectedChain?.name || 'All Networks'}
        </Text>
        <Icon name='chevronDown' size='small' tone='muted' />
      </Button>
    </nav>
  )
}
