import React from 'react'
import Restore from 'react-restore'

import link from '../../../../../resources/link'
import svg from '../../../../../resources/svg'
import { isNetworkConnected } from '../../../../../resources/utils/chains'
import Balance from '../Balance'
import {
  formatUsdRate,
  createBalance,
  sortByTotalValue as byTotalValue,
  isNativeCurrency
} from '../../../../../resources/domain/balance'
import { matchFilter } from '../../../../../resources/utils'

import { ClusterBox, Cluster, ClusterRow, ClusterValue } from '../../../../../resources/Components/Cluster'

class BalancesExpanded extends React.Component<any, any> {
  declare store: Store
  moduleRef: React.RefObject<HTMLDivElement | null>

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

  getBalances(rawBalances: any, rates: any) {
    const networks = this.store('main.networks.ethereum')
    const networksMeta = this.store('main.networksMeta.ethereum')

    const balances = rawBalances
      // only show balances from connected networks
      .filter((rawBalance: any) => isNetworkConnected(networks[rawBalance.chainId]))
      .map((rawBalance: any) => {
        const isNative = isNativeCurrency(rawBalance.address)
        const nativeCurrencyInfo = networksMeta[rawBalance.chainId].nativeCurrency || {}

        const rate = isNative ? nativeCurrencyInfo : rates[rawBalance.address || rawBalance.symbol] || {}
        const logoURI = (isNative && nativeCurrencyInfo.icon) || rawBalance.logoURI
        const name = isNative ? nativeCurrencyInfo.name || networks[rawBalance.chainId].name : rawBalance.name
        const decimals = isNative ? nativeCurrencyInfo.decimals || 18 : rawBalance.decimals
        const symbol = (isNative && nativeCurrencyInfo.symbol) || rawBalance.symbol

        return createBalance(
          { ...rawBalance, logoURI, name, decimals, symbol },
          networks[rawBalance.chainId].isTestnet ? { price: 0 } : rate.usd
        )
      })
      .filter((balance: any) => {
        const filter = this.state.balanceFilter
        const chainName = this.store('main.networks.ethereum', balance.chainId, 'name')
        return matchFilter(filter, [chainName, balance.name, balance.symbol])
      })
      .sort(byTotalValue)

    const totalValue = balances.reduce((a: any, b: any) => a + b.totalValue, 0)

    return { balances, totalDisplayValue: formatUsdRate(totalValue, 0), totalValue }
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

    const { balances: allBalances, totalDisplayValue, totalValue } = this.getBalances(storedBalances, rates)
    const balances = allBalances.slice(0, this.props.expanded ? allBalances.length : 4)

    const lastBalanceUpdate = this.store('main.accounts', address, 'balances.lastUpdated')

    // scan if balances are more than a minute old
    const scanning =
      !lastBalanceUpdate || (new Date() as any) - (new Date(lastBalanceUpdate) as any) > 1000 * 60
    const hotSigner = ['ring', 'seed'].includes(lastSignerType)

    return (
      <div className='accountViewScroll'>
        {this.renderAccountFilter()}
        {scanning ? (
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
                    <Balance chainId={chainId} symbol={symbol} balance={balance} i={i} scanning={scanning} />
                  </ClusterValue>
                </ClusterRow>
              )
            })}
          </Cluster>
        </ClusterBox>
        <div className='signerBalanceTotal' style={{ opacity: !scanning ? 1 : 0 }}>
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
            <div className='signerBalanceTotalLabel'>{'Total'}</div>
            <div className='signerBalanceTotalValue'>
              {svg.usd(11)}
              {balances.length > 0 ? totalDisplayValue : '---.--'}
            </div>
          </div>
        </div>
        {totalValue > 10000 && hotSigner ? (
          <div
            className='signerBalanceWarning'
            onClick={() => this.setState({ showHighHotMessage: !this.state.showHighHotMessage })}
            style={scanning ? { opacity: 0 } : { opacity: 1 }}
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
