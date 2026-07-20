import React from 'react'

import { Button } from '@newframe/ui/button'
import { IconButton } from '@newframe/ui/icon-button'
import { Input } from '@newframe/ui/input'
import { SearchField } from '@newframe/ui/search-field'
import { Spacer } from '@newframe/ui/spacer'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { formatUsdRate } from '../../../../../resources/domain/balance'
import { SidePanelHeader } from '../../../../../resources/Components/SidePanel/SidePanelHeader'

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
        <div key={chain.chainId} className={selected ? 't2NetworkItem t2NetworkSelected' : 't2NetworkItem'}>
          <Stack align='center' direction='row' gap='none'>
            <Button
              appearance='selectionOption'
              disabled={!chain.on}
              label={chain.name}
              onPress={() => props.onSelect(chain.chainId)}
              selected={selected}
              width='full'
            >
              <div className='t2NetworkIcon'>{chain.icon}</div>
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
            <div className='t2NetworkActions'>
              <div
                className='t2NetworkRpcEditor'
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
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
              </div>
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
    <div aria-label='Networks' className='t2Overlay cardShow' role='dialog'>
      <SidePanelHeader closeLabel='Back' onClose={props.onBack} title='Networks' />
      <div className='t2SearchWrap'>
        <SearchField
          label='Search networks'
          onChange={props.onChangeQuery}
          onClear={() => props.onChangeQuery('')}
          placeholder='Search networks'
          value={props.query}
        />
      </div>
      <div className='t2OverlayScroll t2NetworksScroll'>
        <Button
          appearance='outlinedSelection'
          label='All Networks'
          onPress={() => props.onSelect(0)}
          selected={props.selectedChainId === 0}
          width='full'
        >
          <div className='t2NetworkDots t2NetworkDotsLarge'>{props.enabledChainDots}</div>
          <Text variant='label'>All Networks</Text>
          <Spacer />
          <Text variant='numeric'>{`$${formatUsdRate(props.allTotal, 2)}`}</Text>
        </Button>
        {section('Mainnets', productionRows)}
        {section('Testnets', testnetRows)}
      </div>
    </div>
  )
}
