import log from 'electron-log'
import { v5 as uuidv5 } from 'uuid'
import { NATIVE_CURRENCY } from '../../../resources/constants'
import { accountNS, isDefaultAccountName } from '../../../resources/domain/account'
import { toTokenId } from '../../../resources/domain/balance'

import * as panelActions from '../../../resources/store/actions.panel'

// updater function passed into every action by react-restore:
// u(...path, updateFn) applies updateFn to the state at the given path
type U = (...args: any[]) => void

const supportedNetworkTypes = ['ethereum']
const completedActivityStatuses = new Set(['succeeded', 'reverted'])
const homeDashViews = new Set(['accounts', 'chains', 'settings'])
let homeCommandId = 0

function toHomeCommand(command: any) {
  const view = command?.view === 'chains' ? 'networks' : command?.view

  return {
    id: ++homeCommandId,
    view,
    data: command?.data || {}
  }
}

function switchChainForOrigins(origins: any, oldChainId: number, newChainId: number) {
  Object.entries(origins as Record<string, any>).forEach(([origin, { chain }]) => {
    if (oldChainId === chain.id) {
      origins[origin].chain = { id: newChainId, type: 'ethereum' }
    }
  })
}

function validateNetworkSettings(network: any) {
  const networkId = parseInt(network.id)

  if (
    !Number.isInteger(networkId) ||
    typeof network.type !== 'string' ||
    typeof network.name !== 'string' ||
    typeof network.explorer !== 'string' ||
    typeof network.symbol !== 'string' ||
    !supportedNetworkTypes.includes(network.type)
  ) {
    throw new Error(`Invalid network settings: ${JSON.stringify(network)}`)
  }

  return networkId
}

function includesToken(tokens: any[], token: any) {
  const existingAddress = token.address.toLowerCase()
  return tokens.some((t) => t.address.toLowerCase() === existingAddress && t.chainId === token.chainId)
}

