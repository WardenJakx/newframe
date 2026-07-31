import log from 'electron-log'

import type { CanonicalStore } from './actions.js'
import {
  PERSISTENCE_VERSION,
  PersistedCanonicalStateSchema,
  type PersistedCanonicalState
} from './persist/schema.js'
import { CanonicalStatePersistenceError } from '../infrastructure/persistence/index.js'
import { listCuratedAssets } from '../../domain/asset/index.js'
import { DEFAULT_PROFILE_ID, DEFAULT_PROFILE_NAME, getProfileAccountIds } from '../../domain/state/main.js'

type UnknownRecord = Record<string, any>

const persistedChainColors = new Set([
  'accent1',
  'accent2',
  'accent3',
  'accent4',
  'accent5',
  'accent6',
  'accent7',
  'accent8'
])
const fixedAssetRateKeys = new Set(
  listCuratedAssets()
    .filter((asset) => asset.fixedUsdRate !== undefined)
    .flatMap((asset) => [asset.assetId, asset.commonAsset])
)

function persistedMute(value: unknown) {
  const mute = (value || {}) as UnknownRecord
  return {
    explorerWarning: Boolean(mute.explorerWarning),
    gasFeeWarning: Boolean(mute.gasFeeWarning),
    onboardingWindow: Boolean(mute.onboardingWindow),
    signerCompatibilityWarning: Boolean(mute.signerCompatibilityWarning)
  }
}

function persistedAccounts(accounts: UnknownRecord) {
  return Object.fromEntries(
    Object.entries(accounts).map(([id, value]) => {
      const account = value as UnknownRecord
      const {
        active: _legacySelection,
        balances: _balanceCache,
        requests: _requests,
        signer: _signer,
        signerStatus: _signerStatus,
        status: _status,
        ...durableAccount
      } = account

      return [
        id,
        {
          ...durableAccount,
          requests: {},
          signer: '',
          signerStatus: '',
          status: 'ok'
        }
      ]
    })
  )
}

function persistedNetworks(networks: UnknownRecord) {
  return {
    ethereum: Object.fromEntries(
      Object.entries(networks.ethereum || {}).map(([id, value]) => {
        const network = value as UnknownRecord
        const connection = network.connection || {}
        const cleanConnection = (candidate: UnknownRecord = {}) => ({
          ...candidate,
          connected: false,
          network: '',
          status: candidate.on ? 'loading' : 'off',
          type: ''
        })

        return [
          id,
          {
            ...network,
            connection: {
              primary: cleanConnection(connection.primary),
              secondary: cleanConnection(connection.secondary)
            }
          }
        ]
      })
    )
  }
}

function persistedNetworkMetadata(networksMeta: UnknownRecord) {
  return {
    ethereum: Object.fromEntries(
      Object.entries(networksMeta.ethereum || {}).map(([id, value]) => {
        const metadata = value as UnknownRecord
        const { blockHeight: _legacyBlockHeight, ...durableMetadata } = metadata
        const { usd: _legacyUsd, ...nativeCurrency } = metadata.nativeCurrency || {}
        const price = metadata.gas?.price || {}

        return [
          id,
          {
            ...durableMetadata,
            nativeCurrency,
            primaryColor: persistedChainColors.has(metadata.primaryColor) ? metadata.primaryColor : 'accent1',
            gas: {
              samples: [],
              price: {
                selected: price.selected || 'standard',
                levels: { custom: price.levels?.custom || '' }
              }
            }
          }
        ]
      })
    )
  }
}

function unknownRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : {}
}

