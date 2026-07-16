import log from 'electron-log'
import type { Draft } from 'immer'
import { v5 as uuidv5 } from 'uuid'

import { NATIVE_CURRENCY } from '../../../resources/constants'
import { accountNS, isDefaultAccountName } from '../../../resources/domain/account'
import { toTokenId } from '../../../resources/domain/balance'
import {
  createPanelActions,
  type CanonicalGet,
  type CanonicalSet
} from '../../../resources/store/actions.panel'
import type { CanonicalState } from '../state'
import type { Account } from '../state/types/account'
import type { CanonicalAccountRequest } from '../../accounts/types'
import type { SignerSummary } from '../../signers/Signer'

type MutableRecord = Record<string, any>
type AccountPatch = Partial<Omit<Account, 'id' | 'address' | 'requests'>>
type AccountUpsert = Partial<Omit<Account, 'id' | 'requests'>> &
  Pick<Account, 'id'> & { requests?: Record<string, CanonicalAccountRequest> }
type MutableMain = Draft<CanonicalState['main']> & MutableRecord
type MutableCanonicalState = Draft<CanonicalState> & MutableRecord

const supportedNetworkTypes = ['ethereum']
const completedActivityStatuses = new Set(['succeeded', 'reverted'])
let homeCommandId = 0

const mutable = (state: Draft<CanonicalState>) => state as MutableCanonicalState
const mutableMain = (state: Draft<CanonicalState>) => state.main as MutableMain
const record = (value: unknown) => value as MutableRecord
const windowState = (state: Draft<CanonicalState>, windowId: string) =>
  record(record(state.windows)[windowId])

function toHomeCommand(command: any) {
  const view = command?.view === 'chains' ? 'networks' : command?.view

  return {
    id: ++homeCommandId,
    view,
    data: command?.data || {}
  }
}

function switchChainForOrigins(origins: MutableRecord, oldChainId: number, newChainId: number) {
  Object.entries(origins).forEach(([originId, value]) => {
    const origin = record(value)
    if (oldChainId === record(origin.chain).id) {
      origins[originId].chain = { id: newChainId, type: 'ethereum' }
    }
  })
}

function validateNetworkSettings(network: any) {
  const networkId = parseInt(network.id)
  const validHttpUrl = (value: unknown, optional = false) => {
    if (optional && !value) return true
    try {
      const parsed = new URL(String(value))
      return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password
    } catch {
      return false
    }
  }

  if (
    !Number.isInteger(networkId) ||
    typeof network.type !== 'string' ||
    typeof network.name !== 'string' ||
    typeof network.explorer !== 'string' ||
    typeof network.symbol !== 'string' ||
    !validHttpUrl(network.primaryRpc, true) ||
    !validHttpUrl(network.secondaryRpc, true) ||
    !validHttpUrl(network.explorer, true) ||
    !supportedNetworkTypes.includes(network.type)
  ) {
    throw new Error(`Invalid network settings: ${JSON.stringify(network)}`)
  }

  return networkId
}

function includesToken(tokens: any[], token: any) {
  const existingAddress = token.address.toLowerCase()
  return tokens.some((item) => {
    return item.address.toLowerCase() === existingAddress && item.chainId === token.chainId
  })
}

function stripRequestCapabilities(request: MutableRecord) {
  delete request.res
  ;(request.recognizedActions || []).forEach((action: MutableRecord) => delete action.update)
}

