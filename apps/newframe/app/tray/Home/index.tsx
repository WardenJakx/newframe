import React from 'react'
import Restore from 'react-restore'
import QRCode from 'qrcode'
import { isAddress } from 'ethers'
import { v5 as uuidv5 } from 'uuid'

import link from '../../../resources/link'
import svg from '../../../resources/svg'
import ChainTokenIcon from '../../../resources/Components/ChainTokenIcon'
import KeyboardShortcutConfigurator from '../../../resources/Components/KeyboardShortcutConfigurator'
import TokenOptionRow from '../../../resources/Components/TokenOptionRow'
import {
  createWebAuthnBiometricCredential,
  isBiometricUserCanceledError,
  isWebAuthnBiometricsSupported
} from '../../../resources/biometrics'
import {
  formatUsdRate,
  createBalanceSummarySelector,
  createDisplayBalance,
  formatBalanceNotionalValue,
  isNativeCurrency,
  isLowValueTokenBalance,
  hasPositiveBalance,
  type BalanceSummary,
  type DisplayedBalance
} from '../../../resources/domain/balance'
import {
  buildDappLauncherRoute,
  DAPP_LAUNCHER_FRAME_ID,
  toCanonicalAssetId
} from '../../../resources/domain/dappLauncher'
import { cachedImageUrl, isCachedImageReference } from '../../../resources/domain/imageCache'
import { matchFilter } from '../../../resources/utils'
import { chainColorCssVariable, resolveSystemColor } from '../../../resources/style/tokens/colors'

import Requests from '../Account/Requests'
import TransactionInformation from '../Account/Requests/TransactionRequest/TransactionInformation'
import StatusGlyph from '../../../resources/Components/StatusGlyph'
import {
  getTransactionEffects,
  getTransactionIntent,
  TRANSACTION_CONFIRMATION_TARGET
} from '../../../resources/domain/transaction'
import {
  formatPairIntent,
  getFlashDefaultChainId,
  getContraPreposition,
  getDirectionLabel,
  isFlashChainSupported,
  type FlashTradeSide
} from '../../../resources/domain/flash'

const signerTypeLabels: Record<string, string> = {
  ring: 'Hot Signer',
  seed: 'Hot Signer',
  address: 'Watch-only',
  Address: 'Watch-only',
  ledger: 'Ledger',
  trezor: 'Trezor',
  lattice: 'Lattice'
}

const inlineAddSections = [
  { section: 'createSeed', title: 'Create recovery phrase', icon: 'seedling' },
  { section: 'storedSeed', title: 'Add from stored recovery phrases', icon: 'seedling' },
  { section: 'import', title: 'Import phrase or private key', icon: 'accounts' },
  { section: 'hardware', title: 'Connect a hardware wallet', icon: 'nested' },
  { section: 'watch', title: 'Watch an address', icon: 'eye' }
]

const inlineImportTypes = [
  { type: 'seed', title: 'Recovery phrase', icon: 'seedling' },
  { type: 'privateKey', title: 'Private key', icon: 'key' },
  { type: 'keystore', title: 'JSON backup file', icon: 'file' }
]

const inlineHardwareTypes = [
  { type: 'trezor', title: 'Trezor', icon: 'trezor' },
  { type: 'ledger', title: 'Ledger', icon: 'ledger' },
  { type: 'lattice', title: 'GridPlus', icon: 'lattice' }
]

const PORTFOLIO_IMPORTANCE_THRESHOLD = 0.01
const INITIAL_SECONDARY_POSITION_ROWS = 50
const SECONDARY_POSITION_ROWS_INCREMENT = 50
const INITIAL_DUST_ROWS = 50
const DUST_ROWS_INCREMENT = 50
const PENDING_NOTIFICATION_MS = 60 * 1000
const RESOLVED_NOTIFICATION_MS = 3000
const TRADE_DISABLED_CHAIN_LABEL = 'Trade unavailable on this chain'
const FRAME_ORIGIN_ID = uuidv5('newframe-internal', uuidv5.DNS)

const timestamp = (value: any, fallback = 0) => {
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
    const numeric = Number(value)
    if (!Number.isNaN(numeric)) return numeric
  }
  return fallback
}

const notificationExpiresAt = (notification: any) => {
  const fallbackBase = timestamp(notification.updatedAt, timestamp(notification.createdAt, Date.now()))
  const fallbackDuration =
    notification.state === 'pending' ? PENDING_NOTIFICATION_MS : RESOLVED_NOTIFICATION_MS
  return timestamp(notification.expiresAt, fallbackBase + fallbackDuration)
}

const transactionStatusLabel = (status?: string) => {
  switch (status) {
    case 'submitted':
      return 'Submitted'
    case 'confirming':
      return 'Confirming'
    case 'succeeded':
      return 'Confirmed'
    case 'reverted':
      return 'Reverted'
    default:
      return 'Submitted'
  }
}

const requestStatusFromActivity = (status?: string) => {
  switch (status) {
    case 'submitted':
      return 'verifying'
    case 'confirming':
      return 'confirming'
    case 'succeeded':
      return 'confirmed'
    case 'reverted':
      return 'error'
    default:
      return 'verifying'
  }
}

const activityGlyphState = (status?: string) => {
  if (status === 'succeeded') return 'completed'
  if (status === 'reverted') return 'failed'
  return 'pending'
}

const notificationLabel = (state?: string) => {
  if (state === 'completed') return 'Confirmed'
  if (state === 'failed') return 'Failed'
  return 'Pending'
}

const shortHash = (hash?: string) => {
  if (!hash) return ''
  return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`
}

const notificationMetadata = (notification: any, label: string) => {
  const detail = String(notification.detail || '').trim()
  if (detail && detail.toLowerCase() !== label.toLowerCase()) return detail

  return shortHash(notification.target?.hash || notification.metadata?.hash)
}

const notificationTimestamp = (notification: any) => {
  const shownAt = timestamp(notification.createdAt, timestamp(notification.updatedAt, 0))
  if (!shownAt) return ''

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  }).format(new Date(shownAt))
}

const StatusNotifications = ({
  notifications,
  renderChainIcon,
  onDismiss,
  onExpire,
  onOpen
}: {
  notifications: Record<string, any>
  renderChainIcon: (notification: any) => React.ReactNode
  onDismiss: (id: string) => void
  onExpire: (id: string) => void
  onOpen: (notification: any) => void
}) => {
  const entries = Object.values(notifications || {})

  React.useEffect(() => {
    const timers = entries.map((notification: any) => {
      const expiresAt = notificationExpiresAt(notification)
      const wait = Math.max(0, expiresAt - Date.now())

      return setTimeout(() => onExpire(notification.id), wait)
    })

    return () => timers.forEach((timer) => clearTimeout(timer))
  }, [notifications, onExpire])

  const now = Date.now()
  const visible = entries
    .filter((notification: any) => notification?.id && !notification.hidden)
    .filter((notification: any) => notificationExpiresAt(notification) > now)
    .sort(
      (a: any, b: any) =>
        timestamp(b.createdAt, timestamp(b.updatedAt, 0)) - timestamp(a.createdAt, timestamp(a.updatedAt, 0))
    )
    .slice(0, 3)

  if (!visible.length) return null

  return (
    <div aria-label='Status notifications' className='t2StatusNotifications'>
      {visible.map((notification: any) => {
        const state = notification.state || 'pending'
        const label = notificationLabel(state)
        const metadata = notificationMetadata(notification, label)
        const shownAt = notificationTimestamp(notification)

        return (
          <div
            key={notification.id}
            aria-label={`${label} ${notification.title || ''}`}
            className={`t2StatusNotification t2StatusNotification-${state}`}
            onClick={() => onOpen(notification)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onOpen(notification)
              }
            }}
            role='button'
            tabIndex={0}
          >
            <StatusGlyph
              state={state === 'completed' ? 'completed' : state === 'failed' ? 'failed' : 'pending'}
            />
            <div className='t2StatusNotificationChain'>{renderChainIcon(notification)}</div>
            <div className='t2StatusNotificationCopy'>
              <div className='t2StatusNotificationTopline'>
                <span>{label}</span>
                <span>{notification.title}</span>
              </div>
              {metadata ? <div className='t2StatusNotificationDetail'>{metadata}</div> : null}
            </div>
            {shownAt ? <div className='t2StatusNotificationTimestamp'>{shownAt}</div> : null}
            <div
              aria-label='Dismiss notification'
              className='t2StatusNotificationDismiss'
              onClick={(e) => {
                e.stopPropagation()
                onDismiss(notification.id)
              }}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onDismiss(notification.id)
                }
              }}
              role='button'
              tabIndex={0}
            >
              {svg.x(9)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const AddressQRCode = ({ address }: { address: string }) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)

  React.useEffect(() => {
    if (!canvasRef.current || !address) return

    QRCode.toCanvas(canvasRef.current, address, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 156,
      color: {
        dark: resolveSystemColor('qr-foreground'),
        light: resolveSystemColor('qr-background')
      }
    }).catch((err) => console.error('Unable to render QR code', err))
  }, [address])

  return <canvas aria-label='Account address QR code' className='t2ReceiveQrCanvas' ref={canvasRef} />
}

const AccountRenameInput = ({
  ariaLabel,
  initialName,
  onCancel,
  onCommit
}: {
  ariaLabel: string
  initialName: string
  onCancel: () => void
  onCommit: (name: string) => void
}) => {
  const [draft, setDraft] = React.useState(initialName)
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const commit = () => {
    const name = draft.trim()
    if (name) {
      onCommit(name)
    } else {
      onCancel()
    }
  }

  return (
    <div className='t2AccountRenameInput'>
      <input
        aria-label={ariaLabel}
        ref={inputRef}
        spellCheck='false'
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          }
        }}
      />
      <div
        aria-label='Cancel rename'
        className='t2AccountRenameCancel'
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation()
          onCancel()
        }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onCancel()
          }
        }}
        role='button'
        tabIndex={0}
      >
        {svg.x(12)}
      </div>
    </div>
  )
}

const shortcutKeyDisplay: Record<string, string> = {
  Slash: '/',
  Comma: ',',
  Period: '.',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Backquote: '`',
  Minus: '-',
  Equal: '='
}

// Browser extension links hidden until replacement store URLs exist:
// const chromeExtensionUrl =
//   'https://chrome.google.com/webstore/detail/frame-alpha/ldcoohedfbjoobcadoglnnmmfbdlmmhf'
// const firefoxExtensionUrl = 'https://addons.mozilla.org/en-US/firefox/addon/newframe-extension'

// Social/support links hidden until replacement channels exist:
// const feedbackUrl = 'https://feedback.newframe.sh'
// const discordUrl = 'https://discord.gg/UH7NGqY'

class Home extends React.Component<any, any> {
  declare store: Store
  refreshTimer: any
  inputLatticeTimeout: any
  inputPortfolioApiKeyTimeout: any
  instanceIdCopiedTimeout: any
  seedPhraseCopiedTimeout: any
  accountFeedbackTimeout: any
  accountSearchTimeout: any
  homeCommandObserver: any
  lastHomeCommandId = 0
  accountSearchInput: HTMLInputElement | null = null
  orderCancelPending = ''
  hydratingChainIcons = new Set<number>()
  selectBalanceSummaries = createBalanceSummarySelector()

  constructor(props: any, context?: any) {
    super(props, context)
    const latticeEndpoint = this.store('main.latticeSettings.endpointCustom')
    const latticeEndpointMode = this.store('main.latticeSettings.endpointMode')
    const portfolioApiKey = this.store('main.portfolioApiKey')
    this.state = {
      tab: 'positions',
      overlay: null,
      menuOpen: false,
      accountsOpen: false,
      dustExpanded: false,
      secondaryPositionsExpanded: false,
      secondaryPositionRowsVisible: INITIAL_SECONDARY_POSITION_ROWS,
      dustRowsVisible: INITIAL_DUST_ROWS,
      query: '',
      netQuery: '',
      network: 0, // 0 = all networks
      kebab: 0,
      networkRpcDrafts: {},
      accountQuery: '',
      accountMenu: '',
      accountRenaming: '',
      accountRemoving: '',
      accountCopied: '',
      accountExported: '',
      accountExporting: '',
      accountExportPassword: '',
      accountExportSecret: '',
      accountExportRevealed: false,
      accountExportError: '',
      accountExportLoading: false,
      accountExportCopied: false,
      draggingAccount: '',
      dragOverAccount: '',
      addingAccount: false,
      addAccountCategory: '',
      addAccountType: '',
      addAccountInput: '',
      addAccountName: '',
      addAccountPassword: '',
      addAccountKeystore: null,
      addAccountKeystorePassword: '',
      addAccountSelectedSigner: '',
      storedSeedExpanded: {},
      addAccountError: '',
      addAccountStatus: '',
      addGeneratedPhrase: '',
      addGeneratedPhraseBackedUp: false,
      addGeneratedPhraseCopied: false,
      addVaultState: null,
      addHardwarePin: '',
      addHardwarePhrase: '',
      addHardwarePairCode: '',
      pendingChainRequest: null,
      assetDetails: null,
      activityDetails: '',
      orderDetails: '',
      orderCancelError: null,
      receiveAccount: '',
      latticeEndpoint,
      latticeEndpointMode,
      portfolioApiKey,
      portfolioApiKeyRequired: false,
      resetConfirm: false,
      instanceIdCopied: false,
      biometricsBusy: false,
      biometricsError: ''
    }
  }

  override componentWillUnmount() {
    clearTimeout(this.refreshTimer)
    clearTimeout(this.inputLatticeTimeout)
    clearTimeout(this.inputPortfolioApiKeyTimeout)
    clearTimeout(this.instanceIdCopiedTimeout)
    clearTimeout(this.seedPhraseCopiedTimeout)
    clearTimeout(this.accountFeedbackTimeout)
    clearTimeout(this.accountSearchTimeout)
    if (this.homeCommandObserver) this.homeCommandObserver.remove()
  }

  override componentDidMount() {
    const current = this.store('selected.current')
    const open = this.store('selected.open')
    if (!current || !open) {
      const accounts = this.store('main.accounts') || {}
      const id = current || Object.keys(accounts)[0]
      if (id) link.rpc('setSigner', id, () => {})
    }

    this.homeCommandObserver = this.store.observer(() => {
      const command = this.store('tray.homeCommand')
      if (!command || command.id === this.lastHomeCommandId) return

      this.lastHomeCommandId = command.id
      this.applyHomeCommand(command)
      link.send('tray:action', 'clearHomeCommand', command.id)
    }, 'tray:homeCommand')

    this.hydrateVisibleChainIcons()
  }

  override componentDidUpdate(prevProps: any, prevState: any) {
    if (prevState.network !== this.state.network || prevState.overlay !== this.state.overlay) {
      this.hydrateVisibleChainIcons()
    }
  }

  applyHomeCommand(command: any) {
    const { view, data = {} } = command

    if (view === 'settings') {
      return this.setState({
        overlay: 'settings',
        menuOpen: false,
        accountsOpen: false,
        latticeEndpoint: this.store('main.latticeSettings.endpointCustom'),
        latticeEndpointMode: this.store('main.latticeSettings.endpointMode'),
        portfolioApiKey: this.store('main.portfolioApiKey'),
        portfolioApiKeyRequired: false
      })
    }

    if (view === 'networks') {
      if (data.newChain && Object.keys(data.newChain).length > 0) {
        return this.setState({
          overlay: 'addChain',
          menuOpen: false,
          accountsOpen: false,
          pendingChainRequest: { chain: data.newChain }
        })
      }

      return this.setState({
        overlay: 'networks',
        menuOpen: false,
        accountsOpen: false,
        netQuery: '',
        kebab: 0,
        ...(data.selectedChain
          ? { network: parseInt(data.selectedChain.id || data.selectedChain.chainId) }
          : {})
      })
    }

    if (view === 'addChain') {
      return this.setState({
        overlay: 'addChain',
        menuOpen: false,
        accountsOpen: false,
        pendingChainRequest: data
      })
    }

    if (view === 'accounts') {
      if (data.showAddAccounts) {
        return this.openInlineAdd(data.newAccountType, data.selectedSigner)
      }

      return this.setState({
        overlay: null,
        menuOpen: false,
        accountsOpen: true,
        accountMenu: ''
      })
    }
  }

  getChains() {
    const networks = this.store('main.networks.ethereum') || {}
    return Object.keys(networks).map((id) => ({ chainId: parseInt(id), ...networks[id] }))
  }

  showTestnets() {
    return !!this.store('main.showTestnets')
  }

  shouldShowChain(chain: any) {
    return !!chain && (!chain.isTestnet || this.showTestnets())
  }

  getVisibleChains() {
    return this.getChains().filter((chain) => this.shouldShowChain(chain))
  }

  rpc<T>(method: string, ...args: any[]) {
    return new Promise<T>((resolve, reject) => {
      link.rpc(method, ...args, (err: any, value: T) => {
        if (err) return reject(new Error(err.message || String(err)))
        resolve(value)
      })
    })
  }

  async setBiometricUnlock(enabled: boolean) {
    if (this.state.biometricsBusy) return

    this.setState({ biometricsBusy: true, biometricsError: '' })

    try {
      if (!enabled) {
        await this.rpc('disableBiometrics')
        return
      }

      let webAuthnError: Error | null = null
      if (await isWebAuthnBiometricsSupported()) {
        try {
          const enrollment = await createWebAuthnBiometricCredential()
          await this.rpc('enableBiometrics', { method: 'webauthn', ...enrollment })
          return
        } catch (err: any) {
          if (isBiometricUserCanceledError(err)) throw err
          webAuthnError = err
        }
      }

      const biometrics = await this.rpc<{ nativeAvailable: boolean }>('biometricsState')
      if (!biometrics.nativeAvailable) {
        throw webAuthnError || new Error('Biometrics are not available on this device')
      }

      await this.rpc('enableBiometrics', { method: 'native' })
    } catch (err: any) {
      this.setState({
        biometricsError: isBiometricUserCanceledError(err) ? '' : err.message || String(err)
      })
    } finally {
      this.setState({ biometricsBusy: false })
    }
  }

  lockFrame() {
    link.rpc('lockApp', (err: any) => {
      if (err) {
        return this.setState({ biometricsError: err.message || String(err) })
      }

      this.setState({ overlay: null, menuOpen: false, biometricsError: '' })
    })
  }

  getNetworkPrimaryRpcValue(chain: any) {
    const drafts = this.state.networkRpcDrafts || {}
    const draft = drafts[chain.chainId]
    return draft !== undefined ? draft : chain.connection?.primary?.custom || ''
  }

  updateNetworkPrimaryRpc(chainId: number, value: string) {
    this.setState({
      networkRpcDrafts: {
        ...(this.state.networkRpcDrafts || {}),
        [chainId]: value.replace(/\s+/g, '')
      }
    })
  }

  saveNetworkPrimaryRpc(chainId: number) {
    const value = String(
      this.state.networkRpcDrafts?.[chainId] ??
        this.store('main.networks.ethereum', chainId, 'connection.primary.custom') ??
        ''
    ).trim()
    if (!value) return

    link.send('tray:action', 'setPrimaryCustom', 'ethereum', chainId, value)
    link.send('tray:action', 'selectPrimary', 'ethereum', chainId, 'custom')
    link.send('tray:action', 'toggleConnection', 'ethereum', chainId, 'primary', true)
  }

  setShowTestnets(value: boolean) {
    link.send('tray:action', 'setShowTestnets', value)

    const selectedChain = this.store('main.networks.ethereum', this.state.network)
    if (!value && selectedChain?.isTestnet) this.setState({ network: 0 })
  }

  chainColor(chainId: number) {
    const primaryColor = this.store('main.networksMeta.ethereum', chainId, 'primaryColor')
    return chainColorCssVariable(primaryColor)
  }

