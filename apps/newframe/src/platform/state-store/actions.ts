import log from 'electron-log'
import type { Draft } from 'immer'
import { v5 as uuidv5 } from 'uuid'

import {
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILE_NAME,
  getProfileAccountIds,
  type ActivityRecord,
  type OrderRecord
} from '../../app/contracts/state/main.js'
import { accountNS, isDefaultAccountName } from '../../features/accounts/domain/index.js'
import type { Account } from '../../features/accounts/domain/state/account.js'
import type { CanonicalAccountRequest } from '../../features/requests/contract/requests.js'
import { NATIVE_CURRENCY } from '../../features/tokens/domain/constants.js'
import { toTokenId } from '../../features/tokens/domain/index.js'
import type { Token, TokenImage, TokenSource } from '../../features/tokens/domain/state/token.js'
import { AirGapPublicAccountSchema, type AirGapPublicAccount } from '../signing/domain/airgap.js'
import type { SignerSummary } from '../signing/signers/Signer/index.js'
import { createOperationActions } from './actions.operation.js'
import { createPanelActions, type CanonicalGet, type CanonicalSet } from './actions.panel.js'
import type { CanonicalState, Chain, ChainMetadata, Origin } from './state/index.js'

type MutableRecord = Record<string, any>
type AccountPatch = Partial<Omit<Account, 'id' | 'address' | 'profileId' | 'requests'>>
type ActivityUpdate = Partial<ActivityRecord> & Record<string, unknown>
type OrderUpdate = Partial<OrderRecord> & Record<string, unknown>
type NetworkType = keyof CanonicalState['main']['networks']
type NetworkConnection = Chain['connection']['primary']
type GasPrice = ChainMetadata['gas']['price']
type NetworkConnectionUpdate = Omit<Partial<NetworkConnection>, 'status'> & { status?: string }
type LatticeState = CanonicalState['main']['lattice'][string]
type ShortcutUpdate = Omit<Partial<CanonicalState['main']['shortcuts']['summon']>, 'shortcutKey'> & {
  shortcutKey?: string
}
type AccountUpsert = Partial<Omit<Account, 'id' | 'profileId' | 'requests'>> &
  Pick<Account, 'id'> & {
    profileId?: string
    requests?: Record<string, CanonicalAccountRequest>
  }
type MutableMain = Draft<CanonicalState['main']> & MutableRecord
type MutableCanonicalState = Draft<CanonicalState> & MutableRecord
type DynamicFields = Record<string, unknown>
type NetworkSettingsInput = DynamicFields & {
  explorer?: string
  icon?: string
  id?: number | string
  name?: string
  nativeCurrencyIcon?: string
  nativeCurrencyName?: string
  primaryColor?: string
  primaryRpc?: string
  secondaryRpc?: string
  symbol?: string
  type?: string
}
type TokenInput = DynamicFields & {
  address: string
  chainId: number | string
  decimals: number | string
  image?: TokenImage
  logoURI?: string
  name: string
  symbol: string
}
type BalanceInput = TokenInput & { balance: string; displayBalance?: string }
type NavigationCrumb = { data?: Record<string, unknown>; view?: string }
type MutableAccountRecord = MutableRecord & {
  balances?: unknown
  id?: string
  profileId?: string
  requests?: unknown
}
type MutableTokenRecord = MutableRecord &
  Partial<Token> & {
    curated?: boolean
    custom?: boolean
    sources?: TokenSource[]
  }
type MutableConnection = MutableRecord & {
  current?: unknown
  custom?: unknown
  on?: boolean
}
type MutableNetwork = MutableRecord & {
  connection: MutableRecord & { primary: MutableConnection; secondary: MutableConnection }
  on?: boolean
}

const supportedNetworkTypes = ['ethereum']
const completedActivityStatuses = new Set(['succeeded', 'reverted'])

const mutable = (state: Draft<CanonicalState>) => state as MutableCanonicalState
const mutableMain = (state: Draft<CanonicalState>) => state.main as MutableMain
const record = (value: unknown) => value as MutableRecord
const windowState = (state: Draft<CanonicalState>, windowId: string) =>
  record(record(state.windows)[windowId])

function ensureProfileState(main: MutableMain) {
  const profiles = record(main.profiles || {}) as Record<string, { id: string; name: string }>
  main.profiles = profiles

  if (Object.keys(profiles).length === 0) {
    profiles[DEFAULT_PROFILE_ID] = { id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME }
  }

  const profileOrder: string[] = []
  const seen = new Set<string>()
  ;[...(main.profileOrder || []), ...Object.keys(profiles)].forEach((id) => {
    if (profiles[id] && !seen.has(id)) {
      seen.add(id)
      profileOrder.push(id)
    }
  })
  main.profileOrder = profileOrder

  if (!profiles[main.currentProfile]) {
    main.currentProfile = profileOrder[0]
  }

  const accounts = record(main.accounts || {}) as Record<string, MutableAccountRecord>
  Object.values(accounts).forEach((candidate) => {
    const account = candidate
    if (account.id && (!account.profileId || !profiles[account.profileId])) {
      account.profileId = main.currentProfile
    }
  })
  main.accountOrder = [
    ...new Set([...(main.accountOrder || []).filter((id) => accounts[id]), ...Object.keys(accounts)])
  ]

  if (
    main.currentAccount &&
    (!accounts[main.currentAccount] || accounts[main.currentAccount].profileId !== main.currentProfile)
  ) {
    selectProfileFallback(main)
  }
}

