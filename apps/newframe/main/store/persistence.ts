import log from 'electron-log'

import type { CanonicalStore } from './actions'
import {
  PERSISTENCE_VERSION,
  PersistedCanonicalStateSchema,
  type PersistedCanonicalState
} from './persist/schema'
import { CanonicalStatePersistenceError } from './persist/validatedConfStorage'

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
        const price = metadata.gas?.price || {}

        return [
          id,
          {
            ...durableMetadata,
            primaryColor: persistedChainColors.has(metadata.primaryColor) ? metadata.primaryColor : 'accent1',
            gas: {
              samples: [],
              price: {
                selected: price.selected || 'standard',
                levels: { custom: price.levels?.custom || '' }
              }
            },
            nativeCurrency: {
              ...metadata.nativeCurrency,
              usd: { price: 0, change24hr: 0 }
            }
          }
        ]
      })
    )
  }
}

export function selectPersistedState(state: CanonicalStore): PersistedCanonicalState {
  const main = state.main as UnknownRecord
  const {
    appLock: _appLock,
    balances: _balances,
    focusedFrame: _focusedFrame,
    frames: _frames,
    rates: _rates,
    runtime: _runtime,
    signers: _signers,
    ...durableMain
  } = main

  return {
    main: {
      ...durableMain,
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
  if (fromVersion !== 2 && fromVersion !== PERSISTENCE_VERSION) {
    log.error('Cannot migrate unsupported canonical state version', fromVersion)
    throw new CanonicalStatePersistenceError(
      'unsupported_version',
      'Canonical wallet state uses an unsupported persistence version.'
    )
  }

  const candidate =
    fromVersion === 2
      ? {
          ...((value || {}) as UnknownRecord),
          main: {
            ...(((value as UnknownRecord | undefined)?.main || {}) as UnknownRecord),
            tokens: { byId: {}, accountTokenIds: {} }
          }
        }
      : value
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

function selectedAccount(main: UnknownRecord) {
  const accounts = main.accounts || {}
  if (main.currentAccount && accounts[main.currentAccount]) return main.currentAccount as string

  const legacyActive = Object.keys(accounts).find((id) => accounts[id]?.active)
  if (legacyActive) return legacyActive

  return (main.accountOrder || []).find((id: string) => accounts[id]) || Object.keys(accounts)[0] || ''
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
    balances: currentMain.balances,
    focusedFrame: currentMain.focusedFrame,
    frames: currentMain.frames,
    rates: currentMain.rates,
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

  main.currentAccount = selectedAccount(main)
  main.accounts = persistedAccounts(main.accounts)

  return {
    ...current,
    main
  } as CanonicalStore
}
