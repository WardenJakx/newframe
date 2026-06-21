import React from 'react'
import Restore from 'react-restore'

import link from '../../../../../resources/link'
import svg from '../../../../../resources/svg'
import {
  formatUsdRate,
  createBalanceSummarySelector,
  createDisplayBalance,
  isLowValueTokenBalance,
  type BalanceSummary
} from '../../../../../resources/domain/balance'
import { matchFilter } from '../../../../../resources/utils'

import { Cluster, ClusterRow, ClusterValue } from '../../../../../resources/Components/Cluster'

import Balance from '../Balance'

class BalancesPreview extends React.Component<any, any> {
  declare store: Store
  moduleRef: React.RefObject<HTMLDivElement | null>
  selectBalanceSummaries = createBalanceSummarySelector()
  resizeObserver?: ResizeObserver
  refreshTimer: any
  resizeTimer: any

  constructor(props: any, context?: any) {
    super(props, context)
    this.moduleRef = React.createRef()
    if (!this.props.expanded) {
      this.resizeObserver = new ResizeObserver(() => {
        clearTimeout(this.resizeTimer)
        this.resizeTimer = setTimeout(() => {
          if (this.moduleRef && this.moduleRef.current) {
            link.send('tray:action', 'updateAccountModule', this.props.moduleId, {
              height: this.moduleRef.current.clientHeight
            })
          }
        }, 100)
      })
    }

    this.state = {
      openActive: false,
      open: false,
      selected: 0,
      shadowTop: 0,
      expand: false
    }
  }

  refreshPortfolioBalances(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    if (this.state.refreshingPortfolio) return

    this.setState({ refreshingPortfolio: true })

    link
      .invoke('tray:refreshPortfolioBalances', this.props.account)
      .catch(() => undefined)
      .finally(() => {
        this.refreshTimer = setTimeout(() => this.setState({ refreshingPortfolio: false }), 1000)
      })
  }

  override componentDidMount() {
    if (this.resizeObserver) this.resizeObserver.observe(this.moduleRef.current as Element)
  }

  override componentWillUnmount() {
    if (this.resizeObserver) this.resizeObserver.disconnect()
    clearTimeout(this.refreshTimer)
  }

  getBalances(rawBalances: any, rates: any) {
    const networks = this.store('main.networks.ethereum')
    const networksMeta = this.store('main.networksMeta.ethereum')

    return this.selectBalanceSummaries({
      rawBalances,
      rates,
      networks,
      networksMeta,
      includeChain: (chain) => {
        return !!(chain.connection?.primary?.connected || chain.connection?.secondary?.connected)
      },
      cacheKey: this.props.account
    })
  }

  override render() {
    const { address, lastSignerType } = this.store('main.accounts', this.props.account)
    const storedBalances = this.store('main.balances', address) || []
    const rates = this.store('main.rates')

    const allBalances = this.getBalances(storedBalances, rates)

    // if filter only show balances that match filter
    const filteredBalances = allBalances.filter((balance: any) => {
      const { filter = '' } = this.props
      const chainName = this.store('main.networks.ethereum', balance.chainId, 'name')
      return matchFilter(filter, [chainName, balance.name, balance.symbol])
    })

    const visibleBalances = filteredBalances.filter((balance: any) => !isLowValueTokenBalance(balance))
    const hiddenLowValueCount = filteredBalances.length - visibleBalances.length
    const totalValue = visibleBalances.reduce((a: any, b: any) => a + b.totalValue, 0)
    const totalDisplayValue = formatUsdRate(totalValue, 0)
    const lastBalanceUpdate = this.store('main.accounts', address, 'balances.lastUpdated')

    const balances = visibleBalances.slice(0, 4).map((balance: BalanceSummary) => createDisplayBalance(balance))

    // scan if balances are more than a minute old
    const scanning =
      !lastBalanceUpdate || (new Date() as any) - (new Date(lastBalanceUpdate) as any) > 1000 * 60
    const showLoading = scanning && balances.length === 0 && hiddenLowValueCount === 0
    const hotSigner = ['ring', 'seed'].includes(lastSignerType)

    return (
      <div ref={this.moduleRef} className='balancesBlock'>
        <div className={'moduleHeader'}>
          <span>{svg.tokens(13)}</span>
          <span>{'Balances'}</span>
        </div>
        {showLoading ? (
          <div className='signerBalancesLoading'>
            <div className='loader' />
          </div>
        ) : null}
        <Cluster>
          {balances.map(({ chainId, symbol, ...balance }: any, i: number) => {
            return (
              <ClusterRow key={chainId + symbol}>
                <ClusterValue>
                  <Balance chainId={chainId} symbol={symbol} balance={balance} i={i} scanning={showLoading} />
                </ClusterValue>
              </ClusterRow>
            )
          })}
          {hiddenLowValueCount > 0 ? (
            <ClusterRow>
              <ClusterValue>
                <div className='signerBalanceLowValueHidden'>
                  {`${hiddenLowValueCount} low value ${hiddenLowValueCount === 1 ? 'token' : 'tokens'} hidden`}
                </div>
              </ClusterValue>
            </ClusterRow>
          ) : null}
        </Cluster>
        <div className='signerBalanceTotal' style={{ opacity: !showLoading ? 1 : 0 }}>
          {!this.props.expanded ? (
            <div className='signerBalanceButtons'>
              <div
                className='signerBalanceButton signerBalanceShowAll'
                onClick={() => {
                  const crumb = {
                    view: 'expandedModule',
                    data: {
                      id: this.props.moduleId,
                      account: this.props.account
                    }
                  }
                  link.send('nav:forward', 'panel', crumb)
                }}
              >
                {visibleBalances.length - balances.length > 0
                  ? `+${visibleBalances.length - balances.length} More`
                  : 'More'}
              </div>
            </div>
          ) : (
            <div className='signerBalanceButtons'>
              <div
                className='signerBalanceButton signerBalanceAddToken'
                onMouseDown={() => {
                  link.send('tray:action', 'navDash', { view: 'tokens', data: { notify: 'addToken' } })
                }}
              >
                <span>Add Token</span>
              </div>
            </div>
          )}
          <div className='signerBalanceTotalText'>
            <div
              aria-label='Refresh balances'
              className={
                this.state.refreshingPortfolio
                  ? 'signerBalanceRefresh signerBalanceRefreshActive'
                  : 'signerBalanceRefresh'
              }
              onMouseDown={(e) => this.refreshPortfolioBalances(e)}
              role='button'
              title='Refresh balances'
            >
              {svg.sync(13)}
            </div>
            <div className='signerBalanceTotalLabel'>{'Total'}</div>
            <div className='signerBalanceTotalValue'>
              {svg.usd(11)}
              {balances.length > 0 || hiddenLowValueCount > 0 ? totalDisplayValue : '---.--'}
            </div>
          </div>
        </div>
        {totalValue > 10000 && hotSigner ? (
          <div
            className='signerBalanceWarning'
            onClick={() => this.setState({ showHighHotMessage: !this.state.showHighHotMessage })}
            style={showLoading ? { opacity: 0 } : { opacity: 1 }}
          >
            <div className='signerBalanceWarningTitle'>{'high value account is using hot signer'}</div>
            {this.state.showHighHotMessage ? (
              <div className='signerBalanceWarningMessage'>
                {
                  'We recommend using one of our supported hardware signers to increase the security of your account'
                }
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }
}

export default Restore.connect(BalancesPreview)
