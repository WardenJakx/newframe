import log from 'electron-log'
import type { Draft } from 'immer'
import { v5 as uuidv5 } from 'uuid'

import {
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILE_NAME,
  getProfileAccountIds
} from '../../app/contracts/state/main.js'
import { accountNS, isDefaultAccountName } from '../../features/accounts/domain/index.js'
import type { Account } from '../../features/accounts/domain/state/account.js'
import type { CanonicalAccountRequest } from '../../features/requests/contract/requests.js'
import type { Shortcut } from '../../features/settings/domain/state/shortcuts.js'
import { NATIVE_CURRENCY } from '../../features/tokens/domain/constants.js'
import { toTokenId } from '../../features/tokens/domain/index.js'
import type { Token, TokenImage, TokenSource } from '../../features/tokens/domain/state/token.js'
import { AirGapPublicAccountSchema, type AirGapPublicAccount } from '../signing/domain/airgap.js'
import type { Derivation } from '../signing/signers/Signer/derive.js'
import type { SignerSummary } from '../signing/signers/Signer/index.js'
import { createOperationActions } from './actions.operation.js'
import { createPanelActions, type CanonicalGet, type CanonicalSet } from './actions.panel.js'
import type {
  ActivityRecord,
  Balance,
  Chain,
  ChainMetadata,
  GasFees,
  NativeCurrency,
  Origin,
  Permission,
  CanonicalState,
  NavigationEntry
} from './state/index.js'

type MutableRecord = Record<string, unknown>
type AccountPatch = Partial<Omit<Account, 'id' | 'address' | 'profileId' | 'requests'>> & {
  name?: string
}
type AccountUpsert = Omit<Account, 'profileId' | 'requests'> & {
  id: string
  name: string
  address: string
  lastSignerType: string
  status: string
  signer: string
  created: string
  profileId?: string
  requests?: Record<string, CanonicalAccountRequest>
}
type MutableMain = Draft<CanonicalState['main']> & MutableRecord
type MutableCanonicalState = Draft<CanonicalState> & MutableRecord
type NetworkSettings = {
  id: string | number
  type: string
  name: string
  explorer?: string
  symbol?: string
  primaryRpc?: string
  secondaryRpc?: string
  icon?: string
  primaryColor?: string
  nativeCurrencyIcon?: string
  nativeCurrencyName?: string
  [key: string]: unknown
}
type ActivityUpdate = Partial<ActivityRecord> & Record<string, unknown>
type OrderRecord = CanonicalState['main']['orders'][string]
type OrderUpdate = Partial<OrderRecord> & Record<string, unknown>
type BalanceInput = Balance & Partial<Token>
type DerivationInput = Derivation | `${Derivation}`
type ShortcutInput = Partial<Omit<Shortcut, 'shortcutKey'> & { shortcutKey: string }>

const supportedNetworkTypes = ['ethereum']
const completedActivityStatuses = new Set(['succeeded', 'reverted'])

const mutable = (state: Draft<CanonicalState>) => state as MutableCanonicalState
const mutableMain = (state: Draft<CanonicalState>) => state.main as MutableMain
function record<T extends object>(value: T): T & MutableRecord
function record(value: unknown): MutableRecord
function record(value: unknown) {
  return value as MutableRecord
}
const windowState = (state: Draft<CanonicalState>, windowId: string) =>
  record(record(state.windows)[windowId])
const chainState = (main: MutableMain, type: string, id: number) =>
  (main.networks as unknown as Record<string, Record<number, Draft<Chain>>>)[type][id]
const chainMetadataState = (main: MutableMain, type: string, id: number) =>
  (main.networksMeta as unknown as Record<string, Record<number, Draft<ChainMetadata>>>)[type][id]

