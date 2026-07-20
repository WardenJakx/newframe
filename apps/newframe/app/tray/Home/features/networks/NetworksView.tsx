import React from 'react'

import { Button } from '@newframe/ui/button'
import { IconButton } from '@newframe/ui/icon-button'
import { Input } from '@newframe/ui/input'
import { SearchField } from '@newframe/ui/search-field'
import { Spacer } from '@newframe/ui/spacer'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { formatUsdRate } from '../../../../../resources/domain/balance'
import { TrayOverlay } from '../../../../../resources/Components/TrayOverlay'
import { cva } from '../../../../../resources/styled-system/css/cva.js'

const networkRecipe = cva({
  base: { overflow: 'hidden', borderRadius: 'card', borderWidth: 'thin', borderStyle: 'solid' },
  variants: {
    selected: {
      false: { borderColor: 'transparent' },
      true: { borderColor: 'border.focus' }
    }
  },
  defaultVariants: { selected: false }
})

const networkIconRecipe = cva({
  base: {
    display: 'grid',
    width: 'media-small',
    height: 'media-small',
    flexShrink: 0,
    placeItems: 'center',
    overflow: 'hidden',
    borderRadius: '50%',
    background: 'bg.control',
    pointerEvents: 'none',
    '& img': { width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }
  }
})

const networkActionsRecipe = cva({
  base: { paddingInline: '6', paddingBlockEnd: '4', paddingInlineStart: 'selection-offset' }
})

const networkDotsRecipe = cva({
  base: { display: 'grid', gridTemplateColumns: 'repeat(2, 8px)', gap: '1', padding: '2' }
})

export interface NetworkRowViewModel {
  chainId: number
  connection?: any
  icon: React.ReactNode
  isTestnet?: boolean
  name: string
  on: boolean
  totalValue: number
}

export interface NetworksViewProps {
  allTotal: number
  enabledChainDots: React.ReactNode
  getRpcDraft: (chainId: number) => string
  kebabChainId: number
  onBack: () => void
  onChangeQuery: (query: string) => void
  onChangeRpcDraft: (chainId: number, value: string) => void
  onSaveRpc: (chainId: number) => void
  onSelect: (chainId: number) => void
  onToggleChain: (chainId: number, enabled: boolean) => void
  onToggleKebab: (chainId: number) => void
  query: string
  rows: NetworkRowViewModel[]
  selectedChainId: number
  showTestnets: boolean
}

export function NetworksView(props: NetworksViewProps) {
  const renderRows = (rows: NetworkRowViewModel[]) =>
    rows.map((chain) => {
      const selected = props.selectedChainId === chain.chainId
      const kebabOpen = props.kebabChainId === chain.chainId
      const rpcValue = props.getRpcDraft(chain.chainId)
      const primary = chain.connection?.primary || {}

      return (
        <div key={chain.chainId} className={networkRecipe({ selected })}>
          <Stack align='center' direction='row' gap='none'>
            <Button
              appearance='selectionOption'
              disabled={!chain.on}
              label={chain.name}
              onPress={() => props.onSelect(chain.chainId)}
              selected={selected}
              width='full'
            >
              <span className={networkIconRecipe()}>{chain.icon}</span>
              <Text truncate variant='label'>
                {chain.name}
              </Text>
              <Spacer />
              <Text tone='secondary' variant='numeric'>
                {chain.on ? `$${formatUsdRate(chain.totalValue, 2)}` : 'Disabled'}
              </Text>
            </Button>
            <IconButton
              expanded={kebabOpen}
              icon='ellipsis'
              label={`${chain.name} actions`}
              onPress={() => props.onToggleKebab(chain.chainId)}
              size='small'
            />
          </Stack>
          {kebabOpen ? (
            <div className={networkActionsRecipe()}>
              <Stack gap='small'>
                <Stack gap='xsmall'>
                  <Stack direction='row' justify='between'>
                    <Text tone='muted' variant='caption'>
                      Primary RPC
                    </Text>
                    <Text tone='muted' variant='caption'>
                      {primary.current === 'custom'
                        ? 'Custom'
                        : primary.current === 'chainlist'
                          ? 'Chainlist'
                          : primary.current || 'Default'}
                    </Text>
                  </Stack>
                  <Stack align='center' direction='row' gap='xsmall'>
                    <Input
                      appearance='code'
                      label={`${chain.name} primary RPC`}
                      onSubmit={() => props.onSaveRpc(chain.chainId)}
                      onValueChange={(value) => props.onChangeRpcDraft(chain.chainId, value)}
                      placeholder='Custom RPC URL'
                      spellCheck={false}
                      value={rpcValue}
                    />
                    <Button
                      appearance='subtle'
                      disabled={!rpcValue.trim()}
                      label={`Save ${chain.name} RPC`}
                      onPress={() => props.onSaveRpc(chain.chainId)}
                      shape='pill'
                      size='small'
                    >
                      <Text variant='compactAction'>Save</Text>
                    </Button>
                  </Stack>
                </Stack>
                {chain.chainId !== 1 ? (
                  <Button
                    appearance={chain.on ? 'danger' : 'subtle'}
                    onPress={() => props.onToggleChain(chain.chainId, !chain.on)}
                    shape='pill'
                    size='small'
                  >
                    <Text variant='compactAction'>{chain.on ? 'Disable Chain' : 'Enable Chain'}</Text>
                  </Button>
                ) : null}
                <Button appearance='ghost' onPress={() => props.onToggleKebab(0)} shape='pill' size='small'>
                  <Text variant='compactAction'>Cancel</Text>
                </Button>
              </Stack>
            </div>
          ) : null}
        </div>
      )
    })

  const productionRows = props.rows.filter((chain) => !chain.isTestnet)
  const testnetRows = props.rows.filter((chain) => chain.isTestnet)
  const section = (title: string, rows: NetworkRowViewModel[]) =>
    rows.length ? (
      <React.Fragment key={title}>
        {props.showTestnets ? (
          <Text tone='muted' variant='overline'>
            {title}
          </Text>
        ) : null}
        {renderRows(rows)}
      </React.Fragment>
    ) : null

  return (
    <TrayOverlay closeLabel='Back' label='Networks' onClose={props.onBack} title='Networks'>
      <Stack gap='small'>
        <SearchField
          label='Search networks'
          onChange={props.onChangeQuery}
          onClear={() => props.onChangeQuery('')}
          placeholder='Search networks'
          value={props.query}
        />
        <Button
          appearance='outlinedSelection'
          label='All Networks'
          onPress={() => props.onSelect(0)}
          selected={props.selectedChainId === 0}
          width='full'
        >
          <span className={networkDotsRecipe()}>{props.enabledChainDots}</span>
          <Text variant='label'>All Networks</Text>
          <Spacer />
          <Text variant='numeric'>{`$${formatUsdRate(props.allTotal, 2)}`}</Text>
        </Button>
        {section('Mainnets', productionRows)}
        {section('Testnets', testnetRows)}
      </Stack>
    </TrayOverlay>
  )
}