function normalizeProfileState(main: UnknownRecord) {
  const sourceAccounts = unknownRecord(main.accounts)
  const sourceProfiles = unknownRecord(main.profiles)
  const profiles: UnknownRecord = {}
  const profileAliases: Record<string, string> = {}

  Object.entries(sourceProfiles).forEach(([key, candidate]) => {
    const profile = unknownRecord(candidate)
    const id = typeof profile.id === 'string' && profile.id ? profile.id : key
    if (!id || typeof profile.name !== 'string' || !profile.name) return
    if (!profiles[id]) profiles[id] = { id, name: profile.name }
    profileAliases[key] = id
    profileAliases[id] = id
  })

  if (Object.keys(profiles).length === 0) {
    profiles[DEFAULT_PROFILE_ID] = { id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME }
    profileAliases[DEFAULT_PROFILE_ID] = DEFAULT_PROFILE_ID
  }

  const profileOrder: string[] = []
  const seenProfiles = new Set<string>()
  ;[...(Array.isArray(main.profileOrder) ? main.profileOrder : []), ...Object.keys(profiles)].forEach(
    (candidate) => {
      const id = typeof candidate === 'string' ? profileAliases[candidate] || candidate : ''
      if (profiles[id] && !seenProfiles.has(id)) {
        seenProfiles.add(id)
        profileOrder.push(id)
      }
    }
  )

  const requestedAccount =
    (typeof main.currentAccount === 'string' && sourceAccounts[main.currentAccount]
      ? main.currentAccount
      : Object.keys(sourceAccounts).find((id) => unknownRecord(sourceAccounts[id]).active) ||
        (Array.isArray(main.accountOrder)
          ? main.accountOrder.find((id) => typeof id === 'string' && sourceAccounts[id])
          : undefined) ||
        Object.keys(sourceAccounts)[0]) || ''
  const requestedAccountProfile = profileAliases[unknownRecord(sourceAccounts[requestedAccount]).profileId]
  const requestedProfile =
    typeof main.currentProfile === 'string' ? profileAliases[main.currentProfile] || main.currentProfile : ''
  const currentProfile = profiles[requestedAccountProfile]
    ? requestedAccountProfile
    : profiles[requestedProfile]
      ? requestedProfile
      : profileOrder[0]

  const accounts = Object.fromEntries(
    Object.entries(sourceAccounts).map(([id, candidate]) => {
      const account = unknownRecord(candidate)
      const profileId = profileAliases[account.profileId] || account.profileId
      return [id, { ...account, profileId: profiles[profileId] ? profileId : currentProfile }]
    })
  )
  const accountOrder: string[] = []
  const seenAccounts = new Set<string>()
  ;[...(Array.isArray(main.accountOrder) ? main.accountOrder : []), ...Object.keys(accounts)].forEach(
    (id) => {
      if (typeof id === 'string' && accounts[id] && !seenAccounts.has(id)) {
        seenAccounts.add(id)
        accountOrder.push(id)
      }
    }
  )

  const normalized = { ...main, accounts, accountOrder, profiles, profileOrder, currentProfile }
  const currentAccount =
    requestedAccount && accounts[requestedAccount]?.profileId === currentProfile
      ? requestedAccount
      : getProfileAccountIds(normalized as any, currentProfile)[0] || ''

  return { ...normalized, currentAccount }
}

export function selectPersistedState(state: CanonicalStore): PersistedCanonicalState {
  const main = state.main as UnknownRecord
  const {
    appLock: _appLock,
    focusedFrame: _focusedFrame,
    frames: _frames,
    runtime: _runtime,
    signers: _signers,
    rates: _legacyRates,
    ...durableMain
  } = main

  return {
    main: {
      ...durableMain,
      assetRates: Object.fromEntries(
        Object.entries(main.assetRates || {}).filter(([key]) => !fixedAssetRateKeys.has(key))
      ),
      accounts: persistedAccounts(main.accounts || {}),
      mute: persistedMute(main.mute),
      networks: persistedNetworks(main.networks || {}),
      networksMeta: persistedNetworkMetadata(main.networksMeta || {})
    }
  } as unknown as PersistedCanonicalState
}

export function migratePersistedState(
  value: unknown,
  fromVersion = PERSISTENCE_VERSION
): PersistedCanonicalState {
  if (
    fromVersion !== 2 &&
    fromVersion !== 3 &&
    fromVersion !== 4 &&
    fromVersion !== 5 &&
    fromVersion !== PERSISTENCE_VERSION
  ) {
    log.error('Cannot migrate unsupported canonical state version', fromVersion)
    throw new CanonicalStatePersistenceError(
      'unsupported_version',
      'Canonical wallet state uses an unsupported persistence version.'
    )
  }

  const raw = (value || {}) as UnknownRecord
  const rawMain = (raw.main || {}) as UnknownRecord
  const legacyMain =
    fromVersion >= 5
      ? rawMain
      : {
          ...rawMain,
          assetRates: {}
        }
  const { rates: _legacyRates, ...mainWithoutLegacyRates } = legacyMain
  const candidate = {
    ...raw,
    main: normalizeProfileState({
      ...mainWithoutLegacyRates,
      ...(fromVersion === 2 ? { tokens: { byId: {}, accountTokenIds: {} } } : {}),
      networksMeta: persistedNetworkMetadata(mainWithoutLegacyRates.networksMeta || {})
    })
  }
  const parsed = PersistedCanonicalStateSchema.safeParse(candidate)
  if (parsed.success) return parsed.data

  log.error('Could not migrate invalid persisted canonical state', parsed.error.issues)
  throw new CanonicalStatePersistenceError('invalid_state', 'Canonical wallet state could not be migrated.')
}