function ensureProfileState(main: MutableMain) {
  const profiles = record(main.profiles || {})
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

  const accounts = record(main.accounts || {})
  Object.values(accounts).forEach((candidate) => {
    const account = record(candidate)
    if (account.id && !profiles[account.profileId]) {
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

function switchChainForOrigins(
  origins: Record<string, Draft<Origin>>,
  oldChainId: number,
  newChainId: number
) {
  Object.entries(origins).forEach(([originId, origin]) => {
    if (oldChainId === origin.chain.id) {
      origins[originId].chain = { id: newChainId, type: 'ethereum' }
    }
  })
}

function validateNetworkSettings(network: NetworkSettings) {
  const networkId = parseInt(String(network.id))
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

function tokenFromValue(value: unknown): Token | undefined {
  const token = record(value)
  if (
    token.address === NATIVE_CURRENCY ||
    typeof token.address !== 'string' ||
    !Number.isInteger(Number(token.chainId)) ||
    typeof token.name !== 'string' ||
    typeof token.symbol !== 'string' ||
    !Number.isInteger(Number(token.decimals))
  ) {
    return undefined
  }

  return {
    address: token.address.toLowerCase(),
    chainId: Number(token.chainId),
    decimals: Number(token.decimals),
    name: token.name,
    symbol: token.symbol,
    ...(typeof token.logoURI === 'string' ? { logoURI: token.logoURI } : {}),
    ...(token.image ? { image: token.image as TokenImage } : {})
  }
}

function balanceFromValue(value: Balance) {
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
  const catalog = record(main.tokens)
  const byId = record(catalog.byId)
  const account = options.account?.toLowerCase()
  const accountTokenIds = record(catalog.accountTokenIds)
  const accountIds = new Set<string>((account && accountTokenIds[account]) ?? [])

  tokens.forEach((input) => {
    const token = tokenFromValue(input)
    if (!token) {
      return
    }
    const id = toTokenId(token)
    const existing = record(byId[id] ?? {})
    const preserveCustomMetadata = existing.custom && !options.custom
    const sourceSet = new Set<TokenSource>([...(existing.sources ?? []), options.source])
    const preferred = preserveCustomMetadata ? existing : token

    byId[id] = {
      ...existing,
      address: token.address,
      chainId: token.chainId,
      decimals: preferred.decimals ?? existing.decimals,
      name: preferred.name ?? existing.name ?? token.symbol,
      symbol: preferred.symbol ?? existing.symbol,
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

function stripRequestCapabilities(request: CanonicalAccountRequest) {
  const actions = (request.recognizedActions ?? []) as MutableRecord[]
  actions.forEach((action) => delete action.update)
}

export function createCanonicalActions(set: CanonicalSet, get: CanonicalGet) {
  let homeCommandId = 0

  const toHomeCommand = (command: { view?: string; data?: Record<string, unknown> }) => ({
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
        chainState(main, type, chainId).on = active

        if (!active) {
          switchChainForOrigins(main.origins, chainId, 1)
        }
      })
    },

    selectPrimary: (netType: string, netId: number, value: string) => {
      set((draft) => {
        chainState(mutableMain(draft), netType, netId).connection.primary.current = value as
          | 'local'
          | 'custom'
          | 'chainlist'
      })
    },

    setPrimaryCustom: (netType: string, netId: number, target: string) => {
      if (!netType || !netId) {
        return
      }
      set((draft) => {
        chainState(mutableMain(draft), netType, netId).connection.primary.custom = target
      })
    },

    setSecondaryCustom: (netType: string, netId: number, target: string) => {
      if (!netType || !netId) {
        return
      }
      set((draft) => {
        chainState(mutableMain(draft), netType, netId).connection.secondary.custom = target
      })
    },

    toggleConnection: (netType: string, netId: number, node: 'primary' | 'secondary', on?: boolean) => {
      set((draft) => {
        const connection = chainState(mutableMain(draft), netType, netId).connection
        const target = record(connection[node])
        target.on = on ?? !target.on
      })
    },

    setPrimary: (netType: string, netId: number, status: Partial<Chain['connection']['primary']>) => {
      set((draft) => {
        const connection = chainState(mutableMain(draft), netType, netId).connection
        connection.primary = { ...record(connection.primary), ...status }
      })
    },

    setSecondary: (netType: string, netId: number, status: Partial<Chain['connection']['secondary']>) => {
      set((draft) => {
        const connection = chainState(mutableMain(draft), netType, netId).connection
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

    setPermission: (address: string, permission: Permission) => {
      set((draft) => {
        const permissions = record(mutableMain(draft).permissions)
        const accountPermissions = record(permissions[address] ?? {})
        permissions[address] = accountPermissions

        if (permission.provider) {
          accountPermissions[permission.handlerId] = permission
        } else {
          delete accountPermissions[permission.handlerId]
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

    upsertSubmittedActivity: (activity: ActivityUpdate & Pick<ActivityRecord, 'id'>) => {
      const id = activity?.id
      if (!id) {
        return
      }
      const now = Date.now()

      set((draft) => {
        const activities = record(mutableMain(draft).activity)
        const existingActivity = record(activities[id] ?? {})
        const submittedActivity = {
          ...existingActivity,
          ...activity,
          id,
          status: 'submitted',
          submittedAt: activity.submittedAt ?? existingActivity.submittedAt ?? now,
          updatedAt: activity.updatedAt ?? now,
          confirmations: activity.confirmations ?? existingActivity.confirmations ?? 0
        }

        if (activity.completedAt === undefined) {
          delete submittedActivity.completedAt
        }
        activities[id] = submittedActivity as ActivityRecord
      })
    },

    updateActivity: (id: string, update: ActivityUpdate = {}) => {
      if (!id) {
        return
      }
      const now = Date.now()

      set((draft) => {
        const activities = record(mutableMain(draft).activity)
        const activity = record(activities[id] ?? { id })
        activities[id] = {
          ...activity,
          ...update,
          id,
          status: update.status ?? activity.status ?? 'confirming',
          updatedAt: update.updatedAt ?? now
        }
      })
    },

    finalizeActivity: (
      id: string,
      status: Extract<ActivityRecord['status'], 'succeeded' | 'reverted'>,
      update: ActivityUpdate = {}
    ) => {
      if (!id) {
        return
      }
      if (!completedActivityStatuses.has(status)) {
        log.warn(`Invalid finalized activity status: ${status}`)
        return
      }

      const completedAt = update.completedAt ?? Date.now()

      set((draft) => {
        const activities = record(mutableMain(draft).activity)
        const activity = record(activities[id] ?? { id })
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
      if (!id) {
        return
      }
      set((draft) => {
        delete record(mutableMain(draft).activity)[id]
      })
    },

    upsertOrder: (order: OrderUpdate & Pick<OrderRecord, 'orderId'>) => {
      const orderId = order?.orderId
      if (!orderId) {
        return
      }
      const now = Date.now()

      set((draft) => {
        const orders = record(mutableMain(draft).orders)
        const existingOrder = record(orders[orderId] ?? {})
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

    updateOrder: (orderId: string, update: OrderUpdate = {}) => {
      if (!orderId) {
        return
      }
      const now = Date.now()

      set((draft) => {
        const orders = record(mutableMain(draft).orders)
        const existingOrder = orders[orderId]
        if (!existingOrder) {
          return
        }

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

    setAccount: (account: { id?: string }) => {
      set((draft) => {
        const state = mutable(draft)
        const main = mutableMain(draft)
        ensureProfileState(main)
        const selectedAccount = account.id ? main.accounts[account.id] : undefined
        if (!selectedAccount || !main.profiles[selectedAccount.profileId]) {
          return
        }
        main.currentProfile = selectedAccount.profileId
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
        const account = record(accounts[id] ?? {})
        const accountUpdate = record({ ...updatedAccount })
        const profileId = account.profileId ?? accountUpdate.profileId ?? main.currentProfile
        if (!record(main.profiles)[profileId]) {
          return
        }
        Object.values(record(accountUpdate.requests ?? {})).forEach(stripRequestCapabilities)
        accounts[id] = {
          ...accountUpdate,
          profileId,
          requests: accountUpdate.requests ?? {},
          balances: account.balances ?? {}
        }

        main.accountOrder = [...new Set(main.accountOrder.filter((accountId) => accounts[accountId]))]
        if (!main.accountOrder.includes(id)) {
          main.accountOrder.push(id)
        }

        if (name && !isDefaultAccountName({ ...updatedAccount, name })) {
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
        const account = record(record(main.accounts)[id])
        if (!account.id) {
          return
        }
        const {
          id: _id,
          address: _address,
          profileId: _profileId,
          requests: _requests,
          ...safeUpdate
        } = update
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
      if (!accountId || !requestId || !update) {
        return
      }

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
          delete signers[signer.id].airgapRequest
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
    updateLattice: (deviceId: string, update: Partial<CanonicalState['main']['lattice'][string]>) => {
      if (!deviceId || !update) {
        return
      }
      set((draft) => {
        const lattice = record(mutableMain(draft).lattice)
        lattice[deviceId] = { ...record(lattice[deviceId] ?? {}), ...update }
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

    setLatticeDerivation: (value: DerivationInput) => {
      set((draft) => {
        mutableMain(draft).latticeSettings.derivation = value as Derivation
      })
    },

    setLedgerDerivation: (value: DerivationInput) => {
      set((draft) => {
        mutableMain(draft).ledger.derivation = value as Derivation
      })
    },

    setTrezorDerivation: (value: DerivationInput) => {
      set((draft) => {
        mutableMain(draft).trezor.derivation = value as Derivation
      })
    },

    setLiveAccountLimit: (value: number) => {
      set((draft) => {
        mutableMain(draft).ledger.liveAccountLimit = value
      })
    },

    setMenubarGasPrice: (value: boolean) => {
      set((draft) => {
        mutableMain(draft).menubarGasPrice = value
      })
    },

    setBiometricUnlock: (value: unknown) => {
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

    setShortcut: (name: string, shortcut: ShortcutInput) => {
      set((draft) => {
        const shortcuts = record(mutableMain(draft).shortcuts)
        const existingShortcut = (shortcuts[name] ?? {}) as Partial<Shortcut>
        shortcuts[name] = {
          modifierKeys: shortcut.modifierKeys ?? existingShortcut.modifierKeys,
          shortcutKey: (shortcut.shortcutKey ?? existingShortcut.shortcutKey) as Shortcut['shortcutKey'],
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

    setGasFees: (netType: string, netId: number, fees: GasFees | null) => {
      set((draft) => {
        chainMetadataState(mutableMain(draft), netType, netId).gas.price.fees = fees
      })
    },

    setGasPrices: (
      netType: string,
      netId: number,
      prices: CanonicalState['main']['networksMeta']['ethereum'][number]['gas']['price']['levels']
    ) => {
      set((draft) => {
        chainMetadataState(mutableMain(draft), netType, netId).gas.price.levels = prices
      })
    },

    setGasDefault: (netType: string, netId: number, level: string, price?: string) => {
      set((draft) => {
        const gasPrice = chainMetadataState(mutableMain(draft), netType, netId).gas.price
        gasPrice.selected = level as keyof typeof gasPrice.levels

        if (level === 'custom') {
          gasPrice.levels.custom = price
        } else {
          record(gasPrice).lastLevel = level
        }
      })
    },

    setNativeCurrencyData: (netType: string, netId: number, currency: Partial<NativeCurrency>) => {
      set((draft) => {
        const meta = chainMetadataState(mutableMain(draft), netType, netId)
        meta.nativeCurrency = { ...meta.nativeCurrency, ...currency }
      })
    },

    addNetwork: (net: NetworkSettings) => {
      try {
        const network = { ...net, id: validateNetworkSettings(net) }
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
          const networks = main.networks as unknown as Record<string, Record<number, Draft<Chain>>>
          const networksMeta = main.networksMeta as unknown as Record<
            string,
            Record<number, Draft<ChainMetadata>>
          >
          networks[network.type] ??= {}
          networksMeta[network.type] ??= {}
          if (networks[network.type][network.id]) {
            return
          }

          networks[network.type][network.id] = { ...defaultNetwork, ...network } as Draft<Chain>
          networksMeta[network.type][network.id] = defaultMeta as unknown as Draft<ChainMetadata>
        })
      } catch (error) {
        log.error(error)
      }
    },

    removeNetwork: (net: Pick<NetworkSettings, 'id' | 'type'>) => {
      try {
        const networkId = parseInt(String(net.id))
        if (!Number.isInteger(networkId)) {
          throw new Error('Invalid chain id')
        }
        if (net.type === 'ethereum' && networkId === 1) {
          throw new Error('Cannot remove mainnet')
        }

        set((draft) => {
          const main = mutableMain(draft)
          const networks = record(main.networks)
          const typeNetworks = record(networks[net.type])
          if (Object.keys(typeNetworks).length <= 1) {
            return
          }

          switchChainForOrigins(main.origins, networkId, 1)
          delete typeNetworks[networkId]
          delete record(record(main.networksMeta)[net.type])[networkId]
        })
      } catch (error) {
        log.error(error)
      }
    },

    initOrigin: (originId: string, origin: Omit<Origin, 'session'>) => {
      const now = Date.now()
      set((draft) => {
        record(mutableMain(draft).origins)[originId] = {
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
        const origin = record(record(mutableMain(draft).origins)[originId])
        const session = record(origin.session)
        const isNewSession = typeof session.endedAt === 'number' && session.startedAt < session.endedAt
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
        const chainMeta = chainMetadataState(mutableMain(draft), netType, chainId)
        if (chainMeta) {
          chainMeta.icon = sourceUrl
          chainMeta.image = image
        } else {
          log.error(`Action Error: setNetworkImage chainId: ${chainId} not found in chainsMeta`)
        }
      })
    },

    setNativeCurrencyImage: (netType: string, chainId: number, image: TokenImage) => {
      set((draft) => {
        const chainMeta = chainMetadataState(mutableMain(draft), netType, chainId)
        if (chainMeta) {
          chainMeta.nativeCurrency.image = image
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

    setBalance: (address: string, balance: BalanceInput) => {
      set((draft) => {
        const main = mutableMain(draft)
        const token = tokenFromValue(balance)
        if (token) {
          upsertTokenRecords(main, [token], { account: address, source: 'onchain' })
        }
        const normalizedBalance = balanceFromValue(balance)
        const balances = record(main.balances)
        const accountBalances = (balances[address] ?? []).map(balanceFromValue)
        balances[address] = [
          ...accountBalances.filter(
            (item) => item.address !== normalizedBalance.address || item.chainId !== normalizedBalance.chainId
          ),
          normalizedBalance
        ]
      })
    },

    setBalances: (address: string, newBalances: BalanceInput[]) => {
      set((draft) => {
        const main = mutableMain(draft)
        upsertTokenRecords(main, newBalances.map(tokenFromValue).filter(Boolean) as Token[], {
          account: address,
          source: 'onchain'
        })
        const normalizedBalances = newBalances.map(balanceFromValue)
        const balances = record(main.balances)
        const accountBalances = (balances[address] ?? []).map(balanceFromValue)
        const existingBalances = accountBalances.filter((balance) => {
          return normalizedBalances.every(
            (newBalance) => newBalance.chainId !== balance.chainId || newBalance.address !== balance.address
          )
        })

        balances[address] = [...existingBalances, ...normalizedBalances]
      })
    },

    setPortfolioBalances: (address: string, newBalances: BalanceInput[]) => {
      set((draft) => {
        const main = mutableMain(draft)
        upsertTokenRecords(main, newBalances.map(tokenFromValue).filter(Boolean) as Token[], {
          account: address,
          source: 'portfolio'
        })
        const customTokenIds = new Set(
          Object.values(record(main.tokens).byId ?? {})
            .filter((token) => token.custom)
            .map((token) => toTokenId(token))
        )
        const portfolioBalances = newBalances
          .filter((balance) => !customTokenIds.has(toTokenId(balance)))
          .map(balanceFromValue)
        const portfolioChains = new Set(portfolioBalances.map((balance) => balance.chainId))
        const portfolioBalanceIds = new Set(portfolioBalances.map(toTokenId))
        const balances = record(main.balances)
        const existingBalances = (balances[address] ?? []).map(balanceFromValue)
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
          const accountBalances = value as Balance[]
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
        const token = record(record(mutableMain(draft).tokens).byId)[tokenId]
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
            byId[id].custom = false
          }
        })
      })
    },

    removeAccountTokens: (address: string, tokensToRemove: Set<string>) => {
      set((draft) => {
        const accountTokenIds = record(record(mutableMain(draft).tokens).accountTokenIds)
        const key = address.toLowerCase()
        accountTokenIds[key] = (accountTokenIds[key] ?? []).filter((tokenId) => !tokensToRemove.has(tokenId))
      })
    },

    resetSavedData: () => {
      set((draft) => {
        const main = mutableMain(draft)
        const catalog = record(main.tokens)
        const byId = record(catalog.byId)
        const tokenIds = new Set(
          Object.values(byId)
            .filter((token) => !token.custom && !token.curated)
            .map((token) => toTokenId(token))
        )

        tokenIds.forEach((id) => delete byId[id])
        catalog.accountTokenIds = {}
        main.activity = {}
        main.orders = {}
        main.assetRates = {}

        if (tokenIds.size > 0) {
          Object.entries(record(main.balances)).forEach(([address, value]) => {
            record(main.balances)[address] = (value as Balance[]).filter(
              (balance) => !tokenIds.has(toTokenId(balance))
            )
          })
        }
      })
    },

    navHome: (command: { view?: string; data?: Record<string, unknown> }) => {
      const homeCommand = toHomeCommand(command)
      set((draft) => {
        record(draft.tray).homeCommand = homeCommand
        windowState(draft, 'panel').nav = []
      })
    },

    clearHomeCommand: (id?: number) => {
      set((draft) => {
        const tray = record(draft.tray)
        if (!id || tray.homeCommand?.id === id) {
          tray.homeCommand = null
        }
      })
    },

    navForward: (windowId: string, value: unknown) => {
      const crumb = value as NavigationEntry
      if (!windowId || !crumb) {
        log.warn('Invalid nav forward', windowId, crumb)
        return
      }

      set((draft) => {
        const window = windowState(draft, windowId)
        const nav = window.nav as NavigationEntry[]
        if (JSON.stringify(nav[0]) !== JSON.stringify(crumb)) {
          nav.unshift(crumb)
        }
        window.show = true
      })
    },

    navUpdate: (windowId: string, crumb: NavigationEntry, navigate: boolean) => {
      if (!windowId || !crumb) {
        log.warn('Invalid nav forward', windowId, crumb)
        return
      }

      set((draft) => {
        const window = windowState(draft, windowId)
        const nav = window.nav as NavigationEntry[]
        const updatedNavItem = {
          view: nav[0].view ?? crumb.view,
          data: Object.keys(crumb.data).length === 0 ? {} : { ...nav[0].data, ...crumb.data }
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
        panel.nav = (panel.nav as NavigationEntry[]).filter((item) => {
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
        const nav = windowState(draft, windowId).nav as NavigationEntry[]
        nav.splice(0, Math.min(numSteps, nav.length))
      })
    },

    setSideTray: (frame: Frame) => {
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
