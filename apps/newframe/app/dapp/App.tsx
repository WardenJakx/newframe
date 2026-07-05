import React from 'react'
import Restore from 'react-restore'
import { isAddress } from 'ethers'
import { v5 as uuidv5 } from 'uuid'

import link from '../../resources/link'
import Native from '../../resources/Native'
import svg from '../../resources/svg'
import { NATIVE_CURRENCY } from '../../resources/constants'
import {
  createBalanceSummarySelector,
  createDisplayBalance,
  formatUsdRate,
  hasPositiveBalance,
  type BalanceSummary
} from '../../resources/domain/balance'
import { cachedImageUrl } from '../../resources/domain/imageCache'
import { formatUnits, parseUnits, toBigInt } from '../../resources/utils/numbers'

const sendStorageKey = 'send'
const frameOriginId = uuidv5('newframe-internal', uuidv5.DNS)
const INITIAL_SEND_TOKEN_ROWS = 50
const SEND_TOKEN_ROWS_INCREMENT = 50

function tokenKey(token?: any) {
  if (!token) return ''
  return `${token.chainId}:${(token.address || '').toLowerCase()}`
}

function cleanAddress(address = '') {
  return address.trim().toLowerCase()
}

function shouldResolveName(input = '') {
  const value = input.trim()

  return !!value && !/\s/.test(value)
}

function amountHex(amount: bigint) {
  return `0x${amount.toString(16)}`
}

function encodeErc20Transfer(to: string, amount: bigint) {
  const recipient = cleanAddress(to).replace(/^0x/, '').padStart(64, '0')
  const value = amount.toString(16).padStart(64, '0')
  return `0xa9059cbb${recipient}${value}`
}

class App extends React.Component<any, any> {
  declare store: Store
  selectBalanceSummaries = createBalanceSummarySelector()

  constructor(props: any, context?: any) {
    super(props, context)
    this.state = {
      amount: '1',
      error: '',
      recipient: null,
      recipientInput: '',
      recipientOpen: true,
      selectedAssetKey: '',
      launchAssetKey: '',
      launchUpdatedAt: 0,
      status: '',
      submitting: false,
      tokenOpen: false,
      tokenRowsVisible: INITIAL_SEND_TOKEN_ROWS
    }
  }

  override componentDidMount() {
    this.syncSelectedAssetFromLaunch()
  }

  override componentDidUpdate() {
    this.syncSelectedAssetFromLaunch()
  }

  syncSelectedAssetFromLaunch() {
    const launchAsset = this.store('main.dapp.storage', sendStorageKey, 'asset')
    const launchUpdatedAt = this.store('main.dapp.storage', sendStorageKey, 'updatedAt') || 0
    const launchAssetKey = tokenKey(launchAsset)

    if (launchUpdatedAt !== this.state.launchUpdatedAt || launchAssetKey !== this.state.launchAssetKey) {
      this.setState({
        launchAssetKey,
        launchUpdatedAt,
        selectedAssetKey: launchAssetKey,
        tokenOpen: false,
        tokenRowsVisible: INITIAL_SEND_TOKEN_ROWS
      })
    }
  }

  getCurrentAccount() {
    const selected = this.store('selected.current')
    return this.store('main.accounts', selected)
  }

  getAccounts() {
    const accounts = this.store('main.accounts') || {}
    const order = this.store('main.accountOrder') || Object.keys(accounts)
    const ordered = order.map((id: string) => accounts[id]).filter(Boolean)
    const missing = Object.keys(accounts)
      .filter((id) => !order.includes(id))
      .map((id) => accounts[id])

    return [...ordered, ...missing]
  }

  getBalanceSummaries() {
    const account = this.getCurrentAccount()
    const rawBalances = account ? this.store('main.balances', account.address) || [] : []
    const rates = this.store('main.rates') || {}
    const networks = this.store('main.networks.ethereum') || {}
    const networksMeta = this.store('main.networksMeta.ethereum') || {}

    return this.selectBalanceSummaries({
      rawBalances,
      rates,
      networks,
      networksMeta,
      includeChain: (chain) => !!chain.on,
      cacheKey: account?.address || ''
    })
  }

  chainColor(chainId: number) {
    const primaryColor = this.store('main.networksMeta.ethereum', chainId, 'primaryColor')
    return primaryColor ? `var(--${primaryColor})` : 'var(--moon)'
  }

