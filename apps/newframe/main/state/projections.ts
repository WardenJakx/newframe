import type { CanonicalState } from '../store/state/index.js'
import { createBalanceSummarySelector } from '../../domain/balance/index.js'
import { getProfileAccountIds } from '../../domain/state/main.js'
import {
  WalletHomeCommandSchema,
  WalletPanelNavigationEntrySchema,
  WalletStatusNotificationSchema,
  type WalletPanelNavigationEntry,
  type SideTrayRendererState,
  type RendererProjection,
  type WalletRendererState
} from '../../contracts/state/projections.js'

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

  const navigation = (entries: CanonicalState['windows']['panel']['nav']): WalletPanelNavigationEntry[] =>
    entries.flatMap((entry) => {
      const result = WalletPanelNavigationEntrySchema.safeParse(entry)
      return result.success ? [result.data] : []
    })

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
  const notifications = Object.fromEntries(
    Object.entries(view.notifications).flatMap(([id, notification]) => {
      const result = WalletStatusNotificationSchema.safeParse(notification)
      return result.success ? [[id, result.data]] : []
    })
  )
  previousWalletView = {
    notify: view.notify,
    notifyData: view.notifyData,
    notifications,
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
  const homeCommand = WalletHomeCommandSchema.safeParse(tray.homeCommand)
  previousWalletTray = {
    open: tray.open,
    initial: tray.initial,
    homeCommand: homeCommand.success ? homeCommand.data : null
  }
  return previousWalletTray
}

let previousWalletProfileInputs:
  | Pick<
      CanonicalMain,
      | 'profiles'
      | 'profileOrder'
      | 'accounts'
      | 'accountOrder'
      | 'balances'
      | 'assetRates'
      | 'networks'
      | 'networksMeta'
      | 'tokens'
    >
  | undefined
let previousWalletProfiles: WalletRendererState['profiles'] | undefined
const walletProfileBalanceSelectors = new Map<string, ReturnType<typeof createBalanceSummarySelector>>()

function projectWalletProfiles(main: CanonicalMain): WalletRendererState['profiles'] {
  const inputs = {
    profiles: main.profiles,
    profileOrder: main.profileOrder,
    accounts: main.accounts,
    accountOrder: main.accountOrder,
    balances: main.balances,
    assetRates: main.assetRates,
    networks: main.networks,
    networksMeta: main.networksMeta,
    tokens: main.tokens
  }
  if (
    previousWalletProfileInputs &&
    sameTopLevelReferences(previousWalletProfileInputs, inputs) &&
    previousWalletProfiles
  ) {
    return previousWalletProfiles
  }

  previousWalletProfileInputs = inputs
  const profiles: WalletRendererState['profiles'] = []
  main.profileOrder.forEach((profileId) => {
    const profile = main.profiles[profileId]
    if (!profile) return

    const accountIds = getProfileAccountIds(main, profileId)
    const accountAddresses = accountIds.flatMap((id) => {
      const address = main.accounts[id]?.address
      return address ? [address] : []
    })
    const cachedAddresses = accountAddresses.filter((address) =>
      Object.prototype.hasOwnProperty.call(main.balances, address)
    )
    if (cachedAddresses.length === 0) {
      profiles.push({
        id: profile.id,
        name: profile.name,
        accountCount: accountIds.length,
        cachedValue: { state: 'missing' }
      })
      return
    }

    let selectBalanceSummaries = walletProfileBalanceSelectors.get(profileId)
    if (!selectBalanceSummaries) {
      selectBalanceSummaries = createBalanceSummarySelector()
      walletProfileBalanceSelectors.set(profileId, selectBalanceSummaries)
    }
    const summaries = selectBalanceSummaries({
      rawBalances: cachedAddresses.flatMap((address) => main.balances[address] || []),
      assetRates: main.assetRates,
      networks: main.networks.ethereum,
      networksMeta: main.networksMeta.ethereum,
      tokens: main.tokens,
      cacheKey: profileId
    })
    const priced = summaries.filter((balance) => balance.hasPrice)
    const cachedValue =
      summaries.length > 0 && priced.length === 0
        ? ({ state: 'unpriced' } as const)
        : ({
            state: 'priced',
            value: priced.reduce((total, balance) => total + balance.totalValue, 0)
          } as const)

    profiles.push({ id: profile.id, name: profile.name, accountCount: accountIds.length, cachedValue })
  })
  const unchanged =
    previousWalletProfiles?.length === profiles.length &&
    profiles.every((profile, index) => {
      const previous = previousWalletProfiles?.[index]
      return (
        previous?.id === profile.id &&
        previous.name === profile.name &&
        previous.accountCount === profile.accountCount &&
        previous.cachedValue.state === profile.cachedValue.state &&
        (profile.cachedValue.state !== 'priced' ||
          (previous.cachedValue.state === 'priced' &&
            previous.cachedValue.value === profile.cachedValue.value))
      )
    })
  if (!unchanged) previousWalletProfiles = profiles
  return previousWalletProfiles!
}

let previousWalletAccountsInput: CanonicalMain['accounts'] | undefined
let previousWalletAccountOrderInput: CanonicalMain['accountOrder'] | undefined
let previousWalletCurrentProfile = ''
let previousWalletAccounts: WalletRendererState['accounts'] | undefined
let previousWalletAccountOrder: WalletRendererState['accountOrder'] | undefined

