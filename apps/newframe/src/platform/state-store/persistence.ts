import log from 'electron-log'

import { DEFAULT_PROFILE_ID, DEFAULT_PROFILE_NAME } from '../../app/contracts/state/main.js'
import { listCuratedAssets } from '../../features/asset-data/domain/asset/index.js'
import { CanonicalStatePersistenceError } from '../persistence/index.js'
import type { CanonicalStore } from './actions.js'
import {
  PERSISTENCE_VERSION,
  PersistedCanonicalStateSchema,
  type PersistedCanonicalState
} from './persist/schema.js'

type UnknownRecord = Record<string, unknown>

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
  const mute = unknownRecord(value)
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
      const account = unknownRecord(value)
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
  const ethereum = unknownRecord(networks.ethereum)
  return {
    ethereum: Object.fromEntries(
      Object.entries(ethereum).map(([id, value]) => {
        const network = unknownRecord(value)
        const connection = unknownRecord(network.connection)
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
              primary: cleanConnection(unknownRecord(connection.primary)),
              secondary: cleanConnection(unknownRecord(connection.secondary))
            }
          }
        ]
      })
    )
  }
}

function persistedNetworkMetadata(networksMeta: UnknownRecord) {
  const ethereum = unknownRecord(networksMeta.ethereum)
  return {
    ethereum: Object.fromEntries(
      Object.entries(ethereum).map(([id, value]) => {
        const metadata = unknownRecord(value)
        const { blockHeight: _legacyBlockHeight, ...durableMetadata } = metadata
        const { usd: _legacyUsd, ...nativeCurrency } = unknownRecord(metadata.nativeCurrency)
        const price = unknownRecord(unknownRecord(metadata.gas).price)
        const levels = unknownRecord(price.levels)

        return [
          id,
          {
            ...durableMetadata,
            nativeCurrency,
            primaryColor:
              typeof metadata.primaryColor === 'string' && persistedChainColors.has(metadata.primaryColor)
                ? metadata.primaryColor
                : 'accent1',
            gas: {
              samples: [],
              price: {
                selected: price.selected ?? 'standard',
                levels: {
                  custom: typeof levels.custom === 'string' ? levels.custom : ''
                }
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
    if (!id || typeof profile.name !== 'string' || !profile.name) {
      return
    }
    profiles[id] ??= { id, name: profile.name }
    profileAliases[key] = id
    profileAliases[id] = id
  })

  if (Object.keys(profiles).length === 0) {
    profiles[DEFAULT_PROFILE_ID] = {
      id: DEFAULT_PROFILE_ID,
      name: DEFAULT_PROFILE_NAME
    }
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
      : (Object.keys(sourceAccounts).find((id) => unknownRecord(sourceAccounts[id]).active) ??
        (Array.isArray(main.accountOrder)
          ? main.accountOrder.find((id) => typeof id === 'string' && sourceAccounts[id])
          : undefined) ??
        Object.keys(sourceAccounts)[0])) ?? ''
  const requestedProfileId = unknownRecord(sourceAccounts[requestedAccount]).profileId
  const requestedAccountProfile =
    typeof requestedProfileId === 'string' ? profileAliases[requestedProfileId] : undefined
  const requestedProfile =
    typeof main.currentProfile === 'string' ? profileAliases[main.currentProfile] || main.currentProfile : ''
  let currentProfile = profileOrder[0] ?? DEFAULT_PROFILE_ID
  if (requestedAccountProfile && profiles[requestedAccountProfile]) {
    currentProfile = requestedAccountProfile
  } else if (profiles[requestedProfile]) {
    currentProfile = requestedProfile
  }

  const accounts = Object.fromEntries(
    Object.entries(sourceAccounts).map(([id, candidate]) => {
      const account = unknownRecord(candidate)
      const candidateProfileId = typeof account.profileId === 'string' ? account.profileId : ''
      const profileId = profileAliases[candidateProfileId] || candidateProfileId
      return [
        id,
        {
          ...account,
          profileId: profiles[profileId] ? profileId : currentProfile
        }
      ]
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

  const normalized = {
    ...main,
    accounts,
    accountOrder,
    profiles,
    profileOrder,
    currentProfile
  }
  const currentAccount =
    requestedAccount && unknownRecord(accounts[requestedAccount]).profileId === currentProfile
      ? requestedAccount
      : (accountOrder.find((id) => unknownRecord(accounts[id]).profileId === currentProfile) ?? '')

  return { ...normalized, currentAccount }
}

export function selectPersistedState(state: CanonicalStore): PersistedCanonicalState {
  const main = unknownRecord(state.main)
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
        Object.entries(unknownRecord(main.assetRates)).filter(([key]) => !fixedAssetRateKeys.has(key))
      ),
      accounts: persistedAccounts(unknownRecord(main.accounts)),
      mute: persistedMute(main.mute),
      networks: persistedNetworks(unknownRecord(main.networks)),
      networksMeta: persistedNetworkMetadata(unknownRecord(main.networksMeta))
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
    fromVersion !== 6 &&
    fromVersion !== PERSISTENCE_VERSION
  ) {
    log.error('Cannot migrate unsupported canonical state version', fromVersion)
    throw new CanonicalStatePersistenceError(
      'unsupported_version',
      'Canonical wallet state uses an unsupported persistence version.'
    )
  }

  const raw = unknownRecord(value)
  const rawMain = unknownRecord(raw.main)
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
      ...(fromVersion < PERSISTENCE_VERSION ? { orders: {} } : {}),
      networksMeta: persistedNetworkMetadata(unknownRecord(mainWithoutLegacyRates.networksMeta))
    })
  }
  const parsed = PersistedCanonicalStateSchema.safeParse(candidate)
  if (parsed.success) {
    return parsed.data
  }

  log.error('Could not migrate invalid persisted canonical state', parsed.error.issues)
  throw new CanonicalStatePersistenceError('invalid_state', 'Canonical wallet state could not be migrated.')
}

function mergeRecord(current: unknown, persisted: unknown) {
  return { ...unknownRecord(current), ...unknownRecord(persisted) }
}

function httpsImageSource(value: unknown) {
  try {
    const url = new URL(String(value ?? '').trim())
    return url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

function matchingPersistedImage(value: unknown, sourceUrl: string) {
  const image = unknownRecord(value)
  return sourceUrl && image.sourceUrl === sourceUrl ? value : undefined
}

function mergeNetworkMetadata(current: unknown, persisted: unknown) {
  const currentEthereum = unknownRecord(unknownRecord(current).ethereum)
  const persistedEthereum = unknownRecord(unknownRecord(persisted).ethereum)
  const ethereum = mergeRecord(currentEthereum, persistedEthereum)

  Object.entries(persistedEthereum).forEach(([id, value]) => {
    const currentMetadata = unknownRecord(currentEthereum[id])
    const persistedMetadata = unknownRecord(value)
    const currentGas = unknownRecord(currentMetadata.gas)
    const persistedGas = unknownRecord(persistedMetadata.gas)
    const currentPrice = unknownRecord(currentGas.price)
    const persistedPrice = unknownRecord(persistedGas.price)
    const icon = httpsImageSource(currentMetadata.icon) || httpsImageSource(persistedMetadata.icon)
    const currentNativeCurrency = unknownRecord(currentMetadata.nativeCurrency)
    const persistedNativeCurrency = unknownRecord(persistedMetadata.nativeCurrency)
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
  if (persistedValue === undefined || persistedValue === null) {
    return current
  }

  const persisted = migratePersistedState(persistedValue)
  const saved = unknownRecord(persisted.main)
  const currentMain = unknownRecord(current.main)
  const main: UnknownRecord = {
    ...currentMain,
    ...saved,
    airgap: saved.airgap ?? {},
    accounts: mergeRecord(currentMain.accounts, saved.accounts),
    appLock: currentMain.appLock,
    accountsMeta: mergeRecord(currentMain.accountsMeta, saved.accountsMeta),
    latticeSettings: mergeRecord(currentMain.latticeSettings, saved.latticeSettings),
    ledger: mergeRecord(currentMain.ledger, saved.ledger),
    mute: mergeRecord(currentMain.mute, saved.mute),
    networks: {
      ethereum: mergeRecord(
        unknownRecord(currentMain.networks).ethereum,
        unknownRecord(saved.networks).ethereum
      )
    },
    networksMeta: mergeNetworkMetadata(currentMain.networksMeta, saved.networksMeta),
    focusedFrame: currentMain.focusedFrame,
    frames: currentMain.frames,
    runtime: currentMain.runtime,
    signers: currentMain.signers,
    shortcuts: mergeRecord(currentMain.shortcuts, saved.shortcuts),
    tokens: {
      byId: mergeRecord(unknownRecord(currentMain.tokens).byId, unknownRecord(saved.tokens).byId),
      accountTokenIds: mergeRecord(
        unknownRecord(currentMain.tokens).accountTokenIds,
        unknownRecord(saved.tokens).accountTokenIds
      )
    },
    trezor: mergeRecord(currentMain.trezor, saved.trezor),
    updater: mergeRecord(currentMain.updater, saved.updater)
  }

  main.accounts = persistedAccounts(unknownRecord(main.accounts))
  const accounts = unknownRecord(main.accounts)
  const currentAccount = typeof main.currentAccount === 'string' ? main.currentAccount : ''
  const currentProfile = typeof main.currentProfile === 'string' ? main.currentProfile : ''
  main.currentAccount =
    unknownRecord(accounts[currentAccount]).profileId === currentProfile
      ? currentAccount
      : ((Array.isArray(main.accountOrder)
          ? main.accountOrder.find(
              (id) => typeof id === 'string' && unknownRecord(accounts[id]).profileId === currentProfile
            )
          : undefined) ?? '')

  return {
    ...current,
    main
  } as CanonicalStore
}