  chainIcon(chainId: number, imgSize = 16, glyphSize = 12, dotSize = 9) {
    const icon = this.store('main.networksMeta.ethereum', chainId, 'icon')
    if (icon) {
      return (
        <img src={cachedImageUrl(icon)} alt='' style={{ width: `${imgSize}px`, height: `${imgSize}px` }} />
      )
    }

    const chain = this.store('main.networks.ethereum', chainId) || {}
    const ethChains = ['mainnet', 'görli', 'goerli', 'sepolia', 'ropsten', 'rinkeby', 'kovan']
    if (ethChains.includes((chain.name || '').toLowerCase())) return svg.eth(glyphSize)

    return (
      <div
        className='sendChainIconDot'
        style={{ background: this.chainColor(chainId), width: `${dotSize}px`, height: `${dotSize}px` }}
      />
    )
  }

  getSelectedAsset() {
    const balances = this.getBalanceSummaries()
    const launchAsset = this.store('main.dapp.storage', sendStorageKey, 'asset')
    const fallbackKey = tokenKey(launchAsset)
    const selectedKey = this.state.selectedAssetKey || fallbackKey

    const selectedBalance = balances.find((balance: BalanceSummary) => tokenKey(balance) === selectedKey)
    if (selectedBalance) return createDisplayBalance(selectedBalance)
    if (launchAsset && tokenKey(launchAsset) === selectedKey && hasPositiveBalance(launchAsset))
      return launchAsset

    return balances[0] ? createDisplayBalance(balances[0]) : null
  }

  getAmountBaseUnits(asset: any) {
    return parseUnits(this.state.amount, asset?.decimals || 18)
  }

  getRecipientAddress() {
    const selectedRecipient = this.state.recipient?.address || ''
    const input = this.state.recipientInput.trim()

    if (selectedRecipient) return cleanAddress(selectedRecipient)
    if (isAddress(input)) return cleanAddress(input)

    return ''
  }

  resolveName(name: string) {
    return new Promise<string>((resolve, reject) => {
      link.rpc('resolveName', name, (err: any, address: string) => {
        if (err || !address) reject(err || new Error('Could not resolve name'))
        else resolve(cleanAddress(address))
      })
    })
  }

  async resolveRecipientAddress() {
    const address = this.getRecipientAddress()
    if (address) return address

    const input = this.state.recipientInput.trim()
    if (shouldResolveName(input)) {
      return this.resolveName(input)
    }

    return ''
  }

  selectRecipient(account: any) {
    this.setState({
      error: '',
      recipient: account,
      recipientInput: '',
      recipientOpen: false
    })
  }

  clearRecipient() {
    this.setState({
      recipient: null,
      recipientInput: '',
      recipientOpen: true
    })
  }

  selectAsset(asset: any) {
    this.setState({
      error: '',
      selectedAssetKey: tokenKey(asset),
      tokenOpen: false
    })
  }

  setMax(asset: any) {
    const rawBalance = toBigInt(asset.balance) || 0n
    this.setState({ amount: formatUnits(rawBalance, asset.decimals), error: '' })
  }

  canProceed(asset: any) {
    const amount = asset && this.getAmountBaseUnits(asset)
    const balance = asset ? toBigInt(asset.balance) || 0n : 0n
    const hasRecipient = !!this.getRecipientAddress() || shouldResolveName(this.state.recipientInput)

    return !!asset && hasRecipient && !!amount && amount > 0n && amount <= balance
  }

  async submit() {
    const account = this.getCurrentAccount()
    const asset = this.getSelectedAsset()
    const amount = this.getAmountBaseUnits(asset)
    const balance = asset ? toBigInt(asset.balance) || 0n : 0n

    if (!account || !asset || !amount || amount <= 0n) {
      return this.setState({ error: 'Enter an amount to send.' })
    }

    if (amount > balance) {
      return this.setState({ error: 'Amount exceeds available balance.' })
    }

    let recipientAddress: string

    try {
      recipientAddress = await this.resolveRecipientAddress()
    } catch (e) {
      return this.setState({ error: 'Could not resolve recipient.' })
    }

    if (!isAddress(recipientAddress)) {
      return this.setState({ error: 'Enter a valid recipient.' })
    }

    const chainId = `0x${asset.chainId.toString(16)}`
    const nativeTransfer = asset.address === NATIVE_CURRENCY
    const tx = nativeTransfer
      ? {
          from: account.address,
          to: recipientAddress,
          value: amountHex(amount),
          chainId
        }
      : {
          from: account.address,
          to: asset.address,
          value: '0x0',
          data: encodeErc20Transfer(recipientAddress, amount),
          chainId
        }

    link.send('tray:action', 'initOrigin', frameOriginId, {
      name: 'newframe-internal',
      chain: { id: asset.chainId, type: 'ethereum' }
    })

    const payload = {
      id: Date.now(),
      jsonrpc: '2.0',
      method: 'eth_sendTransaction',
      chainId,
      params: [tx],
      _origin: frameOriginId
    }

    this.setState({ error: '', status: 'Confirm in Newframe', submitting: true })

    link.rpc('providerSend', payload, (response: any) => {
      if (response?.error) {
        this.setState({
          error: response.error.message || 'Transaction failed.',
          status: '',
          submitting: false
        })
      } else {
        this.setState({ status: 'Transaction submitted', submitting: false })
      }
    })
  }

