import type { CanonicalState } from '../store/state'
import type {
  SideTrayRendererState,
  RendererProjection,
  WalletRendererState
} from '../../resources/state/projections'

type CanonicalMain = CanonicalState['main']

const sameTopLevelReferences = <T extends object>(previous: T | undefined, current: T) =>
  !!previous && Object.keys(current).every((key) => previous[key as keyof T] === current[key as keyof T])

let previousWalletProjection: WalletRendererState | undefined

let previousWalletWindowsInputs:
  | {
      panelShow: boolean
      panelNav: CanonicalState['windows']['panel']['nav']
    }
  | undefined
let previousWalletWindows: WalletRendererState['windows'] | undefined

function projectWalletWindows(windows: CanonicalState['windows']): WalletRendererState['windows'] {
  const inputs = {
    panelShow: windows.panel.show,
    panelNav: windows.panel.nav
  }
  if (
    previousWalletWindowsInputs &&
    sameTopLevelReferences(previousWalletWindowsInputs, inputs) &&
    previousWalletWindows
  ) {
    return previousWalletWindows
  }

  const navigation = (entries: CanonicalState['windows']['panel']['nav']) =>
    entries.map(({ view, data = {} }) => ({
      view,
      data: {
        account: data.account,
        accountId: data.accountId,
        chain: data.chain,
        dappDetails: data.dappDetails,
        id: data.id,
        notify: data.notify,
        notifyData: data.notifyData,
        request: data.request,
        requestId: data.requestId,
        showAddAccounts: data.showAddAccounts,
        signer: data.signer,
        step: data.step
      }
    }))

  previousWalletWindowsInputs = inputs
  previousWalletWindows = {
    panel: { show: inputs.panelShow, nav: navigation(inputs.panelNav) }
  }
  return previousWalletWindows
}

let previousWalletViewInput: CanonicalState['view'] | undefined
let previousWalletView: WalletRendererState['view'] | undefined

function projectWalletView(view: CanonicalState['view']): WalletRendererState['view'] {
  if (
    previousWalletViewInput?.notify === view.notify &&
    previousWalletViewInput.notifyData === view.notifyData &&
    previousWalletViewInput.notifications === view.notifications &&
    previousWalletViewInput.badge === view.badge &&
    previousWalletView
  ) {
    return previousWalletView
  }

  previousWalletViewInput = view
  previousWalletView = {
    notify: view.notify,
    notifyData: view.notifyData,
    notifications: view.notifications,
    badge: view.badge
  }
  return previousWalletView
}

let previousWalletSelectedInput: CanonicalState['selected'] | undefined
let previousWalletSelected: WalletRendererState['selected'] | undefined

function projectWalletSelected(selected: CanonicalState['selected']): WalletRendererState['selected'] {
  if (
    previousWalletSelectedInput?.minimized === selected.minimized &&
    previousWalletSelectedInput.open === selected.open &&
    previousWalletSelected
  ) {
    return previousWalletSelected
  }

  previousWalletSelectedInput = selected
  previousWalletSelected = {
    minimized: selected.minimized,
    open: selected.open
  }
  return previousWalletSelected
}

let previousWalletTrayInput: CanonicalState['tray'] | undefined
let previousWalletTray: WalletRendererState['tray'] | undefined

function projectWalletTray(tray: CanonicalState['tray']): WalletRendererState['tray'] {
  if (
    previousWalletTrayInput?.open === tray.open &&
    previousWalletTrayInput.initial === tray.initial &&
    previousWalletTrayInput.homeCommand === tray.homeCommand &&
    previousWalletTray
  ) {
    return previousWalletTray
  }

  previousWalletTrayInput = tray
  previousWalletTray = {
    open: tray.open,
    initial: tray.initial,
    homeCommand: tray.homeCommand
  }
  return previousWalletTray
}

