import type { CanonicalState } from '../store/state'
import type {
  DappRendererState,
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
      dashShow: boolean
      dashNav: CanonicalState['windows']['dash']['nav']
    }
  | undefined
let previousWalletWindows: WalletRendererState['windows'] | undefined

function projectWalletWindows(windows: CanonicalState['windows']): WalletRendererState['windows'] {
  const inputs = {
    panelShow: windows.panel.show,
    panelNav: windows.panel.nav,
    dashShow: windows.dash.show,
    dashNav: windows.dash.nav
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
    panel: { show: inputs.panelShow, nav: navigation(inputs.panelNav) },
    dash: { show: inputs.dashShow, nav: navigation(inputs.dashNav) }
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

let previousDappAccountsInput: CanonicalMain['accounts'] | undefined
let previousDappAccounts: DappRendererState['accounts'] | undefined

function projectDappAccounts(accounts: CanonicalMain['accounts']): DappRendererState['accounts'] {
  if (accounts === previousDappAccountsInput && previousDappAccounts) return previousDappAccounts

  previousDappAccountsInput = accounts
  previousDappAccounts = Object.fromEntries(
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
  return previousDappAccounts
}

let previousDappNetworksInput: CanonicalMain['networks'] | undefined
let previousDappNetworks: DappRendererState['networks'] | undefined

function projectDappNetworks(networks: CanonicalMain['networks']): DappRendererState['networks'] {
  if (networks === previousDappNetworksInput && previousDappNetworks) return previousDappNetworks

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

  previousDappNetworksInput = networks
  previousDappNetworks = { ethereum }
  return previousDappNetworks
}

let previousDappNetworkMetadataInput: CanonicalMain['networksMeta'] | undefined
let previousDappNetworkMetadataNetworks: DappRendererState['networks'] | undefined
let previousDappNetworkMetadata: DappRendererState['networksMeta'] | undefined

function projectDappNetworkMetadata(
  metadata: CanonicalMain['networksMeta'],
  networks: DappRendererState['networks']
): DappRendererState['networksMeta'] {
  if (
    metadata === previousDappNetworkMetadataInput &&
    networks === previousDappNetworkMetadataNetworks &&
    previousDappNetworkMetadata
  ) {
    return previousDappNetworkMetadata
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

  previousDappNetworkMetadataInput = metadata
  previousDappNetworkMetadataNetworks = networks
  previousDappNetworkMetadata = { ethereum }
  return previousDappNetworkMetadata
}

let previousDappBalancesInput: CanonicalMain['balances'] | undefined
let previousDappBalancesAccount = ''
let previousDappBalancesAccounts: DappRendererState['accounts'] | undefined
let previousDappBalances: DappRendererState['balances'] | undefined

function projectDappBalances(
  balances: CanonicalMain['balances'],
  currentAccount: string,
  accounts: DappRendererState['accounts']
): DappRendererState['balances'] {
  if (
    balances === previousDappBalancesInput &&
    currentAccount === previousDappBalancesAccount &&
    accounts === previousDappBalancesAccounts &&
    previousDappBalances
  ) {
    return previousDappBalances
  }

  const currentAddress = accounts[currentAccount]?.address || ''
  previousDappBalancesInput = balances
  previousDappBalancesAccount = currentAccount
  previousDappBalancesAccounts = accounts
  previousDappBalances = currentAddress ? { [currentAddress]: balances[currentAddress] || [] } : {}
  return previousDappBalances
}

let previousDappRatesInput: CanonicalMain['rates'] | undefined
let previousDappRates: DappRendererState['rates'] | undefined

function projectDappRates(rates: CanonicalMain['rates']): DappRendererState['rates'] {
  if (rates === previousDappRatesInput && previousDappRates) return previousDappRates

  previousDappRatesInput = rates
  previousDappRates = Object.fromEntries(
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
  return previousDappRates
}

let previousDappProjection: DappRendererState | undefined

export function projectDappState(state: CanonicalState): DappRendererState {
  const { main } = state
  const accounts = projectDappAccounts(main.accounts)
  const networks = projectDappNetworks(main.networks)
  const projection: DappRendererState = {
    accounts,
    accountOrder: main.accountOrder,
    balances: projectDappBalances(main.balances, main.currentAccount, accounts),
    currentAccount: main.currentAccount,
    networks,
    networksMeta: projectDappNetworkMetadata(main.networksMeta, networks),
    rates: projectDappRates(main.rates),
    runtime: main.runtime
  }

  if (sameTopLevelReferences(previousDappProjection, projection)) return previousDappProjection!
  previousDappProjection = projection
  return projection
}

export function projectRendererState(state: CanonicalState, projection: RendererProjection) {
  return projection === 'dapp' ? projectDappState(state) : projectWalletState(state)
}