function profileAccountIds(main: MutableMain, profileId: string) {
  return getProfileAccountIds(main, profileId)
}

function selectProfileFallback(main: MutableMain, profileId = main.currentProfile) {
  main.currentAccount = profileAccountIds(main, profileId)[0] || ''
}

function switchChainForOrigins(origins: MutableRecord, oldChainId: number, newChainId: number) {
  Object.entries(origins).forEach(([originId, value]) => {
    const origin = record(value)
    if (oldChainId === (record(origin.chain) as { id?: number }).id) {
      ;(origins[originId] as MutableRecord).chain = { id: newChainId, type: 'ethereum' }
    }
  })
}

function validateNetworkSettings(value: unknown) {
  const network = record(value) as NetworkSettingsInput
  const networkId = parseInt(String(network.id ?? ''))
  const validHttpUrl = (value: unknown, optional = false) => {
    if (optional && !value) {
      return true
    }
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

function tokenFromValue(input: Token | TokenInput): Token | undefined {
  const value = input as TokenInput
  if (
    value.address === NATIVE_CURRENCY ||
    typeof value.address !== 'string' ||
    !Number.isInteger(Number(value.chainId)) ||
    typeof value.name !== 'string' ||
    typeof value.symbol !== 'string' ||
    !Number.isInteger(Number(value.decimals))
  ) {
    return undefined
  }

  return {
    address: value.address.toLowerCase(),
    chainId: Number(value.chainId),
    decimals: Number(value.decimals),
    name: value.name,
    symbol: value.symbol,
    ...(value.logoURI ? { logoURI: value.logoURI } : {}),
    ...(value.image ? { image: value.image } : {})
  }
}

function balanceFromValue(value: BalanceInput) {
  return {
    address: value.address === NATIVE_CURRENCY ? NATIVE_CURRENCY : value.address.toLowerCase(),
    balance: value.balance,
    chainId: Number(value.chainId),
    displayBalance: value.displayBalance ?? ''
  }
}

function upsertTokenRecords(
  main: MutableMain,
  tokens: Token[],
  options: { account?: string; custom?: boolean; curated?: boolean; source: TokenSource }
) {
  const catalog = main.tokens
  const byId = catalog.byId
  const account = options.account?.toLowerCase()
  const accountTokenIds = catalog.accountTokenIds
  const accountIds = new Set<string>((account && accountTokenIds[account]) ?? [])

  tokens.forEach((input) => {
    const token = tokenFromValue(input)
    if (!token) {
      return
    }
    const id = toTokenId(token)
    const existing = record(byId[id] ?? {}) as MutableTokenRecord
    const preserveCustomMetadata = existing.custom && !options.custom
    const sourceSet = new Set<TokenSource>([...(existing.sources ?? []), options.source])
    const preferred = preserveCustomMetadata ? existing : token

    byId[id] = {
      ...existing,
      address: token.address,
      chainId: token.chainId,
      decimals: preferred.decimals ?? existing.decimals ?? token.decimals,
      name: preferred.name ?? existing.name ?? token.symbol,
      symbol: preferred.symbol ?? existing.symbol ?? token.symbol,
      logoURI: preferred.logoURI ?? existing.logoURI ?? '',
      image:
        preferred.image && (!existing.image || preferred.image.sourceUrl !== existing.image.sourceUrl)
          ? preferred.image
          : existing.image,
      custom: Boolean(existing.custom ?? options.custom),
      curated: Boolean(existing.curated ?? options.curated),
      sources: [...sourceSet],
      updatedAt: Date.now()
    }

    if (account) {
      accountIds.add(id)
    }
  })

  if (account) {
    accountTokenIds[account] = [...accountIds]
  }
}

function stripRequestCapabilities(request: MutableRecord) {
  ;((request.recognizedActions ?? []) as MutableRecord[]).forEach((action) => delete action.update)
}

export function createCanonicalActions(set: CanonicalSet, get: CanonicalGet) {
  let homeCommandId = 0

  const toHomeCommand = (command: NavigationCrumb | null | undefined) => ({
    id: ++homeCommandId,
    view: command?.view === 'chains' ? 'networks' : command?.view,
    data: command?.data ?? {}
  })

  return {
    ...createPanelActions(set, get),
    ...createOperationActions(set, get),

    activateNetwork: (type: string, chainId: number, active: boolean) => {
      set((draft) => {
        const main = mutableMain(draft)
        const network = record(record(main.networks)[type])[chainId] as MutableNetwork
        network.on = active

        if (!active) {
          switchChainForOrigins(record(main.origins), chainId, 1)
        }
      })
    },

    selectPrimary: (netType: string, netId: number, value: any) => {
      set((draft) => {
        const network = record(record(mutableMain(draft).networks)[netType])[netId] as MutableNetwork
        network.connection.primary.current = value
      })
    },

    setPrimaryCustom: (netType: string, netId: number, target: any) => {
      if (!netType || !netId) {
        return
      }
      set((draft) => {
        const network = record(record(mutableMain(draft).networks)[netType])[netId] as MutableNetwork
        network.connection.primary.custom = target
      })
    },

    setSecondaryCustom: (netType: string, netId: number, target: any) => {
      if (!netType || !netId) {
        return
      }
      set((draft) => {
        const network = record(record(mutableMain(draft).networks)[netType])[netId] as MutableNetwork
        network.connection.secondary.custom = target
      })
    },

    toggleConnection: (netType: string, netId: number, node: string, on?: boolean) => {
      set((draft) => {
        const connection = (record(record(mutableMain(draft).networks)[netType])[netId] as MutableNetwork)
          .connection
        const target = record(connection[node])
        target.on = on ?? !target.on
      })
    },

    setPrimary: (netType: NetworkType, netId: number, status: NetworkConnectionUpdate) => {
      set((draft) => {
        const connection = mutableMain(draft).networks[netType][netId].connection
        Object.assign(connection.primary, status)
      })
    },

    setSecondary: (netType: NetworkType, netId: number, status: NetworkConnectionUpdate) => {
      set((draft) => {
        const connection = mutableMain(draft).networks[netType][netId].connection
        Object.assign(connection.secondary, status)
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
        if (!apiKey) {
          main.autoDiscoverTokens = false
        }
      })
    },

    setShowTestnets: (value: boolean) => {
      set((draft) => {
        mutableMain(draft).showTestnets = Boolean(value)
      })
    },

    setPermission: (address: string, value: unknown) => {
      const permission = record(value)
      const handlerId = typeof permission.handlerId === 'string' ? permission.handlerId : ''
      if (!handlerId) {
        return
      }
      set((draft) => {
        const permissions = record(mutableMain(draft).permissions)
        const accountPermissions = record(permissions[address] ?? {})
        permissions[address] = accountPermissions

        if (permission.provider) {
          accountPermissions[handlerId] = permission
        } else {
          delete accountPermissions[handlerId]
        }
      })
    },

    revokePermission: (address: string, handlerId: string) => {
      if (!address || !handlerId) {
        return
      }

      set((draft) => {
        const accountPermissions = record(record(mutableMain(draft).permissions)[address] ?? {})
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
        if (!dontRemind.includes(version)) {
          dontRemind.push(version)
        }
      })
    },

    setUpdaterLastChecked: (lastChecked: number) => {
      set((draft) => {
        mutableMain(draft).updater.lastChecked = lastChecked
      })
    },

    upsertSubmittedActivity: (activity: ActivityRecord) => {
      const id = activity?.id
      if (!id) {
        return
      }
      const now = Date.now()

      set((draft) => {
        const activities = mutableMain(draft).activity
        const existingActivity = activities[id]
        const submittedActivity = {
          ...existingActivity,
          ...activity,
          id,
          status: 'submitted' as const,
          submittedAt: activity.submittedAt ?? existingActivity?.submittedAt ?? now,
          updatedAt: activity.updatedAt ?? now,
          confirmations: activity.confirmations ?? existingActivity?.confirmations ?? 0
        }

        if (activity.completedAt === undefined) {
          delete submittedActivity.completedAt
        }
        activities[id] = submittedActivity
      })
    },

    updateActivity: (id: string, update: ActivityUpdate = {}) => {
      if (!id) {
        return
      }
      const now = Date.now()

      set((draft) => {
        const activities = mutableMain(draft).activity
        const activity = activities[id]
        activities[id] = {
          ...activity,
          ...update,
          id,
          status: update.status ?? activity?.status ?? 'confirming',
          updatedAt: update.updatedAt ?? now
        }
      })
    },

    finalizeActivity: (id: string, status: ActivityRecord['status'], update: ActivityUpdate = {}) => {
      if (!id) {
        return
      }
      if (!completedActivityStatuses.has(status)) {
        log.warn(`Invalid finalized activity status: ${status}`)
        return
      }

      const completedAt = update.completedAt ?? Date.now()

      set((draft) => {
        const activities = mutableMain(draft).activity
        const activity = activities[id]
        activities[id] = {
          ...activity,
          ...update,
          id,
          status,
          completedAt,
          updatedAt: update.updatedAt ?? completedAt,
          confirmations: update.confirmations ?? activity?.confirmations ?? 0
        }
      })
    },

    pruneActivity: (id: string) => {
      if (!id) {
        return
      }
      set((draft) => {
        delete record(mutableMain(draft).activity)[id]
      })
    },

    upsertOrder: (order: OrderRecord) => {
      const orderId = order?.orderId
      if (!orderId) {
        return
      }
      const now = Date.now()

      set((draft) => {
        const orders = mutableMain(draft).orders
        const existingOrder = orders[orderId]
        const source =
          order.source ?? order.provider ?? existingOrder?.source ?? existingOrder?.provider ?? 'flash'
        const provider =
          order.provider ?? order.source ?? existingOrder?.provider ?? existingOrder?.source ?? source

        orders[orderId] = {
          ...existingOrder,
          ...order,
          orderId,
          provider,
          source,
          createdAt: order.createdAt ?? existingOrder?.createdAt ?? now,
          updatedAt: order.updatedAt ?? now
        }
      })
    },

    updateOrder: (orderId: string, update: OrderUpdate = {}) => {
      if (!orderId) {
        return
      }
      const now = Date.now()

      set((draft) => {
        const orders = mutableMain(draft).orders
        const existingOrder = orders[orderId]
        if (!existingOrder) {
          return
        }

        const existing = existingOrder
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

    createProfile: (id: string, name: string, accountIds?: string[]) => {
      if (!id || typeof name !== 'string' || !name.trim()) {
        return
      }

      set((draft) => {
        const main = mutableMain(draft)
        ensureProfileState(main)
        const profiles = record(main.profiles)
        if (profiles[id]) {
          return
        }

        profiles[id] = { id, name }
        main.profileOrder.push(id)

        if (accountIds) {
          accountIds.forEach((accountId) => {
            const account = record(record(main.accounts)[accountId] ?? {})
            if (account.id) {
              account.profileId = id
            }
          })
          main.currentProfile = id
          selectProfileFallback(main, id)
        }
      })
    },

    selectProfile: (id: string) => {
      if (!id) {
        return
      }

      set((draft) => {
        const main = mutableMain(draft)
        ensureProfileState(main)
        if (!record(main.profiles)[id]) {
          return
        }

        if (main.currentProfile !== id) {
          main.currentProfile = id
          selectProfileFallback(main, id)
        }
      })
    },

    renameProfile: (id: string, name: string) => {
      if (!id || typeof name !== 'string' || !name.trim()) {
        return
      }

      set((draft) => {
        const main = mutableMain(draft)
        ensureProfileState(main)
        const profile = record(record(main.profiles)[id] ?? {})
        if (!profile.id) {
          return
        }
        profile.name = name
      })
    },

    deleteProfile: (id: string) => {
      if (!id) {
        return
      }

      set((draft) => {
        const main = mutableMain(draft)
        ensureProfileState(main)
        const profiles = record(main.profiles)
        if (!profiles[id] || main.profileOrder.length === 1) {
          return
        }
        if (profileAccountIds(main, id).length > 0) {
          return
        }

        const deletedIndex = main.profileOrder.indexOf(id)
        const nextProfile = main.profileOrder[deletedIndex + 1] || main.profileOrder[deletedIndex - 1]
        delete profiles[id]
        main.profileOrder = main.profileOrder.filter((profileId) => profileId !== id)

        if (main.currentProfile === id) {
          main.currentProfile = nextProfile
          selectProfileFallback(main, nextProfile)
        }
      })
    },

    moveAccountToProfile: (accountId: string, profileId: string) => {
      if (!accountId || !profileId) {
        return
      }

      set((draft) => {
        const main = mutableMain(draft)
        ensureProfileState(main)
        const account = record(record(main.accounts)[accountId] ?? {})
        if (!account.id || !record(main.profiles)[profileId] || account.profileId === profileId) {
          return
        }

        account.profileId = profileId
        if (main.currentAccount === accountId && main.currentProfile !== profileId) {
          selectProfileFallback(main)
        }
      })
    },

    setAccount: (account: Pick<Account, 'id'>) => {
      set((draft) => {
        const state = mutable(draft)
        const main = mutableMain(draft)
        ensureProfileState(main)
        const selectedAccount = record(record(main.accounts)[account.id] ?? {}) as MutableAccountRecord
        const profileId = selectedAccount.profileId
        if (!selectedAccount.id || !profileId || !record(main.profiles)[profileId]) {
          return
        }
        main.currentProfile = profileId
        main.currentAccount = selectedAccount.id
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
        ensureProfileState(main)
        const accounts = record(main.accounts)
        const account = record(accounts[id] ?? {}) as MutableAccountRecord
        const accountUpdate = record({ ...updatedAccount }) as MutableAccountRecord
        const profileId = account.profileId ?? accountUpdate.profileId ?? main.currentProfile
        if (!record(main.profiles)[profileId]) {
          return
        }
        Object.values(record(accountUpdate.requests ?? {})).forEach(stripRequestCapabilities)
        accounts[id] = { ...accountUpdate, profileId, balances: account.balances ?? {} }

        main.accountOrder = [...new Set(main.accountOrder.filter((accountId) => accounts[accountId]))]
        if (!main.accountOrder.includes(id)) {
          main.accountOrder.push(id)
        }

        if (name && !isDefaultAccountName({ ...updatedAccount, name } as any)) {
          const accountMetaId = uuidv5(id, accountNS)
          const accountsMeta = record(main.accountsMeta)
          accountsMeta[accountMetaId] = {
            ...record(accountsMeta[accountMetaId] ?? {}),
            name,
            lastUpdated: Date.now()
          }
        }
      })
    },

    patchAccount: (id: string, update: AccountPatch) => {
      if (!id || !update) {
        return
      }

      set((draft) => {
        const main = mutableMain(draft)
        const account = main.accounts[id]
        if (!account) {
          return
        }
        const {
          id: _id,
          address: _address,
          profileId: _profileId,
          requests: _requests,
          ...safeUpdate
        } = update as AccountPatch & Partial<Pick<Account, 'id' | 'address' | 'profileId' | 'requests'>>
        Object.assign(account, safeUpdate)

        if (safeUpdate.name && !isDefaultAccountName(account)) {
          const accountMetaId = uuidv5(id, accountNS)
          const accountsMeta = record(main.accountsMeta)
          accountsMeta[accountMetaId] = {
            ...record(accountsMeta[accountMetaId] ?? {}),
            name: safeUpdate.name,
            lastUpdated: Date.now()
          }
        }
      })
    },

    upsertAccountRequest: (accountId: string, request: CanonicalAccountRequest) => {
      if (!accountId || !request?.handlerId) {
        return
      }

      set((draft) => {
        const account = record(record(mutableMain(draft).accounts)[accountId])
        if (!account.id) {
          return
        }
        const canonicalRequest: CanonicalAccountRequest = { ...request }
        stripRequestCapabilities(canonicalRequest)
        record(account.requests)[request.handlerId] = canonicalRequest
      })
    },

    patchAccountRequest: (
      accountId: string,
      requestId: string,
      update: (request: Draft<CanonicalAccountRequest>) => void
    ) => {
      if (!accountId || !requestId || !update) {
        return
      }

      set((draft) => {
        const account = record(record(mutableMain(draft).accounts)[accountId])
        const request = record(account.requests)[requestId] as Draft<CanonicalAccountRequest> | undefined
        if (request) {
          update(request)
          stripRequestCapabilities(request)
        }
      })
    },

    removeAccountRequest: (accountId: string, requestId: string) => {
      if (!accountId || !requestId) {
        return
      }

      set((draft) => {
        const account = record(record(mutableMain(draft).accounts)[accountId])
        if (account.id) {
          delete record(account.requests)[requestId]
        }
      })
    },

    removeAccount: (id: string) => {
      set((draft) => {
        const main = mutableMain(draft)
        ensureProfileState(main)
        delete record(main.accounts)[id]
        main.accountOrder = main.accountOrder.filter((accountId) => accountId !== id)
        if (main.currentAccount === id) {
          selectProfileFallback(main)
        }
      })
    },

    reorderAccounts: (fromId: string, toId: string) => {
      if (!fromId || !toId || fromId === toId) {
        return
      }

      set((draft) => {
        const main = mutableMain(draft)
        ensureProfileState(main)
        const accounts = record(main.accounts)
        const ordered = [...new Set(main.accountOrder.filter((id) => accounts[id]))]

        Object.keys(accounts).forEach((id) => {
          if (!ordered.includes(id)) {
            ordered.push(id)
          }
        })

        const fromIndex = ordered.indexOf(fromId)
        const toIndex = ordered.indexOf(toId)
        if (fromIndex === -1 || toIndex === -1) {
          return
        }

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
      if (!signer.id) {
        return
      }
      set((draft) => {
        const signers = record(mutableMain(draft).signers)
        signers[signer.id] = { ...record(signers[signer.id] ?? {}), ...signer }
        if (signer.type === 'airgap' && !signer.airgapRequest) {
          delete (signers[signer.id] as MutableRecord).airgapRequest
        }
      })
    },

    newSigner: (signer: SignerSummary) => {
      set((draft) => {
        record(mutableMain(draft).signers)[signer.id] = { ...signer, createdAt: Date.now() }
      })
    },

    rekeySigner: (previousId: string, signer: SignerSummary) => {
      if (!previousId || !signer.id) {
        return
      }
      set((draft) => {
        const signers = record(mutableMain(draft).signers)
        const previous = record(signers[previousId] ?? {})
        if (previousId !== signer.id) {
          delete signers[previousId]
        }
        signers[signer.id] = {
          ...previous,
          ...record(signers[signer.id] ?? {}),
          ...signer
        }
      })
    },

    addAirGap: (id: string, account: AirGapPublicAccount) => {
      const validated = AirGapPublicAccountSchema.parse(account)
      set((draft) => {
        draft.main.airgap[id] = validated
      })
    },
    removeAirGap: (id: string) => {
      set((draft) => {
        delete draft.main.airgap[id]
      })
    },
    updateLattice: (deviceId: string, update: Partial<LatticeState>) => {
      if (!deviceId || !update) {
        return
      }
      set((draft) => {
        const lattice = mutableMain(draft).lattice
        const existing = lattice[deviceId]
        if (existing) {
          Object.assign(existing, update)
        }
      })
    },

    removeLattice: (deviceId: string) => {
      if (!deviceId) {
        return
      }
      set((draft) => {
        delete record(mutableMain(draft).lattice)[deviceId]
      })
    },

    setLatticeAccountLimit: (limit: number) => {
      set((draft) => {
        ;(mutableMain(draft).latticeSettings as { accountLimit: number }).accountLimit = limit
      })
    },

    setLatticeEndpointMode: (mode: string) => {
      set((draft) => {
        ;(mutableMain(draft).latticeSettings as { endpointMode: string }).endpointMode = mode
      })
    },

    setLatticeEndpointCustom: (url: string) => {
      set((draft) => {
        ;(mutableMain(draft).latticeSettings as { endpointCustom: string }).endpointCustom = url
      })
    },

    setLatticeDerivation: (value: any) => {
      set((draft) => {
        ;(mutableMain(draft).latticeSettings as { derivation: unknown }).derivation = value
      })
    },

    setLedgerDerivation: (value: any) => {
      set((draft) => {
        ;(mutableMain(draft).ledger as { derivation: unknown }).derivation = value
      })
    },

    setTrezorDerivation: (value: any) => {
      set((draft) => {
        ;(mutableMain(draft).trezor as { derivation: unknown }).derivation = value
      })
    },

    setLiveAccountLimit: (value: any) => {
      set((draft) => {
        ;(mutableMain(draft).ledger as { liveAccountLimit: unknown }).liveAccountLimit = value
      })
    },

    setMenubarGasPrice: (value: boolean) => {
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

    setShortcut: (name: 'summon', shortcut: ShortcutUpdate) => {
      set((draft) => {
        const existingShortcut = mutableMain(draft).shortcuts[name]
        Object.assign(existingShortcut, {
          modifierKeys: shortcut.modifierKeys ?? existingShortcut.modifierKeys,
          shortcutKey: shortcut.shortcutKey ?? existingShortcut.shortcutKey,
          configuring: shortcut.configuring ?? existingShortcut.configuring,
          enabled: shortcut.enabled ?? existingShortcut.enabled
        })
      })
    },

    setAutohide: (value: boolean) => {
      set((draft) => {
        mutableMain(draft).autohide = value
      })
    },

    setGasFees: (netType: string, netId: number, fees: any) => {
      set((draft) => {
        const meta = record(record(mutableMain(draft).networksMeta)[netType])[netId] as {
          gas: { price: MutableRecord & { fees?: unknown } }
        }
        meta.gas.price.fees = fees
      })
    },

    setGasPrices: (netType: string, netId: number, prices: any) => {
      set((draft) => {
        const meta = record(record(mutableMain(draft).networksMeta)[netType])[netId] as {
          gas: { price: MutableRecord & { levels?: unknown } }
        }
        meta.gas.price.levels = prices
      })
    },

    setGasDefault: (netType: NetworkType, netId: number, level: GasPrice['selected'], price?: string) => {
      set((draft) => {
        const gasPrice = mutableMain(draft).networksMeta[netType][netId].gas.price
        gasPrice.selected = level

        if (level === 'custom') {
          gasPrice.levels.custom = price
        } else {
          Object.assign(gasPrice, { lastLevel: level })
        }
      })
    },

    setNativeCurrencyData: (netType: string, netId: number, currency: any) => {
      set((draft) => {
        const meta = record(record(mutableMain(draft).networksMeta)[netType])[netId] as MutableRecord & {
          nativeCurrency?: unknown
        }
        meta.nativeCurrency = { ...record(meta.nativeCurrency), ...currency }
      })
    },

    addNetwork: (value: unknown) => {
      try {
        const net = record(value) as NetworkSettingsInput
        const networkId = validateNetworkSettings(net)
        const networkType = typeof net.type === 'string' ? net.type : ''
        const network = { ...net, id: networkId, type: networkType }
        const icon = network.icon ?? ''
        const primaryRpc = network.primaryRpc ?? ''
        const secondaryRpc = network.secondaryRpc ?? ''
        delete network.icon
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
          primaryColor: /^accent[1-8]$/.test(network.primaryColor ?? '') ? network.primaryColor : 'accent1',
          icon,
          nativeCurrency: {
            symbol: network.symbol,
            icon: network.nativeCurrencyIcon ?? '',
            name: network.nativeCurrencyName ?? '',
            decimals: 18
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
          const networks = record(main.networks) as Record<string, Record<number, MutableRecord>>
          const networksMeta = record(main.networksMeta) as Record<string, Record<number, MutableRecord>>
          networks[network.type] ??= {}
          networksMeta[network.type] ??= {}
          if (networks[network.type][network.id]) {
            return
          }

          networks[network.type][network.id] = { ...defaultNetwork, ...network }
          networksMeta[network.type][network.id] = defaultMeta
        })
      } catch (error) {
        log.error(error)
      }
    },

    removeNetwork: (value: unknown) => {
      try {
        const net = record(value)
        const networkId = parseInt(String(net.id ?? ''))
        const networkType = typeof net.type === 'string' ? net.type : ''
        if (!Number.isInteger(networkId)) {
          throw new Error('Invalid chain id')
        }
        if (networkType === 'ethereum' && networkId === 1) {
          throw new Error('Cannot remove mainnet')
        }

        set((draft) => {
          const main = mutableMain(draft)
          const networks = record(main.networks)
          const typeNetworks = record(networks[networkType])
          if (Object.keys(typeNetworks).length <= 1) {
            return
          }

          switchChainForOrigins(record(main.origins), networkId, 1)
          delete typeNetworks[networkId]
          delete record(record(main.networksMeta)[networkType])[networkId]
        })
      } catch (error) {
        log.error(error)
      }
    },

    initOrigin: (originId: string, origin: Omit<Origin, 'session'>) => {
      const now = Date.now()
      set((draft) => {
        mutableMain(draft).origins[originId] = {
          ...origin,
          session: { requests: 1, startedAt: now, lastUpdatedAt: now }
        }
      })
    },

    setOriginFavicon: (originId: string, source: string) => {
      set((draft) => {
        const origin = mutableMain(draft).origins[originId]
        if (!origin || origin.faviconSource === source) {
          return
        }
        origin.faviconSource = source
        delete origin.image
      })
    },

    setOriginImage: (originId: string, source: string, image: TokenImage) => {
      set((draft) => {
        const origin = mutableMain(draft).origins[originId]
        if (origin?.faviconSource === source && image.sourceUrl === source) {
          origin.image = image
        }
      })
    },

    addOriginRequest: (originId: string) => {
      const now = Date.now()
      set((draft) => {
        const origin = mutableMain(draft).origins[originId]
        const session = origin.session
        const isNewSession = session.endedAt !== undefined && session.startedAt < session.endedAt
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
        if (!origin) {
          return
        }
        const now = Date.now()
        origin.session = { ...record(origin.session), endedAt: now, lastUpdatedAt: now }
      })
    },

    switchOriginChain: (originId: string, chainId: number, type: string) => {
      if (!originId || typeof chainId !== 'number' || type !== 'ethereum') {
        return
      }
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

    trustExtension: (extensionId: string, trusted: boolean | undefined) => {
      set((draft) => {
        const extensions = record(mutableMain(draft).knownExtensions)
        if (trusted === undefined) {
          delete extensions[extensionId]
        } else {
          extensions[extensionId] = trusted
        }
      })
    },

    setNetworkImage: (netType: string, chainId: number, sourceUrl: string, image: TokenImage) => {
      set((draft) => {
        const chainsMeta = record(record(mutableMain(draft).networksMeta)[netType])
        if (chainsMeta[chainId]) {
          const chainMetadata = chainsMeta[chainId] as MutableRecord
          chainMetadata.icon = sourceUrl
          chainMetadata.image = image
        } else {
          log.error(`Action Error: setNetworkImage chainId: ${chainId} not found in chainsMeta`)
        }
      })
    },

    setNativeCurrencyImage: (netType: string, chainId: number, image: TokenImage) => {
      set((draft) => {
        const chainsMeta = record(record(mutableMain(draft).networksMeta)[netType])
        if (chainsMeta[chainId]) {
          const chainMetadata = chainsMeta[chainId] as { nativeCurrency: MutableRecord }
          chainMetadata.nativeCurrency.image = image
        } else {
          log.error(`Action Error: setNativeCurrencyImage chainId: ${chainId} not found in chainsMeta`)
        }
      })
    },

    setAssetRates: (assetRates: CanonicalState['main']['assetRates']) => {
      set((draft) => {
        Object.assign(mutableMain(draft).assetRates, assetRates)
      })
    },

    setBalance: (address: string, balance: any) => {
      set((draft) => {
        const main = mutableMain(draft)
        const token = tokenFromValue(balance)
        if (token) {
          upsertTokenRecords(main, [token], { account: address, source: 'onchain' })
        }
        const normalizedBalance = balanceFromValue(balance)
        const balances = record(main.balances)
        const accountBalances = ((balances[address] ?? []) as any[]).map(balanceFromValue)
        balances[address] = [
          ...accountBalances.filter(
            (item) => item.address !== normalizedBalance.address || item.chainId !== normalizedBalance.chainId
          ),
          normalizedBalance
        ]
      })
    },

    setBalances: (address: string, newBalances: any[]) => {
      set((draft) => {
        const main = mutableMain(draft)
        upsertTokenRecords(main, newBalances.map(tokenFromValue).filter(Boolean) as Token[], {
          account: address,
          source: 'onchain'
        })
        const normalizedBalances = newBalances.map(balanceFromValue)
        const balances = record(main.balances)
        const accountBalances = ((balances[address] ?? []) as any[]).map(balanceFromValue)
        const existingBalances = accountBalances.filter((balance) => {
          return normalizedBalances.every(
            (newBalance) => newBalance.chainId !== balance.chainId || newBalance.address !== balance.address
          )
        })

        balances[address] = [...existingBalances, ...normalizedBalances]
      })
    },

    setPortfolioBalances: (address: string, newBalances: any[]) => {
      set((draft) => {
        const main = mutableMain(draft)
        upsertTokenRecords(main, newBalances.map(tokenFromValue).filter(Boolean) as Token[], {
          account: address,
          source: 'portfolio'
        })
        const customTokenIds = new Set(
          Object.values(record(record(main.tokens).byId ?? {}))
            .filter((token): token is MutableTokenRecord => Boolean((token as MutableTokenRecord).custom))
            .map((token) => toTokenId(token as Token))
        )
        const portfolioBalances = newBalances
          .filter((balance) => !customTokenIds.has(toTokenId(balance)))
          .map(balanceFromValue)
        const portfolioChains = new Set(portfolioBalances.map((balance) => balance.chainId))
        const portfolioBalanceIds = new Set(portfolioBalances.map(toTokenId))
        const balances = record(main.balances)
        const existingBalances = ((balances[address] ?? []) as any[]).map(balanceFromValue)
        const preservedBalances = existingBalances.filter((balance) => {
          const balanceId = toTokenId(balance)
          if (customTokenIds.has(balanceId)) {
            return true
          }
          if (portfolioBalanceIds.has(balanceId)) {
            return false
          }
          if (balance.address === NATIVE_CURRENCY) {
            return true
          }
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
          const accountBalances = value as BalanceInput[]
          const index = accountBalances.findIndex((balance) => {
            return balance.chainId === chainId && balance.address.toLowerCase() === key
          })
          if (index > -1) {
            accountBalances.splice(index, 1)
          }
        })
      })
    },

    upsertTokens: (
      tokens: Token[],
      options: { account?: string; custom?: boolean; curated?: boolean; source: TokenSource }
    ) => {
      set((draft) => {
        const main = mutableMain(draft)
        upsertTokenRecords(main, tokens, options)
      })
    },

    setTokenImage: (tokenId: string, image: TokenImage) => {
      set((draft) => {
        const token = record(record(mutableMain(draft).tokens).byId)[tokenId] as
          | MutableTokenRecord
          | undefined
        if (!token) {
          return
        }
        token.image = image
        token.updatedAt = Date.now()
      })
    },

    removeCustomTokens: (tokens: Token[]) => {
      const tokenIds = new Set(tokens.map(toTokenId))

      set((draft) => {
        const main = mutableMain(draft)
        const byId = record(record(main.tokens).byId)
        tokenIds.forEach((id) => {
          if (byId[id]) {
            ;(byId[id] as MutableTokenRecord).custom = false
          }
        })
      })
    },

    removeAccountTokens: (address: string, tokensToRemove: Set<string>) => {
      set((draft) => {
        const accountTokenIds = record(record(mutableMain(draft).tokens).accountTokenIds)
        const key = address.toLowerCase()
        accountTokenIds[key] = ((accountTokenIds[key] ?? []) as string[]).filter(
          (tokenId) => !tokensToRemove.has(tokenId)
        )
      })
    },

    resetSavedData: () => {
      set((draft) => {
        const main = mutableMain(draft)
        const catalog = record(main.tokens)
        const byId = record(catalog.byId)
        const tokenIds = new Set(
          Object.values(byId)
            .filter((token): token is MutableTokenRecord => {
              const candidate = token as MutableTokenRecord
              return !candidate.custom && !candidate.curated
            })
            .map((token) => toTokenId(token as Token))
        )

        tokenIds.forEach((id) => delete byId[id])
        catalog.accountTokenIds = {}
        main.activity = {}
        main.orders = {}
        main.assetRates = {}

        if (tokenIds.size > 0) {
          Object.entries(record(main.balances)).forEach(([address, value]) => {
            record(main.balances)[address] = (value as any[]).filter(
              (balance) => !tokenIds.has(toTokenId(balance))
            )
          })
        }
      })
    },

    navHome: (value: unknown) => {
      const command = record(value) as NavigationCrumb
      const homeCommand = toHomeCommand(command)
      set((draft) => {
        record(draft.tray).homeCommand = homeCommand
        windowState(draft, 'panel').nav = []
      })
    },

    clearHomeCommand: (id?: number) => {
      set((draft) => {
        const tray = record(draft.tray)
        const homeCommand = tray.homeCommand as { id?: number } | null | undefined
        if (!id || homeCommand?.id === id) {
          tray.homeCommand = null
        }
      })
    },

    navForward: (windowId: string, value: unknown) => {
      const crumb = record(value) as NavigationCrumb
      if (!windowId || !crumb) {
        log.warn('Invalid nav forward', windowId, crumb)
        return
      }

      set((draft) => {
        const window = windowState(draft, windowId)
        const nav = window.nav as NavigationCrumb[]
        if (JSON.stringify(nav[0]) !== JSON.stringify(crumb)) {
          nav.unshift(crumb)
        }
        window.show = true
      })
    },

    navUpdate: (windowId: string, value: unknown, navigate: boolean) => {
      const crumb = record(value) as NavigationCrumb
      if (!windowId || !crumb) {
        log.warn('Invalid nav forward', windowId, crumb)
        return
      }

      set((draft) => {
        const window = windowState(draft, windowId)
        const nav = window.nav as NavigationCrumb[]
        const updatedNavItem = {
          view: nav[0].view ?? crumb.view,
          data: Object.keys(crumb.data ?? {}).length === 0 ? {} : { ...nav[0].data, ...crumb.data }
        }

        if (JSON.stringify(nav[0]) !== JSON.stringify(updatedNavItem)) {
          if (navigate) {
            nav.unshift(updatedNavItem)
          } else {
            nav[0] = updatedNavItem
          }
        }
        if (navigate) {
          window.show = true
        }
      })
    },

    navClearReq: (handlerId: string, showRequestInbox = true) => {
      set((draft) => {
        const panel = windowState(draft, 'panel')
        panel.nav = (panel.nav as NavigationCrumb[]).filter((item) => {
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

    setSideTray: (frame: { id: string }) => {
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
export interface CanonicalStoreReader {
  getState(): CanonicalStore
  subscribe(listener: (state: CanonicalStore, previousState: CanonicalStore) => void): () => void
  subscribe<TSlice>(
    selector: (state: CanonicalStore) => TSlice,
    listener: (selectedState: TSlice, previousSelectedState: TSlice) => void,
    options?: {
      equalityFn?: (left: TSlice, right: TSlice) => boolean
      fireImmediately?: boolean
    }
  ): () => void
}