function mergeRecord(current: unknown, persisted: unknown) {
  return { ...(current as UnknownRecord), ...(persisted as UnknownRecord) }
}

function httpsImageSource(value: unknown) {
  try {
    const url = new URL(String(value || '').trim())
    return url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

function matchingPersistedImage(value: unknown, sourceUrl: string) {
  const image = (value || {}) as UnknownRecord
  return sourceUrl && image.sourceUrl === sourceUrl ? value : undefined
}

function mergeNetworkMetadata(current: unknown, persisted: unknown) {
  const currentEthereum = (current as UnknownRecord)?.ethereum || {}
  const persistedEthereum = (persisted as UnknownRecord)?.ethereum || {}
  const ethereum = mergeRecord(currentEthereum, persistedEthereum)

  Object.entries(persistedEthereum).forEach(([id, value]) => {
    const currentMetadata = currentEthereum[id] || {}
    const persistedMetadata = value as UnknownRecord
    const currentGas = currentMetadata.gas || {}
    const persistedGas = persistedMetadata.gas || {}
    const currentPrice = currentGas.price || {}
    const persistedPrice = persistedGas.price || {}
    const icon = httpsImageSource(currentMetadata.icon) || httpsImageSource(persistedMetadata.icon)
    const currentNativeCurrency = currentMetadata.nativeCurrency || {}
    const persistedNativeCurrency = persistedMetadata.nativeCurrency || {}
    const nativeCurrencyIcon =
      httpsImageSource(currentNativeCurrency.icon) || httpsImageSource(persistedNativeCurrency.icon)

    ethereum[id] = {
      ...currentMetadata,
      ...persistedMetadata,
      icon,
      image: matchingPersistedImage(persistedMetadata.image, icon),
      nativeCurrency: {
        ...currentNativeCurrency,
        ...persistedNativeCurrency,
        icon: nativeCurrencyIcon,
        image: matchingPersistedImage(persistedNativeCurrency.image, nativeCurrencyIcon)
      },
      gas: {
        ...currentGas,
        ...persistedGas,
        price: {
          ...currentPrice,
          ...persistedPrice,
          levels: mergeRecord(currentPrice.levels, persistedPrice.levels)
        }
      }
    }
  })

  return { ethereum }
}

export function mergePersistedState(persistedValue: unknown, current: CanonicalStore): CanonicalStore {
  if (persistedValue === undefined || persistedValue === null) return current

  const persisted = migratePersistedState(persistedValue)
  const saved = persisted.main as UnknownRecord
  const currentMain = current.main as UnknownRecord
  const main: UnknownRecord = {
    ...currentMain,
    ...saved,
    accounts: mergeRecord(currentMain.accounts, saved.accounts),
    appLock: currentMain.appLock,
    accountsMeta: mergeRecord(currentMain.accountsMeta, saved.accountsMeta),
    latticeSettings: mergeRecord(currentMain.latticeSettings, saved.latticeSettings),
    ledger: mergeRecord(currentMain.ledger, saved.ledger),
    mute: mergeRecord(currentMain.mute, saved.mute),
    networks: {
      ethereum: mergeRecord(currentMain.networks?.ethereum, saved.networks?.ethereum)
    },
    networksMeta: mergeNetworkMetadata(currentMain.networksMeta, saved.networksMeta),
    focusedFrame: currentMain.focusedFrame,
    frames: currentMain.frames,
    runtime: currentMain.runtime,
    signers: currentMain.signers,
    shortcuts: mergeRecord(currentMain.shortcuts, saved.shortcuts),
    tokens: {
      byId: mergeRecord(currentMain.tokens?.byId, saved.tokens?.byId),
      accountTokenIds: mergeRecord(currentMain.tokens?.accountTokenIds, saved.tokens?.accountTokenIds)
    },
    trezor: mergeRecord(currentMain.trezor, saved.trezor),
    updater: mergeRecord(currentMain.updater, saved.updater)
  }

  main.accounts = persistedAccounts(main.accounts)
  main.currentAccount =
    main.accounts[main.currentAccount]?.profileId === main.currentProfile
      ? main.currentAccount
      : getProfileAccountIds(main as any, main.currentProfile)[0] || ''

  return {
    ...current,
    main
  } as CanonicalStore
}