export function projectWalletState(state: CanonicalState): WalletRendererState {
  const { main } = state
  const projection: WalletRendererState = {
    accounts: main.accounts as unknown as WalletRendererState['accounts'],
    accountOrder: main.accountOrder,
    activity: main.activity,
    appLock: main.appLock,
    autoDiscoverTokens: main.autoDiscoverTokens,
    autohide: main.autohide,
    balances: main.balances,
    biometricUnlock: main.biometricUnlock,
    currentAccount: main.currentAccount,
    instanceId: main.instanceId,
    latticeSettings: main.latticeSettings,
    launch: main.launch,
    ledger: main.ledger,
    menubarGasPrice: main.menubarGasPrice,
    mute: main.mute,
    networks: main.networks,
    networksMeta: main.networksMeta,
    orders: main.orders,
    origins: main.origins,
    permissions: main.permissions,
    portfolioApiKey: main.portfolioApiKey,
    rates: main.rates,
    reveal: main.reveal,
    runtime: main.runtime,
    shortcuts: main.shortcuts,
    showLocalNameWithENS: main.showLocalNameWithENS,
    showTestnets: main.showTestnets,
    signers: main.signers,
    tokens: main.tokens,
    trezor: main.trezor,
    windows: projectWalletWindows(state.windows),
    view: projectWalletView(state.view),
    tray: projectWalletTray(state.tray),
    selected: projectWalletSelected(state.selected),
    platform: state.platform
  }

  if (sameTopLevelReferences(previousWalletProjection, projection)) return previousWalletProjection!
  previousWalletProjection = projection
  return projection
}

let previousSideTrayAccountsInput: CanonicalMain['accounts'] | undefined
let previousSideTrayAccounts: SideTrayRendererState['accounts'] | undefined

function projectSideTrayAccounts(accounts: CanonicalMain['accounts']): SideTrayRendererState['accounts'] {
  if (accounts === previousSideTrayAccountsInput && previousSideTrayAccounts) {
    return previousSideTrayAccounts
  }

  previousSideTrayAccountsInput = accounts
  previousSideTrayAccounts = Object.fromEntries(
    Object.entries(accounts).map(([id, account]) => [
      id,
      {
        id: account.id,
        address: account.address,
        name: account.name,
        lastSignerType: account.lastSignerType,
        ...(account.ensName ? { ensName: account.ensName } : {})
      }
    ])
  )
  return previousSideTrayAccounts
}

let previousSideTrayNetworksInput: CanonicalMain['networks'] | undefined
let previousSideTrayNetworks: SideTrayRendererState['networks'] | undefined

function projectSideTrayNetworks(networks: CanonicalMain['networks']): SideTrayRendererState['networks'] {
  if (networks === previousSideTrayNetworksInput && previousSideTrayNetworks) {
    return previousSideTrayNetworks
  }

  const ethereum = Object.fromEntries(
    Object.entries(networks.ethereum)
      .filter(([, network]) => network.on)
      .map(([chainId, network]) => [
        chainId,
        {
          id: network.id,
          name: network.name,
          on: network.on,
          layer: network.layer,
          isTestnet: network.isTestnet,
          explorer: network.explorer
        }
      ])
  )

  previousSideTrayNetworksInput = networks
  previousSideTrayNetworks = { ethereum }
  return previousSideTrayNetworks
}

let previousSideTrayNetworkMetadataInput: CanonicalMain['networksMeta'] | undefined
let previousSideTrayNetworkMetadataNetworks: SideTrayRendererState['networks'] | undefined
let previousSideTrayNetworkMetadata: SideTrayRendererState['networksMeta'] | undefined

function projectSideTrayNetworkMetadata(
  metadata: CanonicalMain['networksMeta'],
  networks: SideTrayRendererState['networks']
): SideTrayRendererState['networksMeta'] {
  if (
    metadata === previousSideTrayNetworkMetadataInput &&
    networks === previousSideTrayNetworkMetadataNetworks &&
    previousSideTrayNetworkMetadata
  ) {
    return previousSideTrayNetworkMetadata
  }

  const ethereum = Object.fromEntries(
    Object.keys(networks.ethereum).flatMap((chainId) => {
      const chainMetadata = metadata.ethereum[Number(chainId)]
      if (!chainMetadata) return []

      return [
        [
          chainId,
          {
            icon: chainMetadata.icon,
            primaryColor: chainMetadata.primaryColor || 'accent1',
            nativeCurrency: {
              ...chainMetadata.nativeCurrency,
              usd: chainMetadata.nativeCurrency.usd || { price: 0, change24hr: 0 }
            }
          }
        ]
      ]
    })
  )

  previousSideTrayNetworkMetadataInput = metadata
  previousSideTrayNetworkMetadataNetworks = networks
  previousSideTrayNetworkMetadata = { ethereum }
  return previousSideTrayNetworkMetadata
}

let previousSideTrayBalancesInput: CanonicalMain['balances'] | undefined
let previousSideTrayBalancesAccount = ''
let previousSideTrayBalancesAccounts: SideTrayRendererState['accounts'] | undefined
let previousSideTrayBalances: SideTrayRendererState['balances'] | undefined

