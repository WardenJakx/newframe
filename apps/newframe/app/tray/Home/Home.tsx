import React, { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

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
import { toCanonicalAssetId } from '../../../resources/domain/dappLauncher'
import { cachedImageUrl, isCachedImageReference } from '../../../resources/domain/imageCache'
import { matchFilter } from '../../../resources/utils'
import { chainColorCssVariable } from '../../../resources/style/tokens/colors'
import { useWalletSelector } from '../../state/useAppSelector'
import type { WalletRendererState } from '../../../resources/state/projections'

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
  getContraPreposition,
  getDirectionLabel
} from '../../../resources/domain/flash/pair'
import { getFlashDefaultChainId, isFlashChainSupported } from '../../../resources/domain/flash/chains'
import { type FlashTradeSide } from '../../../resources/domain/flash/schemas'
import AccountRenameInput from './AccountRenameInput'
import AddressQRCode from './AddressQRCode'
import StatusNotifications, { timestamp } from './StatusNotifications'

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
const TRADE_DISABLED_CHAIN_LABEL = 'Trade unavailable on this chain'
type RecordById<T = any> = Record<string | number, T>
type HomeAccount = WalletRendererState['accounts'][string]
type HomeSigner = WalletRendererState['signers'][string]

type HomeRendererState = WalletRendererState

interface HomeSharedState {
  accountOrder: string[]
  accounts: Record<string, HomeAccount>
  activity: Record<string, any>
  autoDiscoverTokens: boolean
  autohide: boolean
  balances: Record<string, any[]>
  biometricUnlock: boolean
  currentAccount: string
  homeCommand: any
  instanceId: string
  latticeAccountLimit?: number
  latticeDerivation?: string
  latticeEndpoint: string
  latticeEndpointMode: string
  launch: boolean
  ledgerDerivation?: string
  liveAccountLimit?: number
  menubarGasPrice: boolean
  networks: RecordById
  networksMeta: RecordById
  notifications: Record<string, any>
  orders: Record<string, any>
  origins: Record<string, any>
  permissions: Record<string, Record<string, any>>
  platform: string
  portfolioApiKey: string
  rates: Record<string, any>
  reveal: boolean
  runtime: Record<string, any>
  selectedOpen: boolean
  showLocalNameWithENS: boolean
  showTestnets: boolean
  signers: Record<string, HomeSigner>
  summonShortcut: any
  trezorDerivation?: string
}

interface HomeProps {
  shared: HomeSharedState
}

const EMPTY_ARRAY: any[] = []
const EMPTY_RECORD: Record<string, any> = {}