function projectWalletAccounts(main: CanonicalMain) {
  if (
    main.accounts === previousWalletAccountsInput &&
    main.accountOrder === previousWalletAccountOrderInput &&
    main.currentProfile === previousWalletCurrentProfile &&
    previousWalletAccounts &&
    previousWalletAccountOrder
  ) {
    return { accounts: previousWalletAccounts, accountOrder: previousWalletAccountOrder }
  }

  const accountOrder = getProfileAccountIds(main, main.currentProfile)
  previousWalletAccountsInput = main.accounts
  previousWalletAccountOrderInput = main.accountOrder
  previousWalletCurrentProfile = main.currentProfile
  previousWalletAccountOrder = accountOrder
  previousWalletAccounts = Object.fromEntries(
    accountOrder.map((id) => [id, main.accounts[id]])
  ) as WalletRendererState['accounts']
  return { accounts: previousWalletAccounts!, accountOrder }
}

export function projectWalletState(state: CanonicalState): WalletRendererState {
  const { main } = state
  const { accounts, accountOrder } = projectWalletAccounts(main)
  const projection: WalletRendererState = {
    accounts,
    accountOrder,
    activity: main.activity,
    appLock: main.appLock,
    autoDiscoverTokens: main.autoDiscoverTokens,
    autohide: main.autohide,
    balances: main.balances,
    biometricUnlock: main.biometricUnlock,
    currentAccount: main.currentAccount,
    currentProfile: main.currentProfile,
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
    portfolioApiKeyConfigured: main.portfolioApiKey.trim().length > 0,
    profiles: projectWalletProfiles(main),
    assetRates: main.assetRates,
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
let previousSideTrayAccountOrderInput: CanonicalMain['accountOrder'] | undefined
let previousSideTrayCurrentProfile = ''
let previousSideTrayAccounts: SideTrayRendererState['accounts'] | undefined
let previousSideTrayAccountOrder: SideTrayRendererState['accountOrder'] | undefined

function projectSideTrayAccounts(main: CanonicalMain) {
  if (
    main.accounts === previousSideTrayAccountsInput &&
    main.accountOrder === previousSideTrayAccountOrderInput &&
    main.currentProfile === previousSideTrayCurrentProfile &&
    previousSideTrayAccounts &&
    previousSideTrayAccountOrder
  ) {
    return { accounts: previousSideTrayAccounts, accountOrder: previousSideTrayAccountOrder }
  }

  const accountOrder = getProfileAccountIds(main, main.currentProfile)
  previousSideTrayAccountsInput = main.accounts
  previousSideTrayAccountOrderInput = main.accountOrder
  previousSideTrayCurrentProfile = main.currentProfile
  previousSideTrayAccountOrder = accountOrder
  previousSideTrayAccounts = Object.fromEntries(
    accountOrder.map((id) => {
      const account = main.accounts[id]
      return [
        id,
        {
          id: account.id,
          address: account.address,
          name: account.name,
          lastSignerType: account.lastSignerType,
          ...(account.ensName ? { ensName: account.ensName } : {})
        }
      ]
    })
  )
  return { accounts: previousSideTrayAccounts, accountOrder }
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
            image: chainMetadata.image,
            primaryColor: chainMetadata.primaryColor || 'accent1',
            nativeCurrency: chainMetadata.nativeCurrency
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

let previousSideTrayActivityInput: CanonicalMain['activity'] | undefined
let previousSideTrayActivityAccount = ''
let previousSideTrayActivity: SideTrayRendererState['activity'] | undefined

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function projectSideTrayActivity(
  activity: CanonicalMain['activity'],
  account: string
): SideTrayRendererState['activity'] {
  if (
    activity === previousSideTrayActivityInput &&
    account === previousSideTrayActivityAccount &&
    previousSideTrayActivity
  ) {
    return previousSideTrayActivity
  }

  const normalizedAccount = account.toLowerCase()
  previousSideTrayActivityInput = activity
  previousSideTrayActivityAccount = account
  previousSideTrayActivity = Object.fromEntries(
    Object.entries(activity).flatMap(([activityId, record]) => {
      const sender = String(record.account || record.address || '').toLowerCase()
      if (!normalizedAccount || sender !== normalizedAccount) return []

      const rawData = objectValue(record.data)
      const data = {
        ...(typeof rawData.to === 'string' ? { to: rawData.to } : {}),
        ...(typeof rawData.data === 'string' ? { data: rawData.data } : {})
      }
      const rawActions = Array.isArray(record.recognizedActions) ? record.recognizedActions : []
      const recognizedActions = rawActions.flatMap((value) => {
        const action = objectValue(value)
        if (action.id !== 'erc20:transfer') return []

        const actionData = objectValue(action.data)
        const recipient = objectValue(actionData.recipient)
        if (typeof recipient.address !== 'string') return []

        return [
          {
            id: 'erc20:transfer',
            data: { recipient: { address: recipient.address } }
          }
        ]
      })

      return [
        [
          activityId,
          {
            id: record.id,
            account: record.account,
            address: record.address,
            status: record.status,
            ...(Object.keys(data).length ? { data } : {}),
            ...(recognizedActions.length ? { recognizedActions } : {})
          }
        ]
      ]
    })
  )

  return previousSideTrayActivity
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
  const { accounts, accountOrder } = projectSideTrayAccounts(main)
  const networks = projectSideTrayNetworks(main.networks)
  const currentAddress = accounts[main.currentAccount]?.address || ''
  const projection: SideTrayRendererState = {
    accounts,
    accountOrder,
    activity: projectSideTrayActivity(main.activity, currentAddress),
    balances: projectSideTrayBalances(main.balances, main.currentAccount, accounts),
    currentAccount: main.currentAccount,
    networks,
    networksMeta: projectSideTrayNetworkMetadata(main.networksMeta, networks),
    assetRates: main.assetRates,
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