function projectSideTrayBalances(
  balances: CanonicalMain['balances'],
  currentAccount: string,
  accounts: SideTrayRendererState['accounts']
): SideTrayRendererState['balances'] {
  if (
    balances === previousSideTrayBalancesInput &&
    currentAccount === previousSideTrayBalancesAccount &&
    accounts === previousSideTrayBalancesAccounts &&
    previousSideTrayBalances
  ) {
    return previousSideTrayBalances
  }

  const currentAddress = accounts[currentAccount]?.address || ''
  previousSideTrayBalancesInput = balances
  previousSideTrayBalancesAccount = currentAccount
  previousSideTrayBalancesAccounts = accounts
  previousSideTrayBalances = currentAddress ? { [currentAddress]: balances[currentAddress] || [] } : {}
  return previousSideTrayBalances
}

let previousSideTrayRatesInput: CanonicalMain['rates'] | undefined
let previousSideTrayRates: SideTrayRendererState['rates'] | undefined

function projectSideTrayRates(rates: CanonicalMain['rates']): SideTrayRendererState['rates'] {
  if (rates === previousSideTrayRatesInput && previousSideTrayRates) return previousSideTrayRates

  previousSideTrayRatesInput = rates
  previousSideTrayRates = Object.fromEntries(
    Object.entries(rates).map(([assetId, rate]) => {
      if (!rate || typeof rate !== 'object' || !('usd' in rate)) return [assetId, {}]
      const usd = rate.usd
      if (
        !usd ||
        typeof usd !== 'object' ||
        !('price' in usd) ||
        !('change24hr' in usd) ||
        typeof usd.price !== 'number' ||
        typeof usd.change24hr !== 'number'
      ) {
        return [assetId, {}]
      }

      return [assetId, { usd: { price: usd.price, change24hr: usd.change24hr } }]
    })
  )
  return previousSideTrayRates
}

let previousSideTrayProjection: SideTrayRendererState | undefined
let previousSideTrayTokensInput: CanonicalMain['tokens'] | undefined
let previousSideTrayTokensAccount = ''
let previousSideTrayTokens: SideTrayRendererState['tokens'] | undefined

function projectSideTrayTokens(
  tokens: CanonicalMain['tokens'],
  account: string
): SideTrayRendererState['tokens'] {
  if (
    tokens === previousSideTrayTokensInput &&
    account === previousSideTrayTokensAccount &&
    previousSideTrayTokens
  ) {
    return previousSideTrayTokens
  }

  const accountIds = tokens.accountTokenIds[account] || []
  const visibleIds = new Set([
    ...accountIds,
    ...Object.entries(tokens.byId)
      .filter(([, token]) => token.custom || token.curated)
      .map(([tokenId]) => tokenId)
  ])

  previousSideTrayTokensInput = tokens
  previousSideTrayTokensAccount = account
  previousSideTrayTokens = {
    byId: Object.fromEntries(
      [...visibleIds].flatMap((tokenId) => (tokens.byId[tokenId] ? [[tokenId, tokens.byId[tokenId]]] : []))
    ),
    accountTokenIds: account ? { [account]: accountIds } : {}
  }
  return previousSideTrayTokens
}

export function projectSideTrayState(state: CanonicalState): SideTrayRendererState {
  const { main } = state
  const accounts = projectSideTrayAccounts(main.accounts)
  const networks = projectSideTrayNetworks(main.networks)
  const currentAddress = accounts[main.currentAccount]?.address || ''
  const projection: SideTrayRendererState = {
    accounts,
    accountOrder: main.accountOrder,
    balances: projectSideTrayBalances(main.balances, main.currentAccount, accounts),
    currentAccount: main.currentAccount,
    networks,
    networksMeta: projectSideTrayNetworkMetadata(main.networksMeta, networks),
    rates: projectSideTrayRates(main.rates),
    tokens: projectSideTrayTokens(main.tokens, currentAddress),
    runtime: main.runtime
  }

  if (sameTopLevelReferences(previousSideTrayProjection, projection)) return previousSideTrayProjection!
  previousSideTrayProjection = projection
  return projection
}

export function projectRendererState(state: CanonicalState, projection: RendererProjection) {
  return projection === 'sidetray' ? projectSideTrayState(state) : projectWalletState(state)
}
