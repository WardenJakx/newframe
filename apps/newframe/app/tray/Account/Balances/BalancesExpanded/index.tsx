import React from 'react'
import Restore from 'react-restore'

import link from '../../../../../resources/link'
import svg from '../../../../../resources/svg'
import Balance from '../Balance'
import {
  formatUsdRate,
  createBalanceSummarySelector,
  createDisplayBalance,
  isLowValueTokenBalance,
  type BalanceSummary
} from '../../../../../resources/domain/balance'
import { matchFilter } from '../../../../../resources/utils'

import { ClusterBox, Cluster, ClusterRow, ClusterValue } from '../../../../../resources/Components/Cluster'

class BalancesExpanded extends React.Component<any, any> {
  declare store: Store
  moduleRef: React.RefObject<HTMLDivElement | null>
  selectBalanceSummaries = createBalanceSummarySelector()
  refreshTimer: any

  constructor(props: any, context?: any) {
    super(props, context)
    this.moduleRef = React.createRef()

    this.state = {
      openActive: false,
      open: false,
      selected: 0,
      shadowTop: 0,
      expand: false,
      balanceFilter: ''
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

  override componentWillUnmount() {
    clearTimeout(this.refreshTimer)
  }

  getBalances(rawBalances: any, rates: any) {
    const networks = this.store('main.networks.ethereum')
    const networksMeta = this.store('main.networksMeta.ethereum')

    const balances = this.selectBalanceSummaries({
      rawBalances,
      rates,
      networks,
      networksMeta,
      includeChain: (chain) => {
        return !!(chain.connection?.primary?.connected || chain.connection?.secondary?.connected)
      },
      cacheKey: this.props.account
    })
      .filter((balance: any) => {
        const filter = this.state.balanceFilter
        const chainName = this.store('main.networks.ethereum', balance.chainId, 'name')
        return matchFilter(filter, [chainName, balance.name, balance.symbol])
      })

    const visibleBalances = balances.filter((balance: any) => !isLowValueTokenBalance(balance))
    const hiddenLowValueCount = balances.length - visibleBalances.length
    const totalValue = visibleBalances.reduce((a: any, b: any) => a + b.totalValue, 0)

    return { balances: visibleBalances, hiddenLowValueCount, totalDisplayValue: formatUsdRate(totalValue, 0), totalValue }
  }

  renderAccountFilter() {
    return (
      <div className='panelFilterAccount'>
        <div className='panelFilterIcon'>{svg.search(12)}</div>
        <div className='panelFilterInput'>
          <input
            tabIndex={-1}
            type='text'
            spellCheck='false'
            onChange={(e) => {
              const value = e.target.value
              this.setState({ balanceFilter: value })
            }}
            value={this.state.balanceFilter}
          />
        </div>
        {this.state.balanceFilter ? (
          <div
            className='panelFilterClear'
            onClick={() => {
              this.setState({ balanceFilter: '' })
            }}
          >
            {svg.close(12)}
          </div>
        ) : null}
      </div>
    )
  }

  override render() {
    const { address, lastSignerType } = this.store('main.accounts', this.props.account)
    const storedBalances = this.store('main.balances', address) || []
    const rates = this.store('main.rates')

    const { balances: allBalances, hiddenLowValueCount, totalDisplayValue, totalValue } = this.getBalances(
      storedBalances,
      rates
    )
    const balances = allBalances
      .slice(0, this.props.expanded ? allBalances.length : 4)
      .map((balance: BalanceSummary) => createDisplayBalance(balance))

    const lastBalanceUpdate = this.store('main.accounts', address, 'balances.lastUpdated')

    // scan if balances are more than a minute old
    const scanning =
      !lastBalanceUpdate || (new Date() as any) - (new Date(lastBalanceUpdate) as any) > 1000 * 60
    const showLoading = scanning && balances.length === 0 && hiddenLowValueCount === 0
    const hotSigner = ['ring', 'seed'].includes(lastSignerType)

    return (
      <div className='accountViewScroll'>
        {this.renderAccountFilter()}
        {showLoading ? (
          <div className='signerBalancesLoading'>
            <div className='loader' />
          </div>
        ) : null}
        <ClusterBox>
          <Cluster>
            {balances.map(({ chainId, symbol, ...balance }: any, i: number) => {
              return (
                <ClusterRow key={chainId + symbol}>
                  <ClusterValue>
                    <Balance
                      chainId={chainId}
                      symbol={symbol}
                      balance={balance}
                      i={i}
                      scanning={showLoading}
                    />
                  </ClusterValue>
                </ClusterRow>
              )
            })}
            {hiddenLowValueCount > 0 ? (
              <ClusterRow>
                <ClusterValue>
                  <div className='signerBalanceLowValueHidden'>
                    {`${hiddenLowValueCount} low value ${
                      hiddenLowValueCount === 1 ? 'token' : 'tokens'
                    } hidden`}
                  </div>
                </ClusterValue>
              </ClusterRow>
            ) : null}
          </Cluster>
        </ClusterBox>
        <div className='signerBalanceTotal' style={{ opacity: !showLoading ? 1 : 0 }}>
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

export default Restore.connect(BalancesExpanded)