const actions = {
  ...panelActions,
  // setSync: (u, key, payload) => u(key, () => payload),
  activateNetwork: (u: U, type: string, chainId: number, active: boolean) => {
    u('main.networks', type, chainId, 'on', () => active)

    if (!active) {
      u('main', (main: any) => {
        // If de-activating a network that an origin is currently using, switch them to mainnet
        switchChainForOrigins(main.origins, chainId, 1)

        return main
      })
    }
  },
  selectPrimary: (u: U, netType: string, netId: number, value: any) => {
    u('main.networks', netType, netId, 'connection.primary.current', () => value)
  },
  selectSecondary: (u: U, netType: string, netId: number, value: any) => {
    u('main.networks', netType, netId, 'connection.secondary.current', () => value)
  },
  setPrimaryCustom: (u: U, netType: string, netId: number, target: any) => {
    if (!netType || !netId) return
    u('main.networks', netType, netId, 'connection.primary.custom', () => target)
  },
  setSecondaryCustom: (u: U, netType: string, netId: number, target: any) => {
    if (!netType || !netId) return
    u('main.networks', netType, netId, 'connection.secondary.custom', () => target)
  },
  toggleConnection: (u: U, netType: string, netId: number, node: any, on?: boolean) => {
    u('main.networks', netType, netId, 'connection', node, 'on', (value: boolean) => {
      return on !== undefined ? on : !value
    })
  },
  setPrimary: (u: U, netType: string, netId: number, status: any) => {
    u('main.networks', netType, netId, 'connection.primary', (primary: any) => {
      return Object.assign({}, primary, status)
    })
  },
  setSecondary: (u: U, netType: string, netId: number, status: any) => {
    u('main.networks', netType, netId, 'connection.secondary', (secondary: any) => {
      return Object.assign({}, secondary, status)
    })
  },
  setLaunch: (u: U, launch: boolean) => u('main.launch', () => launch),
  toggleLaunch: (u: U) => u('main.launch', (launch: boolean) => !launch),
  toggleReveal: (u: U) => u('main.reveal', (reveal: boolean) => !reveal),
  toggleShowLocalNameWithENS: (u: U) =>
    u('main.showLocalNameWithENS', (showLocalNameWithENS: boolean) => !showLocalNameWithENS),
  setAutoDiscoverTokens: (u: U, value: boolean) => {
    u('main.autoDiscoverTokens', (_current: boolean, state: any) => {
      const apiKey = state?.main?.portfolioApiKey
      return Boolean(value) && typeof apiKey === 'string' && apiKey.trim().length > 0
    })
  },
  setPortfolioApiKey: (u: U, value: string) => {
    const apiKey = typeof value === 'string' ? value.replace(/\s+/g, '') : ''

    u('main.portfolioApiKey', () => apiKey)

    if (!apiKey) {
      u('main.autoDiscoverTokens', () => false)
    }
  },
  setShowTestnets: (u: U, value: boolean) => {
    u('main.showTestnets', () => Boolean(value))
  },
  setPermission: (u: U, address: string, permission: any) => {
    u('main.permissions', address, (permissions: any = {}) => {
      if (permission.provider) {
        return {
          ...permissions,
          [permission.handlerId]: permission
        }
      }

      const nextPermissions = { ...permissions }
      delete nextPermissions[permission.handlerId]
      return nextPermissions
    })
  },
  revokePermission: (u: U, address: string, handlerId: string) => {
    if (!address || !handlerId) return

    u('main.permissions', address, (permissions: any = {}) => {
      if (!permissions[handlerId]) return permissions

      const nextPermissions = { ...permissions }
      delete nextPermissions[handlerId]
      return nextPermissions
    })
  },
  clearPermissions: (u: U, address: string) => {
    u('main.permissions', address, () => {
      return {}
    })
  },
  setAccountCloseLock: (u: U, value: any) => {
    u('main.accountCloseLock', () => Boolean(value))
  },
  syncPath: (u: U, path: string, value: any) => {
    if (!path || path === '*' || path.startsWith('main')) return // Don't allow updates to main state
    u(path, () => value)
  },
  dontRemind: (u: U, version: string) => {
    u('main.updater.dontRemind', (dontRemind: string[]) => {
      if (!dontRemind.includes(version)) {
        return [...dontRemind, version]
      }

      return dontRemind
    })
  },
  setUpdaterLastChecked: (u: U, lastChecked: number) => {
    u('main.updater.lastChecked', () => lastChecked)
  },
  upsertSubmittedActivity: (u: U, activity: any) => {
    const id = activity?.id
    if (!id) return

    const now = Date.now()

    u('main.activity', id, (existingActivity: any = {}) => {
      const submittedActivity = {
        ...existingActivity,
        ...activity,
        id,
        status: 'submitted',
        submittedAt: activity.submittedAt ?? existingActivity.submittedAt ?? now,
        updatedAt: activity.updatedAt ?? now,
        confirmations: activity.confirmations ?? existingActivity.confirmations ?? 0
      }

      if (activity.completedAt === undefined) delete submittedActivity.completedAt

      return submittedActivity
    })
  },
  updateActivity: (u: U, id: string, update: any = {}) => {
    if (!id) return

    const now = Date.now()

    u('main.activity', id, (activity: any = { id }) => {
      return {
        ...activity,
        ...update,
        id,
        status: update.status ?? activity.status ?? 'confirming',
        updatedAt: update.updatedAt ?? now
      }
    })
  },
  finalizeActivity: (u: U, id: string, status: string, update: any = {}) => {
    if (!id) return
    if (!completedActivityStatuses.has(status)) {
      return log.warn(`Invalid finalized activity status: ${status}`)
    }

    const completedAt = update.completedAt ?? Date.now()

    u('main.activity', id, (activity: any = { id }) => {
      return {
        ...activity,
        ...update,
        id,
        status,
        completedAt,
        updatedAt: update.updatedAt ?? completedAt,
        confirmations: update.confirmations ?? activity.confirmations ?? 0
      }
    })
  },
  pruneActivity: (u: U, id: string) => {
    if (!id) return

    u('main.activity', (activity: any = {}) => {
      const nextActivity = { ...activity }
      delete nextActivity[id]
      return nextActivity
    })
  },
  upsertOrder: (u: U, order: any) => {
    const orderId = order?.orderId
    if (!orderId) return

    const now = Date.now()

    u('main.orders', orderId, (existingOrder: any = {}) => {
      const source =
        order.source ?? order.provider ?? existingOrder.source ?? existingOrder.provider ?? 'flash'
      const provider =
        order.provider ?? order.source ?? existingOrder.provider ?? existingOrder.source ?? source

      return {
        ...existingOrder,
        ...order,
        orderId,
        provider,
        source,
        createdAt: order.createdAt ?? existingOrder.createdAt ?? now,
        updatedAt: order.updatedAt ?? now
      }
    })
  },
  updateOrder: (u: U, orderId: string, update: any = {}) => {
    if (!orderId) return

    const now = Date.now()

    u('main.orders', (orders: any = {}) => {
      const existingOrder = orders[orderId]
      if (!existingOrder) return orders

      const source =
        update.source ?? update.provider ?? existingOrder.source ?? existingOrder.provider ?? 'flash'
      const provider =
        update.provider ?? update.source ?? existingOrder.provider ?? existingOrder.source ?? source

      return {
        ...orders,
        [orderId]: {
          ...existingOrder,
          ...update,
          orderId,
          provider,
          source,
          updatedAt: update.updatedAt ?? now
        }
      }
    })
  },
  setAccount: (u: U, account: any) => {
    u('selected.current', () => account.id)
    u('main.currentAccount', () => account.id)
    u('selected.minimized', () => false)
    u('selected.open', () => true)
  },
  setAccountSignerStatusOpen: (u: U, value: any) => {
    u('selected.signerStatusOpen', () => Boolean(value))
  },
  accountTokensUpdated: (u: U, address: string) => {
    u('main.accounts', address, (account: any) => {
      const balances = { ...account.balances, lastUpdated: new Date().getTime() }
      const updated = { ...account, balances }

      return updated
    })
  },
  updateAccount: (u: U, updatedAccount: any) => {
    const { id, name } = updatedAccount
    u('main.accounts', id, (account: any = {}) => {
      return { ...updatedAccount, balances: account.balances || {} }
    })
    u('main.accountOrder', (accountOrder: string[] = []) => {
      return accountOrder.includes(id) ? accountOrder : [...accountOrder, id]
    })
    if (name && !isDefaultAccountName({ ...updatedAccount, name })) {
      const accountMetaId = uuidv5(id, accountNS)
      u('main.accountsMeta', accountMetaId, (accountMeta: any) => {
        return { ...accountMeta, name, lastUpdated: Date.now() }
      })
    }
  },
  removeAccount: (u: U, id: string) => {
    u('main.accounts', (accounts: any) => {
      delete accounts[id]
      return accounts
    })
    u('main.currentAccount', (currentAccount: string) => (currentAccount === id ? '' : currentAccount))
    u('main.accountOrder', (accountOrder: string[] = []) =>
      accountOrder.filter((accountId) => accountId !== id)
    )
  },
  reorderAccounts: (u: U, fromId: string, toId: string) => {
    if (!fromId || !toId || fromId === toId) return
    u('main', (main: any) => {
      const accounts = main.accounts || {}
      const ordered = [...(main.accountOrder || []).filter((id: string) => accounts[id])]

      Object.keys(accounts).forEach((id) => {
        if (!ordered.includes(id)) ordered.push(id)
      })

      const fromIndex = ordered.indexOf(fromId)
      const toIndex = ordered.indexOf(toId)

      if (fromIndex === -1 || toIndex === -1) return main

      const [moved] = ordered.splice(fromIndex, 1)
      ordered.splice(toIndex, 0, moved)

      main.accountOrder = ordered
      return main
    })
  },
  removeSigner: (u: U, id: string) => {
    u('main.signers', (signers: any) => {
      delete signers[id]
      return signers
    })
  },
  updateSigner: (u: U, signer: any) => {
    if (!signer.id) return
    u('main.signers', signer.id, (prev: any) => ({ ...prev, ...signer }))
  },
  newSigner: (u: U, signer: any) => {
    u('main.signers', (signers: any) => {
      signers[signer.id] = { ...signer, createdAt: new Date().getTime() }
      return signers
    })
  },
  setLatticeConfig: (u: U, id: string, key: string, value: any) => {
    u('main.lattice', id, key, () => value)
  },
  updateLattice: (u: U, deviceId: string, update: any) => {
    if (deviceId && update) u('main.lattice', deviceId, (current: any = {}) => Object.assign(current, update))
  },
  removeLattice: (u: U, deviceId: string) => {
    if (deviceId) {
      u('main.lattice', (lattice: any = {}) => {
        delete lattice[deviceId]
        return lattice
      })
    }
  },
  setLatticeAccountLimit: (u: U, limit: number) => {
    u('main.latticeSettings.accountLimit', () => limit)
  },
  setLatticeEndpointMode: (u: U, mode: string) => {
    u('main.latticeSettings.endpointMode', () => mode)
  },
  setLatticeEndpointCustom: (u: U, url: string) => {
    u('main.latticeSettings.endpointCustom', () => url)
  },
  setLatticeDerivation: (u: U, value: any) => {
    u('main.latticeSettings.derivation', () => value)
  },
  setLedgerDerivation: (u: U, value: any) => {
    u('main.ledger.derivation', () => value)
  },
  setTrezorDerivation: (u: U, value: any) => {
    u('main.trezor.derivation', () => value)
  },
  setLiveAccountLimit: (u: U, value: any) => {
    u('main.ledger.liveAccountLimit', () => value)
  },
  setMenubarGasPrice: (u: U, value: any) => {
    u('main.menubarGasPrice', () => value)
  },
  setBiometricUnlock: (u: U, value: any) => {
    u('main.biometricUnlock', () => Boolean(value))
  },
  muteAlphaWarning: (u: U) => {
    u('main.mute.alphaWarning', () => true)
  },
  muteWelcomeWarning: (u: U) => {
    u('main.mute.welcomeWarning', () => true)
  },
  toggleExplorerWarning: (u: U) => {
    u('main.mute.explorerWarning', (v: boolean) => !v)
  },
  toggleGasFeeWarning: (u: U) => {
    u('main.mute.gasFeeWarning', (v: boolean) => !v)
  },
  toggleSignerCompatibilityWarning: (u: U) => {
    u('main.mute.signerCompatibilityWarning', (v: boolean) => !v)
  },
  setShortcut: (u: U, name: string, shortcut: any) => {
    u('main.shortcuts', name, (existingShortcut: any = {}) => ({
      modifierKeys: shortcut.modifierKeys || existingShortcut.modifierKeys,
      shortcutKey: shortcut.shortcutKey || existingShortcut.shortcutKey,
      configuring: shortcut.configuring ?? existingShortcut.configuring,
      enabled: shortcut.enabled ?? existingShortcut.enabled
    }))
  },
  setKeyboardLayout: (u: U, layout: any) => {
    u('keyboardLayout', (existingLayout: any = {}) => ({
      isUS: layout.isUS ?? existingLayout.isUS
    }))
  },
  setAutohide: (u: U, v: boolean) => {
    u('main.autohide', () => v)
  },
  setGasFees: (u: U, netType: string, netId: number, fees: any) => {
    u('main.networksMeta', netType, netId, 'gas.price.fees', () => fees)
  },
  setGasPrices: (u: U, netType: string, netId: number, prices: any) => {
    u('main.networksMeta', netType, netId, 'gas.price.levels', () => prices)
  },
  setGasDefault: (u: U, netType: string, netId: number, level: string, price?: any) => {
    u('main.networksMeta', netType, netId, 'gas.price.selected', () => level)
    if (level === 'custom') {
      u('main.networksMeta', netType, netId, 'gas.price.levels.custom', () => price)
    } else {
      u('main.networksMeta', netType, netId, 'gas.price.lastLevel', () => level)
    }
  },
  setNativeCurrencyData: (u: U, netType: string, netId: number, currency: any) => {
    u('main.networksMeta', netType, netId, 'nativeCurrency', (existing: any) => ({
      ...existing,
      ...currency
    }))
  },
  addNetwork: (u: U, net: any) => {
    try {
      net.id = validateNetworkSettings(net)

      const primaryRpc = net.primaryRpc || ''
      const secondaryRpc = net.secondaryRpc || ''
      delete net.primaryRpc
      delete net.secondaryRpc

      const defaultNetwork = {
        id: 0,
        isTestnet: false,
        type: '',
        name: '',
        explorer: '',
        gas: {
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        connection: {
          presets: { local: 'direct' },
          primary: {
            on: true,
            current: 'custom',
            status: 'loading',
            connected: false,
            type: '',
            network: '',
            custom: primaryRpc
          },
          secondary: {
            on: false,
            current: 'custom',
            status: 'loading',
            connected: false,
            type: '',
            network: '',
            custom: secondaryRpc
          }
        },
        on: true
      }

      const defaultMeta = {
        blockHeight: 0,
        name: net.name,
        primaryColor: net.primaryColor,
        icon: net.icon || '',
        nativeCurrency: {
          symbol: net.symbol,
          icon: net.nativeCurrencyIcon || '',
          name: net.nativeCurrencyName || '',
          decimals: 18
        },
        gas: {
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        }
      }

      u('main', (main: any) => {
        if (!main.networks[net.type]) main.networks[net.type] = {}
        if (main.networks[net.type][net.id]) return main // Network already exists, don't overwrite, notify user

        main.networks[net.type][net.id] = { ...defaultNetwork, ...net }
        main.networksMeta[net.type][net.id] = { ...defaultMeta }

        return main
      })
    } catch (e) {
      log.error(e)
    }
  },

  updateNetwork: (u: U, net: any, newNet: any) => {
    try {
      net.id = validateNetworkSettings(net)
      newNet.id = validateNetworkSettings(newNet)

      u('main', (main: any) => {
        const update = Object.assign({}, main.networks[net.type][net.id], newNet)

        Object.keys(update).forEach((k) => {
          if (typeof update[k] === 'string') {
            update[k] = update[k].trim()
          }
        })

        const { nativeCurrencyName, nativeCurrencyIcon, icon, ...updatedNetwork } = update

        delete main.networks[net.type][net.id]
        main.networks[updatedNetwork.type][updatedNetwork.id] = updatedNetwork

        Object.entries(main.origins as Record<string, any>).forEach(([origin, { chain }]) => {
          if (net.id === chain.id) {
            main.origins[origin].chain = updatedNetwork
          }
        })

        const existingNetworkMeta = main.networksMeta[updatedNetwork.type][updatedNetwork.id] || {}
        const networkCurrency = existingNetworkMeta.nativeCurrency || {}

        main.networksMeta[updatedNetwork.type][updatedNetwork.id] = {
          ...existingNetworkMeta,
          symbol: update.symbol,
          icon,
          nativeCurrency: {
            ...networkCurrency,
            symbol: update.symbol,
            name: nativeCurrencyName,
            icon: nativeCurrencyIcon
          }
        }

        return main
      })
    } catch (e) {
      log.error(e)
    }
  },
  removeNetwork: (u: U, net: any) => {
    try {
      net.id = parseInt(net.id)

      // Cannot delete mainnet
      if (!Number.isInteger(net.id)) throw new Error('Invalid chain id')
      if (net.type === 'ethereum' && net.id === 1) throw new Error('Cannot remove mainnet')
      u('main', (main: any) => {
        if (Object.keys(main.networks[net.type]).length <= 1) {
          return main // Cannot delete last network without adding a new network of this type first
        }

        // If deleting a network that an origin is currently using, switch them to mainnet
        switchChainForOrigins(main.origins, net.id, 1)

        if (main.networks[net.type]) {
          delete main.networks[net.type][net.id]
          delete main.networksMeta[net.type][net.id]
        }

        return main
      })
    } catch (e) {
      log.error(e)
    }
  },
  setDappStorage: (u: U, hash: string, state: any) => {
    if (state) u(`main.dapp.storage.${hash}`, () => state)
  },
  initOrigin: (u: U, originId: string, origin: any) => {
    u('main.origins', (origins: any) => {
      const now = new Date().getTime()

      const createdOrigin = {
        ...origin,
        session: {
          requests: 1,
          startedAt: now,
          lastUpdatedAt: now
        }
      }

      return { ...origins, [originId]: createdOrigin }
    })
  },
  addOriginRequest: (u: U, originId: string) => {
    const now = new Date().getTime()

    u('main.origins', originId, (origin: any) => {
      // start a new session if the previous one has already ended
      const isNewSession = origin.session.startedAt < origin.session.endedAt
      const startedAt = isNewSession ? now : origin.session.startedAt
      const requests = isNewSession ? 1 : origin.session.requests + 1

      return {
        ...origin,
        session: {
          requests,
          startedAt,
          endedAt: undefined,
          lastUpdatedAt: now
        }
      }
    })
  },
  endOriginSession: (u: U, originId: string) => {
    u('main.origins', (origins: any) => {
      const origin = origins[originId]
      if (origin) {
        const now = new Date().getTime()
        const session = Object.assign({}, origin.session, { endedAt: now, lastUpdatedAt: now })
        origins[originId] = Object.assign({}, origin, { session })
      }
      return origins
    })
  },
  switchOriginChain: (u: U, originId: string, chainId: number, type: string) => {
    if (originId && typeof chainId === 'number' && type === 'ethereum') {
      u('main.origins', originId, (origin: any) => ({ ...origin, chain: { id: chainId, type } }))
    }
  },
  clearOrigins: (u: U) => {
    u('main.origins', () => ({}))
    u('main.permissions', () => ({}))
  },
  removeOrigin: (u: U, originId: string) => {
    u('windows.dash.nav', () => []) // Reset nav
    u('main.origins', (origins: any) => {
      delete origins[originId]
      return origins
    })
    u('main.permissions', (permissions: any = {}) => {
      return Object.fromEntries(
        Object.entries(permissions).map(([address, accountPermissions]: [string, any]) => {
          const nextAccountPermissions = { ...accountPermissions }
          Object.entries(nextAccountPermissions).forEach(([permissionId, permission]: [string, any]) => {
            if (permissionId === originId || permission.handlerId === originId) {
              delete nextAccountPermissions[permissionId]
            }
          })

          return [address, nextAccountPermissions]
        })
      )
    })
  },
  trustExtension: (u: U, extensionId: string, trusted: boolean) => {
    u('main.knownExtensions', (extensions: any = {}) => ({ ...extensions, [extensionId]: trusted }))
  },
  setBlockHeight: (u: U, chainId: number, blockHeight: number) => {
    u('main.networksMeta.ethereum', (chainsMeta: any) => {
      if (chainsMeta[chainId]) {
        chainsMeta[chainId] = { ...chainsMeta[chainId], blockHeight }
      } else {
        log.error(`Action Error: setBlockHeight chainId: ${chainId} not found in chainsMeta`)
      }
      return chainsMeta
    })
  },
  setChainColor: (u: U, chainId: number, color: string) => {
    u('main.networksMeta.ethereum', (chainsMeta: any) => {
      if (chainsMeta[chainId]) {
        chainsMeta[chainId] = { ...chainsMeta[chainId], primaryColor: color }
      } else {
        log.error(`Action Error: setChainColor chainId: ${chainId} not found in chainsMeta`)
      }
      return chainsMeta
    })
  },
  setNetworkIcon: (u: U, netType: string, chainId: number, icon: string) => {
    u('main.networksMeta', netType, (chainsMeta: any) => {
      if (chainsMeta[chainId]) {
        chainsMeta[chainId] = { ...chainsMeta[chainId], icon }
      } else {
        log.error(`Action Error: setNetworkIcon chainId: ${chainId} not found in chainsMeta`)
      }
      return chainsMeta
    })
  },
  expandDock: (u: U, expand: boolean) => {
    u('dock.expand', () => expand)
  },
  pin: (u: U) => {
    u('main.pin', (pin: boolean) => !pin)
  },
  saveAccount: (u: U, id: string) => {
    u('main.save.account', () => id)
  },
  setRates: (u: U, rates: any) => {
    u('main.rates', (existingRates: any = {}) => ({ ...existingRates, ...rates }))
  },
  setBalance: (u: U, address: string, balance: any) => {
    u('main.balances', address, (balances: any[] = []) => {
      const existingBalances = balances.filter(
        (b) => b.address !== balance.address || b.chainId !== balance.chainId
      )

      return [...existingBalances, balance]
    })
  },
  // Tokens
  setBalances: (u: U, address: string, newBalances: any[]) => {
    u('main.balances', address, (balances: any[] = []) => {
      const existingBalances = balances.filter((b) => {
        return newBalances.every((bal) => bal.chainId !== b.chainId || bal.address !== b.address)
      })

      // TODO: possibly add an option to filter out zero balances
      //const withoutZeroBalances = Object.entries(updatedBalances)
      //.filter(([address, balanceObj]) => BigInt(balanceObj.balance) !== 0n)
      return [...existingBalances, ...newBalances]
    })
  },
  setPortfolioBalances: (u: U, address: string, newBalances: any[]) => {
    u('main', (main: any) => {
      const customTokenIds = new Set(((main.tokens?.custom || []) as any[]).map(toTokenId))
      const portfolioBalances = newBalances.filter((balance: any) => !customTokenIds.has(toTokenId(balance)))
      const portfolioChains = new Set(portfolioBalances.map((balance: any) => balance.chainId))
      const portfolioBalanceIds = new Set(portfolioBalances.map(toTokenId))
      const existingBalances = ((main.balances && main.balances[address]) || []) as any[]
      const preservedBalances = existingBalances.filter((balance) => {
        const balanceId = toTokenId(balance)

        if (customTokenIds.has(balanceId)) return true
        if (portfolioBalanceIds.has(balanceId)) return false
        if (balance.address === NATIVE_CURRENCY) return true

        return !portfolioChains.has(balance.chainId)
      })

      main.balances = main.balances || {}
      main.balances[address] = [...preservedBalances, ...portfolioBalances]

      return main
    })
  },
  removeBalance: (u: U, chainId: number, address: string) => {
    u('main.balances', (balances: any = {}) => {
      const key = address.toLowerCase()

      for (const accountAddress in balances) {
        const balanceIndex = balances[accountAddress].findIndex(
          (balance: any) => balance.chainId === chainId && balance.address.toLowerCase() === key
        )

        if (balanceIndex > -1) {
          balances[accountAddress].splice(balanceIndex, 1)
        }
      }

      return balances
    })
  },
  removeBalances: (u: U, address: string, tokensToRemove: Set<string>) => {
    const needsRemoval = (balance: any) => tokensToRemove.has(toTokenId(balance))
    u('main.balances', address, (balances: any[] = []) =>
      balances.filter((balance) => !needsRemoval(balance))
    )
  },
  setScanning: (u: U, address: string, scanning: boolean) => {
    if (scanning) {
      u('main.scanning', address, () => true)
    } else {
      setTimeout(() => {
        u('main.scanning', address, () => false)
      }, 1000)
    }
  },
  omitToken: (u: U, address: string, omitToken: any) => {
    u('main.accounts', address, 'tokens.omit', (omit: any[]) => {
      omit = omit || []
      if (omit.indexOf(omitToken) === -1) omit.push(omitToken)
      return omit
    })
  },
  addCustomTokens: (u: U, tokens: any[]) => {
    u('main.tokens.custom', (existing: any[]) => {
      // remove any tokens that have been overwritten by one with
      // the same address and chain ID
      const existingTokens = existing.filter((token) => !includesToken(tokens, token))
      const tokensToAdd = tokens.map((t) => ({ ...t, address: t.address.toLowerCase() }))

      return [...existingTokens, ...tokensToAdd]
    })

    u('main.balances', (balances: any) => {
      // update the balances for any custom tokens that changed
      Object.values(balances as Record<string, any[]>).forEach((accountBalances) => {
        tokens.forEach((token) => {
          const tokenAddress = token.address.toLowerCase()
          const matchingBalance = accountBalances.find(
            (b) => b.address.toLowerCase() === tokenAddress && b.chainId === token.chainId
          )

          if (matchingBalance) {
            matchingBalance.logoURI = token.logoURI || matchingBalance.logoURI
            matchingBalance.symbol = token.symbol || matchingBalance.symbol
            matchingBalance.name = token.name || matchingBalance.symbol
          }
        })
      })

      return balances
    })
  },
  removeCustomTokens: (u: U, tokens: any[]) => {
    const tokenIds = new Set(tokens.map(toTokenId))
    const needsRemoval = (token: any) => tokenIds.has(toTokenId(token))

    u('main.tokens.custom', (existing: any[]) => {
      return existing.filter((token) => !needsRemoval(token))
    })

    u('main.tokens.known', (knownTokens: any) => {
      for (const address in knownTokens) {
        knownTokens[address] = knownTokens[address].filter((token: any) => !needsRemoval(token))
      }

      return knownTokens
    })
  },
  addKnownTokens: (u: U, address: string, tokens: any[]) => {
    u('main.tokens.known', address, (existing: any[] = []) => {
      const existingTokens = existing.filter((token) => !includesToken(tokens, token))
      const tokensToAdd = tokens.map((t) => ({ ...t, address: t.address.toLowerCase() }))

      return [...existingTokens, ...tokensToAdd]
    })
  },
  removeKnownTokens: (u: U, address: string, tokensToRemove: Set<string>) => {
    const needsRemoval = (token: any) => tokensToRemove.has(toTokenId(token))
    u('main.tokens.known', address, (existing: any[] = []) =>
      existing.filter((token) => !needsRemoval(token))
    )
  },
  clearSavedTokens: (u: U) => {
    u('main', (main: any) => {
      const knownTokens = main.tokens?.known || {}
      const customTokenIds = new Set(((main.tokens?.custom || []) as any[]).map(toTokenId))
      const tokenIds = new Set(
        Object.values(knownTokens as Record<string, any[]>)
          .flat()
          .filter((token) => !customTokenIds.has(toTokenId(token)))
          .map(toTokenId)
      )

      main.tokens.known = {}
      main.activity = {}

      if (tokenIds.size > 0) {
        Object.entries((main.balances || {}) as Record<string, any[]>).forEach(([address, balances]) => {
          main.balances[address] = balances.filter((balance: any) => !tokenIds.has(toTokenId(balance)))
        })
      }

      return main
    })
  },
  setColorway: (u: U, colorway: string) => {
    u('main.colorway', () => {
      return colorway
    })
  },
  // Dashboard
  toggleDash: (u: U, force?: string) => {
    u('windows.dash.showing', (s: boolean) => (force === 'hide' ? false : force === 'show' ? true : !s))
  },
  closeDash: (u: U) => {
    u('windows.dash.showing', () => false)
    u('windows.dash.nav', () => []) // Reset nav
  },
  setDash: (u: U, update: any) => {
    if (!update.showing) {
      u('windows.dash.nav', () => []) // Reset nav
    }
    u('windows.dash', (dash: any) => Object.assign(dash, update))
  },
  navHome: (u: U, command: any) => {
    u('tray.homeCommand', () => toHomeCommand(command))
    u('windows.panel.nav', () => [])
    u('windows.dash.showing', () => false)
    u('windows.dash.nav', () => [])
  },
  clearHomeCommand: (u: U, id?: number) => {
    u('tray.homeCommand', (command: any) => {
      if (!id || command?.id === id) return null
      return command
    })
  },
  navForward: (u: U, windowId: string, crumb: any) => {
    if (!windowId || !crumb) return log.warn('Invalid nav forward', windowId, crumb)
    u('windows', windowId, 'nav', (nav: any[]) => {
      if (JSON.stringify(nav[0]) !== JSON.stringify(crumb)) nav.unshift(crumb)
      return nav
    })
    u('windows', windowId, 'showing', () => true)
  },
  navUpdate: (u: U, windowId: string, crumb: any, navigate: boolean) => {
    if (!windowId || !crumb) return log.warn('Invalid nav forward', windowId, crumb)
    u('windows', windowId, 'nav', (nav: any[]) => {
      const updatedNavItem = {
        view: nav[0].view || crumb.view,
        data: Object.keys(crumb.data).length === 0 ? {} : Object.assign({}, nav[0].data, crumb.data)
      }
      if (JSON.stringify(nav[0]) !== JSON.stringify(updatedNavItem)) {
        if (navigate) {
          nav.unshift(updatedNavItem)
        } else {
          nav[0] = updatedNavItem
        }
      }
      return nav
    })
    if (navigate) u('windows', windowId, 'showing', () => true)
  },
  navReplace: (u: U, windowId: string, crumbs: any[] = []) => {
    u('windows', windowId, (win: any) => {
      win.nav = crumbs
      win.showing = true
      return win
    })
  },
  navClearSigner: (u: U, signerId: string) => {
    u('windows.dash.nav', (nav: any[]) => nav.filter((navItem) => navItem?.data?.signer !== signerId))
  },
  navClearReq: (u: U, handlerId: string, showRequestInbox = true) => {
    u('windows.panel.nav', (nav: any[]) => {
      const newNav = nav.filter((navItem) => {
        // remove the filtered request
        const isClearedRequest = navItem?.data?.requestId === handlerId

        // remove the request inbox from the nav if not requested
        const isRequestInbox = navItem?.data?.id === 'requests' && navItem?.view === 'expandedModule'

        return !isClearedRequest && (showRequestInbox || !isRequestInbox)
      })

      return newNav
    })
  },
  navBack: (u: U, windowId: string, numSteps = 1) => {
    if (!windowId) return log.warn('Invalid nav back', windowId)
    u('windows', windowId, 'nav', (nav: any[]) => {
      while (numSteps > 0 && nav.length > 0) {
        nav.shift()
        numSteps -= 1
      }
      return nav
    })
  },
  navDash: (u: U, navItem: any) => {
    if (homeDashViews.has(navItem?.view)) {
      u('tray.homeCommand', () => toHomeCommand(navItem))
      u('windows.panel.nav', () => [])
      u('windows.dash.showing', () => false)
      u('windows.dash.nav', () => [])
      return
    }

    u('windows.dash.nav', (nav: any[]) => {
      if (JSON.stringify(nav[0]) !== JSON.stringify(navItem)) nav.unshift(navItem)
      return nav
    })
    u('windows.dash.showing', () => true)
  },
  backDash: (u: U, numSteps = 1) => {
    u('windows.dash.nav', (nav: any[]) => {
      while (numSteps > 0 && nav.length > 0) {
        nav.shift()
        numSteps -= 1
      }
      return nav
    })
  },
  muteBetaDisclosure: (u: U) => {
    u('main.mute.betaDisclosure', () => true)
    u('tray.homeCommand', () => toHomeCommand({ view: 'accounts', data: {} }))
    u('windows.panel.nav', () => [])
  },
  completeOnboarding: (u: U) => {
    u('main.mute.onboardingWindow', () => true)
  },
  addFrame: (u: U, frame: any) => {
    u('main.frames', frame.id, () => frame)
  },
  setFramePanel: (u: U, frame: any) => {
    u('main.frames', () => ({ [frame.id]: frame }))
    u('main.focusedFrame', () => frame.id)
  },
  updateFrame: (u: U, frameId: string, update: any) => {
    u('main.frames', frameId, (frame: any) => Object.assign({}, frame, update))
  },
  removeFrame: (u: U, frameId: string) => {
    u('main.frames', (frames: any) => {
      delete frames[frameId]
      return frames
    })
  },
  focusFrame: (u: U, frameId: string) => {
    u('main.focusedFrame', () => frameId)
  },
  unsetAccount: (u: U) => {
    u('main.currentAccount', () => '')
    u('selected.open', () => false)
    u('selected.minimized', () => true)
    u('selected.view', () => 'default')
    u('selected.showAccounts', () => false)
    u('windows.panel.nav', () => [])
    setTimeout(() => {
      u('selected', (signer: any) => {
        signer.last = signer.current
        signer.current = ''
        signer.requests = {}
        signer.view = 'default'
        return signer
      })
    }, 320)
  },
  setAccountFilter: (u: U, value: any) => {
    u('panel.accountFilter', () => value)
  },
  setFooterHeight: (u: U, win: string, height: number) => {
    u('windows', win, 'footer.height', () => (height < 40 ? 40 : height))
  },
  updateTypedDataRequest: (u: U, account: string, reqId: string, data: any) => {
    u('main.accounts', account, 'requests', (requests: any) => {
      if (!requests[reqId]?.typedMessage?.data) {
        log.error('No typed data request found for ', { reqId })
        return requests
      }

      Object.assign(requests[reqId], data)

      return requests
    })
  }
  // toggleUSDValue: (u) => {
  //   u('main.showUSDValue', show => !show)
  // }
  // __overwrite: (path, value) => u(path, () => value)
}

export const addNetwork = actions.addNetwork
export const removeBalance = actions.removeBalance
export const setBalances = actions.setBalances
export const setPortfolioBalances = actions.setPortfolioBalances
export const removeBalances = actions.removeBalances
export const addCustomTokens = actions.addCustomTokens
export const removeCustomTokens = actions.removeCustomTokens
export const addKnownTokens = actions.addKnownTokens
export const removeKnownTokens = actions.removeKnownTokens
export const clearSavedTokens = actions.clearSavedTokens
export const setScanning = actions.setScanning
export const initOrigin = actions.initOrigin
export const clearOrigins = actions.clearOrigins
export const removeOrigin = actions.removeOrigin
export const addOriginRequest = actions.addOriginRequest
export const switchOriginChain = actions.switchOriginChain
export const removeNetwork = actions.removeNetwork
export const updateNetwork = actions.updateNetwork
export const activateNetwork = actions.activateNetwork
export const setBlockHeight = actions.setBlockHeight
export const setNetworkIcon = actions.setNetworkIcon
export const updateAccount = actions.updateAccount
export const setAutoDiscoverTokens = actions.setAutoDiscoverTokens
export const setPortfolioApiKey = actions.setPortfolioApiKey
export const revokePermission = actions.revokePermission
export const navClearReq = actions.navClearReq
export const navClearSigner = actions.navClearSigner
export const updateTypedDataRequest = actions.updateTypedDataRequest
export const upsertSubmittedActivity = actions.upsertSubmittedActivity
export const updateActivity = actions.updateActivity
export const finalizeActivity = actions.finalizeActivity
export const pruneActivity = actions.pruneActivity
export const upsertOrder = actions.upsertOrder
export const updateOrder = actions.updateOrder

export default actions