export function createCanonicalActions(set: CanonicalSet, get: CanonicalGet) {
  return {
    ...createPanelActions(set, get),

    activateNetwork: (type: string, chainId: number, active: boolean) => {
      set((draft) => {
        const main = mutableMain(draft)
        record(record(main.networks)[type])[chainId].on = active

        if (!active) {
          switchChainForOrigins(record(main.origins), chainId, 1)
        }
      })
    },

    selectPrimary: (netType: string, netId: number, value: any) => {
      set((draft) => {
        record(record(record(mutableMain(draft).networks)[netType])[netId].connection).primary.current = value
      })
    },

    setPrimaryCustom: (netType: string, netId: number, target: any) => {
      if (!netType || !netId) return
      set((draft) => {
        record(record(record(mutableMain(draft).networks)[netType])[netId].connection).primary.custom = target
      })
    },

    setSecondaryCustom: (netType: string, netId: number, target: any) => {
      if (!netType || !netId) return
      set((draft) => {
        record(record(record(mutableMain(draft).networks)[netType])[netId].connection).secondary.custom =
          target
      })
    },

    toggleConnection: (netType: string, netId: number, node: string, on?: boolean) => {
      set((draft) => {
        const connection = record(record(record(mutableMain(draft).networks)[netType])[netId].connection)
        const target = record(connection[node])
        target.on = on !== undefined ? on : !target.on
      })
    },

    setPrimary: (netType: string, netId: number, status: any) => {
      set((draft) => {
        const connection = record(record(record(mutableMain(draft).networks)[netType])[netId].connection)
        connection.primary = { ...record(connection.primary), ...status }
      })
    },

    setSecondary: (netType: string, netId: number, status: any) => {
      set((draft) => {
        const connection = record(record(record(mutableMain(draft).networks)[netType])[netId].connection)
        connection.secondary = { ...record(connection.secondary), ...status }
      })
    },

    toggleLaunch: () => {
      set((draft) => {
        const main = mutableMain(draft)
        main.launch = !main.launch
      })
    },

    toggleReveal: () => {
      set((draft) => {
        const main = mutableMain(draft)
        main.reveal = !main.reveal
      })
    },

    toggleShowLocalNameWithENS: () => {
      set((draft) => {
        const main = mutableMain(draft)
        main.showLocalNameWithENS = !main.showLocalNameWithENS
      })
    },

    setAutoDiscoverTokens: (value: boolean) => {
      set((draft) => {
        const main = mutableMain(draft)
        main.autoDiscoverTokens =
          Boolean(value) && typeof main.portfolioApiKey === 'string' && main.portfolioApiKey.trim().length > 0
      })
    },

    setPortfolioApiKey: (value: string) => {
      const apiKey = typeof value === 'string' ? value.replace(/\s+/g, '') : ''

      set((draft) => {
        const main = mutableMain(draft)
        main.portfolioApiKey = apiKey
        if (!apiKey) main.autoDiscoverTokens = false
      })
    },

    setShowTestnets: (value: boolean) => {
      set((draft) => {
        mutableMain(draft).showTestnets = Boolean(value)
      })
    },

    setPermission: (address: string, permission: any) => {
      set((draft) => {
        const permissions = record(mutableMain(draft).permissions)
        const accountPermissions = record(permissions[address] || {})
        permissions[address] = accountPermissions

        if (permission.provider) {
          accountPermissions[permission.handlerId] = permission
        } else {
          delete accountPermissions[permission.handlerId]
        }
      })
    },

    revokePermission: (address: string, handlerId: string) => {
      if (!address || !handlerId) return

      set((draft) => {
        const accountPermissions = record(record(mutableMain(draft).permissions)[address] || {})
        delete accountPermissions[handlerId]
      })
    },

    clearPermissions: (address: string) => {
      set((draft) => {
        record(mutableMain(draft).permissions)[address] = {}
      })
    },

    dontRemind: (version: string) => {
      set((draft) => {
        const dontRemind = mutableMain(draft).updater.dontRemind
        if (!dontRemind.includes(version)) dontRemind.push(version)
      })
    },

    setUpdaterLastChecked: (lastChecked: number) => {
      set((draft) => {
        mutableMain(draft).updater.lastChecked = lastChecked
      })
    },

    upsertSubmittedActivity: (activity: any) => {
      const id = activity?.id
      if (!id) return
      const now = Date.now()

      set((draft) => {
        const activities = record(mutableMain(draft).activity)
        const existingActivity = record(activities[id] || {})
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
        activities[id] = submittedActivity
      })
    },

    updateActivity: (id: string, update: any = {}) => {
      if (!id) return
      const now = Date.now()

      set((draft) => {
        const activities = record(mutableMain(draft).activity)
        const activity = record(activities[id] || { id })
        activities[id] = {
          ...activity,
          ...update,
          id,
          status: update.status ?? activity.status ?? 'confirming',
          updatedAt: update.updatedAt ?? now
        }
      })
    },

    finalizeActivity: (id: string, status: string, update: any = {}) => {
      if (!id) return
      if (!completedActivityStatuses.has(status)) {
        log.warn(`Invalid finalized activity status: ${status}`)
        return
      }

      const completedAt = update.completedAt ?? Date.now()

      set((draft) => {
        const activities = record(mutableMain(draft).activity)
        const activity = record(activities[id] || { id })
        activities[id] = {
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

    pruneActivity: (id: string) => {
      if (!id) return
      set((draft) => {
        delete record(mutableMain(draft).activity)[id]
      })
    },

    upsertOrder: (order: any) => {
      const orderId = order?.orderId
      if (!orderId) return
      const now = Date.now()

      set((draft) => {
        const orders = record(mutableMain(draft).orders)
        const existingOrder = record(orders[orderId] || {})
        const source =
          order.source ?? order.provider ?? existingOrder.source ?? existingOrder.provider ?? 'flash'
        const provider =
          order.provider ?? order.source ?? existingOrder.provider ?? existingOrder.source ?? source

        orders[orderId] = {
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

    updateOrder: (orderId: string, update: any = {}) => {
      if (!orderId) return
      const now = Date.now()

      set((draft) => {
        const orders = record(mutableMain(draft).orders)
        const existingOrder = orders[orderId]
        if (!existingOrder) return

        const existing = record(existingOrder)
        const source = update.source ?? update.provider ?? existing.source ?? existing.provider ?? 'flash'
        const provider = update.provider ?? update.source ?? existing.provider ?? existing.source ?? source

        orders[orderId] = {
          ...existing,
          ...update,
          orderId,
          provider,
          source,
          updatedAt: update.updatedAt ?? now
        }
      })
    },

    setAccount: (account: any) => {
      set((draft) => {
        const state = mutable(draft)
        mutableMain(draft).currentAccount = account.id
        state.selected.minimized = false
        state.selected.open = true
      })
    },

    accountTokensUpdated: (address: string) => {
      set((draft) => {
        const account = record(record(mutableMain(draft).accounts)[address])
        account.balances = { ...record(account.balances), lastUpdated: Date.now() }
      })
    },

    upsertAccount: (updatedAccount: AccountUpsert) => {
      const { id, name } = updatedAccount

      set((draft) => {
        const main = mutableMain(draft)
        const accounts = record(main.accounts)
        const account = record(accounts[id] || {})
        const accountUpdate = record({ ...updatedAccount })
        Object.values(record(accountUpdate.requests || {})).forEach(stripRequestCapabilities)
        accounts[id] = { ...accountUpdate, balances: account.balances || {} }

        if (!main.accountOrder.includes(id)) main.accountOrder.push(id)

        if (name && !isDefaultAccountName({ ...updatedAccount, name } as any)) {
          const accountMetaId = uuidv5(id, accountNS)
          const accountsMeta = record(main.accountsMeta)
          accountsMeta[accountMetaId] = {
            ...record(accountsMeta[accountMetaId] || {}),
            name,
            lastUpdated: Date.now()
          }
        }
      })
    },

    patchAccount: (id: string, update: AccountPatch) => {
      if (!id || !update) return

      set((draft) => {
        const main = mutableMain(draft)
        const account = record(record(main.accounts)[id])
        if (!account.id) return
        const { id: _id, address: _address, requests: _requests, ...safeUpdate } = update as any
        Object.assign(account, safeUpdate)

        if (safeUpdate.name && !isDefaultAccountName(account as any)) {
          const accountMetaId = uuidv5(id, accountNS)
          const accountsMeta = record(main.accountsMeta)
          accountsMeta[accountMetaId] = {
            ...record(accountsMeta[accountMetaId] || {}),
            name: safeUpdate.name,
            lastUpdated: Date.now()
          }
        }
      })
    },

    upsertAccountRequest: (accountId: string, request: CanonicalAccountRequest) => {
      if (!accountId || !request?.handlerId) return

      set((draft) => {
        const account = record(record(mutableMain(draft).accounts)[accountId])
        if (!account.id) return
        const canonicalRequest = record({ ...request })
        stripRequestCapabilities(canonicalRequest)
        record(account.requests)[request.handlerId] = canonicalRequest
      })
    },

    patchAccountRequest: (
      accountId: string,
      requestId: string,
      update: (request: Draft<CanonicalAccountRequest>) => void
    ) => {
      if (!accountId || !requestId || !update) return

      set((draft) => {
        const account = record(record(mutableMain(draft).accounts)[accountId])
        const request = record(account.requests)[requestId] as Draft<CanonicalAccountRequest> | undefined
        if (request) {
          update(request)
          stripRequestCapabilities(record(request))
        }
      })
    },

    removeAccountRequest: (accountId: string, requestId: string) => {
      if (!accountId || !requestId) return

      set((draft) => {
        const account = record(record(mutableMain(draft).accounts)[accountId])
        if (account.id) delete record(account.requests)[requestId]
      })
    },

    removeAccount: (id: string) => {
      set((draft) => {
        const main = mutableMain(draft)
        delete record(main.accounts)[id]
        if (main.currentAccount === id) main.currentAccount = ''
        main.accountOrder = main.accountOrder.filter((accountId) => accountId !== id)
      })
    },

    reorderAccounts: (fromId: string, toId: string) => {
      if (!fromId || !toId || fromId === toId) return

      set((draft) => {
        const main = mutableMain(draft)
        const accounts = record(main.accounts)
        const ordered = main.accountOrder.filter((id) => accounts[id])

        Object.keys(accounts).forEach((id) => {
          if (!ordered.includes(id)) ordered.push(id)
        })

        const fromIndex = ordered.indexOf(fromId)
        const toIndex = ordered.indexOf(toId)
        if (fromIndex === -1 || toIndex === -1) return

        const [moved] = ordered.splice(fromIndex, 1)
        ordered.splice(toIndex, 0, moved)
        main.accountOrder = ordered
      })
    },

    removeSigner: (id: string) => {
      set((draft) => {
        delete record(mutableMain(draft).signers)[id]
      })
    },

    updateSigner: (signer: SignerSummary) => {
      if (!signer.id) return
      set((draft) => {
        const signers = record(mutableMain(draft).signers)
        signers[signer.id] = { ...record(signers[signer.id] || {}), ...signer }
      })
    },

    newSigner: (signer: SignerSummary) => {
      set((draft) => {
        record(mutableMain(draft).signers)[signer.id] = { ...signer, createdAt: Date.now() }
      })
    },

    rekeySigner: (previousId: string, signer: SignerSummary) => {
      if (!previousId || !signer.id) return
      set((draft) => {
        const signers = record(mutableMain(draft).signers)
        const previous = record(signers[previousId] || {})
        if (previousId !== signer.id) delete signers[previousId]
        signers[signer.id] = {
          ...previous,
          ...record(signers[signer.id] || {}),
          ...signer
        }
      })
    },

    updateLattice: (deviceId: string, update: any) => {
      if (!deviceId || !update) return
      set((draft) => {
        const lattice = record(mutableMain(draft).lattice)
        lattice[deviceId] = { ...record(lattice[deviceId] || {}), ...update }
      })
    },

    removeLattice: (deviceId: string) => {
      if (!deviceId) return
      set((draft) => {
        delete record(mutableMain(draft).lattice)[deviceId]
      })
    },

    setLatticeAccountLimit: (limit: number) => {
      set((draft) => {
        mutableMain(draft).latticeSettings.accountLimit = limit
      })
    },

    setLatticeEndpointMode: (mode: string) => {
      set((draft) => {
        mutableMain(draft).latticeSettings.endpointMode = mode
      })
    },

    setLatticeEndpointCustom: (url: string) => {
      set((draft) => {
        mutableMain(draft).latticeSettings.endpointCustom = url
      })
    },

    setLatticeDerivation: (value: any) => {
      set((draft) => {
        mutableMain(draft).latticeSettings.derivation = value
      })
    },

    setLedgerDerivation: (value: any) => {
      set((draft) => {
        mutableMain(draft).ledger.derivation = value
      })
    },

    setTrezorDerivation: (value: any) => {
      set((draft) => {
        mutableMain(draft).trezor.derivation = value
      })
    },

    setLiveAccountLimit: (value: any) => {
      set((draft) => {
        mutableMain(draft).ledger.liveAccountLimit = value
      })
    },

    setMenubarGasPrice: (value: any) => {
      set((draft) => {
        mutableMain(draft).menubarGasPrice = value
      })
    },

    setBiometricUnlock: (value: any) => {
      set((draft) => {
        mutableMain(draft).biometricUnlock = Boolean(value)
      })
    },

    setAppLock: (appLock: { locked: boolean; vaultExists: boolean }) => {
      set((draft) => {
        mutableMain(draft).appLock = appLock
      })
    },

    toggleExplorerWarning: () => {
      set((draft) => {
        const mute = mutableMain(draft).mute
        mute.explorerWarning = !mute.explorerWarning
      })
    },

    toggleGasFeeWarning: () => {
      set((draft) => {
        const mute = mutableMain(draft).mute
        mute.gasFeeWarning = !mute.gasFeeWarning
      })
    },

    toggleSignerCompatibilityWarning: () => {
      set((draft) => {
        const mute = mutableMain(draft).mute
        mute.signerCompatibilityWarning = !mute.signerCompatibilityWarning
      })
    },

    setShortcut: (name: string, shortcut: any) => {
      set((draft) => {
        const shortcuts = record(mutableMain(draft).shortcuts)
        const existingShortcut = record(shortcuts[name] || {})
        shortcuts[name] = {
          modifierKeys: shortcut.modifierKeys || existingShortcut.modifierKeys,
          shortcutKey: shortcut.shortcutKey || existingShortcut.shortcutKey,
          configuring: shortcut.configuring ?? existingShortcut.configuring,
          enabled: shortcut.enabled ?? existingShortcut.enabled
        }
      })
    },

    setAutohide: (value: boolean) => {
      set((draft) => {
        mutableMain(draft).autohide = value
      })
    },

    setGasFees: (netType: string, netId: number, fees: any) => {
      set((draft) => {
        const meta = record(record(mutableMain(draft).networksMeta)[netType])[netId]
        record(record(meta).gas).price.fees = fees
      })
    },

    setGasPrices: (netType: string, netId: number, prices: any) => {
      set((draft) => {
        const meta = record(record(mutableMain(draft).networksMeta)[netType])[netId]
        record(record(meta).gas).price.levels = prices
      })
    },

    setGasDefault: (netType: string, netId: number, level: string, price?: any) => {
      set((draft) => {
        const meta = record(record(mutableMain(draft).networksMeta)[netType])[netId]
        const gasPrice = record(record(meta).gas).price
        gasPrice.selected = level

        if (level === 'custom') {
          record(gasPrice.levels).custom = price
        } else {
          gasPrice.lastLevel = level
        }
      })
    },

    setNativeCurrencyData: (netType: string, netId: number, currency: any) => {
      set((draft) => {
        const meta = record(record(mutableMain(draft).networksMeta)[netType])[netId]
        meta.nativeCurrency = { ...record(meta.nativeCurrency), ...currency }
      })
    },

    addNetwork: (net: any) => {
      try {
        const network = { ...net, id: validateNetworkSettings(net) }
        const primaryRpc = network.primaryRpc || ''
        const secondaryRpc = network.secondaryRpc || ''
        delete network.primaryRpc
        delete network.secondaryRpc

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
          name: network.name,
          primaryColor: /^accent[1-8]$/.test(network.primaryColor) ? network.primaryColor : 'accent1',
          icon: network.icon || '',
          nativeCurrency: {
            symbol: network.symbol,
            icon: network.nativeCurrencyIcon || '',
            name: network.nativeCurrencyName || '',
            decimals: 18,
            usd: { price: 0, change24hr: 0 }
          },
          gas: {
            price: {
              selected: 'standard',
              levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
            }
          }
        }

        set((draft) => {
          const main = mutableMain(draft)
          const networks = record(main.networks)
          const networksMeta = record(main.networksMeta)
          networks[network.type] ||= {}
          networksMeta[network.type] ||= {}
          if (networks[network.type][network.id]) return

          networks[network.type][network.id] = { ...defaultNetwork, ...network }
          networksMeta[network.type][network.id] = defaultMeta
        })
      } catch (error) {
        log.error(error)
      }
    },

    removeNetwork: (net: any) => {
      try {
        const networkId = parseInt(net.id)
        if (!Number.isInteger(networkId)) throw new Error('Invalid chain id')
        if (net.type === 'ethereum' && networkId === 1) throw new Error('Cannot remove mainnet')

        set((draft) => {
          const main = mutableMain(draft)
          const networks = record(main.networks)
          const typeNetworks = record(networks[net.type])
          if (Object.keys(typeNetworks).length <= 1) return

          switchChainForOrigins(record(main.origins), networkId, 1)
          delete typeNetworks[networkId]
          delete record(record(main.networksMeta)[net.type])[networkId]
        })
      } catch (error) {
        log.error(error)
      }
    },

    initOrigin: (originId: string, origin: any) => {
      const now = Date.now()
      set((draft) => {
        record(mutableMain(draft).origins)[originId] = {
          ...origin,
          session: { requests: 1, startedAt: now, lastUpdatedAt: now }
        }
      })
    },

    addOriginRequest: (originId: string) => {
      const now = Date.now()
      set((draft) => {
        const origin = record(record(mutableMain(draft).origins)[originId])
        const session = record(origin.session)
        const isNewSession = session.startedAt < session.endedAt
        origin.session = {
          requests: isNewSession ? 1 : session.requests + 1,
          startedAt: isNewSession ? now : session.startedAt,
          endedAt: undefined,
          lastUpdatedAt: now
        }
      })
    },

    endOriginSession: (originId: string) => {
      set((draft) => {
        const origin = record(record(mutableMain(draft).origins)[originId])
        if (!origin) return
        const now = Date.now()
        origin.session = { ...record(origin.session), endedAt: now, lastUpdatedAt: now }
      })
    },

    switchOriginChain: (originId: string, chainId: number, type: string) => {
      if (!originId || typeof chainId !== 'number' || type !== 'ethereum') return
      set((draft) => {
        record(record(mutableMain(draft).origins)[originId]).chain = { id: chainId, type }
      })
    },

    clearOrigins: () => {
      set((draft) => {
        const main = mutableMain(draft)
        main.origins = {}
        main.permissions = {}
      })
    },

    removeOrigin: (originId: string) => {
      set((draft) => {
        const main = mutableMain(draft)
        delete record(main.origins)[originId]

        Object.values(record(main.permissions)).forEach((value) => {
          const accountPermissions = record(value)
          Object.entries(accountPermissions).forEach(([permissionId, permission]) => {
            if (permissionId === originId || record(permission).handlerId === originId) {
              delete accountPermissions[permissionId]
            }
          })
        })
      })
    },

    trustExtension: (extensionId: string, trusted: boolean) => {
      set((draft) => {
        record(mutableMain(draft).knownExtensions)[extensionId] = trusted
      })
    },

    setNetworkIcon: (netType: string, chainId: number, icon: string) => {
      set((draft) => {
        const chainsMeta = record(record(mutableMain(draft).networksMeta)[netType])
        if (chainsMeta[chainId]) {
          chainsMeta[chainId].icon = icon
        } else {
          log.error(`Action Error: setNetworkIcon chainId: ${chainId} not found in chainsMeta`)
        }
      })
    },

    setRates: (rates: any) => {
      set((draft) => {
        const main = mutableMain(draft)
        main.rates ||= {}
        Object.assign(main.rates, rates)
      })
    },

    setBalance: (address: string, balance: any) => {
      set((draft) => {
        const balances = record(mutableMain(draft).balances)
        const accountBalances = (balances[address] || []) as any[]
        balances[address] = [
          ...accountBalances.filter(
            (item) => item.address !== balance.address || item.chainId !== balance.chainId
          ),
          balance
        ]
      })
    },

    setBalances: (address: string, newBalances: any[]) => {
      set((draft) => {
        const balances = record(mutableMain(draft).balances)
        const accountBalances = (balances[address] || []) as any[]
        const existingBalances = accountBalances.filter((balance) => {
          return newBalances.every(
            (newBalance) => newBalance.chainId !== balance.chainId || newBalance.address !== balance.address
          )
        })

        balances[address] = [...existingBalances, ...newBalances]
      })
    },

    setPortfolioBalances: (address: string, newBalances: any[]) => {
      set((draft) => {
        const main = mutableMain(draft)
        const customTokenIds = new Set(((main.tokens?.custom || []) as any[]).map(toTokenId))
        const portfolioBalances = newBalances.filter((balance) => !customTokenIds.has(toTokenId(balance)))
        const portfolioChains = new Set(portfolioBalances.map((balance) => balance.chainId))
        const portfolioBalanceIds = new Set(portfolioBalances.map(toTokenId))
        const balances = record(main.balances)
        const existingBalances = (balances[address] || []) as any[]
        const preservedBalances = existingBalances.filter((balance) => {
          const balanceId = toTokenId(balance)
          if (customTokenIds.has(balanceId)) return true
          if (portfolioBalanceIds.has(balanceId)) return false
          if (balance.address === NATIVE_CURRENCY) return true
          return !portfolioChains.has(balance.chainId)
        })

        balances[address] = [...preservedBalances, ...portfolioBalances]
      })
    },

    removeBalance: (chainId: number, address: string) => {
      set((draft) => {
        const balances = record(mutableMain(draft).balances)
        const key = address.toLowerCase()

        Object.values(balances).forEach((value) => {
          const accountBalances = value as any[]
          const index = accountBalances.findIndex((balance) => {
            return balance.chainId === chainId && balance.address.toLowerCase() === key
          })
          if (index > -1) accountBalances.splice(index, 1)
        })
      })
    },

    addCustomTokens: (tokens: any[]) => {
      set((draft) => {
        const main = mutableMain(draft)
        const existing = (main.tokens.custom || []) as any[]
        const existingTokens = existing.filter((token) => !includesToken(tokens, token))
        const tokensToAdd = tokens.map((token) => ({
          ...token,
          address: token.address.toLowerCase()
        }))
        main.tokens.custom = [...existingTokens, ...tokensToAdd]

        Object.values(record(main.balances)).forEach((value) => {
          const accountBalances = value as any[]
          tokens.forEach((token) => {
            const tokenAddress = token.address.toLowerCase()
            const matchingBalance = accountBalances.find((balance) => {
              return balance.address.toLowerCase() === tokenAddress && balance.chainId === token.chainId
            })

            if (matchingBalance) {
              matchingBalance.logoURI = token.logoURI || matchingBalance.logoURI
              matchingBalance.symbol = token.symbol || matchingBalance.symbol
              matchingBalance.name = token.name || matchingBalance.symbol
            }
          })
        })
      })
    },

    removeCustomTokens: (tokens: any[]) => {
      const tokenIds = new Set(tokens.map(toTokenId))
      const needsRemoval = (token: any) => tokenIds.has(toTokenId(token))

      set((draft) => {
        const main = mutableMain(draft)
        main.tokens.custom = (main.tokens.custom as any[]).filter((token) => !needsRemoval(token))

        Object.keys(main.tokens.known).forEach((address) => {
          main.tokens.known[address] = (main.tokens.known[address] as any[]).filter(
            (token) => !needsRemoval(token)
          )
        })
      })
    },

    addKnownTokens: (address: string, tokens: any[]) => {
      set((draft) => {
        const knownTokens = record(mutableMain(draft).tokens.known)
        const existing = (knownTokens[address] || []) as any[]
        const existingTokens = existing.filter((token) => !includesToken(tokens, token))
        const tokensToAdd = tokens.map((token) => ({
          ...token,
          address: token.address.toLowerCase()
        }))
        knownTokens[address] = [...existingTokens, ...tokensToAdd]
      })
    },

    removeKnownTokens: (address: string, tokensToRemove: Set<string>) => {
      set((draft) => {
        const knownTokens = record(mutableMain(draft).tokens.known)
        knownTokens[address] = ((knownTokens[address] || []) as any[]).filter(
          (token) => !tokensToRemove.has(toTokenId(token))
        )
      })
    },

    resetSavedData: () => {
      set((draft) => {
        const main = mutableMain(draft)
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
        main.orders = {}

        if (tokenIds.size > 0) {
          Object.entries(record(main.balances)).forEach(([address, value]) => {
            record(main.balances)[address] = (value as any[]).filter(
              (balance) => !tokenIds.has(toTokenId(balance))
            )
          })
        }
      })
    },

    navHome: (command: any) => {
      const homeCommand = toHomeCommand(command)
      set((draft) => {
        record(draft.tray).homeCommand = homeCommand
        windowState(draft, 'panel').nav = []
      })
    },

    clearHomeCommand: (id?: number) => {
      set((draft) => {
        const tray = record(draft.tray)
        if (!id || tray.homeCommand?.id === id) tray.homeCommand = null
      })
    },

    navForward: (windowId: string, crumb: any) => {
      if (!windowId || !crumb) {
        log.warn('Invalid nav forward', windowId, crumb)
        return
      }

      set((draft) => {
        const window = windowState(draft, windowId)
        const nav = window.nav as any[]
        if (JSON.stringify(nav[0]) !== JSON.stringify(crumb)) nav.unshift(crumb)
        window.show = true
      })
    },

    navUpdate: (windowId: string, crumb: any, navigate: boolean) => {
      if (!windowId || !crumb) {
        log.warn('Invalid nav forward', windowId, crumb)
        return
      }

      set((draft) => {
        const window = windowState(draft, windowId)
        const nav = window.nav as any[]
        const updatedNavItem = {
          view: nav[0].view || crumb.view,
          data: Object.keys(crumb.data).length === 0 ? {} : { ...nav[0].data, ...crumb.data }
        }

        if (JSON.stringify(nav[0]) !== JSON.stringify(updatedNavItem)) {
          if (navigate) nav.unshift(updatedNavItem)
          else nav[0] = updatedNavItem
        }
        if (navigate) window.show = true
      })
    },

    navClearReq: (handlerId: string, showRequestInbox = true) => {
      set((draft) => {
        const panel = windowState(draft, 'panel')
        panel.nav = (panel.nav as any[]).filter((item) => {
          const isClearedRequest = item?.data?.requestId === handlerId
          const isRequestInbox = item?.data?.id === 'requests' && item?.view === 'expandedModule'
          return !isClearedRequest && (showRequestInbox || !isRequestInbox)
        })
      })
    },

    navBack: (windowId: string, numSteps = 1) => {
      if (!windowId) {
        log.warn('Invalid nav back', windowId)
        return
      }

      set((draft) => {
        const nav = windowState(draft, windowId).nav as any[]
        nav.splice(0, Math.min(numSteps, nav.length))
      })
    },

    completeOnboarding: () => {
      set((draft) => {
        mutableMain(draft).mute.onboardingWindow = true
      })
    },

    setFramePanel: (frame: any) => {
      set((draft) => {
        const main = mutableMain(draft)
        main.frames = { [frame.id]: frame }
        main.focusedFrame = frame.id
      })
    },

    removeFrame: (frameId: string) => {
      set((draft) => {
        delete record(mutableMain(draft).frames)[frameId]
      })
    },

    unsetAccount: () => {
      set((draft) => {
        mutableMain(draft).currentAccount = ''
        draft.selected.open = false
        draft.selected.minimized = true
        windowState(draft, 'panel').nav = []
      })
    }
  }
}

export type CanonicalActions = ReturnType<typeof createCanonicalActions>
export type CanonicalStore = CanonicalState & CanonicalActions

export default createCanonicalActions