  signerIcon(type: string, size = 16) {
    const signerType = (type || '').toLowerCase()
    if (signerType === 'address') return svg.eye(size)
    if (signerType === 'ledger') return svg.ledger(size)
    if (signerType === 'trezor') return svg.trezor(size)
    if (signerType === 'lattice') return svg.lattice(size)
    return svg.flame(size + 2)
  }

  renderAccountIcon(account: any) {
    return <div className='sendAccountIcon'>{this.signerIcon(account?.lastSignerType)}</div>
  }

  renderRecipient() {
    const accounts = this.getAccounts()
    const recipient = this.state.recipient

    if (recipient) {
      return (
        <div className='sendCard sendRecipientCard sendRecipientCardSelected'>
          <div className='sendSectionTitle'>Add recipient</div>
          <div className='sendRecipientPill'>
            {this.renderAccountIcon(recipient)}
            <div className='sendRecipientText'>
              <div className='sendRecipientName'>{recipient.ensName || recipient.name}</div>
              <div className='sendRecipientAddress'>{recipient.address}</div>
            </div>
            <div className='sendRecipientCopy'>{svg.copy(14)}</div>
            <button
              aria-label='Clear recipient'
              className='sendRecipientClear'
              onClick={() => this.clearRecipient()}
            >
              {svg.x(14)}
            </button>
          </div>
          <div className='sendRecipientNotice'>First time sending to this address.</div>
        </div>
      )
    }

    return (
      <div className='sendCard sendRecipientCard'>
        <div className='sendSectionTitle'>Add recipient</div>
        <div className='sendInputRow'>
          <input
            aria-label='Recipient'
            placeholder='Address / gns/ens name / Namoshi'
            spellCheck='false'
            value={this.state.recipientInput}
            onChange={(e) =>
              this.setState({
                error: '',
                recipientInput: e.target.value,
                recipientOpen: true
              })
            }
          />
          <button
            aria-label='Toggle recipients'
            className='sendInputToggle'
            onClick={() => this.setState({ recipientOpen: !this.state.recipientOpen })}
          >
            {svg.chevron(14)}
          </button>
        </div>
        {this.state.recipientOpen ? (
          <div className='sendRecipientMenu'>
            <div className='sendRecipientMenuTitle'>{svg.wallet(14)} My wallets</div>
            {accounts.map((account: any) => (
              <button
                className='sendWalletRow'
                key={account.id}
                onClick={() => this.selectRecipient(account)}
                type='button'
              >
                {this.renderAccountIcon(account)}
                <div className='sendWalletInfo'>
                  <div className='sendWalletName'>{account.ensName || account.name}</div>
                  <div className='sendWalletAddress'>{account.address}</div>
                </div>
                <div className='sendWalletCopy'>{svg.copy(14)}</div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  renderTokenIcon(asset: any) {
    return (
      <div className='sendTokenIcon'>
        <div className='sendTokenIconInner'>
          {asset?.logoURI ? (
            <img src={cachedImageUrl(asset.logoURI)} alt='' />
          ) : (
            <span className='sendTokenIconGlyph'>{(asset?.symbol || '?').substring(0, 1)}</span>
          )}
        </div>
        <div className='sendTokenChainBadge'>{this.chainIcon(asset?.chainId, 18, 11, 9)}</div>
      </div>
    )
  }

  renderTokenSelector(asset: any) {
    const balances = this.state.tokenOpen ? this.getBalanceSummaries() : []
    const selectedKey = tokenKey(asset)
    const visibleBalances = balances.slice(0, this.state.tokenRowsVisible)
    const selectedBalance = balances.find((balance: BalanceSummary) => tokenKey(balance) === selectedKey)
    const menuBalances =
      selectedBalance && !visibleBalances.some((balance: BalanceSummary) => tokenKey(balance) === selectedKey)
        ? [selectedBalance, ...visibleBalances]
        : visibleBalances
    const rowsHidden = Math.max(balances.length - this.state.tokenRowsVisible, 0)

    return (
      <div className='sendTokenPicker'>
        <button
          className='sendTokenButton'
          onClick={() => this.setState({ tokenOpen: !this.state.tokenOpen, recipientOpen: false })}
        >
          {this.renderTokenIcon(asset)}
          <div className='sendTokenText'>
            <div className='sendTokenSymbol'>{asset?.symbol || 'Token'}</div>
            <div className='sendTokenChain'>
              {this.store('main.networks.ethereum', asset?.chainId, 'name') || ''}
            </div>
          </div>
          <div className='sendTokenChevron'>{svg.chevron(13)}</div>
        </button>
        {this.state.tokenOpen ? (
          <div className='sendTokenMenu'>
            {menuBalances.map((balance: BalanceSummary) => {
              const displayBalance = createDisplayBalance(balance)

              return (
                <button
                  key={tokenKey(balance)}
                  className='sendTokenOption'
                  onClick={() => this.selectAsset(displayBalance)}
                >
                  {this.renderTokenIcon(displayBalance)}
                  <div className='sendTokenText'>
                    <div className='sendTokenSymbol'>{displayBalance.symbol}</div>
                    <div className='sendTokenChain'>
                      {this.store('main.networks.ethereum', displayBalance.chainId, 'name')}
                    </div>
                  </div>
                  <div className='sendTokenOptionBalance'>{displayBalance.displayBalance}</div>
                </button>
              )
            })}
            {rowsHidden > 0 ? (
              <button
                className='sendTokenMore'
                onClick={() =>
                  this.setState({
                    tokenRowsVisible: this.state.tokenRowsVisible + SEND_TOKEN_ROWS_INCREMENT
                  })
                }
              >
                {`Show ${Math.min(SEND_TOKEN_ROWS_INCREMENT, rowsHidden)} more assets`}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  renderTokenAmount(asset: any) {
    const amount = Number(this.state.amount || 0)
    const price = Number(asset?.usdRate?.price || 0)
    const fiatValue = amount > 0 && price > 0 ? `$${formatUsdRate(amount * price, 2)}` : '$0.00'

    return (
      <div className='sendCard sendTokenCard'>
        <div className='sendSectionTitle'>Send token</div>
        <div className='sendTokenMain'>
          {this.renderTokenSelector(asset)}
          <input
            aria-label='Amount'
            className='sendAmountInput'
            inputMode='decimal'
            spellCheck='false'
            value={this.state.amount}
            onChange={(e) => this.setState({ amount: e.target.value, error: '', status: '' })}
          />
        </div>
        <div className='sendTokenMeta'>
          <div className='sendBalance'>
            {svg.wallet(13)}
            <span>
              {asset?.displayBalance || '0'} {asset?.symbol || ''}
            </span>
            <button onClick={() => this.setMax(asset)}>Max</button>
          </div>
          <div className='sendFiatValue'>{fiatValue}</div>
        </div>
      </div>
    )
  }

  renderFooter(asset: any) {
    const enabled = this.canProceed(asset) && !this.state.submitting

    return (
      <div className='sendFooter'>
        <button
          className={enabled ? 'sendProceedButton' : 'sendProceedButton sendProceedButtonDisabled'}
          disabled={!enabled}
          onClick={() => this.submit()}
        >
          Proceed
        </button>
      </div>
    )
  }

  override render() {
    const asset = this.getSelectedAsset()
    const hasAsset = !!asset

    return (
      <div className='sendApp'>
        <Native />
        <div className='sendHeader'>
          <button aria-label='Close Send' className='sendBackButton' onClick={() => link.send('frame:close')}>
            {svg.chevronLeft(18)}
          </button>
          <div className='sendTitle'>Send</div>
          <div className='sendHeaderSpacer' />
        </div>
        {hasAsset ? (
          <div className='sendBody'>
            {this.renderRecipient()}
            {this.renderTokenAmount(asset)}
            {this.state.error ? <div className='sendMessage sendMessageError'>{this.state.error}</div> : null}
            {this.state.status ? <div className='sendMessage'>{this.state.status}</div> : null}
          </div>
        ) : (
          <div className='sendEmpty'>No assets available to send.</div>
        )}
        {hasAsset ? this.renderFooter(asset) : null}
      </div>
    )
  }
}

export default Restore.connect(App)