const selectHomeSharedState = (state: HomeRendererState): HomeSharedState => {
  const main = state

  return {
    accountOrder: main.accountOrder || EMPTY_ARRAY,
    accounts: main.accounts || EMPTY_RECORD,
    activity: main.activity || EMPTY_RECORD,
    autoDiscoverTokens: !!main.autoDiscoverTokens,
    autohide: !!main.autohide,
    balances: main.balances || EMPTY_RECORD,
    biometricUnlock: !!main.biometricUnlock,
    currentAccount: main.currentAccount || '',
    homeCommand: state.tray?.homeCommand || null,
    instanceId: main.instanceId || '',
    latticeAccountLimit: main.latticeSettings?.accountLimit,
    latticeDerivation: main.latticeSettings?.derivation,
    latticeEndpoint: main.latticeSettings?.endpointCustom || '',
    latticeEndpointMode: main.latticeSettings?.endpointMode || 'default',
    launch: !!main.launch,
    ledgerDerivation: main.ledger?.derivation,
    liveAccountLimit: main.ledger?.liveAccountLimit,
    menubarGasPrice: !!main.menubarGasPrice,
    networks: main.networks?.ethereum || EMPTY_RECORD,
    networksMeta: main.networksMeta?.ethereum || EMPTY_RECORD,
    notifications: state.view?.notifications || EMPTY_RECORD,
    orders: main.orders || EMPTY_RECORD,
    origins: main.origins || EMPTY_RECORD,
    permissions: main.permissions || EMPTY_RECORD,
    platform: state.platform || '',
    portfolioApiKey: main.portfolioApiKey || '',
    rates: main.rates || EMPTY_RECORD,
    reveal: !!main.reveal,
    runtime: main.runtime || EMPTY_RECORD,
    selectedOpen: !!state.selected?.open,
    showLocalNameWithENS: !!main.showLocalNameWithENS,
    showTestnets: !!main.showTestnets,
    signers: main.signers || EMPTY_RECORD,
    summonShortcut: main.shortcuts?.summon,
    trezorDerivation: main.trezor?.derivation
  }
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

export function Home(props: HomeProps) {
  const instance = useRef({
    refreshTimer: undefined as any,
    inputLatticeTimeout: undefined as any,
    inputPortfolioApiKeyTimeout: undefined as any,
    instanceIdCopiedTimeout: undefined as any,
    seedPhraseCopiedTimeout: undefined as any,
    accountFeedbackTimeout: undefined as any,
    accountSearchTimeout: undefined as any,
    lastHomeCommandId: 0,
    accountSearchInput: null as HTMLInputElement | null,
    orderCancelPending: '',
    hydratingChainIcons: new Set<number>(),
    selectBalanceSummaries: createBalanceSummarySelector()
  }).current

  const { latticeEndpoint, latticeEndpointMode, portfolioApiKey } = props.shared
  const [state, setHomeState] = useState<any>({
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
  })
  const setState = (update: any, callback?: () => void) => {
    setHomeState((current: any) => ({
      ...current,
      ...(typeof update === 'function' ? update(current, props) : update)
    }))
    if (callback) setTimeout(callback, 0)
  }

  useEffect(() => {
    return () => {
      clearTimeout(instance.refreshTimer)
      clearTimeout(instance.inputLatticeTimeout)
      clearTimeout(instance.inputPortfolioApiKeyTimeout)
      clearTimeout(instance.instanceIdCopiedTimeout)
      clearTimeout(instance.seedPhraseCopiedTimeout)
      clearTimeout(instance.accountFeedbackTimeout)
      clearTimeout(instance.accountSearchTimeout)
    }
  }, [])

  useEffect(() => {
    const { accounts, currentAccount: current, selectedOpen: open } = props.shared
    if (!current || !open) {
      const id = current || Object.keys(accounts)[0]
      if (id) void link.executeCommand({ type: 'account.select', accountId: id })
    }
  }, [])

  useEffect(() => {
    consumeHomeCommand(props.shared.homeCommand)
  }, [props.shared.homeCommand])

  useEffect(() => {
    hydrateVisibleChainIcons()
  }, [state.network, state.overlay])

  function consumeHomeCommand(command: any) {
    if (!command || command.id === instance.lastHomeCommandId) return

    instance.lastHomeCommandId = command.id
    applyHomeCommand(command)
    const deferredForChainApproval =
      (command.view === 'networks' && command.data?.newChain && !command.data?.request) ||
      (command.view === 'addChain' && !command.data?.request)
    if (!deferredForChainApproval) {
      void link.executeCommand({ type: 'home.command-consume', commandId: command.id })
    }
  }

  function applyHomeCommand(command: any) {
    const { view, data = {} } = command

    if (view === 'settings') {
      return setState({
        overlay: 'settings',
        menuOpen: false,
        accountsOpen: false,
        latticeEndpoint: props.shared.latticeEndpoint,
        latticeEndpointMode: props.shared.latticeEndpointMode,
        portfolioApiKey: props.shared.portfolioApiKey,
        portfolioApiKeyRequired: false
      })
    }

    if (view === 'networks') {
      if (data.newChain && Object.keys(data.newChain).length > 0) {
        return setState({
          overlay: 'addChain',
          menuOpen: false,
          accountsOpen: false,
          pendingChainRequest: { chain: data.newChain, homeCommandId: command.id }
        })
      }

      return setState({
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
      return setState({
        overlay: 'addChain',
        menuOpen: false,
        accountsOpen: false,
        pendingChainRequest: { ...data, ...(!data.request ? { homeCommandId: command.id } : {}) }
      })
    }

    if (view === 'accounts') {
      if (data.showAddAccounts) {
        return openInlineAdd(data.newAccountType, data.selectedSigner)
      }

      return setState({
        overlay: null,
        menuOpen: false,
        accountsOpen: true,
        accountMenu: ''
      })
    }
  }

  function getChains() {
    const networks = props.shared.networks
    return Object.keys(networks).map((id) => ({ chainId: parseInt(id), ...networks[id] }))
  }

  function getShowTestnets() {
    return props.shared.showTestnets
  }

  function shouldShowChain(chain: any) {
    return !!chain && (!chain.isTestnet || getShowTestnets())
  }

  function getVisibleChains() {
    return getChains().filter((chain) => shouldShowChain(chain))
  }

  function operationError(result: { ok: false; error: string }, fallback: string) {
    return 'message' in result && typeof result.message === 'string' ? result.message : fallback
  }

  async function setBiometricUnlock(enabled: boolean) {
    if (state.biometricsBusy) return

    setState({ biometricsBusy: true, biometricsError: '' })

    try {
      if (!enabled) {
        const result = await link.executeCommand({ type: 'security.configure', mode: 'disabled' })
        if (!result.ok) throw new Error(operationError(result, 'Could not disable biometrics.'))
        return
      }

      let webAuthnError: Error | null = null
      if (await isWebAuthnBiometricsSupported()) {
        try {
          const enrollment = await createWebAuthnBiometricCredential()
          const result = await link.executeCommand({
            type: 'security.configure',
            mode: 'webauthn',
            ...enrollment
          })
          if (!result.ok) throw new Error(operationError(result, 'Could not enable biometrics.'))
          return
        } catch (err: any) {
          if (isBiometricUserCanceledError(err)) throw err
          webAuthnError = err
        }
      }

      const status = await link.executeQuery({ type: 'security.status' })
      if (!status.ok) throw new Error(operationError(status, 'Could not check biometrics.'))
      if (!status.biometrics.nativeAvailable) {
        throw webAuthnError || new Error('Biometrics are not available on this device')
      }

      const result = await link.executeCommand({ type: 'security.configure', mode: 'native' })
      if (!result.ok) throw new Error(operationError(result, 'Could not enable biometrics.'))
    } catch (err: any) {
      setState({
        biometricsError: isBiometricUserCanceledError(err) ? '' : err.message || String(err)
      })
    } finally {
      setState({ biometricsBusy: false })
    }
  }

  async function lockFrame() {
    const result = await link.executeCommand({ type: 'wallet.lock' })
    if (result.ok) {
      setState({ overlay: null, menuOpen: false, biometricsError: '' })
    } else {
      setState({ biometricsError: operationError(result, 'Could not lock Newframe.') })
    }
  }

  function getNetworkPrimaryRpcValue(chain: any) {
    const drafts = state.networkRpcDrafts || {}
    const draft = drafts[chain.chainId]
    return draft !== undefined ? draft : chain.connection?.primary?.custom || ''
  }

  function updateNetworkPrimaryRpc(chainId: number, value: string) {
    setState({
      networkRpcDrafts: {
        ...(state.networkRpcDrafts || {}),
        [chainId]: value.replace(/\s+/g, '')
      }
    })
  }

  async function saveNetworkPrimaryRpc(chainId: number) {
    const value = String(
      state.networkRpcDrafts?.[chainId] ?? props.shared.networks[chainId]?.connection?.primary?.custom ?? ''
    ).trim()
    if (!value) return

    await link.executeCommand({ type: 'network.primary-rpc-set', chainId, url: value })
  }

  function setShowTestnets(value: boolean) {
    void link.executeCommand({ type: 'settings.update', setting: 'show-testnets', value })

    const selectedChain = props.shared.networks[state.network]
    if (!value && selectedChain?.isTestnet) setState({ network: 0 })
  }

  function chainColor(chainId: number) {
    const primaryColor = props.shared.networksMeta[chainId]?.primaryColor
    return chainColorCssVariable(primaryColor)
  }

  // chain icon: cached or remote icon from networksMeta, eth glyph for ethereum
  // chains, colored dot as the last resort (same fallback chain as RingIcon)
  function chainIcon(chainId: number, imgSize = 16, glyphSize = 12, dotSize = 9) {
    const icon = props.shared.networksMeta[chainId]?.icon
    if (icon) {
      return (
        <img src={cachedImageUrl(icon)} alt='' style={{ width: `${imgSize}px`, height: `${imgSize}px` }} />
      )
    }
    const chain = props.shared.networks[chainId] || {}
    const ethChains = ['mainnet', 'görli', 'goerli', 'sepolia', 'ropsten', 'rinkeby', 'kovan']
    if (ethChains.includes((chain.name || '').toLowerCase())) return svg.eth(glyphSize)
    return (
      <div
        className='t2ChainIconDot'
        style={{ background: chainColor(chainId), width: `${dotSize}px`, height: `${dotSize}px` }}
      />
    )
  }

  function chainEnabled(chainId: number) {
    const chain = props.shared.networks[chainId]
    return !!(chain && chain.on)
  }

  function chainIconNeedsHydration(chainId: number) {
    const icon = props.shared.networksMeta[chainId]?.icon
    return !icon || !isCachedImageReference(icon)
  }

  function hydrateChainIcon(chainId: number) {
    if (!chainId || instance.hydratingChainIcons.has(chainId) || !chainIconNeedsHydration(chainId)) return

    instance.hydratingChainIcons.add(chainId)
    link.executeCommand({ type: 'network.icon-hydrate', chainId }).finally(() => {
      instance.hydratingChainIcons.delete(chainId)
    })
  }

  function hydrateVisibleChainIcons() {
    const chains = getVisibleChains()
    const chainIds =
      state.overlay === 'networks'
        ? chains.map((chain) => chain.chainId)
        : state.network
          ? [state.network]
          : chains.filter((chain) => chain.on).map((chain) => chain.chainId)

    chainIds.forEach((chainId) => hydrateChainIcon(chainId))
  }

  function inNetworkFilter(chainId: number) {
    const chain = props.shared.networks[chainId]
    if (!shouldShowChain(chain)) return false
    return state.network === 0 || state.network === chainId
  }

  function getActivityRecords(account: any) {
    const activity = props.shared.activity
    const address = (account?.address || '').toLowerCase()

    return Object.values(activity)
      .filter((record: any) => {
        const recordAddress = (record.account || record.address || '').toLowerCase()
        const chainId = Number(record.chainId)
        return recordAddress === address && inNetworkFilter(chainId)
      })
      .sort(
        (a: any, b: any) =>
          timestamp(b.submittedAt, timestamp(b.updatedAt, 0)) -
          timestamp(a.submittedAt, timestamp(a.updatedAt, 0))
      )
  }

  function normalizeOrderSide(side = ''): FlashTradeSide | '' {
    const normalized = String(side).toLowerCase()
    return normalized === 'buy' || normalized === 'sell' ? normalized : ''
  }

  function getOrderRecords(account: any) {
    const orders = props.shared.orders
    const address = (account?.address || '').toLowerCase()

    return Object.entries(orders)
      .map(([id, order]: [string, any]) => ({ ...order, orderId: order.orderId || id }))
      .filter((order: any) => {
        const orderAddress = (order.accountAddress || order.account || order.address || '').toLowerCase()
        const chainId = Number(order.chainId)
        return orderAddress === address && inNetworkFilter(chainId)
      })
      .sort((a: any, b: any) => {
        const openSort = Number(!isOpenOrder(a)) - Number(!isOpenOrder(b))
        if (openSort !== 0) return openSort

        return (
          timestamp(b.createdAt, timestamp(b.updatedAt, 0)) -
          timestamp(a.createdAt, timestamp(a.updatedAt, 0))
        )
      })
  }

  function orderStatus(order: any) {
    return String(order.status || order.rawStatus || '')
      .trim()
      .toLowerCase()
  }

  function isOpenOrder(order: any) {
    if (order.open === true) return true
    if (order.open === false) return false

    const status = orderStatus(order)
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

  function titleize(value = '') {
    return String(value || '')
      .replace(/[-_]+/g, ' ')
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  }

  function orderStatusLabel(order: any) {
    return titleize(order.status || order.rawStatus || 'Unknown')
  }

  function orderTypeLabel(order: any) {
    return titleize(order.orderType || 'Order')
  }

  function orderSideLabel(order: any) {
    const side = normalizeOrderSide(order.side)
    return side ? getDirectionLabel(side) : titleize(order.side || 'Side')
  }

  function orderAssetSymbol(asset: any) {
    return String(asset?.symbol || asset?.assetSymbol || asset?.ticker || asset?.id || 'Asset').toUpperCase()
  }

  function orderAssetName(asset: any) {
    return String(asset?.name || orderAssetSymbol(asset))
  }

  function formatOrderAmount(value: any) {
    if (value === undefined || value === null || value === '') return ''

    const numeric = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''))
    if (Number.isFinite(numeric)) {
      return numeric.toLocaleString(undefined, {
        maximumFractionDigits: numeric >= 1 ? 6 : 8
      })
    }

    return String(value)
  }

  function orderSize(order: any) {
    const size = formatOrderAmount(order.qty)
    if (!size) return ''

    return `${size} ${orderAssetSymbol(order.targetAsset)}`
  }

  function orderDate(value: any) {
    const time = timestamp(value, 0)
    if (!time) return ''

    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(time))
  }

  function orderDateTime(value: any) {
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

  function orderPairIntent(order: any) {
    const side = normalizeOrderSide(order.side)
    const targetSymbol = orderAssetSymbol(order.targetAsset)
    const contraSymbol = orderAssetSymbol(order.contraAsset)

    if (!side) return `${targetSymbol} / ${contraSymbol}`

    return formatPairIntent({
      side,
      targetAsset: { ...(order.targetAsset || {}), symbol: targetSymbol } as any,
      contraAsset: { ...(order.contraAsset || {}), symbol: contraSymbol } as any
    })
  }

  function orderJson(value: any) {
    if (value === undefined || value === null) return ''

    try {
      return JSON.stringify(value, null, 2)
    } catch (err) {
      return String(value)
    }
  }

  function orderErrorMessage(error: any, fallback: string) {
    if (!error) return fallback
    if (typeof error === 'string') return error
    if (error.message) return error.message
    if (error.error?.message) return error.error.message

    return fallback
  }

  function orderCancelErrorMessage(orderId: string) {
    const error = state.orderCancelError
    return error?.orderId === orderId ? error.message : ''
  }

  function copyActivityValue(value?: string) {
    if (!value) return
    void link.executeCommand({ type: 'clipboard.write', text: value })
  }

  function activityRequestLike(activity: any) {
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

  function getBalances(address: string) {
    const rawBalances = props.shared.balances[address] || []
    const { networks, networksMeta, rates } = props.shared
    const showTestnets = getShowTestnets()

    return instance.selectBalanceSummaries({
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

  function accountNavValue(account: any) {
    if (!account || !account.address) return '---'
    const rawBalances = props.shared.balances[account.address]
    if (!Array.isArray(rawBalances) || rawBalances.length === 0) return '---'

    const total = getBalances(account.address).reduce(
      (sum: number, balance: any) => sum + balance.totalValue,
      0
    )
    return `$${formatUsdRate(total, 2)}`
  }

  function openSend(asset?: any) {
    if (asset && !hasPositiveBalance(asset)) return
    if (!asset && !selectedWalletHasAssets()) return

    void link.executeCommand({
      type: 'dapp.open',
      feature: 'send',
      assetId: toCanonicalAssetId(asset)
    })
  }

  function firstTradeAsset(balances: any[] = []) {
    return balances.find((balance) => {
      const chainId = Number(balance?.chainId)

      return (
        hasPositiveBalance(balance) &&
        Number.isInteger(chainId) &&
        chainEnabled(chainId) &&
        isFlashChainSupported(chainId, props.shared.runtime)
      )
    })
  }

  function tradeChainId(asset?: any, balances: any[] = []) {
    const assetChainId = Number(asset?.chainId)
    if (Number.isInteger(assetChainId) && assetChainId > 0) return assetChainId

    const tradeAssetChainId = Number(firstTradeAsset(balances)?.chainId)
    if (Number.isInteger(tradeAssetChainId) && tradeAssetChainId > 0) return tradeAssetChainId

    const selectedChainId = Number(state.network)
    if (Number.isInteger(selectedChainId) && selectedChainId > 0) return selectedChainId

    return getFlashDefaultChainId(props.shared.runtime)
  }

  function canOpenTrade(asset?: any, balances: any[] = []) {
    if (!asset && !firstTradeAsset(balances)) return false

    const chainId = tradeChainId(asset, balances)
    return chainEnabled(chainId) && isFlashChainSupported(chainId, props.shared.runtime)
  }

  function tradeTitle(asset?: any, balances: any[] = []) {
    return canOpenTrade(asset, balances) ? 'Trade' : TRADE_DISABLED_CHAIN_LABEL
  }

  function openTrade(asset?: any, balances: any[] = []) {
    const contextAsset = asset || firstTradeAsset(balances)
    if (!canOpenTrade(contextAsset, balances)) return
    const chainId = tradeChainId(contextAsset, balances)

    void link.executeCommand({
      type: 'dapp.open',
      feature: 'trade',
      assetId: asset ? toCanonicalAssetId(asset) : '',
      chainId
    })
  }

  function openActivityTarget(target: any) {
    const activityId = target?.activityId || target?.hash || ''
    if (!activityId) return

    const current = props.shared.currentAccount
    const account = target.account || ''

    if (account && account !== current) {
      void link.executeCommand({ type: 'account.select', accountId: account })
    }

    setState({
      tab: 'activity',
      query: '',
      overlay: null,
      accountsOpen: false,
      orderDetails: '',
      activityDetails: activityId
    })
  }

  function openActivity(activity: any) {
    if (!activity?.id) return

    setState({
      tab: 'activity',
      query: '',
      overlay: null,
      accountsOpen: false,
      orderDetails: '',
      activityDetails: activity.id
    })
  }

  function openOrder(order: any) {
    if (!order?.orderId) return

    setState({
      tab: 'orders',
      query: '',
      overlay: null,
      accountsOpen: false,
      activityDetails: '',
      orderDetails: order.orderId
    })
  }

  async function cancelOrder(order: any) {
    const orderId = order?.orderId

    if (!orderId || instance.orderCancelPending) return

    instance.orderCancelPending = orderId

    try {
      const result = await link.executeCommand({ type: 'flash.order-cancel', orderId })
      if (!result.ok) throw new Error(operationError(result, 'Cancel failed.'))

      if (instance.orderCancelPending === orderId && state.orderCancelError?.orderId === orderId) {
        setState({ orderCancelError: null })
      }
    } catch (error) {
      if (instance.orderCancelPending === orderId) {
        setState({
          orderCancelError: {
            orderId,
            message: orderErrorMessage(error, 'Cancel failed.')
          }
        })
      }
    } finally {
      if (instance.orderCancelPending === orderId) instance.orderCancelPending = ''
    }
  }

  function selectedWalletHasAssets() {
    const { accounts, currentAccount: current } = props.shared
    const account = accounts[current]

    return !!account && getBalances(account.address).length > 0
  }

  function accountDisplayName(account: any) {
    if (!account) return ''
    const showLocal = props.shared.showLocalNameWithENS
    return account.ensName && !showLocal ? account.ensName : account.name
  }

  function shortAddress(address = '') {
    return address ? `${address.substring(0, 5)}…${address.substring(address.length - 4)}` : ''
  }

  function pendingRequestCount(account: any) {
    const requests = (account && account.requests) || {}
    return Object.keys(requests).filter((id) => requests[id].mode === 'normal').length
  }

  function accountType(account: any) {
    return (account?.lastSignerType || '').toString()
  }

  function isWatchOnlyAccount(account: any) {
    return accountType(account).toLowerCase() === 'address'
  }

  function isHotAccount(account: any) {
    return ['ring', 'seed'].includes(accountType(account).toLowerCase())
  }

  function accountIcon(account: any, size = 16) {
    return isWatchOnlyAccount(account) ? svg.eye(size) : signerIcon(account.lastSignerType, size)
  }

  function accountTypeLabel(account: any) {
    const type = accountType(account)
    return signerTypeLabels[type] || signerTypeLabels[type.toLowerCase()] || type || 'Account'
  }

  function seedPhraseLabel(index: number) {
    return `Seed Phrase ${index + 1}`
  }

  function seedWallets(signer: any, accounts: Record<string, any>) {
    const addresses = Array.isArray(signer?.addresses) ? signer.addresses : []

    return addresses.map((address: string, index: number) => {
      const id = address.toLowerCase()
      return { account: accounts[id], address, id, index }
    })
  }

  function walletDisplayName(wallet: { account?: any; index: number }) {
    return wallet.account ? accountDisplayName(wallet.account) : `Wallet ${wallet.index + 1}`
  }

  function expandStoredSeed(signerId: string) {
    setState({
      storedSeedExpanded: {
        ...(state.storedSeedExpanded || {}),
        [signerId]: true
      }
    })
  }

  function orderedAccountIds(accounts: Record<string, any>) {
    const createdOrder = Object.keys(accounts).sort((a, b) => {
      if (accounts[a].created > accounts[b].created) return 1
      if (accounts[a].created < accounts[b].created) return -1
      return 0
    })
    const accountOrder = props.shared.accountOrder
    const ordered = accountOrder.filter((id) => accounts[id])

    createdOrder.forEach((id) => {
      if (!ordered.includes(id)) ordered.push(id)
    })

    return ordered
  }

  function updateAccountSearch(value: string) {
    clearTimeout(instance.accountSearchTimeout)
    instance.accountSearchTimeout = setTimeout(() => setState({ accountQuery: value }), 80)
  }

  function clearAccountSearch() {
    clearTimeout(instance.accountSearchTimeout)
    if (instance.accountSearchInput) instance.accountSearchInput.value = ''
    setState({ accountQuery: '' })
  }

  function accountMatchesQuery(account: any, query: string) {
    if (!query) return true
    const normalizedQuery = query.toLowerCase()
    const searchText = [
      accountDisplayName(account),
      account.address,
      shortAddress(account.address),
      accountTypeLabel(account)
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return normalizedQuery.split(/\s+/).every((part) => searchText.includes(part))
  }

  function reorderAccount(fromId: string, toId: string) {
    if (!fromId || !toId || fromId === toId) return
    void link.executeCommand({
      type: 'account.reorder',
      fromAccountId: fromId,
      toAccountId: toId
    })
  }

  function startAccountDrag(e: React.DragEvent, accountId: string) {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', accountId)
    setState({ draggingAccount: accountId, dragOverAccount: '' })
  }

  function dragAccountOver(e: React.DragEvent, accountId: string) {
    if (!state.draggingAccount || state.draggingAccount === accountId) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    if (state.dragOverAccount !== accountId) setState({ dragOverAccount: accountId })
  }

  function dropAccount(e: React.DragEvent, accountId: string) {
    e.preventDefault()
    e.stopPropagation()

    const dragged = e.dataTransfer.getData('text/plain') || state.draggingAccount
    reorderAccount(dragged, accountId)
    setState({ draggingAccount: '', dragOverAccount: '' })
  }

  function endAccountDrag() {
    setState({ draggingAccount: '', dragOverAccount: '' })
  }

  function flashAccountFeedback(key: 'accountCopied' | 'accountExported', value: string) {
    clearTimeout(instance.accountFeedbackTimeout)
    setState({ [key]: value })
    instance.accountFeedbackTimeout = setTimeout(() => setState({ [key]: '' }), 1800)
  }

  function copyAccountAddress(account: any) {
    if (!account?.address) return
    void link.executeCommand({ type: 'clipboard.write', text: account.address })
    flashAccountFeedback('accountCopied', account.id)
  }

  function openReceiveAccount(account: any) {
    if (!account?.id) return
    setState({
      overlay: 'receive',
      receiveAccount: account.id,
      accountMenu: '',
      accountsOpen: false
    })
  }

  function startRenameAccount(account: any) {
    setState({
      accountRenaming: account.id,
      accountMenu: '',
      accountRemoving: ''
    })
  }

  function saveRenameAccount(accountId: string, nextName: string) {
    const name = (nextName || '').trim()
    if (name) void link.executeCommand({ type: 'account.rename', accountId, name })
    setState({ accountRenaming: '' })
  }

  function seedSignerForAccount(account?: HomeAccount | null): HomeSigner | null {
    if (accountType(account).toLowerCase() !== 'seed' || !account?.signer) return null

    const signer = props.shared.signers[account.signer]
    return signer?.type === 'seed' ? signer : null
  }

  function isLastAccountForSeedPhrase(account: HomeAccount, accounts: Record<string, HomeAccount>) {
    const signer = seedSignerForAccount(account)
    if (!signer) return false

    return !Object.values(accounts).some((otherAccount) => {
      return otherAccount.id !== account.id && otherAccount.signer === signer.id
    })
  }

  function removeAccount(accountId: string, options: { removeSeedPhrase?: boolean } = {}) {
    void link.executeCommand({
      type: 'account.remove',
      address: accountId,
      removeSeedSigner: !!options.removeSeedPhrase
    })
    setState({ accountRemoving: '', accountMenu: '' })
  }

  function openPrivateKeyExport(account: any) {
    if (!isHotAccount(account)) return

    setState({
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

  function closePrivateKeyExport() {
    setState({
      accountExporting: '',
      accountExportPassword: '',
      accountExportSecret: '',
      accountExportRevealed: false,
      accountExportError: '',
      accountExportLoading: false,
      accountExportCopied: false
    })
  }

  function closeAccountsPanel() {
    setState({
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

  function toggleAccountsPanel() {
    if (state.accountsOpen) return closeAccountsPanel()
    setState({ accountsOpen: true, menuOpen: false })
  }

  async function unlockPrivateKeyExport(account: any) {
    const password = state.accountExportPassword
    if (!account?.address || state.accountExportLoading) return
    if (!password) return setState({ accountExportError: 'Password required' })

    setState({ accountExportLoading: true, accountExportError: '', accountExportCopied: false })

    const result = await link.executeQuery({
      type: 'account.private-key-export',
      accountId: account.address,
      password
    })
    if (result.ok) {
      setState({
        accountExportLoading: false,
        accountExportPassword: '',
        accountExportSecret: result.privateKey,
        accountExportRevealed: false,
        accountExportError: ''
      })
    } else {
      setState({
        accountExportLoading: false,
        accountExportError: operationError(result, 'Could not export the private key.'),
        accountExportSecret: '',
        accountExportRevealed: false
      })
    }
  }

  function copyExportedPrivateKey() {
    if (!state.accountExportSecret) return
    void link.executeCommand({ type: 'clipboard.write', text: state.accountExportSecret })
    setState({ accountExportCopied: true })
  }

  function resetInlineAdd() {
    setState({
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

  function normalizeAddAccountType(type = '') {
    const typeMap: Record<string, string> = {
      keyring: 'privateKey',
      nonsigning: 'watch'
    }

    return typeMap[type] || type
  }

  function addAccountCategoryForType(type = '') {
    if (['seed', 'privateKey', 'keystore'].includes(type)) return 'import'
    if (['ledger', 'trezor', 'lattice'].includes(type)) return 'hardware'
    if (type === 'watch') return 'watch'
    return ''
  }

  function openInlineAdd(type = '', selectedSigner = '') {
    const addAccountType = normalizeAddAccountType(type)
    const addAccountCategory = addAccountCategoryForType(addAccountType)

    setState(
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
      () => refreshAddVaultState()
    )
  }

  function startInlineAdd() {
    openInlineAdd()
  }

  async function refreshAddVaultState() {
    const status = await link.executeQuery({ type: 'security.status' })
    if (status.ok) {
      setState({
        addVaultState: { exists: status.vaultExists, unlocked: !status.locked }
      })
    } else {
      setState({ addVaultState: { exists: false, unlocked: false } })
    }
  }

  function backInlineAdd() {
    if (state.addAccountSelectedSigner) {
      return setState({ addAccountSelectedSigner: '', addAccountError: '', addAccountStatus: '' })
    }

    if (state.addAccountCategory) {
      return setState({
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

    resetInlineAdd()
  }

  function chooseInlineAddCategory(category: string) {
    const addAccountType = category === 'watch' ? 'watch' : category === 'createSeed' ? 'seed' : ''

    setState(
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
        if (category === 'createSeed') generateInlineSeedPhrase()
      }
    )
  }

  function chooseInlineAddType(type: string) {
    setState({
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

  function addErrorMessage(err: any) {
    return err?.message || String(err)
  }

  function isHotInlineImport(type = state.addAccountType) {
    return ['privateKey', 'seed', 'keystore'].includes(type)
  }

  function needsFramePassword() {
    return isHotInlineImport() && (!state.addVaultState || !state.addVaultState.unlocked)
  }

  function framePasswordLabel() {
    return state.addVaultState && state.addVaultState.exists
      ? 'Newframe password'
      : 'Create Newframe password'
  }

  async function createStoredSeedAccount(signer: any, address: string) {
    const accounts = props.shared.accounts
    const id = address.toLowerCase()

    if (accounts[id]) {
      await link.executeCommand({ type: 'account.select', accountId: id })
      return resetInlineAdd()
    }

    setState({ addAccountError: '', addAccountStatus: 'Adding account' })

    const result = await link.executeCommand({
      type: 'account.add-from-signer',
      signerId: signer.id,
      address,
      name: 'Hot Account'
    })
    if (result.ok) {
      resetInlineAdd()
    } else {
      setState({
        addAccountError: operationError(result, 'Could not add the account.'),
        addAccountStatus: ''
      })
    }
  }

  async function locateInlineKeystore() {
    setState({ addAccountError: '', addAccountStatus: 'Selecting JSON backup file' })

    const result = await link.executeCommand({ type: 'keystore.locate' })
    if (result.ok) {
      setState({
        addAccountKeystore: result.keystore,
        addAccountError: '',
        addAccountStatus: 'JSON backup file selected'
      })
    } else {
      setState({
        addAccountKeystore: null,
        addAccountError: operationError(result, 'Could not select the keystore.'),
        addAccountStatus: ''
      })
    }
  }

  function selectHardwareSigner(signerId: string) {
    setState({
      addAccountSelectedSigner: signerId,
      addAccountError: '',
      addAccountStatus: '',
      addHardwarePin: '',
      addHardwarePhrase: '',
      addHardwarePairCode: ''
    })
  }

  async function createLatticeSigner() {
    const deviceId = (state.addAccountInput || '').trim()
    const deviceName = (state.addAccountName || '').trim() || 'GridPlus'

    if (!deviceId) return setState({ addAccountError: 'Device ID required' })

    setState({ addAccountError: '', addAccountStatus: 'Creating Lattice signer' })

    const result = await link.executeCommand({
      type: 'signer.lattice-create',
      deviceId,
      deviceName
    })
    if (result.ok) {
      setState({
        addAccountStatus: 'Connecting to GridPlus',
        addAccountInput: '',
        addAccountName: 'GridPlus',
        addAccountSelectedSigner: result.signerId
      })
    } else {
      setState({
        addAccountError: operationError(result, 'Could not create the GridPlus signer.'),
        addAccountStatus: ''
      })
    }
  }

  function hardwareAccountName(signer: any) {
    const label = signerTypeLabels[signer?.type] || signer?.type || 'Hardware'
    return `${label} Account`
  }

  async function addHardwareAccount(signer: any, address: string) {
    const id = (address || '').toLowerCase()
    if (!signer?.type || !id) return

    const accounts = props.shared.accounts

    if (accounts[id]) {
      await link.executeCommand({ type: 'account.select', accountId: id })
      return resetInlineAdd()
    }

    setState({ addAccountError: '', addAccountStatus: 'Adding account' })

    const result = await link.executeCommand({
      type: 'account.add-from-signer',
      signerId: signer.id,
      address,
      name: hardwareAccountName(signer)
    })
    if (result.ok) resetInlineAdd()
    else {
      setState({
        addAccountError: operationError(result, 'Could not add the hardware account.'),
        addAccountStatus: ''
      })
    }
  }

  function reloadHardwareSigner(signer: any) {
    if (!signer?.id) return
    void link.executeCommand({ type: 'signer.reload', signerId: signer.id })
    setState({ addAccountError: '', addAccountStatus: 'Connecting hardware wallet' })
  }

  function removeHardwareSigner(signer: any) {
    if (!signer?.id) return
    void link.executeCommand({ type: 'signer.disconnect', signerId: signer.id })
    setState({ addAccountSelectedSigner: '', addAccountError: '', addAccountStatus: '' })
  }

  function addHardwarePinDigit(num: number) {
    setState({ addHardwarePin: `${state.addHardwarePin || ''}${num}` })
  }

  function backspaceHardwarePin() {
    setState({ addHardwarePin: (state.addHardwarePin || '').slice(0, -1) })
  }

  function submitHardwarePin(signer: any) {
    if (!signer?.id) return
    if (!state.addHardwarePin) return setState({ addAccountError: 'PIN required' })

    void link.executeCommand({
      type: 'signer.trezor-input',
      signerId: signer.id,
      input: 'pin',
      value: state.addHardwarePin
    })
    setState({ addHardwarePin: '', addAccountError: '', addAccountStatus: 'PIN submitted' })
  }

  function submitHardwarePhrase(signer: any) {
    if (!signer?.id) return
    void link.executeCommand({
      type: 'signer.trezor-input',
      signerId: signer.id,
      input: 'passphrase',
      value: state.addHardwarePhrase || ''
    })
    setState({ addHardwarePhrase: '', addAccountError: '', addAccountStatus: 'Passphrase submitted' })
  }

  function submitHardwarePhraseOnDevice(signer: any) {
    if (!signer?.id) return
    void link.executeCommand({
      type: 'signer.trezor-input',
      signerId: signer.id,
      input: 'device-passphrase'
    })
    setState({ addAccountError: '', addAccountStatus: 'Continue on device' })
  }

  async function pairHardwareLattice(signer: any) {
    if (!signer?.id) return
    if (!state.addHardwarePairCode) return setState({ addAccountError: 'Pairing code required' })

    const result = await link.executeCommand({
      type: 'signer.lattice-pair',
      signerId: signer.id,
      pairCode: state.addHardwarePairCode
    })
    if (result.ok) {
      setState({ addHardwarePairCode: '', addAccountError: '', addAccountStatus: 'GridPlus paired' })
    } else {
      setState({
        addAccountError: operationError(result, 'Could not pair GridPlus.'),
        addAccountStatus: ''
      })
    }
  }

  async function createInlineAccount() {
    const {
      addAccountType,
      addAccountInput,
      addAccountName,
      addAccountPassword,
      addAccountKeystore,
      addAccountKeystorePassword
    } = state
    const input = (addAccountInput || '').trim()
    const name = (addAccountName || '').trim()

    if (!addAccountType) return setState({ addAccountError: 'Choose an account type' })
    if (addAccountType !== 'keystore' && !input) {
      return setState({ addAccountError: 'Account input required' })
    }
    if (needsFramePassword() && !addAccountPassword) {
      return setState({ addAccountError: `${framePasswordLabel()} required` })
    }

    setState({ addAccountError: '', addAccountStatus: 'Adding account' })

    try {
      const result =
        addAccountType === 'watch'
          ? await link.executeCommand({
              type: 'account.watch-add',
              addressOrName: input,
              name: name || 'Watch Account'
            })
          : addAccountType === 'keystore'
            ? addAccountKeystore && addAccountKeystorePassword
              ? await link.executeCommand({
                  type: 'signer.import',
                  source: 'keystore',
                  keystore: addAccountKeystore,
                  keystorePassword: addAccountKeystorePassword,
                  framePassword: addAccountPassword,
                  accountName: name || 'Hot Account'
                })
              : null
            : await link.executeCommand(
                addAccountType === 'seed'
                  ? {
                      type: 'signer.import',
                      source: 'phrase',
                      phrase: input,
                      framePassword: addAccountPassword,
                      accountName: name || 'Hot Account'
                    }
                  : {
                      type: 'signer.import',
                      source: 'private-key',
                      privateKey: input,
                      framePassword: addAccountPassword,
                      accountName: name || 'Hot Account'
                    }
              )

      if (!result) {
        const message = addAccountKeystore
          ? 'JSON backup file password required'
          : 'Choose a JSON backup file'
        return setState({ addAccountError: message, addAccountStatus: '' })
      }
      if (!result.ok) throw new Error(operationError(result, 'Could not add the account.'))
      resetInlineAdd()
    } catch (err: any) {
      setState({ addAccountError: addErrorMessage(err), addAccountStatus: '' })
    }
  }

  function refreshPortfolioBalances(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    if (state.refreshingPortfolio) return

    setState({ refreshingPortfolio: true })

    link.executeCommand({ type: 'portfolio.refresh' }).finally(() => {
      instance.refreshTimer = setTimeout(() => setState({ refreshingPortfolio: false }), 1000)
    })
  }

  function inputLatticeEndpoint(e: React.ChangeEvent<HTMLInputElement>) {
    e.preventDefault()
    clearTimeout(instance.inputLatticeTimeout)
    const value = e.target.value.replace(/\s+/g, '')
    setState({ latticeEndpoint: value })
    instance.inputLatticeTimeout = setTimeout(
      () =>
        void link.executeCommand({
          type: 'settings.update',
          setting: 'lattice-endpoint',
          value: state.latticeEndpoint
        }),
      1000
    )
  }

  function inputPortfolioApiKey(e: React.ChangeEvent<HTMLInputElement>) {
    e.preventDefault()
    clearTimeout(instance.inputPortfolioApiKeyTimeout)
    const value = e.target.value.replace(/\s+/g, '')
    setState({ portfolioApiKey: value, portfolioApiKeyRequired: false })
    instance.inputPortfolioApiKeyTimeout = setTimeout(
      () =>
        void link.executeCommand({
          type: 'settings.update',
          setting: 'portfolio-api-key',
          value: state.portfolioApiKey
        }),
      1000
    )
  }

  function toggleAutoDiscoverTokens() {
    const enabled = props.shared.autoDiscoverTokens

    if (enabled) {
      return void link.executeCommand({
        type: 'settings.update',
        setting: 'auto-discover-tokens',
        value: false
      })
    }

    const apiKey = (state.portfolioApiKey || '').trim()
    if (!apiKey) return setState({ portfolioApiKeyRequired: true })

    clearTimeout(instance.inputPortfolioApiKeyTimeout)
    void link.executeCommand({
      type: 'settings.update',
      setting: 'auto-discover-tokens',
      value: true,
      apiKey
    })
    setState({ portfolioApiKey: apiKey, portfolioApiKeyRequired: false })
  }

  function copyInstanceId(instanceId: string) {
    clearTimeout(instance.instanceIdCopiedTimeout)
    void link.executeCommand({ type: 'clipboard.write', text: instanceId })
    setState({ instanceIdCopied: true })
    instance.instanceIdCopiedTimeout = setTimeout(() => setState({ instanceIdCopied: false }), 1800)
  }

  async function generateInlineSeedPhrase() {
    setState({
      addAccountError: '',
      addAccountStatus: 'Generating recovery phrase',
      addGeneratedPhrase: '',
      addGeneratedPhraseBackedUp: false,
      addGeneratedPhraseCopied: false
    })

    const result = await link.executeQuery({ type: 'seed.generate' })
    if (result.ok) {
      setState({
        addGeneratedPhrase: result.phrase,
        addAccountError: '',
        addAccountStatus: ''
      })
    } else {
      setState({
        addAccountError: operationError(result, 'Could not generate a recovery phrase.'),
        addAccountStatus: '',
        addGeneratedPhrase: ''
      })
    }
  }

  function copyGeneratedSeedPhrase() {
    const phrase = state.addGeneratedPhrase
    if (!phrase) return

    clearTimeout(instance.seedPhraseCopiedTimeout)
    void link.executeCommand({ type: 'clipboard.write', text: phrase })
    setState({ addGeneratedPhraseCopied: true })
    instance.seedPhraseCopiedTimeout = setTimeout(() => setState({ addGeneratedPhraseCopied: false }), 1800)
  }

  async function createGeneratedSeedAccount() {
    const phrase = (state.addGeneratedPhrase || '').trim()
    const name = (state.addAccountName || '').trim()
    const password = state.addAccountPassword || ''

    if (!phrase) return setState({ addAccountError: 'Generate a recovery phrase first' })
    if (!state.addGeneratedPhraseBackedUp) {
      return setState({ addAccountError: 'Confirm that you saved the recovery phrase' })
    }
    if (needsFramePassword() && !password) {
      return setState({ addAccountError: `${framePasswordLabel()} required` })
    }

    setState({ addAccountError: '', addAccountStatus: 'Creating account' })

    const result = await link.executeCommand({
      type: 'signer.import',
      source: 'phrase',
      phrase,
      framePassword: password,
      accountName: name || 'Hot Account'
    })
    if (result.ok) resetInlineAdd()
    else {
      setState({
        addAccountError: operationError(result, 'Could not create the account.'),
        addAccountStatus: ''
      })
    }
  }

  function signerIcon(type: string, size = 16) {
    if ((type || '').toLowerCase() === 'address') return svg.eye(size)
    if (type === 'ledger') return svg.ledger(size)
    if (type === 'trezor') return svg.trezor(size)
    if (type === 'lattice') return svg.lattice(size)
    return svg.flame(size + 2)
  }

  function onKeyboardActivate(e: React.KeyboardEvent, action: () => void) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      action()
    }
  }

  function renderToggle(on: boolean, onClick: () => void, label?: string) {
    return (
      <div
        aria-checked={on}
        aria-label={label}
        className={on ? 't2Toggle t2ToggleOn' : 't2Toggle'}
        onClick={onClick}
        onKeyDown={(e) => onKeyboardActivate(e, onClick)}
        role='switch'
        tabIndex={0}
      >
        <div className='t2ToggleKnob' />
      </div>
    )
  }

  function renderTopBar(account: any) {
    const name = account ? accountDisplayName(account) : 'Add Account'
    const address = account ? shortAddress(account.address) : ''
    return (
      <div className='t2TopBar'>
        <div className='t2AccountPill'>
          <div
            aria-expanded={state.accountsOpen}
            aria-haspopup='dialog'
            aria-label='Accounts'
            className='t2AccountPillIdentity'
            onClick={() => toggleAccountsPanel()}
            onKeyDown={(e) => onKeyboardActivate(e, () => toggleAccountsPanel())}
            role='button'
            tabIndex={0}
          >
            <div className='t2AccountPillIcon'>{account ? accountIcon(account) : svg.accounts(16)}</div>
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
                  copyAccountAddress(account)
                }}
                onKeyDown={(e) => onKeyboardActivate(e, () => copyAccountAddress(account))}
                role='button'
                tabIndex={0}
                title='Copy address'
              >
                {state.accountCopied === account.id ? svg.check(13) : svg.copy(13)}
              </div>
              <div
                aria-label='Show account QR code'
                className='t2AccountPillAction'
                onClick={(e) => {
                  e.stopPropagation()
                  openReceiveAccount(account)
                }}
                onKeyDown={(e) => onKeyboardActivate(e, () => openReceiveAccount(account))}
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
          aria-expanded={state.menuOpen}
          aria-haspopup='dialog'
          aria-label='Main menu'
          className='t2MenuButton'
          onClick={() => setState({ menuOpen: !state.menuOpen, accountsOpen: false })}
          onKeyDown={(e) =>
            onKeyboardActivate(e, () => setState({ menuOpen: !state.menuOpen, accountsOpen: false }))
          }
          role='button'
          tabIndex={0}
        >
          {svg.bars(16)}
        </div>
      </div>
    )
  }

  function renderShortcut() {
    const { platform, summonShortcut: shortcut } = props.shared
    const modifiers = (shortcut.modifierKeys || []).map((key: string) => {
      if (key === 'Alt') return platform === 'darwin' ? 'Option' : 'Alt'
      if (key === 'Meta' || key === 'Super') return platform === 'darwin' ? 'Cmd' : 'Win'
      if (key === 'Control' || key === 'CommandOrControl') return 'Ctrl'
      return key
    })
    const key = shortcutKeyDisplay[shortcut.shortcutKey] || shortcut.shortcutKey
    return [...modifiers, key].join(' + ')
  }

  function renderMenuPanelRow({
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
        onKeyDown={(e) => onKeyboardActivate(e, onClick)}
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

  function renderSettingsToggleRow(label: string, on: boolean, toggle: () => void, detail?: string) {
    return (
      <div key={label} className='t2SettingsRow'>
        <div className='t2SettingsRowText'>
          <div className='t2SettingsRowTitle'>{label}</div>
          {detail ? <div className='t2SettingsRowDetail'>{detail}</div> : null}
        </div>
        {renderToggle(on, toggle, label)}
      </div>
    )
  }

  function renderSettingsSelectRow(
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
        onKeyDown={(e) => onKeyboardActivate(e, () => onChange(next.value))}
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

  function renderSettingsActionRow(label: string, action: string, onClick: () => void, danger = false) {
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
        onKeyDown={(e) => onKeyboardActivate(e, onClick)}
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

  function renderMenu(account: any) {
    if (!state.menuOpen) return null

    const requestCount = pendingRequestCount(account)

    return (
      <div aria-label='Main menu' className='t2Overlay t2MenuPanel cardShow' role='dialog'>
        <div className='t2OverlayHeader t2MenuPanelHeader'>
          <div className='t2OverlaySpacer' />
          <div className='t2OverlayTitle'>Menu</div>
          <div
            aria-label='Close menu'
            className='t2AccountsClose'
            onClick={() => setState({ menuOpen: false })}
            onKeyDown={(e) => onKeyboardActivate(e, () => setState({ menuOpen: false }))}
            role='button'
            tabIndex={0}
          >
            {svg.x(13)}
          </div>
        </div>
        <div className='t2MenuPanelScroll'>
          <div className='t2MenuPanelSection'>
            {renderMenuPanelRow({
              label: 'Requests',
              detail: requestCount ? `${requestCount} pending` : 'No pending requests',
              icon: svg.inbox(16),
              right: (
                <div className={requestCount ? 't2MenuBadge t2MenuBadgeActive' : 't2MenuBadge'}>
                  {requestCount}
                </div>
              ),
              onClick: () => setState({ overlay: 'requests', menuOpen: false })
            })}
            {renderMenuPanelRow({
              label: 'Dapps',
              detail: 'Connected permissions',
              icon: svg.window(16),
              onClick: () => setState({ overlay: 'dapps', menuOpen: false })
            })}
            {renderMenuPanelRow({
              label: 'Settings',
              detail: 'App, shortcuts, signer defaults',
              icon: svg.settings(16),
              onClick: () =>
                setState({
                  overlay: 'settings',
                  menuOpen: false,
                  latticeEndpoint: props.shared.latticeEndpoint,
                  latticeEndpointMode: props.shared.latticeEndpointMode,
                  portfolioApiKey: props.shared.portfolioApiKey,
                  portfolioApiKeyRequired: false,
                  resetConfirm: false
                })
            })}
          </div>

          <div className='t2MenuPanelSection'>
            {renderMenuPanelRow({
              label: 'App Info',
              detail: props.shared.instanceId,
              icon: svg.copy(16),
              onClick: () => setState({ overlay: 'about', menuOpen: false })
            })}
            {renderMenuPanelRow({
              label: 'Quit',
              icon: svg.x(15),
              danger: true,
              onClick: () => void link.executeCommand({ type: 'app.quit' })
            })}
          </div>
        </div>
      </div>
    )
  }

  function renderHero(balances: any[]) {
    const hasAssets = balances.length > 0
    const canTrade = canOpenTrade(undefined, balances)
    const total = balances
      .filter((balance) => inNetworkFilter(balance.chainId))
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
            className={state.refreshingPortfolio ? 't2HeroRefresh t2HeroRefreshActive' : 't2HeroRefresh'}
            onMouseDown={(e) => refreshPortfolioBalances(e)}
            onKeyDown={(e) => onKeyboardActivate(e, () => refreshPortfolioBalances(e as any))}
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
            onClick={hasAssets ? () => openSend() : undefined}
            onKeyDown={hasAssets ? (e) => onKeyboardActivate(e, () => openSend()) : undefined}
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
            onClick={canTrade ? () => openTrade(undefined, balances) : undefined}
            onKeyDown={
              canTrade ? (e) => onKeyboardActivate(e, () => openTrade(undefined, balances)) : undefined
            }
            role='button'
            tabIndex={canTrade ? 0 : -1}
            title={tradeTitle(undefined, balances)}
          >
            <div className='t2HeroButtonIcon'>{svg.sync(14)}</div>
            <span>Trade</span>
          </div>
        </div>
      </div>
    )
  }

  function renderTabs() {
    const { tab, network } = state
    const chains = getVisibleChains()
    const enabledChains = chains.filter((chain) => chain.on)
    const selectedChain = network !== 0 && chains.find((chain) => chain.chainId === network)

    return (
      <div className='t2TabRow'>
        <div aria-label='Home sections' className='t2Tabs' role='tablist'>
          <div
            aria-selected={tab === 'positions'}
            className='t2Tab'
            onClick={() => setState({ tab: 'positions' })}
            onKeyDown={(e) => onKeyboardActivate(e, () => setState({ tab: 'positions' }))}
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
            onClick={() => setState({ tab: 'activity', query: '' })}
            onKeyDown={(e) => onKeyboardActivate(e, () => setState({ tab: 'activity', query: '' }))}
            role='tab'
            tabIndex={tab === 'activity' ? 0 : -1}
          >
            <div className={tab === 'activity' ? 't2TabLabel t2TabLabelActive' : 't2TabLabel'}>Activity</div>
            <div className={tab === 'activity' ? 't2TabBar t2TabBarActive' : 't2TabBar'} />
          </div>
          <div
            aria-selected={tab === 'orders'}
            className='t2Tab'
            onClick={() => setState({ tab: 'orders', query: '' })}
            onKeyDown={(e) => onKeyboardActivate(e, () => setState({ tab: 'orders', query: '' }))}
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
          onClick={() => setState({ overlay: 'networks', netQuery: '', kebab: 0 })}
          onKeyDown={(e) =>
            onKeyboardActivate(e, () => setState({ overlay: 'networks', netQuery: '', kebab: 0 }))
          }
          role='button'
          tabIndex={0}
        >
          {selectedChain ? (
            <div className='t2PillChainIcon'>{chainIcon(selectedChain.chainId, 16, 12, 9)}</div>
          ) : (
            <div className='t2NetworkDots'>
              {enabledChains.slice(0, 4).map((chain) => (
                <div
                  key={chain.chainId}
                  className='t2NetworkDotSmall'
                  style={{ background: chainColor(chain.chainId) }}
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

  function renderSearch() {
    if (state.tab !== 'positions') return null
    return (
      <div className='t2SearchWrap'>
        <div className='t2Search'>
          <div className='t2SearchIcon'>{svg.search(12)}</div>
          <input
            aria-label='Filter assets'
            type='text'
            spellCheck='false'
            placeholder='Filter assets'
            value={state.query}
            onChange={(e) => setState({ query: e.target.value })}
          />
          {state.query ? (
            <div
              aria-label='Clear asset filter'
              className='t2SearchClear'
              onClick={() => setState({ query: '' })}
              onKeyDown={(e) => onKeyboardActivate(e, () => setState({ query: '' }))}
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

  function renderTokenRow(balance: DisplayedBalance, i: number, className = 't2TokenRow cardShow') {
    const change = balance.priceChange ? parseFloat(balance.priceChange) : 0
    const fiatValue = formatBalanceNotionalValue(balance)
    const { networks, networksMeta } = props.shared
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
        onClick={() => setState({ assetDetails: balance })}
        onKeyDown={(e) => onKeyboardActivate(e, () => setState({ assetDetails: balance }))}
        role='button'
        tabIndex={0}
      >
        <TokenOptionRow item={item} networks={networks} networksMeta={networksMeta} showRightSubLabel />
      </div>
    )
  }

  function renderPositionListMore(hiddenCount: number, label: string, onClick: () => void) {
    if (hiddenCount <= 0) return null

    return (
      <div
        aria-label={label}
        className='t2PositionListMore'
        onClick={onClick}
        onKeyDown={(e) => onKeyboardActivate(e, onClick)}
        role='button'
        tabIndex={0}
      >
        <span>{label}</span>
        {svg.chevron(12)}
      </div>
    )
  }

  function renderPositions(balances: BalanceSummary[]) {
    const networks = props.shared.networks
    const matchedBalances = balances.filter((balance) => {
      if (!inNetworkFilter(balance.chainId)) return false
      const chainName = (networks[balance.chainId] || {}).name || ''
      return matchFilter(state.query, [chainName, balance.name, balance.symbol])
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
    const secondaryRows = secondaryBalances.slice(0, state.secondaryPositionRowsVisible)
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
    const dustRows = lowValueBalances.slice(0, state.dustRowsVisible)
    const dustRowsHidden = lowValueBalances.length - dustRows.length

    if (!visible.length && hiddenLowValueCount === 0) {
      return <div className='t2EmptyState'>No Tokens Found</div>
    }

    return (
      <div className='t2List'>
        {importantBalances.map((balance, i) => renderTokenRow(createDisplayBalance(balance), i))}
        {hiddenSecondaryCount > 0 ? (
          <>
            <div
              aria-expanded={state.secondaryPositionsExpanded}
              aria-label={secondaryLabel}
              className='t2LowValueHidden'
              onClick={() => setState({ secondaryPositionsExpanded: !state.secondaryPositionsExpanded })}
              onKeyDown={(e) =>
                onKeyboardActivate(e, () =>
                  setState({ secondaryPositionsExpanded: !state.secondaryPositionsExpanded })
                )
              }
              role='button'
              tabIndex={0}
            >
              <div
                className={
                  state.secondaryPositionsExpanded
                    ? 't2LowValueHiddenChevron t2LowValueHiddenChevronOpen'
                    : 't2LowValueHiddenChevron'
                }
              >
                {svg.chevronLeft(10)}
              </div>
              <div className='t2LowValueHiddenLabel'>{secondaryLabel}</div>
              <div className='t2LowValueHiddenValue'>{`$${formatUsdRate(hiddenSecondaryValue, 2)}`}</div>
            </div>
            {state.secondaryPositionsExpanded
              ? secondaryRows.map((balance, i) =>
                  renderTokenRow(createDisplayBalance(balance), i, 't2TokenRow t2SecondaryTokenRow cardShow')
                )
              : null}
            {state.secondaryPositionsExpanded
              ? renderPositionListMore(
                  secondaryRowsHidden,
                  `Show ${Math.min(SECONDARY_POSITION_ROWS_INCREMENT, secondaryRowsHidden)} more assets`,
                  () =>
                    setState({
                      secondaryPositionRowsVisible:
                        state.secondaryPositionRowsVisible + SECONDARY_POSITION_ROWS_INCREMENT
                    })
                )
              : null}
          </>
        ) : null}
        {hiddenLowValueCount > 0 ? (
          <>
            <div
              aria-expanded={state.dustExpanded}
              aria-label={dustLabel}
              className='t2LowValueHidden'
              onClick={() => setState({ dustExpanded: !state.dustExpanded })}
              onKeyDown={(e) => onKeyboardActivate(e, () => setState({ dustExpanded: !state.dustExpanded }))}
              role='button'
              tabIndex={0}
            >
              <div
                className={
                  state.dustExpanded
                    ? 't2LowValueHiddenChevron t2LowValueHiddenChevronOpen'
                    : 't2LowValueHiddenChevron'
                }
              >
                {svg.chevronLeft(10)}
              </div>
              <div className='t2LowValueHiddenLabel'>{dustLabel}</div>
              <div className='t2LowValueHiddenValue'>{'<$0.01'}</div>
            </div>
            {state.dustExpanded
              ? dustRows.map((balance, i) =>
                  renderTokenRow(createDisplayBalance(balance), i, 't2TokenRow t2DustTokenRow cardShow')
                )
              : null}
            {state.dustExpanded
              ? renderPositionListMore(
                  dustRowsHidden,
                  `Show ${Math.min(DUST_ROWS_INCREMENT, dustRowsHidden)} more low value tokens`,
                  () =>
                    setState({
                      dustRowsVisible: state.dustRowsVisible + DUST_ROWS_INCREMENT
                    })
                )
              : null}
          </>
        ) : null}
      </div>
    )
  }

  function renderAssetDetailsOverlay() {
    const asset = state.assetDetails
    if (!asset) return null

    const canSendAsset = hasPositiveBalance(asset)
    const canTradeAsset = canOpenTrade(asset)
    const chain = props.shared.networks[asset.chainId] || {}
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
            onClick={() => setState({ assetDetails: null })}
            onKeyDown={(e) => onKeyboardActivate(e, () => setState({ assetDetails: null }))}
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
                networks={props.shared.networks}
                networksMeta={props.shared.networksMeta}
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
                <div className='t2AssetChainIcon'>{chainIcon(asset.chainId, 18, 11, 9)}</div>
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
            onClick={canSendAsset ? () => openSend(asset) : undefined}
            onKeyDown={canSendAsset ? (e) => onKeyboardActivate(e, () => openSend(asset)) : undefined}
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
            onClick={canTradeAsset ? () => openTrade(asset) : undefined}
            onKeyDown={canTradeAsset ? (e) => onKeyboardActivate(e, () => openTrade(asset)) : undefined}
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

  function renderOrderAssetIcon(asset: any, fallbackChainId?: number) {
    const symbol = orderAssetSymbol(asset)
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
        {chainId ? <div className='t2OrderAssetChainBadge'>{chainIcon(chainId, 12, 8, 6)}</div> : null}
      </div>
    )
  }

  function renderOrderAssetPill(asset: any, fallbackChainId?: number, prefix = '') {
    return (
      <div className='t2OrderAssetPill' title={orderAssetName(asset)}>
        {prefix ? <span className='t2OrderAssetPrefix'>{prefix}</span> : null}
        {renderOrderAssetIcon(asset, fallbackChainId)}
        <span>{orderAssetSymbol(asset)}</span>
      </div>
    )
  }

  function renderOrders(account: any) {
    const records = getOrderRecords(account)

    if (!records.length) return <div className='t2EmptyState'>No Orders Yet</div>

    return (
      <div className='t2OrderList'>
        {records.map((order: any) => {
          const chainId = Number(order.chainId)
          const open = isOpenOrder(order)
          const side = normalizeOrderSide(order.side)
          const statusKey = orderStatus(order).replace(/[^a-z0-9]+/g, '-') || 'unknown'
          const cancelError = orderCancelErrorMessage(order.orderId)
          const contraPrefix = side ? getContraPreposition(side) : 'with'

          return (
            <div
              key={order.orderId}
              aria-label={`${orderPairIntent(order)} order details`}
              className='t2OrderRow cardShow'
              data-order-id={order.orderId}
              onClick={() => openOrder(order)}
              onKeyDown={(e) => onKeyboardActivate(e, () => openOrder(order))}
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
                      void cancelOrder(order)
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      onKeyboardActivate(e, () => void cancelOrder(order))
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
                <div className={`t2OrderStatus t2OrderStatus-${statusKey}`}>{orderStatusLabel(order)}</div>
                <div className='t2OrderCreated'>{orderDate(order.createdAt)}</div>
              </div>
              <div className='t2OrderAssetColumn'>{renderOrderAssetPill(order.targetAsset, chainId)}</div>
              <div className='t2OrderCopy'>
                <div className='t2OrderIntent'>{orderPairIntent(order)}</div>
                <div className='t2OrderSubline'>
                  <span>{orderSideLabel(order)}</span>
                  <span>{orderTypeLabel(order)}</span>
                  {cancelError ? (
                    <span className='t2OrderCancelInlineError' title={cancelError}>
                      {cancelError}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className='t2OrderSize'>{orderSize(order)}</div>
              <div className='t2OrderContra'>
                {renderOrderAssetPill(order.contraAsset, chainId, contraPrefix)}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function renderOrderDetails() {
    const orderId = state.orderDetails
    if (!orderId) return null

    const order = props.shared.orders[orderId]
    if (!order) return null

    const chainId = Number(order.chainId)
    const chain = props.shared.networks[chainId] || {}
    const side = normalizeOrderSide(order.side)
    const cancelError = orderCancelErrorMessage(orderId)
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
    const rawPayload = orderJson(order.rawPayload)
    const rawStatusPayload = orderJson(order.rawStatusPayload)

    return (
      <div aria-label='Order details' className='t2Overlay t2OrderOverlay cardShow' role='dialog'>
        <div className='t2OverlayHeader'>
          <div
            aria-label='Back to orders'
            className='t2OverlayBack'
            onClick={() => setState({ orderDetails: '' })}
            onKeyDown={(e) => onKeyboardActivate(e, () => setState({ orderDetails: '' }))}
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
              {renderOrderAssetPill(order.targetAsset, chainId)}
              <div className='t2OrderDetailIntent'>{orderPairIntent(order)}</div>
              {renderOrderAssetPill(order.contraAsset, chainId, side ? getContraPreposition(side) : 'with')}
            </div>
            <div className='t2OrderDetailMeta'>
              <span>{orderStatusLabel(order)}</span>
              <span>{orderTypeLabel(order)}</span>
              <span>{orderSize(order)}</span>
            </div>
            {cancelError ? <div className='t2OrderCancelError'>Cancel failed: {cancelError}</div> : null}
          </div>
          <div className='t2OrderDetailList'>
            {detailRow('Order ID', order.orderId || orderId, true)}
            {detailRow('Provider', order.provider || order.source)}
            {detailRow('Environment', order.environment)}
            {detailRow('Profile', order.profile)}
            {detailRow('Account', shortAddress(order.accountAddress), true)}
            {detailRow(
              'Chain',
              <div className='t2OrderChainValue'>
                <div className='t2OrderChainIcon'>{chainIcon(chainId, 18, 11, 9)}</div>
                <span>{chain.name || `Chain ${chainId}`}</span>
              </div>
            )}
            {detailRow('Status', orderStatusLabel(order))}
            {detailRow('Raw status', order.rawStatus)}
            {detailRow('Side', orderSideLabel(order))}
            {detailRow('Type', orderTypeLabel(order))}
            {detailRow('Size', orderSize(order))}
            {detailRow('Spent amount', formatOrderAmount(order.spentAmount))}
            {detailRow('Output amount', formatOrderAmount(order.outputAmount))}
            {detailRow('Estimated output', formatOrderAmount(order.estimatedOutputAmount))}
            {detailRow('Filled output', formatOrderAmount(order.filledOutputAmount))}
            {detailRow('Average fill price', formatOrderAmount(order.averageFillPrice))}
            {detailRow('Created', orderDateTime(order.createdAt))}
            {detailRow('Updated', orderDateTime(order.updatedAt))}
            {detailRow('Terminal', orderDateTime(order.terminalAt))}
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

  function renderActivity(account: any) {
    const records = getActivityRecords(account)

    if (!records.length) return <div className='t2EmptyState'>No Activity Yet</div>

    return (
      <div className='t2ActivityList'>
        {records.map((activity: any) => {
          const chainId = Number(activity.chainId)
          const chain = props.shared.networks[chainId] || {}
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
              onClick={() => openActivity(activity)}
              onKeyDown={(e) => onKeyboardActivate(e, () => openActivity(activity))}
              role='button'
              tabIndex={0}
            >
              <div className='t2ActivityIconWrap'>
                <StatusGlyph state={activityGlyphState(activity.status) as any} />
                <div className='t2ActivityChainBadge'>{chainIcon(chainId, 16, 10, 8)}</div>
              </div>
              <div className='t2ActivityCopy'>
                <div className='t2ActivityTitle'>{title}</div>
                <div className='t2ActivitySubtitle'>
                  <span>{subtitle}</span>
                  {activity.hash ? <span>{shortAddress(activity.hash)}</span> : null}
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

  function renderActivityDetails() {
    const activityId = state.activityDetails
    if (!activityId) return null

    const activity = props.shared.activity[activityId]
    if (!activity) return null

    const req = activityRequestLike(activity)
    const chainId = Number(activity.chainId)
    const chain = props.shared.networks[chainId] || {}
    const meta = props.shared.networksMeta[chainId] || {}
    const nativeCurrency = meta.nativeCurrency || { symbol: chain.symbol || 'ETH' }
    const symbol = nativeCurrency.symbol || chain.symbol || 'ETH'
    const intent = getTransactionIntent(req, symbol)
    const effects = getTransactionEffects(req, symbol)
    const receiptBlock = activity.receipt?.blockNumber
      ? parseInt(activity.receipt.blockNumber, 16)
      : undefined
    const originName = activity.origin ? props.shared.origins[activity.origin]?.name || activity.origin : ''
    const from = activity.data?.from || activity.account || activity.address
    const to = activity.data?.to
    const details = [
      { label: 'Origin', value: originName },
      { label: 'From', value: shortAddress(from), onClick: () => copyActivityValue(from) },
      {
        label: 'To',
        value: activity.recipient || shortAddress(to),
        onClick: () => copyActivityValue(to)
      },
      { label: 'Nonce', value: activity.nonce },
      {
        label: 'Hash',
        value: shortAddress(activity.hash),
        onClick: () => copyActivityValue(activity.hash)
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
            onClick={() => setState({ activityDetails: '' })}
            onKeyDown={(e) => onKeyboardActivate(e, () => setState({ activityDetails: '' }))}
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

  function renderNetworksOverlay(balances: any[]) {
    if (state.overlay !== 'networks') return null

    const chains = getVisibleChains()
    const showTestnets = getShowTestnets()
    const netQuery = state.netQuery.trim()
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
        const selected = state.network === chain.chainId
        const kebabOpen = state.kebab === chain.chainId
        const primary = chain.connection?.primary || {}
        const rpcValue = getNetworkPrimaryRpcValue(chain)
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
                setState({ network: chain.chainId, overlay: null, kebab: 0 })
              }}
              onKeyDown={(e) =>
                onKeyboardActivate(e, () => {
                  if (!on) return
                  setState({ network: chain.chainId, overlay: null, kebab: 0 })
                })
              }
              role='button'
              tabIndex={on ? 0 : -1}
            >
              <div className='t2NetworkIcon'>{chainIcon(chain.chainId, 30, 14, 12)}</div>
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
                  setState({ kebab: kebabOpen ? 0 : chain.chainId })
                }}
                onKeyDown={(e) =>
                  onKeyboardActivate(e, () => setState({ kebab: kebabOpen ? 0 : chain.chainId }))
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
                      onChange={(e) => updateNetworkPrimaryRpc(chain.chainId, e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          saveNetworkPrimaryRpc(chain.chainId)
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
                        saveNetworkPrimaryRpc(chain.chainId)
                      }}
                      onKeyDown={(e) => onKeyboardActivate(e, () => saveNetworkPrimaryRpc(chain.chainId))}
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
                      void link.executeCommand({
                        type: 'network.activation-set',
                        chainId: chain.chainId,
                        enabled: !on
                      })
                      const resetNetwork = on && state.network === chain.chainId
                      setState({ kebab: 0, ...(resetNetwork ? { network: 0 } : {}) })
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
                    setState({ kebab: 0 })
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
            onClick={() => setState({ overlay: null, kebab: 0 })}
            onKeyDown={(e) => onKeyboardActivate(e, () => setState({ overlay: null, kebab: 0 }))}
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
              value={state.netQuery}
              onChange={(e) => setState({ netQuery: e.target.value })}
            />
          </div>
        </div>
        <div className='t2OverlayScroll t2NetworksScroll'>
          <div
            aria-label='All Networks'
            className={state.network === 0 ? 't2NetworkAll t2NetworkSelected' : 't2NetworkAll'}
            onClick={() => setState({ network: 0, overlay: null, kebab: 0 })}
            onKeyDown={(e) => onKeyboardActivate(e, () => setState({ network: 0, overlay: null, kebab: 0 }))}
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
                    style={{ background: chainColor(chain.chainId) }}
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

  function renderRequestsOverlay(current: string) {
    if (state.overlay !== 'requests') return null
    return (
      <div aria-label='Requests' className='t2Overlay cardShow' role='dialog'>
        <div className='t2OverlayHeader'>
          <div
            aria-label='Back'
            className='t2OverlayBack'
            onClick={() => setState({ overlay: null, menuOpen: true, resetConfirm: false })}
            onKeyDown={(e) =>
              onKeyboardActivate(e, () => setState({ overlay: null, menuOpen: true, resetConfirm: false }))
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

  function renderDappsOverlay(current: string) {
    if (state.overlay !== 'dapps') return null
    const permissions = (current && props.shared.permissions[current]) || {}
    const origins = Object.keys(permissions)
      .filter((origin) => permissions[origin]?.provider)
      .sort((a, b) => (permissions[a].origin < permissions[b].origin ? -1 : 1))

    return (
      <div aria-label='Dapps' className='t2Overlay cardShow' role='dialog'>
        <div className='t2OverlayHeader'>
          <div
            aria-label='Back'
            className='t2OverlayBack'
            onClick={() => setState({ overlay: null, menuOpen: true })}
            onKeyDown={(e) => onKeyboardActivate(e, () => setState({ overlay: null, menuOpen: true }))}
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
              onClick={() => void link.executeCommand({ type: 'permission.clear', accountId: current })}
              onKeyDown={(e) =>
                onKeyboardActivate(
                  e,
                  () => void link.executeCommand({ type: 'permission.clear', accountId: current })
                )
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
                  onClick={() =>
                    void link.executeCommand({
                      type: 'permission.clear',
                      accountId: current,
                      originId: origin
                    })
                  }
                  onKeyDown={(e) =>
                    onKeyboardActivate(
                      e,
                      () =>
                        void link.executeCommand({
                          type: 'permission.clear',
                          accountId: current,
                          originId: origin
                        })
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

  function approvePendingChain() {
    const pending = state.pendingChainRequest || {}
    const requestId = pending.request?.handlerId
    const homeCommandId = pending.homeCommandId
    if (!requestId && !homeCommandId) return

    void link.executeCommand({
      type: 'network.request-resolve',
      approved: true,
      ...(requestId ? { requestId } : { homeCommandId })
    })
    setState({ overlay: 'networks', pendingChainRequest: null, netQuery: '', kebab: 0 })
  }

  function rejectPendingChain() {
    const pending = state.pendingChainRequest || {}
    const requestId = pending.request?.handlerId
    const homeCommandId = pending.homeCommandId
    if (requestId || homeCommandId) {
      void link.executeCommand({
        type: 'network.request-resolve',
        approved: false,
        ...(requestId ? { requestId } : { homeCommandId })
      })
    }
    setState({ overlay: null, pendingChainRequest: null })
  }

  function renderAddChainOverlay() {
    if (state.overlay !== 'addChain') return null

    const pending = state.pendingChainRequest || {}
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
            onClick={() => rejectPendingChain()}
            onKeyDown={(e) => onKeyboardActivate(e, () => rejectPendingChain())}
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
                onClick={() => rejectPendingChain()}
                onKeyDown={(e) => onKeyboardActivate(e, () => rejectPendingChain())}
                role='button'
                tabIndex={0}
              >
                Reject
              </div>
              <div
                aria-label='Add chain'
                className='t2SettingsSmallButton'
                onClick={() => approvePendingChain()}
                onKeyDown={(e) => onKeyboardActivate(e, () => approvePendingChain())}
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

  function renderReceiveOverlay(accounts: Record<string, any>) {
    if (state.overlay !== 'receive') return null

    const account = accounts[state.receiveAccount] || accounts[props.shared.currentAccount]
    if (!account) return null

    return (
      <div aria-label='Receive assets' className='t2Overlay t2ReceiveOverlay cardShow' role='dialog'>
        <div className='t2OverlayHeader'>
          <div
            aria-label='Back'
            className='t2OverlayBack'
            onClick={() => setState({ overlay: null, receiveAccount: '' })}
            onKeyDown={(e) => onKeyboardActivate(e, () => setState({ overlay: null, receiveAccount: '' }))}
            role='button'
            tabIndex={0}
          >
            {svg.chevronLeft(16)}
          </div>
          <div className='t2OverlayTitle'>Receive Assets</div>
          <div className='t2OverlaySpacer' />
        </div>
        <div className='t2ReceiveBody'>
          <div className='t2ReceiveIcon'>{accountIcon(account, 22)}</div>
          <div className='t2ReceiveName'>{accountDisplayName(account)}</div>
          <div className='t2ReceiveQr'>
            <AddressQRCode address={account.address} />
          </div>
          <div
            aria-label='Copy receive address'
            className='t2ReceiveAddress'
            onClick={() => copyAccountAddress(account)}
            onKeyDown={(e) => onKeyboardActivate(e, () => copyAccountAddress(account))}
            role='button'
            tabIndex={0}
          >
            <span>{state.accountCopied === account.id ? 'Address copied' : account.address}</span>
            {svg.copy(13)}
          </div>
        </div>
      </div>
    )
  }

  function renderSettingsOverlay() {
    if (state.overlay !== 'settings') return null

    const {
      biometricUnlock,
      latticeAccountLimit,
      latticeDerivation,
      ledgerDerivation,
      liveAccountLimit,
      platform,
      summonShortcut,
      trezorDerivation
    } = props.shared
    const portfolioApiKey = state.portfolioApiKey || ''
    const hasPortfolioApiKey = portfolioApiKey.trim().length > 0
    const portfolioApiKeyDetail = state.portfolioApiKeyRequired
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
        on: props.shared.autohide,
        detail: 'Hide Newframe on loss of focus',
        toggle: () =>
          void link.executeCommand({
            type: 'settings.update',
            setting: 'autohide',
            value: !props.shared.autohide
          })
      },
      {
        label: 'Run on Startup',
        on: props.shared.launch,
        detail: 'Run Newframe when your computer starts',
        toggle: () =>
          void link.executeCommand({
            type: 'settings.update',
            setting: 'launch',
            value: !props.shared.launch
          })
      },
      {
        label: 'Glide',
        on: props.shared.reveal,
        detail: "Mouse to display's right edge to summon Newframe",
        toggle: () =>
          void link.executeCommand({
            type: 'settings.update',
            setting: 'reveal',
            value: !props.shared.reveal
          })
      },
      ...(platform === 'darwin'
        ? [
            {
              label: 'Display Gas in Menubar',
              on: props.shared.menubarGasPrice,
              detail: 'Show mainnet gas price in the menu bar',
              toggle: () =>
                void link.executeCommand({
                  type: 'settings.update',
                  setting: 'menubar-gas-price',
                  value: !props.shared.menubarGasPrice
                })
            }
          ]
        : []),
      {
        label: 'Show Account Name with ENS',
        on: props.shared.showLocalNameWithENS,
        detail: 'Show local account name when ENS is resolved',
        toggle: () =>
          void link.executeCommand({
            type: 'settings.update',
            setting: 'show-local-name-with-ens',
            value: !props.shared.showLocalNameWithENS
          })
      },
      {
        label: 'Show Testnets',
        on: getShowTestnets(),
        detail: 'Show testnet chains in Networks',
        toggle: () => setShowTestnets(!getShowTestnets())
      },
      {
        label: 'Biometric Login',
        on: biometricUnlock,
        detail: state.biometricsBusy
          ? 'Waiting for authentication'
          : state.biometricsError || 'Unlock Newframe with Touch ID or a platform passkey',
        toggle: () => setBiometricUnlock(!biometricUnlock)
      }
    ]

    return (
      <div aria-label='Settings' className='t2Overlay cardShow' role='dialog'>
        <div className='t2OverlayHeader'>
          <div
            aria-label='Back'
            className='t2OverlayBack'
            onClick={() => setState({ overlay: null, menuOpen: true })}
            onKeyDown={(e) => onKeyboardActivate(e, () => setState({ overlay: null, menuOpen: true }))}
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
                  <div className='t2SettingsRowDetail'>{renderShortcut()}</div>
                </div>
                <div className='t2SettingsShortcutControls'>
                  <div
                    aria-label={summonShortcut.configuring ? 'Cancel shortcut edit' : 'Edit shortcut'}
                    className='t2SettingsSmallButton'
                    onClick={() => {
                      void link.executeCommand({
                        type: 'settings.update',
                        setting: 'shortcut-configuring',
                        value: !summonShortcut.configuring
                      })
                    }}
                    onKeyDown={(e) =>
                      onKeyboardActivate(
                        e,
                        () =>
                          void link.executeCommand({
                            type: 'settings.update',
                            setting: 'shortcut-configuring',
                            value: !summonShortcut.configuring
                          })
                      )
                    }
                    role='button'
                    tabIndex={0}
                  >
                    {summonShortcut.configuring ? 'Cancel' : 'Edit'}
                  </div>
                  {renderToggle(
                    summonShortcut.enabled,
                    () =>
                      void link.executeCommand({
                        type: 'settings.update',
                        setting: 'shortcut-enabled',
                        value: !summonShortcut.enabled
                      }),
                    'Summon Shortcut'
                  )}
                </div>
              </div>
              <div className='t2SettingsShortcutDetails'>
                <KeyboardShortcutConfigurator
                  actionText='summon Newframe'
                  onChange={(value) =>
                    void link.executeCommand({
                      type: 'settings.update',
                      setting: 'summon-shortcut',
                      value
                    })
                  }
                  shortcut={summonShortcut}
                  shortcutName='summon'
                  platform={platform}
                />
              </div>
            </div>
          </div>

          <div aria-label='App' className='t2SettingsSection' role='group'>
            <div className='t2SettingsSectionTitle'>App</div>
            {toggleRows.map((setting) =>
              renderSettingsToggleRow(setting.label, setting.on, setting.toggle, setting.detail)
            )}
            {renderSettingsActionRow('Lock Newframe', 'Lock', () => lockFrame())}
            {renderSettingsActionRow(
              'Reset Saved Data',
              'Reset',
              () => void link.executeCommand({ type: 'wallet.reset', scope: 'saved-data' })
            )}
            {state.resetConfirm ? (
              <div className='t2SettingsRow t2SettingsResetConfirm'>
                <div className='t2SettingsRowText'>
                  <div className='t2SettingsRowTitle'>Reset All Settings & Data?</div>
                </div>
                <div className='t2SettingsConfirmActions'>
                  <div
                    className='t2SettingsSmallButton t2SettingsDangerButton'
                    onClick={() =>
                      void link.executeCommand({ type: 'wallet.reset', scope: 'all-settings-data' })
                    }
                    role='button'
                    tabIndex={0}
                  >
                    Yes
                  </div>
                  <div
                    className='t2SettingsSmallButton'
                    onClick={() => setState({ resetConfirm: false })}
                    role='button'
                    tabIndex={0}
                  >
                    No
                  </div>
                </div>
              </div>
            ) : (
              renderSettingsActionRow(
                'Reset All Settings & Data',
                'Reset',
                () => setState({ resetConfirm: true }),
                true
              )
            )}
          </div>

          <div className='t2SettingsSection'>
            <div className='t2SettingsSectionTitle'>Signer Defaults</div>
            {renderSettingsSelectRow(
              'Trezor Derivation',
              trezorOptions,
              trezorDerivation,
              (value) =>
                void link.executeCommand({ type: 'settings.update', setting: 'trezor-derivation', value })
            )}
            {renderSettingsSelectRow(
              'Ledger Derivation',
              ledgerOptions,
              ledgerDerivation,
              (value) =>
                void link.executeCommand({ type: 'settings.update', setting: 'ledger-derivation', value })
            )}
            {ledgerDerivation === 'live'
              ? renderSettingsSelectRow(
                  'Ledger Live Accounts',
                  accountLimitOptions,
                  liveAccountLimit,
                  (value) =>
                    void link.executeCommand({
                      type: 'settings.update',
                      setting: 'ledger-live-account-limit',
                      value
                    })
                )
              : null}
            {renderSettingsSelectRow(
              'Lattice Derivation',
              latticeOptions,
              latticeDerivation,
              (value) =>
                void link.executeCommand({ type: 'settings.update', setting: 'lattice-derivation', value })
            )}
            {renderSettingsSelectRow(
              'Lattice Accounts',
              accountLimitOptions,
              latticeAccountLimit,
              (value) =>
                void link.executeCommand({
                  type: 'settings.update',
                  setting: 'lattice-account-limit',
                  value
                })
            )}
            {renderSettingsSelectRow('Lattice Relay', relayOptions, state.latticeEndpointMode, (value) => {
              void link.executeCommand({
                type: 'settings.update',
                setting: 'lattice-endpoint-mode',
                value
              })
              setState({ latticeEndpointMode: value })
            })}
            {state.latticeEndpointMode === 'custom' ? (
              <div className='t2SettingsInputRow'>
                <input
                  aria-label='Custom Lattice Relay'
                  placeholder='Custom Relay'
                  spellCheck='false'
                  value={state.latticeEndpoint}
                  onChange={(e) => inputLatticeEndpoint(e)}
                />
              </div>
            ) : null}
          </div>

          <div className='t2SettingsSection'>
            <div className='t2SettingsSectionTitle'>Tokens</div>
            {renderSettingsToggleRow(
              'Auto-Discover Tokens',
              props.shared.autoDiscoverTokens,
              () => toggleAutoDiscoverTokens(),
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
                onChange={(e) => inputPortfolioApiKey(e)}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  function renderAboutOverlay() {
    if (state.overlay !== 'about') return null

    // TODO: move this to global state passed over IPC
    // eslint-disable-next-line
    const appVersion = require('../../../package.json').version
    const instanceId = props.shared.instanceId

    return (
      <div aria-label='App Info' className='t2Overlay cardShow' role='dialog'>
        <div className='t2OverlayHeader'>
          <div
            aria-label='Back'
            className='t2OverlayBack'
            onClick={() => setState({ overlay: null, menuOpen: true })}
            onKeyDown={(e) => onKeyboardActivate(e, () => setState({ overlay: null, menuOpen: true }))}
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
              onClick={() => copyInstanceId(instanceId)}
              onKeyDown={(e) => onKeyboardActivate(e, () => copyInstanceId(instanceId))}
              role='button'
              tabIndex={0}
            >
              <div className='t2InfoLabel'>Instance ID</div>
              <div className='t2InfoValue t2InfoValueMono'>
                {state.instanceIdCopied ? 'Instance ID Copied' : instanceId}
              </div>
            </div>
            <div className='t2InfoRow'>
              <div className='t2InfoLabel'>Version</div>
              <div className='t2InfoValue'>{`v${appVersion}`}</div>
            </div>
            {renderSettingsActionRow(
              'View License',
              'Open',
              () =>
                void link.executeCommand({
                  type: 'external.open',
                  url: 'https://github.com/wardenjakx/newframe/blob/main/apps/newframe/LICENSE'
                })
            )}
          </div>
        </div>
      </div>
    )
  }

  function renderInlineAddIcon(icon: string, size = 15) {
    const iconFn = (svg as any)[icon]
    return iconFn ? iconFn(size) : svg.accounts(size)
  }

  function renderInlineAddOption({
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
        onKeyDown={(e) => onKeyboardActivate(e, onClick)}
        role='button'
        tabIndex={0}
      >
        <div className='t2InlineAddTypeIcon'>{renderInlineAddIcon(icon)}</div>
        <span>{label}</span>
      </div>
    )
  }

  function renderInlineAddRoot() {
    return (
      <div className='t2InlineAddTypes'>
        {inlineAddSections.map((option) =>
          renderInlineAddOption({
            active: state.addAccountCategory === option.section,
            icon: option.icon,
            label: option.title,
            onClick: () => chooseInlineAddCategory(option.section),
            optionKey: option.section
          })
        )}
      </div>
    )
  }

  function renderStoredSeedOption(signer: any, seedIndex: number, accounts: Record<string, any>) {
    const wallets = seedWallets(signer, accounts)
    const importedWallets = wallets.filter((wallet: any) => wallet.account)
    const expanded = !!state.storedSeedExpanded?.[signer.id]
    const visibleWallets = expanded ? importedWallets : importedWallets.slice(0, 3)
    const importedCount = importedWallets.length
    const label = seedPhraseLabel(seedIndex)
    const hasMoreWallets = importedWallets.length > 3

    return (
      <div aria-label={`View ${label} wallets`} className='t2StoredSeedCard' key={signer.id}>
        <div className='t2StoredSeedHeader'>
          <div className='t2StoredSeedIcon'>{renderInlineAddIcon('seedling')}</div>
          <div className='t2StoredSeedTitle'>{label}</div>
          <div className='t2StoredSeedCount'>{`${importedCount}/${wallets.length}`}</div>
        </div>
        <div className='t2StoredSeedWallets'>
          {visibleWallets.map((wallet: any) => (
            <div className='t2StoredSeedWallet' key={wallet.address}>
              <div className='t2StoredSeedWalletName'>{walletDisplayName(wallet)}</div>
              <div className='t2StoredSeedWalletAddress'>{shortAddress(wallet.address)}</div>
            </div>
          ))}
          {hasMoreWallets && !expanded ? (
            <div
              aria-label={`Show all ${label} wallets`}
              className='t2StoredSeedMore'
              onClick={(e) => {
                e.stopPropagation()
                expandStoredSeed(signer.id)
              }}
              onKeyDown={(e) => {
                e.stopPropagation()
                onKeyboardActivate(e, () => expandStoredSeed(signer.id))
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
            onClick={() => setState({ addAccountSelectedSigner: signer.id })}
            onKeyDown={(e) => onKeyboardActivate(e, () => setState({ addAccountSelectedSigner: signer.id }))}
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

  function renderStoredSeedAdd() {
    const signers = Object.values(props.shared.signers).filter((signer: any) => signer.type === 'seed')
    const accounts = props.shared.accounts
    const selectedSigner = state.addAccountSelectedSigner
      ? props.shared.signers[state.addAccountSelectedSigner]
      : null

    if (!signers.length) {
      return (
        <div className='t2InlineAddEmpty'>
          <div>No stored recovery phrases</div>
          <div
            aria-label='Create recovery phrase'
            className='t2InlineAddSubmit'
            onClick={() => chooseInlineAddCategory('createSeed')}
            onKeyDown={(e) => onKeyboardActivate(e, () => chooseInlineAddCategory('createSeed'))}
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
              setState({
                addAccountCategory: 'import',
                addAccountType: 'seed',
                addGeneratedPhrase: '',
                addGeneratedPhraseBackedUp: false,
                addGeneratedPhraseCopied: false
              })
            }
            onKeyDown={(e) =>
              onKeyboardActivate(e, () =>
                setState({
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
            renderStoredSeedOption(signer, seedIndex, accounts)
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
              aria-label={`${imported ? 'Select' : 'Add'} ${walletDisplayName(wallet)}`}
              className={imported ? 't2DerivedAccountRow t2DerivedAccountImported' : 't2DerivedAccountRow'}
              key={address}
              onClick={() => createStoredSeedAccount(selectedSigner, address)}
              onKeyDown={(e) => onKeyboardActivate(e, () => createStoredSeedAccount(selectedSigner, address))}
              role='button'
              tabIndex={0}
            >
              <div className='t2DerivedAccountIndex'>{index + 1}.</div>
              <div className='t2DerivedAccountIdentity'>
                <div className='t2DerivedAccountName'>{walletDisplayName(wallet)}</div>
                <div className='t2DerivedAccountAddress'>{shortAddress(address)}</div>
              </div>
              <div className='t2DerivedAccountValue'>
                {imported ? accountNavValue(accounts[id]) : '$0.00'}
              </div>
              {imported ? <div className='t2DerivedAccountBadge'>Imported</div> : null}
              <div className='t2DerivedAccountCheck'>{imported ? svg.check(11) : null}</div>
            </div>
          )
        })}
      </div>
    )
  }

  function renderCreateSeedPhrase() {
    const phrase = (state.addGeneratedPhrase || '').trim()
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
            <div>{state.addAccountStatus || 'Preparing recovery phrase'}</div>
          </div>
        )}
        <div className='t2SeedPhraseActions'>
          <div
            aria-label='Copy recovery phrase'
            className='t2SettingsSmallButton'
            onClick={() => copyGeneratedSeedPhrase()}
            onKeyDown={(e) => onKeyboardActivate(e, () => copyGeneratedSeedPhrase())}
            role='button'
            tabIndex={0}
          >
            {state.addGeneratedPhraseCopied ? 'Copied' : 'Copy'}
          </div>
          <div
            aria-label='Generate new recovery phrase'
            className='t2SettingsSmallButton'
            onClick={() => generateInlineSeedPhrase()}
            onKeyDown={(e) => onKeyboardActivate(e, () => generateInlineSeedPhrase())}
            role='button'
            tabIndex={0}
          >
            New phrase
          </div>
        </div>
        <div
          aria-checked={state.addGeneratedPhraseBackedUp}
          aria-label='Recovery phrase saved'
          className={
            state.addGeneratedPhraseBackedUp ? 't2SeedBackupCheck t2SeedBackupCheckOn' : 't2SeedBackupCheck'
          }
          onClick={() => setState({ addGeneratedPhraseBackedUp: !state.addGeneratedPhraseBackedUp })}
          onKeyDown={(e) =>
            onKeyboardActivate(e, () =>
              setState({ addGeneratedPhraseBackedUp: !state.addGeneratedPhraseBackedUp })
            )
          }
          role='checkbox'
          tabIndex={0}
        >
          <div className='t2SeedBackupBox'>{state.addGeneratedPhraseBackedUp ? svg.check(9) : null}</div>
          <span>I saved this recovery phrase</span>
        </div>
        <div className='t2InlineInput'>
          <label>Account name</label>
          <input
            aria-label='Account name'
            spellCheck='false'
            value={state.addAccountName}
            onChange={(e) => setState({ addAccountName: e.target.value })}
          />
        </div>
        {needsFramePassword() ? (
          <div className='t2InlineInput'>
            <label>{framePasswordLabel()}</label>
            <input
              aria-label={framePasswordLabel()}
              spellCheck='false'
              type='password'
              value={state.addAccountPassword}
              onChange={(e) => setState({ addAccountPassword: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createGeneratedSeedAccount()
              }}
            />
          </div>
        ) : null}
        {state.addAccountError ? <div className='t2InlineAddError'>{state.addAccountError}</div> : null}
        {state.addAccountStatus && words.length ? (
          <div className='t2InlineAddStatus'>{state.addAccountStatus}</div>
        ) : null}
        <div
          aria-label='Create account'
          className='t2InlineAddSubmit'
          onClick={() => createGeneratedSeedAccount()}
          onKeyDown={(e) => onKeyboardActivate(e, () => createGeneratedSeedAccount())}
          role='button'
          tabIndex={0}
        >
          {svg.plus(12)}
          <span>Create account</span>
        </div>
      </div>
    )
  }

  function renderImportOptions() {
    if (state.addAccountType) return renderInlineAddForm()

    return (
      <div className='t2InlineAddTypes'>
        {inlineImportTypes.map((option) =>
          renderInlineAddOption({
            active: state.addAccountType === option.type,
            icon: option.icon,
            label: option.title,
            onClick: () => chooseInlineAddType(option.type),
            optionKey: option.type
          })
        )}
      </div>
    )
  }

  function renderHardwareOptions() {
    if (state.addAccountType) return renderHardwareAdd()

    return (
      <div className='t2InlineAddTypes'>
        {inlineHardwareTypes.map((option) =>
          renderInlineAddOption({
            icon: option.icon,
            label: option.title,
            onClick: () => chooseInlineAddType(option.type),
            optionKey: option.type
          })
        )}
      </div>
    )
  }

  function renderHardwareAdd() {
    const type = state.addAccountType
    const signers = Object.values(props.shared.signers).filter((signer: any) => signer.type === type)
    const selectedSigner = state.addAccountSelectedSigner
      ? props.shared.signers[state.addAccountSelectedSigner]
      : null
    const title = type === 'ledger' ? 'Ledger' : type === 'trezor' ? 'Trezor' : 'GridPlus'

    if (selectedSigner && selectedSigner.type === type) {
      return renderHardwareSignerDetails(selectedSigner, title)
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
                  onClick={() => selectHardwareSigner(signer.id)}
                  onKeyDown={(e) => onKeyboardActivate(e, () => selectHardwareSigner(signer.id))}
                  role='button'
                  tabIndex={0}
                >
                  <div className='t2DerivedAccountIndex'>
                    {renderInlineAddIcon(
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
        {type === 'lattice' ? renderLatticeAdd() : null}
      </div>
    )
  }

  function renderLatticeAdd() {
    return (
      <div className='t2LatticeCreateForm'>
        <div className='t2InlineInput'>
          <label>Device name</label>
          <input
            aria-label='Lattice device name'
            spellCheck='false'
            value={state.addAccountName}
            onChange={(e) =>
              setState({ addAccountName: e.target.value.replace(/\s+/g, '-').substring(0, 14) })
            }
          />
        </div>
        <div className='t2InlineInput'>
          <label>Device ID</label>
          <input
            aria-label='Lattice device ID'
            spellCheck='false'
            value={state.addAccountInput}
            onChange={(e) => setState({ addAccountInput: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createLatticeSigner()
            }}
          />
        </div>
        {state.addAccountError ? <div className='t2InlineAddError'>{state.addAccountError}</div> : null}
        {state.addAccountStatus ? <div className='t2InlineAddStatus'>{state.addAccountStatus}</div> : null}
        <div
          aria-label='Create Lattice signer'
          className='t2InlineAddSubmit'
          onClick={() => createLatticeSigner()}
          onKeyDown={(e) => onKeyboardActivate(e, () => createLatticeSigner())}
          role='button'
          tabIndex={0}
        >
          {svg.plus(12)}
          <span>Create signer</span>
        </div>
      </div>
    )
  }

  function renderHardwareSignerDetails(signer: any, title: string) {
    const addresses = Array.isArray(signer.addresses) ? signer.addresses : []
    const status = (signer.status || '').toLowerCase()
    const loading = ['loading', 'connecting', 'addresses', 'input', 'pairing', 'deriving'].some((part) =>
      status.includes(part)
    )

    return (
      <div className='t2InlineAddForm'>
        <div className='t2HardwareSignerHeader'>
          <div className='t2HardwareSignerIcon'>{renderInlineAddIcon(signer.type, 16)}</div>
          <div className='t2HardwareSignerText'>
            <div className='t2HardwareSignerName'>{signer.name || title}</div>
            <div className='t2HardwareSignerStatus'>{signer.status || 'Detected'}</div>
          </div>
          {loading ? <div className='loader' /> : null}
        </div>
        {renderHardwareSignerAction(signer, status)}
        {addresses.length ? (
          <div className='t2DerivedAccounts'>
            {addresses.map((address: string, index: number) => {
              const id = address.toLowerCase()
              const accounts = props.shared.accounts
              const imported = !!accounts[id]
              return (
                <div
                  aria-label={`${imported ? 'Select' : 'Add'} ${shortAddress(address)}`}
                  className={
                    imported ? 't2DerivedAccountRow t2DerivedAccountImported' : 't2DerivedAccountRow'
                  }
                  key={address}
                  onClick={() => addHardwareAccount(signer, address)}
                  onKeyDown={(e) => onKeyboardActivate(e, () => addHardwareAccount(signer, address))}
                  role='button'
                  tabIndex={0}
                >
                  <div className='t2DerivedAccountIndex'>{index + 1}.</div>
                  <div className='t2DerivedAccountAddress'>{shortAddress(address)}</div>
                  <div className='t2DerivedAccountValue'>
                    {imported ? accountNavValue(accounts[id]) : '$0.00'}
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
        {state.addAccountError ? <div className='t2InlineAddError'>{state.addAccountError}</div> : null}
        {state.addAccountStatus ? <div className='t2InlineAddStatus'>{state.addAccountStatus}</div> : null}
        <div className='t2HardwareActions'>
          <div
            aria-label={`Reconnect ${title}`}
            className='t2SettingsSmallButton'
            onClick={() => reloadHardwareSigner(signer)}
            onKeyDown={(e) => onKeyboardActivate(e, () => reloadHardwareSigner(signer))}
            role='button'
            tabIndex={0}
          >
            Reconnect
          </div>
          <div
            aria-label={`Remove ${title}`}
            className='t2SettingsSmallButton t2SettingsDangerButton'
            onClick={() => removeHardwareSigner(signer)}
            onKeyDown={(e) => onKeyboardActivate(e, () => removeHardwareSigner(signer))}
            role='button'
            tabIndex={0}
          >
            Remove
          </div>
        </div>
      </div>
    )
  }

  function renderHardwareSignerAction(signer: any, status: string) {
    if (signer.type === 'trezor' && status === 'need pin') {
      return (
        <div className='t2HardwareChallenge'>
          <div className='t2HardwarePinDots'>
            {(state.addHardwarePin || '').split('').map((_: string, index: number) => (
              <span key={index} />
            ))}
          </div>
          <div className='t2HardwarePinPad'>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <div
                aria-label={`PIN position ${num}`}
                className='t2HardwarePinButton'
                key={num}
                onClick={() => addHardwarePinDigit(num)}
                onKeyDown={(e) => onKeyboardActivate(e, () => addHardwarePinDigit(num))}
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
              onClick={() => submitHardwarePin(signer)}
              onKeyDown={(e) => onKeyboardActivate(e, () => submitHardwarePin(signer))}
              role='button'
              tabIndex={0}
            >
              Submit PIN
            </div>
            <div
              aria-label='Delete PIN digit'
              className='t2SettingsSmallButton'
              onClick={() => backspaceHardwarePin()}
              onKeyDown={(e) => onKeyboardActivate(e, () => backspaceHardwarePin())}
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
              value={state.addHardwarePhrase}
              onChange={(e) => setState({ addHardwarePhrase: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitHardwarePhrase(signer)
              }}
            />
          </div>
          <div className='t2HardwareActions'>
            <div
              aria-label='Submit Trezor passphrase'
              className='t2SettingsSmallButton'
              onClick={() => submitHardwarePhrase(signer)}
              onKeyDown={(e) => onKeyboardActivate(e, () => submitHardwarePhrase(signer))}
              role='button'
              tabIndex={0}
            >
              Submit
            </div>
            {allowsDeviceEntry ? (
              <div
                aria-label='Enter passphrase on Trezor'
                className='t2SettingsSmallButton'
                onClick={() => submitHardwarePhraseOnDevice(signer)}
                onKeyDown={(e) => onKeyboardActivate(e, () => submitHardwarePhraseOnDevice(signer))}
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
              value={state.addHardwarePairCode}
              onChange={(e) => setState({ addHardwarePairCode: (e.target.value || '').toUpperCase() })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') pairHardwareLattice(signer)
              }}
            />
          </div>
          <div
            aria-label='Pair GridPlus'
            className='t2InlineAddSubmit'
            onClick={() => pairHardwareLattice(signer)}
            onKeyDown={(e) => onKeyboardActivate(e, () => pairHardwareLattice(signer))}
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

  function renderInlineAddForm() {
    const inputLabel =
      state.addAccountType === 'watch'
        ? 'Address or gns/ens name'
        : state.addAccountType === 'seed'
          ? 'Recovery phrase'
          : 'Private key'
    const showAccountInput = state.addAccountType !== 'keystore'

    return (
      <div className='t2InlineAddForm'>
        {showAccountInput ? (
          <div className='t2InlineInput'>
            <label>{inputLabel}</label>
            {state.addAccountType === 'seed' ? (
              <textarea
                aria-label={inputLabel}
                spellCheck='false'
                value={state.addAccountInput}
                onChange={(e) => setState({ addAccountInput: e.target.value })}
              />
            ) : (
              <input
                aria-label={inputLabel}
                spellCheck='false'
                value={state.addAccountInput}
                onChange={(e) => setState({ addAccountInput: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createInlineAccount()
                }}
              />
            )}
          </div>
        ) : (
          <div
            aria-label='Choose JSON backup file'
            className='t2InlineAddFile'
            onClick={() => locateInlineKeystore()}
            onKeyDown={(e) => onKeyboardActivate(e, () => locateInlineKeystore())}
            role='button'
            tabIndex={0}
          >
            <div className='t2InlineAddFileIcon'>{svg.file(14)}</div>
            <span>{state.addAccountKeystore ? 'JSON backup file selected' : 'Choose JSON backup file'}</span>
          </div>
        )}
        {state.addAccountType === 'keystore' ? (
          <div className='t2InlineInput'>
            <label>JSON backup file password</label>
            <input
              aria-label='JSON backup file password'
              spellCheck='false'
              type='password'
              value={state.addAccountKeystorePassword}
              onChange={(e) => setState({ addAccountKeystorePassword: e.target.value })}
            />
          </div>
        ) : null}
        <div className='t2InlineInput'>
          <label>Account name</label>
          <input
            aria-label='Account name'
            spellCheck='false'
            value={state.addAccountName}
            onChange={(e) => setState({ addAccountName: e.target.value })}
          />
        </div>
        {needsFramePassword() ? (
          <div className='t2InlineInput'>
            <label>{framePasswordLabel()}</label>
            <input
              aria-label={framePasswordLabel()}
              spellCheck='false'
              type='password'
              value={state.addAccountPassword}
              onChange={(e) => setState({ addAccountPassword: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createInlineAccount()
              }}
            />
          </div>
        ) : null}
        {state.addAccountError ? <div className='t2InlineAddError'>{state.addAccountError}</div> : null}
        {state.addAccountStatus ? <div className='t2InlineAddStatus'>{state.addAccountStatus}</div> : null}
        <div
          aria-label='Create account'
          className='t2InlineAddSubmit'
          onClick={() => createInlineAccount()}
          onKeyDown={(e) => onKeyboardActivate(e, () => createInlineAccount())}
          role='button'
          tabIndex={0}
        >
          {svg.plus(12)}
          <span>Create account</span>
        </div>
      </div>
    )
  }

  function renderInlineAddBody() {
    if (state.addAccountCategory === 'createSeed') return renderCreateSeedPhrase()
    if (state.addAccountCategory === 'storedSeed') return renderStoredSeedAdd()
    if (state.addAccountCategory === 'import') return renderImportOptions()
    if (state.addAccountCategory === 'hardware') return renderHardwareOptions()
    if (state.addAccountCategory === 'watch') return renderInlineAddForm()
    return renderInlineAddRoot()
  }

  function renderInlineAddAccount() {
    return (
      <div className='t2InlineAdd'>
        <div className='t2InlineAddHeader'>
          <div
            aria-label='Back'
            className='t2InlineAddBack'
            onClick={() => backInlineAdd()}
            onKeyDown={(e) => onKeyboardActivate(e, () => backInlineAdd())}
            role='button'
            tabIndex={0}
          >
            {svg.chevronLeft(14)}
          </div>
          <div className='t2InlineAddTitle'>Add account</div>
        </div>
        {renderInlineAddBody()}
      </div>
    )
  }

  function renderPrivateKeyExport(accounts: Record<string, any>) {
    const account = accounts[state.accountExporting]
    if (!account) return null

    const hasSecret = !!state.accountExportSecret
    const keyText = hasSecret
      ? state.accountExportSecret
      : '0x0000000000000000000000000000000000000000000000000000000000000000'

    return (
      <div className='t2PrivateKeyExport'>
        <div className='t2PrivateKeyHeader'>
          <div
            aria-label='Back to accounts'
            className='t2PrivateKeyBack'
            onClick={() => closePrivateKeyExport()}
            onKeyDown={(e) => onKeyboardActivate(e, () => closePrivateKeyExport())}
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
                value={state.accountExportPassword}
                onChange={(e) => setState({ accountExportPassword: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') unlockPrivateKeyExport(account)
                }}
              />
            </div>
          ) : null}
          <div
            className={
              hasSecret && state.accountExportRevealed
                ? 't2PrivateKeyBox'
                : 't2PrivateKeyBox t2PrivateKeyBoxBlurred'
            }
          >
            {keyText}
          </div>
          {state.accountExportError ? (
            <div className='t2PrivateKeyError'>{state.accountExportError}</div>
          ) : null}
          <div className='t2PrivateKeyActions'>
            {hasSecret ? (
              <div
                aria-label='Copy private key'
                className='t2PrivateKeyAction'
                onClick={() => copyExportedPrivateKey()}
                onKeyDown={(e) => onKeyboardActivate(e, () => copyExportedPrivateKey())}
                role='button'
                tabIndex={0}
              >
                {state.accountExportCopied ? svg.check(13) : svg.copy(13)}
                <span>{state.accountExportCopied ? 'Copied' : 'Copy key'}</span>
              </div>
            ) : (
              <div
                aria-label='Unlock private key export'
                className='t2PrivateKeyAction'
                onClick={() => unlockPrivateKeyExport(account)}
                onKeyDown={(e) => onKeyboardActivate(e, () => unlockPrivateKeyExport(account))}
                role='button'
                tabIndex={0}
              >
                {svg.key(13)}
                <span>{state.accountExportLoading ? 'Unlocking' : 'Unlock export'}</span>
              </div>
            )}
            {hasSecret ? (
              <div
                aria-label={state.accountExportRevealed ? 'Hide private key' : 'Reveal private key'}
                className='t2PrivateKeyAction t2PrivateKeyActionSubtle'
                onClick={() => setState({ accountExportRevealed: !state.accountExportRevealed })}
                onKeyDown={(e) =>
                  onKeyboardActivate(e, () =>
                    setState({ accountExportRevealed: !state.accountExportRevealed })
                  )
                }
                role='button'
                tabIndex={0}
              >
                {svg.eye(13)}
                <span>{state.accountExportRevealed ? 'Hide key' : 'Reveal key'}</span>
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

  function renderAccountsPanel(current: string) {
    if (!state.accountsOpen) return null
    const accounts = props.shared.accounts
    const ids = orderedAccountIds(accounts)
    const accountQuery = state.accountQuery.trim()
    const visibleIds = ids.filter((id) => accountMatchesQuery(accounts[id], accountQuery))

    return (
      <div aria-label='Accounts' className='t2Overlay t2AccountsPanel cardShow' role='dialog'>
        {!state.accountExporting ? (
          <div className='t2OverlayHeader t2AccountsHeader'>
            <div className='t2AccountsTitle'>Accounts</div>
            <div
              aria-label='Close accounts'
              className='t2AccountsClose'
              onClick={() => closeAccountsPanel()}
              onKeyDown={(e) => onKeyboardActivate(e, () => closeAccountsPanel())}
              role='button'
              tabIndex={0}
            >
              {svg.x(13)}
            </div>
          </div>
        ) : null}
        {state.accountExporting ? (
          <div className='t2OverlayScroll t2AccountsScroll'>{renderPrivateKeyExport(accounts)}</div>
        ) : state.addingAccount ? (
          <div className='t2OverlayScroll t2AccountsScroll'>{renderInlineAddAccount()}</div>
        ) : (
          <>
            <div className='t2AccountsTools'>
              <div className='t2AccountsSearch'>
                <div className='t2AccountsSearchIcon'>{svg.search(11)}</div>
                <input
                  aria-label='Search accounts'
                  placeholder='Search accounts'
                  spellCheck='false'
                  defaultValue={state.accountQuery}
                  ref={(input) => {
                    instance.accountSearchInput = input
                  }}
                  onChange={(e) => updateAccountSearch(e.target.value)}
                />
                {state.accountQuery ? (
                  <div
                    aria-label='Clear account search'
                    className='t2AccountsSearchClear'
                    onClick={() => clearAccountSearch()}
                    onKeyDown={(e) => onKeyboardActivate(e, () => clearAccountSearch())}
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
                onClick={() => startInlineAdd()}
                onKeyDown={(e) => onKeyboardActivate(e, () => startInlineAdd())}
                role='button'
                tabIndex={0}
              >
                {svg.plus(12)}
                <span>Add account</span>
              </div>
            </div>
            {state.addAccountError ? (
              <div className='t2AccountsNotice t2AccountsNoticeBad'>{state.addAccountError}</div>
            ) : null}
            <div className='t2OverlayScroll t2AccountsScroll'>
              {visibleIds.map((id) => {
                const account = accounts[id]
                const selected = id === current
                const navValue = accountNavValue(account)
                const renaming = state.accountRenaming === id
                const menuOpen = state.accountMenu === id
                const confirmingRemove = state.accountRemoving === id
                const confirmSeedPhraseRemoval =
                  confirmingRemove && isLastAccountForSeedPhrase(account, accounts)
                const rowClass = [
                  't2AccountRow',
                  selected ? 't2AccountRowSelected' : '',
                  state.draggingAccount === id ? 't2AccountRowDragging' : '',
                  state.dragOverAccount === id ? 't2AccountRowDropTarget' : ''
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <div
                    aria-current={selected ? 'true' : undefined}
                    aria-label={`${accountDisplayName(account)} ${shortAddress(account.address)}`}
                    key={id}
                    className={rowClass}
                    onDragOver={(e) => dragAccountOver(e, id)}
                    onDrop={(e) => dropAccount(e, id)}
                    onClick={() => {
                      setState({ accountsOpen: false })
                      if (!selected) void link.executeCommand({ type: 'account.select', accountId: id })
                    }}
                    onKeyDown={(e) =>
                      onKeyboardActivate(e, () => {
                        setState({ accountsOpen: false })
                        if (!selected) void link.executeCommand({ type: 'account.select', accountId: id })
                      })
                    }
                    role='button'
                    tabIndex={0}
                  >
                    <div
                      aria-label={`Drag ${accountDisplayName(account)} to reorder`}
                      className='t2AccountDragHandle'
                      draggable
                      onClick={(e) => e.stopPropagation()}
                      onDragEnd={() => endAccountDrag()}
                      onDragStart={(e) => startAccountDrag(e, id)}
                      title='Drag to reorder'
                    >
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className='t2AccountRowIcon'>{accountIcon(account, 18)}</div>
                    <div className='t2AccountRowInfo'>
                      {renaming ? (
                        <AccountRenameInput
                          ariaLabel={`Rename ${accountDisplayName(account)}`}
                          initialName={accountDisplayName(account)}
                          onCancel={() => setState({ accountRenaming: '' })}
                          onCommit={(name) => saveRenameAccount(id, name)}
                        />
                      ) : (
                        <div className='t2AccountRowName'>
                          {accountDisplayName(account)}
                          <div
                            aria-label={`Rename ${accountDisplayName(account)}`}
                            className='t2AccountInlineEdit'
                            onClick={(e) => {
                              e.stopPropagation()
                              startRenameAccount(account)
                            }}
                            onKeyDown={(e) => {
                              e.stopPropagation()
                              onKeyboardActivate(e, () => startRenameAccount(account))
                            }}
                            role='button'
                            tabIndex={0}
                          >
                            {svg.pencil(10)}
                          </div>
                        </div>
                      )}
                      <div className='t2AccountRowAddress'>{shortAddress(account.address)}</div>
                      <div className='t2AccountRowType'>{accountTypeLabel(account)}</div>
                    </div>
                    <div className='t2AccountRowRight'>
                      <div className='t2AccountRowValue'>{navValue}</div>
                      {selected ? <div className='t2AccountRowCheck'>{svg.check(14)}</div> : null}
                      <div
                        aria-label={`Copy address for ${accountDisplayName(account)}`}
                        className='t2AccountIconButton'
                        onClick={(e) => {
                          e.stopPropagation()
                          copyAccountAddress(account)
                        }}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          onKeyboardActivate(e, () => copyAccountAddress(account))
                        }}
                        role='button'
                        tabIndex={0}
                      >
                        {state.accountCopied === id ? svg.check(12) : svg.copy(12)}
                      </div>
                      <div
                        aria-expanded={menuOpen}
                        aria-label={`${accountDisplayName(account)} account actions`}
                        className='t2AccountIconButton'
                        onClick={(e) => {
                          e.stopPropagation()
                          setState({ accountMenu: menuOpen ? '' : id, accountRemoving: '' })
                        }}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          onKeyboardActivate(e, () =>
                            setState({ accountMenu: menuOpen ? '' : id, accountRemoving: '' })
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
                          onClick={() => startRenameAccount(account)}
                          onKeyDown={(e) => onKeyboardActivate(e, () => startRenameAccount(account))}
                          role='button'
                          tabIndex={0}
                        >
                          Rename account
                        </div>
                        {isHotAccount(account) ? (
                          <div
                            className='t2AccountAction'
                            onClick={() => openPrivateKeyExport(account)}
                            onKeyDown={(e) => onKeyboardActivate(e, () => openPrivateKeyExport(account))}
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
                              onClick={() => removeAccount(id)}
                              onKeyDown={(e) => onKeyboardActivate(e, () => removeAccount(id))}
                              role='button'
                              tabIndex={0}
                            >
                              Keep seed phrase
                            </div>
                            <div
                              className='t2AccountAction t2AccountActionDanger'
                              onClick={() => removeAccount(id, { removeSeedPhrase: true })}
                              onKeyDown={(e) =>
                                onKeyboardActivate(e, () => removeAccount(id, { removeSeedPhrase: true }))
                              }
                              role='button'
                              tabIndex={0}
                            >
                              Delete seed phrase
                            </div>
                            <div
                              className='t2AccountAction'
                              onClick={() => setState({ accountRemoving: '' })}
                              onKeyDown={(e) =>
                                onKeyboardActivate(e, () => setState({ accountRemoving: '' }))
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
                            onClick={() => removeAccount(id)}
                            onKeyDown={(e) => onKeyboardActivate(e, () => removeAccount(id))}
                            role='button'
                            tabIndex={0}
                          >
                            Confirm remove
                          </div>
                        ) : (
                          <div
                            className='t2AccountAction t2AccountActionDanger'
                            onClick={() => setState({ accountRemoving: id })}
                            onKeyDown={(e) => onKeyboardActivate(e, () => setState({ accountRemoving: id }))}
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

  const { accounts, currentAccount: current, notifications } = props.shared
  const account = accounts[current]
  const balances = account ? getBalances(account.address) : []

  return (
    <div className='t2Home'>
      {renderTopBar(account)}
      {renderMenu(account)}
      <StatusNotifications
        notifications={notifications}
        renderChainIcon={(notification) => {
          const chainId = Number(notification.leadingIcon?.chainId || notification.target?.chainId)
          return chainId ? chainIcon(chainId, 16, 10, 8) : null
        }}
        onDismiss={(id) =>
          void link.executeCommand({ type: 'notification.update', notificationId: id, action: 'dismiss' })
        }
        onExpire={(id) =>
          void link.executeCommand({ type: 'notification.update', notificationId: id, action: 'expire' })
        }
        onOpen={(notification) => openActivityTarget(notification.target)}
      />
      {renderHero(balances)}
      {renderTabs()}
      {renderSearch()}
      <div className='t2Main'>
        {state.tab === 'positions'
          ? renderPositions(balances)
          : state.tab === 'activity'
            ? renderActivity(account)
            : renderOrders(account)}
      </div>
      {renderNetworksOverlay(balances)}
      {renderAssetDetailsOverlay()}
      {renderActivityDetails()}
      {renderOrderDetails()}
      {renderRequestsOverlay(current)}
      {renderDappsOverlay(current)}
      {renderAddChainOverlay()}
      {renderReceiveOverlay(accounts)}
      {renderSettingsOverlay()}
      {renderAboutOverlay()}
      {renderAccountsPanel(current)}
    </div>
  )
}

export default function HomeContainer() {
  const shared = useWalletSelector(useShallow(selectHomeSharedState))
  return <Home shared={shared} />
}