  // chain icon: cached or remote icon from networksMeta, eth glyph for ethereum
  // chains, colored dot as the last resort (same fallback chain as RingIcon)
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
        className='t2ChainIconDot'
        style={{ background: this.chainColor(chainId), width: `${dotSize}px`, height: `${dotSize}px` }}
      />
    )
  }

  chainEnabled(chainId: number) {
    const chain = this.store('main.networks.ethereum', chainId)
    return !!(chain && chain.on)
  }

  chainIconNeedsHydration(chainId: number) {
    const icon = this.store('main.networksMeta.ethereum', chainId, 'icon')
    return !icon || !isCachedImageReference(icon)
  }

  hydrateChainIcon(chainId: number) {
    if (!chainId || this.hydratingChainIcons.has(chainId) || !this.chainIconNeedsHydration(chainId)) return

    this.hydratingChainIcons.add(chainId)
    link.invoke('tray:hydrateChainIcon', chainId).finally(() => {
      this.hydratingChainIcons.delete(chainId)
    })
  }

  hydrateVisibleChainIcons() {
    const chains = this.getVisibleChains()
    const chainIds =
      this.state.overlay === 'networks'
        ? chains.map((chain) => chain.chainId)
        : this.state.network
          ? [this.state.network]
          : chains.filter((chain) => chain.on).map((chain) => chain.chainId)

    chainIds.forEach((chainId) => this.hydrateChainIcon(chainId))
  }

  inNetworkFilter(chainId: number) {
    const chain = this.store('main.networks.ethereum', chainId)
    if (!this.shouldShowChain(chain)) return false
    return this.state.network === 0 || this.state.network === chainId
  }

  getActivityRecords(account: any) {
    const activity = this.store('main.activity') || {}
    const address = (account?.address || '').toLowerCase()

    return Object.values(activity)
      .filter((record: any) => {
        const recordAddress = (record.account || record.address || '').toLowerCase()
        const chainId = Number(record.chainId)
        return recordAddress === address && this.inNetworkFilter(chainId)
      })
      .sort(
        (a: any, b: any) =>
          timestamp(b.submittedAt, timestamp(b.updatedAt, 0)) -
          timestamp(a.submittedAt, timestamp(a.updatedAt, 0))
      )
  }

  normalizeOrderSide(side = ''): FlashTradeSide | '' {
    const normalized = String(side).toLowerCase()
    return normalized === 'buy' || normalized === 'sell' ? normalized : ''
  }

  getOrderRecords(account: any) {
    const orders = this.store('main.orders') || {}
    const address = (account?.address || '').toLowerCase()

    return Object.entries(orders)
      .map(([id, order]: [string, any]) => ({ ...order, orderId: order.orderId || id }))
      .filter((order: any) => {
        const orderAddress = (order.accountAddress || order.account || order.address || '').toLowerCase()
        const chainId = Number(order.chainId)
        return orderAddress === address && this.inNetworkFilter(chainId)
      })
      .sort((a: any, b: any) => {
        const openSort = Number(!this.isOpenOrder(a)) - Number(!this.isOpenOrder(b))
        if (openSort !== 0) return openSort

        return (
          timestamp(b.createdAt, timestamp(b.updatedAt, 0)) -
          timestamp(a.createdAt, timestamp(a.updatedAt, 0))
        )
      })
  }

  orderStatus(order: any) {
    return String(order.status || order.rawStatus || '')
      .trim()
      .toLowerCase()
  }

  isOpenOrder(order: any) {
    if (order.open === true) return true
    if (order.open === false) return false

    const status = this.orderStatus(order)
    if (['open', 'pending', 'submitted', 'accepted', 'active', 'working', 'created'].includes(status)) {
      return true
    }

    if (order.terminalAt) return false

    return ![
      'filled',
      'complete',
      'completed',
      'cancelled',
      'canceled',
      'failed',
      'rejected',
      'expired'
    ].includes(status)
  }

  titleize(value = '') {
    return String(value || '')
      .replace(/[-_]+/g, ' ')
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  }

  orderStatusLabel(order: any) {
    return this.titleize(order.status || order.rawStatus || 'Unknown')
  }

  orderTypeLabel(order: any) {
    return this.titleize(order.orderType || 'Order')
  }

  orderSideLabel(order: any) {
    const side = this.normalizeOrderSide(order.side)
    return side ? getDirectionLabel(side) : this.titleize(order.side || 'Side')
  }

  orderAssetSymbol(asset: any) {
    return String(asset?.symbol || asset?.assetSymbol || asset?.ticker || asset?.id || 'Asset').toUpperCase()
  }

  orderAssetName(asset: any) {
    return String(asset?.name || this.orderAssetSymbol(asset))
  }

  formatOrderAmount(value: any) {
    if (value === undefined || value === null || value === '') return ''

    const numeric = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''))
    if (Number.isFinite(numeric)) {
      return numeric.toLocaleString(undefined, {
        maximumFractionDigits: numeric >= 1 ? 6 : 8
      })
    }

    return String(value)
  }

  orderSize(order: any) {
    const size = this.formatOrderAmount(order.qty)
    if (!size) return ''

    return `${size} ${this.orderAssetSymbol(order.targetAsset)}`
  }

  orderDate(value: any) {
    const time = timestamp(value, 0)
    if (!time) return ''

    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(time))
  }

  orderDateTime(value: any) {
    const time = timestamp(value, 0)
    if (!time) return ''

    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(time))
  }

  orderPairIntent(order: any) {
    const side = this.normalizeOrderSide(order.side)
    const targetSymbol = this.orderAssetSymbol(order.targetAsset)
    const contraSymbol = this.orderAssetSymbol(order.contraAsset)

    if (!side) return `${targetSymbol} / ${contraSymbol}`

    return formatPairIntent({
      side,
      targetAsset: { ...(order.targetAsset || {}), symbol: targetSymbol } as any,
      contraAsset: { ...(order.contraAsset || {}), symbol: contraSymbol } as any
    })
  }

  orderJson(value: any) {
    if (value === undefined || value === null) return ''

    try {
      return JSON.stringify(value, null, 2)
    } catch (err) {
      return String(value)
    }
  }

  orderChainIdNumber(chainId: any) {
    const value =
      typeof chainId === 'string'
        ? Number.parseInt(chainId, chainId.toLowerCase().startsWith('0x') ? 16 : 10)
        : Number(chainId)

    if (!Number.isInteger(value) || value <= 0) throw new Error('Invalid Flash order chain.')

    return value
  }

  orderChainIdHex(chainId: any) {
    return `0x${this.orderChainIdNumber(chainId).toString(16)}`
  }

  orderErrorMessage(error: any, fallback: string) {
    if (!error) return fallback
    if (typeof error === 'string') return error
    if (error.message) return error.message
    if (error.error?.message) return error.error.message

    return fallback
  }

  providerResponseError(response: any, fallback: string) {
    return response?.error ? this.orderErrorMessage(response.error, fallback) : ''
  }

  orderCancelErrorMessage(orderId: string) {
    const error = this.state.orderCancelError
    return error?.orderId === orderId ? error.message : ''
  }

  copyActivityValue(value?: string) {
    if (!value) return
    link.send('tray:clipboardData', value)
  }

  activityRequestLike(activity: any) {
    return {
      ...activity,
      type: 'transaction',
      data: activity.data || {},
      payload: activity.payload,
      decodedData: activity.decodedData,
      tokenData: activity.tokenData,
      simulation: activity.simulation,
      recognizedActions: activity.recognizedActions || [],
      classification: activity.classification,
      recipient: activity.recipient,
      status: requestStatusFromActivity(activity.status),
      notice: transactionStatusLabel(activity.status),
      tx: {
        hash: activity.hash,
        confirmations: activity.confirmations || 0,
        receipt: activity.receipt
      }
    }
  }

  getBalances(address: string) {
    const rawBalances = this.store('main.balances', address) || []
    const rates = this.store('main.rates')
    const networks = this.store('main.networks.ethereum')
    const networksMeta = this.store('main.networksMeta.ethereum')
    const showTestnets = this.showTestnets()

    return this.selectBalanceSummaries({
      rawBalances,
      rates,
      networks,
      networksMeta,
      includeChain: (chain) => {
        return (!chain.isTestnet || showTestnets) && !!chain.on
      },
      cacheKey: `${address}:${showTestnets ? 'testnets' : 'mainnets'}`
    })
  }

  accountNavValue(account: any) {
    if (!account || !account.address) return '---'
    const rawBalances = this.store('main.balances', account.address)
    if (!Array.isArray(rawBalances) || rawBalances.length === 0) return '---'

    const total = this.getBalances(account.address).reduce(
      (sum: number, balance: any) => sum + balance.totalValue,
      0
    )
    return `$${formatUsdRate(total, 2)}`
  }

  openSend(asset?: any) {
    if (asset && !hasPositiveBalance(asset)) return
    if (!asset && !this.selectedWalletHasAssets()) return

    link.send('*:addFrame', {
      id: DAPP_LAUNCHER_FRAME_ID,
      route: buildDappLauncherRoute('send', toCanonicalAssetId(asset))
    })
  }

  firstTradeAsset(balances: any[] = []) {
    return balances.find((balance) => {
      const chainId = Number(balance?.chainId)

      return (
        hasPositiveBalance(balance) &&
        Number.isInteger(chainId) &&
        this.chainEnabled(chainId) &&
        isFlashChainSupported(chainId, this.store('main.runtime') || {})
      )
    })
  }

  tradeChainId(asset?: any, balances: any[] = []) {
    const assetChainId = Number(asset?.chainId)
    if (Number.isInteger(assetChainId) && assetChainId > 0) return assetChainId

    const tradeAssetChainId = Number(this.firstTradeAsset(balances)?.chainId)
    if (Number.isInteger(tradeAssetChainId) && tradeAssetChainId > 0) return tradeAssetChainId

    const selectedChainId = Number(this.state.network)
    if (Number.isInteger(selectedChainId) && selectedChainId > 0) return selectedChainId

    return getFlashDefaultChainId(this.store('main.runtime') || {})
  }

  canOpenTrade(asset?: any, balances: any[] = []) {
    if (!asset && !this.firstTradeAsset(balances)) return false

    const chainId = this.tradeChainId(asset, balances)
    return this.chainEnabled(chainId) && isFlashChainSupported(chainId, this.store('main.runtime') || {})
  }

  tradeTitle(asset?: any, balances: any[] = []) {
    return this.canOpenTrade(asset, balances) ? 'Trade' : TRADE_DISABLED_CHAIN_LABEL
  }

  openTrade(asset?: any, balances: any[] = []) {
    const selectedAsset = asset || this.firstTradeAsset(balances)
    if (!this.canOpenTrade(selectedAsset, balances)) return
    const chainId = this.tradeChainId(selectedAsset, balances)

    link.send('*:addFrame', {
      id: DAPP_LAUNCHER_FRAME_ID,
      route: buildDappLauncherRoute('trade', toCanonicalAssetId(selectedAsset), chainId)
    })
  }

  openActivityTarget(target: any) {
    const activityId = target?.activityId || target?.hash || ''
    if (!activityId) return

    const current = this.store('selected.current')
    const account = target.account || ''

    if (account && account !== current) {
      link.rpc('setSigner', account, () => {})
    }

    this.setState({
      tab: 'activity',
      query: '',
      overlay: null,
      accountsOpen: false,
      orderDetails: '',
      activityDetails: activityId
    })
  }

  openActivity(activity: any) {
    if (!activity?.id) return

    this.setState({
      tab: 'activity',
      query: '',
      overlay: null,
      accountsOpen: false,
      orderDetails: '',
      activityDetails: activity.id
    })
  }

  openOrder(order: any) {
    if (!order?.orderId) return

    this.setState({
      tab: 'orders',
      query: '',
      overlay: null,
      accountsOpen: false,
      activityDetails: '',
      orderDetails: order.orderId
    })
  }

  signOrderCancel(order: any, orderId: string) {
    const accountAddress = order.accountAddress || order.account || order.address || ''

    if (!isAddress(accountAddress)) throw new Error('Order is missing an account address.')

    const chainIdNumber = this.orderChainIdNumber(order.chainId)
    const chainId = this.orderChainIdHex(chainIdNumber)
    const message = `Definitive Flash v1 — Cancel Order\nOrder: ${orderId}`

    link.send('tray:action', 'initOrigin', FRAME_ORIGIN_ID, {
      name: 'newframe-internal',
      chain: { id: chainIdNumber, type: 'ethereum' }
    })

    const payload = {
      id: Date.now(),
      jsonrpc: '2.0',
      method: 'personal_sign',
      chainId,
      params: [message, accountAddress],
      _origin: FRAME_ORIGIN_ID
    }

    return new Promise<string>((resolve, reject) => {
      link.rpc('providerSend', payload, (response: any) => {
        const error = this.providerResponseError(response, 'Cancel signature failed.')
        const signature = response?.result

        if (error) return reject(new Error(error))
        if (!signature) return reject(new Error('Cancel signature was not returned.'))

        resolve(signature)
      })
    })
  }

  async cancelOrder(order: any) {
    const orderId = order?.orderId

    if (!orderId || this.orderCancelPending) return

    this.orderCancelPending = orderId

    try {
      const signature = await this.signOrderCancel(order, orderId)
      await this.rpc('flashCancelOrder', { orderId, signature })

      if (this.orderCancelPending === orderId && this.state.orderCancelError?.orderId === orderId) {
        this.setState({ orderCancelError: null })
      }
    } catch (error) {
      if (this.orderCancelPending === orderId) {
        this.setState({
          orderCancelError: {
            orderId,
            message: this.orderErrorMessage(error, 'Cancel failed.')
          }
        })
      }
    } finally {
      if (this.orderCancelPending === orderId) this.orderCancelPending = ''
    }
  }

  selectedWalletHasAssets() {
    const current = this.store('selected.current')
    const accounts = this.store('main.accounts') || {}
    const account = accounts[current]

    return !!account && this.getBalances(account.address).length > 0
  }

  accountDisplayName(account: any) {
    if (!account) return ''
    const showLocal = this.store('main.showLocalNameWithENS')
    return account.ensName && !showLocal ? account.ensName : account.name
  }

  shortAddress(address = '') {
    return address ? `${address.substring(0, 5)}…${address.substring(address.length - 4)}` : ''
  }

  pendingRequestCount(account: any) {
    const requests = (account && account.requests) || {}
    return Object.keys(requests).filter((id) => requests[id].mode === 'normal').length
  }

  accountType(account: any) {
    return (account?.lastSignerType || '').toString()
  }

  isWatchOnlyAccount(account: any) {
    return this.accountType(account).toLowerCase() === 'address'
  }

  isHotAccount(account: any) {
    return ['ring', 'seed'].includes(this.accountType(account).toLowerCase())
  }

  accountIcon(account: any, size = 16) {
    return this.isWatchOnlyAccount(account) ? svg.eye(size) : this.signerIcon(account.lastSignerType, size)
  }

  accountTypeLabel(account: any) {
    const type = this.accountType(account)
    return signerTypeLabels[type] || signerTypeLabels[type.toLowerCase()] || type || 'Account'
  }

  seedPhraseLabel(index: number) {
    return `Seed Phrase ${index + 1}`
  }

  seedWallets(signer: any, accounts: Record<string, any>) {
    const addresses = Array.isArray(signer?.addresses) ? signer.addresses : []

    return addresses.map((address: string, index: number) => {
      const id = address.toLowerCase()
      return { account: accounts[id], address, id, index }
    })
  }

  walletDisplayName(wallet: { account?: any; index: number }) {
    return wallet.account ? this.accountDisplayName(wallet.account) : `Wallet ${wallet.index + 1}`
  }

  expandStoredSeed(signerId: string) {
    this.setState({
      storedSeedExpanded: {
        ...(this.state.storedSeedExpanded || {}),
        [signerId]: true
      }
    })
  }

  orderedAccountIds(accounts: Record<string, any>) {
    const createdOrder = Object.keys(accounts).sort((a, b) => {
      if (accounts[a].created > accounts[b].created) return 1
      if (accounts[a].created < accounts[b].created) return -1
      return 0
    })
    const accountOrder = (this.store('main.accountOrder') || []) as string[]
    const ordered = accountOrder.filter((id) => accounts[id])

    createdOrder.forEach((id) => {
      if (!ordered.includes(id)) ordered.push(id)
    })

    return ordered
  }

  updateAccountSearch(value: string) {
    clearTimeout(this.accountSearchTimeout)
    this.accountSearchTimeout = setTimeout(() => this.setState({ accountQuery: value }), 80)
  }

  clearAccountSearch() {
    clearTimeout(this.accountSearchTimeout)
    if (this.accountSearchInput) this.accountSearchInput.value = ''
    this.setState({ accountQuery: '' })
  }

  accountMatchesQuery(account: any, query: string) {
    if (!query) return true
    const normalizedQuery = query.toLowerCase()
    const searchText = [
      this.accountDisplayName(account),
      account.address,
      this.shortAddress(account.address),
      this.accountTypeLabel(account)
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return normalizedQuery.split(/\s+/).every((part) => searchText.includes(part))
  }

  reorderAccount(fromId: string, toId: string) {
    if (!fromId || !toId || fromId === toId) return
    link.send('tray:action', 'reorderAccounts', fromId, toId)
  }

  startAccountDrag(e: React.DragEvent, accountId: string) {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', accountId)
    this.setState({ draggingAccount: accountId, dragOverAccount: '' })
  }

  dragAccountOver(e: React.DragEvent, accountId: string) {
    if (!this.state.draggingAccount || this.state.draggingAccount === accountId) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    if (this.state.dragOverAccount !== accountId) this.setState({ dragOverAccount: accountId })
  }

  dropAccount(e: React.DragEvent, accountId: string) {
    e.preventDefault()
    e.stopPropagation()

    const dragged = e.dataTransfer.getData('text/plain') || this.state.draggingAccount
    this.reorderAccount(dragged, accountId)
    this.setState({ draggingAccount: '', dragOverAccount: '' })
  }

  endAccountDrag() {
    this.setState({ draggingAccount: '', dragOverAccount: '' })
  }

  flashAccountFeedback(key: 'accountCopied' | 'accountExported', value: string) {
    clearTimeout(this.accountFeedbackTimeout)
    this.setState({ [key]: value })
    this.accountFeedbackTimeout = setTimeout(() => this.setState({ [key]: '' }), 1800)
  }

  copyAccountAddress(account: any) {
    if (!account?.address) return
    link.send('tray:clipboardData', account.address)
    this.flashAccountFeedback('accountCopied', account.id)
  }

  openReceiveAccount(account: any) {
    if (!account?.id) return
    this.setState({
      overlay: 'receive',
      receiveAccount: account.id,
      accountMenu: '',
      accountsOpen: false
    })
  }

  startRenameAccount(account: any) {
    this.setState({
      accountRenaming: account.id,
      accountMenu: '',
      accountRemoving: ''
    })
  }

  saveRenameAccount(accountId: string, nextName: string) {
    const name = (nextName || '').trim()
    if (name) link.send('tray:renameAccount', accountId, name)
    this.setState({ accountRenaming: '' })
  }

  seedSignerForAccount(account?: Account | null): Signer | null {
    if (this.accountType(account).toLowerCase() !== 'seed' || !account?.signer) return null

    const signer = this.store('main.signers', account.signer) as Signer | undefined
    return signer?.type === 'seed' ? signer : null
  }

  isLastAccountForSeedPhrase(account: Account, accounts: Record<string, Account>) {
    const signer = this.seedSignerForAccount(account)
    if (!signer) return false

    return !Object.values(accounts).some((otherAccount) => {
      return otherAccount.id !== account.id && otherAccount.signer === signer.id
    })
  }

  removeAccount(accountId: string, options: { removeSeedPhrase?: boolean } = {}) {
    const accounts = (this.store('main.accounts') || {}) as Record<string, Account>
    const account = accounts[accountId]
    const seedSigner = options.removeSeedPhrase ? this.seedSignerForAccount(account) : null

    link.rpc('removeAccount', accountId, {}, () => {
      if (seedSigner) link.send('dash:removeSigner', seedSigner.id)
    })
    this.setState({ accountRemoving: '', accountMenu: '' })
  }

  openPrivateKeyExport(account: any) {
    if (!this.isHotAccount(account)) return

    this.setState({
      accountMenu: '',
      accountRemoving: '',
      accountExporting: account.id,
      accountExportPassword: '',
      accountExportSecret: '',
      accountExportRevealed: false,
      accountExportError: '',
      accountExportLoading: false,
      accountExportCopied: false
    })
  }

  closePrivateKeyExport() {
    this.setState({
      accountExporting: '',
      accountExportPassword: '',
      accountExportSecret: '',
      accountExportRevealed: false,
      accountExportError: '',
      accountExportLoading: false,
      accountExportCopied: false
    })
  }

  closeAccountsPanel() {
    this.setState({
      accountsOpen: false,
      accountMenu: '',
      accountRenaming: '',
      accountRemoving: '',
      accountExporting: '',
      accountExportPassword: '',
      accountExportSecret: '',
      accountExportRevealed: false,
      accountExportError: '',
      accountExportLoading: false,
      accountExportCopied: false,
      addingAccount: false
    })
  }

  toggleAccountsPanel() {
    if (this.state.accountsOpen) return this.closeAccountsPanel()
    this.setState({ accountsOpen: true, menuOpen: false })
  }

  unlockPrivateKeyExport(account: any) {
    const password = this.state.accountExportPassword
    if (!account?.address || this.state.accountExportLoading) return
    if (!password) return this.setState({ accountExportError: 'Password required' })

    this.setState({ accountExportLoading: true, accountExportError: '', accountExportCopied: false })

    link.rpc('exportAccountPrivateKey', account.address, password, (err: any, secret: any) => {
      if (err) {
        return this.setState({
          accountExportLoading: false,
          accountExportError: err.message || String(err),
          accountExportSecret: '',
          accountExportRevealed: false
        })
      }

      this.setState({
        accountExportLoading: false,
        accountExportPassword: '',
        accountExportSecret: secret?.value || '',
        accountExportRevealed: false,
        accountExportError: ''
      })
    })
  }

  copyExportedPrivateKey() {
    if (!this.state.accountExportSecret) return
    link.send('tray:clipboardData', this.state.accountExportSecret)
    this.setState({ accountExportCopied: true })
  }

  resetInlineAdd() {
    this.setState({
      addingAccount: false,
      addAccountCategory: '',
      addAccountType: '',
      addAccountInput: '',
      addAccountName: '',
      addAccountPassword: '',
      addAccountKeystore: null,
      addAccountKeystorePassword: '',
      addAccountSelectedSigner: '',
      addAccountError: '',
      addAccountStatus: '',
      addGeneratedPhrase: '',
      addGeneratedPhraseBackedUp: false,
      addGeneratedPhraseCopied: false,
      addVaultState: null,
      addHardwarePin: '',
      addHardwarePhrase: '',
      addHardwarePairCode: ''
    })
  }

  normalizeAddAccountType(type = '') {
    const typeMap: Record<string, string> = {
      keyring: 'privateKey',
      nonsigning: 'watch'
    }

    return typeMap[type] || type
  }

  addAccountCategoryForType(type = '') {
    if (['seed', 'privateKey', 'keystore'].includes(type)) return 'import'
    if (['ledger', 'trezor', 'lattice'].includes(type)) return 'hardware'
    if (type === 'watch') return 'watch'
    return ''
  }

  openInlineAdd(type = '', selectedSigner = '') {
    const addAccountType = this.normalizeAddAccountType(type)
    const addAccountCategory = this.addAccountCategoryForType(addAccountType)

    this.setState(
      {
        overlay: null,
        menuOpen: false,
        accountsOpen: true,
        addingAccount: true,
        accountMenu: '',
        addAccountCategory,
        addAccountType,
        addAccountInput: '',
        addAccountName: addAccountType === 'lattice' ? 'GridPlus' : '',
        addAccountPassword: '',
        addAccountKeystore: null,
        addAccountKeystorePassword: '',
        addAccountSelectedSigner: selectedSigner || '',
        addAccountError: '',
        addAccountStatus: '',
        addGeneratedPhrase: '',
        addGeneratedPhraseBackedUp: false,
        addGeneratedPhraseCopied: false,
        addHardwarePin: '',
        addHardwarePhrase: '',
        addHardwarePairCode: ''
      },
      () => this.refreshAddVaultState()
    )
  }

  startInlineAdd() {
    this.openInlineAdd()
  }

  refreshAddVaultState() {
    link.rpc('appLockState', (err: any, appLockState: any) => {
      this.setState({
        addVaultState: err
          ? { exists: false, unlocked: false }
          : { exists: appLockState.vaultExists, unlocked: !appLockState.locked }
      })
    })
  }

  backInlineAdd() {
    if (this.state.addAccountSelectedSigner) {
      return this.setState({ addAccountSelectedSigner: '', addAccountError: '', addAccountStatus: '' })
    }

    if (this.state.addAccountCategory) {
      return this.setState({
        addAccountCategory: '',
        addAccountType: '',
        addAccountInput: '',
        addAccountName: '',
        addAccountPassword: '',
        addAccountKeystore: null,
        addAccountKeystorePassword: '',
        addAccountError: '',
        addAccountStatus: '',
        addGeneratedPhrase: '',
        addGeneratedPhraseBackedUp: false,
        addGeneratedPhraseCopied: false,
        addHardwarePin: '',
        addHardwarePhrase: '',
        addHardwarePairCode: ''
      })
    }

    this.resetInlineAdd()
  }

  chooseInlineAddCategory(category: string) {
    const addAccountType = category === 'watch' ? 'watch' : category === 'createSeed' ? 'seed' : ''

    this.setState(
      {
        addAccountCategory: category,
        addAccountType,
        addAccountInput: '',
        addAccountName: '',
        addAccountPassword: '',
        addAccountKeystore: null,
        addAccountKeystorePassword: '',
        addAccountSelectedSigner: '',
        addAccountError: '',
        addAccountStatus: '',
        addGeneratedPhrase: '',
        addGeneratedPhraseBackedUp: false,
        addGeneratedPhraseCopied: false,
        addHardwarePin: '',
        addHardwarePhrase: '',
        addHardwarePairCode: ''
      },
      () => {
        if (category === 'createSeed') this.generateInlineSeedPhrase()
      }
    )
  }

  chooseInlineAddType(type: string) {
    this.setState({
      addAccountType: type,
      addAccountInput: '',
      addAccountName: '',
      addAccountPassword: '',
      addAccountKeystore: null,
      addAccountKeystorePassword: '',
      addAccountError: '',
      addAccountStatus: '',
      addGeneratedPhrase: '',
      addGeneratedPhraseBackedUp: false,
      addGeneratedPhraseCopied: false,
      addHardwarePin: '',
      addHardwarePhrase: '',
      addHardwarePairCode: ''
    })
  }

  resolveName(name: string) {
    return new Promise<string>((resolve, reject) => {
      link.rpc('resolveName', name, (err: any, resolvedAddress: string) => {
        if (err || !resolvedAddress) return reject(err || new Error('Could not resolve name'))
        resolve(resolvedAddress)
      })
    })
  }

  addErrorMessage(err: any) {
    return err?.message || String(err)
  }

  isHotInlineImport(type = this.state.addAccountType) {
    return ['privateKey', 'seed', 'keystore'].includes(type)
  }

  needsFramePassword() {
    return this.isHotInlineImport() && (!this.state.addVaultState || !this.state.addVaultState.unlocked)
  }

  framePasswordLabel() {
    return this.state.addVaultState && this.state.addVaultState.exists
      ? 'Newframe password'
      : 'Create Newframe password'
  }

  createAccountFromSigner(signer: any, name: string, defaultName = 'Hot Account') {
    const address = signer?.addresses?.[0]
    if (!address)
      return this.setState({ addAccountError: 'No account address was created', addAccountStatus: '' })

    link.rpc('createAccount', address, name || defaultName, { type: signer.type }, (createErr: any) => {
      if (createErr) {
        return this.setState({
          addAccountError: this.addErrorMessage(createErr),
          addAccountStatus: ''
        })
      }

      link.rpc('setSigner', address.toLowerCase(), () => {})
      this.resetInlineAdd()
    })
  }

  createStoredSeedAccount(signer: any, address: string) {
    const accounts = this.store('main.accounts') || {}
    const id = address.toLowerCase()

    if (accounts[id]) {
      link.rpc('setSigner', id, () => {})
      return this.resetInlineAdd()
    }

    this.setState({ addAccountError: '', addAccountStatus: 'Adding account' })

    link.rpc('createAccount', address, 'Hot Account', { type: signer.type }, (err: any) => {
      if (err) return this.setState({ addAccountError: this.addErrorMessage(err), addAccountStatus: '' })
      link.rpc('setSigner', id, () => {})
      this.resetInlineAdd()
    })
  }

  locateInlineKeystore() {
    this.setState({ addAccountError: '', addAccountStatus: 'Selecting JSON backup file' })

    link.rpc('locateKeystore', (err: any, keystore: any) => {
      if (err) {
        return this.setState({
          addAccountKeystore: null,
          addAccountError: this.addErrorMessage(err),
          addAccountStatus: ''
        })
      }

      this.setState({
        addAccountKeystore: keystore,
        addAccountError: '',
        addAccountStatus: 'JSON backup file selected'
      })
    })
  }

  selectHardwareSigner(signerId: string) {
    this.setState({
      addAccountSelectedSigner: signerId,
      addAccountError: '',
      addAccountStatus: '',
      addHardwarePin: '',
      addHardwarePhrase: '',
      addHardwarePairCode: ''
    })
  }

  createLatticeSigner() {
    const deviceId = (this.state.addAccountInput || '').trim()
    const deviceName = (this.state.addAccountName || '').trim() || 'GridPlus'

    if (!deviceId) return this.setState({ addAccountError: 'Device ID required' })

    this.setState({ addAccountError: '', addAccountStatus: 'Creating Lattice signer' })

    link.rpc('createLattice', deviceId, deviceName, (err: any, signer: any) => {
      if (err) {
        return this.setState({
          addAccountError: this.addErrorMessage(err),
          addAccountStatus: ''
        })
      }

      this.setState({
        addAccountStatus: 'Connecting to GridPlus',
        addAccountInput: '',
        addAccountName: 'GridPlus',
        addAccountSelectedSigner: signer?.id || `lattice-${deviceId}`
      })
    })
  }

  hardwareAccountName(signer: any) {
    const label = signerTypeLabels[signer?.type] || signer?.type || 'Hardware'
    return `${label} Account`
  }

  addHardwareAccount(signer: any, address: string) {
    const id = (address || '').toLowerCase()
    if (!signer?.type || !id) return

    const accounts = this.store('main.accounts') || {}

    if (accounts[id]) {
      link.rpc('setSigner', id, () => {})
      return this.resetInlineAdd()
    }

    this.setState({ addAccountError: '', addAccountStatus: 'Adding account' })

    link.rpc(
      'createAccount',
      address,
      this.hardwareAccountName(signer),
      { type: signer.type },
      (err: any) => {
        if (err) return this.setState({ addAccountError: this.addErrorMessage(err), addAccountStatus: '' })
        link.rpc('setSigner', id, () => {})
        this.resetInlineAdd()
      }
    )
  }

  reloadHardwareSigner(signer: any) {
    if (!signer?.id) return
    link.send('dash:reloadSigner', signer.id)
    this.setState({ addAccountError: '', addAccountStatus: 'Connecting hardware wallet' })
  }

  removeHardwareSigner(signer: any) {
    if (!signer?.id) return
    link.send('dash:removeSigner', signer.id)
    this.setState({ addAccountSelectedSigner: '', addAccountError: '', addAccountStatus: '' })
  }

  addHardwarePinDigit(num: number) {
    this.setState({ addHardwarePin: `${this.state.addHardwarePin || ''}${num}` })
  }

  backspaceHardwarePin() {
    this.setState({ addHardwarePin: (this.state.addHardwarePin || '').slice(0, -1) })
  }

  submitHardwarePin(signer: any) {
    if (!signer?.id) return
    if (!this.state.addHardwarePin) return this.setState({ addAccountError: 'PIN required' })

    link.rpc('trezorPin', signer.id, this.state.addHardwarePin, () => {})
    this.setState({ addHardwarePin: '', addAccountError: '', addAccountStatus: 'PIN submitted' })
  }

  submitHardwarePhrase(signer: any) {
    if (!signer?.id) return
    link.rpc('trezorPhrase', signer.id, this.state.addHardwarePhrase || '', () => {})
    this.setState({ addHardwarePhrase: '', addAccountError: '', addAccountStatus: 'Passphrase submitted' })
  }

  submitHardwarePhraseOnDevice(signer: any) {
    if (!signer?.id) return
    link.rpc('trezorEnterPhrase', signer.id, () => {})
    this.setState({ addAccountError: '', addAccountStatus: 'Continue on device' })
  }

  pairHardwareLattice(signer: any) {
    if (!signer?.id) return
    if (!this.state.addHardwarePairCode) return this.setState({ addAccountError: 'Pairing code required' })

    link.rpc('latticePair', signer.id, this.state.addHardwarePairCode, (err: any) => {
      if (err) return this.setState({ addAccountError: this.addErrorMessage(err), addAccountStatus: '' })
      this.setState({ addHardwarePairCode: '', addAccountError: '', addAccountStatus: 'GridPlus paired' })
    })
  }

  async createInlineAccount() {
    const {
      addAccountType,
      addAccountInput,
      addAccountName,
      addAccountPassword,
      addAccountKeystore,
      addAccountKeystorePassword
    } = this.state
    const input = (addAccountInput || '').trim()
    const name = (addAccountName || '').trim()

    if (!addAccountType) return this.setState({ addAccountError: 'Choose an account type' })
    if (addAccountType !== 'keystore' && !input) {
      return this.setState({ addAccountError: 'Account input required' })
    }
    if (this.needsFramePassword() && !addAccountPassword) {
      return this.setState({ addAccountError: `${this.framePasswordLabel()} required` })
    }

    this.setState({ addAccountError: '', addAccountStatus: 'Adding account' })

    if (addAccountType === 'watch') {
      try {
        const address = isAddress(input) ? input : await this.resolveName(input)
        link.rpc('createFromAddress', address, name || 'Watch Account', (err: any) => {
          if (err) return this.setState({ addAccountError: err.message || String(err), addAccountStatus: '' })
          link.rpc('setSigner', address.toLowerCase(), () => {})
          this.resetInlineAdd()
        })
      } catch (err: any) {
        this.setState({ addAccountError: err.message || String(err), addAccountStatus: '' })
      }
      return
    }

    if (addAccountType === 'keystore') {
      if (!addAccountKeystore) {
        return this.setState({ addAccountError: 'Choose a JSON backup file', addAccountStatus: '' })
      }
      if (!addAccountKeystorePassword) {
        return this.setState({ addAccountError: 'JSON backup file password required', addAccountStatus: '' })
      }

      return link.rpc(
        'createFromKeystore',
        addAccountKeystore,
        addAccountPassword,
        addAccountKeystorePassword,
        (err: any, signer: any) => {
          if (err) return this.setState({ addAccountError: this.addErrorMessage(err), addAccountStatus: '' })
          this.createAccountFromSigner(signer, name)
        }
      )
    }

    const method = addAccountType === 'seed' ? 'createFromPhrase' : 'createFromPrivateKey'

    link.rpc(method, input, addAccountPassword, (err: any, signer: any) => {
      if (err) return this.setState({ addAccountError: this.addErrorMessage(err), addAccountStatus: '' })
      this.createAccountFromSigner(signer, name)
    })
  }

  refreshPortfolioBalances(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    if (this.state.refreshingPortfolio) return

    this.setState({ refreshingPortfolio: true })

    link
      .invoke('tray:refreshPortfolioBalances', this.store('selected.current'))
      .catch(() => undefined)
      .finally(() => {
        this.refreshTimer = setTimeout(() => this.setState({ refreshingPortfolio: false }), 1000)
      })
  }

  inputLatticeEndpoint(e: React.ChangeEvent<HTMLInputElement>) {
    e.preventDefault()
    clearTimeout(this.inputLatticeTimeout)
    const value = e.target.value.replace(/\s+/g, '')
    this.setState({ latticeEndpoint: value })
    this.inputLatticeTimeout = setTimeout(
      () => link.send('tray:action', 'setLatticeEndpointCustom', this.state.latticeEndpoint),
      1000
    )
  }

  inputPortfolioApiKey(e: React.ChangeEvent<HTMLInputElement>) {
    e.preventDefault()
    clearTimeout(this.inputPortfolioApiKeyTimeout)
    const value = e.target.value.replace(/\s+/g, '')
    this.setState({ portfolioApiKey: value, portfolioApiKeyRequired: false })
    this.inputPortfolioApiKeyTimeout = setTimeout(
      () => link.send('tray:action', 'setPortfolioApiKey', this.state.portfolioApiKey),
      1000
    )
  }

  toggleAutoDiscoverTokens() {
    const enabled = !!this.store('main.autoDiscoverTokens')

    if (enabled) {
      return link.send('tray:action', 'setAutoDiscoverTokens', false)
    }

    const apiKey = (this.state.portfolioApiKey || '').trim()
    if (!apiKey) return this.setState({ portfolioApiKeyRequired: true })

    clearTimeout(this.inputPortfolioApiKeyTimeout)
    link.send('tray:action', 'setPortfolioApiKey', apiKey)
    link.send('tray:action', 'setAutoDiscoverTokens', true)
    this.setState({ portfolioApiKey: apiKey, portfolioApiKeyRequired: false })
  }

  copyInstanceId(instanceId: string) {
    clearTimeout(this.instanceIdCopiedTimeout)
    link.send('tray:clipboardData', instanceId)
    this.setState({ instanceIdCopied: true })
    this.instanceIdCopiedTimeout = setTimeout(() => this.setState({ instanceIdCopied: false }), 1800)
  }

  generateInlineSeedPhrase() {
    this.setState({
      addAccountError: '',
      addAccountStatus: 'Generating recovery phrase',
      addGeneratedPhrase: '',
      addGeneratedPhraseBackedUp: false,
      addGeneratedPhraseCopied: false
    })

    link.rpc('generatePhrase', (err: any, phrase: string) => {
      if (err) {
        return this.setState({
          addAccountError: this.addErrorMessage(err),
          addAccountStatus: '',
          addGeneratedPhrase: ''
        })
      }

      this.setState({
        addGeneratedPhrase: phrase,
        addAccountError: '',
        addAccountStatus: ''
      })
    })
  }

  copyGeneratedSeedPhrase() {
    const phrase = this.state.addGeneratedPhrase
    if (!phrase) return

    clearTimeout(this.seedPhraseCopiedTimeout)
    link.send('tray:clipboardData', phrase)
    this.setState({ addGeneratedPhraseCopied: true })
    this.seedPhraseCopiedTimeout = setTimeout(() => this.setState({ addGeneratedPhraseCopied: false }), 1800)
  }

  createGeneratedSeedAccount() {
    const phrase = (this.state.addGeneratedPhrase || '').trim()
    const name = (this.state.addAccountName || '').trim()
    const password = this.state.addAccountPassword || ''

    if (!phrase) return this.setState({ addAccountError: 'Generate a recovery phrase first' })
    if (!this.state.addGeneratedPhraseBackedUp) {
      return this.setState({ addAccountError: 'Confirm that you saved the recovery phrase' })
    }
    if (this.needsFramePassword() && !password) {
      return this.setState({ addAccountError: `${this.framePasswordLabel()} required` })
    }

    this.setState({ addAccountError: '', addAccountStatus: 'Creating account' })

    link.rpc('createFromPhrase', phrase, password, (err: any, signer: any) => {
      if (err) return this.setState({ addAccountError: this.addErrorMessage(err), addAccountStatus: '' })
      this.createAccountFromSigner(signer, name)
    })
  }

  signerIcon(type: string, size = 16) {
    if ((type || '').toLowerCase() === 'address') return svg.eye(size)
    if (type === 'ledger') return svg.ledger(size)
    if (type === 'trezor') return svg.trezor(size)
    if (type === 'lattice') return svg.lattice(size)
    return svg.flame(size + 2)
  }

  onKeyboardActivate(e: React.KeyboardEvent, action: () => void) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      action()
    }
  }

  renderToggle(on: boolean, onClick: () => void, label?: string) {
    return (
      <div
        aria-checked={on}
        aria-label={label}
        className={on ? 't2Toggle t2ToggleOn' : 't2Toggle'}
        onClick={onClick}
        onKeyDown={(e) => this.onKeyboardActivate(e, onClick)}
        role='switch'
        tabIndex={0}
      >
        <div className='t2ToggleKnob' />
      </div>
    )
  }

  renderTopBar(account: any) {
    const name = account ? this.accountDisplayName(account) : 'Add Account'
    const address = account ? this.shortAddress(account.address) : ''
    return (
      <div className='t2TopBar'>
        <div className='t2AccountPill'>
          <div
            aria-expanded={this.state.accountsOpen}
            aria-haspopup='dialog'
            aria-label='Accounts'
            className='t2AccountPillIdentity'
            onClick={() => this.toggleAccountsPanel()}
            onKeyDown={(e) => this.onKeyboardActivate(e, () => this.toggleAccountsPanel())}
            role='button'
            tabIndex={0}
          >
            <div className='t2AccountPillIcon'>{account ? this.accountIcon(account) : svg.accounts(16)}</div>
            <div className='t2AccountPillText'>
              <div className='t2AccountPillName'>{name}</div>
              {address ? <div className='t2AccountPillAddress'>{address}</div> : null}
            </div>
            <div className='t2AccountPillChevron'>{svg.chevron(16)}</div>
          </div>
          {account ? (
            <div className='t2AccountPillActions'>
              <div
                aria-label='Copy account address'
                className='t2AccountPillAction'
                onClick={(e) => {
                  e.stopPropagation()
                  this.copyAccountAddress(account)
                }}
                onKeyDown={(e) => this.onKeyboardActivate(e, () => this.copyAccountAddress(account))}
                role='button'
                tabIndex={0}
                title='Copy address'
              >
                {this.state.accountCopied === account.id ? svg.check(13) : svg.copy(13)}
              </div>
              <div
                aria-label='Show account QR code'
                className='t2AccountPillAction'
                onClick={(e) => {
                  e.stopPropagation()
                  this.openReceiveAccount(account)
                }}
                onKeyDown={(e) => this.onKeyboardActivate(e, () => this.openReceiveAccount(account))}
                role='button'
                tabIndex={0}
                title='Show QR code'
              >
                {svg.qr(13)}
              </div>
            </div>
          ) : null}
        </div>
        <div
          aria-expanded={this.state.menuOpen}
          aria-haspopup='dialog'
          aria-label='Main menu'
          className='t2MenuButton'
          onClick={() => this.setState({ menuOpen: !this.state.menuOpen, accountsOpen: false })}
          onKeyDown={(e) =>
            this.onKeyboardActivate(e, () =>
              this.setState({ menuOpen: !this.state.menuOpen, accountsOpen: false })
            )
          }
          role='button'
          tabIndex={0}
        >
          {svg.bars(16)}
        </div>
      </div>
    )
  }

  renderShortcut() {
    const shortcut = this.store('main.shortcuts.summon')
    const platform = this.store('platform')
    const modifiers = (shortcut.modifierKeys || []).map((key: string) => {
      if (key === 'Alt') return platform === 'darwin' ? 'Option' : 'Alt'
      if (key === 'Meta' || key === 'Super') return platform === 'darwin' ? 'Cmd' : 'Win'
      if (key === 'Control' || key === 'CommandOrControl') return 'Ctrl'
      return key
    })
    const key = shortcutKeyDisplay[shortcut.shortcutKey] || shortcut.shortcutKey
    return [...modifiers, key].join(' + ')
  }

  renderMenuPanelRow({
    label,
    detail,
    icon,
    right,
    danger,
    onClick
  }: {
    label: string
    detail?: string
    icon: React.ReactNode
    right?: React.ReactNode
    danger?: boolean
    onClick: () => void
  }) {
    return (
      <div
        key={label}
        aria-label={label}
        className={danger ? 't2MenuPanelRow t2MenuPanelRowDanger' : 't2MenuPanelRow'}
        onClick={onClick}
        onKeyDown={(e) => this.onKeyboardActivate(e, onClick)}
        role='button'
        tabIndex={0}
      >
        <div className='t2MenuPanelRowIcon'>{icon}</div>
        <div className='t2MenuPanelRowText'>
          <div className='t2MenuPanelRowTitle'>{label}</div>
          {detail ? <div className='t2MenuPanelRowDetail'>{detail}</div> : null}
        </div>
        <div className='t2MenuPanelRowRight'>{right || svg.arrowRight(12)}</div>
      </div>
    )
  }

  renderSettingsToggleRow(label: string, on: boolean, toggle: () => void, detail?: string) {
    return (
      <div key={label} className='t2SettingsRow'>
        <div className='t2SettingsRowText'>
          <div className='t2SettingsRowTitle'>{label}</div>
          {detail ? <div className='t2SettingsRowDetail'>{detail}</div> : null}
        </div>
        {this.renderToggle(on, toggle, label)}
      </div>
    )
  }

  renderSettingsSelectRow(
    label: string,
    options: Array<{ text: string; value: any }>,
    currentValue: any,
    onChange: (value: any) => void
  ) {
    const index = options.findIndex((option) => option.value === currentValue)
    const current = index >= 0 ? options[index] : options[0]
    const next = options[(index + 1 + options.length) % options.length]

    return (
      <div
        key={label}
        aria-label={`${label}: ${current.text}`}
        className='t2SettingsRow t2SettingsSelectRow'
        onClick={() => onChange(next.value)}
        onKeyDown={(e) => this.onKeyboardActivate(e, () => onChange(next.value))}
        role='button'
        tabIndex={0}
      >
        <div className='t2SettingsRowText'>
          <div className='t2SettingsRowTitle'>{label}</div>
        </div>
        <div className='t2SettingsRowValue'>
          <span>{current.text}</span>
          {svg.arrowRight(10)}
        </div>
      </div>
    )
  }

  renderSettingsActionRow(label: string, action: string, onClick: () => void, danger = false) {
    return (
      <div
        key={label}
        aria-label={label}
        className={
          danger
            ? 't2SettingsRow t2SettingsActionRow t2SettingsDangerRow'
            : 't2SettingsRow t2SettingsActionRow'
        }
        onClick={onClick}
        onKeyDown={(e) => this.onKeyboardActivate(e, onClick)}
        role='button'
        tabIndex={0}
      >
        <div className='t2SettingsRowText'>
          <div className='t2SettingsRowTitle'>{label}</div>
        </div>
        <div className='t2SettingsActionValue'>{action}</div>
      </div>
    )
  }

  renderMenu(account: any) {
    if (!this.state.menuOpen) return null

    const requestCount = this.pendingRequestCount(account)

    return (
      <div aria-label='Main menu' className='t2Overlay t2MenuPanel cardShow' role='dialog'>
        <div className='t2OverlayHeader t2MenuPanelHeader'>
          <div className='t2OverlaySpacer' />
          <div className='t2OverlayTitle'>Menu</div>
          <div
            aria-label='Close menu'
            className='t2AccountsClose'
            onClick={() => this.setState({ menuOpen: false })}
            onKeyDown={(e) => this.onKeyboardActivate(e, () => this.setState({ menuOpen: false }))}
            role='button'
            tabIndex={0}
          >
            {svg.x(13)}
          </div>
        </div>
        <div className='t2MenuPanelScroll'>
          <div className='t2MenuPanelSection'>
            {this.renderMenuPanelRow({
              label: 'Requests',
              detail: requestCount ? `${requestCount} pending` : 'No pending requests',
              icon: svg.inbox(16),
              right: (
                <div className={requestCount ? 't2MenuBadge t2MenuBadgeActive' : 't2MenuBadge'}>
                  {requestCount}
                </div>
              ),
              onClick: () => this.setState({ overlay: 'requests', menuOpen: false })
            })}
            {this.renderMenuPanelRow({
              label: 'Dapps',
              detail: 'Connected permissions',
              icon: svg.window(16),
              onClick: () => this.setState({ overlay: 'dapps', menuOpen: false })
            })}
            {this.renderMenuPanelRow({
              label: 'Settings',
              detail: 'App, shortcuts, signer defaults',
              icon: svg.settings(16),
              onClick: () =>
                this.setState({
                  overlay: 'settings',
                  menuOpen: false,
                  latticeEndpoint: this.store('main.latticeSettings.endpointCustom'),
                  latticeEndpointMode: this.store('main.latticeSettings.endpointMode'),
                  portfolioApiKey: this.store('main.portfolioApiKey'),
                  portfolioApiKeyRequired: false
                })
            })}
          </div>

          {/*
          <div className='t2MenuPanelSection'>
            <div className='t2MenuPanelSectionTitle'>Browser Extension</div>
            <div className='t2BrowserButtons'>
              <div
                aria-label='Chrome extension'
                className='t2BrowserButton'
                onClick={() => link.send('tray:openExternal', chromeExtensionUrl)}
                onKeyDown={(e) =>
                  this.onKeyboardActivate(e, () => link.send('tray:openExternal', chromeExtensionUrl))
                }
                role='button'
                tabIndex={0}
              >
                {svg.chrome(22)}
                <span>Chrome</span>
              </div>
              <div
                aria-label='Firefox extension'
                className='t2BrowserButton'
                onClick={() => link.send('tray:openExternal', firefoxExtensionUrl)}
                onKeyDown={(e) =>
                  this.onKeyboardActivate(e, () => link.send('tray:openExternal', firefoxExtensionUrl))
                }
                role='button'
                tabIndex={0}
              >
                {svg.firefox(22)}
                <span>Firefox</span>
              </div>
            </div>
          </div>
          */}

          <div className='t2MenuPanelSection'>
            {this.renderMenuPanelRow({
              label: 'App Info',
              detail: this.store('main.instanceId'),
              icon: svg.copy(16),
              onClick: () => this.setState({ overlay: 'about', menuOpen: false, resetConfirm: false })
            })}
            {this.renderMenuPanelRow({
              label: 'Quit',
              icon: svg.x(15),
              danger: true,
              onClick: () => link.send('tray:quit')
            })}
          </div>
        </div>
      </div>
    )
  }

  renderHero(balances: any[]) {
    const hasAssets = balances.length > 0
    const canTrade = this.canOpenTrade(undefined, balances)
    const total = balances
      .filter((balance) => this.inNetworkFilter(balance.chainId))
      .reduce((sum, balance) => sum + balance.totalValue, 0)
    const display = formatUsdRate(total, 2)
    const [dollars, cents] = display.split('.')

    return (
      <div className='t2Hero'>
        <div className='t2HeroValue'>
          <span className='t2HeroDollars'>{`$${dollars}`}</span>
          <span className='t2HeroCents'>{`.${cents || '00'}`}</span>
          <div
            aria-label='Refresh balances'
            className={this.state.refreshingPortfolio ? 't2HeroRefresh t2HeroRefreshActive' : 't2HeroRefresh'}
            onMouseDown={(e) => this.refreshPortfolioBalances(e)}
            onKeyDown={(e) => this.onKeyboardActivate(e, () => this.refreshPortfolioBalances(e as any))}
            role='button'
            tabIndex={0}
            title='Refresh balances'
          >
            {svg.sync(18)}
          </div>
        </div>
        <div className='t2HeroActions'>
          <div
            aria-disabled={!hasAssets}
            aria-label='Send'
            className={hasAssets ? 't2HeroButton' : 't2HeroButton t2HeroButtonDisabled'}
            onClick={hasAssets ? () => this.openSend() : undefined}
            onKeyDown={hasAssets ? (e) => this.onKeyboardActivate(e, () => this.openSend()) : undefined}
            role='button'
            tabIndex={hasAssets ? 0 : -1}
            title={hasAssets ? 'Send' : 'No assets available'}
          >
            <div className='t2HeroButtonIcon'>{svg.send(14)}</div>
            <span>Send</span>
          </div>
          <div
            aria-disabled={!canTrade}
            aria-label='Trade'
            className={canTrade ? 't2HeroButton' : 't2HeroButton t2HeroButtonDisabled'}
            onClick={canTrade ? () => this.openTrade(undefined, balances) : undefined}
            onKeyDown={
              canTrade
                ? (e) => this.onKeyboardActivate(e, () => this.openTrade(undefined, balances))
                : undefined
            }
            role='button'
            tabIndex={canTrade ? 0 : -1}
            title={this.tradeTitle(undefined, balances)}
          >
            <div className='t2HeroButtonIcon'>{svg.sync(14)}</div>
            <span>Trade</span>
          </div>
        </div>
      </div>
    )
  }

  renderTabs() {
    const { tab, network } = this.state
    const chains = this.getVisibleChains()
    const enabledChains = chains.filter((chain) => chain.on)
    const selectedChain = network !== 0 && chains.find((chain) => chain.chainId === network)

    return (
      <div className='t2TabRow'>
        <div aria-label='Home sections' className='t2Tabs' role='tablist'>
          <div
            aria-selected={tab === 'positions'}
            className='t2Tab'
            onClick={() => this.setState({ tab: 'positions' })}
            onKeyDown={(e) => this.onKeyboardActivate(e, () => this.setState({ tab: 'positions' }))}
            role='tab'
            tabIndex={tab === 'positions' ? 0 : -1}
          >
            <div className={tab === 'positions' ? 't2TabLabel t2TabLabelActive' : 't2TabLabel'}>
              Positions
            </div>
            <div className={tab === 'positions' ? 't2TabBar t2TabBarActive' : 't2TabBar'} />
          </div>
          <div
            aria-selected={tab === 'activity'}
            className='t2Tab'
            onClick={() => this.setState({ tab: 'activity', query: '' })}
            onKeyDown={(e) => this.onKeyboardActivate(e, () => this.setState({ tab: 'activity', query: '' }))}
            role='tab'
            tabIndex={tab === 'activity' ? 0 : -1}
          >
            <div className={tab === 'activity' ? 't2TabLabel t2TabLabelActive' : 't2TabLabel'}>Activity</div>
            <div className={tab === 'activity' ? 't2TabBar t2TabBarActive' : 't2TabBar'} />
          </div>
          <div
            aria-selected={tab === 'orders'}
            className='t2Tab'
            onClick={() => this.setState({ tab: 'orders', query: '' })}
            onKeyDown={(e) => this.onKeyboardActivate(e, () => this.setState({ tab: 'orders', query: '' }))}
            role='tab'
            tabIndex={tab === 'orders' ? 0 : -1}
          >
            <div className={tab === 'orders' ? 't2TabLabel t2TabLabelActive' : 't2TabLabel'}>Orders</div>
            <div className={tab === 'orders' ? 't2TabBar t2TabBarActive' : 't2TabBar'} />
          </div>
        </div>
        <div
          aria-label='Network filter'
          aria-haspopup='dialog'
          className='t2NetworkPill'
          onClick={() => this.setState({ overlay: 'networks', netQuery: '', kebab: 0 })}
          onKeyDown={(e) =>
            this.onKeyboardActivate(e, () => this.setState({ overlay: 'networks', netQuery: '', kebab: 0 }))
          }
          role='button'
          tabIndex={0}
        >
          {selectedChain ? (
            <div className='t2PillChainIcon'>{this.chainIcon(selectedChain.chainId, 16, 12, 9)}</div>
          ) : (
            <div className='t2NetworkDots'>
              {enabledChains.slice(0, 4).map((chain) => (
                <div
                  key={chain.chainId}
                  className='t2NetworkDotSmall'
                  style={{ background: this.chainColor(chain.chainId) }}
                />
              ))}
            </div>
          )}
          <span>{selectedChain ? selectedChain.name : 'All Networks'}</span>
          <div className='t2NetworkPillChevron'>{svg.chevron(13)}</div>
        </div>
      </div>
    )
  }

  renderSearch() {
    if (this.state.tab !== 'positions') return null
    return (
      <div className='t2SearchWrap'>
        <div className='t2Search'>
          <div className='t2SearchIcon'>{svg.search(12)}</div>
          <input
            aria-label='Filter assets'
            type='text'
            spellCheck='false'
            placeholder='Filter assets'
            value={this.state.query}
            onChange={(e) => this.setState({ query: e.target.value })}
          />
          {this.state.query ? (
            <div
              aria-label='Clear asset filter'
              className='t2SearchClear'
              onClick={() => this.setState({ query: '' })}
              onKeyDown={(e) => this.onKeyboardActivate(e, () => this.setState({ query: '' }))}
              role='button'
              tabIndex={0}
            >
              {svg.x(10)}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  renderTokenRow(balance: DisplayedBalance, i: number, className = 't2TokenRow cardShow') {
    const change = balance.priceChange ? parseFloat(balance.priceChange) : 0
    const fiatValue = formatBalanceNotionalValue(balance)
    const networks = this.store('main.networks.ethereum') || {}
    const networksMeta = this.store('main.networksMeta.ethereum') || {}
    const item = {
      id: `${balance.chainId}:${balance.address}:${i}`,
      symbol: balance.symbol,
      amountLabel: balance.displayBalance,
      notionalLabel: fiatValue,
      chainId: balance.chainId,
      logoURI: balance.logoURI,
      rightSubLabel: balance.priceChange ? `${change >= 0 ? '+' : ''}${balance.priceChange}%` : undefined
    }

    return (
      <div
        key={`${balance.chainId}:${balance.address}:${i}`}
        aria-label={`${balance.symbol} asset details`}
        className={className}
        onClick={() => this.setState({ assetDetails: balance })}
        onKeyDown={(e) => this.onKeyboardActivate(e, () => this.setState({ assetDetails: balance }))}
        role='button'
        tabIndex={0}
      >
        <TokenOptionRow item={item} networks={networks} networksMeta={networksMeta} showRightSubLabel />
      </div>
    )
  }

  renderPositionListMore(hiddenCount: number, label: string, onClick: () => void) {
    if (hiddenCount <= 0) return null

    return (
      <div
        aria-label={label}
        className='t2PositionListMore'
        onClick={onClick}
        onKeyDown={(e) => this.onKeyboardActivate(e, onClick)}
        role='button'
        tabIndex={0}
      >
        <span>{label}</span>
        {svg.chevron(12)}
      </div>
    )
  }

  renderPositions(balances: BalanceSummary[]) {
    const networks = this.store('main.networks.ethereum')
    const matchedBalances = balances.filter((balance) => {
      if (!this.inNetworkFilter(balance.chainId)) return false
      const chainName = (networks[balance.chainId] || {}).name || ''
      return matchFilter(this.state.query, [chainName, balance.name, balance.symbol])
    })
    const matchedTotal = matchedBalances.reduce((sum, balance) => sum + balance.totalValue, 0)
    const importanceCutoff = matchedTotal * PORTFOLIO_IMPORTANCE_THRESHOLD
    const thresholdActive = matchedTotal > 0
    const visible = matchedBalances.filter((balance) => !isLowValueTokenBalance(balance))
    const importantBalances = thresholdActive
      ? visible.filter((balance) => balance.totalValue > importanceCutoff)
      : visible
    const secondaryBalances = thresholdActive
      ? visible.filter((balance) => balance.totalValue <= importanceCutoff)
      : []
    const lowValueBalances = matchedBalances.filter(isLowValueTokenBalance)
    const secondaryRows = secondaryBalances.slice(0, this.state.secondaryPositionRowsVisible)
    const secondaryRowsHidden = secondaryBalances.length - secondaryRows.length
    const hiddenSecondaryCount = secondaryBalances.length
    const hiddenSecondaryValue = secondaryBalances.reduce((sum, balance) => sum + balance.totalValue, 0)
    const hiddenLowValueCount = lowValueBalances.length
    const secondaryLabel = `${hiddenSecondaryCount} ${
      hiddenSecondaryCount === 1 ? 'asset' : 'assets'
    } below 1% hidden`
    const dustLabel = `${hiddenLowValueCount} low value ${
      hiddenLowValueCount === 1 ? 'token' : 'tokens'
    } hidden`
    const dustRows = lowValueBalances.slice(0, this.state.dustRowsVisible)
    const dustRowsHidden = lowValueBalances.length - dustRows.length

    if (!visible.length && hiddenLowValueCount === 0) {
      return <div className='t2EmptyState'>No Tokens Found</div>
    }

    return (
      <div className='t2List'>
        {importantBalances.map((balance, i) => this.renderTokenRow(createDisplayBalance(balance), i))}
        {hiddenSecondaryCount > 0 ? (
          <>
            <div
              aria-expanded={this.state.secondaryPositionsExpanded}
              aria-label={secondaryLabel}
              className='t2LowValueHidden'
              onClick={() =>
                this.setState({ secondaryPositionsExpanded: !this.state.secondaryPositionsExpanded })
              }
              onKeyDown={(e) =>
                this.onKeyboardActivate(e, () =>
                  this.setState({ secondaryPositionsExpanded: !this.state.secondaryPositionsExpanded })
                )
              }
              role='button'
              tabIndex={0}
            >
              <div
                className={
                  this.state.secondaryPositionsExpanded
                    ? 't2LowValueHiddenChevron t2LowValueHiddenChevronOpen'
                    : 't2LowValueHiddenChevron'
                }
              >
                {svg.chevronLeft(10)}
              </div>
              <div className='t2LowValueHiddenLabel'>{secondaryLabel}</div>
              <div className='t2LowValueHiddenValue'>{`$${formatUsdRate(hiddenSecondaryValue, 2)}`}</div>
            </div>
            {this.state.secondaryPositionsExpanded
              ? secondaryRows.map((balance, i) =>
                  this.renderTokenRow(
                    createDisplayBalance(balance),
                    i,
                    't2TokenRow t2SecondaryTokenRow cardShow'
                  )
                )
              : null}
            {this.state.secondaryPositionsExpanded
              ? this.renderPositionListMore(
                  secondaryRowsHidden,
                  `Show ${Math.min(SECONDARY_POSITION_ROWS_INCREMENT, secondaryRowsHidden)} more assets`,
                  () =>
                    this.setState({
                      secondaryPositionRowsVisible:
                        this.state.secondaryPositionRowsVisible + SECONDARY_POSITION_ROWS_INCREMENT
                    })
                )
              : null}
          </>
        ) : null}
        {hiddenLowValueCount > 0 ? (
          <>
            <div
              aria-expanded={this.state.dustExpanded}
              aria-label={dustLabel}
              className='t2LowValueHidden'
              onClick={() => this.setState({ dustExpanded: !this.state.dustExpanded })}
              onKeyDown={(e) =>
                this.onKeyboardActivate(e, () => this.setState({ dustExpanded: !this.state.dustExpanded }))
              }
              role='button'
              tabIndex={0}
            >
              <div
                className={
                  this.state.dustExpanded
                    ? 't2LowValueHiddenChevron t2LowValueHiddenChevronOpen'
                    : 't2LowValueHiddenChevron'
                }
              >
                {svg.chevronLeft(10)}
              </div>
              <div className='t2LowValueHiddenLabel'>{dustLabel}</div>
              <div className='t2LowValueHiddenValue'>{'<$0.01'}</div>
            </div>
            {this.state.dustExpanded
              ? dustRows.map((balance, i) =>
                  this.renderTokenRow(createDisplayBalance(balance), i, 't2TokenRow t2DustTokenRow cardShow')
                )
              : null}
            {this.state.dustExpanded
              ? this.renderPositionListMore(
                  dustRowsHidden,
                  `Show ${Math.min(DUST_ROWS_INCREMENT, dustRowsHidden)} more low value tokens`,
                  () =>
                    this.setState({
                      dustRowsVisible: this.state.dustRowsVisible + DUST_ROWS_INCREMENT
                    })
                )
              : null}
          </>
        ) : null}
      </div>
    )
  }

  renderAssetDetailsOverlay() {
    const asset = this.state.assetDetails
    if (!asset) return null

    const canSendAsset = hasPositiveBalance(asset)
    const canTradeAsset = this.canOpenTrade(asset)
    const chain = this.store('main.networks.ethereum', asset.chainId) || {}
    const price = Number(asset?.usdRate?.price || 0)
    const priceDisplay = price > 0 ? `$${formatUsdRate(price, 2)}` : '$0.00'
    const contractAddress = isNativeCurrency(asset.address) ? 'Native asset' : asset.address
    const detailRow = (label: string, value: any, monospace = false) => (
      <div className='t2AssetDetailRow'>
        <div className='t2AssetDetailLabel'>{label}</div>
        <div className={monospace ? 't2AssetDetailValue t2AssetDetailValueCode' : 't2AssetDetailValue'}>
          {value}
        </div>
      </div>
    )

    return (
      <div aria-label='Asset details' className='t2Overlay t2AssetOverlay cardShow' role='dialog'>
        <div className='t2OverlayHeader'>
          <div
            aria-label='Back to positions'
            className='t2OverlayBack'
            onClick={() => this.setState({ assetDetails: null })}
            onKeyDown={(e) => this.onKeyboardActivate(e, () => this.setState({ assetDetails: null }))}
            role='button'
            tabIndex={0}
          >
            {svg.chevronLeft(13)}
          </div>
          <div className='t2OverlayTitle'>{asset.symbol}</div>
          <div className='t2OverlaySpacer' />
        </div>
        <div className='t2AssetBody'>
          <div className='t2AssetHero'>
            <div className='t2AssetHeroIcon'>
              <ChainTokenIcon
                chainId={asset.chainId}
                logoURI={asset.logoURI}
                networks={this.store('main.networks.ethereum') || {}}
                networksMeta={this.store('main.networksMeta.ethereum') || {}}
                size='md'
                symbol={asset.symbol}
              />
            </div>
            <div className='t2AssetHeroText'>
              <div className='t2AssetHeroName'>{asset.name || asset.symbol}</div>
              <div className='t2AssetHeroSub'>
                <span>{asset.symbol}</span>
                <span>{chain.name || `Chain ${asset.chainId}`}</span>
              </div>
            </div>
          </div>
          <div className='t2AssetDetailList'>
            {detailRow('Price', priceDisplay)}
            {detailRow('Balance', `${asset.displayBalance} ${asset.symbol}`)}
            {detailRow(
              'Chain',
              <div className='t2AssetChainValue'>
                <div className='t2AssetChainIcon'>{this.chainIcon(asset.chainId, 18, 11, 9)}</div>
                <span>{chain.name || `Chain ${asset.chainId}`}</span>
              </div>
            )}
            {detailRow('Contract Address', contractAddress, !isNativeCurrency(asset.address))}
          </div>
        </div>
        <div className='t2AssetFooter'>
          <div
            aria-disabled={!canSendAsset}
            aria-label={`Send ${asset.symbol}`}
            className={canSendAsset ? 't2AssetSendButton' : 't2AssetSendButton t2AssetSendButtonDisabled'}
            onClick={canSendAsset ? () => this.openSend(asset) : undefined}
            onKeyDown={
              canSendAsset ? (e) => this.onKeyboardActivate(e, () => this.openSend(asset)) : undefined
            }
            role='button'
            tabIndex={canSendAsset ? 0 : -1}
            title={canSendAsset ? `Send ${asset.symbol}` : 'No asset balance available'}
          >
            {svg.send(14)}
            <span>Send</span>
          </div>
          <div
            aria-disabled={!canTradeAsset}
            aria-label={`Trade ${asset.symbol}`}
            className={canTradeAsset ? 't2AssetSendButton' : 't2AssetSendButton t2AssetSendButtonDisabled'}
            onClick={canTradeAsset ? () => this.openTrade(asset) : undefined}
            onKeyDown={
              canTradeAsset ? (e) => this.onKeyboardActivate(e, () => this.openTrade(asset)) : undefined
            }
            role='button'
            style={{ marginLeft: '10px' }}
            tabIndex={canTradeAsset ? 0 : -1}
            title={canTradeAsset ? `Trade ${asset.symbol}` : TRADE_DISABLED_CHAIN_LABEL}
          >
            {svg.sync(14)}
            <span>Trade</span>
          </div>
        </div>
      </div>
    )
  }

  renderOrderAssetIcon(asset: any, fallbackChainId?: number) {
    const symbol = this.orderAssetSymbol(asset)
    const chainId = Number(asset?.chainId || fallbackChainId || 0)
    const logo = asset?.logoURI || asset?.logoUrl || asset?.icon

    return (
      <div className='t2OrderAssetIcon'>
        <div className='t2OrderAssetIconInner'>
          {logo ? (
            <img src={cachedImageUrl(logo)} alt='' />
          ) : symbol === 'USDC' ? (
            svg.usd(14)
          ) : symbol === 'ETH' || symbol === 'WETH' ? (
            svg.eth(14)
          ) : (
            <span>{symbol.substring(0, 1)}</span>
          )}
        </div>
        {chainId ? <div className='t2OrderAssetChainBadge'>{this.chainIcon(chainId, 12, 8, 6)}</div> : null}
      </div>
    )
  }

  renderOrderAssetPill(asset: any, fallbackChainId?: number, prefix = '') {
    return (
      <div className='t2OrderAssetPill' title={this.orderAssetName(asset)}>
        {prefix ? <span className='t2OrderAssetPrefix'>{prefix}</span> : null}
        {this.renderOrderAssetIcon(asset, fallbackChainId)}
        <span>{this.orderAssetSymbol(asset)}</span>
      </div>
    )
  }

  renderOrders(account: any) {
    const records = this.getOrderRecords(account)

    if (!records.length) return <div className='t2EmptyState'>No Orders Yet</div>

    return (
      <div className='t2OrderList'>
        {records.map((order: any) => {
          const chainId = Number(order.chainId)
          const open = this.isOpenOrder(order)
          const side = this.normalizeOrderSide(order.side)
          const statusKey = this.orderStatus(order).replace(/[^a-z0-9]+/g, '-') || 'unknown'
          const cancelError = this.orderCancelErrorMessage(order.orderId)
          const contraPrefix = side ? getContraPreposition(side) : 'with'

          return (
            <div
              key={order.orderId}
              aria-label={`${this.orderPairIntent(order)} order details`}
              className='t2OrderRow cardShow'
              onClick={() => this.openOrder(order)}
              onKeyDown={(e) => this.onKeyboardActivate(e, () => this.openOrder(order))}
              role='button'
              tabIndex={0}
            >
              <div className='t2OrderCancelSlot'>
                {open ? (
                  <div
                    aria-label='Cancel order'
                    className='t2OrderCancel'
                    onClick={(e) => {
                      e.stopPropagation()
                      void this.cancelOrder(order)
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      this.onKeyboardActivate(e, () => void this.cancelOrder(order))
                    }}
                    role='button'
                    tabIndex={0}
                    title='Cancel order'
                  >
                    {svg.x(9)}
                  </div>
                ) : null}
              </div>
              <div className='t2OrderStatusBlock'>
                <div className={`t2OrderStatus t2OrderStatus-${statusKey}`}>
                  {this.orderStatusLabel(order)}
                </div>
                <div className='t2OrderCreated'>{this.orderDate(order.createdAt)}</div>
              </div>
              <div className='t2OrderAssetColumn'>
                {this.renderOrderAssetPill(order.targetAsset, chainId)}
              </div>
              <div className='t2OrderCopy'>
                <div className='t2OrderIntent'>{this.orderPairIntent(order)}</div>
                <div className='t2OrderSubline'>
                  <span>{this.orderSideLabel(order)}</span>
                  <span>{this.orderTypeLabel(order)}</span>
                  {cancelError ? (
                    <span className='t2OrderCancelInlineError' title={cancelError}>
                      {cancelError}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className='t2OrderSize'>{this.orderSize(order)}</div>
              <div className='t2OrderContra'>
                {this.renderOrderAssetPill(order.contraAsset, chainId, contraPrefix)}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  renderOrderDetails() {
    const orderId = this.state.orderDetails
    if (!orderId) return null

    const order = this.store('main.orders', orderId)
    if (!order) return null

    const chainId = Number(order.chainId)
    const chain = this.store('main.networks.ethereum', chainId) || {}
    const side = this.normalizeOrderSide(order.side)
    const cancelError = this.orderCancelErrorMessage(orderId)
    const detailRow = (label: string, value: any, monospace = false) => {
      if (value === undefined || value === null || value === '') return null

      return (
        <div className='t2OrderDetailRow'>
          <div className='t2OrderDetailLabel'>{label}</div>
          <div className={monospace ? 't2OrderDetailValue t2OrderDetailValueCode' : 't2OrderDetailValue'}>
            {value}
          </div>
        </div>
      )
    }
    const rawPayload = this.orderJson(order.rawPayload)
    const rawStatusPayload = this.orderJson(order.rawStatusPayload)

    return (
      <div aria-label='Order details' className='t2Overlay t2OrderOverlay cardShow' role='dialog'>
        <div className='t2OverlayHeader'>
          <div
            aria-label='Back to orders'
            className='t2OverlayBack'
            onClick={() => this.setState({ orderDetails: '' })}
            onKeyDown={(e) => this.onKeyboardActivate(e, () => this.setState({ orderDetails: '' }))}
            role='button'
            tabIndex={0}
          >
            {svg.chevronLeft(13)}
          </div>
          <div className='t2OverlayTitle'>Order</div>
          <div className='t2OverlaySpacer' />
        </div>
        <div className='t2OverlayScroll t2OrderDetailScroll'>
          <div className='t2OrderDetailHero'>
            <div className='t2OrderDetailPair'>
              {this.renderOrderAssetPill(order.targetAsset, chainId)}
              <div className='t2OrderDetailIntent'>{this.orderPairIntent(order)}</div>
              {this.renderOrderAssetPill(
                order.contraAsset,
                chainId,
                side ? getContraPreposition(side) : 'with'
              )}
            </div>
            <div className='t2OrderDetailMeta'>
              <span>{this.orderStatusLabel(order)}</span>
              <span>{this.orderTypeLabel(order)}</span>
              <span>{this.orderSize(order)}</span>
            </div>
            {cancelError ? <div className='t2OrderCancelError'>Cancel failed: {cancelError}</div> : null}
          </div>
          <div className='t2OrderDetailList'>
            {detailRow('Order ID', order.orderId || orderId, true)}
            {detailRow('Provider', order.provider || order.source)}
            {detailRow('Environment', order.environment)}
            {detailRow('Profile', order.profile)}
            {detailRow('Account', this.shortAddress(order.accountAddress), true)}
            {detailRow(
              'Chain',
              <div className='t2OrderChainValue'>
                <div className='t2OrderChainIcon'>{this.chainIcon(chainId, 18, 11, 9)}</div>
                <span>{chain.name || `Chain ${chainId}`}</span>
              </div>
            )}
            {detailRow('Status', this.orderStatusLabel(order))}
            {detailRow('Raw status', order.rawStatus)}
            {detailRow('Side', this.orderSideLabel(order))}
            {detailRow('Type', this.orderTypeLabel(order))}
            {detailRow('Size', this.orderSize(order))}
            {detailRow('Spent amount', this.formatOrderAmount(order.spentAmount))}
            {detailRow('Output amount', this.formatOrderAmount(order.outputAmount))}
            {detailRow('Estimated output', this.formatOrderAmount(order.estimatedOutputAmount))}
            {detailRow('Filled output', this.formatOrderAmount(order.filledOutputAmount))}
            {detailRow('Average fill price', this.formatOrderAmount(order.averageFillPrice))}
            {detailRow('Created', this.orderDateTime(order.createdAt))}
            {detailRow('Updated', this.orderDateTime(order.updatedAt))}
            {detailRow('Terminal', this.orderDateTime(order.terminalAt))}
            {detailRow('Fill hash', order.fillHash || order.fillTransactionHash, true)}
          </div>
          {rawStatusPayload ? (
            <div className='t2OrderJsonSection'>
              <div className='t2OrderJsonTitle'>Status Payload</div>
              <pre>{rawStatusPayload}</pre>
            </div>
          ) : null}
          {rawPayload ? (
            <div className='t2OrderJsonSection'>
              <div className='t2OrderJsonTitle'>Raw Payload</div>
              <pre>{rawPayload}</pre>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  renderActivity(account: any) {
    const records = this.getActivityRecords(account)

    if (!records.length) return <div className='t2EmptyState'>No Activity Yet</div>

    return (
      <div className='t2ActivityList'>
        {records.map((activity: any) => {
          const chainId = Number(activity.chainId)
          const chain = this.store('main.networks.ethereum', chainId) || {}
          const status = transactionStatusLabel(activity.status)
          const submittedAt = timestamp(activity.submittedAt, timestamp(activity.updatedAt, 0))
          const submitted = submittedAt
            ? new Date(submittedAt).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit'
              })
            : ''
          const title = activity.display?.title || 'Transaction'
          const subtitle = activity.display?.subtitle || chain.name || `Chain ${chainId}`

          return (
            <div
              key={activity.id}
              aria-label={`${title} ${status}`}
              className='t2ActivityRow cardShow'
              onClick={() => this.openActivity(activity)}
              onKeyDown={(e) => this.onKeyboardActivate(e, () => this.openActivity(activity))}
              role='button'
              tabIndex={0}
            >
              <div className='t2ActivityIconWrap'>
                <StatusGlyph state={activityGlyphState(activity.status) as any} />
                <div className='t2ActivityChainBadge'>{this.chainIcon(chainId, 16, 10, 8)}</div>
              </div>
              <div className='t2ActivityCopy'>
                <div className='t2ActivityTitle'>{title}</div>
                <div className='t2ActivitySubtitle'>
                  <span>{subtitle}</span>
                  {activity.hash ? <span>{this.shortAddress(activity.hash)}</span> : null}
                </div>
              </div>
              <div className='t2ActivityMeta'>
                <div className={`t2ActivityStatus t2ActivityStatus-${activity.status}`}>{status}</div>
                <div className='t2ActivityTime'>{submitted}</div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  renderActivityDetails() {
    const activityId = this.state.activityDetails
    if (!activityId) return null

    const activity = this.store('main.activity', activityId)
    if (!activity) return null

    const req = this.activityRequestLike(activity)
    const chainId = Number(activity.chainId)
    const chain = this.store('main.networks.ethereum', chainId) || {}
    const meta = this.store('main.networksMeta.ethereum', chainId) || {}
    const nativeCurrency = meta.nativeCurrency || { symbol: chain.symbol || 'ETH' }
    const symbol = nativeCurrency.symbol || chain.symbol || 'ETH'
    const intent = getTransactionIntent(req, symbol)
    const effects = getTransactionEffects(req, symbol)
    const receiptBlock = activity.receipt?.blockNumber
      ? parseInt(activity.receipt.blockNumber, 16)
      : undefined
    const originName = activity.origin
      ? this.store('main.origins', activity.origin, 'name') || activity.origin
      : ''
    const from = activity.data?.from || activity.account || activity.address
    const to = activity.data?.to
    const details = [
      { label: 'Origin', value: originName },
      { label: 'From', value: this.shortAddress(from), onClick: () => this.copyActivityValue(from) },
      {
        label: 'To',
        value: activity.recipient || this.shortAddress(to),
        onClick: () => this.copyActivityValue(to)
      },
      { label: 'Nonce', value: activity.nonce },
      {
        label: 'Hash',
        value: this.shortAddress(activity.hash),
        onClick: () => this.copyActivityValue(activity.hash)
      },
      { label: 'Contract', value: activity.decodedData?.contractName },
      { label: 'Method', value: activity.decodedData?.method },
      { label: 'Decode source', value: activity.decodedData?.source },
      { label: 'Block', value: receiptBlock ? String(receiptBlock) : undefined }
    ]

    return (
      <div
        aria-label='Transaction activity details'
        className='t2Overlay t2ActivityOverlay cardShow'
        role='dialog'
      >
        <div className='t2OverlayHeader'>
          <div
            aria-label='Back to activity'
            className='t2OverlayBack'
            onClick={() => this.setState({ activityDetails: '' })}
            onKeyDown={(e) => this.onKeyboardActivate(e, () => this.setState({ activityDetails: '' }))}
            role='button'
            tabIndex={0}
          >
            {svg.chevronLeft(13)}
          </div>
          <div className='t2OverlayTitle'>Activity</div>
          <div className='t2OverlaySpacer' />
        </div>
        <div className='t2OverlayScroll t2ActivityDetailScroll'>
          <TransactionInformation
            networkName={chain.name || `Chain ${chainId}`}
            networkColor={meta.primaryColor ? `var(--${meta.primaryColor})` : undefined}
            title={activity.display?.title || intent.title}
            subtitle={activity.display?.subtitle || intent.subtitle}
            statusLabel={transactionStatusLabel(activity.status)}
            notice={activity.status === 'reverted' ? 'Transaction reverted on-chain' : undefined}
            progress={{
              status: requestStatusFromActivity(activity.status),
              notice: transactionStatusLabel(activity.status),
              txHash: activity.hash,
              confirmations: activity.confirmations || 0,
              confirmationTarget: TRANSACTION_CONFIRMATION_TARGET,
              blockNumber: receiptBlock
            }}
            effects={effects}
            effectsEmptyText='No direct asset changes detected'
            details={details}
            nativeCurrency={nativeCurrency}
          />
        </div>
      </div>
    )
  }

  renderNetworksOverlay(balances: any[]) {
    if (this.state.overlay !== 'networks') return null

    const chains = this.getVisibleChains()
    const showTestnets = this.showTestnets()
    const netQuery = this.state.netQuery.trim()
    const chainTotal = (chainId: number) =>
      balances.filter((b) => b.chainId === chainId).reduce((sum, b) => sum + b.totalValue, 0)
    const allTotal = balances.reduce((sum, b) => sum + b.totalValue, 0)

    const rows = chains
      .filter((chain) => matchFilter(netQuery, [chain.name]))
      .sort((a, b) => {
        if (a.on !== b.on) return a.on ? -1 : 1
        return chainTotal(b.chainId) - chainTotal(a.chainId)
      })
    const productionRows = rows.filter((chain) => !chain.isTestnet)
    const testnetRows = rows.filter((chain) => chain.isTestnet)

    const renderNetworkRows = (sectionRows: any[]) =>
      sectionRows.map((chain) => {
        const on = !!chain.on
        const selected = this.state.network === chain.chainId
        const kebabOpen = this.state.kebab === chain.chainId
        const primary = chain.connection?.primary || {}
        const rpcValue = this.getNetworkPrimaryRpcValue(chain)
        const hasRpcValue = !!rpcValue.trim()

        return (
          <div key={chain.chainId} className={selected ? 't2NetworkItem t2NetworkSelected' : 't2NetworkItem'}>
            <div
              aria-disabled={!on}
              aria-label={chain.name}
              className='t2NetworkRow'
              style={{ opacity: on ? 1 : 0.4 }}
              onClick={() => {
                if (!on) return
                this.setState({ network: chain.chainId, overlay: null, kebab: 0 })
              }}
              onKeyDown={(e) =>
                this.onKeyboardActivate(e, () => {
                  if (!on) return
                  this.setState({ network: chain.chainId, overlay: null, kebab: 0 })
                })
              }
              role='button'
              tabIndex={on ? 0 : -1}
            >
              <div className='t2NetworkIcon'>{this.chainIcon(chain.chainId, 30, 14, 12)}</div>
              <div className='t2NetworkName'>{chain.name}</div>
              <div className='t2NetworkTotal'>
                {on ? `$${formatUsdRate(chainTotal(chain.chainId), 2)}` : 'Disabled'}
              </div>
              <div
                aria-expanded={kebabOpen}
                aria-label={`${chain.name} actions`}
                className='t2NetworkKebab'
                onClick={(e) => {
                  e.stopPropagation()
                  this.setState({ kebab: kebabOpen ? 0 : chain.chainId })
                }}
                onKeyDown={(e) =>
                  this.onKeyboardActivate(e, () => this.setState({ kebab: kebabOpen ? 0 : chain.chainId }))
                }
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
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <div className='t2NetworkRpcLabel'>
                    <span>Primary RPC</span>
                    <span>
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
                      placeholder='Custom RPC URL'
                      spellCheck='false'
                      value={rpcValue}
                      onChange={(e) => this.updateNetworkPrimaryRpc(chain.chainId, e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          this.saveNetworkPrimaryRpc(chain.chainId)
                        }
                      }}
                    />
                    <div
                      aria-disabled={!hasRpcValue}
                      aria-label={`Save ${chain.name} RPC`}
                      className={
                        hasRpcValue
                          ? 't2NetworkAction t2NetworkActionGood'
                          : 't2NetworkAction t2NetworkActionDisabled'
                      }
                      onClick={(e) => {
                        e.stopPropagation()
                        this.saveNetworkPrimaryRpc(chain.chainId)
                      }}
                      onKeyDown={(e) =>
                        this.onKeyboardActivate(e, () => this.saveNetworkPrimaryRpc(chain.chainId))
                      }
                      role='button'
                      tabIndex={hasRpcValue ? 0 : -1}
                    >
                      Save
                    </div>
                  </div>
                </div>
                {chain.chainId !== 1 ? (
                  <div
                    className={
                      on ? 't2NetworkAction t2NetworkActionBad' : 't2NetworkAction t2NetworkActionGood'
                    }
                    onClick={(e) => {
                      e.stopPropagation()
                      link.send('tray:action', 'activateNetwork', 'ethereum', chain.chainId, !on)
                      const resetNetwork = on && this.state.network === chain.chainId
                      this.setState({ kebab: 0, ...(resetNetwork ? { network: 0 } : {}) })
                    }}
                    role='button'
                    tabIndex={0}
                  >
                    {on ? 'Disable Chain' : 'Enable Chain'}
                  </div>
                ) : null}
                <div
                  className='t2NetworkAction t2NetworkActionCancel'
                  onClick={(e) => {
                    e.stopPropagation()
                    this.setState({ kebab: 0 })
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

    const renderNetworkSection = (title: string, sectionRows: any[]) => {
      if (sectionRows.length === 0) return null

      return (
        <React.Fragment key={title}>
          {showTestnets ? <div className='t2NetworkSectionTitle'>{title}</div> : null}
          {renderNetworkRows(sectionRows)}
        </React.Fragment>
      )
    }

    return (
      <div aria-label='Networks' className='t2Overlay cardShow' role='dialog'>
        <div className='t2OverlayHeader'>
          <div
            aria-label='Back'
            className='t2OverlayBack'
            onClick={() => this.setState({ overlay: null, kebab: 0 })}
            onKeyDown={(e) => this.onKeyboardActivate(e, () => this.setState({ overlay: null, kebab: 0 }))}
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
              type='text'
              spellCheck='false'
              placeholder='Search networks'
              value={this.state.netQuery}
              onChange={(e) => this.setState({ netQuery: e.target.value })}
            />
          </div>
        </div>
        <div className='t2OverlayScroll t2NetworksScroll'>
          <div
            aria-label='All Networks'
            className={this.state.network === 0 ? 't2NetworkAll t2NetworkSelected' : 't2NetworkAll'}
            onClick={() => this.setState({ network: 0, overlay: null, kebab: 0 })}
            onKeyDown={(e) =>
              this.onKeyboardActivate(e, () => this.setState({ network: 0, overlay: null, kebab: 0 }))
            }
            role='button'
            tabIndex={0}
          >
            <div className='t2NetworkDots t2NetworkDotsLarge'>
              {chains
                .filter((chain) => chain.on)
                .slice(0, 4)
                .map((chain) => (
                  <div
                    key={chain.chainId}
                    className='t2NetworkDotSmall'
                    style={{ background: this.chainColor(chain.chainId) }}
                  />
                ))}
            </div>
            <div className='t2NetworkAllName'>All Networks</div>
            <div className='t2NetworkAllTotal'>{`$${formatUsdRate(allTotal, 2)}`}</div>
          </div>
          {renderNetworkSection('Mainnets', productionRows)}
          {renderNetworkSection('Testnets', testnetRows)}
        </div>
      </div>
    )
  }

  renderRequestsOverlay(current: string) {
    if (this.state.overlay !== 'requests') return null
    return (
      <div aria-label='Requests' className='t2Overlay cardShow' role='dialog'>
        <div className='t2OverlayHeader'>
          <div
            aria-label='Back'
            className='t2OverlayBack'
            onClick={() => this.setState({ overlay: null, menuOpen: true })}
            onKeyDown={(e) =>
              this.onKeyboardActivate(e, () => this.setState({ overlay: null, menuOpen: true }))
            }
            role='button'
            tabIndex={0}
          >
            {svg.chevronLeft(16)}
          </div>
          <div className='t2OverlayTitle'>Requests</div>
          <div className='t2OverlaySpacer' />
        </div>
        <div className='t2OverlayScroll t2RequestsScroll'>
          {current ? (
            <Requests expanded={true} account={current} moduleId='requests' />
          ) : (
            <div className='t2EmptyState'>No Pending Requests</div>
          )}
        </div>
      </div>
    )
  }

  renderDappsOverlay(current: string) {
    if (this.state.overlay !== 'dapps') return null
    const permissions = (current && this.store('main.permissions', current)) || {}
    const origins = Object.keys(permissions)
      .filter((origin) => permissions[origin]?.provider)
      .sort((a, b) => (permissions[a].origin < permissions[b].origin ? -1 : 1))

    return (
      <div aria-label='Dapps' className='t2Overlay cardShow' role='dialog'>
        <div className='t2OverlayHeader'>
          <div
            aria-label='Back'
            className='t2OverlayBack'
            onClick={() => this.setState({ overlay: null, menuOpen: true })}
            onKeyDown={(e) =>
              this.onKeyboardActivate(e, () => this.setState({ overlay: null, menuOpen: true }))
            }
            role='button'
            tabIndex={0}
          >
            {svg.chevronLeft(16)}
          </div>
          <div className='t2OverlayTitle'>Dapps</div>
          {origins.length ? (
            <div
              aria-label='Clear all connected websites'
              className='t2DappsClearAll'
              onClick={() => link.send('tray:action', 'clearPermissions', current)}
              onKeyDown={(e) =>
                this.onKeyboardActivate(e, () => link.send('tray:action', 'clearPermissions', current))
              }
              role='button'
              tabIndex={0}
              title='Clear all connected websites'
            >
              {svg.trash(13)}
            </div>
          ) : (
            <div className='t2OverlaySpacer' />
          )}
        </div>
        <div className='t2OverlayScroll t2DappsScroll'>
          {origins.length === 0 ? (
            <div className='t2EmptyState'>No Connected Websites</div>
          ) : (
            origins.map((origin) => (
              <div key={origin} className='t2DappRow'>
                <div className='t2DappOrigin'>{permissions[origin].origin}</div>
                <div
                  aria-label={`Clear ${permissions[origin].origin}`}
                  className='t2DappClear'
                  onClick={() => link.send('tray:action', 'revokePermission', current, origin)}
                  onKeyDown={(e) =>
                    this.onKeyboardActivate(e, () =>
                      link.send('tray:action', 'revokePermission', current, origin)
                    )
                  }
                  role='button'
                  tabIndex={0}
                  title={`Clear ${permissions[origin].origin}`}
                >
                  {svg.trash(13)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  approvePendingChain() {
    const pending = this.state.pendingChainRequest || {}
    const chain = pending.chain || pending.request?.chain
    if (!chain) return

    link.send('tray:addChain', chain, pending.request)
    this.setState({ overlay: 'networks', pendingChainRequest: null, netQuery: '', kebab: 0 })
  }

  rejectPendingChain() {
    const pending = this.state.pendingChainRequest || {}
    if (pending.request) link.send('tray:rejectRequest', pending.request)
    this.setState({ overlay: null, pendingChainRequest: null })
  }

  renderAddChainOverlay() {
    if (this.state.overlay !== 'addChain') return null

    const pending = this.state.pendingChainRequest || {}
    const chain = pending.chain || pending.request?.chain || {}
    const rows = [
      ['Name', chain.name],
      ['Chain ID', chain.id],
      ['Symbol', chain.symbol],
      ['RPC', chain.primaryRpc],
      ['Explorer', chain.explorer]
    ].filter(([, value]) => value !== undefined && value !== null && value !== '')

    return (
      <div aria-label='Add Chain' className='t2Overlay cardShow' role='dialog'>
        <div className='t2OverlayHeader'>
          <div
            aria-label='Back'
            className='t2OverlayBack'
            onClick={() => this.rejectPendingChain()}
            onKeyDown={(e) => this.onKeyboardActivate(e, () => this.rejectPendingChain())}
            role='button'
            tabIndex={0}
          >
            {svg.chevronLeft(16)}
          </div>
          <div className='t2OverlayTitle'>Add Chain</div>
          <div className='t2OverlaySpacer' />
        </div>
        <div className='t2OverlayScroll t2SettingsScroll'>
          <div className='t2SettingsSection'>
            {rows.map(([label, value]) => (
              <div className='t2InfoRow' key={label}>
                <div className='t2InfoLabel'>{label}</div>
                <div className='t2InfoValue'>{value}</div>
              </div>
            ))}
            <div className='t2SettingsConfirmActions'>
              <div
                aria-label='Reject chain'
                className='t2SettingsSmallButton'
                onClick={() => this.rejectPendingChain()}
                onKeyDown={(e) => this.onKeyboardActivate(e, () => this.rejectPendingChain())}
                role='button'
                tabIndex={0}
              >
                Reject
              </div>
              <div
                aria-label='Add chain'
                className='t2SettingsSmallButton'
                onClick={() => this.approvePendingChain()}
                onKeyDown={(e) => this.onKeyboardActivate(e, () => this.approvePendingChain())}
                role='button'
                tabIndex={0}
              >
                Add
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  renderReceiveOverlay(accounts: Record<string, any>) {
    if (this.state.overlay !== 'receive') return null

    const account = accounts[this.state.receiveAccount] || accounts[this.store('selected.current')]
    if (!account) return null

    return (
      <div aria-label='Receive assets' className='t2Overlay t2ReceiveOverlay cardShow' role='dialog'>
        <div className='t2OverlayHeader'>
          <div
            aria-label='Back'
            className='t2OverlayBack'
            onClick={() => this.setState({ overlay: null, receiveAccount: '' })}
            onKeyDown={(e) =>
              this.onKeyboardActivate(e, () => this.setState({ overlay: null, receiveAccount: '' }))
            }
            role='button'
            tabIndex={0}
          >
            {svg.chevronLeft(16)}
          </div>
          <div className='t2OverlayTitle'>Receive Assets</div>
          <div className='t2OverlaySpacer' />
        </div>
        <div className='t2ReceiveBody'>
          <div className='t2ReceiveIcon'>{this.accountIcon(account, 22)}</div>
          <div className='t2ReceiveName'>{this.accountDisplayName(account)}</div>
          <div className='t2ReceiveQr'>
            <AddressQRCode address={account.address} />
          </div>
          <div
            aria-label='Copy receive address'
            className='t2ReceiveAddress'
            onClick={() => this.copyAccountAddress(account)}
            onKeyDown={(e) => this.onKeyboardActivate(e, () => this.copyAccountAddress(account))}
            role='button'
            tabIndex={0}
          >
            <span>{this.state.accountCopied === account.id ? 'Address copied' : account.address}</span>
            {svg.copy(13)}
          </div>
        </div>
      </div>
    )
  }

  renderSettingsOverlay() {
    if (this.state.overlay !== 'settings') return null

    const platform = this.store('platform')
    const summonShortcut = this.store('main.shortcuts.summon')
    const biometricUnlock = !!this.store('main.biometricUnlock')
    const trezorDerivation = this.store('main.trezor.derivation')
    const ledgerDerivation = this.store('main.ledger.derivation')
    const liveAccountLimit = this.store('main.ledger.liveAccountLimit')
    const latticeDerivation = this.store('main.latticeSettings.derivation')
    const latticeAccountLimit = this.store('main.latticeSettings.accountLimit')
    const portfolioApiKey = this.state.portfolioApiKey || ''
    const hasPortfolioApiKey = portfolioApiKey.trim().length > 0
    const portfolioApiKeyDetail = this.state.portfolioApiKeyRequired
      ? 'Enter a Zerion API key before enabling'
      : hasPortfolioApiKey
        ? 'Fetch portfolio tokens and balances from Zerion'
        : 'Add a Zerion API key to enable'

    const trezorOptions = [
      { text: 'Standard', value: 'standard' },
      { text: 'Legacy', value: 'legacy' },
      { text: 'Testnet', value: 'testnet' }
    ]
    const ledgerOptions = [
      { text: 'Live', value: 'live' },
      { text: 'Legacy', value: 'legacy' },
      { text: 'Standard', value: 'standard' },
      { text: 'Testnet', value: 'testnet' }
    ]
    const latticeOptions = [
      { text: 'Standard', value: 'standard' },
      { text: 'Legacy', value: 'legacy' },
      { text: 'Live', value: 'live' }
    ]
    const accountLimitOptions = [
      { text: '5', value: 5 },
      { text: '10', value: 10 },
      { text: '20', value: 20 },
      { text: '40', value: 40 }
    ]
    const relayOptions = [
      { text: 'Default', value: 'default' },
      { text: 'Custom', value: 'custom' }
    ]

    const toggleRows = [
      {
        label: 'Auto-hide',
        on: this.store('main.autohide'),
        detail: 'Hide Newframe on loss of focus',
        toggle: () => link.send('tray:action', 'setAutohide', !this.store('main.autohide'))
      },
      {
        label: 'Run on Startup',
        on: this.store('main.launch'),
        detail: 'Run Newframe when your computer starts',
        toggle: () => link.send('tray:action', 'toggleLaunch')
      },
      {
        label: 'Glide',
        on: this.store('main.reveal'),
        detail: "Mouse to display's right edge to summon Newframe",
        toggle: () => link.send('tray:action', 'toggleReveal')
      },
      ...(platform === 'darwin'
        ? [
            {
              label: 'Display Gas in Menubar',
              on: this.store('main.menubarGasPrice'),
              detail: 'Show mainnet gas price in the menu bar',
              toggle: () =>
                link.send('tray:action', 'setMenubarGasPrice', !this.store('main.menubarGasPrice'))
            }
          ]
        : []),
      {
        label: 'Show Account Name with ENS',
        on: this.store('main.showLocalNameWithENS'),
        detail: 'Show local account name when ENS is resolved',
        toggle: () => link.send('tray:action', 'toggleShowLocalNameWithENS')
      },
      {
        label: 'Show Testnets',
        on: this.showTestnets(),
        detail: 'Show testnet chains in Networks',
        toggle: () => this.setShowTestnets(!this.showTestnets())
      },
      {
        label: 'Biometric Login',
        on: biometricUnlock,
        detail: this.state.biometricsBusy
          ? 'Waiting for authentication'
          : this.state.biometricsError || 'Unlock Newframe with Touch ID or a platform passkey',
        toggle: () => this.setBiometricUnlock(!biometricUnlock)
      }
    ]

    return (
      <div aria-label='Settings' className='t2Overlay cardShow' role='dialog'>
        <div className='t2OverlayHeader'>
          <div
            aria-label='Back'
            className='t2OverlayBack'
            onClick={() => this.setState({ overlay: null, menuOpen: true })}
            onKeyDown={(e) =>
              this.onKeyboardActivate(e, () => this.setState({ overlay: null, menuOpen: true }))
            }
            role='button'
            tabIndex={0}
          >
            {svg.chevronLeft(16)}
          </div>
          <div className='t2OverlayTitle'>Settings</div>
          <div className='t2OverlaySpacer' />
        </div>
        <div className='t2OverlayScroll t2SettingsScroll'>
          <div className='t2SettingsSection'>
            <div className='t2SettingsSectionTitle'>Shortcut</div>
            <div className='t2SettingsRow t2SettingsShortcutRow'>
              <div className='t2SettingsShortcutTop'>
                <div className='t2SettingsRowText'>
                  <div className='t2SettingsRowTitle'>Summon Shortcut</div>
                  <div className='t2SettingsRowDetail'>{this.renderShortcut()}</div>
                </div>
                <div className='t2SettingsShortcutControls'>
                  <div
                    aria-label={summonShortcut.configuring ? 'Cancel shortcut edit' : 'Edit shortcut'}
                    className='t2SettingsSmallButton'
                    onClick={() => {
                      link.send('tray:action', 'setShortcut', 'summon', {
                        ...summonShortcut,
                        configuring: !summonShortcut.configuring
                      })
                    }}
                    onKeyDown={(e) =>
                      this.onKeyboardActivate(e, () =>
                        link.send('tray:action', 'setShortcut', 'summon', {
                          ...summonShortcut,
                          configuring: !summonShortcut.configuring
                        })
                      )
                    }
                    role='button'
                    tabIndex={0}
                  >
                    {summonShortcut.configuring ? 'Cancel' : 'Edit'}
                  </div>
                  {this.renderToggle(
                    summonShortcut.enabled,
                    () =>
                      link.send('tray:action', 'setShortcut', 'summon', {
                        ...summonShortcut,
                        enabled: !summonShortcut.enabled
                      }),
                    'Summon Shortcut'
                  )}
                </div>
              </div>
              <div className='t2SettingsShortcutDetails'>
                <KeyboardShortcutConfigurator
                  actionText='summon Newframe'
                  shortcut={summonShortcut}
                  shortcutName='summon'
                  platform={platform}
                />
              </div>
            </div>
          </div>

          <div className='t2SettingsSection'>
            <div className='t2SettingsSectionTitle'>App</div>
            {toggleRows.map((setting) =>
              this.renderSettingsToggleRow(setting.label, setting.on, setting.toggle, setting.detail)
            )}
            {this.renderSettingsActionRow('Lock Newframe', 'Lock', () => this.lockFrame())}
          </div>

          <div className='t2SettingsSection'>
            <div className='t2SettingsSectionTitle'>Signer Defaults</div>
            {this.renderSettingsSelectRow('Trezor Derivation', trezorOptions, trezorDerivation, (value) =>
              link.send('tray:action', 'setTrezorDerivation', value)
            )}
            {this.renderSettingsSelectRow('Ledger Derivation', ledgerOptions, ledgerDerivation, (value) =>
              link.send('tray:action', 'setLedgerDerivation', value)
            )}
            {ledgerDerivation === 'live'
              ? this.renderSettingsSelectRow(
                  'Ledger Live Accounts',
                  accountLimitOptions,
                  liveAccountLimit,
                  (value) => link.send('tray:action', 'setLiveAccountLimit', value)
                )
              : null}
            {this.renderSettingsSelectRow('Lattice Derivation', latticeOptions, latticeDerivation, (value) =>
              link.send('tray:action', 'setLatticeDerivation', value)
            )}
            {this.renderSettingsSelectRow(
              'Lattice Accounts',
              accountLimitOptions,
              latticeAccountLimit,
              (value) => link.send('tray:action', 'setLatticeAccountLimit', value)
            )}
            {this.renderSettingsSelectRow(
              'Lattice Relay',
              relayOptions,
              this.state.latticeEndpointMode,
              (value) => {
                link.send('tray:action', 'setLatticeEndpointMode', value)
                this.setState({ latticeEndpointMode: value })
              }
            )}
            {this.state.latticeEndpointMode === 'custom' ? (
              <div className='t2SettingsInputRow'>
                <input
                  aria-label='Custom Lattice Relay'
                  placeholder='Custom Relay'
                  spellCheck='false'
                  value={this.state.latticeEndpoint}
                  onChange={(e) => this.inputLatticeEndpoint(e)}
                />
              </div>
            ) : null}
          </div>

          <div className='t2SettingsSection'>
            <div className='t2SettingsSectionTitle'>Tokens</div>
            {this.renderSettingsToggleRow(
              'Auto-Discover Tokens',
              this.store('main.autoDiscoverTokens'),
              () => this.toggleAutoDiscoverTokens(),
              portfolioApiKeyDetail
            )}
            <div className='t2SettingsInputRow'>
              <input
                aria-label='Zerion API Key'
                autoComplete='off'
                placeholder='Zerion API Key'
                spellCheck='false'
                type='password'
                value={portfolioApiKey}
                onChange={(e) => this.inputPortfolioApiKey(e)}
              />
            </div>
            {this.renderSettingsActionRow('Clear Saved Tokens + Activity', 'Clear', () =>
              link.send('tray:action', 'clearSavedTokens')
            )}
          </div>
        </div>
      </div>
    )
  }

  renderAboutOverlay() {
    if (this.state.overlay !== 'about') return null

    // TODO: move this to global state passed over IPC
    // eslint-disable-next-line
    const appVersion = require('../../../package.json').version
    const instanceId = this.store('main.instanceId')

    return (
      <div aria-label='App Info' className='t2Overlay cardShow' role='dialog'>
        <div className='t2OverlayHeader'>
          <div
            aria-label='Back'
            className='t2OverlayBack'
            onClick={() => this.setState({ overlay: null, menuOpen: true, resetConfirm: false })}
            onKeyDown={(e) =>
              this.onKeyboardActivate(e, () =>
                this.setState({ overlay: null, menuOpen: true, resetConfirm: false })
              )
            }
            role='button'
            tabIndex={0}
          >
            {svg.chevronLeft(16)}
          </div>
          <div className='t2OverlayTitle'>App Info</div>
          <div className='t2OverlaySpacer' />
        </div>
        <div className='t2OverlayScroll t2SettingsScroll'>
          <div className='t2SettingsSection'>
            <div
              aria-label='Copy instance ID'
              className='t2InfoRow t2InfoCopyRow'
              onClick={() => this.copyInstanceId(instanceId)}
              onKeyDown={(e) => this.onKeyboardActivate(e, () => this.copyInstanceId(instanceId))}
              role='button'
              tabIndex={0}
            >
              <div className='t2InfoLabel'>Instance ID</div>
              <div className='t2InfoValue t2InfoValueMono'>
                {this.state.instanceIdCopied ? 'Instance ID Copied' : instanceId}
              </div>
            </div>
            <div className='t2InfoRow'>
              <div className='t2InfoLabel'>Version</div>
              <div className='t2InfoValue'>{`v${appVersion}`}</div>
            </div>
            {this.renderSettingsActionRow('View License', 'Open', () =>
              link.send(
                'tray:openExternal',
                'https://github.com/wardenjakx/newframe/blob/main/apps/newframe/LICENSE'
              )
            )}
            {this.state.resetConfirm ? (
              <div className='t2SettingsRow t2SettingsResetConfirm'>
                <div className='t2SettingsRowText'>
                  <div className='t2SettingsRowTitle'>Reset All Settings & Data?</div>
                </div>
                <div className='t2SettingsConfirmActions'>
                  <div
                    className='t2SettingsSmallButton t2SettingsDangerButton'
                    onClick={() => link.send('tray:resetAllSettings')}
                    role='button'
                    tabIndex={0}
                  >
                    Yes
                  </div>
                  <div
                    className='t2SettingsSmallButton'
                    onClick={() => this.setState({ resetConfirm: false })}
                    role='button'
                    tabIndex={0}
                  >
                    No
                  </div>
                </div>
              </div>
            ) : (
              this.renderSettingsActionRow(
                'Reset All Settings & Data',
                'Reset',
                () => this.setState({ resetConfirm: true }),
                true
              )
            )}
          </div>
        </div>
      </div>
    )
  }

  renderInlineAddIcon(icon: string, size = 15) {
    const iconFn = (svg as any)[icon]
    return iconFn ? iconFn(size) : svg.accounts(size)
  }

  renderInlineAddOption({
    active = false,
    icon,
    label,
    onClick,
    optionKey
  }: {
    active?: boolean
    icon: string
    label: string
    onClick: () => void
    optionKey?: string
  }) {
    return (
      <div
        aria-pressed={active}
        aria-label={label}
        className={active ? 't2InlineAddType t2InlineAddTypeSelected' : 't2InlineAddType'}
        key={optionKey}
        onClick={onClick}
        onKeyDown={(e) => this.onKeyboardActivate(e, onClick)}
        role='button'
        tabIndex={0}
      >
        <div className='t2InlineAddTypeIcon'>{this.renderInlineAddIcon(icon)}</div>
        <span>{label}</span>
      </div>
    )
  }

  renderInlineAddRoot() {
    return (
      <div className='t2InlineAddTypes'>
        {inlineAddSections.map((option) =>
          this.renderInlineAddOption({
            active: this.state.addAccountCategory === option.section,
            icon: option.icon,
            label: option.title,
            onClick: () => this.chooseInlineAddCategory(option.section),
            optionKey: option.section
          })
        )}
      </div>
    )
  }

  renderStoredSeedOption(signer: any, seedIndex: number, accounts: Record<string, any>) {
    const wallets = this.seedWallets(signer, accounts)
    const importedWallets = wallets.filter((wallet: any) => wallet.account)
    const expanded = !!this.state.storedSeedExpanded?.[signer.id]
    const visibleWallets = expanded ? importedWallets : importedWallets.slice(0, 3)
    const importedCount = importedWallets.length
    const label = this.seedPhraseLabel(seedIndex)
    const hasMoreWallets = importedWallets.length > 3

    return (
      <div aria-label={`View ${label} wallets`} className='t2StoredSeedCard' key={signer.id}>
        <div className='t2StoredSeedHeader'>
          <div className='t2StoredSeedIcon'>{this.renderInlineAddIcon('seedling')}</div>
          <div className='t2StoredSeedTitle'>{label}</div>
          <div className='t2StoredSeedCount'>{`${importedCount}/${wallets.length}`}</div>
        </div>
        <div className='t2StoredSeedWallets'>
          {visibleWallets.map((wallet: any) => (
            <div className='t2StoredSeedWallet' key={wallet.address}>
              <div className='t2StoredSeedWalletName'>{this.walletDisplayName(wallet)}</div>
              <div className='t2StoredSeedWalletAddress'>{this.shortAddress(wallet.address)}</div>
            </div>
          ))}
          {hasMoreWallets && !expanded ? (
            <div
              aria-label={`Show all ${label} wallets`}
              className='t2StoredSeedMore'
              onClick={(e) => {
                e.stopPropagation()
                this.expandStoredSeed(signer.id)
              }}
              onKeyDown={(e) => {
                e.stopPropagation()
                this.onKeyboardActivate(e, () => this.expandStoredSeed(signer.id))
              }}
              role='button'
              tabIndex={0}
            >
              <span>More wallets</span>
              {svg.chevron(12)}
            </div>
          ) : null}
          <div
            aria-label={`Add address from ${label}`}
            className='t2StoredSeedAddAddress'
            onClick={() => this.setState({ addAccountSelectedSigner: signer.id })}
            onKeyDown={(e) =>
              this.onKeyboardActivate(e, () => this.setState({ addAccountSelectedSigner: signer.id }))
            }
            role='button'
            tabIndex={0}
          >
            {svg.plus(12)}
            <span>Add address</span>
          </div>
        </div>
      </div>
    )
  }

  renderStoredSeedAdd() {
    const signers = Object.values(this.store('main.signers') || {}).filter(
      (signer: any) => signer.type === 'seed'
    )
    const accounts = this.store('main.accounts') || {}
    const selectedSigner = this.state.addAccountSelectedSigner
      ? this.store('main.signers', this.state.addAccountSelectedSigner)
      : null

    if (!signers.length) {
      return (
        <div className='t2InlineAddEmpty'>
          <div>No stored recovery phrases</div>
          <div
            aria-label='Create recovery phrase'
            className='t2InlineAddSubmit'
            onClick={() => this.chooseInlineAddCategory('createSeed')}
            onKeyDown={(e) => this.onKeyboardActivate(e, () => this.chooseInlineAddCategory('createSeed'))}
            role='button'
            tabIndex={0}
          >
            {svg.plus(12)}
            <span>Create recovery phrase</span>
          </div>
          <div
            aria-label='Import recovery phrase'
            className='t2InlineAddSubmit t2InlineAddSubmitSubtle'
            onClick={() =>
              this.setState({
                addAccountCategory: 'import',
                addAccountType: 'seed',
                addGeneratedPhrase: '',
                addGeneratedPhraseBackedUp: false,
                addGeneratedPhraseCopied: false
              })
            }
            onKeyDown={(e) =>
              this.onKeyboardActivate(e, () =>
                this.setState({
                  addAccountCategory: 'import',
                  addAccountType: 'seed',
                  addGeneratedPhrase: '',
                  addGeneratedPhraseBackedUp: false,
                  addGeneratedPhraseCopied: false
                })
              )
            }
            role='button'
            tabIndex={0}
          >
            {svg.seedling(12)}
            <span>Import recovery phrase</span>
          </div>
        </div>
      )
    }

    if (!selectedSigner) {
      return (
        <div className='t2StoredSeedCards'>
          {signers.map((signer: any, seedIndex: number) =>
            this.renderStoredSeedOption(signer, seedIndex, accounts)
          )}
        </div>
      )
    }

    return (
      <div className='t2DerivedAccounts'>
        {selectedSigner.addresses.map((address: string, index: number) => {
          const id = address.toLowerCase()
          const account = accounts[id]
          const imported = !!account
          const wallet = { account, address, id, index }
          return (
            <div
              aria-label={`${imported ? 'Select' : 'Add'} ${this.walletDisplayName(wallet)}`}
              className={imported ? 't2DerivedAccountRow t2DerivedAccountImported' : 't2DerivedAccountRow'}
              key={address}
              onClick={() => this.createStoredSeedAccount(selectedSigner, address)}
              onKeyDown={(e) =>
                this.onKeyboardActivate(e, () => this.createStoredSeedAccount(selectedSigner, address))
              }
              role='button'
              tabIndex={0}
            >
              <div className='t2DerivedAccountIndex'>{index + 1}.</div>
              <div className='t2DerivedAccountIdentity'>
                <div className='t2DerivedAccountName'>{this.walletDisplayName(wallet)}</div>
                <div className='t2DerivedAccountAddress'>{this.shortAddress(address)}</div>
              </div>
              <div className='t2DerivedAccountValue'>
                {imported ? this.accountNavValue(accounts[id]) : '$0.00'}
              </div>
              {imported ? <div className='t2DerivedAccountBadge'>Imported</div> : null}
              <div className='t2DerivedAccountCheck'>{imported ? svg.check(11) : null}</div>
            </div>
          )
        })}
      </div>
    )
  }

  renderCreateSeedPhrase() {
    const phrase = (this.state.addGeneratedPhrase || '').trim()
    const words = phrase ? phrase.split(/\s+/) : []

    return (
      <div className='t2InlineAddForm'>
        <div className='t2SeedCreateNotice'>
          <div className='t2SeedCreateNoticeIcon'>{svg.alert(14)}</div>
          <span>Save these words in order. Newframe cannot recover them later.</span>
        </div>
        {words.length ? (
          <div className='t2SeedPhraseGrid' aria-label='Generated recovery phrase'>
            {words.map((word: string, index: number) => (
              <div className='t2SeedPhraseWord' key={`${word}-${index}`}>
                <span>{index + 1}</span>
                <strong>{word}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className='t2InlineAddEmpty'>
            <div>{this.state.addAccountStatus || 'Preparing recovery phrase'}</div>
          </div>
        )}
        <div className='t2SeedPhraseActions'>
          <div
            aria-label='Copy recovery phrase'
            className='t2SettingsSmallButton'
            onClick={() => this.copyGeneratedSeedPhrase()}
            onKeyDown={(e) => this.onKeyboardActivate(e, () => this.copyGeneratedSeedPhrase())}
            role='button'
            tabIndex={0}
          >
            {this.state.addGeneratedPhraseCopied ? 'Copied' : 'Copy'}
          </div>
          <div
            aria-label='Generate new recovery phrase'
            className='t2SettingsSmallButton'
            onClick={() => this.generateInlineSeedPhrase()}
            onKeyDown={(e) => this.onKeyboardActivate(e, () => this.generateInlineSeedPhrase())}
            role='button'
            tabIndex={0}
          >
            New phrase
          </div>
        </div>
        <div
          aria-checked={this.state.addGeneratedPhraseBackedUp}
          aria-label='Recovery phrase saved'
          className={
            this.state.addGeneratedPhraseBackedUp
              ? 't2SeedBackupCheck t2SeedBackupCheckOn'
              : 't2SeedBackupCheck'
          }
          onClick={() =>
            this.setState({ addGeneratedPhraseBackedUp: !this.state.addGeneratedPhraseBackedUp })
          }
          onKeyDown={(e) =>
            this.onKeyboardActivate(e, () =>
              this.setState({ addGeneratedPhraseBackedUp: !this.state.addGeneratedPhraseBackedUp })
            )
          }
          role='checkbox'
          tabIndex={0}
        >
          <div className='t2SeedBackupBox'>{this.state.addGeneratedPhraseBackedUp ? svg.check(9) : null}</div>
          <span>I saved this recovery phrase</span>
        </div>
        <div className='t2InlineInput'>
          <label>Account name</label>
          <input
            aria-label='Account name'
            spellCheck='false'
            value={this.state.addAccountName}
            onChange={(e) => this.setState({ addAccountName: e.target.value })}
          />
        </div>
        {this.needsFramePassword() ? (
          <div className='t2InlineInput'>
            <label>{this.framePasswordLabel()}</label>
            <input
              aria-label={this.framePasswordLabel()}
              spellCheck='false'
              type='password'
              value={this.state.addAccountPassword}
              onChange={(e) => this.setState({ addAccountPassword: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') this.createGeneratedSeedAccount()
              }}
            />
          </div>
        ) : null}
        {this.state.addAccountError ? (
          <div className='t2InlineAddError'>{this.state.addAccountError}</div>
        ) : null}
        {this.state.addAccountStatus && words.length ? (
          <div className='t2InlineAddStatus'>{this.state.addAccountStatus}</div>
        ) : null}
        <div
          aria-label='Create account'
          className='t2InlineAddSubmit'
          onClick={() => this.createGeneratedSeedAccount()}
          onKeyDown={(e) => this.onKeyboardActivate(e, () => this.createGeneratedSeedAccount())}
          role='button'
          tabIndex={0}
        >
          {svg.plus(12)}
          <span>Create account</span>
        </div>
      </div>
    )
  }

  renderImportOptions() {
    if (this.state.addAccountType) return this.renderInlineAddForm()

    return (
      <div className='t2InlineAddTypes'>
        {inlineImportTypes.map((option) =>
          this.renderInlineAddOption({
            active: this.state.addAccountType === option.type,
            icon: option.icon,
            label: option.title,
            onClick: () => this.chooseInlineAddType(option.type),
            optionKey: option.type
          })
        )}
      </div>
    )
  }

  renderHardwareOptions() {
    if (this.state.addAccountType) return this.renderHardwareAdd()

    return (
      <div className='t2InlineAddTypes'>
        {inlineHardwareTypes.map((option) =>
          this.renderInlineAddOption({
            icon: option.icon,
            label: option.title,
            onClick: () => this.chooseInlineAddType(option.type),
            optionKey: option.type
          })
        )}
      </div>
    )
  }

  renderHardwareAdd() {
    const type = this.state.addAccountType
    const signers = Object.values(this.store('main.signers') || {}).filter(
      (signer: any) => signer.type === type
    )
    const selectedSigner = this.state.addAccountSelectedSigner
      ? this.store('main.signers', this.state.addAccountSelectedSigner)
      : null
    const title = type === 'ledger' ? 'Ledger' : type === 'trezor' ? 'Trezor' : 'GridPlus'

    if (selectedSigner && selectedSigner.type === type) {
      return this.renderHardwareSignerDetails(selectedSigner, title)
    }

    return (
      <div className='t2InlineAddForm'>
        {signers.length === 0 ? (
          <div className='t2InlineAddEmpty'>
            <div>{`Unlock your ${title} to get started`}</div>
            {type === 'lattice' ? null : (
              <div className='t2InlineAddStatus'>{`${title} will appear here when detected`}</div>
            )}
          </div>
        ) : (
          <div className='t2DerivedAccounts'>
            {signers.map((signer: any) => {
              const addressCount = Array.isArray(signer.addresses) ? signer.addresses.length : 0
              return (
                <div
                  aria-label={`View ${signer.name || title} accounts`}
                  className='t2DerivedAccountRow'
                  key={signer.id}
                  onClick={() => this.selectHardwareSigner(signer.id)}
                  onKeyDown={(e) => this.onKeyboardActivate(e, () => this.selectHardwareSigner(signer.id))}
                  role='button'
                  tabIndex={0}
                >
                  <div className='t2DerivedAccountIndex'>
                    {this.renderInlineAddIcon(
                      type === 'ledger' ? 'ledger' : type === 'trezor' ? 'trezor' : 'lattice',
                      14
                    )}
                  </div>
                  <div className='t2DerivedAccountAddress'>{signer.name || title}</div>
                  <div className='t2DerivedAccountValue'>{signer.status || 'Detected'}</div>
                  <div className='t2DerivedAccountBadge'>{`${addressCount} accounts`}</div>
                  <div className='t2DerivedAccountCheck'>{svg.arrowRight(11)}</div>
                </div>
              )
            })}
          </div>
        )}
        {type === 'lattice' ? this.renderLatticeAdd() : null}
      </div>
    )
  }

  renderLatticeAdd() {
    return (
      <div className='t2LatticeCreateForm'>
        <div className='t2InlineInput'>
          <label>Device name</label>
          <input
            aria-label='Lattice device name'
            spellCheck='false'
            value={this.state.addAccountName}
            onChange={(e) =>
              this.setState({ addAccountName: e.target.value.replace(/\s+/g, '-').substring(0, 14) })
            }
          />
        </div>
        <div className='t2InlineInput'>
          <label>Device ID</label>
          <input
            aria-label='Lattice device ID'
            spellCheck='false'
            value={this.state.addAccountInput}
            onChange={(e) => this.setState({ addAccountInput: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') this.createLatticeSigner()
            }}
          />
        </div>
        {this.state.addAccountError ? (
          <div className='t2InlineAddError'>{this.state.addAccountError}</div>
        ) : null}
        {this.state.addAccountStatus ? (
          <div className='t2InlineAddStatus'>{this.state.addAccountStatus}</div>
        ) : null}
        <div
          aria-label='Create Lattice signer'
          className='t2InlineAddSubmit'
          onClick={() => this.createLatticeSigner()}
          onKeyDown={(e) => this.onKeyboardActivate(e, () => this.createLatticeSigner())}
          role='button'
          tabIndex={0}
        >
          {svg.plus(12)}
          <span>Create signer</span>
        </div>
      </div>
    )
  }

  renderHardwareSignerDetails(signer: any, title: string) {
    const addresses = Array.isArray(signer.addresses) ? signer.addresses : []
    const status = (signer.status || '').toLowerCase()
    const loading = ['loading', 'connecting', 'addresses', 'input', 'pairing', 'deriving'].some((part) =>
      status.includes(part)
    )

    return (
      <div className='t2InlineAddForm'>
        <div className='t2HardwareSignerHeader'>
          <div className='t2HardwareSignerIcon'>{this.renderInlineAddIcon(signer.type, 16)}</div>
          <div className='t2HardwareSignerText'>
            <div className='t2HardwareSignerName'>{signer.name || title}</div>
            <div className='t2HardwareSignerStatus'>{signer.status || 'Detected'}</div>
          </div>
          {loading ? <div className='loader' /> : null}
        </div>
        {this.renderHardwareSignerAction(signer, status)}
        {addresses.length ? (
          <div className='t2DerivedAccounts'>
            {addresses.map((address: string, index: number) => {
              const id = address.toLowerCase()
              const accounts = this.store('main.accounts') || {}
              const imported = !!accounts[id]
              return (
                <div
                  aria-label={`${imported ? 'Select' : 'Add'} ${this.shortAddress(address)}`}
                  className={
                    imported ? 't2DerivedAccountRow t2DerivedAccountImported' : 't2DerivedAccountRow'
                  }
                  key={address}
                  onClick={() => this.addHardwareAccount(signer, address)}
                  onKeyDown={(e) =>
                    this.onKeyboardActivate(e, () => this.addHardwareAccount(signer, address))
                  }
                  role='button'
                  tabIndex={0}
                >
                  <div className='t2DerivedAccountIndex'>{index + 1}.</div>
                  <div className='t2DerivedAccountAddress'>{this.shortAddress(address)}</div>
                  <div className='t2DerivedAccountValue'>
                    {imported ? this.accountNavValue(accounts[id]) : '$0.00'}
                  </div>
                  {imported ? <div className='t2DerivedAccountBadge'>Imported</div> : null}
                  <div className='t2DerivedAccountCheck'>{imported ? svg.check(11) : null}</div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className='t2InlineAddEmpty'>
            <div>{loading ? 'Loading accounts' : 'No accounts loaded yet'}</div>
          </div>
        )}
        {this.state.addAccountError ? (
          <div className='t2InlineAddError'>{this.state.addAccountError}</div>
        ) : null}
        {this.state.addAccountStatus ? (
          <div className='t2InlineAddStatus'>{this.state.addAccountStatus}</div>
        ) : null}
        <div className='t2HardwareActions'>
          <div
            aria-label={`Reconnect ${title}`}
            className='t2SettingsSmallButton'
            onClick={() => this.reloadHardwareSigner(signer)}
            onKeyDown={(e) => this.onKeyboardActivate(e, () => this.reloadHardwareSigner(signer))}
            role='button'
            tabIndex={0}
          >
            Reconnect
          </div>
          <div
            aria-label={`Remove ${title}`}
            className='t2SettingsSmallButton t2SettingsDangerButton'
            onClick={() => this.removeHardwareSigner(signer)}
            onKeyDown={(e) => this.onKeyboardActivate(e, () => this.removeHardwareSigner(signer))}
            role='button'
            tabIndex={0}
          >
            Remove
          </div>
        </div>
      </div>
    )
  }

  renderHardwareSignerAction(signer: any, status: string) {
    if (signer.type === 'trezor' && status === 'need pin') {
      return (
        <div className='t2HardwareChallenge'>
          <div className='t2HardwarePinDots'>
            {(this.state.addHardwarePin || '').split('').map((_: string, index: number) => (
              <span key={index} />
            ))}
          </div>
          <div className='t2HardwarePinPad'>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <div
                aria-label={`PIN position ${num}`}
                className='t2HardwarePinButton'
                key={num}
                onClick={() => this.addHardwarePinDigit(num)}
                onKeyDown={(e) => this.onKeyboardActivate(e, () => this.addHardwarePinDigit(num))}
                role='button'
                tabIndex={0}
              >
                {svg.octicon('primitive-dot', { height: 18 })}
              </div>
            ))}
          </div>
          <div className='t2HardwareActions'>
            <div
              aria-label='Submit Trezor PIN'
              className='t2SettingsSmallButton'
              onClick={() => this.submitHardwarePin(signer)}
              onKeyDown={(e) => this.onKeyboardActivate(e, () => this.submitHardwarePin(signer))}
              role='button'
              tabIndex={0}
            >
              Submit PIN
            </div>
            <div
              aria-label='Delete PIN digit'
              className='t2SettingsSmallButton'
              onClick={() => this.backspaceHardwarePin()}
              onKeyDown={(e) => this.onKeyboardActivate(e, () => this.backspaceHardwarePin())}
              role='button'
              tabIndex={0}
            >
              Delete
            </div>
          </div>
        </div>
      )
    }

    if (signer.type === 'trezor' && status === 'enter passphrase') {
      const allowsDeviceEntry = (signer.capabilities || []).includes('Capability_PassphraseEntry')

      return (
        <div className='t2HardwareChallenge'>
          <div className='t2InlineInput'>
            <label>Passphrase</label>
            <input
              aria-label='Trezor passphrase'
              spellCheck='false'
              type='password'
              value={this.state.addHardwarePhrase}
              onChange={(e) => this.setState({ addHardwarePhrase: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') this.submitHardwarePhrase(signer)
              }}
            />
          </div>
          <div className='t2HardwareActions'>
            <div
              aria-label='Submit Trezor passphrase'
              className='t2SettingsSmallButton'
              onClick={() => this.submitHardwarePhrase(signer)}
              onKeyDown={(e) => this.onKeyboardActivate(e, () => this.submitHardwarePhrase(signer))}
              role='button'
              tabIndex={0}
            >
              Submit
            </div>
            {allowsDeviceEntry ? (
              <div
                aria-label='Enter passphrase on Trezor'
                className='t2SettingsSmallButton'
                onClick={() => this.submitHardwarePhraseOnDevice(signer)}
                onKeyDown={(e) => this.onKeyboardActivate(e, () => this.submitHardwarePhraseOnDevice(signer))}
                role='button'
                tabIndex={0}
              >
                On device
              </div>
            ) : null}
          </div>
        </div>
      )
    }

    if (signer.type === 'lattice' && status === 'pair') {
      return (
        <div className='t2HardwareChallenge'>
          <div className='t2InlineInput'>
            <label>Pairing code</label>
            <input
              aria-label='GridPlus pairing code'
              spellCheck='false'
              value={this.state.addHardwarePairCode}
              onChange={(e) => this.setState({ addHardwarePairCode: (e.target.value || '').toUpperCase() })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') this.pairHardwareLattice(signer)
              }}
            />
          </div>
          <div
            aria-label='Pair GridPlus'
            className='t2InlineAddSubmit'
            onClick={() => this.pairHardwareLattice(signer)}
            onKeyDown={(e) => this.onKeyboardActivate(e, () => this.pairHardwareLattice(signer))}
            role='button'
            tabIndex={0}
          >
            {svg.check(12)}
            <span>Pair</span>
          </div>
        </div>
      )
    }

    return null
  }

  renderInlineAddForm() {
    const inputLabel =
      this.state.addAccountType === 'watch'
        ? 'Address or gns/ens name'
        : this.state.addAccountType === 'seed'
          ? 'Recovery phrase'
          : 'Private key'
    const showAccountInput = this.state.addAccountType !== 'keystore'

    return (
      <div className='t2InlineAddForm'>
        {showAccountInput ? (
          <div className='t2InlineInput'>
            <label>{inputLabel}</label>
            {this.state.addAccountType === 'seed' ? (
              <textarea
                aria-label={inputLabel}
                spellCheck='false'
                value={this.state.addAccountInput}
                onChange={(e) => this.setState({ addAccountInput: e.target.value })}
              />
            ) : (
              <input
                aria-label={inputLabel}
                spellCheck='false'
                value={this.state.addAccountInput}
                onChange={(e) => this.setState({ addAccountInput: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') this.createInlineAccount()
                }}
              />
            )}
          </div>
        ) : (
          <div
            aria-label='Choose JSON backup file'
            className='t2InlineAddFile'
            onClick={() => this.locateInlineKeystore()}
            onKeyDown={(e) => this.onKeyboardActivate(e, () => this.locateInlineKeystore())}
            role='button'
            tabIndex={0}
          >
            <div className='t2InlineAddFileIcon'>{svg.file(14)}</div>
            <span>
              {this.state.addAccountKeystore ? 'JSON backup file selected' : 'Choose JSON backup file'}
            </span>
          </div>
        )}
        {this.state.addAccountType === 'keystore' ? (
          <div className='t2InlineInput'>
            <label>JSON backup file password</label>
            <input
              aria-label='JSON backup file password'
              spellCheck='false'
              type='password'
              value={this.state.addAccountKeystorePassword}
              onChange={(e) => this.setState({ addAccountKeystorePassword: e.target.value })}
            />
          </div>
        ) : null}
        <div className='t2InlineInput'>
          <label>Account name</label>
          <input
            aria-label='Account name'
            spellCheck='false'
            value={this.state.addAccountName}
            onChange={(e) => this.setState({ addAccountName: e.target.value })}
          />
        </div>
        {this.needsFramePassword() ? (
          <div className='t2InlineInput'>
            <label>{this.framePasswordLabel()}</label>
            <input
              aria-label={this.framePasswordLabel()}
              spellCheck='false'
              type='password'
              value={this.state.addAccountPassword}
              onChange={(e) => this.setState({ addAccountPassword: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') this.createInlineAccount()
              }}
            />
          </div>
        ) : null}
        {this.state.addAccountError ? (
          <div className='t2InlineAddError'>{this.state.addAccountError}</div>
        ) : null}
        {this.state.addAccountStatus ? (
          <div className='t2InlineAddStatus'>{this.state.addAccountStatus}</div>
        ) : null}
        <div
          aria-label='Create account'
          className='t2InlineAddSubmit'
          onClick={() => this.createInlineAccount()}
          onKeyDown={(e) => this.onKeyboardActivate(e, () => this.createInlineAccount())}
          role='button'
          tabIndex={0}
        >
          {svg.plus(12)}
          <span>Create account</span>
        </div>
      </div>
    )
  }

  renderInlineAddBody() {
    if (this.state.addAccountCategory === 'createSeed') return this.renderCreateSeedPhrase()
    if (this.state.addAccountCategory === 'storedSeed') return this.renderStoredSeedAdd()
    if (this.state.addAccountCategory === 'import') return this.renderImportOptions()
    if (this.state.addAccountCategory === 'hardware') return this.renderHardwareOptions()
    if (this.state.addAccountCategory === 'watch') return this.renderInlineAddForm()
    return this.renderInlineAddRoot()
  }

  renderInlineAddAccount() {
    return (
      <div className='t2InlineAdd'>
        <div className='t2InlineAddHeader'>
          <div
            aria-label='Back'
            className='t2InlineAddBack'
            onClick={() => this.backInlineAdd()}
            onKeyDown={(e) => this.onKeyboardActivate(e, () => this.backInlineAdd())}
            role='button'
            tabIndex={0}
          >
            {svg.chevronLeft(14)}
          </div>
          <div className='t2InlineAddTitle'>Add account</div>
        </div>
        {this.renderInlineAddBody()}
      </div>
    )
  }

  renderPrivateKeyExport(accounts: Record<string, any>) {
    const account = accounts[this.state.accountExporting]
    if (!account) return null

    const hasSecret = !!this.state.accountExportSecret
    const keyText = hasSecret
      ? this.state.accountExportSecret
      : '0x0000000000000000000000000000000000000000000000000000000000000000'

    return (
      <div className='t2PrivateKeyExport'>
        <div className='t2PrivateKeyHeader'>
          <div
            aria-label='Back to accounts'
            className='t2PrivateKeyBack'
            onClick={() => this.closePrivateKeyExport()}
            onKeyDown={(e) => this.onKeyboardActivate(e, () => this.closePrivateKeyExport())}
            role='button'
            tabIndex={0}
          >
            {svg.chevronLeft(14)}
          </div>
          <div className='t2PrivateKeyTitle'>Private key export</div>
        </div>
        <div className='t2PrivateKeyBody'>
          {!hasSecret ? (
            <div className='t2InlineInput t2PrivateKeyPassword'>
              <label>Newframe password</label>
              <input
                aria-label='Private key export password'
                autoFocus
                placeholder='Enter password'
                type='password'
                value={this.state.accountExportPassword}
                onChange={(e) => this.setState({ accountExportPassword: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') this.unlockPrivateKeyExport(account)
                }}
              />
            </div>
          ) : null}
          <div
            className={
              hasSecret && this.state.accountExportRevealed
                ? 't2PrivateKeyBox'
                : 't2PrivateKeyBox t2PrivateKeyBoxBlurred'
            }
          >
            {keyText}
          </div>
          {this.state.accountExportError ? (
            <div className='t2PrivateKeyError'>{this.state.accountExportError}</div>
          ) : null}
          <div className='t2PrivateKeyActions'>
            {hasSecret ? (
              <div
                aria-label='Copy private key'
                className='t2PrivateKeyAction'
                onClick={() => this.copyExportedPrivateKey()}
                onKeyDown={(e) => this.onKeyboardActivate(e, () => this.copyExportedPrivateKey())}
                role='button'
                tabIndex={0}
              >
                {this.state.accountExportCopied ? svg.check(13) : svg.copy(13)}
                <span>{this.state.accountExportCopied ? 'Copied' : 'Copy key'}</span>
              </div>
            ) : (
              <div
                aria-label='Unlock private key export'
                className='t2PrivateKeyAction'
                onClick={() => this.unlockPrivateKeyExport(account)}
                onKeyDown={(e) => this.onKeyboardActivate(e, () => this.unlockPrivateKeyExport(account))}
                role='button'
                tabIndex={0}
              >
                {svg.key(13)}
                <span>{this.state.accountExportLoading ? 'Unlocking' : 'Unlock export'}</span>
              </div>
            )}
            {hasSecret ? (
              <div
                aria-label={this.state.accountExportRevealed ? 'Hide private key' : 'Reveal private key'}
                className='t2PrivateKeyAction t2PrivateKeyActionSubtle'
                onClick={() => this.setState({ accountExportRevealed: !this.state.accountExportRevealed })}
                onKeyDown={(e) =>
                  this.onKeyboardActivate(e, () =>
                    this.setState({ accountExportRevealed: !this.state.accountExportRevealed })
                  )
                }
                role='button'
                tabIndex={0}
              >
                {svg.eye(13)}
                <span>{this.state.accountExportRevealed ? 'Hide key' : 'Reveal key'}</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className='t2PrivateKeyWarning'>
          <div className='t2PrivateKeyWarningIcon'>{svg.alert(18)}</div>
          <div>
            Warning: Never disclose this key. Anyone with your private key can steal any assets held in your
            account.
          </div>
        </div>
      </div>
    )
  }

  renderAccountsPanel(current: string) {
    if (!this.state.accountsOpen) return null
    const accounts = this.store('main.accounts') || {}
    const ids = this.orderedAccountIds(accounts)
    const accountQuery = this.state.accountQuery.trim()
    const visibleIds = ids.filter((id) => this.accountMatchesQuery(accounts[id], accountQuery))

    return (
      <div aria-label='Accounts' className='t2Overlay t2AccountsPanel cardShow' role='dialog'>
        {!this.state.accountExporting ? (
          <div className='t2OverlayHeader t2AccountsHeader'>
            <div className='t2AccountsTitle'>Accounts</div>
            <div
              aria-label='Close accounts'
              className='t2AccountsClose'
              onClick={() => this.closeAccountsPanel()}
              onKeyDown={(e) => this.onKeyboardActivate(e, () => this.closeAccountsPanel())}
              role='button'
              tabIndex={0}
            >
              {svg.x(13)}
            </div>
          </div>
        ) : null}
        {this.state.accountExporting ? (
          <div className='t2OverlayScroll t2AccountsScroll'>{this.renderPrivateKeyExport(accounts)}</div>
        ) : this.state.addingAccount ? (
          <div className='t2OverlayScroll t2AccountsScroll'>{this.renderInlineAddAccount()}</div>
        ) : (
          <>
            <div className='t2AccountsTools'>
              <div className='t2AccountsSearch'>
                <div className='t2AccountsSearchIcon'>{svg.search(11)}</div>
                <input
                  aria-label='Search accounts'
                  placeholder='Search accounts'
                  spellCheck='false'
                  defaultValue={this.state.accountQuery}
                  ref={(input) => {
                    this.accountSearchInput = input
                  }}
                  onChange={(e) => this.updateAccountSearch(e.target.value)}
                />
                {this.state.accountQuery ? (
                  <div
                    aria-label='Clear account search'
                    className='t2AccountsSearchClear'
                    onClick={() => this.clearAccountSearch()}
                    onKeyDown={(e) => this.onKeyboardActivate(e, () => this.clearAccountSearch())}
                    role='button'
                    tabIndex={0}
                  >
                    {svg.x(10)}
                  </div>
                ) : null}
              </div>
              <div
                aria-label='Add account'
                className='t2AccountsAddSmall'
                onClick={() => this.startInlineAdd()}
                onKeyDown={(e) => this.onKeyboardActivate(e, () => this.startInlineAdd())}
                role='button'
                tabIndex={0}
              >
                {svg.plus(12)}
                <span>Add account</span>
              </div>
            </div>
            {this.state.addAccountError ? (
              <div className='t2AccountsNotice t2AccountsNoticeBad'>{this.state.addAccountError}</div>
            ) : null}
            <div className='t2OverlayScroll t2AccountsScroll'>
              {visibleIds.map((id) => {
                const account = accounts[id]
                const selected = id === current
                const navValue = this.accountNavValue(account)
                const renaming = this.state.accountRenaming === id
                const menuOpen = this.state.accountMenu === id
                const confirmingRemove = this.state.accountRemoving === id
                const confirmSeedPhraseRemoval =
                  confirmingRemove && this.isLastAccountForSeedPhrase(account, accounts)
                const rowClass = [
                  't2AccountRow',
                  selected ? 't2AccountRowSelected' : '',
                  this.state.draggingAccount === id ? 't2AccountRowDragging' : '',
                  this.state.dragOverAccount === id ? 't2AccountRowDropTarget' : ''
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <div
                    aria-current={selected ? 'true' : undefined}
                    aria-label={`${this.accountDisplayName(account)} ${this.shortAddress(account.address)}`}
                    key={id}
                    className={rowClass}
                    onDragOver={(e) => this.dragAccountOver(e, id)}
                    onDrop={(e) => this.dropAccount(e, id)}
                    onClick={() => {
                      this.setState({ accountsOpen: false })
                      if (!selected) link.rpc('setSigner', id, () => {})
                    }}
                    onKeyDown={(e) =>
                      this.onKeyboardActivate(e, () => {
                        this.setState({ accountsOpen: false })
                        if (!selected) link.rpc('setSigner', id, () => {})
                      })
                    }
                    role='button'
                    tabIndex={0}
                  >
                    <div
                      aria-label={`Drag ${this.accountDisplayName(account)} to reorder`}
                      className='t2AccountDragHandle'
                      draggable
                      onClick={(e) => e.stopPropagation()}
                      onDragEnd={() => this.endAccountDrag()}
                      onDragStart={(e) => this.startAccountDrag(e, id)}
                      title='Drag to reorder'
                    >
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className='t2AccountRowIcon'>{this.accountIcon(account, 18)}</div>
                    <div className='t2AccountRowInfo'>
                      {renaming ? (
                        <AccountRenameInput
                          ariaLabel={`Rename ${this.accountDisplayName(account)}`}
                          initialName={this.accountDisplayName(account)}
                          onCancel={() => this.setState({ accountRenaming: '' })}
                          onCommit={(name) => this.saveRenameAccount(id, name)}
                        />
                      ) : (
                        <div className='t2AccountRowName'>
                          {this.accountDisplayName(account)}
                          <div
                            aria-label={`Rename ${this.accountDisplayName(account)}`}
                            className='t2AccountInlineEdit'
                            onClick={(e) => {
                              e.stopPropagation()
                              this.startRenameAccount(account)
                            }}
                            onKeyDown={(e) => {
                              e.stopPropagation()
                              this.onKeyboardActivate(e, () => this.startRenameAccount(account))
                            }}
                            role='button'
                            tabIndex={0}
                          >
                            {svg.pencil(10)}
                          </div>
                        </div>
                      )}
                      <div className='t2AccountRowAddress'>{this.shortAddress(account.address)}</div>
                      <div className='t2AccountRowType'>{this.accountTypeLabel(account)}</div>
                    </div>
                    <div className='t2AccountRowRight'>
                      <div className='t2AccountRowValue'>{navValue}</div>
                      {selected ? <div className='t2AccountRowCheck'>{svg.check(14)}</div> : null}
                      <div
                        aria-label={`Copy address for ${this.accountDisplayName(account)}`}
                        className='t2AccountIconButton'
                        onClick={(e) => {
                          e.stopPropagation()
                          this.copyAccountAddress(account)
                        }}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          this.onKeyboardActivate(e, () => this.copyAccountAddress(account))
                        }}
                        role='button'
                        tabIndex={0}
                      >
                        {this.state.accountCopied === id ? svg.check(12) : svg.copy(12)}
                      </div>
                      <div
                        aria-expanded={menuOpen}
                        aria-label={`${this.accountDisplayName(account)} account actions`}
                        className='t2AccountIconButton'
                        onClick={(e) => {
                          e.stopPropagation()
                          this.setState({ accountMenu: menuOpen ? '' : id, accountRemoving: '' })
                        }}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          this.onKeyboardActivate(e, () =>
                            this.setState({ accountMenu: menuOpen ? '' : id, accountRemoving: '' })
                          )
                        }}
                        role='button'
                        tabIndex={0}
                      >
                        {svg.ellipsis(12)}
                      </div>
                    </div>
                    {menuOpen ? (
                      <div className='t2AccountActionsMenu' onClick={(e) => e.stopPropagation()}>
                        <div
                          className='t2AccountAction'
                          onClick={() => this.startRenameAccount(account)}
                          onKeyDown={(e) =>
                            this.onKeyboardActivate(e, () => this.startRenameAccount(account))
                          }
                          role='button'
                          tabIndex={0}
                        >
                          Rename account
                        </div>
                        {this.isHotAccount(account) ? (
                          <div
                            className='t2AccountAction'
                            onClick={() => this.openPrivateKeyExport(account)}
                            onKeyDown={(e) =>
                              this.onKeyboardActivate(e, () => this.openPrivateKeyExport(account))
                            }
                            role='button'
                            tabIndex={0}
                          >
                            Export private key
                          </div>
                        ) : null}
                        {confirmSeedPhraseRemoval ? (
                          <div className='t2AccountSeedPrompt'>
                            <div className='t2AccountSeedPromptTitle'>Delete seed phrase from wallet?</div>
                            <div className='t2AccountSeedPromptDetail'>
                              This is the last account using this seed phrase.
                            </div>
                            <div
                              className='t2AccountAction'
                              onClick={() => this.removeAccount(id)}
                              onKeyDown={(e) => this.onKeyboardActivate(e, () => this.removeAccount(id))}
                              role='button'
                              tabIndex={0}
                            >
                              Keep seed phrase
                            </div>
                            <div
                              className='t2AccountAction t2AccountActionDanger'
                              onClick={() => this.removeAccount(id, { removeSeedPhrase: true })}
                              onKeyDown={(e) =>
                                this.onKeyboardActivate(e, () =>
                                  this.removeAccount(id, { removeSeedPhrase: true })
                                )
                              }
                              role='button'
                              tabIndex={0}
                            >
                              Delete seed phrase
                            </div>
                            <div
                              className='t2AccountAction'
                              onClick={() => this.setState({ accountRemoving: '' })}
                              onKeyDown={(e) =>
                                this.onKeyboardActivate(e, () => this.setState({ accountRemoving: '' }))
                              }
                              role='button'
                              tabIndex={0}
                            >
                              Cancel
                            </div>
                          </div>
                        ) : confirmingRemove ? (
                          <div
                            className='t2AccountAction t2AccountActionDanger'
                            onClick={() => this.removeAccount(id)}
                            onKeyDown={(e) => this.onKeyboardActivate(e, () => this.removeAccount(id))}
                            role='button'
                            tabIndex={0}
                          >
                            Confirm remove
                          </div>
                        ) : (
                          <div
                            className='t2AccountAction t2AccountActionDanger'
                            onClick={() => this.setState({ accountRemoving: id })}
                            onKeyDown={(e) =>
                              this.onKeyboardActivate(e, () => this.setState({ accountRemoving: id }))
                            }
                            role='button'
                            tabIndex={0}
                          >
                            Remove account
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })}
              {visibleIds.length === 0 ? <div className='t2EmptyState'>No Accounts Found</div> : null}
            </div>
          </>
        )}
      </div>
    )
  }

  override render() {
    const current = this.store('selected.current')
    const accounts = this.store('main.accounts') || {}
    const account = accounts[current]
    const balances = account ? this.getBalances(account.address) : []
    const notifications = this.store('view.notifications') || {}

    return (
      <div className='t2Home'>
        {this.renderTopBar(account)}
        {this.renderMenu(account)}
        <StatusNotifications
          notifications={notifications}
          renderChainIcon={(notification) => {
            const chainId = Number(notification.leadingIcon?.chainId || notification.target?.chainId)
            return chainId ? this.chainIcon(chainId, 16, 10, 8) : null
          }}
          onDismiss={(id) => link.send('tray:action', 'dismissNotification', id)}
          onExpire={(id) => link.send('tray:action', 'expireNotification', id)}
          onOpen={(notification) => this.openActivityTarget(notification.target)}
        />
        {this.renderHero(balances)}
        {this.renderTabs()}
        {this.renderSearch()}
        <div className='t2Main'>
          {this.state.tab === 'positions'
            ? this.renderPositions(balances)
            : this.state.tab === 'activity'
              ? this.renderActivity(account)
              : this.renderOrders(account)}
        </div>
        {this.renderNetworksOverlay(balances)}
        {this.renderAssetDetailsOverlay()}
        {this.renderActivityDetails()}
        {this.renderOrderDetails()}
        {this.renderRequestsOverlay(current)}
        {this.renderDappsOverlay(current)}
        {this.renderAddChainOverlay()}
        {this.renderReceiveOverlay(accounts)}
        {this.renderSettingsOverlay()}
        {this.renderAboutOverlay()}
        {this.renderAccountsPanel(current)}
      </div>
    )
  }
}

export default Restore.connect(Home)
