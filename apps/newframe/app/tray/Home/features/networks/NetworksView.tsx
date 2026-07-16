import React from 'react'

import svg from '../../../../../resources/svg'
import { formatUsdRate } from '../../../../../resources/domain/balance'
import { activateOnKeyboard } from '../../ui/keyboard'

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
          <div
            aria-disabled={!chain.on}
            aria-label={chain.name}
            className='t2NetworkRow'
            onClick={() => chain.on && props.onSelect(chain.chainId)}
            onKeyDown={(event) => activateOnKeyboard(event, () => chain.on && props.onSelect(chain.chainId))}
            role='button'
            style={{ opacity: chain.on ? 1 : 0.4 }}
            tabIndex={chain.on ? 0 : -1}
          >
            <div className='t2NetworkIcon'>{chain.icon}</div>
            <div className='t2NetworkName'>{chain.name}</div>
            <div className='t2NetworkTotal'>
              {chain.on ? `$${formatUsdRate(chain.totalValue, 2)}` : 'Disabled'}
            </div>
            <div
              aria-expanded={kebabOpen}
              aria-label={`${chain.name} actions`}
              className='t2NetworkKebab'
              onClick={(event) => {
                event.stopPropagation()
                props.onToggleKebab(chain.chainId)
              }}
              onKeyDown={(event) => activateOnKeyboard(event, () => props.onToggleKebab(chain.chainId))}
              role='button'
              tabIndex={0}
            >
              {svg.ellipsis(13)}
            </div>
          </div>
          {kebabOpen ? (
            <div className='t2NetworkActions'>
              <div
                className='t2NetworkRpcEditor'
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <div className='t2NetworkRpcLabel'>
                  <span className='traySpan'>Primary RPC</span>
                  <span className='traySpan'>
                    {primary.current === 'custom'
                      ? 'Custom'
                      : primary.current === 'chainlist'
                        ? 'Chainlist'
                        : primary.current || 'Default'}
                  </span>
                </div>
                <div className='t2NetworkRpcInputRow'>
                  <input
                    aria-label={`${chain.name} primary RPC`}
                    onChange={(event) => props.onChangeRpcDraft(chain.chainId, event.target.value)}
                    onKeyDown={(event) => {
                      event.stopPropagation()
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        props.onSaveRpc(chain.chainId)
                      }
                    }}
                    placeholder='Custom RPC URL'
                    spellCheck={false}
                    value={rpcValue}
                  />
                  <div
                    aria-disabled={!rpcValue.trim()}
                    aria-label={`Save ${chain.name} RPC`}
                    className={
                      rpcValue.trim()
                        ? 't2NetworkAction t2NetworkActionGood'
                        : 't2NetworkAction t2NetworkActionDisabled'
                    }
                    onClick={(event) => {
                      event.stopPropagation()
                      props.onSaveRpc(chain.chainId)
                    }}
                    role='button'
                    tabIndex={rpcValue.trim() ? 0 : -1}
                  >
                    Save
                  </div>
                </div>
              </div>
              {chain.chainId !== 1 ? (
                <div
                  className={
                    chain.on ? 't2NetworkAction t2NetworkActionBad' : 't2NetworkAction t2NetworkActionGood'
                  }
                  onClick={(event) => {
                    event.stopPropagation()
                    props.onToggleChain(chain.chainId, !chain.on)
                  }}
                  role='button'
                  tabIndex={0}
                >
                  {chain.on ? 'Disable Chain' : 'Enable Chain'}
                </div>
              ) : null}
              <div
                className='t2NetworkAction t2NetworkActionCancel'
                onClick={(event) => {
                  event.stopPropagation()
                  props.onToggleKebab(0)
                }}
                role='button'
                tabIndex={0}
              >
                Cancel
              </div>
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
        {props.showTestnets ? <div className='t2NetworkSectionTitle'>{title}</div> : null}
        {renderRows(rows)}
      </React.Fragment>
    ) : null

  return (
    <div aria-label='Networks' className='t2Overlay cardShow' role='dialog'>
      <div className='t2OverlayHeader'>
        <div
          aria-label='Back'
          className='t2OverlayBack'
          onClick={props.onBack}
          onKeyDown={(event) => activateOnKeyboard(event, props.onBack)}
          role='button'
          tabIndex={0}
        >
          {svg.chevronLeft(16)}
        </div>
        <div className='t2OverlayTitle'>Networks</div>
        <div className='t2OverlaySpacer' />
      </div>
      <div className='t2SearchWrap'>
        <div className='t2Search'>
          <div className='t2SearchIcon'>{svg.search(11)}</div>
          <input
            aria-label='Search networks'
            onChange={(event) => props.onChangeQuery(event.target.value)}
            placeholder='Search networks'
            spellCheck={false}
            type='text'
            value={props.query}
          />
        </div>
      </div>
      <div className='t2OverlayScroll t2NetworksScroll'>
        <div
          aria-label='All Networks'
          className={props.selectedChainId === 0 ? 't2NetworkAll t2NetworkSelected' : 't2NetworkAll'}
          onClick={() => props.onSelect(0)}
          onKeyDown={(event) => activateOnKeyboard(event, () => props.onSelect(0))}
          role='button'
          tabIndex={0}
        >
          <div className='t2NetworkDots t2NetworkDotsLarge'>{props.enabledChainDots}</div>
          <div className='t2NetworkAllName'>All Networks</div>
          <div className='t2NetworkAllTotal'>{`$${formatUsdRate(props.allTotal, 2)}`}</div>
        </div>
        {section('Mainnets', productionRows)}
        {section('Testnets', testnetRows)}
      </div>
    </div>
  )
}
